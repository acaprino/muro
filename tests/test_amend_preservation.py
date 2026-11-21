"""Adversarial second-turn checks; classifications and artifact evidence are supplied fixtures."""
import json
import shutil
from pathlib import Path

import pytest

from muro.runtime import Coordinator, runtime_main
from routing_helpers import copy_prompts, response

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "examples" / "marionette"


@pytest.fixture
def coordinator(tmp_path):
    package = tmp_path / "package"
    package.mkdir()
    for name in ("capabilities", "custom-instructions"):
        shutil.copytree(SOURCE / name, package / name)
    for name in ("ROUTER.md", "sources.json", "delivery.json"):
        shutil.copy2(SOURCE / name, package / name)
    copy_prompts(package)
    return Coordinator(package, tmp_path / "consumer")


def classify(c, task, ids, intent=None, stack=None):
    route = response(c.propose(task, stack or set()), ids)
    if intent:
        route["selections"][0]["intent"] = intent
    return route


def begin(c, task, ids, intent=None, stack=None):
    route = classify(c, task, ids, intent, stack)
    proposal = c.propose(task, stack or set(), classification=route)
    return c.confirm(task, proposal.get("plan", ids), stack or set(), classification=route)


def record_step(c, step, value="earlier artifact", fail=False):
    return c.step_atomic({
        "outputs": {key: value for key in step["required_outputs"]},
        "checks": [{"name": key, "status": "fail" if fail else "pass", "evidence": "Supplied fixture observation."}
                   for key in step["checks"]],
    }, step["map_id"], step["step_id"])


def map_snapshot(c):
    return {path.relative_to(c.state_dir).as_posix(): path.read_bytes()
            for path in c.state_dir.rglob("*") if path.is_file() and path.name != ".write-lock"}


def amend(c, task, ids, preserve=None, intent=None, stack=None):
    route = classify(c, task, ids, intent, stack)
    proposal = c.propose(task, stack or set(), classification=route, amend=True)
    return c.confirm(task, proposal["plan"], stack or set(), classification=route,
                     amend=True, preserve_completed=preserve)


@pytest.mark.parametrize("preserve", [None, [], ["visual-direction"]])
def test_amend_requires_an_active_map_even_with_explicit_preservation(coordinator, preserve):
    c = coordinator
    with pytest.raises(ValueError, match="active map"):
        amend(c, "Plan a landing and motion.", ["visual-direction", "motion-principles"], preserve)
    assert not c.state_path.exists()
    assert not (c.state_dir / "archive").exists()


def test_completed_map_is_not_amendable_even_with_explicit_preservation(coordinator):
    c = coordinator
    first = begin(c, "Plan the landing.", ["visual-direction"])
    assert record_step(c, first)["mode"] == "completed"
    before = map_snapshot(c)
    with pytest.raises(ValueError, match="active map"):
        amend(c, "Refine the landing.", ["visual-direction"], ["visual-direction"])
    assert map_snapshot(c) == before


@pytest.mark.parametrize("preserve", [None, []])
def test_changed_request_redoes_completed_output_without_explicit_preservation(coordinator, preserve):
    c = coordinator
    ids = ["visual-direction", "motion-principles"]
    first = begin(c, "Plan a restaurant landing, then motion.", ids)
    record_step(c, first, "restaurant offer and outline")
    revised = amend(c, "Replace the restaurant with a cybersecurity SaaS; rewrite its offer and outline, then motion.", ids, preserve)
    assert revised["step_id"] == "visual-direction"
    assert revised["recorded_outputs"] == {}
    assert revised["map_id"] != first["map_id"]
    assert len(list((c.state_dir / "archive").iterdir())) == 1


def test_same_task_amend_restarts_then_can_explicitly_keep_work_on_the_next_amend(coordinator):
    c = coordinator
    task, ids = "Design the landing and motion.", ["visual-direction", "motion-principles"]
    first = begin(c, task, ids)
    record_step(c, first)
    restarted = amend(c, task, ids)
    assert restarted["step_id"] == "visual-direction" and restarted["recorded_outputs"] == {}
    record_step(c, restarted, "corrected offer")
    kept = amend(c, task, ids, ["visual-direction"])
    assert kept["step_id"] == "motion-principles"
    assert kept["recorded_outputs"]["offer"] == "corrected offer"
    assert kept["map_id"] != restarted["map_id"]


