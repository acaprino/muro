"""Regression evidence from the 2026-11-20 review; judgments are authored fixtures, not LLM evaluations."""
import json
import shutil
from pathlib import Path

import pytest

from muro.runtime import Coordinator, runtime_main
from routing_helpers import copy_prompts

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "examples" / "marionette"


@pytest.fixture
def package(tmp_path):
    target = tmp_path / "package"
    target.mkdir()
    for directory in ("capabilities", "custom-instructions"):
        shutil.copytree(PACKAGE / directory, target / directory)
    for name in ("ROUTER.md", "sources.json", "delivery.json"):
        shutil.copy2(PACKAGE / name, target / name)
    copy_prompts(target)
    return target


CASES = [
    ("work-map", "engineering.work-coordination", "spec_template_complete", set(),
     "Fix one incorrect label directly; no spec is requested or produced."),
    ("work-map", "engineering.work-coordination", "slices_vertical_gated", set(),
     "One direct change, so no ticket breakdown exists to approve."),
    ("visual-direction", "ui.visual-direction", "palette_applied", set(),
     "Only a written direction is requested; no page or rendered backgrounds."),
    ("visual-direction", "ui.visual-direction", "single_primary_action", set(),
     "A company homepage explicitly serves multiple audiences and actions, as behavior step 1 permits."),
    ("office-authoring", "office.document-creation", "engine_check_clean", set(),
     "Create new content directly as PDF from Markdown, with no intermediate DOCX or XLSX."),
    ("css-scroll", "ui.scroll-animation", "pin_stable_css", {"stack:css-only"},
     "Only an opacity reveal follows scrolling; no sticky element or pinning exists."),
]


def start(coordinator, name, intent, stack, task):
    # The subsequent independent debt report keeps this a mapped flow, including non-resumable capabilities.
    task += " Then report the repository's explicit shortcut comments."
    context = coordinator.propose(task, stack)["context"]
    route = {**context, "status": "selected", "questions": [], "reason": "Authored review regression fixture.",
             "selections": [{"capability": name, "intent": intent, "reason": "The first requested artifact."},
                            {"capability": "engineering-debt", "intent": "engineering.shortcut-ledger",
                             "reason": "The separately requested subsequent report."}]}
    proposal = coordinator.propose(task, stack, classification=route)
    return coordinator.confirm(task, proposal["plan"], stack, classification=route)


@pytest.mark.parametrize("name,intent,check,stack,task", CASES)
def test_supported_short_branches_record_inapplicable_checks_honestly(package, tmp_path, name, intent, check, stack, task):
    coordinator = Coordinator(package, tmp_path / "consumer")
    step = start(coordinator, name, intent, stack, task)
    assert check in step["check_conditions"]
    result = coordinator.record_check({"name": check, "status": "not-applicable", "evidence": task},
                                      step["map_id"], name)
    assert result["effective_checks"][name][check] == "not-applicable"
    # The authored condition does not silently convert the outcome into a passing measurement.
    assert result["results"][-1]["evidence"] == task
    assert Coordinator(package, tmp_path / "consumer").resume()["map_id"] == step["map_id"]


def test_direct_pdf_keeps_actual_render_review_required(package, tmp_path):
    coordinator = Coordinator(package, tmp_path / "consumer")
    step = start(coordinator, "office-authoring", "office.document-creation", set(),
                 "Create a new PDF from my notes, directly from Markdown.")
    assert "engine_check_clean" in step["check_conditions"]
    assert "office_render_reviewed" in step["checks"]
    assert "office_render_reviewed" not in step["check_conditions"]
    with pytest.raises(ValueError, match="declares no condition"):
        coordinator.record_check({"name": "office_render_reviewed", "status": "not-applicable",
                                  "evidence": "The output is a PDF."}, step["map_id"], "office-authoring")
    body = coordinator.capabilities["office-authoring"].body
    assert "genoffice render <actual output path>" in body
    assert "final PDF's rendering" in body
    assert "never invent a `pdf check` command" in body


def test_unrelated_required_check_still_rejects_not_applicable(package, tmp_path):
    coordinator = Coordinator(package, tmp_path / "consumer")
    step = start(coordinator, "work-map", "engineering.work-coordination", set(), "Fix one label directly.")
    with pytest.raises(ValueError, match="declares no condition"):
        coordinator.record_check({"name": "route_sized_by_sessions", "status": "not-applicable",
                                  "evidence": "Small task."}, step["map_id"], "work-map")


def test_scholarly_source_rule_is_delivered_without_activating_paper_search(package, capsys):
    # This is the native policy transport entry point; no task, routing decision or research tool is run.
    assert runtime_main(["session-context", "--package", str(package), "--hook-event", "SubagentStart"]) == 0
    policy = json.loads(capsys.readouterr().out)["hookSpecificOutput"]["additionalContext"]
    source_paragraph = (
        "A source that is off is off on every route. Reach literature through `$PS`, and\n"
        "leave a switched-off source alone through other routes as well: MCP connectors,\n"
        "other skills, and web fetches. When the evidence needs a source that is off,\n"
        "say so and let the human decide."
    )
    assert source_paragraph in policy
    assert "only when retrieving scholarly literature" in policy
    assert "Give delegated researchers the resolved script path, project working directory and source-switch configuration" in policy
    assert "does not restrict non-scholarly web research" in policy
    assert "<package_root>/capabilities/paper-search.md" in policy
    assert "marionette-papers" in policy
    delivery = json.loads((package / "delivery.json").read_text(encoding="utf-8"))
    rule = [item for item in delivery["decisions"]
            if item["source"] == "open-paper-skills" and item["form"] == "always-on"]
    assert len(rule) == 1 and not rule[0]["targets"]
    assert not delivery.get("hooks")
