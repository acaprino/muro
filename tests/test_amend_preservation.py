"""Adversarial second-turn checks; classifications and artifact evidence are supplied fixtures."""
import json
import shutil

import pytest

from muro.runtime import Coordinator, runtime_main
from routing_helpers import FIXTURE, copy_prompts, response


@pytest.fixture
def coordinator(tmp_path):
    # The fixture package with its manifest and its delivery document: the copy runs under its own slug.
    package = tmp_path / "package"
    package.mkdir()
    for name in ("capabilities", "custom-instructions"):
        shutil.copytree(FIXTURE / name, package / name)
    for name in ("ROUTER.md", "sources.json", "delivery.json"):
        shutil.copy2(FIXTURE / name, package / name)
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


@pytest.mark.parametrize("preserve", [None, [], ["story-brief"]])
def test_amend_requires_an_active_map_even_with_explicit_preservation(coordinator, preserve):
    c = coordinator
    with pytest.raises(ValueError, match="active map"):
        amend(c, "Plan a story and its pacing.", ["story-brief", "pacing-spec"], preserve)
    assert not c.state_path.exists()
    assert not (c.state_dir / "archive").exists()


def test_completed_map_is_not_amendable_even_with_explicit_preservation(coordinator):
    c = coordinator
    first = begin(c, "Plan the story.", ["story-brief"])
    assert record_step(c, first)["mode"] == "completed"
    before = map_snapshot(c)
    with pytest.raises(ValueError, match="active map"):
        amend(c, "Refine the story.", ["story-brief"], ["story-brief"])
    assert map_snapshot(c) == before


@pytest.mark.parametrize("preserve", [None, []])
def test_changed_request_redoes_completed_output_without_explicit_preservation(coordinator, preserve):
    c = coordinator
    ids = ["story-brief", "pacing-spec"]
    first = begin(c, "Plan a story on beekeeping, then its pacing.", ids)
    record_step(c, first, "beekeeping angle and outline")
    revised = amend(c, "Replace beekeeping with river restoration; rewrite its angle and outline, then the pacing.", ids, preserve)
    assert revised["step_id"] == "story-brief"
    assert revised["recorded_outputs"] == {}
    assert revised["map_id"] != first["map_id"]
    assert len(list((c.state_dir / "archive").iterdir())) == 1


def test_same_task_amend_restarts_then_can_explicitly_keep_work_on_the_next_amend(coordinator):
    c = coordinator
    task, ids = "Plan the story and its pacing.", ["story-brief", "pacing-spec"]
    first = begin(c, task, ids)
    record_step(c, first)
    restarted = amend(c, task, ids)
    assert restarted["step_id"] == "story-brief" and restarted["recorded_outputs"] == {}
    record_step(c, restarted, "corrected angle")
    kept = amend(c, task, ids, ["story-brief"])
    assert kept["step_id"] == "pacing-spec"
    assert kept["recorded_outputs"]["angle"] == "corrected angle"
    assert kept["map_id"] != restarted["map_id"]


def test_cli_amend_restarts_by_default_and_honors_explicit_preserve_completed(coordinator, capsys):
    c = coordinator
    ids = ["story-brief", "pacing-spec"]
    first = begin(c, "Plan a story on beekeeping and its pacing.", ids)
    record_step(c, first, "beekeeping angle")
    task = "Replace beekeeping with river restoration and rewrite the angle, then the pacing."
    route = classify(c, task, ids)
    args = ["plan", "--package", str(c.package_root), "--project", str(c.project_root), "--task", task,
            "--classification-json", json.dumps(route), "--amend", "--confirm"]
    assert runtime_main(args) == 0
    restarted = json.loads(capsys.readouterr().out)
    assert restarted["step_id"] == "story-brief" and restarted["recorded_outputs"] == {}
    record_step(c, restarted, "river angle")
    assert runtime_main(args + ["--preserve-completed", "story-brief"]) == 0
    kept = json.loads(capsys.readouterr().out)
    assert kept["step_id"] == "pacing-spec" and kept["recorded_outputs"]["angle"] == "river angle"


def test_changed_intent_reexecutes_with_its_own_checks_instead_of_writing_invalid_state(coordinator):
    c = coordinator
    ids = ["manuscript-files", "pacing-spec"]
    first = begin(c, "Read the manuscript file, then pacing.", ids, "files.extraction")
    record_step(c, first, "read only")
    second = amend(c, "Apply the requested edits to the manuscript, then pacing.", ids, intent="files.editing")
    assert second["step_id"] == "manuscript-files" and second["intent"] == "files.editing"
    assert "conversion_loss_reported" not in second["checks"]
    assert "edit_verified" in second["checks"]
    assert c._state()["results"] == []
    assert c.resume()["step_id"] == "manuscript-files"


def test_explicit_preservation_cannot_relabel_read_only_evidence_as_editing(coordinator):
    c = coordinator
    ids = ["manuscript-files", "pacing-spec"]
    first = begin(c, "Read the manuscript file, then pacing.", ids, "files.extraction")
    record_step(c, first, "read only")
    before = map_snapshot(c)
    with pytest.raises(ValueError, match="intent changed"):
        amend(c, "Edit the manuscript file, then pacing.", ids, ["manuscript-files"], "files.editing")
    assert map_snapshot(c) == before
    assert c.resume()["step_id"] == "pacing-spec"


