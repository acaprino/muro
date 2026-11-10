"""Pin gate: every source declares how its pinned commit is anchored.

`release` binds the commit to a published tag, `head` to the upstream HEAD,
`static` to a reviewed commit that follows nothing. Fixtures are local Git
repositories, one of them reached through a file:// URL to exercise the remote
branch; no network is contacted.
"""
import json
from pathlib import Path
import subprocess

import pytest

from muro import check_sources
from test_regressions import MIT

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture
def repo(tmp_path):
    """Two commits: the first carries tags v1.0.0 (lightweight) and v1.0.1 (annotated)."""
    root = tmp_path / "source"
    root.mkdir()

    def git(*args):
        return subprocess.run(["git", "-C", str(root), "-c", "user.name=Test",
                               "-c", "user.email=test@example.invalid", *args],
                              check=True, capture_output=True, text=True).stdout.strip()

    git("init", "-q")
    (root / "LICENSE").write_text(MIT, encoding="utf-8")
    (root / "SKILL.md").write_text("# Released", encoding="utf-8")
    git("add", ".")
    git("commit", "-qm", "release")
    released = git("rev-parse", "HEAD")
    git("tag", "v1.0.0")
    git("tag", "-a", "v1.0.1", "-m", "annotated release")
    (root / "SKILL.md").write_text("# Unreleased work", encoding="utf-8")
    git("commit", "-qam", "after the release")
    return root, released, git("rev-parse", "HEAD")


def errors(root, commit, remote=False, **fields):
    entry = {"id": "demo", "commit": commit, "license": "MIT",
             "selected_paths": ["SKILL.md"], "excluded_paths": []}
    entry["repo_url" if remote else "repo_path"] = root.as_uri() if remote else str(root)
    entry.update(fields)
    return check_sources({"sources": [entry]}, root.parent)


@pytest.mark.parametrize("remote", [False, True])
@pytest.mark.parametrize("tag", ["v1.0.0", "v1.0.1"])
def test_release_pin_accepts_the_tagged_commit_although_head_moved(repo, remote, tag):
    root, released, _ = repo
    assert errors(root, released, remote, pin="release", release=tag) == []


@pytest.mark.parametrize("remote", [False, True])
def test_release_pin_rejects_a_commit_that_is_not_the_tag(repo, remote):
    root, released, head = repo
    found = errors(root, head, remote, pin="release", release="v1.0.0")
    assert found and f"is not release v1.0.0 ({released})" in found[0]


@pytest.mark.parametrize("remote", [False, True])
def test_release_pin_rejects_an_unknown_tag(repo, remote):
    root, released, _ = repo
    found = errors(root, released, remote, pin="release", release="v9.9.9")
    assert found and "release v9.9.9 not found" in found[0]


@pytest.mark.parametrize("fields", [
    {"pin": "release"},
    {"pin": "release", "release": ""},
    {"pin": "release", "release": "--upload-pack=x"},
    {"pin": "release", "release": "v1..0"},
    {"pin": "release", "release": "v1.0.0^{}"},
    {"pin": "release", "release": "v1 0"},
])
def test_release_pin_needs_a_plain_tag_name(repo, fields):
    root, released, _ = repo
    found = errors(root, released, **fields)
    assert found and "release must be the published tag name" in found[0]


@pytest.mark.parametrize("mode", ["head", "static"])
def test_a_release_name_is_refused_outside_release_mode(repo, mode):
    root, _, head = repo
    found = errors(root, head, pin=mode, release="v1.0.0")
    assert found and "release is only allowed with pin release" in found[0]


@pytest.mark.parametrize("remote", [False, True])
def test_head_pin_follows_head_and_fails_when_it_moved(repo, remote):
    root, released, head = repo
    assert errors(root, head, remote, pin="head") == []
    found = errors(root, released, remote, pin="head")
    assert found and "does not match" in found[0] and "HEAD" in found[0]


@pytest.mark.parametrize("remote", [False, True])
def test_static_pin_accepts_a_reviewed_commit_behind_head(repo, remote):
    root, released, _ = repo
    assert errors(root, released, remote, pin="static") == []


def test_static_pin_still_needs_an_existing_commit(repo):
    root, _, _ = repo
    found = errors(root, "a" * 40, pin="static")
    assert found and "cannot verify pinned commit" in found[0]


@pytest.mark.parametrize("fields", [{}, {"pin": "latest"}, {"pin": None}, {"pin": ["head"]}])
def test_every_source_must_declare_its_pin_mode(repo, fields):
    root, _, head = repo
    found = errors(root, head, **fields)
    assert found and "pin must be one of release, head, static" in found[0]


def test_manifest_declares_a_mode_for_every_source():
    sources = json.loads((ROOT / "sources.json").read_text(encoding="utf-8"))["sources"]
    modes = {src["id"]: (src.get("pin"), src.get("release")) for src in sources}
    assert modes == {
        "taste-skill": ("release", "v2.5.1"),
        "wayfinder": ("release", "v1.3.2"),
        "ui-ux-pro-max": ("release", "v2.15.0"),
        "genoffice": ("release", "v0.12.852"),
        # These upstreams publish no release or tag: the owner follows their HEAD.
        "motion-design": ("head", None),
        "gsap-scrolltrigger": ("head", None),
        "ai-design-skills": ("head", None),
        "explain-this": ("head", None),
    }
