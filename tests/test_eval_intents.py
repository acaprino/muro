"""Authored expected operations must catch a valid route to the wrong operation."""
import copy
import json
from pathlib import Path
import shutil

import pytest

from muro.evals import prepare_eval, score_eval, validate_cases
from muro.sources import parse_capabilities


ROOT = Path(__file__).resolve().parent.parent
MARIONETTE = ROOT / "examples" / "marionette"


@pytest.fixture
def package(tmp_path):
    package = tmp_path / "package"
    package.mkdir()
    for name in ("ROUTER.md", "sources.json", "delivery.json"):
        shutil.copy2(MARIONETTE / name, package / name)
    for name in ("capabilities", "custom-instructions"):
        shutil.copytree(MARIONETTE / name, package / name)
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
    ("office-files", "office.format-conversion", "office.file-editing"),
    ("design-file-integration", "design-file.token-export", "design-file.code-checks"),
    ("design-file-inspection", "design-file.document-review", "design-file.interface-drift"),
])
def test_valid_but_wrong_intent_fails_rich_expectation(package, tmp_path, capability, correct, wrong):
    case = authored([selection(capability, correct)])
    result = score(package, tmp_path, case, [selection(capability, wrong)])
    assert result["passed"] == 0 and result["total"] == 1
    assert "error" not in result["failures"][0]  # The route is valid; its intended operation is wrong.
    assert result["failures"][0]["got"]["selections"][0]["intent"] == wrong


def test_legacy_capability_only_expectations_remain_supported(package, tmp_path):
    case = authored([selection("office-files", "office.format-conversion")], rich=False)
    result = score(package, tmp_path, case, [selection("office-files", "office.file-editing")])
    assert result["passed"] == 1


def test_repeated_operation_intents_are_compared_in_order(package, tmp_path):
    gold = [selection("office-files", "office.file-editing", step_id="office-files#1"),
            selection("office-files", "office.format-conversion", step_id="office-files#2")]
    result = score(package, tmp_path, authored(gold), list(reversed(gold)))
    assert result["passed"] == 0
    assert result["failures"][0]["got"]["capabilities"] == ["office-files", "office-files"]


def test_equivalent_step_labels_do_not_change_operation_meaning(package, tmp_path):
    gold = [selection("office-files", "office.file-editing", step_id="office-files#1"),
            selection("office-files", "office.format-conversion", step_id="office-files#2")]
    actual = [{**gold[0], "step_id": "office-files#7"}, {**gold[1], "step_id": "office-files#9"}]
    assert score(package, tmp_path, authored(gold), actual)["passed"] == 1


def test_semantic_need_judgment_is_not_hidden_by_matching_capabilities(package, tmp_path):
    gold = [selection("aesthetic-direction", "ui.aesthetic-direction"),
            selection("ui-prototype", "ui.interactive-prototype",
                      needs=[{"requires": "aesthetic-direction", "applies": True}])]
    actual = copy.deepcopy(gold)
    actual[1]["needs"][0]["applies"] = False
    result = score(package, tmp_path, authored(gold), actual)
    assert result["passed"] == 0 and "error" not in result["failures"][0]


def test_true_need_refers_to_the_expected_repeated_occurrence(package, tmp_path):
    gold = [selection("aesthetic-direction", "ui.aesthetic-direction", step_id="aesthetic-direction#1"),
            selection("aesthetic-direction", "ui.aesthetic-direction", step_id="aesthetic-direction#2"),
            selection("ui-prototype", "ui.interactive-prototype",
                      needs=[{"requires": "aesthetic-direction#2", "applies": True}])]
    actual = copy.deepcopy(gold)
    actual[0]["step_id"] = "aesthetic-direction#4"
    actual[1]["step_id"] = "aesthetic-direction#8"
    actual[2]["needs"][0]["requires"] = "aesthetic-direction#8"
    assert score(package, tmp_path, authored(gold), actual)["passed"] == 1
    actual[2]["needs"][0]["requires"] = "aesthetic-direction#4"
    assert score(package, tmp_path, authored(gold), actual)["passed"] == 0


@pytest.mark.parametrize("gold,fragment", [
    ([selection("office-files", "not.an.intent")], "Unknown intent"),
    ([selection("office-files", "office.file-editing"),
      selection("office-files", "office.format-conversion")], "Duplicate capability"),
    ([selection("ui-prototype", "ui.interactive-prototype")], "conditional prerequisites"),
    ([selection("ui-prototype", "ui.interactive-prototype",
                needs=[{"requires": "aesthetic-direction", "applies": "false"}])], "boolean applies"),
    ([selection("ui-prototype", "ui.interactive-prototype",
                needs=[{"requires": "aesthetic-direction", "applies": True}])], "not selected"),
    ([selection("ui-prototype", "ui.interactive-prototype",
                needs=[{"requires": "aesthetic-direction", "applies": True}]),
      selection("aesthetic-direction", "ui.aesthetic-direction")], "before it"),
])
def test_invalid_rich_gold_is_rejected_before_classifier_material(package, tmp_path, gold, fragment):
    write_case(package, authored(gold))
    target = tmp_path / "must-not-exist"
    with pytest.raises(ValueError, match=fragment):
        prepare_eval(package, target)
    assert not target.exists()


