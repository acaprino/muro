"""EGM (Elephant-Goldfish Model): its seven skills as five on-demand capabilities.

Release v0.1.1 is pinned below. These tests read local package metadata only;
the separately recorded source check/build verifies the actual pinned remote.
Runtime selections are explicit host-AI response fixtures, never a classifier
and never evidence that a model understands a request or its negation.
"""
import json
import shutil
from pathlib import Path

import pytest

from muro import parse_capabilities, parse_router
from muro.delivery import validate_delivery
from muro.entries import validate_entries
from muro.runtime import Coordinator
from routing_helpers import decision


ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "examples" / "marionette"
SOURCE = "egm"
COMMIT = "dea7761de06ce5b51c177ebb9bba0469f24af5a4"
RELEASE = "v0.1.1"
SKILLS = ("egm-brainstorm", "egm-draft", "egm-review", "egm-review-loop", "egm-resolve", "egm-bootstrap",
          "egm-drift-report")
GUIDES = ("docs/claude.md", "docs/codex.md", "docs/harnesses.md")
EVIDENCE = ["README.md", "docs/index.md", "docs/getting_started.md", "docs/faq.md", "docs/privacy.md",
            "resources/README.md", ".claude-plugin/plugin.json", ".claude-plugin/agents/**"]
PROCEDURES = {
    "concept-brief": (["docs.idea-brainstorm"], ["concepts_brief"], ["egm-brainstorm"]),
    "design-doc": (["docs.design-draft"], ["design_document"], ["egm-draft"]),
    "fresh-review": (["docs.staged-review", "docs.review-loop", "docs.finding-resolution"],
                     ["document_review_reports", "document_review_outcome"],
                     ["egm-review", "egm-review-loop", "egm-resolve"]),
    "codebase-contracts": (["docs.codebase-contracts"], ["contract_files"], ["egm-bootstrap"]),
    "design-drift": (["docs.design-drift"], ["drift_report"], ["egm-drift-report"]),
}
RESUMABLE = {"concept-brief", "design-doc", "fresh-review", "codebase-contracts"}


def read_json(name):
    return json.loads((PACKAGE / name).read_text(encoding="utf-8"))


def catalog():
    return {cap.id: cap for cap in parse_capabilities(PACKAGE / "capabilities")}


def before_sources(cap):
    return cap.body.split("## Sources", 1)[0]


@pytest.fixture
def coordinator(tmp_path):
    package = tmp_path / "package"
    package.mkdir()
    shutil.copytree(PACKAGE / "capabilities", package / "capabilities")
    shutil.copytree(ROOT / "prompts", package / "prompts")
    for name in ("ROUTER.md", "sources.json", "delivery.json"):
        shutil.copy2(PACKAGE / name, package / name)
    return Coordinator(package, tmp_path / "consumer")


def test_manifest_pins_the_release_and_separates_packaged_files_from_evidence():
    manifest = read_json("sources.json")
    src = next(source for source in manifest["sources"] if source["id"] == SOURCE)
    assert src["repo_url"] == "https://github.com/google/elephant-goldfish-model"
    assert (src["pin"], src["release"], src["commit"]) == ("release", RELEASE, COMMIT)
    assert src["license"] == "Apache-2.0" and src["copyright"].startswith("Copyright 2026 Google LLC")
    selected = set(src["selected_paths"])
    assert {f"skills/{name}/SKILL.md" for name in SKILLS} <= selected
    assert {"agents/**", "resources/**", *GUIDES, "skills/egm-draft/references/design_doc.md",
            "skills/egm-bootstrap/references/templates.md",
            "skills/egm-bootstrap/references/worker-return.schema.json"} <= selected
    # Read as evidence, never packaged: the README, the other docs and the Claude adapters.
    assert src["intake_only_paths"] == EVIDENCE
    assert {"tests/**", "site/**", "scripts/**", "adapters/**", ".codex-plugin/**", ".cursor-plugin/**",
            "skills/*/agents/**"} <= set(src["excluded_paths"])
    assert src["runtime_deps"] == [] and src["intake"]["goal"].strip()
    assert {SOURCE, *SKILLS} <= set(manifest["plugin"]["replaces"])