def test_cli_amend_restarts_by_default_and_honors_explicit_preserve_completed(coordinator, capsys):
    c = coordinator
    ids = ["visual-direction", "motion-principles"]
    first = begin(c, "Plan a restaurant and motion.", ids)
    record_step(c, first, "restaurant offer")
    task = "Replace the restaurant with a SaaS and rewrite the offer, then motion."
    route = classify(c, task, ids)
    args = ["plan", "--package", str(c.package_root), "--project", str(c.project_root), "--task", task,
            "--classification-json", json.dumps(route), "--amend", "--confirm"]
    assert runtime_main(args) == 0
    restarted = json.loads(capsys.readouterr().out)
    assert restarted["step_id"] == "visual-direction" and restarted["recorded_outputs"] == {}
    record_step(c, restarted, "SaaS offer")
    assert runtime_main(args + ["--preserve-completed", "visual-direction"]) == 0
    kept = json.loads(capsys.readouterr().out)
    assert kept["step_id"] == "motion-principles" and kept["recorded_outputs"]["offer"] == "SaaS offer"


def test_changed_intent_reexecutes_with_its_own_checks_instead_of_writing_invalid_state(coordinator):
    c = coordinator
    ids = ["office-files", "motion-principles"]
    first = begin(c, "Read the Word file, then motion.", ids, "office.content-extraction")
    record_step(c, first, "read only")
    second = amend(c, "Apply the requested edits to Word, then motion.", ids, intent="office.file-editing")
    assert second["step_id"] == "office-files" and second["intent"] == "office.file-editing"
    assert "conversion_loss_reported" not in second["checks"]
    assert "post_edit_check_clean" in second["checks"]
    assert c._state()["results"] == []
    assert c.resume()["step_id"] == "office-files"


def test_explicit_preservation_cannot_relabel_read_only_evidence_as_editing(coordinator):
    c = coordinator
    ids = ["office-files", "motion-principles"]
    first = begin(c, "Read the Word file, then motion.", ids, "office.content-extraction")
    record_step(c, first, "read only")
    before = map_snapshot(c)
    with pytest.raises(ValueError, match="intent changed"):
        amend(c, "Edit the Word file, then motion.", ids, ["office-files"], "office.file-editing")
    assert map_snapshot(c) == before
    assert c.resume()["step_id"] == "motion-principles"


@pytest.mark.parametrize("preserve", [None, ["visual-direction"]])
def test_catalog_upgrade_cannot_reuse_old_evidence_through_amend(coordinator, preserve):
    c = coordinator
    ids = ["visual-direction", "motion-principles"]
    first = begin(c, "Plan a landing and motion.", ids)
    record_step(c, first)
    cap_file = c.package_root / "capabilities" / "visual-direction.md"
    cap_file.write_text(cap_file.read_text(encoding="utf-8") + "\nNew instructions.\n", encoding="utf-8")
    updated = Coordinator(c.package_root, c.project_root)
    before = map_snapshot(c)
    with pytest.raises(ValueError, match="outdated catalog_digest"):
        amend(updated, "Refined landing and motion.", ids, preserve)
    assert map_snapshot(c) == before


def test_step_with_failing_checks_is_not_preserved(coordinator):
    c = coordinator
    ids = ["visual-direction", "motion-principles"]
    first = begin(c, "Plan a landing and motion.", ids)
    record_step(c, first, fail=True)
    before = map_snapshot(c)
    with pytest.raises(ValueError, match="failing checks"):
        amend(c, "Refined landing and motion.", ids, ["visual-direction"])
    assert map_snapshot(c) == before


@pytest.mark.parametrize("new_ids,preserve", [
    (["motion-principles", "css-scroll"], ["motion-principles"]),
    (["motion-principles", "visual-direction", "css-scroll"], ["motion-principles", "visual-direction"]),
    (["visual-direction", "motion-principles", "css-scroll"], ["motion-principles"]),
])
def test_removed_reordered_or_redone_producer_invalidates_preserved_consumer(coordinator, new_ids, preserve):
    c = coordinator
    ids, stack = ["visual-direction", "motion-principles", "css-scroll"], {"stack:css-only"}
    first = begin(c, "Plan a landing, motion and CSS scroll.", ids, stack=stack)
    second = record_step(c, first)
    record_step(c, second)
    before = map_snapshot(c)
    with pytest.raises(ValueError, match="prerequisite|dependencies"):
        amend(c, "Refine the selected plan.", new_ids, preserve, stack=stack)
    assert map_snapshot(c) == before
    assert c.resume()["step_id"] == "css-scroll"