@pytest.mark.parametrize("gold,stack,fragment", [
    ([selection("visual-direction", "ui.visual-direction"),
      selection("aesthetic-direction", "ui.aesthetic-direction")], [], "conflict"),
    ([selection("css-scroll", "ui.scroll-animation")], [], "stack"),
])
def test_unexecutable_rich_gold_uses_runtime_graph_validation(package, tmp_path, gold, stack, fragment):
    write_case(package, authored(gold, stack=stack))
    with pytest.raises(ValueError, match=f"(?i){fragment}"):
        prepare_eval(package, tmp_path / "must-not-exist")
    assert not (tmp_path / "must-not-exist").exists()


@pytest.mark.parametrize("invalid", [None, {}, [None], [{"capability": "office-files"}],
                                        [{"capability": "office-files", "intent": "office.file-editing", "needs": {}}]])
def test_malformed_rich_gold_returns_validation_errors(invalid):
    case = authored([selection("office-files", "office.file-editing")])
    case["expect"]["selections"] = invalid
    assert validate_cases({"cases": [case]}, parse_capabilities(MARIONETTE / "capabilities"))


def test_gold_selections_cannot_disagree_with_legacy_capability_list(package, tmp_path):
    case = authored([selection("office-files", "office.file-editing")])
    case["expect"]["capabilities"] = ["office-authoring"]
    write_case(package, case)
    with pytest.raises(ValueError, match="match the ordered capabilities"):
        prepare_eval(package, tmp_path / "prepared")


def test_marionette_gold_covers_abstention_and_operation_boundaries():
    cases = json.loads((MARIONETTE / "eval-cases.json").read_text(encoding="utf-8"))["cases"]
    by_id = {case["id"]: case for case in cases}
    assert any(case["expect"]["status"] == "needs_clarification" for case in cases)
    assert by_id["docx-to-pdf"]["expect"]["selections"][0]["intent"] == "office.format-conversion"
    assert by_id["zsd-export-tokens"]["expect"]["selections"][0]["intent"] == "design-file.token-export"
    assert by_id["design-inspect-file-not-live-ui"]["expect"]["selections"][0]["intent"] == "design-file.document-review"
    assert by_id["deep-chat-veto"]["expect"]["status"] == "no_match"
    caps = {cap.id: cap for cap in parse_capabilities(MARIONETTE / "capabilities")}
    for case in cases:
        if any(len(caps[name].intents) > 1 or caps[name].needs for name in case["expect"]["capabilities"]):
            assert "selections" in case["expect"], case["id"]


def test_explicit_alternate_route_accepts_a_separate_fetch_but_not_wrong_operations(package, tmp_path):
    canonical = [selection("paper-search", "research.literature-search"),
                 selection("html-explanation", "explanation.html-page")]
    separate_fetch = [selection("paper-search", "research.literature-search", step_id="paper-search#1"),
                      selection("paper-search", "research.paper-reading", step_id="paper-search#2"),
                      selection("html-explanation", "explanation.html-page")]
    case = authored(canonical)
    case["alternatives"] = [authored(separate_fetch)["expect"]]
    assert score(package, tmp_path, case, canonical)["passed"] == 1
    assert score(package, tmp_path, case, separate_fetch)["passed"] == 1
    wrong = [selection("paper-search", "research.paper-reading"), canonical[1]]
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
    assert score(package, tmp_path, case, [selection("text-humanize", "writing.humanize-prose")])["passed"] == 0


@pytest.mark.parametrize("alternatives", [
    [], {}, [None], [{"status": "selected"}],
    [{"status": "no_match", "capabilities": [], "alternatives": []}],
    [{"status": "selected", "capabilities": ["office-files"],
      "selections": [{"capability": "office-files", "intent": "*"}]}],
])
def test_malformed_or_nested_alternatives_are_rejected_before_preparation(package, tmp_path, alternatives):
    case = authored([selection("office-files", "office.format-conversion")])
    case["alternatives"] = alternatives
    write_case(package, case)
    with pytest.raises(ValueError):
        prepare_eval(package, tmp_path / "must-not-exist")
    assert not (tmp_path / "must-not-exist").exists()


@pytest.mark.parametrize("rich", [False, True])
def test_alternative_graph_is_validated_even_when_the_canonical_route_is_valid(package, tmp_path, rich):
    case = authored([selection("office-files", "office.format-conversion")])
    case["alternatives"] = [authored([selection("visual-direction", "ui.visual-direction"),
                                      selection("aesthetic-direction", "ui.aesthetic-direction")], rich=rich)["expect"]]
    write_case(package, case)
    with pytest.raises(ValueError, match="(?i)alternative 1.*conflict"):
        prepare_eval(package, tmp_path / "must-not-exist")
    assert not (tmp_path / "must-not-exist").exists()
