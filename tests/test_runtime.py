"""Executable coordinator workflow tests."""
import json
import shutil
from pathlib import Path

import pytest

from muro.runtime import Coordinator
from routing_helpers import copy_prompts, decision, proposed

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture
def package(tmp_path):
    root = tmp_path / "package"
    root.mkdir()
    shutil.copytree(ROOT / "capabilities", root / "capabilities")
    shutil.copy2(ROOT / "ROUTER.md", root / "ROUTER.md")
    copy_prompts(root)
    return root


def test_scroll_task_proposes_ordered_steps_without_writing_map(package, tmp_path):
    coordinator = Coordinator(package, tmp_path / "consumer")
    result = proposed(coordinator, "Build a landing page with scroll animation", ["gsap-scrolltrigger"], {"stack:gsap"})
    assert result["mode"] == "confirm"
    assert result["plan"] == ["visual-direction", "motion-principles", "gsap-scrolltrigger"]
    assert "instructions" not in result
    assert not (tmp_path / "consumer" / ".muro" / "map.md").exists()


def test_single_step_needs_no_map_or_confirmation(package, tmp_path):
    result = proposed(Coordinator(package, tmp_path / "consumer"), "Design a page", ["visual-direction"])
    assert result["mode"] == "direct"
    assert result["capability"] == "visual-direction"
    assert "# Visual Direction" in result["instructions"]


def test_confirm_then_record_advances_one_step_at_a_time(package, tmp_path):
    coordinator = Coordinator(package, tmp_path / "consumer")
    task = "Build a landing page with scroll animation"
    plan = proposed(coordinator, task, ["gsap-scrolltrigger"], {"stack:gsap"})["plan"]
    step = coordinator.confirm(task, plan)
    assert step["capability"] == "visual-direction"
    assert "Motion Principles" not in step["instructions"]
    map_id = step["map_id"]
    with pytest.raises(ValueError, match="constraints"):
        coordinator.record({"palette": "black"}, map_id, "visual-direction")
    nxt = coordinator.record({"design_candidates": "verified local search result", "stack_guidance": "react",
                              "palette": "black", "typography": "Inter", "layout": "hero", "constraints": "none",
                              "offer": "trial", "page_outline": "hero, proof, FAQ"}, map_id, "visual-direction")
    assert nxt["capability"] == "motion-principles"
    with pytest.raises(ValueError, match="already recorded"):
        coordinator.record({"palette": "white"}, map_id, "motion-principles")
    nxt = coordinator.record({"motion-spec": "scrub", "reduced-motion": "disable"}, map_id, "motion-principles")
    assert nxt["capability"] == "gsap-scrolltrigger"
    final = coordinator.record({"code-patch": "src/Hero.tsx", "scroll-verified": "pending"}, map_id, "gsap-scrolltrigger")
    assert final["mode"] == "checks"
    assert final["map_id"] == map_id
    assert list(final["checks_by_capability"]) == ["visual-direction", "motion-principles", "gsap-scrolltrigger"]
    assert final["results"] == []
    text = (tmp_path / "consumer" / ".muro" / "map.md").read_text(encoding="utf-8")
    assert "## Plan" in text and "## Outputs" in text
    assert "gsap-scrolltrigger" in text


def test_existing_outputs_skip_prerequisites_on_resume(package, tmp_path):
    coordinator = Coordinator(package, tmp_path / "consumer")
    state = tmp_path / "consumer" / ".muro" / "state.json"
    state.parent.mkdir(parents=True)
    task = "Build a landing page with scroll animation"
    route = decision(coordinator, task, ["gsap-scrolltrigger"], {"stack:gsap"})
    state.write_text(json.dumps({"schema_version": 2, "map_id": "saved-map", "classification": route, "task": task,
                                "plan": ["visual-direction", "motion-principles", "gsap-scrolltrigger"],
                                "stack_tokens": ["stack:gsap"],
                                "outputs": {"motion-spec": "done", "reduced-motion": "done"},
                                "results": []}), encoding="utf-8")
    result = coordinator.resume()
    assert result["capability"] == "gsap-scrolltrigger"
    assert result["map_id"] == "saved-map"


def test_record_check_requires_evidence(package, tmp_path):
    coordinator = Coordinator(package, tmp_path / "consumer")
    task = "Design a page"
    proposal = proposed(coordinator, task, ["visual-direction"])
    step = coordinator.confirm(task, [proposal["capability"]])
    with pytest.raises(ValueError, match="evidence"):
        coordinator.record_check({"name": "palette_applied", "status": "pass"}, step["map_id"], step["capability"])


def test_forbidden_stack_is_not_silently_replaced(package, tmp_path):
    coordinator = Coordinator(package, tmp_path / "consumer")
    with pytest.raises(ValueError, match="[Ii]ncompatible"):
        proposed(coordinator, "Build a landing page with scroll animation", ["gsap-scrolltrigger"], {"stack:forbidden"})


def test_landing_strategy_is_required_before_motion(package, tmp_path):
    coordinator = Coordinator(package, tmp_path / "consumer")
    result = proposed(coordinator, "Build a landing page with scroll animation", ["gsap-scrolltrigger"], {"stack:gsap"})
    assert result["mode"] == "confirm"
    step = coordinator.confirm(
        "Build a landing page with scroll animation", result["plan"], {"stack:gsap"})
    assert step["capability"] == "visual-direction"
    assert "offer" in step["required_outputs"]
    assert "page_outline" in step["required_outputs"]
    assert "one primary action" in step["instructions"]


def test_figma_task_uses_figma_capability_without_assuming_mcp(package, tmp_path):
    coordinator = Coordinator(package, tmp_path / "consumer")
    result = proposed(coordinator, "Design a landing page in Figma", ["figma-design"])
    assert result["plan"] == ["visual-direction", "figma-design"]
    step = coordinator.confirm("Design a landing page in Figma", result["plan"])
    assert step["required_outputs"] == ["design_candidates", "stack_guidance", "offer", "page_outline", "palette", "typography", "layout", "constraints"]
    nxt = Coordinator(package, tmp_path / "consumer").record({
        "design_candidates": "verified local search result", "stack_guidance": "react",
        "offer": "trial", "page_outline": "hero, proof, FAQ", "palette": "black",
        "typography": "Geist", "layout": "hero", "constraints": "no gradients"}, step["map_id"], step["capability"])
    assert nxt["capability"] == "figma-design"
    assert "Figma MCP" in nxt["instructions"]
    assert "do not simulate" in nxt["instructions"]


def test_ordinary_engineering_task_is_one_coordinator_step(package, tmp_path):
    result = proposed(Coordinator(package, tmp_path / "consumer"), "rinomina questa funzione", ["work-map"])
    assert result["mode"] == "direct"
    assert result["capability"] == "work-map"
    assert "EX-002" in result["instructions"]
