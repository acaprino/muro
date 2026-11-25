"""Conditional prerequisites (`needs`): the AI judges the condition, Python holds it to the judgment.

Decisions below are explicit host-AI fixtures; they do not prove AI reasoning quality.
"""
import copy
import shutil

import pytest

from muro import parse_capabilities, parse_router, validate_capabilities_and_router
from muro.runtime import Coordinator
from routing_helpers import FIXTURE, copy_delivery, copy_prompts, decision


@pytest.fixture
def coordinator(tmp_path):
    # Capabilities and router only, with no manifest: the copy keeps the default identity.
    package = tmp_path / "package"
    package.mkdir()
    shutil.copytree(FIXTURE / "capabilities", package / "capabilities")
    shutil.copy2(FIXTURE / "ROUTER.md", package / "ROUTER.md")
    copy_prompts(package)
    copy_delivery(package)
    return Coordinator(package, tmp_path / "consumer")


def edition(answer):
    return next(s for s in answer["selections"] if s["capability"] == "newsletter-edition")


def test_catalog_exposes_the_condition_for_the_ai(coordinator):
    request = coordinator.propose("Write an edition as a digest of last week's stories", set())
    entry = next(item for item in request["catalog"] if item["id"] == "newsletter-edition")
    assert [need["capability"] for need in entry["needs"]] == ["story-brief"]
    assert "new story" in entry["needs"][0]["when"] and entry["after"] == []
    assert "applies" in request["instructions"]


def test_condition_judged_false_keeps_one_direct_step(coordinator):
    task = "Write an edition as a digest of last week's stories"
    answer = decision(coordinator, task, ["newsletter-edition"])
    assert edition(answer)["needs"] == [{"requires": "story-brief", "applies": False,
                                       "reason": "Fixture judgment supplied by the test."}]
    result = coordinator.propose(task, set(), classification=answer)
    assert result["mode"] == "direct" and result["capability"] == "newsletter-edition"


def test_condition_judged_true_puts_the_prerequisite_first(coordinator):
    task = "Write an edition about a new story; we have no angle yet"
    answer = decision(coordinator, task, ["story-brief", "newsletter-edition"])
    assert edition(answer)["needs"][0]["applies"] is True
    result = coordinator.propose(task, set(), classification=answer)
    assert result == {"mode": "confirm", "task": task, "plan": ["story-brief", "newsletter-edition"]}


def test_python_rejects_a_missing_or_inconsistent_judgment(coordinator):
    task = "Write an edition about a new story"
    unjudged = decision(coordinator, task, ["newsletter-edition"])
    del edition(unjudged)["needs"]
    with pytest.raises(ValueError, match="must judge exactly its declared conditional prerequisites"):
        coordinator.propose(task, set(), classification=unjudged)

    absent = decision(coordinator, task, ["newsletter-edition"])
    edition(absent)["needs"][0]["applies"] = True
    with pytest.raises(ValueError, match="needs story-brief for this task .* not selected"):
        coordinator.propose(task, set(), classification=absent)

    late = decision(coordinator, task, ["newsletter-edition", "story-brief"])
    with pytest.raises(ValueError, match="select story-brief before it"):
        coordinator.propose(task, set(), classification=late)

    unreasoned = decision(coordinator, task, ["newsletter-edition"])
    edition(unreasoned)["needs"][0]["reason"] = " "
    with pytest.raises(ValueError, match="boolean applies and a reason"):
        coordinator.propose(task, set(), classification=unreasoned)

    extra = decision(coordinator, task, ["pacing-spec"])
    extra["selections"][0]["needs"] = []
    with pytest.raises(ValueError, match="declares no conditional prerequisite"):
        coordinator.propose(task, set(), classification=extra)
    assert not coordinator.state_dir.exists()


def instanced_answer(coordinator, producers, required, applies=True):
    task = "Use the specified angle for the newsletter edition"
    answer = decision(coordinator, task, ["story-brief"] * len(producers) + ["newsletter-edition"])
    for selection, step_id in zip(answer["selections"], producers):
        if step_id is not None:
            selection["step_id"] = step_id
    edition(answer)["needs"][0].update(requires=required, applies=applies)
    return task, answer


@pytest.mark.parametrize("producers", [[None], ["story-brief#1"], ["story-brief#1", "story-brief#2"]])
@pytest.mark.parametrize("applies", [True, False])
def test_explicit_missing_instance_never_falls_back_to_another_producer(coordinator, producers, applies):
    task, answer = instanced_answer(coordinator, producers, "story-brief#999", applies)
    with pytest.raises(ValueError, match="story-brief#999.*not selected"):
        coordinator.propose(task, set(), classification=answer)
    assert not coordinator.state_dir.exists()


