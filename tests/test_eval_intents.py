"""Authored expected operations must catch a valid route to the wrong operation."""
import copy
import json
import shutil

import pytest

from muro.evals import prepare_eval, score_eval, validate_cases
from muro.sources import parse_capabilities
from routing_helpers import FIXTURE, ROOT


@pytest.fixture
def package(tmp_path):
    package = tmp_path / "package"
    package.mkdir()
    for name in ("ROUTER.md", "sources.json", "delivery.json"):
        shutil.copy2(FIXTURE / name, package / name)
    for name in ("capabilities", "custom-instructions"):
        shutil.copytree(FIXTURE / name, package / name)
    shutil.copytree(ROOT / "prompts", package / "prompts")
    return package


def selection(capability, intent, **extra):
    return {"capability": capability, "intent": intent, **extra}


def authored(selections, *, task="The user requests these operations in this order.", stack=(), rich=True):
    expect = {"status": "selected", "capabilities": [s["capability"] for s in selections]}
    if rich:
        expect["selections"] = selections
    return {"id": "operation-case", "task": task, "stack_tokens": list(stack), "expect": expect}


def write_case(package, case):
    (package / "eval-cases.json").write_text(json.dumps({"cases": [case]}), encoding="utf-8")


def score(package, tmp_path, case, selections, *, status="selected"):
    write_case(package, case)
    prepared = prepare_eval(package, tmp_path / "prepared")
    contexts = json.loads((prepared / "contexts.json").read_text(encoding="utf-8"))
    key, context = next(iter(contexts.items()))
    actual = copy.deepcopy(selections)
    for s in actual:
        s["reason"] = "Independent model explanation, not the gold's words."
        for need in s.get("needs", []):
            need["reason"] = "This judgment follows from the stated task."
    route = {**context, "status": status, "selections": actual, "reason": "Model route.",
             "questions": ["Which permitted outcome do you want?"] if status == "needs_clarification" else []}
    decisions = tmp_path / "decisions.json"
    decisions.write_text(json.dumps({"decisions": {key: route}}), encoding="utf-8")
    return score_eval(package, decisions)


@pytest.mark.parametrize("capability,correct,wrong", [
    ("manuscript-files", "files.conversion", "files.editing"),
    ("manuscript-files", "files.extraction", "files.conversion"),
    ("story-brief", "story.angle", "story.brief"),
])
def test_valid_but_wrong_intent_fails_rich_expectation(package, tmp_path, capability, correct, wrong):
    case = authored([selection(capability, correct)])
    result = score(package, tmp_path, case, [selection(capability, wrong)])
    assert result["passed"] == 0 and result["total"] == 1
    assert "error" not in result["failures"][0]  # The route is valid; its intended operation is wrong.
    assert result["failures"][0]["got"]["selections"][0]["intent"] == wrong


def test_legacy_capability_only_expectations_remain_supported(package, tmp_path):
    case = authored([selection("manuscript-files", "files.conversion")], rich=False)
    result = score(package, tmp_path, case, [selection("manuscript-files", "files.editing")])
    assert result["passed"] == 1


def test_repeated_operation_intents_are_compared_in_order(package, tmp_path):
    gold = [selection("manuscript-files", "files.editing", step_id="manuscript-files#1"),
            selection("manuscript-files", "files.conversion", step_id="manuscript-files#2")]
    result = score(package, tmp_path, authored(gold), list(reversed(gold)))
    assert result["passed"] == 0
    assert result["failures"][0]["got"]["capabilities"] == ["manuscript-files", "manuscript-files"]


def test_equivalent_step_labels_do_not_change_operation_meaning(package, tmp_path):
    gold = [selection("manuscript-files", "files.editing", step_id="manuscript-files#1"),
            selection("manuscript-files", "files.conversion", step_id="manuscript-files#2")]
    actual = [{**gold[0], "step_id": "manuscript-files#7"}, {**gold[1], "step_id": "manuscript-files#9"}]
    assert score(package, tmp_path, authored(gold), actual)["passed"] == 1


def test_semantic_need_judgment_is_not_hidden_by_matching_capabilities(package, tmp_path):
    gold = [selection("story-brief", "story.brief"),
            selection("newsletter-edition", "story.newsletter-edition",
                      needs=[{"requires": "story-brief", "applies": True}])]
    actual = copy.deepcopy(gold)
    actual[1]["needs"][0]["applies"] = False
    result = score(package, tmp_path, authored(gold), actual)
    assert result["passed"] == 0 and "error" not in result["failures"][0]


def test_true_need_refers_to_the_expected_repeated_occurrence(package, tmp_path):
    gold = [selection("story-brief", "story.brief", step_id="story-brief#1"),
            selection("story-brief", "story.brief", step_id="story-brief#2"),
            selection("newsletter-edition", "story.newsletter-edition",
                      needs=[{"requires": "story-brief#2", "applies": True}])]
    actual = copy.deepcopy(gold)
    actual[0]["step_id"] = "story-brief#4"
    actual[1]["step_id"] = "story-brief#8"
    actual[2]["needs"][0]["requires"] = "story-brief#8"
    assert score(package, tmp_path, authored(gold), actual)["passed"] == 1
    actual[2]["needs"][0]["requires"] = "story-brief#4"
    assert score(package, tmp_path, authored(gold), actual)["passed"] == 0


