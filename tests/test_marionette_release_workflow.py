"""Release decisions at the Muro / Marionette repository boundary."""
import json
import os
import runpy
import subprocess
import textwrap
from pathlib import Path

import pytest

from test_cli import git

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = "examples/marionette/sources.json"
WORKFLOW = ROOT / ".github/workflows/release-marionette.yml"


@pytest.fixture
def release_version():
    return runpy.run_path(str(ROOT / ".github/scripts/marionette_release.py"))["release_version"]


@pytest.fixture
def remotes(tmp_path, monkeypatch):
    factory, package = tmp_path / "muro", tmp_path / "marionette"
    for repo in (factory, package):
        repo.mkdir()
        git(repo, "init", "-q")
        git(repo, "commit", "-qm", "Empty repository", "--allow-empty")
    monkeypatch.chdir(factory)
    return [bundle_remote(repo) for repo in (factory, package)]


def bundle_remote(repo):
    # A real, read-only Git remote with no server, network or shell requirement.
    bundle = repo.with_suffix(".bundle")
    git(repo, "bundle", "create", str(bundle), "--all")
    return str(bundle)


def commit_manifest(version, note=""):
    path = Path(MANIFEST)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"plugin": {"version": version}, "note": note}), encoding="utf-8")
    git(".", "add", MANIFEST)
    git(".", "commit", "-qm", f"Manifest {version} {note}")
    return git(".", "rev-parse", "HEAD")


def test_push_compares_the_whole_range_and_ignores_non_version_edits(release_version, remotes, tmp_path):
    initial = commit_manifest("0.5.0")
    bump = commit_manifest("0.5.1")
    commit_manifest("0.5.1", "revised catalog")
    assert release_version(MANIFEST, initial, remotes) == "0.5.1"
    assert release_version(MANIFEST, bump, [str(tmp_path / "offline-remote")]) is None


def test_first_manifest_new_ref_and_manual_dispatch_can_build(release_version, remotes):
    before_manifest = git(".", "rev-parse", "HEAD")
    commit_manifest("0.5.1")
    for before in (before_manifest, "0" * 40, None):
        assert release_version(MANIFEST, before, remotes) == "0.5.1"


@pytest.mark.parametrize("repository", [0, 1], ids=["historical-factory-tag", "package-tag"])
def test_published_version_is_a_noop_for_push_and_manual_dispatch(release_version, remotes, repository):
    previous = commit_manifest("0.5.0")
    commit_manifest("0.5.1")
    repo = Path(remotes[repository]).with_suffix("")
    # An adjacent version may share the whole requested tag as a prefix.
    git(repo, "tag", "marionette-v0.5.10")
    bundle_remote(repo)
    assert release_version(MANIFEST, previous, remotes) == "0.5.1"
    git(repo, "tag", "marionette-v0.5.1")
    bundle_remote(repo)
    assert release_version(MANIFEST, previous, remotes) is None
    assert release_version(MANIFEST, None, remotes) is None


def test_unavailable_remote_fails_the_release_check(release_version, remotes, tmp_path):
    commit_manifest("0.5.1")
    with pytest.raises(subprocess.CalledProcessError):
        release_version(MANIFEST, None, [remotes[0], str(tmp_path / "absent-repository")])


def test_unreadable_push_base_does_not_authorize_a_release(release_version, remotes):
    commit_manifest("0.5.1")
    with pytest.raises(subprocess.CalledProcessError):
        release_version(MANIFEST, "1" * 40, remotes)


def test_invalid_version_cannot_add_an_actions_output(release_version, remotes):
    commit_manifest("0.5.1\nbuild=true")
    with pytest.raises((ValueError, subprocess.CalledProcessError)):
        release_version(MANIFEST, None, remotes)