def test_unrelated_stack_migration_preserves_explicit_compatible_upstream_work(coordinator):
    c = coordinator
    first = begin(c, "Landing and GSAP scroll.", ["visual-direction", "motion-principles", "gsap-scrolltrigger"], stack={"stack:gsap"})
    second = record_step(c, first)
    record_step(c, second)
    next_step = amend(c, "Keep the landing and motion spec, implement with CSS instead.",
                      ["visual-direction", "motion-principles", "css-scroll"],
                      ["visual-direction", "motion-principles"], stack={"stack:css-only"})
    assert next_step["step_id"] == "css-scroll"
    assert next_step["recorded_outputs"]["motion-spec"] == "earlier artifact"


def test_invalid_previous_check_scope_is_rejected_before_archive_or_replacement(coordinator):
    c = coordinator
    first = begin(c, "Read Word, then motion.", ["office-files", "motion-principles"], "office.content-extraction")
    record_step(c, first)
    state = json.loads(c.state_path.read_text(encoding="utf-8"))
    state["results"].append({"name": "post_edit_check_clean", "status": "pass", "evidence": "foreign evidence", "capability": "office-files"})
    c.state_path.write_text(json.dumps(state), encoding="utf-8")
    before = map_snapshot(c)
    with pytest.raises(ValueError, match="Invalid state check results"):
        amend(c, "Read the revised Word, then motion.", ["office-files", "motion-principles"], intent="office.content-extraction")
    assert map_snapshot(c) == before


@pytest.mark.parametrize("change", ["needs-instance", "producer-order", "unchanged"])
def test_repeated_producer_bindings_and_order_are_preserved_exactly(coordinator, change):
    c = coordinator
    task = "Plan two landing alternatives, design the first in the canvas, then motion."

    def decision(task_text, required="visual-direction#1", reverse=False):
        refs = ["visual-direction#1", "visual-direction#2"]
        if reverse:
            refs.reverse()
        selections = [{"capability": "visual-direction", "step_id": ref,
                       "intent": "ui.landing-strategy", "reason": f"Strategy of {ref}."} for ref in refs]
        selections += [{"capability": "canvas-design", "intent": c.capabilities["canvas-design"].intents[0]["id"],
                        "reason": "Design the selected landing strategy.",
                        "needs": [{"requires": required, "applies": True, "reason": "This is the selected strategy."}]},
                       {"capability": "motion-principles", "intent": "ui.motion-design", "reason": "Motion afterwards."}]
        return {**c.propose(task_text, set())["context"], "status": "selected", "selections": selections,
                "reason": "Supplied multi-instance fixture.", "questions": []}

    route = decision(task)
    proposal = c.propose(task, set(), classification=route)
    step = c.confirm(task, proposal["plan"], set(), classification=route)
    for value in ("first alternative", "second alternative", "canvas of first alternative"):
        step = record_step(c, step, value)
    assert step["step_id"] == "motion-principles"
    before = map_snapshot(c)
    refined = "Refine the same design and motion request."
    route = decision(refined, "visual-direction#2" if change == "needs-instance" else "visual-direction#1",
                     change == "producer-order")
    proposal = c.propose(refined, set(), classification=route, amend=True)
    preserved = ["visual-direction#1", "visual-direction#2", "canvas-design"]
    if change == "unchanged":
        result = c.confirm(refined, proposal["plan"], set(), classification=route, amend=True, preserve_completed=preserved)
        assert result["step_id"] == "motion-principles"
        assert result["recorded_outputs"]["visual-direction#1.offer"] == "first alternative"
    else:
        with pytest.raises(ValueError, match="dependencies changed"):
            c.confirm(refined, proposal["plan"], set(), classification=route, amend=True, preserve_completed=preserved)
        assert map_snapshot(c) == before
