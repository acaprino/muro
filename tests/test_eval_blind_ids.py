"""Prepared eval IDs hide routing hints without invalidating legacy decisions."""
import json
import re

import pytest

from muro.evals import prepare_eval, score_eval


@pytest.fixture
def prepared_eval(portable_project, tmp_path):
    cases = [
        {"id": "select-verifier-not-unsupported", "task": "Verify artifact", "stack_tokens": [],
         "expect": {"status": "selected", "capabilities": ["x"]}, "why": "Private author explanation"},
        {"id": "unsupported-do-not-verify", "task": "An unsupported outcome", "stack_tokens": [],
         "expect": {"status": "no_match", "capabilities": []}},
    ]
    (portable_project / "eval-cases.json").write_text(json.dumps({"cases": cases}), encoding="utf-8")
    output = prepare_eval(portable_project, tmp_path / "prepared")
    contexts = json.loads((output / "contexts.json").read_text(encoding="utf-8"))
    by_task = {context["task"]: (identifier, context) for identifier, context in contexts.items()}
    verify_id, verify = by_task["Verify artifact"]
    other_id, other = by_task["An unsupported outcome"]
    decisions = {
        verify_id: {**verify, "status": "selected", "selections": [
            {"capability": "x", "intent": "testing.verify", "reason": "Authored test decision."}],
            "reason": "Verify the artifact.", "questions": []},
        other_id: {**other, "status": "no_match", "selections": [],
                   "reason": "No fixture capability supplies this outcome.", "questions": []},
    }
    legacy = {cases[0]["id"]: decisions[verify_id], cases[1]["id"]: decisions[other_id]}
    return portable_project, output, cases, decisions, legacy


def score(project, tmp_path, decisions):
    path = tmp_path / "decisions.json"
    path.write_text(json.dumps({"decisions": decisions}), encoding="utf-8")
    return score_eval(project, path)


def test_prepared_ids_are_blind_deterministic_and_independent_of_case_order(prepared_eval):
    project, output, cases, _, _ = prepared_eval
    original = {path.name: path.read_bytes() for path in output.iterdir()}
    assert set(original) == {"PROMPT.md", "contexts.json"}
    contexts = json.loads(original["contexts.json"])
    assert len(contexts) == len(cases)
    assert all(re.fullmatch(r"case_[0-9a-f]+", identifier) for identifier in contexts)
    for content in original.values():
        text = content.decode("utf-8")
        assert all(case["id"] not in text for case in cases)
        assert '"expect"' not in text
        assert "Private author explanation" not in text
    assert all(set(context) == {"task", "stack_tokens", "catalog_digest"} for context in contexts.values())
    prepare_eval(project, output)
    assert {path.name: path.read_bytes() for path in output.iterdir()} == original
    (project / "eval-cases.json").write_text(json.dumps({"cases": list(reversed(cases))}), encoding="utf-8")
    prepare_eval(project, output)
    assert json.loads((output / "contexts.json").read_text(encoding="utf-8")) == contexts


def test_opaque_and_legacy_decisions_score_identically(prepared_eval, tmp_path):
    project, _, _, decisions, legacy = prepared_eval
    report = score(project, tmp_path, decisions)
    assert report["passed"] == report["total"] == 2
    assert report["failures"] == []
    assert score(project, tmp_path, legacy) == report


@pytest.mark.parametrize("namespace", ["opaque", "legacy"])
def test_partial_decisions_keep_authored_ids_in_missing_case_reports(prepared_eval, tmp_path, namespace):
    project, _, cases, decisions, legacy = prepared_eval
    submitted = decisions if namespace == "opaque" else legacy
    submitted.pop(next(reversed(submitted)))
    report = score(project, tmp_path, submitted)
    assert report["passed"] == 1
    assert report["failures"] == [{"id": cases[1]["id"], "expected": cases[1]["expect"],
                                   "error": "no decision for this case"}]


@pytest.mark.parametrize("variant", ["mixed", "duplicate-alias", "unknown-opaque", "unknown-legacy"])
def test_mixed_and_unknown_namespaces_are_rejected(prepared_eval, tmp_path, variant):
    project, _, _, decisions, legacy = prepared_eval
    opaque_id, decision = next(iter(decisions.items()))
    legacy_id = next(iter(legacy))
    if variant == "mixed":
        submitted = {opaque_id: decision, next(reversed(legacy)): legacy[next(reversed(legacy))]}
    elif variant == "duplicate-alias":
        submitted = {**decisions, legacy_id: decision}
    elif variant == "unknown-opaque":
        submitted = {**decisions, "case_deadbeef": decision}
    else:
        submitted = {**legacy, "unknown-case": decision}
    with pytest.raises(ValueError, match="one known namespace"):
        score(project, tmp_path, submitted)


def test_known_opaque_id_cannot_bind_another_cases_context(prepared_eval, tmp_path):
    project, _, cases, decisions, _ = prepared_eval
    first, second = list(decisions)
    decisions[first], decisions[second] = decisions[second], decisions[first]
    report = score(project, tmp_path, decisions)
    assert report["passed"] == 0
    assert {failure["id"] for failure in report["failures"]} == {case["id"] for case in cases}
    assert all("task" in failure["error"] for failure in report["failures"])


def test_reordering_cases_preserves_existing_opaque_decisions(prepared_eval, tmp_path):
    project, _, cases, decisions, _ = prepared_eval
    (project / "eval-cases.json").write_text(json.dumps({"cases": list(reversed(cases))}), encoding="utf-8")
    assert score(project, tmp_path, decisions)["passed"] == 2