def test_bare_applied_reference_to_repeated_producer_is_ambiguous(coordinator):
    task, answer = instanced_answer(coordinator, ["story-brief#1", "story-brief#2"], "story-brief")
    with pytest.raises(ValueError, match="ambiguous.*explicit step_id"):
        coordinator.propose(task, set(), classification=answer)
    assert not coordinator.state_dir.exists()


@pytest.mark.parametrize("producers,required", [
    ([None], "story-brief"),
    (["story-brief#7"], "story-brief"),
    (["story-brief#7"], "story-brief#7"),
    (["story-brief#1", "story-brief#2"], "story-brief#2"),
])
def test_unique_or_exact_prerequisite_references_preserve_selected_steps(coordinator, producers, required):
    task, answer = instanced_answer(coordinator, producers, required)
    result = coordinator.propose(task, set(), classification=answer)
    assert result["plan"] == [step or "story-brief" for step in producers] + ["newsletter-edition"]


def test_explicit_reference_cannot_use_an_earlier_different_instance(coordinator):
    task, answer = instanced_answer(coordinator, ["story-brief#1", "story-brief#2"], "story-brief#2")
    answer["selections"][1], answer["selections"][2] = answer["selections"][2], answer["selections"][1]
    with pytest.raises(ValueError, match="select story-brief#2 before it"):
        coordinator.propose(task, set(), classification=answer)


@pytest.mark.parametrize("required", ["story-brief#", "story-brief#0", "story-brief#01",
                                      "story-brief#-1", "story-brief#x", "story-brief#1#2",
                                      "story-brief#1 ", "story-brief#1\n"])
@pytest.mark.parametrize("applies", [True, False])
def test_needs_reference_syntax_is_checked_even_when_it_does_not_apply(coordinator, required, applies):
    task, answer = instanced_answer(coordinator, ["story-brief#1"], required, applies)
    with pytest.raises(ValueError, match="Invalid conditional prerequisite reference"):
        coordinator.propose(task, set(), classification=answer)
    assert not coordinator.state_dir.exists()


@pytest.mark.parametrize("producers,required", [
    ([], "story-brief"),
    (["story-brief#1", "story-brief#2"], "story-brief"),
    (["story-brief#1"], "story-brief#1"),
])
def test_false_judgment_needs_no_producer_binding(coordinator, producers, required):
    task, answer = instanced_answer(coordinator, producers, required, applies=False)
    result = coordinator.propose(task, set(), classification=answer)
    assert result["mode"] == ("confirm" if producers else "direct")


def test_schema_rejects_invalid_needs_declarations():
    caps = parse_capabilities(FIXTURE / "capabilities")
    rows = parse_router(FIXTURE / "ROUTER.md")
    assert validate_capabilities_and_router(caps, rows) == []

    def errors_with(capability, needs):
        broken = copy.deepcopy(caps)
        next(cap for cap in broken if cap.id == capability).needs = needs
        return validate_capabilities_and_router(broken, rows)

    need = lambda target: {"capability": target, "label": "only sometimes", "when": "a condition", "reason": "a reason"}
    assert any("needs unknown capability ghost" in e for e in errors_with("newsletter-edition", [need("ghost")]))
    assert any("duplicate needs" in e for e in errors_with("newsletter-edition", [need("fact-check"), need("fact-check")]))
    assert any("alternative or a conflict" in e for e in errors_with("scroll-build-gsap", [need("scroll-build-css")]))
    assert any("Cycle detected" in e for e in errors_with("story-brief", [need("newsletter-edition")]))


def test_malformed_needs_frontmatter_is_rejected(tmp_path):
    from muro import parse_capability
    text = (FIXTURE / "capabilities" / "newsletter-edition.md").read_text(encoding="utf-8")
    start = text.index("needs: ")
    broken = text[:start] + 'needs: [{"capability":"story-brief","when":""}]' + text[text.index("\n", start):]
    path = tmp_path / "newsletter-edition.md"
    path.write_text(broken, encoding="utf-8")
    with pytest.raises(ValueError, match="each needs entry requires"):
        parse_capability(path)
    wordy = text.replace('"label": "only without an angle"', '"label": "only for a story without an angle"')
    assert wordy != text
    path.write_text(wordy, encoding="utf-8")
    with pytest.raises(ValueError, match="at most 5 words"):
        parse_capability(path)
    assert len(parse_capability(FIXTURE / "capabilities" / "newsletter-edition.md").needs[0]["label"].split()) <= 5