def test_procedures_match_the_router_and_keep_source_provenance():
    caps = catalog()
    rows = {row.id: row for row in parse_router(PACKAGE / "ROUTER.md")}
    for name, (intents, outputs, skills) in PROCEDURES.items():
        cap, row = caps[name], rows[name]
        assert cap.role == row.role
        assert [intent["id"] for intent in cap.intents] == intents == row.intents_list()
        assert cap.outputs == outputs == row.outputs_list()
        assert cap.after == row.after_list() == []
        assert cap.when == "—" and cap.needs == [] and cap.hooks == [] and cap.conflicts == []
        assert all(intent["description"].strip() and intent["excludes"] for intent in cap.intents)
        sources = cap.body.split("## Sources", 1)[1]
        assert SOURCE in sources and COMMIT in sources and RELEASE in sources and "Apache-2.0" in sources
        assert all(intent in sources for intent in intents)
        assert "Changes for coexistence (ADR-0017)" in sources
        assert "## Output handoff" in cap.body and "<state_dir>/map.md" in cap.body
        for check in cap.checks:
            assert f"**{check}**" in cap.body
        for skill in skills:
            assert f"skills/{skill}/SKILL.md" in sources, skill
            # A packaged SKILL.md travels as SKILL.source.md and is named that way before the Sources section.
            assert f"skills/{skill}/SKILL.source.md" in before_sources(cap)
            assert f"skills/{skill}/SKILL.md" not in before_sources(cap)
        assert f"<package_root>/scripts/{SOURCE}/" in before_sources(cap)


def test_evidence_files_are_never_referenced_by_a_body():
    for name in PROCEDURES:
        body = before_sources(catalog()[name])
        for path in (f"scripts/{SOURCE}/README.md", "docs/index.md", "docs/getting_started.md", "docs/faq.md", "docs/privacy.md",
                     "resources/README.md", ".claude-plugin/"):
            assert path not in body, (name, path)


def test_fresh_review_scopes_checks_to_each_intent_and_conditions_the_optional_ones():
    cap = catalog()["fresh-review"]
    scope = cap.intent_checks
    assert set(scope) == set(PROCEDURES["fresh-review"][0])
    assert {check for checks in scope.values() for check in checks} == set(cap.checks)
    assert {"stages_in_order", "reaudit_cap_respected"} <= set(scope["docs.staged-review"])
    assert "convergence_rule_applied" in scope["docs.review-loop"]
    # Resolving findings spawns no reviewer, so it answers no reviewer check.
    assert not {"reviewers_fresh_context", "failed_reviewers_not_counted"} & set(scope["docs.finding-resolution"])
    assert set(cap.check_conditions) == {"findings_categorized_with_evidence", "edits_only_approved",
                                         "reaudit_cap_respected"}
    assert set(catalog()["design-doc"].check_conditions) == {"brief_reconciled"}


def test_source_limits_are_carried_unchanged():
    caps = catalog()
    review = caps["fresh-review"].body
    for phrase in ("two consecutive clean rounds", "the cap is 5 rounds", "at most once", "CONTEST", "ESCALATE",
                   "PROPOSE FIX", "DECLINE", "`<reviewer>-<round>-<n>`", "retried once", "`not run`"):
        assert phrase in review, phrase
    contracts = caps["codebase-contracts"].body
    for phrase in ("exceeds 15", "Five pruned directories or fewer", "1,500 lines", "No `git add` and no `git commit`"):
        assert phrase in contracts, phrase
    draft = caps["design-doc"].body
    for phrase in ("up to three options", "every file changed, created or deleted", "no implementation code"):
        assert phrase in draft, phrase
    # A review in the same context is not a fresh review: the capabilities that review stop without subagents.
    for name in ("concept-brief", "fresh-review"):
        tool = next(tool for tool in caps[name].tools if tool["name"] == "subagent")
        assert tool["required"] is True and "not a fresh review" in caps[name].body
    assert next(t for t in caps["codebase-contracts"].tools if t["name"] == "subagent")["required"] is False


def test_new_outputs_have_one_owner_and_resumable_steps_are_declared():
    caps = catalog()
    outputs = [output for name in PROCEDURES for output in caps[name].outputs]
    assert len(outputs) == len(set(outputs))
    for cap in caps.values():
        assert cap.id in PROCEDURES or not set(outputs) & set(cap.outputs), cap.id
    assert not set(outputs) & {"spec", "review_findings", "review_fixes", "code_review_findings"}
    assert {name for name in PROCEDURES if caps[name].resumable} == RESUMABLE
    assert caps["design-doc"].reads == ["concepts_brief"]
    assert caps["fresh-review"].reads == ["design_document"]
    assert caps["design-drift"].reads == ["contract_files", "design_document"]


