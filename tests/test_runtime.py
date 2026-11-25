"""Executable coordinator workflow tests."""
import json
import shutil

import pytest

from muro.runtime import Coordinator
from routing_helpers import FIXTURE, copy_delivery, copy_prompts, decision, declare_prerequisite, proposed


@pytest.fixture
def package(tmp_path):
    # Capabilities and router only, with no manifest: the copy keeps the default identity and its state
    # folder is `.muro`.
    root = tmp_path / "package"
    root.mkdir()
    shutil.copytree(FIXTURE / "capabilities", root / "capabilities")
    shutil.copy2(FIXTURE / "ROUTER.md", root / "ROUTER.md")
    copy_prompts(root)
    copy_delivery(root)
    return root


SCROLL_STORY = ["story-brief", "pacing-spec", "scroll-build-gsap"]
BRIEF_OUTPUTS = {"audience": "first-time beekeepers", "angle": "one hive, one year",
                 "outline": "spring, summer, autumn, winter", "voice": "plain, warm, exact"}


def test_scroll_task_proposes_ordered_steps_without_writing_map(package, tmp_path):
    coordinator = Coordinator(package, tmp_path / "consumer")
    result = proposed(coordinator, "Plan a story and build its scroll movement", SCROLL_STORY, {"stack:gsap"})
    assert result["mode"] == "confirm"
    assert result["plan"] == SCROLL_STORY
    assert "instructions" not in result
    assert not (tmp_path / "consumer" / ".muro" / "map.md").exists()


def test_single_step_needs_no_map_or_confirmation(package, tmp_path):
    # A short step runs directly; a step the catalog declares resumable gets a map (ADR-0015).
    result = proposed(Coordinator(package, tmp_path / "consumer"), "Decide how long each reveal lasts", ["pacing-spec"])
    assert result["mode"] == "direct"
    assert result["capability"] == "pacing-spec"
    assert "# Pacing specification" in result["instructions"]


def test_confirm_then_record_advances_one_step_at_a_time(package, tmp_path):
    coordinator = Coordinator(package, tmp_path / "consumer")
    task = "Plan a story and build its scroll movement"
    plan = proposed(coordinator, task, SCROLL_STORY, {"stack:gsap"})["plan"]
    step = coordinator.confirm(task, plan)
    assert step["capability"] == "story-brief"
    assert "Pacing specification" not in step["instructions"]
    map_id = step["map_id"]
    with pytest.raises(ValueError, match="voice"):
        coordinator.record({"angle": "one hive, one year"}, map_id, "story-brief")
    nxt = coordinator.record(dict(BRIEF_OUTPUTS), map_id, "story-brief")
    assert nxt["capability"] == "pacing-spec"
    with pytest.raises(ValueError, match="already recorded"):
        coordinator.record({"angle": "two hives"}, map_id, "pacing-spec")
    nxt = coordinator.record({"pacing-plan": "scrub", "reduced-motion": "disable"}, map_id, "pacing-spec")
    assert nxt["capability"] == "scroll-build-gsap"
    final = coordinator.record({"scroll-patch": "src/Story.tsx", "scroll-verified": "pending"}, map_id, "scroll-build-gsap")
    assert final["mode"] == "checks"
    assert final["map_id"] == map_id
    assert list(final["checks_by_capability"]) == ["story-brief", "pacing-spec", "scroll-build-gsap"]
    assert final["results"] == []
    text = (tmp_path / "consumer" / ".muro" / "map.md").read_text(encoding="utf-8")
    assert "## Plan" in text and "## Outputs" in text
    assert "scroll-build-gsap" in text


def test_existing_outputs_skip_prerequisites_on_resume(package, tmp_path):
    # The catalog has no prerequisite edges; declare fixture edges to test the mechanism.
    declare_prerequisite(package, "scroll-build-gsap", "pacing-spec")
    # An after prerequisite needs one check scope (ADR-0018): story-brief scopes two, series-concept one.
    declare_prerequisite(package, "pacing-spec", "series-concept")
    coordinator = Coordinator(package, tmp_path / "consumer")
    state = tmp_path / "consumer" / ".muro" / "state.json"
    state.parent.mkdir(parents=True)
    task = "Plan a story and build its scroll movement"
    route = decision(coordinator, task, ["scroll-build-gsap"], {"stack:gsap"})
    state.write_text(json.dumps({"schema_version": 2, "map_id": "saved-map", "classification": route, "task": task,
                                "plan": ["series-concept", "pacing-spec", "scroll-build-gsap"],
                                "stack_tokens": ["stack:gsap"],
                                "outputs": {"pacing-plan": "done", "reduced-motion": "done"},
                                "results": []}), encoding="utf-8")
    result = coordinator.resume()
    assert result["capability"] == "scroll-build-gsap"
    assert result["map_id"] == "saved-map"


def test_record_check_requires_evidence(package, tmp_path):
    coordinator = Coordinator(package, tmp_path / "consumer")
    task = "Plan a story"
    proposal = proposed(coordinator, task, ["story-brief"])
    step = coordinator.confirm(task, proposal["plan"])
    with pytest.raises(ValueError, match="evidence"):
        coordinator.record_check({"name": "audience_named", "status": "pass"}, step["map_id"], step["capability"])


def test_forbidden_stack_is_not_silently_replaced(package, tmp_path):
    coordinator = Coordinator(package, tmp_path / "consumer")
    with pytest.raises(ValueError, match="[Ii]ncompatible"):
        proposed(coordinator, "Plan a story and build its scroll movement", ["scroll-build-gsap"], {"stack:forbidden"})


def test_scroll_request_with_stated_behavior_needs_no_pacing_or_brief_step(package, tmp_path):
    coordinator = Coordinator(package, tmp_path / "consumer")
    result = proposed(coordinator, "Pin the opening section and scrub its image scale with ScrollTrigger",
                      ["scroll-build-gsap"], {"stack:gsap"})
    assert result["mode"] == "direct"
    assert result["capability"] == "scroll-build-gsap"