def test_workflow_runs_the_planner_for_every_main_push_and_gates_publication():
    workflow = WORKFLOW.read_text(encoding="utf-8")
    triggers = workflow.split("\non:\n", 1)[1].split("\n\n", 1)[0]
    trigger_fields = [line.strip() for line in triggers.splitlines() if not line.lstrip().startswith("#")]
    assert {"push:", "branches: [main]", "workflow_dispatch:"} <= set(trigger_fields)
    assert not any(line.startswith(("paths:", "paths-ignore:")) for line in trigger_fields)
    plan, release = workflow.split("\n  release:\n", 1)
    assert "python3 .github/scripts/marionette_release.py" in plan
    assert "needs: plan" in release and "if: needs.plan.outputs.build == 'true'" in release
    assert "git push" in release and "MARIONETTE_DEPLOY_KEY" in release


@pytest.mark.skipif(os.name == "nt", reason="the publication step runs in Bash on the Linux Actions runner")
def test_replaying_the_publication_step_preserves_the_open_pr_head(tmp_path):
    workflow = WORKFLOW.read_text(encoding="utf-8")
    step = workflow.split("      - name: Push the build to the release branch\n", 1)[1]
    script = textwrap.dedent(step.split("        run: |\n", 1)[1].split("\n      - ", 1)[0])
    tag = "marionette-v0.5.1"
    branch = f"release/{tag}"
    remote = tmp_path / "remote.git"
    git(tmp_path, "init", "--bare", "--initial-branch=main", str(remote))
    initial = tmp_path / "initial"
    git(tmp_path, "clone", str(remote), str(initial))
    git(initial, "commit", "--allow-empty", "-qm", "Base")
    git(initial, "push", "origin", "main")
    staged = tmp_path / "release" / "marionette"
    staged.mkdir(parents=True)
    (staged / "sources.json").write_text('{"plugin":{"version":"0.5.1"}}', encoding="utf-8")
    # The adapters' own marketplaces, from which the step writes the repository's root ones with the
    # factory of the Muro checkout ($GITHUB_WORKSPACE).
    for relative, source in ((".claude-plugin/marketplace.json", "./"),
                             (".agents/plugins/marketplace.json", {"source": "local", "path": "./"})):
        host = "claude-code" if relative.startswith(".claude") else "codex"
        path = staged / "adapters" / host / relative
        path.parent.mkdir(parents=True)
        path.write_text(json.dumps({"name": "marionette", "plugins": [{"name": "marionette", "source": source}]}),
                        encoding="utf-8")
    (tmp_path / "muro").symlink_to(ROOT / "muro", target_is_directory=True)
    summary = tmp_path / "summary"
    env = dict(os.environ, GITHUB_REPOSITORY="acaprino/muro", GITHUB_SHA="a" * 40,
               PKG_TAG=tag, PKG_VERSION="0.5.1", MANIFEST=MANIFEST, RUNNER_TEMP=str(tmp_path),
               PACKAGE_REPOSITORY="acaprino/marionette", GITHUB_API_URL="https://github.invalid",
               GITHUB_WORKSPACE=str(tmp_path), GITHUB_STEP_SUMMARY=str(summary))
    # Git, staging, commits and pushes are real. Only the open PR's HTTP response is a fixture.
    response = """curl() { printf '[{"number":7}]'; }\n"""
    for attempt in ("first", "replay"):
        checkout = tmp_path / attempt
        git(tmp_path, "clone", str(remote), str(checkout))
        subprocess.run(["bash", "-e", "-o", "pipefail", "-c", response + script],
                       cwd=checkout, env=env, check=True)
        if attempt == "first":
            release_head = git(remote, "rev-parse", branch)
            assert git(remote, "show", f"{branch}:marionette/sources.json") == (staged / "sources.json").read_text()
            claude = json.loads(git(remote, "show", f"{branch}:.claude-plugin/marketplace.json"))
            codex = json.loads(git(remote, "show", f"{branch}:.agents/plugins/marketplace.json"))
            assert claude["plugins"][0]["source"] == "./marionette/adapters/claude-code"
            assert codex["plugins"][0]["source"]["path"] == "./marionette/adapters/codex"
    assert git(remote, "rev-parse", branch) == release_head
    assert "/pull/7" in summary.read_text()
