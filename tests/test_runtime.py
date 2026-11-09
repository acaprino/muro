"""Executable coordinator workflow tests."""
import json
import shutil
from pathlib import Path

import pytest

from muro.runtime import Coordinator

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture
def package(tmp_path):
    root = tmp_path / "package"
    root.mkdir()
    shutil.copytree(ROOT / "capabilities", root / "capabilities")
    shutil.copy2(ROOT / "ROUTER.md", root / "ROUTER.md")
    return root


def test_scroll_task_proposes_ordered_steps_without_writing_map(package, tmp_path):
    coordinator = Coordinator(package, tmp_path / "consumer")
    result = coordinator.propose("Build a landing page with scroll animation", {"stack:gsap"})
    assert result["mode"] == "confirm"
    assert result["plan"] == ["visual-direction", "motion-principles", "gsap-scrolltrigger"]
    assert "instructions" not in result
    assert not (tmp_path / "consumer" / ".muro" / "map.md").exists()


def test_single_step_needs_no_map_or_confirmation(package, tmp_path):
    result = Coordinator(package, tmp_path / "consumer").propose("Design a page", set())
    assert result["mode"] == "direct"
    assert result["capability"] == "visual-direction"
    assert "# Visual Direction" in result["instructions"]


def test_confirm_then_record_advances_one_step_at_a_time(package, tmp_path):
    coordinator = Coordinator(package, tmp_path / "consumer")
    task = "Build a landing page with scroll animation"
    plan = coordinator.propose(task, {"stack:gsap"})["plan"]
    step = coordinator.confirm(task, plan)
    assert step["capability"] == "visual-direction"
    assert "Motion Principles" not in step["instructions"]
    with pytest.raises(ValueError, match="constraints"):
        coordinator.record({"palette": "black"})
    nxt = coordinator.record({"palette": "black", "typography": "Inter", "layout": "hero", "constraints": "none"})
    assert nxt["capability"] == "motion-principles"
    with pytest.raises(ValueError, match="already recorded"):
        coordinator.record({"palette": "white"})
    nxt = coordinator.record({"motion-spec": "scrub", "reduced-motion": "disable"})
    assert nxt["capability"] == "gsap-scrolltrigger"
    final = coordinator.record({"code-patch": "src/Hero.tsx", "scroll-verified": "pending"})
    assert final["mode"] == "checks"
    assert final["results"] == []
    text = (tmp_path / "consumer" / ".muro" / "map.md").read_text(encoding="utf-8")
    assert "## Plan" in text and "## Outputs" in text
    assert "gsap-scrolltrigger" in text


def test_existing_outputs_skip_prerequisites_on_resume(package, tmp_path):
    coordinator = Coordinator(package, tmp_path / "consumer")
    state = tmp_path / "consumer" / ".muro" / "state.json"
    state.parent.mkdir(parents=True)
    state.write_text(json.dumps({"task": "Build a landing page with scroll animation",
                                "plan": ["visual-direction", "motion-principles", "gsap-scrolltrigger"],
                                "stack_tokens": ["stack:gsap"],
                                "outputs": {"motion-spec": "done", "reduced-motion": "done"},
                                "results": []}), encoding="utf-8")
    result = coordinator.resume()
    assert result["capability"] == "gsap-scrolltrigger"


def test_record_check_requires_evidence(package, tmp_path):
    coordinator = Coordinator(package, tmp_path / "consumer")
    task = "Design a page"
    proposal = coordinator.propose(task, set())
    coordinator.confirm(task, [proposal["capability"]])
    with pytest.raises(ValueError, match="evidence"):
        coordinator.record_check({"name": "palette_applied", "status": "pass"})


def test_forbidden_stack_is_not_silently_replaced(package, tmp_path):
    coordinator = Coordinator(package, tmp_path / "consumer")
    with pytest.raises(ValueError, match="No compatible"):
        coordinator.propose("Build a landing page with scroll animation", {"stack:forbidden"})


def test_ordinary_engineering_task_is_one_coordinator_step(package, tmp_path):
    result = Coordinator(package, tmp_path / "consumer").propose("rinomina questa funzione", set())
    assert result["mode"] == "direct"
    assert result["capability"] == "work-map"
    assert "EX-002" in result["instructions"]
