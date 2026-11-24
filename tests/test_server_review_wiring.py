"""Where the server review is asked for: `validate` accepts a package without it, the unattended harmonization and the
build do not, and an unattended step is told to write it. Fixtures only (made-up names); the checks themselves are in
tests/test_server_review.py."""
import json

import pytest

from muro.agent import _NO_OWNER
from muro.cli import _captured, _run_validate


def _declare_a_server(project, *, review=None):
    """A package with one shipped server of the source `demo`, and optionally its review."""
    manifest = json.loads((project / "sources.json").read_text(encoding="utf-8"))
    document = {
        "decisions": [
            {"source": "demo", "content": "The skill", "form": "capability", "targets": ["x"], "reason": "A procedure."},
            {"source": "demo", "content": "The server it calls", "form": "mcp-server", "targets": ["x"],
             "reason": "Its tools are called by the skill."}],
        "mcp_servers": [{"name": "stub", "source": "demo", "run": ["python", "<package_root>/scripts/demo/SKILL.source.md"]}]}
    if review is not None:
        document["server_review"] = review
    (project / "delivery.json").write_text(json.dumps(document), encoding="utf-8")
    return manifest


def _review(commit):
    return {"judged_on": {"demo": commit},
            "tools": [{"id": "stub/lookup", "source": "demo", "kind": "server-tool", "effect": "none",
                       "basis": "Reads a local catalog (fixture).", "alone": "No other tool looks anything up.",
                       "fate": "registered", "decided_by": "ai", "reason": "The server stays registered as it is."}],
            "pairs": []}


def _validate(project, manifest, **options):
    return _captured(lambda: _run_validate(manifest, project, **options))


def test_validate_accepts_a_package_with_servers_and_no_review(portable_project):
    manifest = _declare_a_server(portable_project)
    code, text = _validate(portable_project, manifest)
    assert code == 0, text


def test_the_unattended_harmonization_is_told_about_a_missing_review_while_it_can_repair_it(portable_project):
    manifest = _declare_a_server(portable_project)
    code, text = _validate(portable_project, manifest, release=True)
    assert code == 1 and "server_review" in text


def test_a_review_judged_on_the_pinned_commit_passes_the_release_validation(portable_project):
    manifest = _declare_a_server(portable_project)
    commit = manifest["sources"][0]["commit"]
    _declare_a_server(portable_project, review=_review(commit))
    code, text = _validate(portable_project, manifest, release=True)
    assert code == 0, text


def test_a_review_judged_on_another_commit_is_refused_by_the_release_validation(portable_project):
    manifest = _declare_a_server(portable_project)
    _declare_a_server(portable_project, review=_review("0" * 40))
    code, text = _validate(portable_project, manifest, release=True)
    assert code == 1 and "judge again" in text


def test_a_package_without_servers_is_the_same_under_the_release_validation(portable_project):
    manifest = json.loads((portable_project / "sources.json").read_text(encoding="utf-8"))
    (portable_project / "delivery.json").write_text(json.dumps({"decisions": [
        {"source": "demo", "content": "The skill", "form": "capability", "targets": ["x"], "reason": "A procedure."}]}),
        encoding="utf-8")
    assert _validate(portable_project, manifest, release=True)[0] == 0


def test_the_unattended_contract_tells_the_harmonizer_to_write_the_review_and_leaves_the_owners_keys_alone():
    assert "server_review" in _NO_OWNER and "`registered`" in _NO_OWNER
    assert "package_server" in _NO_OWNER and "server_choice" in _NO_OWNER


def test_the_unattended_contract_also_covers_a_file_that_already_holds_a_package_server():
    # The owner's answer stands, so the review has to agree with the package server the file already declares.
    assert "already holds one" in _NO_OWNER
    for fate in ("`served`", "`left-out`", "`command`", "`decided_by` `owner`"):
        assert fate in _NO_OWNER, fate
