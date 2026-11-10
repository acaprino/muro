"""Integration contract for the explain-this intake (interactive explainers).

Runtime decisions below are explicit host-AI response fixtures: they exercise
Python's validation and ordering, not the quality of AI classification.
"""
import json
import shutil
from pathlib import Path

import pytest

from muro import parse_capabilities, parse_router
from muro.runtime import Coordinator
from routing_helpers import decision

ROOT = Path(__file__).resolve().parent.parent
EXPLAIN = {
    "interactive-explainer": ("explainer-authoring", ["explainer.source-walkthrough", "explainer.topic-research",
                                                     "explainer.codebase-walkthrough"]),
    "explainer-fact-check": ("claim-verification", ["explainer.fact-check"]),
}
HELPERS = "<package_root>/scripts/explain-this/skills"


@pytest.fixture
def coordinator(tmp_path):
    package = tmp_path / "package"
    package.mkdir()
    for directory in ("capabilities", "prompts"):
        shutil.copytree(ROOT / directory, package / directory)
    shutil.copy2(ROOT / "ROUTER.md", package / "ROUTER.md")
    return Coordinator(package, tmp_path / "consumer")


def route(coordinator, task, pairs, stack=None):
    """AI fixture selecting explicit capability/intent pairs."""
    stack = stack or set()
    answer = decision(coordinator, task, [name for name, _ in pairs], stack)
    for selection, (_, intent) in zip(answer["selections"], pairs):
        selection["intent"] = intent
    return coordinator.propose(task, stack, classification=answer)


def test_manifest_pins_the_three_skills_and_leaves_host_files_out():
    manifest = json.loads((ROOT / "sources.json").read_text(encoding="utf-8"))
    src = next(s for s in manifest["sources"] if s["id"] == "explain-this")
    assert src["repo_url"] == "https://github.com/analyticalmonk/explain-this"
    assert src["commit"] == "f64dab456ca23a351fe4d932c4e73bc91d3f2c52"
    assert src["license"] == "MIT" and src["copyright"] == "Copyright (c) 2026 analyticalmonk"
    for skill in ("creating-explainers", "explaining-codebases", "fact-checking-explainers"):
        assert f"skills/{skill}/SKILL.md" in src["selected_paths"]
    assert "skills/creating-explainers/assets/article-template.html" in src["selected_paths"]
    for excluded in ("skills/**/agents/**", ".claude-plugin/**", ".codex-plugin/**", "evals/**", "docs/**"):
        assert excluded in src["excluded_paths"]
    assert src["runtime_deps"] == [] and src["intake"]["goal"]


def test_explainer_capabilities_match_the_router_and_stay_passive():
    caps = {cap.id: cap for cap in parse_capabilities(ROOT / "capabilities")}
    router = {row.id: row for row in parse_router(ROOT / "ROUTER.md")}
    for name, (role, intents) in EXPLAIN.items():
        cap = caps[name]
        assert cap.role == role and router[name].role == role
        assert [intent["id"] for intent in cap.intents] == intents == router[name].intents_list()
        assert all(intent["description"].strip() and intent["excludes"] for intent in cap.intents)
        assert cap.when == "—" and cap.after == [] and cap.conflicts == [] and cap.hooks == []
        assert any(tool["name"] == "file-access" and tool["required"] for tool in cap.tools)
        for tool in cap.tools:
            if tool["name"] == "web-research":
                assert tool["required"] is False and "leave the machine" in tool["purpose"]
        assert "Source: explain-this" in cap.body


