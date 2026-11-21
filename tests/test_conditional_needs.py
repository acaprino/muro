"""Conditional prerequisites (`needs`): the AI judges the condition, Python holds it to the judgment.

Decisions below are explicit host-AI fixtures; they do not prove AI reasoning quality.
"""
import copy
import shutil
from pathlib import Path

import pytest

from muro import parse_capabilities, parse_router, validate_capabilities_and_router
from muro.runtime import Coordinator
from routing_helpers import copy_delivery, copy_prompts, decision

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "examples" / "marionette"


@pytest.fixture
def coordinator(tmp_path):
    package = tmp_path / "package"
    package.mkdir()
    shutil.copytree(PACKAGE / "capabilities", package / "capabilities")
    shutil.copy2(PACKAGE / "ROUTER.md", package / "ROUTER.md")
    copy_prompts(package)
    copy_delivery(package)
    return Coordinator(package, tmp_path / "consumer")


def figma(answer):
    return next(s for s in answer["selections"] if s["capability"] == "canvas-design")


def test_catalog_exposes_the_condition_for_the_ai(coordinator):
    request = coordinator.propose("Design a button component in Figma", set())
    entry = next(item for item in request["catalog"] if item["id"] == "canvas-design")
    assert [need["capability"] for need in entry["needs"]] == ["visual-direction"]
    assert "landing page" in entry["needs"][0]["when"] and entry["after"] == []
    assert "applies" in request["instructions"]


def test_condition_judged_false_keeps_one_direct_step(coordinator):
    task = "Design a button component in Figma"
    answer = decision(coordinator, task, ["canvas-design"])
    assert figma(answer)["needs"] == [{"requires": "visual-direction", "applies": False,
                                       "reason": "Fixture judgment supplied by the test."}]
    result = coordinator.propose(task, set(), classification=answer)
    assert result["mode"] == "direct" and result["capability"] == "canvas-design"


def test_condition_judged_true_puts_the_prerequisite_first(coordinator):
    task = "Design our new landing page in Figma; we have no outline yet"
    answer = decision(coordinator, task, ["visual-direction", "canvas-design"])
    assert figma(answer)["needs"][0]["applies"] is True
    result = coordinator.propose(task, set(), classification=answer)
    assert result == {"mode": "confirm", "task": task, "plan": ["visual-direction", "canvas-design"]}


def test_python_rejects_a_missing_or_inconsistent_judgment(coordinator):
    task = "Design our new landing page in Figma"
    unjudged = decision(coordinator, task, ["canvas-design"])
    del figma(unjudged)["needs"]
    with pytest.raises(ValueError, match="must judge exactly its declared conditional prerequisites"):
        coordinator.propose(task, set(), classification=unjudged)

    absent = decision(coordinator, task, ["canvas-design"])
    figma(absent)["needs"][0]["applies"] = True
    with pytest.raises(ValueError, match="needs visual-direction for this task .* not selected"):
        coordinator.propose(task, set(), classification=absent)

    late = decision(coordinator, task, ["canvas-design", "visual-direction"])
    with pytest.raises(ValueError, match="select visual-direction before it"):
        coordinator.propose(task, set(), classification=late)

    unreasoned = decision(coordinator, task, ["canvas-design"])
    figma(unreasoned)["needs"][0]["reason"] = " "
    with pytest.raises(ValueError, match="boolean applies and a reason"):
        coordinator.propose(task, set(), classification=unreasoned)

    extra = decision(coordinator, task, ["motion-principles"])
    extra["selections"][0]["needs"] = []
    with pytest.raises(ValueError, match="declares no conditional prerequisite"):
        coordinator.propose(task, set(), classification=extra)
    assert not coordinator.state_dir.exists()


def instanced_answer(coordinator, producers, required, applies=True):
    task = "Use the specified landing strategy for the canvas design"
    answer = decision(coordinator, task, ["visual-direction"] * len(producers) + ["canvas-design"])
    for selection, step_id in zip(answer["selections"], producers):
        if step_id is not None:
            selection["step_id"] = step_id
    figma(answer)["needs"][0].update(requires=required, applies=applies)
    return task, answer


@pytest.mark.parametrize("producers", [[None], ["visual-direction#1"], ["visual-direction#1", "visual-direction#2"]])
@pytest.mark.parametrize("applies", [True, False])
def test_explicit_missing_instance_never_falls_back_to_another_producer(coordinator, producers, applies):
    task, answer = instanced_answer(coordinator, producers, "visual-direction#999", applies)
    with pytest.raises(ValueError, match="visual-direction#999.*not selected"):
        coordinator.propose(task, set(), classification=answer)
    assert not coordinator.state_dir.exists()


