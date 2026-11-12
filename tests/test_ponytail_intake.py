"""Ponytail's curated methods, not its original plugin UI or telemetry.

Release v5.3.3 is pinned below. These tests read local package metadata only;
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
SOURCE = "ponytail"
COMMIT = "7801d061243d7b753bad0e0b3c057cd250b11755"
SKILLS = ("ponytail", "ponytail-review", "ponytail-audit", "ponytail-debt", "ponytail-gain", "ponytail-help")
CORE = ".agents/rules/ponytail.md"
BENCHMARK = "benchmarks/results/2026-10-07-agentic.md"
PROCEDURES = {
    "engineering-review": (["engineering.change-review", "engineering.codebase-audit"],
                           ["code_review_findings", "code_review_coverage"]),
    "engineering-debt": (["engineering.shortcut-ledger"], ["shortcut_ledger"]),
    "engineering-guidance": (["engineering.working-guidance", "engineering.benchmark-evidence"],
                             ["engineering_guidance"]),
}
REQUIRED_CHECKS = {
    "engineering-review": {"findings_have_concrete_evidence", "limits_respected", "report_only"},
    "engineering-debt": {"real_deferrals_only", "ceilings_and_triggers_preserved", "missing_triggers_flagged",
                         "persistence_requested"},
    "engineering-guidance": {"method_and_transport_distinguished", "benchmark_provenance_and_limits",
                             "no_counterfactual_savings"},
}


def read_json(name):
    return json.loads((PACKAGE / name).read_text(encoding="utf-8"))


def catalog():
    return {cap.id: cap for cap in parse_capabilities(PACKAGE / "capabilities")}


@pytest.fixture
def coordinator(tmp_path):
    package = tmp_path / "package"
    package.mkdir()
    shutil.copytree(PACKAGE / "capabilities", package / "capabilities")
    shutil.copytree(ROOT / "prompts", package / "prompts")
    for name in ("ROUTER.md", "sources.json", "delivery.json"):
        shutil.copy2(PACKAGE / name, package / name)
    return Coordinator(package, tmp_path / "consumer")


def test_manifest_pins_the_release_and_selects_only_the_curated_methods():
    manifest = read_json("sources.json")
    src = next(source for source in manifest["sources"] if source["id"] == SOURCE)
    assert src["repo_url"].removesuffix(".git").lower() == "https://github.com/dietrichgebert/ponytail"
    assert (src["pin"], src["release"], src["commit"]) == ("release", "v5.3.3", COMMIT)
    assert src["license"] == "MIT" and src["copyright"] == "Copyright (c) 2026 DietrichGebert"
    assert set(src["selected_paths"]) == {CORE, BENCHMARK, *(f"skills/{name}/SKILL.md" for name in SKILLS)}
    # The rules file is carried whole in the permanent policy; the six skills and the
    # benchmark are packaged and read by the engineering capabilities (ADR-0017).
    assert src["intake_only_paths"] == [CORE]
    assert {"hooks/**", ".claude-plugin/**", ".codex-plugin/**", ".opencode/**", "pi-extension/**"} <= set(src["excluded_paths"])
    assert src["runtime_deps"] == [] and src["intake"]["goal"].strip()
    assert set(SKILLS) <= set(manifest["plugin"]["replaces"])


def test_procedures_match_the_router_and_keep_source_provenance():
    caps = catalog()
    rows = {row.id: row for row in parse_router(PACKAGE / "ROUTER.md")}
    for name, (intents, outputs) in PROCEDURES.items():
        cap, row = caps[name], rows[name]
        assert cap.role == row.role
        assert [intent["id"] for intent in cap.intents] == intents == row.intents_list()
        assert cap.outputs == outputs == row.outputs_list()
        assert cap.after == row.after_list() == []
        assert cap.when == "\u2014" and cap.needs == [] and cap.hooks == [] and cap.conflicts == []
        assert REQUIRED_CHECKS[name] <= set(cap.checks)
        assert all(intent["description"].strip() and intent["excludes"] for intent in cap.intents)
        sources = cap.body.split("## Sources", 1)[1]
        assert SOURCE in sources and COMMIT in sources and "v5.3.3" in sources
        assert all(intent in sources for intent in intents)
        assert "## Output handoff" in cap.body and "<state_dir>/map.md" in cap.body
        for check in cap.checks:
            assert f"**{check}**" in cap.body
    # All six source procedures are accounted for, including enrichment of the
    # existing implementation owner rather than an extra code-writing capability.
    mapped = "\n".join(caps[name].body.split("## Sources", 1)[1]
                       for name in (*PROCEDURES, "work-map"))
    for name in SKILLS:
        assert f"skills/{name}/SKILL.md" in mapped, name
    assert COMMIT in caps["work-map"].body.split("## Sources", 1)[1]
    assert f"<package_root>/scripts/{SOURCE}/{BENCHMARK}" in caps["engineering-guidance"].body
    # ADR-0017: the engineering capabilities read the packaged originals; the rules file is in the policy only.
    for name in (*PROCEDURES, "work-map"):
        assert f"<package_root>/scripts/{SOURCE}/skills/" in caps[name].body, name
    assert all(CORE not in cap.body.split("## Sources", 1)[0] for cap in caps.values())


def test_new_outputs_have_one_owner_without_taking_design_or_cost_outputs():
    caps = catalog()
    outputs = [output for name in PROCEDURES for output in caps[name].outputs]
    assert len(outputs) == len(set(outputs))
    for cap in caps.values():
        assert cap.id in PROCEDURES or not set(outputs) & set(cap.outputs), cap.id
    assert not set(outputs) & {"review_findings", "review_fixes", "economy_report", "economy_changes", "handoff_state"}


def test_delivery_separates_permanent_guidance_requested_procedures_and_omissions():
    document = read_json("delivery.json")
    mine = [item for item in document["decisions"] if item["source"] == SOURCE]
    assert {item["form"] for item in mine} == {"always-on", "capability", "dropped"}
    assert {target for item in mine for target in item["targets"]} == {*PROCEDURES, "work-map"}
    # The text and its budget are shared with the other contributing sources, so their decisions count too.
    shared = [item for item in document["decisions"] if item["form"] == "always-on" and item["source"] != SOURCE]
    assert validate_delivery({"decisions": mine + shared, "always_on": document["always_on"]},
                             list(catalog().values()), {SOURCE, *(item["source"] for item in shared)}) == []
    for name in SKILLS:
        assert any(f"skills/{name}/SKILL.md" in item["content"] for item in mine), name
    assert any(CORE in item["content"] for item in mine)
    assert any(BENCHMARK in item["content"] for item in mine)
    assert not any(wiring["capability"] in {*PROCEDURES, "work-map"} for wiring in document.get("hooks", []))


def test_requested_methods_remain_discoverable_and_have_authored_examples():
    caps = catalog()
    entries = read_json("entries.json")
    assert validate_entries(entries, list(caps.values()), read_json("sources.json")["plugin"]) == []
    assert set(PROCEDURES) <= {name for entry in entries["entries"] for name in entry["capabilities"]}
    examples = read_json("guide-examples.json")["examples"]
    assert set(PROCEDURES) <= {selection["capability"] for example in examples for selection in example["selections"]}
    cases = read_json("eval-cases.json")["cases"]
    assert set(PROCEDURES) <= {name for case in cases for name in case["expect"]["capabilities"]}


@pytest.mark.parametrize("task, capability, intent", [
    ("Review only my diff for correctness; do not edit code or audit the whole repository.",
     "engineering-review", "engineering.change-review"),
    ("Audit the whole repository, including untouched paths; report findings without fixing them.",
     "engineering-review", "engineering.codebase-audit"),
    ("List deliberate shortcut comments and their upgrade triggers; do not create a ledger file.",
     "engineering-debt", "engineering.shortcut-ledger"),
    ("Explain lite, full and ultra working preferences without changing persistent settings.",
     "engineering-guidance", "engineering.working-guidance"),
    ("Explain the published Ponytail benchmark and its limits; do not estimate this repository's savings.",
     "engineering-guidance", "engineering.benchmark-evidence"),
])
def test_explicit_ai_fixtures_select_only_the_requested_method(coordinator, task, capability, intent):
    answer = decision(coordinator, task, [capability])
    answer["selections"][0]["intent"] = intent
    result = coordinator.propose(task, set(), classification=answer)
    assert result["mode"] == "direct" and result["capability"] == capability
    assert result["required_outputs"] == PROCEDURES[capability][1]
    assert not coordinator.state_dir.exists()


@pytest.mark.parametrize("task, capability, intent", [
    ("Show my actual TokenEconomizer stats, not Ponytail's published benchmark.",
     "token-economy", "cost.economy-report"),
    ("Audit only visual accessibility of this HTML screen, not code logic or repository debt.",
     "design-review", "ui.accessibility-audit"),
])
def test_explicit_negation_fixtures_preserve_existing_owners(coordinator, task, capability, intent):
    answer = decision(coordinator, task, [capability])
    answer["selections"][0]["intent"] = intent
    result = coordinator.propose(task, set(), classification=answer)
    assert result["mode"] == "direct" and result["capability"] == capability


def test_mentioning_review_without_requesting_one_does_not_trigger_a_procedure(coordinator):
    task = "Shorten the previous answer in chat. Do not review code, audit the repository or record debt."
    answer = decision(coordinator, task, [], status="no_match")
    result = coordinator.propose(task, set(), classification=answer)
    assert result["mode"] == "no_match" and "plan" not in result and "capability" not in result
    assert not coordinator.state_dir.exists()
