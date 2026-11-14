"""Superpowers planning chain: writing-plans and the two executors, in symbiosis with EGM.

Release v7.0.2 is pinned below. These tests read local package metadata only;
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
SOURCE = "superpowers"
COMMIT = "22f0b463e7a5e579904dd6211a520321035526f7"
RELEASE = "v7.0.2"
ABSORBED = ("writing-plans", "executing-plans", "subagent-driven-development")
METHOD_TEXTS = ("test-driven-development", "systematic-debugging", "verification-before-completion",
                "using-git-worktrees", "finishing-a-development-branch", "requesting-code-review")
EVIDENCE = ["skills/using-superpowers/SKILL.md", "skills/brainstorming/SKILL.md", "hooks/hooks.json", "README.md"]
PROCEDURES = {
    "impl-plan": (["plans.impl-plan-writing"], ["implementation_plan"], ["writing-plans"]),
    "plan-execution": (["plans.plan-execution"], ["plan_execution_report"],
                       ["executing-plans", "subagent-driven-development"]),
}


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
    assert src["repo_url"] == "https://github.com/obra/superpowers"
    assert (src["pin"], src["release"], src["commit"]) == ("release", RELEASE, COMMIT)
    assert src["license"] == "MIT" and "Jesse Vincent" in src["copyright"]
    selected = set(src["selected_paths"])
    explicit = [name for name in (*ABSORBED, *METHOD_TEXTS) if name != "systematic-debugging"]
    assert {f"skills/{name}/SKILL.md" for name in explicit} <= selected
    assert "skills/systematic-debugging/**" in selected  # SKILL.md plus its reference files and helpers
    assert {"skills/executing-plans/scripts/task-start", "skills/executing-plans/scripts/task-done",
            "skills/subagent-driven-development/references/**", "skills/subagent-driven-development/scripts/**",
            "skills/requesting-code-review/code-reviewer.md",
            "skills/using-superpowers/references/**"} <= selected
    # Read as evidence, never packaged: the activation layer, its hook, brainstorming and the README.
    assert src["intake_only_paths"] == EVIDENCE
    assert {"hooks/session-start", "hooks/run-hook.cmd", "index.js", "package.json", "scripts/**",
            "tests/**"} <= set(src["excluded_paths"])
    assert src["runtime_deps"] == [] and "symbiosis" in src["intake"]["goal"]
    assert set(ABSORBED) <= set(manifest["plugin"]["replaces"])
    assert SOURCE not in manifest["plugin"]["replaces"]  # the other upstream skills are not absorbed


def test_procedures_match_the_router_and_keep_source_provenance():
    caps = catalog()
    rows = {row.id: row for row in parse_router(PACKAGE / "ROUTER.md")}
    for name, (intents, outputs, skills) in PROCEDURES.items():
        cap, row = caps[name], rows[name]
        assert cap.role == row.role
        assert [intent["id"] for intent in cap.intents] == intents == row.intents_list()
        assert cap.outputs == outputs == row.outputs_list()
        assert cap.after == row.after_list() == []
        assert cap.when == "—" and cap.hooks == [] and cap.conflicts == []
        assert all(intent["description"].strip() and intent["excludes"] for intent in cap.intents)
        sources = cap.body.split("## Sources", 1)[1]
        assert SOURCE in sources and COMMIT in sources and RELEASE in sources and "MIT" in sources
        assert all(intent in sources for intent in intents)
        assert "Changes for coexistence (ADR-0017)" in sources
        assert "## Output handoff" in cap.body and "<state_dir>/map.md" in cap.body
        for check in cap.checks:
            assert f"**{check}**" in cap.body
        for skill in skills:
            assert f"skills/{skill}/SKILL.md" in sources, skill
            assert f"skills/{skill}/SKILL.source.md" in before_sources(cap)
            assert f"skills/{skill}/SKILL.md" not in before_sources(cap)
        assert f"<package_root>/scripts/{SOURCE}/" in before_sources(cap)


def test_evidence_files_are_never_referenced_by_a_body():
    for name in PROCEDURES:
        body = before_sources(catalog()[name])
        for path in (f"scripts/{SOURCE}/README.md", "using-superpowers/SKILL", "brainstorming/SKILL",
                     "hooks/hooks.json", "hooks/session-start"):
            assert path not in body, (name, path)


def test_source_limits_are_carried_unchanged():
    caps = catalog()
    plan = caps["impl-plan"].body
    for phrase in ("cannot make alone", "Global Constraints", "Review Focus", "RED-GREEN",
                   "exactly one reasonable thing", "all five", "docs/superpowers/plans/"):
        assert phrase in plan, phrase
    execution = caps["plan-execution"].body
    for phrase in ("never pause between tasks", "four stops", "Ruling:", "never `HEAD~1`",
                   "one fix pass", "RED→GREEN", "most capable", "self-review (no subagent tool)",
                   "never parallel implementers", "explicit consent", "failing run records nothing"):
        assert phrase in execution, phrase
    # Inline execution exists for hosts without a subagent tool: the tool stays optional.
    assert next(t for t in caps["plan-execution"].tools if t["name"] == "subagent")["required"] is False
    assert next(t for t in caps["plan-execution"].tools if t["name"] == "shell")["required"] is True


def test_new_outputs_have_one_owner_and_the_symbiosis_is_declared_data():
    caps = catalog()
    outputs = [output for name in PROCEDURES for output in caps[name].outputs]
    assert len(outputs) == len(set(outputs))
    for cap in caps.values():
        assert cap.id in PROCEDURES or not set(outputs) & set(cap.outputs), cap.id
    # The chain is declared, never inferred: the plan argues from EGM's documents,
    # the executor reads the plan and needs impl-plan only when no plan exists.
    assert caps["impl-plan"].reads == ["design_document", "concepts_brief"]
    assert caps["plan-execution"].reads == ["implementation_plan"]
    assert {cap.id for cap in caps.values() if cap.id in PROCEDURES and cap.resumable} == set(PROCEDURES)
    needs = caps["plan-execution"].needs
    assert [item["capability"] for item in needs] == ["impl-plan"]
    assert len(needs[0]["label"].split()) <= 5 and needs[0]["when"].strip() and needs[0]["reason"].strip()
    assert caps["impl-plan"].needs == []
    conditions = caps["plan-execution"].check_conditions
    assert set(conditions) == {"fixes_red_green", "final_review_fresh"}


def test_delivery_registers_nothing_and_accounts_for_every_part():
    document = read_json("delivery.json")
    mine = [item for item in document["decisions"] if item["source"] == SOURCE]
    assert {item["form"] for item in mine} == {"capability", "dropped"}
    assert {target for item in mine for target in item["targets"]} == set(PROCEDURES)
    assert validate_delivery({"decisions": mine}, list(catalog().values()), {SOURCE}) == []
    content = "\n".join(item["content"] for item in mine)
    for name in (*ABSORBED, *METHOD_TEXTS, "using-superpowers"):
        assert name in content, name
    dropped = "\n".join(item["content"] + item["reason"] for item in mine if item["form"] == "dropped")
    assert "SessionStart" in dropped and "brainstorming" in dropped
    assert not any(wiring["capability"] in PROCEDURES for wiring in document.get("hooks") or [])
    assert SOURCE not in document["always_on"].lower()


def test_methods_are_discoverable_under_their_original_names_and_have_authored_examples():
    caps = catalog()
    entries = read_json("entries.json")
    assert validate_entries(entries, list(caps.values()), read_json("sources.json")["plugin"]) == []
    entry = next(item for item in entries["entries"] if item["name"] == "marionette-implementation")
    assert entry["capabilities"] == list(PROCEDURES) and entry["absorbs"] == list(ABSORBED)
    examples = read_json("guide-examples.json")["examples"]
    assert set(PROCEDURES) <= {
        selection["capability"] for example in examples for selection in example["selections"]}
    cases = read_json("eval-cases.json")["cases"]
    assert set(PROCEDURES) <= {name for case in cases for name in case["expect"]["capabilities"]}


@pytest.mark.parametrize("task, capability, intent", [
    ("The design doc in docs/designs/export.md is approved: write the implementation plan as executable tasks; "
     "do not execute it.", "impl-plan", "plans.impl-plan-writing"),
    ("Execute the plan in docs/superpowers/plans/2026-11-14-export.md task by task without pausing.",
     "plan-execution", "plans.plan-execution"),
])
def test_explicit_ai_fixtures_select_only_the_requested_method(coordinator, task, capability, intent):
    answer = decision(coordinator, task, [capability])
    answer["selections"][0]["intent"] = intent
    result = coordinator.propose(task, set(), classification=answer)
    # Both steps are long and user-paused: a resumable map even as the only step (ADR-0015).
    assert result["mode"] == "confirm" and result["plan"] == [capability]


def test_the_symbiosis_chain_is_a_valid_four_step_plan(coordinator):
    task = ("Start from my idea of a shared rate limiter: stress-test it into a brief, write the design "
            "document, then the executable plan and its execution.")
    steps = ["concept-brief", "design-doc", "impl-plan", "plan-execution"]
    answer = decision(coordinator, task, steps)
    result = coordinator.propose(task, set(), classification=answer)
    assert result["mode"] == "confirm" and result["plan"] == steps


def test_a_plan_execution_without_a_plan_carries_the_conditional_prerequisite(coordinator):
    # The classifying AI judged the condition true and added the declared prerequisite.
    task = "Implement the retry feature task by task from a plan; no plan document exists yet."
    answer = decision(coordinator, task, ["impl-plan", "plan-execution"])
    result = coordinator.propose(task, set(), classification=answer)
    assert result["mode"] == "confirm" and result["plan"] == ["impl-plan", "plan-execution"]
