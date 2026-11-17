"""Declared third-party notices (ADR-0025).

A prebuilt file can embed code under other licenses than the verified one, and
the license gate cannot see inside it. `notice_paths` names the selected file
that lists those notices: it must ship, and the aggregated NOTICE points at it.
Nothing is inferred from a file name.
"""
import json
from pathlib import Path
import subprocess

import pytest

from muro import build_release, check_sources
from test_license_path_gate import make_repo, manifest
from test_regressions import MIT

BUNDLED = {"LICENSE": MIT, "SKILL.md": "# Demo", "tools/bundle.mjs": "export const bundled = true;\n",
           "THIRD_PARTY_NOTICES.md": "# Third-party notices\n\n## lib 1.0.0 (Apache-2.0)\n",
           "docs/OTHER_NOTICES.md": "# Notices nobody selected\n"}
SELECTED = ["SKILL.md", "tools/bundle.mjs", "THIRD_PARTY_NOTICES.md"]


def test_declared_notice_file_passes_when_it_is_selected(tmp_path):
    root, commit = make_repo(tmp_path, BUNDLED)
    assert check_sources(manifest(root, commit, selected_paths=SELECTED,
                                  notice_paths=["THIRD_PARTY_NOTICES.md"]), tmp_path) == []
    # The field is optional: a source without it behaves as before.
    assert check_sources(manifest(root, commit, selected_paths=SELECTED), tmp_path) == []
    assert check_sources(manifest(root, commit, selected_paths=SELECTED, notice_paths=[]), tmp_path) == []


def test_a_notice_file_is_never_guessed_from_its_name(portable_project, tmp_path):
    result = _build_with_bundle(portable_project, tmp_path, declare=False)
    # The file still travels as a selected helper, but the aggregated notice claims nothing about it.
    assert (result / "scripts" / "demo" / "THIRD_PARTY_NOTICES.md").is_file()
    assert "Third-party notices" not in (result / "NOTICE.md").read_text(encoding="utf-8")


def test_declared_notice_must_be_a_selected_file_that_ships(tmp_path):
    root, commit = make_repo(tmp_path, BUNDLED)
    errors = check_sources(manifest(root, commit, selected_paths=SELECTED,
                                    notice_paths=["docs/OTHER_NOTICES.md"]), tmp_path)
    assert errors and "notice_paths entry is not a selected file: docs/OTHER_NOTICES.md" in errors[0]
    errors = check_sources(manifest(root, commit, selected_paths=SELECTED, notice_paths=["MISSING.md"]), tmp_path)
    assert errors and "notice_paths entry is not a selected file" in errors[0]
    # A file read at intake only is not packaged, so it cannot be the notice the release points at.
    errors = check_sources(manifest(root, commit, selected_paths=SELECTED, notice_paths=["THIRD_PARTY_NOTICES.md"],
                                    intake_only_paths=["THIRD_PARTY_NOTICES.md"]), tmp_path)
    assert errors and "read at intake only and would not ship" in errors[0]


@pytest.mark.parametrize("value", ["THIRD_PARTY_NOTICES.md", 42, None, [42], ["../NOTICES.md"], ["/abs/NOTICES.md"],
                                   ["*.md"], ["docs\\NOTICES.md"], [""],
                                   ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"]])
def test_unsafe_or_malformed_notice_paths_fail_closed(tmp_path, value):
    root, commit = make_repo(tmp_path, BUNDLED)
    errors = check_sources(manifest(root, commit, selected_paths=SELECTED, notice_paths=value), tmp_path)
    assert errors and "notice_paths" in errors[0]


def _build_with_bundle(portable_project, tmp_path, declare):
    manifest_path = portable_project / "sources.json"
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    source = data["sources"][0]
    repo = Path(source["repo_path"])

    def git(*args):
        return subprocess.run(["git", "-C", str(repo), *args], check=True,
                              capture_output=True, text=True).stdout.strip()

    (repo / "tools").mkdir()
    (repo / "tools" / "bundle.mjs").write_text(BUNDLED["tools/bundle.mjs"], encoding="utf-8")
    (repo / "THIRD_PARTY_NOTICES.md").write_text(BUNDLED["THIRD_PARTY_NOTICES.md"], encoding="utf-8")
    git("add", ".")
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "bundle with notices")
    source.update(commit=git("rev-parse", "HEAD"), selected_paths=SELECTED)
    if declare:
        source["notice_paths"] = ["THIRD_PARTY_NOTICES.md"]
    manifest_path.write_text(json.dumps(data), encoding="utf-8")
    return build_release(manifest_path, portable_project, tmp_path / "out")


def test_release_ships_the_declared_notice_and_the_aggregated_notice_points_at_it(portable_project, tmp_path):
    result = _build_with_bundle(portable_project, tmp_path, declare=True)
    packaged = result / "scripts" / "demo" / "THIRD_PARTY_NOTICES.md"
    assert packaged.read_text(encoding="utf-8") == BUNDLED["THIRD_PARTY_NOTICES.md"]
    notice = (result / "NOTICE.md").read_text(encoding="utf-8")
    assert "- demo — MIT (see LICENSES/demo.txt)" in notice
    assert "Third-party notices for material included in this source: scripts/demo/THIRD_PARTY_NOTICES.md" in notice
    # Every standalone host skill carries the same aggregated notice and the file it points at.
    copies = list((result / "adapters").rglob("NOTICE.md"))
    assert copies
    for copy in copies:
        assert "scripts/demo/THIRD_PARTY_NOTICES.md" in copy.read_text(encoding="utf-8")
        assert (copy.parent / "scripts" / "demo" / "THIRD_PARTY_NOTICES.md").is_file()
