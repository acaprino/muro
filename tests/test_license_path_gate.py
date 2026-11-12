"""License gate: a source whose license file sits inside the selected folder.

Some repositories carry no root LICENSE and license each skill folder on its
own. `license_path` names that file. It covers only the files under its folder,
its text is verified like a root license, and a deeper license still needs
review.
"""
import json
from pathlib import Path
import subprocess

import pytest

from muro import build_release, check_sources
from test_regressions import MIT

APACHE = (Path(__file__).parent / "fixtures" / "apache-2.0.txt").read_text(encoding="utf-8")
FILLED_APACHE = APACHE.replace("Copyright [yyyy] [name of copyright owner]", "Copyright 2026 Example, PBC.")


def make_repo(tmp_path, files):
    root = tmp_path / "source"
    root.mkdir()

    def git(*args):
        return subprocess.run(["git", "-C", str(root), *args], check=True,
                              capture_output=True, text=True).stdout.strip()

    git("init", "-q")
    for name, text in files.items():
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
    git("add", ".")
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture")
    return root, git("rev-parse", "HEAD")


def manifest(root, commit, **changes):
    entry = {"id": "demo", "repo_path": str(root), "commit": commit, "pin": "head", "license": "MIT",
             "selected_paths": ["skills/demo/SKILL.md"], "excluded_paths": []}
    entry.update(changes)
    return {"sources": [entry]}


FOLDER_LICENSED = {"README.md": "# Repository without a root license",
                   "skills/demo/LICENSE.txt": MIT, "skills/demo/SKILL.md": "# Demo",
                   "skills/other/SKILL.md": "# Other, not covered"}


def test_license_inside_the_skill_folder_passes_when_declared(tmp_path):
    root, commit = make_repo(tmp_path, FOLDER_LICENSED)
    assert check_sources(manifest(root, commit, license_path="skills/demo/LICENSE.txt"), tmp_path) == []


def test_undeclared_folder_license_still_needs_a_root_license(tmp_path):
    root, commit = make_repo(tmp_path, FOLDER_LICENSED)
    errors = check_sources(manifest(root, commit), tmp_path)
    assert errors and "root LICENSE missing" in errors[0]


def test_selected_paths_must_sit_under_the_declared_license_folder(tmp_path):
    root, commit = make_repo(tmp_path, FOLDER_LICENSED)
    for selected in (["skills/other/SKILL.md"], ["skills/demo/SKILL.md", "README.md"], ["skills/**"]):
        errors = check_sources(manifest(root, commit, license_path="skills/demo/LICENSE.txt",
                                        selected_paths=selected), tmp_path)
        assert errors and "outside the folder covered by license_path" in errors[0], selected


def test_declared_license_must_match_the_approved_text(tmp_path):
    files = {**FOLDER_LICENSED, "skills/demo/LICENSE.txt": "All rights reserved. No redistribution."}
    root, commit = make_repo(tmp_path, files)
    errors = check_sources(manifest(root, commit, license_path="skills/demo/LICENSE.txt"), tmp_path)
    assert errors and "does not match" in errors[0]


@pytest.mark.parametrize("value", ["../LICENSE", "/abs/LICENSE", "skills/*/LICENSE.txt", "skills\\demo\\LICENSE.txt",
                                   "skills/demo/MISSING.txt", "skills/demo", "", 42, None])
def test_unsafe_or_missing_license_path_fails_closed(tmp_path, value):
    root, commit = make_repo(tmp_path, FOLDER_LICENSED)
    errors = check_sources(manifest(root, commit, license_path=value), tmp_path)
    assert errors and "license_path" in errors[0]


def test_deeper_license_below_the_declared_one_requires_review(tmp_path):
    files = {**FOLDER_LICENSED, "skills/demo/vendor/LICENSE": MIT, "skills/demo/vendor/part.md": "# Vendored"}
    root, commit = make_repo(tmp_path, files)
    errors = check_sources(manifest(root, commit, license_path="skills/demo/LICENSE.txt",
                                    selected_paths=["skills/demo/vendor/part.md"]), tmp_path)
    assert errors and "nested LICENSE requires review" in errors[0]
    # Declaring the deeper license itself is the reviewed, explicit choice.
    assert check_sources(manifest(root, commit, license_path="skills/demo/vendor/LICENSE",
                                  selected_paths=["skills/demo/vendor/part.md"]), tmp_path) == []


@pytest.mark.parametrize("name", ["LICENSE", "LICENSE.txt", "LICENSE.md", "LICENCE", "COPYING"])
def test_folder_license_under_a_root_license_is_never_silently_inherited(tmp_path, name):
    root, commit = make_repo(tmp_path, {"LICENSE": MIT, f"sub/{name}": MIT, "sub/file.md": "# Sub",
                                        "top.md": "# Top"})
    errors = check_sources(manifest(root, commit, selected_paths=["sub/file.md"]), tmp_path)
    assert errors and "nested LICENSE requires review" in errors[0]
    assert check_sources(manifest(root, commit, selected_paths=["top.md"]), tmp_path) == []
    assert check_sources(manifest(root, commit, selected_paths=["sub/file.md"],
                                  license_path=f"sub/{name}"), tmp_path) == []


def test_explicit_root_license_path_is_the_default_behaviour(tmp_path):
    root, commit = make_repo(tmp_path, {"LICENSE": MIT, "SKILL.md": "# Skill"})
    assert check_sources(manifest(root, commit, selected_paths=["SKILL.md"], license_path="LICENSE"), tmp_path) == []
    assert check_sources(manifest(root, commit, selected_paths=["SKILL.md"]), tmp_path) == []


def test_release_ships_the_declared_license_and_the_notice_beside_it(portable_project, tmp_path):
    manifest_path = portable_project / "sources.json"
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    source = data["sources"][0]
    repo = Path(source["repo_path"])

    def git(*args):
        return subprocess.run(["git", "-C", str(repo), *args], check=True,
                              capture_output=True, text=True).stdout.strip()

    git("rm", "-q", "LICENSE", "SKILL.md")
    (repo / "NOTICE").write_text("Root notice that belongs to other folders", encoding="utf-8")
    folder = repo / "skills" / "demo"
    folder.mkdir(parents=True)
    (folder / "LICENSE.txt").write_text(FILLED_APACHE, encoding="utf-8")
    (folder / "NOTICE").write_text("Notice shipped beside the folder license", encoding="utf-8")
    (folder / "SKILL.md").write_text("# Demo", encoding="utf-8")
    git("add", ".")
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "folder license")
    source.update(commit=git("rev-parse", "HEAD"), license="Apache-2.0",
                  license_path="skills/demo/LICENSE.txt", selected_paths=["skills/demo/SKILL.md"])
    manifest_path.write_text(json.dumps(data), encoding="utf-8")

    result = build_release(manifest_path, portable_project, tmp_path / "out")
    assert (result / "LICENSES" / "demo.txt").read_text(encoding="utf-8") == FILLED_APACHE
    notice = (result / "NOTICE.md").read_text(encoding="utf-8")
    assert "Copyright 2026 Example, PBC." in notice
    assert "Notice shipped beside the folder license" in notice
    assert "Root notice that belongs to other folders" not in notice
    # A packaged source SKILL.md is stored as SKILL.source.md (live host runs, 2026-11-12).
    assert (result / "scripts" / "demo" / "SKILL.source.md").read_text(encoding="utf-8") == "# Demo"
