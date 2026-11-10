"""Integration contract for the GenOffice intake (non-UI Office capabilities).

Runtime decisions below are explicit host-AI response fixtures: they exercise
Python's validation and ordering, not the quality of AI classification. The
source is pinned to a published release (ADR-0009); no test contacts the remote.
"""
import json
import shutil
from pathlib import Path

import pytest

from muro import parse_capabilities, parse_router
from muro.runtime import Coordinator
from routing_helpers import decision

ROOT = Path(__file__).resolve().parent.parent
OFFICE = {
    "office-deck": ("deck-authoring", ["office.presentation-creation"]),
    "office-authoring": ("document-authoring", ["office.document-creation", "office.spreadsheet-creation"]),
    "office-files": ("office-file-operations", ["office.file-editing", "office.format-conversion",
                                                "office.content-extraction", "office.editor-handoff"]),
}


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


def test_genoffice_manifest_is_apache_and_scoped_to_the_cli_skill():
    manifest = json.loads((ROOT / "sources.json").read_text(encoding="utf-8"))
    src = next(s for s in manifest["sources"] if s["id"] == "genoffice")
    assert src["repo_url"] == "https://github.com/genspark-ai/genoffice"
    assert src["commit"] == "4b55db9ed1994575a695160ffc6cfd0bfc866211"
    assert (src["pin"], src["release"]) == ("release", "v0.12.852")
    assert src["license"] == "Apache-2.0"
    assert src["copyright"] == "Copyright 2026 Mainfunc, Inc."
    assert src["selected_paths"] == ["skills/genoffice/SKILL.md"]
    # The enterprise-licensed tree and the separate scenario skills stay out.
    assert "ee/**" in src["excluded_paths"] and "skills/recommended/**" in src["excluded_paths"]
    assert src["runtime_deps"] and all(dep["bundled"] is False for dep in src["runtime_deps"])
    assert src["intake"]["goal"]


def test_office_capabilities_carry_ai_authored_intents_and_passive_operations():
    caps = {cap.id: cap for cap in parse_capabilities(ROOT / "capabilities")}
    router = {row.id: row for row in parse_router(ROOT / "ROUTER.md")}
    for name, (role, intents) in OFFICE.items():
        cap = caps[name]
        assert cap.role == role and router[name].role == role
        assert [intent["id"] for intent in cap.intents] == intents == router[name].intents_list()
        assert all(intent["description"].strip() and intent["excludes"] for intent in cap.intents)
        # The CLI is a tool requirement the host checks, never a stack token or prerequisite.
        assert cap.when == "—" and cap.after == [] and cap.conflicts == [] and cap.hooks == []
        assert any(tool["name"] == "genoffice-cli" and tool["required"] for tool in cap.tools)
        for tool in cap.tools:
            if tool["name"] == "genoffice-cloud":
                assert tool["required"] is False and "leaves the machine" in tool["purpose"]
        assert "Source: genoffice" in cap.body


def test_office_bodies_hand_outputs_over_install_the_engine_and_never_simulate():
    caps = {cap.id: cap for cap in parse_capabilities(ROOT / "capabilities")}
    for name in OFFICE:
        instructions, _, provenance = caps[name].body.partition("## Sources")
        assert "## Output handoff" in instructions and "Do not edit" in instructions, name
        # Owner rule: a missing engine is installed by the step and never faked.
        assert "If GenOffice is not installed, install it" in instructions, name
        assert "github.com/genspark-ai/genoffice/releases" in instructions, name
        assert "do not simulate" in instructions, name
        assert "genoffice --version" in instructions, name
        for forbidden in ("skill install", "mcp install", "install-cli", "npx "):
            assert forbidden not in instructions, (name, forbidden)
        assert "Hooks:" in provenance and "not inspected" in provenance, name
    for name in ("office-deck", "office-files"):
        assert "Data leaving the machine" in caps[name].body, name


