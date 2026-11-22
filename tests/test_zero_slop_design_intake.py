"""zero-slop-design: its fourteen skills as four on-demand capabilities around a project's DESIGN.md.

Release v0.2.1 is pinned below. These tests read local package metadata only;
the separately recorded source check/build verifies the actual pinned remote.
Runtime selections are explicit host-AI response fixtures, never a classifier
and never evidence that a model understands a request or its negation.
The bundled tool is never run here.
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
SOURCE = "zero-slop-design"
COMMIT = "c5cdc7ce499846c23d90732e4958b44f92823756"
RELEASE = "v0.2.1"
SKILLS = ("define-design", "create-design-md", "extract-design", "review-design-md", "update-design-md",
          "apply-design", "review-design-drift", "define-typography", "define-color-system",
          "define-responsive-layout", "define-interaction-states", "review-accessibility",
          "export-design-tokens", "enforce-design")
EVIDENCE = ["references/technical-terms.md", "references/technical-terms.json", "references/authoring.md",
            "README.md", "catalog.json", "docs/design-md-standard.md", ".claude-plugin/plugin.json"]
PROCEDURES = {
    "design-file": (["design-file.brief", "design-file.create", "design-file.extract", "design-file.update"],
                    ["design_brief", "design_file"],
                    ["define-design", "create-design-md", "extract-design", "update-design-md", "define-typography",
                     "define-color-system", "define-responsive-layout", "define-interaction-states"]),
    "design-file-apply": (["design-file.apply"], ["design_application"], ["apply-design"]),
    "design-file-inspection": (["design-file.document-review", "design-file.interface-drift",
                                "design-file.accessibility-inspection"],
                               ["design_inspection_report"],
                               ["review-design-md", "review-design-drift", "review-accessibility"]),
    "design-file-integration": (["design-file.token-export", "design-file.code-checks"],
                                ["token_export", "design_code_checks"],
                                ["export-design-tokens", "enforce-design"]),
}
RESUMABLE = {"design-file", "design-file-apply", "design-file-integration"}
# Capabilities that take a look from what exists: a project DESIGN.md comes first and is never rewritten there.
LOOK_CONSUMERS = ("visual-direction", "canvas-design")


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
    shutil.copytree(PACKAGE / "custom-instructions", package / "custom-instructions")
    shutil.copytree(ROOT / "prompts", package / "prompts")
    for name in ("ROUTER.md", "sources.json", "delivery.json"):
        shutil.copy2(PACKAGE / name, package / name)
    return Coordinator(package, tmp_path / "consumer")


def test_manifest_pins_the_release_tag_and_separates_packaged_files_from_evidence():
    manifest = read_json("sources.json")
    src = next(source for source in manifest["sources"] if source["id"] == SOURCE)
    assert src["repo_url"] == "https://github.com/zero-slop-design/zero-slop-design-plugin"
    assert (src["pin"], src["release"], src["commit"]) == ("release", RELEASE, COMMIT)
    assert src["license"] == "MIT" and src["copyright"].startswith("Copyright (c) 2026 zero-slop-design contributors")
    selected = set(src["selected_paths"])
    assert {f"skills/{name}/SKILL.md" for name in SKILLS} <= selected
    # The bundle travels with its data, its recorded hashes and both license files (owner decision, 2026-11-17).
    assert {"tools/zsd.mjs", "tools/spec-config.yaml", "tools/build-info.json", "LICENSE", "THIRD_PARTY_NOTICES.md",
            "references/procedure.md", "references/design-format.md", "references/code-checks.md",
            "references/observations.md", "spec/zsd-design-md.md", "templates/DESIGN.md",
            "templates/ci/github-actions.yml", "docs/template-guide.md"} <= selected
    assert src["intake_only_paths"] == EVIDENCE
    assert not {"tools/zsd.mjs", "LICENSE", "THIRD_PARTY_NOTICES.md"} & set(src["intake_only_paths"])
    assert {"src/**", "packages/**", "scripts/**", "skills/*/agents/**", ".codex-plugin/**", ".agents/**",
            "package.json", "package-lock.json"} <= set(src["excluded_paths"])
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
        # No forced chain: the source gives every skill the design file as an input and chains none.
        assert cap.when == "—" and cap.needs == [] and cap.hooks == [] and cap.conflicts == []
        assert all(intent["description"].strip() and intent["excludes"] for intent in cap.intents)
        sources = cap.body.split("## Sources", 1)[1]
        assert SOURCE in sources and COMMIT in sources and RELEASE in sources and "MIT" in sources
        assert all(intent in sources for intent in intents)
        assert "Changes for coexistence (ADR-0017)" in sources
        assert "## Output handoff" in cap.body and "<state_dir>/map.md" in cap.body
        for check in cap.checks:
            assert f"**{check}**" in cap.body
        for skill in skills:
            # A packaged SKILL.md travels as SKILL.source.md; the body names each skill it opens.
            assert f"`{skill}`" in before_sources(cap) or f"skills/{skill}/SKILL.source.md" in before_sources(cap), skill
            assert f"skills/{skill}/SKILL.md" not in before_sources(cap)
            assert skill in sources
        assert f"<package_root>/scripts/{SOURCE}" in before_sources(cap)
        assert "SKILL.source.md" in before_sources(cap)
    assert {skill for _, _, skills in PROCEDURES.values() for skill in skills} == set(SKILLS)


def test_evidence_files_are_never_referenced_by_a_body():
    for name in PROCEDURES:
        body = before_sources(catalog()[name])
        for path in ("technical-terms", "references/authoring.md", "README.md", "catalog.json",
                     "design-md-standard.md", ".claude-plugin/"):
            assert path not in body, (name, path)


def test_checks_are_scoped_to_each_intent():
    caps = catalog()
    for name, (intents, _, _) in PROCEDURES.items():
        cap = caps[name]
        if len(intents) == 1:
            assert cap.intent_checks == {}
            continue
        assert set(cap.intent_checks) == set(intents)
        assert {check for checks in cap.intent_checks.values() for check in checks} == set(cap.checks)
    scope = caps["design-file-inspection"].intent_checks
    # The accessibility skill states no "do not change" line and has no correction step.
    assert "nothing_changed" in scope["design-file.document-review"]
    assert "nothing_changed" in scope["design-file.interface-drift"]
    assert "nothing_changed" not in scope["design-file.accessibility-inspection"]
    assert set(caps["design-file"].check_conditions) == {"area_completion_met"}
    assert set(caps["design-file-integration"].check_conditions) == {"ci_changed_with_approval"}
    assert not set(caps["design-file-integration"].intent_checks["design-file.token-export"]) & {
        "no_new_code_check_errors", "ci_changed_with_approval"}


def test_source_limits_are_carried_unchanged():
    caps = catalog()
    design_file = caps["design-file"].body
    for phrase in ("1,200 words or less", "24 KiB or less", "`x-zsd.profile: \"0.1\"`", "`version: alpha`",
                   "`Do` or `Do not`", "never show an estimate as a measured value",
                   "Do not mark unresolved design selections as approved",
                   "Open external sources only with developer approval for access",
                   "set `x-zsd.kind` to `project` and `x-zsd.review.status` to `draft`"):
        assert phrase in design_file, phrase
    integration = caps["design-file-integration"].body
    for phrase in ("2025.10", "`@theme inline`", "explicit `letterSpacing`", "refuses to overwrite a file unless `--force`",
                   "do not overwrite a target file without developer approval", "0 errors for new source code",
                   "Get developer approval before you change continuous integration files",
                   "do not ignore a path to hide a defect", "`p-[13px]`", "`--update-known`",
                   "Do not claim that a code check result proves design quality or accessibility"):
        assert phrase in integration, phrase
    inspection = caps["design-file-inspection"].body
    for phrase in ("a result with no differences does not show full interface conformance",
                   "Do not change the design file unless the developer tells you to correct it",
                   "do not change the interface unless the developer tells you to correct it",
                   "Use available software tools only for approved checks"):
        assert phrase in inspection, phrase
    # Node.js 22 is a runtime dependency of the three capabilities that run the tool; the source gives no install method.
    for name in ("design-file", "design-file-inspection", "design-file-integration"):
        tool = next(tool for tool in caps[name].tools if tool["name"] == "shell")
        assert tool["required"] is True and "Node.js 22 or later" in caps[name].body
        assert "<ZS>/tools/zsd.mjs" in caps[name].body


def test_the_ban_on_unrequested_tests_keeps_its_scope_in_every_step():
    caps = catalog()
    for name in PROCEDURES:
        assert "not add or do tests unless the developer tells you to do tests" in before_sources(caps[name]), name
    apply = caps["design-file-apply"]
    # Scoped by what is tested (owner decision of 2026-11-17): neither source's rule is dropped.
    assert "assert-based self-check for that logic still holds" in before_sources(apply)
    assert "plan-execution" in apply.body.split("## Sources", 1)[1]
    policy = read_json("delivery.json")["always_on"]
    assert "leaves one small test or an assert-based self-check" in policy


def test_new_outputs_have_one_owner_and_resumable_steps_are_declared():
    caps = catalog()
    outputs = [output for name in PROCEDURES for output in caps[name].outputs]
    assert len(outputs) == len(set(outputs))
    for cap in caps.values():
        assert cap.id in PROCEDURES or not set(outputs) & set(cap.outputs), cap.id
    # The interface drift report does not take the key of the document drift report.
    assert "drift_report" not in outputs and caps["design-drift"].outputs == ["drift_report"]
    assert {name for name in PROCEDURES if caps[name].resumable} == RESUMABLE
    assert caps["design-file-apply"].reads == ["design_file"]
    assert caps["design-file-integration"].reads == ["design_file"]
    assert caps["design-file-inspection"].reads == ["design_file", "design_brief", "design_application"]
    assert {"palette", "typography"} <= set(caps["design-file"].reads)


def test_a_project_design_file_comes_first_and_only_its_owner_writes_it():
    caps = catalog()
    for name in LOOK_CONSUMERS:
        cap = caps[name]
        body = before_sources(cap)
        assert "design_file" in cap.reads, name
        assert "`DESIGN.md` of the project that is not a starter or a reference" in body, name
        assert "`unresolved` entries and `proposed` values are not" in body, name
        assert "`design-file` owns it" in body or "belongs to `design-file`" in body, name
        assert "owner decision of 2026-11-17" in cap.body.split("## Sources", 1)[1], name
    visual = before_sources(caps["visual-direction"])
    assert "counts as the user's explicit instruction" in visual
    assert "This step never rewrites `DESIGN.md`" in visual
    # The source names the user's explicit prompt, not a brand, as what wins over a rule.
    assert "The user's explicit prompt wins" in visual
    router = (PACKAGE / "ROUTER.md").read_text(encoding="utf-8")
    assert "a client's brand wins over source bans" not in router
    for name in ("design-file-apply", "design-file-inspection"):
        assert "design-file" in before_sources(caps[name])
    assert "design_file_not_rewritten" in caps["design-file-apply"].checks


def test_the_file_is_followed_as_recorded_and_a_starter_is_not_a_system():
    caps = catalog()
    visual = before_sources(caps["visual-direction"])
    assert "its confirmed colour tokens, typefaces, spacing, radius and component values are followed" in visual
    assert "or from the confirmed typography of a project design file" in visual
    assert "or the confirmed values of a project design file" in visual
    # Steps that write source code name what the design code checks reject (references/code-checks.md).
    for name in ("visual-direction", "design-file-apply"):
        body = before_sources(caps[name])
        assert "`design-check.config.json`" in body and "a colour function such as `rgb()` or `oklch()`" in body, name
    assert "comes first" in before_sources(caps["canvas-design"])
    motion = caps["motion-principles"]
    assert motion.reads[-1] == "design_file"
    assert "confirmed `x-zsd.motion` values" in before_sources(motion)
    assert "owner decision of 2026-11-17" in motion.body.split("## Sources", 1)[1]


def test_delivery_registers_nothing_and_accounts_for_every_part():
    document = read_json("delivery.json")
    mine = [item for item in document["decisions"] if item["source"] == SOURCE]
    assert {item["form"] for item in mine} == {"capability", "dropped"}
    assert {target for item in mine for target in item["targets"]} == set(PROCEDURES)
    # Checked against its own capabilities: the catalog also holds another source's active hook.
    assert validate_delivery({"decisions": mine}, [catalog()[name] for name in PROCEDURES], {SOURCE}) == []
    content = "\n".join(item["content"] for item in mine)
    for name in SKILLS:
        assert name in content, name
    for part in ("tools/zsd.mjs", "THIRD_PARTY_NOTICES.md", "LICENSE", "references/technical-terms.json",
                 "references/authoring.md", "README.md", "catalog.json", ".claude-plugin/plugin.json",
                 "templates/ci/github-actions.yml", "spec/zsd-design-md.md"):
        assert part in content, part
    assert not any(wiring["capability"] in PROCEDURES for wiring in document.get("hooks", []))
    assert "zero-slop" not in document["always_on"].lower() and "DESIGN.md" not in document["always_on"]


def test_methods_are_discoverable_under_their_original_names_and_have_authored_examples():
    caps = catalog()
    entries = read_json("entries.json")
    assert validate_entries(entries, list(caps.values()), read_json("sources.json")["plugin"]) == []
    entry = next(item for item in entries["entries"] if item["name"] == "marionette-design-file")
    assert entry["capabilities"] == list(PROCEDURES)
    assert entry["absorbs"][0] == SOURCE and set(entry["absorbs"]) == {SOURCE, *SKILLS}
    assert len(entry["absorbs"]) == len(SKILLS) + 1
    examples = read_json("guide-examples.json")["examples"]
    assert {"design-file", "design-file-inspection", "design-file-integration"} <= {
        selection["capability"] for example in examples for selection in example["selections"]}
    cases = read_json("eval-cases.json")["cases"]
    assert set(PROCEDURES) <= {name for case in cases for name in case["expect"]["capabilities"]}
    # Near-misses keep their owners in the authored expectations.
    expected = {case["id"]: case["expect"]["capabilities"] for case in cases}
    assert expected["zsd-doc-drift-stays-egm"] == ["design-drift"]


@pytest.mark.parametrize("task, capability, intent", [
    ("Record the audience, the references and what to keep for the new console in a design brief.",
     "design-file", "design-file.brief"),
    ("Write the DESIGN.md of this project from the brief we agreed.", "design-file", "design-file.create"),
    ("Make a DESIGN.md from the interface that already exists in src/ui.", "design-file", "design-file.extract"),
    ("Set the colour roles, the dark mode and the contrast pairs in our DESIGN.md.",
     "design-file", "design-file.update"),
    ("Rebuild the settings page from our DESIGN.md with the project's components.",
     "design-file-apply", "design-file.apply"),
    ("Examine DESIGN.md for unresolved token references and conflicting instructions; change nothing.",
     "design-file-inspection", "design-file.document-review"),
    ("Compare the running dashboard with DESIGN.md and report the measured differences; fix nothing.",
     "design-file-inspection", "design-file.interface-drift"),
    ("Inspect the checkout against WCAG 2.2 AA and give me the report only.",
     "design-file-inspection", "design-file.accessibility-inspection"),
    ("Export the DESIGN.md tokens as Tailwind theme data.", "design-file-integration", "design-file.token-export"),
    ("Add a CI check that fails on colours and fonts DESIGN.md does not permit.",
     "design-file-integration", "design-file.code-checks"),
])
def test_explicit_ai_fixtures_select_only_the_requested_method(coordinator, task, capability, intent):
    answer = decision(coordinator, task, [capability])
    answer["selections"][0]["intent"] = intent
    result = coordinator.propose(task, set(), classification=answer)
    if capability in RESUMABLE:
        # A step that pauses for developer decisions gets a resumable map even as the only step (ADR-0015).
        assert result["mode"] == "confirm" and result["plan"] == [capability]
    else:
        assert result["mode"] == "direct" and result["capability"] == capability
        assert result["required_outputs"] == PROCEDURES[capability][1]
        assert not coordinator.state_dir.exists()


@pytest.mark.parametrize("task, capability, intent", [
    ("Report where the code diverged from the design documents in docs/designs; this is not about the interface.",
     "design-drift", "docs.design-drift"),
])
def test_explicit_negation_fixtures_preserve_existing_owners(coordinator, task, capability, intent):
    answer = decision(coordinator, task, [capability])
    answer["selections"][0]["intent"] = intent
    result = coordinator.propose(task, set(), classification=answer)
    assert result.get("capability") == capability or result["plan"] == [capability]


def test_file_then_apply_then_checks_is_three_ordered_steps_with_no_forced_prerequisite(coordinator):
    task = "Write our DESIGN.md, rebuild the settings page from it, then add the code checks to CI."
    answer = decision(coordinator, task, ["design-file", "design-file-apply", "design-file-integration"])
    answer["selections"][0]["intent"] = "design-file.create"
    answer["selections"][2]["intent"] = "design-file.code-checks"
    result = coordinator.propose(task, set(), classification=answer)
    assert result["plan"] == ["design-file", "design-file-apply", "design-file-integration"]
    # Applying an existing file is a valid request alone: nothing forces the authoring step before it.
    alone_task = "Rebuild the settings page from the DESIGN.md that is already in the repository."
    alone = decision(coordinator, alone_task, ["design-file-apply"])
    assert coordinator.propose(alone_task, set(), classification=alone)["plan"] == ["design-file-apply"]
