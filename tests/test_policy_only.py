"""An explicitly declared session policy needs no fabricated executable capability."""
import json
from pathlib import Path
import subprocess
import sys

import pytest

from muro.core import parse_router, validate_capabilities_and_router
from muro.guide import write_release_guide
from muro.release import build_release
from muro.runtime import Coordinator
from routing_helpers import ROUTER_HEADER, response
from test_release_guide import read_guide


ROOT = Path(__file__).resolve().parent.parent
POLICY = "Establish the full requested scope before minimizing the change."
HOSTS = ("claude-code", "codex", "pi", "opencode", "hermes")


@pytest.fixture
def policy_project(portable_project):
    (portable_project / "capabilities" / "x.md").unlink()
    (portable_project / "ROUTER.md").write_text(
        "# Policy package\n\n" + ROUTER_HEADER
        + "\nThe selected source supplies session guidance, without an on-demand procedure.\n",
        encoding="utf-8",
    )
    manifest_path = portable_project / "sources.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["plugin"].update(slug="policy-guide", command="policy-guide", name="Policy Guide")
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    document = {
        "decisions": [{
            "source": "demo", "content": "Scope and completeness guidance", "form": "always-on",
            "targets": [], "reason": "Guides every task without producing a separate artifact.",
        }],
        "always_on": POLICY,
    }
    (portable_project / "delivery.json").write_text(json.dumps(document), encoding="utf-8")
    return portable_project


def test_empty_catalog_still_fails_without_explicit_permission():
    assert validate_capabilities_and_router([], []) == ["no capabilities provided", "no router rows provided"]


def test_policy_only_package_validates_through_the_cli(policy_project, tmp_path):
    result = subprocess.run(
        [sys.executable, str(ROOT / "muro_build.py"), "--manifest", str(policy_project / "sources.json"), "--validate"],
        cwd=tmp_path, capture_output=True, text=True, encoding="utf-8",
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize("missing_directory", [False, True])
def test_policy_only_release_has_no_fabricated_capability(policy_project, tmp_path, missing_directory):
    if missing_directory:
        (policy_project / "capabilities").rmdir()
    release = build_release(policy_project / "sources.json", policy_project, tmp_path / "release")
    assert parse_router(release / "ROUTER.md") == []
    assert list((release / "capabilities").iterdir()) == []
    text, guide = read_guide(release / "GUIDE.html")
    assert guide.payload["capabilities"] == []
    assert guide.payload["examples"][0]["status"] == "no_match"
    assert guide.payload["examples"][0]["path"] == []
    assert POLICY in text
    for host in HOSTS:
        adapter = release / "adapters" / host
        skill = adapter / "skills" / "policy-guide"
        assert skill.is_dir()
        assert list(adapter.rglob("SKILL.md")) == []
        assert list((skill / "capabilities").iterdir()) == []
        assert (skill / "GUIDE.html").read_bytes() == (release / "GUIDE.html").read_bytes()
        for _ in range(2):
            result = subprocess.run([sys.executable, str(skill / "muro.py"), "session-context"], cwd=tmp_path,
                                    capture_output=True, text=True, encoding="utf-8")
            assert result.returncode == 0, result.stderr
            assert result.stdout.strip() == POLICY
        result = subprocess.run(
            [sys.executable, str(skill / "muro.py"), "plan", "--task", "Make the requested change", "--compact", "--brief"],
            cwd=tmp_path, capture_output=True, text=True, encoding="utf-8",
        )
        assert result.returncode == 0, result.stderr
        request = json.loads(result.stdout)
        assert request["mode"] == "classification-required"
        assert request["catalog"] == []
        decision_path = tmp_path / "no-match.json"
        decision_path.write_text(json.dumps(response(request, [], "no_match")), encoding="utf-8")
        result = subprocess.run(
            [sys.executable, str(skill / "muro.py"), "plan", "--task", "Make the requested change",
             "--classification", str(decision_path)],
            cwd=tmp_path, capture_output=True, text=True, encoding="utf-8",
        )
        assert result.returncode == 0, result.stderr
        assert json.loads(result.stdout)["mode"] == "no_match"
        assert not (tmp_path / ".policy-guide").exists()


def test_policy_only_runtime_requires_ai_and_accepts_no_match_without_state(policy_project, tmp_path):
    coordinator = Coordinator(policy_project, tmp_path / "consumer")
    for task in ("Make the requested change", "Continue the requested change"):
        request = coordinator.propose(task, set())
        assert request["mode"] == "classification-required"
        assert request["catalog"] == []
        result = coordinator.propose(task, set(), classification=response(request, [], "no_match"))
        assert result["mode"] == "no_match"
        assert not coordinator.state_dir.exists()


@pytest.mark.parametrize("kind", ["absent", "dropped", "missing-text", "unknown-source", "invalid-target"])
def test_empty_package_without_valid_always_on_still_fails(policy_project, tmp_path, kind):
    path = policy_project / "delivery.json"
    document = json.loads(path.read_text(encoding="utf-8"))
    if kind == "absent":
        path.unlink()
    else:
        if kind == "dropped":
            document.pop("always_on")
            document["decisions"][0]["form"] = "dropped"
        elif kind == "missing-text":
            document.pop("always_on")
        elif kind == "unknown-source":
            document["decisions"][0]["source"] = "unknown"
        else:
            document["decisions"][0]["targets"] = ["fabricated"]
        path.write_text(json.dumps(document), encoding="utf-8")
    with pytest.raises(ValueError, match="Invalid (router|delivery)"):
        build_release(policy_project / "sources.json", policy_project, tmp_path / "release")
    manifest = json.loads((policy_project / "sources.json").read_text(encoding="utf-8"))
    with pytest.raises(ValueError, match="Invalid guide (catalog|delivery)"):
        write_release_guide(policy_project, manifest["plugin"], manifest["sources"])
    assert not (tmp_path / "release" / "policy-guide").exists()


def test_policy_only_release_keeps_required_authored_examples(policy_project, tmp_path):
    (policy_project / "guide-examples.json").write_text('{"examples": []}', encoding="utf-8")
    with pytest.raises(ValueError, match="nonempty examples"):
        build_release(policy_project / "sources.json", policy_project, tmp_path / "release")
    assert not (tmp_path / "release" / "policy-guide").exists()
