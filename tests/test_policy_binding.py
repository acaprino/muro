"""Permanent delivery instructions bind classification, evidence and routing evals."""
import hashlib
import json

import pytest

from muro.evals import prepare_eval, score_eval
from muro.guide import write_release_guide
from muro.routing import catalog_digest
from muro.runtime import Coordinator
from routing_helpers import response
from test_release_guide import read_guide


POLICY = "Confirm the complete scope before minimizing changes.\nPreserve required checks."
REVISED_POLICY = "Confirm the complete scope before minimizing changes.\nAlso record remaining gaps."


def write_policy(project, text):
    document = {
        "decisions": [{
            "source": "demo", "content": "Scope and completeness guidance", "form": "always-on",
            "targets": [], "reason": "This policy applies throughout the selected procedure.",
        }],
        "always_on": text,
    }
    (project / "delivery.json").write_text(json.dumps(document), encoding="utf-8")


def write_cases(project):
    (project / "eval-cases.json").write_text(json.dumps({"cases": [{
        "id": "verify", "task": "Verify artifact", "stack_tokens": [],
        "expect": {"status": "selected", "capabilities": ["x"]},
    }]}), encoding="utf-8")


def test_packages_without_delivery_keep_the_prior_digest():
    # Literal previous wire payload: absence of delivery must not invalidate existing maps.
    legacy = b'{"bodies": {}, "catalog": [], "checks": {}, "prompt": "Classify the requested task."}'
    assert catalog_digest([], {}, "Classify the requested task.") == hashlib.sha256(legacy).hexdigest()


def test_changed_policy_rejects_old_decision_and_evidence_without_writes(portable_project, tmp_path):
    write_policy(portable_project, POLICY)
    consumer = tmp_path / "consumer"
    coordinator = Coordinator(portable_project, consumer)
    task = "Verify artifact"
    decision = response(coordinator.propose(task, set()), ["x"])
    plan = coordinator.propose(task, set(), new=True, classification=decision)
    step = coordinator.confirm(task, plan["plan"], set(), classification=decision)
    coordinator.record({"x": "Existing verification artifact"}, step["map_id"], step["capability"])
    original_state = coordinator.state_path.read_bytes()

    write_policy(portable_project, REVISED_POLICY)
    revised = Coordinator(portable_project, consumer)
    with pytest.raises(ValueError, match="catalog_digest"):
        revised.propose(task, set(), classification=decision)
    with pytest.raises(ValueError, match="outdated catalog_digest"):
        revised.resume()
    assert revised.state_path.read_bytes() == original_state


def test_eval_receives_exact_policy_and_matches_runtime_and_guide_binding(portable_project, tmp_path):
    write_cases(portable_project)
    manifest = json.loads((portable_project / "sources.json").read_text(encoding="utf-8"))
    old_digest = None
    decisions_path = tmp_path / "decisions.json"
    for policy in (POLICY, REVISED_POLICY):
        write_policy(portable_project, policy)
        coordinator = Coordinator(portable_project, tmp_path / "consumer")
        request = coordinator.propose("Verify artifact", set())
        prepared = prepare_eval(portable_project, tmp_path / "prepared")
        assert policy in (prepared / "PROMPT.md").read_text(encoding="utf-8")
        contexts = json.loads((prepared / "contexts.json").read_text(encoding="utf-8"))
        assert contexts["verify"] == request["context"]
        _, guide = read_guide(write_release_guide(portable_project, manifest["plugin"], manifest["sources"]))
        assert guide.payload["catalog_digest"] == coordinator.digest
        if old_digest is None:
            old_digest = coordinator.digest
            decisions_path.write_text(json.dumps({"decisions": {"verify": response(request, ["x"])}}), encoding="utf-8")
            assert score_eval(portable_project, decisions_path)["passed"] == 1
        else:
            assert coordinator.digest != old_digest
            report = score_eval(portable_project, decisions_path)
            assert report["passed"] == 0
            assert "catalog_digest" in report["failures"][0]["error"]


def test_eval_rejects_invalid_delivery_before_writing_material(portable_project, tmp_path):
    write_cases(portable_project)
    write_policy(portable_project, "")
    output = tmp_path / "prepared"
    with pytest.raises(ValueError, match="Invalid delivery"):
        prepare_eval(portable_project, output)
    assert not output.exists()
