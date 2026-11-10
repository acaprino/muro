"""Conditional prerequisites (`needs`): the AI judges the condition, Python holds it to the judgment.

Decisions below are explicit host-AI fixtures; they do not prove AI reasoning quality.
"""
import copy
import shutil
from pathlib import Path

import pytest

from muro import parse_capabilities, parse_router, validate_capabilities_and_router
from muro.runtime import Coordinator
from routing_helpers import copy_prompts, decision

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "examples" / "marionette"


@pytest.fixture
def coordinator(tmp_path):
    package = tmp_path / "package"
    package.mkdir()
    shutil.copytree(PACKAGE / "capabilities", package / "capabilities")
    shutil.copy2(PACKAGE / "ROUTER.md", package / "ROUTER.md")
    copy_prompts(package)
    return Coordinator(package, tmp_path / "consumer")


def figma(answer):
    return next(s for s in answer["selections"] if s["capability"] == "figma-design")


def test_catalog_exposes_the_condition_for_the_ai(coordinator):
    request = coordinator.propose("Design a button component in Figma", set())
    entry = next(item for item in request["catalog"] if item["id"] == "figma-design")
    assert [need["capability"] for need in entry["needs"]] == ["visual-direction"]
    assert "landing page" in entry["needs"][0]["when"] and entry["after"] == []
    assert "applies" in request["instructions"]


def test_condition_judged_false_keeps_one_direct_step(coordinator):
    task = "Design a button component in Figma"
    answer = decision(coordinator, task, ["figma-design"])
    assert figma(answer)["needs"] == [{"requires": "visual-direction", "applies": False,
                                       "reason": "Fixture judgment supplied by the test."}]
    result = coordinator.propose(task, set(), classification=answer)
    assert result["mode"] == "direct" and result["capability"] == "figma-design"


def test_condition_judged_true_puts_the_prerequisite_first(coordinator):
    task = "Design our new landing page in Figma; we have no outline yet"
    answer = decision(coordinator, task, ["visual-direction", "figma-design"])
    assert figma(answer)["needs"][0]["applies"] is True
    result = coordinator.propose(task, set(), classification=answer)
    assert result == {"mode": "confirm", "task": task, "plan": ["visual-direction", "figma-design"]}


def test_python_rejects_a_missing_or_inconsistent_judgment(coordinator):
    task = "Design our new landing page in Figma"
    unjudged = decision(coordinator, task, ["figma-design"])
    del figma(unjudged)["needs"]
    with pytest.raises(ValueError, match="must judge exactly its declared conditional prerequisites"):
        coordinator.propose(task, set(), classification=unjudged)

    absent = decision(coordinator, task, ["figma-design"])
    figma(absent)["needs"][0]["applies"] = True
    with pytest.raises(ValueError, match="needs visual-direction for this task .* not selected"):
        coordinator.propose(task, set(), classification=absent)

    late = decision(coordinator, task, ["figma-design", "visual-direction"])
    with pytest.raises(ValueError, match="select visual-direction before it"):
        coordinator.propose(task, set(), classification=late)

    unreasoned = decision(coordinator, task, ["figma-design"])
    figma(unreasoned)["needs"][0]["reason"] = " "
    with pytest.raises(ValueError, match="boolean applies and a reason"):
        coordinator.propose(task, set(), classification=unreasoned)

    extra = decision(coordinator, task, ["motion-principles"])
    extra["selections"][0]["needs"] = []
    with pytest.raises(ValueError, match="declares no conditional prerequisite"):
        coordinator.propose(task, set(), classification=extra)
    assert not coordinator.state_dir.exists()


def test_schema_rejects_invalid_needs_declarations():
    caps = parse_capabilities(PACKAGE / "capabilities")
    rows = parse_router(PACKAGE / "ROUTER.md")
    assert validate_capabilities_and_router(caps, rows) == []

    def errors_with(capability, needs):
        broken = copy.deepcopy(caps)
        next(cap for cap in broken if cap.id == capability).needs = needs
        return validate_capabilities_and_router(broken, rows)

    need = lambda target: {"capability": target, "label": "only sometimes", "when": "a condition", "reason": "a reason"}
    assert any("needs unknown capability ghost" in e for e in errors_with("figma-design", [need("ghost")]))
    assert any("duplicate needs" in e for e in errors_with("figma-design", [need("work-map"), need("work-map")]))
    assert any("alternative or a conflict" in e for e in errors_with("gsap-scrolltrigger", [need("css-scroll")]))
    assert any("Cycle detected" in e for e in errors_with("visual-direction", [need("figma-design")]))


def test_malformed_needs_frontmatter_is_rejected(tmp_path):
    from muro import parse_capability
    text = (PACKAGE / "capabilities" / "figma-design.md").read_text(encoding="utf-8")
    start = text.index("needs: ")
    broken = text[:start] + 'needs: [{"capability":"visual-direction","when":""}]' + text[text.index("\n", start):]
    path = tmp_path / "figma-design.md"
    path.write_text(broken, encoding="utf-8")
    with pytest.raises(ValueError, match="each needs entry requires"):
        parse_capability(path)
    wordy = text.replace('"label": "only landing without outline"', '"label": "only for a landing page without outline"')
    assert wordy != text
    path.write_text(wordy, encoding="utf-8")
    with pytest.raises(ValueError, match="at most 5 words"):
        parse_capability(path)
    assert len(parse_capability(PACKAGE / "capabilities" / "figma-design.md").needs[0]["label"].split()) <= 5