def test_delivery_registers_nothing_and_accounts_for_every_part():
    document = read_json("delivery.json")
    mine = [item for item in document["decisions"] if item["source"] == SOURCE]
    assert {item["form"] for item in mine} == {"capability", "dropped"}
    assert {target for item in mine for target in item["targets"]} == set(PROCEDURES)
    assert validate_delivery({"decisions": mine}, list(catalog().values()), {SOURCE}) == []
    content = "\n".join(item["content"] for item in mine)
    for name in SKILLS:
        assert f"skills/{name}/SKILL.md" in content, name
    for part in ("agents/*.md", "resources/document_standards", *GUIDES, ".claude-plugin/agents",
                 ".cursor-plugin/rules/egm.mdc", "docs/privacy.md", "tests/**"):
        assert part in content, part
    assert not any(wiring["capability"] in PROCEDURES for wiring in document.get("hooks", []))
    assert "egm" not in document["always_on"].lower() and "goldfish" not in document["always_on"].lower()


def test_methods_are_discoverable_under_their_original_names_and_have_authored_examples():
    caps = catalog()
    entries = read_json("entries.json")
    assert validate_entries(entries, list(caps.values()), read_json("sources.json")["plugin"]) == []
    entry = next(item for item in entries["entries"] if item["name"] == "marionette-design-docs")
    assert entry["capabilities"] == list(PROCEDURES) and entry["absorbs"] == [SOURCE, *SKILLS]
    examples = read_json("guide-examples.json")["examples"]
    assert set(PROCEDURES) - {"codebase-contracts"} <= {
        selection["capability"] for example in examples for selection in example["selections"]}
    cases = read_json("eval-cases.json")["cases"]
    assert set(PROCEDURES) <= {name for case in cases for name in case["expect"]["capabilities"]}


@pytest.mark.parametrize("task, capability, intent", [
    ("Stress-test my rough idea for a shared cache and keep the result as a brief; no design document yet.",
     "concept-brief", "docs.idea-brainstorm"),
    ("Draft the design document for the queue migration section by section; write no production code.",
     "design-doc", "docs.design-draft"),
    ("Have docs/designs/billing.md reviewed by reviewers that never saw this conversation.",
     "fresh-review", "docs.staged-review"),
    ("Run the design critic and the structural reviewer on the Technical Plan section until it converges.",
     "fresh-review", "docs.review-loop"),
    ("Go through the findings in critic_report.md and propose fixes to the document; run no new reviewer.",
     "fresh-review", "docs.finding-resolution"),
    ("Write a contract README in every code directory of this repository; do not touch the code.",
     "codebase-contracts", "docs.codebase-contracts"),
    ("Report only where the code diverged from the documents in docs/designs; fix nothing.",
     "design-drift", "docs.design-drift"),
])
def test_explicit_ai_fixtures_select_only_the_requested_method(coordinator, task, capability, intent):
    answer = decision(coordinator, task, [capability])
    answer["selections"][0]["intent"] = intent
    result = coordinator.propose(task, set(), classification=answer)
    if capability in RESUMABLE:
        # A long, user-paused step gets a resumable map even as the only step (ADR-0015).
        assert result["mode"] == "confirm" and result["plan"] == [capability]
    else:
        assert result["mode"] == "direct" and result["capability"] == capability
        assert result["required_outputs"] == PROCEDURES[capability][1]
        assert not coordinator.state_dir.exists()


@pytest.mark.parametrize("task, capability, intent", [
    ("Review my branch diff for bugs and missing tests, not the design document.",
     "engineering-review", "engineering.change-review"),
    ("Implement the retry change and write its spec as part of the work; no separate design document or review.",
     "work-map", "engineering.work-coordination"),
    ("Explain how the scheduler works as an interactive HTML page, not READMEs in the repository.",
     "interactive-explainer", "explainer.codebase-walkthrough"),
])
def test_explicit_negation_fixtures_preserve_existing_owners(coordinator, task, capability, intent):
    answer = decision(coordinator, task, [capability])
    answer["selections"][0]["intent"] = intent
    result = coordinator.propose(task, set(), classification=answer)
    assert result.get("capability") == capability or result["plan"] == [capability]


def test_idea_then_document_then_review_is_three_ordered_steps_with_no_forced_prerequisite(coordinator):
    task = "Stress-test my notification idea, write the design document, then have fresh reviewers read it."
    answer = decision(coordinator, task, ["concept-brief", "design-doc", "fresh-review"])
    answer["selections"][2]["intent"] = "docs.staged-review"
    result = coordinator.propose(task, set(), classification=answer)
    assert result["plan"] == ["concept-brief", "design-doc", "fresh-review"]
    # The document alone is a valid request: the source drafts from notes or answers too.
    alone = decision(coordinator, "Draft the design document from my notes.", ["design-doc"])
    plan = coordinator.propose("Draft the design document from my notes.", set(), classification=alone)["plan"]
    assert plan == ["design-doc"]
