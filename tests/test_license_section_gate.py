"""License gate: multi-section LICENSE files with a declared approved section (ADR-0038)."""
import json
from pathlib import Path
import subprocess

import pytest

from muro import build_release, check_sources
from muro.sources import copyright_notices
from test_license_path_gate import make_repo, manifest
from test_regressions import MIT

DUAL_LICENSE = (
    "Two licences apply in this repository.\n\n"
    "1. The skill and scripts (everything except library/):\n\n"
    + MIT
    + "\n2. The library builds:\n\n"
    "Copyright (c) 2026 Proprietary Owner. All rights reserved.\n"
    "You may not redistribute the builds.\n"
)

SECTION = {
    "start": "MIT License",
    "end": "SOFTWARE.",
    "reason": "Section 1 (MIT) covers skills/demo/SKILL.md; section 2 covers excluded library builds.",
}

REPO_FILES = {
    "LICENSE": DUAL_LICENSE,
    "skills/demo/SKILL.md": "# Demo skill\n",
    "library/build.md": "# Proprietary build\n",
}


def test_dual_license_passes_with_declared_section(tmp_path):
    root, commit = make_repo(tmp_path, REPO_FILES)
    m = manifest(root, commit, license_section=SECTION, excluded_paths=["library/**"])
    assert check_sources(m, tmp_path) == []


def test_dual_license_fails_without_declared_section(tmp_path):
    root, commit = make_repo(tmp_path, REPO_FILES)
    errors = check_sources(manifest(root, commit), tmp_path)
    assert errors and "does not match" in errors[0]


def test_modified_mit_inside_declared_section_still_fails(tmp_path):
    tampered = DUAL_LICENSE.replace("without restriction", "with restriction")
    root, commit = make_repo(tmp_path, {**REPO_FILES, "LICENSE": tampered})
    errors = check_sources(manifest(root, commit, license_section=SECTION), tmp_path)
    assert errors and "does not match" in errors[0]


@pytest.mark.parametrize("bad", [
    {},
    {"start": "MIT License", "end": "IN THE SOFTWARE."},
    {"start": "", "end": "IN THE SOFTWARE.", "reason": "empty start"},
    {"start": "MIT License", "end": "   ", "reason": "blank end"},
    {"start": "MIT License", "end": "IN THE SOFTWARE.", "reason": ""},
    {"start": "MIT License", "end": "IN THE SOFTWARE.", "reason": "ok", "extra": "nope"},
    "MIT License",
])
def test_malformed_license_section_fails_closed(tmp_path, bad):
    root, commit = make_repo(tmp_path, REPO_FILES)
    errors = check_sources(manifest(root, commit, license_section=bad), tmp_path)
    assert errors and "license_section must be" in errors[0]


def test_missing_or_ambiguous_section_markers_fail_closed(tmp_path):
    root, commit = make_repo(tmp_path, REPO_FILES)
    missing_start = {**SECTION, "start": "NOT PRESENT"}
    errors = check_sources(manifest(root, commit, license_section=missing_start), tmp_path)
    assert errors and "license_section.start must match uniquely" in errors[0]

    ambiguous_end = {**SECTION, "end": "Copyright"}
    errors = check_sources(manifest(root, commit, license_section=ambiguous_end), tmp_path)
    assert errors and "license_section.end must match uniquely" in errors[0]


def test_copyright_notices_reads_only_declared_section():
    notices = copyright_notices(DUAL_LICENSE.encode("utf-8"), "MIT", SECTION)
    assert notices == ["Copyright (c) 2026 Example"]


def test_release_ships_verbatim_license_and_mit_only_notice(portable_project, tmp_path):
    manifest_path = portable_project / "sources.json"
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    source = data["sources"][0]
    repo = Path(source["repo_path"])

    def git(*args):
        return subprocess.run(["git", "-C", str(repo), *args], check=True,
                              capture_output=True, text=True).stdout.strip()

    (repo / "LICENSE").write_text(DUAL_LICENSE, encoding="utf-8")
    git("add", "LICENSE")
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "dual license")
    source.update(commit=git("rev-parse", "HEAD"), license="MIT", license_section=SECTION)
    manifest_path.write_text(json.dumps(data), encoding="utf-8")

    result = build_release(manifest_path, portable_project, tmp_path / "out")
    assert (result / "LICENSES" / "demo.txt").read_text(encoding="utf-8") == DUAL_LICENSE
    notice = (result / "NOTICE.md").read_text(encoding="utf-8")
    assert "Copyright (c) 2026 Example" in notice
    assert "Proprietary Owner" not in notice