def test_bare_applied_reference_to_repeated_producer_is_ambiguous(coordinator):
    task, answer = instanced_answer(coordinator, ["visual-direction#1", "visual-direction#2"], "visual-direction")
    with pytest.raises(ValueError, match="ambiguous.*explicit step_id"):
        coordinator.propose(task, set(), classification=answer)
    assert not coordinator.state_dir.exists()


@pytest.mark.parametrize("producers,required", [
    ([None], "visual-direction"),
    (["visual-direction#7"], "visual-direction"),
    (["visual-direction#7"], "visual-direction#7"),
    (["visual-direction#1", "visual-direction#2"], "visual-direction#2"),
])
def test_unique_or_exact_prerequisite_references_preserve_selected_steps(coordinator, producers, required):
    task, answer = instanced_answer(coordinator, producers, required)
    result = coordinator.propose(task, set(), classification=answer)
    assert result["plan"] == [step or "visual-direction" for step in producers] + ["canvas-design"]


def test_explicit_reference_cannot_use_an_earlier_different_instance(coordinator):
    task, answer = instanced_answer(coordinator, ["visual-direction#1", "visual-direction#2"], "visual-direction#2")
    answer["selections"][1], answer["selections"][2] = answer["selections"][2], answer["selections"][1]
    with pytest.raises(ValueError, match="select visual-direction#2 before it"):
        coordinator.propose(task, set(), classification=answer)


@pytest.mark.parametrize("required", ["visual-direction#", "visual-direction#0", "visual-direction#01",
                                      "visual-direction#-1", "visual-direction#x", "visual-direction#1#2",
                                      "visual-direction#1 ", "visual-direction#1\n"])
@pytest.mark.parametrize("applies", [True, False])
def test_needs_reference_syntax_is_checked_even_when_it_does_not_apply(coordinator, required, applies):
    task, answer = instanced_answer(coordinator, ["visual-direction#1"], required, applies)
    with pytest.raises(ValueError, match="Invalid conditional prerequisite reference"):
        coordinator.propose(task, set(), classification=answer)
    assert not coordinator.state_dir.exists()


@pytest.mark.parametrize("producers,required", [
    ([], "visual-direction"),
    (["visual-direction#1", "visual-direction#2"], "visual-direction"),
    (["visual-direction#1"], "visual-direction#1"),
])
def test_false_judgment_needs_no_producer_binding(coordinator, producers, required):
    task, answer = instanced_answer(coordinator, producers, required, applies=False)
    result = coordinator.propose(task, set(), classification=answer)
    assert result["mode"] == ("confirm" if producers else "direct")


def test_schema_rejects_invalid_needs_declarations():
    caps = parse_capabilities(PACKAGE / "capabilities")
    rows = parse_router(PACKAGE / "ROUTER.md")
    assert validate_capabilities_and_router(caps, rows) == []

    def errors_with(capability, needs):
        broken = copy.deepcopy(caps)
        next(cap for cap in broken if cap.id == capability).needs = needs
        return validate_capabilities_and_router(broken, rows)

    need = lambda target: {"capability": target, "label": "only sometimes", "when": "a condition", "reason": "a reason"}
    assert any("needs unknown capability ghost" in e for e in errors_with("canvas-design", [need("ghost")]))
    assert any("duplicate needs" in e for e in errors_with("canvas-design", [need("work-map"), need("work-map")]))
    assert any("alternative or a conflict" in e for e in errors_with("gsap-scrolltrigger", [need("css-scroll")]))
    assert any("Cycle detected" in e for e in errors_with("visual-direction", [need("canvas-design")]))


def test_malformed_needs_frontmatter_is_rejected(tmp_path):
    from muro import parse_capability
    text = (PACKAGE / "capabilities" / "canvas-design.md").read_text(encoding="utf-8")
    start = text.index("needs: ")
    broken = text[:start] + 'needs: [{"capability":"visual-direction","when":""}]' + text[text.index("\n", start):]
    path = tmp_path / "canvas-design.md"
    path.write_text(broken, encoding="utf-8")
    with pytest.raises(ValueError, match="each needs entry requires"):
        parse_capability(path)
    wordy = text.replace('"label": "only landing without outline"', '"label": "only for a landing page without outline"')
    assert wordy != text
    path.write_text(wordy, encoding="utf-8")
    with pytest.raises(ValueError, match="at most 5 words"):
        parse_capability(path)
    assert len(parse_capability(PACKAGE / "capabilities" / "canvas-design.md").needs[0]["label"].split()) <= 5