def test_office_outputs_have_one_owner_across_the_catalog():
    caps = parse_capabilities(ROOT / "capabilities")
    office_outputs = {key for cap in caps if cap.id in OFFICE for key in cap.outputs}
    assert len(office_outputs) == sum(len(cap.outputs) for cap in caps if cap.id in OFFICE)
    assert not office_outputs & {key for cap in caps if cap.id not in OFFICE for key in cap.outputs}


def test_new_deck_is_one_direct_step_without_ui_prerequisites(coordinator):
    result = route(coordinator, "Prepara una presentazione di 8 slide sui risultati del trimestre",
                   [("office-deck", "office.presentation-creation")], {"stack:gsap"})
    assert result["mode"] == "direct"
    assert result["capability"] == "office-deck"
    assert result["required_outputs"] == ["deck_outline", "deck_file", "deck_review"]
    assert any(tool["name"] == "genoffice-cli" for tool in result["tools"])
    assert "Motion Principles" not in result["instructions"] and "Visual Direction" not in result["instructions"]
    assert not coordinator.state_dir.exists()


def test_conversion_without_content_change_does_not_pull_in_authoring(coordinator):
    result = route(coordinator, "Convert report.docx to PDF, do not change its content",
                   [("office-files", "office.format-conversion")])
    assert result["mode"] == "direct" and result["capability"] == "office-files"
    assert "Office Authoring" not in result["instructions"]


def test_reading_a_workbook_selects_extraction_only(coordinator):
    result = route(coordinator, "Riassumi il foglio vendite.xlsx senza modificarlo",
                   [("office-files", "office.content-extraction")])
    assert result["mode"] == "direct" and result["capability"] == "office-files"
    assert result["required_outputs"] == ["file_reading", "file_result"]


def test_intent_must_belong_to_the_selected_office_capability(coordinator):
    with pytest.raises(ValueError, match="Unknown intent for capability office-deck"):
        route(coordinator, "Write a report", [("office-deck", "office.document-creation")])
    assert not coordinator.state_dir.exists()


def test_landing_page_and_pitch_deck_are_independent_ordered_steps(coordinator):
    task = "Crea la landing page e una presentazione per gli investitori"
    result = route(coordinator, task, [("visual-direction", "ui.landing-strategy"),
                                       ("office-deck", "office.presentation-creation")])
    assert result == {"mode": "confirm", "task": task, "plan": ["visual-direction", "office-deck"]}
    step = coordinator.confirm(task, result["plan"])
    assert step["capability"] == "visual-direction"
    nxt = coordinator.record({key: "fixture evidence" for key in step["required_outputs"]},
                             step["map_id"], step["capability"])
    assert nxt["capability"] == "office-deck" and nxt["map_id"] == step["map_id"]
    done = coordinator.record({key: "fixture evidence" for key in nxt["required_outputs"]},
                              nxt["map_id"], nxt["capability"])
    assert done["mode"] == "checks"
    assert done["checks_by_capability"]["office-deck"] == ["outline_and_pages_checked", "deck_audit_clean",
                                                          "deck_render_reviewed", "deck_facts_sourced"]


def test_create_then_edit_is_a_sequential_handoff_not_a_conflict(coordinator):
    task = "Create the budget workbook, then fill the contract template from it"
    result = route(coordinator, task, [("office-authoring", "office.spreadsheet-creation"),
                                       ("office-files", "office.file-editing")])
    assert result["plan"] == ["office-authoring", "office-files"]


def test_missing_genoffice_is_reported_by_the_ai_and_nothing_runs(coordinator):
    task = "Genera un documento Word con il verbale della riunione"
    answer = decision(coordinator, task, [], status="needs_clarification")
    answer["reason"] = "office-authoring requires the genoffice command line, which is not installed on this host."
    answer["questions"] = ["GenOffice is not installed here: install it, or should I deliver Markdown instead?"]
    result = coordinator.propose(task, set(), classification=answer)
    assert result["mode"] == "needs_clarification" and result["questions"] == answer["questions"]
    assert not coordinator.state_dir.exists()
