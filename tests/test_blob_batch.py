"""A source is read with a bounded number of Git processes, however many files it selects.

Each selected file used to cost one `git show` (about 0.2 s on the owner's Windows machine,
measured 2026-11-17), read twice by an intake preparation and twice by a build. A source
absorbed whole can hold over 1,600 files (taste-skill, ADR-0026): eleven minutes a build.
"""
import subprocess

import pytest

from muro import sources
from muro.factory import prepare_intake
from muro.sources import check_sources, read_blobs
from routing_helpers import copy_prompts
from test_license_path_gate import make_repo, manifest
from test_regressions import MIT

MANY = {"LICENSE": MIT, "SKILL.md": "# Demo\n", **{f"kit/part-{index:03d}.css": f".p{index}{{}}\n" for index in range(60)}}


def test_read_blobs_returns_the_exact_bytes_of_every_named_file(tmp_path):
    root, commit = make_repo(tmp_path, {"LICENSE": MIT, "a.md": "alpha\n", "dir/b.txt": "", "dir/c d.md": "with a space\n"})
    (root / "bin.dat").write_bytes(b"\x00\xff\n\n\x89PNG")
    subprocess.run(["git", "-C", str(root), "add", "."], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(root), "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                    "commit", "-qm", "binary"], check=True, capture_output=True)
    commit = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], check=True, capture_output=True, text=True).stdout.strip()
    blobs = read_blobs(root, commit, ["a.md", "dir/b.txt", "dir/c d.md", "bin.dat"])
    assert blobs == {"a.md": b"alpha\n", "dir/b.txt": b"", "dir/c d.md": b"with a space\n", "bin.dat": b"\x00\xff\n\n\x89PNG"}
    assert read_blobs(root, commit, []) == {}


def test_read_blobs_refuses_a_file_the_commit_does_not_hold(tmp_path):
    root, commit = make_repo(tmp_path, {"LICENSE": MIT, "a.md": "alpha\n"})
    with pytest.raises(ValueError, match="absent.md"):
        read_blobs(root, commit, ["a.md", "absent.md"])


def _count_git(monkeypatch):
    calls = []
    real = subprocess.run

    def counting(argv, *args, **kwargs):
        if argv and argv[0] == "git":
            calls.append(argv)
        return real(argv, *args, **kwargs)

    monkeypatch.setattr(sources.subprocess, "run", counting)
    return calls


def test_the_source_check_does_not_start_one_git_process_per_selected_file(tmp_path, monkeypatch):
    root, commit = make_repo(tmp_path, MANY)
    calls = _count_git(monkeypatch)
    assert check_sources(manifest(root, commit, selected_paths=["SKILL.md", "kit/**"]), tmp_path) == []
    assert len(calls) <= 8, len(calls)


def test_an_intake_preparation_does_not_start_one_git_process_per_selected_file(tmp_path, monkeypatch):
    root, commit = make_repo(tmp_path, MANY)
    src = {**manifest(root, commit, selected_paths=["SKILL.md", "kit/**"])["sources"][0], "intake": {"goal": "Absorb the kit"}}
    copy_prompts(tmp_path)
    calls = _count_git(monkeypatch)
    workbench = prepare_intake(src, tmp_path, tmp_path / "intake")
    assert len(list((workbench / "files" / "kit").iterdir())) == 60
    assert len(calls) <= 16, len(calls)