@pytest.mark.parametrize("gold,fragment", [
    ([selection("manuscript-files", "not.an.intent")], "Unknown intent"),
    ([selection("manuscript-files", "files.editing"),
      selection("manuscript-files", "files.conversion")], "Duplicate capability"),
    ([selection("newsletter-edition", "story.newsletter-edition")], "conditional prerequisites"),
    ([selection("newsletter-edition", "story.newsletter-edition",
                needs=[{"requires": "story-brief", "applies": "false"}])], "boolean applies"),
    ([selection("newsletter-edition", "story.newsletter-edition",
                needs=[{"requires": "story-brief", "applies": True}])], "not selected"),
    ([selection("newsletter-edition", "story.newsletter-edition",
                needs=[{"requires": "story-brief", "applies": True}]),
      selection("story-brief", "story.brief")], "before it"),
])
def test_invalid_rich_gold_is_rejected_before_classifier_material(package, tmp_path, gold, fragment):
    write_case(package, authored(gold))
    target = tmp_path / "must-not-exist"
    with pytest.raises(ValueError, match=fragment):
        prepare_eval(package, target)
    assert not target.exists()


@pytest.mark.parametrize("gold,stack,fragment", [
    ([selection("series-concept", "story.series-concept"),
      selection("story-brief", "story.brief")], [], "conflict"),
    ([selection("scroll-build-css", "story.scroll-build")], [], "stack"),
])
def test_unexecutable_rich_gold_uses_runtime_graph_validation(package, tmp_path, gold, stack, fragment):
    write_case(package, authored(gold, stack=stack))
    with pytest.raises(ValueError, match=f"(?i){fragment}"):
        prepare_eval(package, tmp_path / "must-not-exist")
    assert not (tmp_path / "must-not-exist").exists()


@pytest.mark.parametrize("invalid", [None, {}, [None], [{"capability": "manuscript-files"}],
                                        [{"capability": "manuscript-files", "intent": "files.editing", "needs": {}}]])
def test_malformed_rich_gold_returns_validation_errors(invalid):
    case = authored([selection("manuscript-files", "files.editing")])
    case["expect"]["selections"] = invalid
    assert validate_cases({"cases": [case]}, parse_capabilities(FIXTURE / "capabilities"))


def test_gold_selections_cannot_disagree_with_legacy_capability_list(package, tmp_path):
    case = authored([selection("manuscript-files", "files.editing")])
    case["expect"]["capabilities"] = ["fact-check"]
    write_case(package, case)
    with pytest.raises(ValueError, match="match the ordered capabilities"):
        prepare_eval(package, tmp_path / "prepared")


def test_explicit_alternate_route_accepts_a_separate_fetch_but_not_wrong_operations(package, tmp_path):
    canonical = [selection("manuscript-files", "files.extraction"),
                 selection("fact-check", "story.fact-check")]
    separate_fetch = [selection("manuscript-files", "files.extraction", step_id="manuscript-files#1"),
                      selection("manuscript-files", "files.conversion", step_id="manuscript-files#2"),
                      selection("fact-check", "story.fact-check")]
    case = authored(canonical)
    case["alternatives"] = [authored(separate_fetch)["expect"]]
    assert score(package, tmp_path, case, canonical)["passed"] == 1
    assert score(package, tmp_path, case, separate_fetch)["passed"] == 1
    wrong = [selection("manuscript-files", "files.conversion"), canonical[1]]
    failed = score(package, tmp_path, case, wrong)
    assert failed["passed"] == 0
    assert failed["failures"][0]["expected"] == case["expect"]
    assert failed["failures"][0]["alternatives"] == case["alternatives"]
    assert score(package, tmp_path, case, [], status="no_match")["passed"] == 0


def test_explicit_abstention_alternative_does_not_permit_partial_execution(package, tmp_path):
    case = {"id": "blocked-outcome", "task": "Both outcomes are essential; one is unsupported.", "stack_tokens": [],
            "expect": {"status": "no_match", "capabilities": [], "selections": []},
            "alternatives": [{"status": "needs_clarification", "capabilities": [], "selections": []}]}
    assert score(package, tmp_path, case, [], status="no_match")["passed"] == 1
    assert score(package, tmp_path, case, [], status="needs_clarification")["passed"] == 1
    assert score(package, tmp_path, case, [selection("fact-check", "story.fact-check")])["passed"] == 0


@pytest.mark.parametrize("alternatives", [
    [], {}, [None], [{"status": "selected"}],
    [{"status": "no_match", "capabilities": [], "alternatives": []}],
    [{"status": "selected", "capabilities": ["manuscript-files"],
      "selections": [{"capability": "manuscript-files", "intent": "*"}]}],
])
def test_malformed_or_nested_alternatives_are_rejected_before_preparation(package, tmp_path, alternatives):
    case = authored([selection("manuscript-files", "files.conversion")])
    case["alternatives"] = alternatives
    write_case(package, case)
    with pytest.raises(ValueError):
        prepare_eval(package, tmp_path / "must-not-exist")
    assert not (tmp_path / "must-not-exist").exists()


@pytest.mark.parametrize("rich", [False, True])
def test_alternative_graph_is_validated_even_when_the_canonical_route_is_valid(package, tmp_path, rich):
    case = authored([selection("manuscript-files", "files.conversion")])
    case["alternatives"] = [authored([selection("series-concept", "story.series-concept"),
                                      selection("story-brief", "story.brief")], rich=rich)["expect"]]
    write_case(package, case)
    with pytest.raises(ValueError, match="(?i)alternative 1.*conflict"):
        prepare_eval(package, tmp_path / "must-not-exist")
    assert not (tmp_path / "must-not-exist").exists()