@pytest.mark.parametrize("preserve", [None, ["story-brief"]])
def test_catalog_upgrade_cannot_reuse_old_evidence_through_amend(coordinator, preserve):
    c = coordinator
    ids = ["story-brief", "pacing-spec"]
    first = begin(c, "Plan a story and its pacing.", ids)
    record_step(c, first)
    cap_file = c.package_root / "capabilities" / "story-brief.md"
    cap_file.write_text(cap_file.read_text(encoding="utf-8") + "\nNew instructions.\n", encoding="utf-8")
    updated = Coordinator(c.package_root, c.project_root)
    before = map_snapshot(c)
    with pytest.raises(ValueError, match="outdated catalog_digest"):
        amend(updated, "Refined story and pacing.", ids, preserve)
    assert map_snapshot(c) == before


def test_step_with_failing_checks_is_not_preserved(coordinator):
    c = coordinator
    ids = ["story-brief", "pacing-spec"]
    first = begin(c, "Plan a story and its pacing.", ids)
    record_step(c, first, fail=True)
    before = map_snapshot(c)
    with pytest.raises(ValueError, match="failing checks"):
        amend(c, "Refined story and pacing.", ids, ["story-brief"])
    assert map_snapshot(c) == before


@pytest.mark.parametrize("new_ids,preserve", [
    (["pacing-spec", "scroll-build-css"], ["pacing-spec"]),
    (["pacing-spec", "story-brief", "scroll-build-css"], ["pacing-spec", "story-brief"]),
    (["story-brief", "pacing-spec", "scroll-build-css"], ["pacing-spec"]),
])
def test_removed_reordered_or_redone_producer_invalidates_preserved_consumer(coordinator, new_ids, preserve):
    c = coordinator
    ids, stack = ["story-brief", "pacing-spec", "scroll-build-css"], {"stack:css-only"}
    first = begin(c, "Plan a story, its pacing and a CSS scroll build.", ids, stack=stack)
    second = record_step(c, first)
    record_step(c, second)
    before = map_snapshot(c)
    with pytest.raises(ValueError, match="prerequisite|dependencies"):
        amend(c, "Refine the selected plan.", new_ids, preserve, stack=stack)
    assert map_snapshot(c) == before
    assert c.resume()["step_id"] == "scroll-build-css"


def test_unrelated_stack_migration_preserves_explicit_compatible_upstream_work(coordinator):
    c = coordinator
    first = begin(c, "Story and GSAP scroll build.", ["story-brief", "pacing-spec", "scroll-build-gsap"], stack={"stack:gsap"})
    second = record_step(c, first)
    record_step(c, second)
    next_step = amend(c, "Keep the story and the pacing spec, build with CSS instead.",
                      ["story-brief", "pacing-spec", "scroll-build-css"],
                      ["story-brief", "pacing-spec"], stack={"stack:css-only"})
    assert next_step["step_id"] == "scroll-build-css"
    assert next_step["recorded_outputs"]["pacing-plan"] == "earlier artifact"


def test_invalid_previous_check_scope_is_rejected_before_archive_or_replacement(coordinator):
    c = coordinator
    first = begin(c, "Read the manuscript, then pacing.", ["manuscript-files", "pacing-spec"], "files.extraction")
    record_step(c, first)
    state = json.loads(c.state_path.read_text(encoding="utf-8"))
    state["results"].append({"name": "edit_verified", "status": "pass", "evidence": "foreign evidence", "capability": "manuscript-files"})
    c.state_path.write_text(json.dumps(state), encoding="utf-8")
    before = map_snapshot(c)
    with pytest.raises(ValueError, match="Invalid state check results"):
        amend(c, "Read the revised manuscript, then pacing.", ["manuscript-files", "pacing-spec"], intent="files.extraction")
    assert map_snapshot(c) == before


@pytest.mark.parametrize("change", ["needs-instance", "producer-order", "unchanged"])
def test_repeated_producer_bindings_and_order_are_preserved_exactly(coordinator, change):
    c = coordinator
    task = "Choose two angles, write the edition on the first, then pacing."

    def decision(task_text, required="story-brief#1", reverse=False):
        refs = ["story-brief#1", "story-brief#2"]
        if reverse:
            refs.reverse()
        selections = [{"capability": "story-brief", "step_id": ref,
                       "intent": "story.angle", "reason": f"Angle of {ref}."} for ref in refs]
        selections += [{"capability": "newsletter-edition", "intent": c.capabilities["newsletter-edition"].intents[0]["id"],
                        "reason": "Write the edition on the selected angle.",
                        "needs": [{"requires": required, "applies": True, "reason": "This is the selected angle."}]},
                       {"capability": "pacing-spec", "intent": "story.pacing", "reason": "Pacing afterwards."}]
        return {**c.propose(task_text, set())["context"], "status": "selected", "selections": selections,
                "reason": "Supplied multi-instance fixture.", "questions": []}

    route = decision(task)
    proposal = c.propose(task, set(), classification=route)
    step = c.confirm(task, proposal["plan"], set(), classification=route)
    for value in ("first alternative", "second alternative", "edition on the first alternative"):
        step = record_step(c, step, value)
    assert step["step_id"] == "pacing-spec"
    before = map_snapshot(c)
    refined = "Refine the same edition and pacing request."
    route = decision(refined, "story-brief#2" if change == "needs-instance" else "story-brief#1",
                     change == "producer-order")
    proposal = c.propose(refined, set(), classification=route, amend=True)
    preserved = ["story-brief#1", "story-brief#2", "newsletter-edition"]
    if change == "unchanged":
        result = c.confirm(refined, proposal["plan"], set(), classification=route, amend=True, preserve_completed=preserved)
        assert result["step_id"] == "pacing-spec"
        assert result["recorded_outputs"]["story-brief#1.angle"] == "first alternative"
    else:
        with pytest.raises(ValueError, match="dependencies changed"):
            c.confirm(refined, proposal["plan"], set(), classification=route, amend=True, preserve_completed=preserved)
        assert map_snapshot(c) == before