def test_bodies_hand_outputs_over_and_point_helpers_at_the_package():
    caps = {cap.id: cap for cap in parse_capabilities(ROOT / "capabilities")}
    for name in EXPLAIN:
        instructions, _, provenance = caps[name].body.partition("## Sources")
        assert "## Output handoff" in instructions and "Do not edit" in instructions, name
        assert HELPERS in instructions and "never against the consumer project" in instructions, name
        for forbidden in ("plugin install", "marketplace", "npx ", "$creating-explainers"):
            assert forbidden not in instructions, (name, forbidden)
        assert "Hooks:" in provenance and "not inspected" in provenance, name
    authoring = caps["interactive-explainer"].body
    # The blocking gate and the single approval pause survive the merge.
    assert "Deliver only on `PASS`" in authoring and "stop for approval" in authoring
    assert "do not write from memory" in authoring and "Google Fonts" in authoring
    assert "article-template.html" in authoring


def test_explainer_outputs_have_one_owner_across_the_catalog():
    caps = parse_capabilities(ROOT / "capabilities")
    own = [key for cap in caps if cap.id in EXPLAIN for key in cap.outputs]
    assert len(set(own)) == len(own)
    assert not set(own) & {key for cap in caps if cap.id not in EXPLAIN for key in cap.outputs}


def test_paper_explainer_is_one_direct_step_without_ui_prerequisites(coordinator):
    result = route(coordinator, "Trasforma questo paper in un explainer interattivo",
                   [("interactive-explainer", "explainer.source-walkthrough")], {"stack:gsap"})
    assert result["mode"] == "direct" and result["capability"] == "interactive-explainer"
    assert result["required_outputs"] == ["explainer_outline", "explainer_file", "explainer_claims"]
    assert "Visual Direction" not in result["instructions"] and "Motion Principles" not in result["instructions"]
    assert not coordinator.state_dir.exists()


def test_codebase_explainer_uses_the_same_capability_with_its_own_intent(coordinator):
    result = route(coordinator, "Make an interactive guide to how the scheduler works in this repo",
                   [("interactive-explainer", "explainer.codebase-walkthrough")])
    assert result["mode"] == "direct" and result["capability"] == "interactive-explainer"


def test_checking_an_existing_article_does_not_pull_in_authoring(coordinator):
    result = route(coordinator, "Verifica le affermazioni di questo explainer, non riscriverlo",
                   [("explainer-fact-check", "explainer.fact-check")])
    assert result["mode"] == "direct" and result["capability"] == "explainer-fact-check"
    assert result["required_outputs"] == ["verification_report", "verification_verdict"]
    assert "Interactive Explainer" not in result["instructions"]


def test_intent_must_belong_to_the_selected_explainer_capability(coordinator):
    with pytest.raises(ValueError, match="Unknown intent for capability explainer-fact-check"):
        route(coordinator, "Explain PageRank", [("explainer-fact-check", "explainer.topic-research")])
    assert not coordinator.state_dir.exists()


def test_explaining_in_chat_is_no_match_and_nothing_runs(coordinator):
    task = "Spiegami in due righe come funziona PageRank"
    answer = decision(coordinator, task, [], status="no_match")
    answer["reason"] = "An explanation wanted in the conversation is excluded by every explainer intent."
    result = coordinator.propose(task, set(), classification=answer)
    assert result["mode"] == "no_match"
    assert not coordinator.state_dir.exists()


def test_explainer_and_deck_are_independent_ordered_steps(coordinator):
    task = "Crea un explainer interattivo dal report e poi una presentazione"
    result = route(coordinator, task, [("interactive-explainer", "explainer.source-walkthrough"),
                                       ("office-deck", "office.presentation-creation")])
    assert result == {"mode": "confirm", "task": task, "plan": ["interactive-explainer", "office-deck"]}
    step = coordinator.confirm(task, result["plan"])
    nxt = coordinator.record({key: "fixture evidence" for key in step["required_outputs"]},
                             step["map_id"], step["capability"])
    assert nxt["capability"] == "office-deck"
    done = coordinator.record({key: "fixture evidence" for key in nxt["required_outputs"]},
                              nxt["map_id"], nxt["capability"])
    assert done["checks_by_capability"]["interactive-explainer"] == [
        "outline_approved_by_user", "single_file_no_dependencies", "figures_render_and_respond", "claims_gate_passed"]
