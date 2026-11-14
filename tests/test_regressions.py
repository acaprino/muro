"""Regression tests for the source gate, parser and router contracts."""
import copy
import json
import subprocess
import shutil
import sys
from pathlib import Path

import pytest
from routing_helpers import INTENTS, ROUTER_HEADER, copy_prompts

from muro import RouterRow, build_release, check_sources, parse_router, validate_capabilities_and_router
from muro.routing import resolve_selection


MIT = '''MIT License

Copyright (c) 2026 Example

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
'''


def git(path, *args):
    return subprocess.run(["git", "-C", str(path), *args], check=True,
                          capture_output=True, text=True).stdout.strip()


@pytest.fixture
def repo(tmp_path):
    root = tmp_path / "source"
    root.mkdir()
    git(root, "init", "-q")
    (root / "LICENSE").write_text(MIT, encoding="utf-8")
    (root / "SKILL.md").write_text("# Skill", encoding="utf-8")
    (root / "references").mkdir()
    (root / "references" / "photo.png").write_bytes(b"not redistributed")
    git(root, "add", ".")
    git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "initial")
    return root, git(root, "rev-parse", "HEAD")


def source(root, commit, **changes):
    entry = {"id": "demo", "repo_path": str(root), "commit": commit, "pin": "head",
             "license": "MIT", "selected_paths": ["SKILL.md"], "excluded_paths": []}
    entry.update(changes)
    return {"sources": [entry]}


def test_remote_unknown_commit_and_license_fail_closed(tmp_path):
    entry = source(tmp_path, "a" * 40)["sources"][0]
    del entry["repo_path"]
    entry["repo_url"] = (tmp_path / "missing.git").as_uri()
    assert check_sources({"sources": [entry]}, tmp_path)


def test_remote_commit_fetch_and_glob_validate_files(repo, tmp_path):
    root, commit = repo
    entry = source(root, commit, selected_paths=["references/**"])["sources"][0]
    del entry["repo_path"]
    entry["repo_url"] = root.as_uri()
    errors = check_sources({"sources": [entry]}, tmp_path)
    assert any("photo.png" in error for error in errors)


def test_license_marker_alone_does_not_grant_mit(repo, tmp_path):
    root, _ = repo
    (root / "LICENSE").write_text("Permission is hereby granted, free of charge. No redistribution.", encoding="utf-8")
    git(root, "add", "LICENSE")
    git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "restricted")
    errors = check_sources(source(root, git(root, "rev-parse", "HEAD")), tmp_path)
    assert any("LICENSE" in error for error in errors)


def test_glob_matching_excluded_and_missing_paths_fails(repo, tmp_path):
    root, commit = repo
    errors = check_sources(source(root, commit, selected_paths=["SKILL.md"], excluded_paths=["SKILL.md"]), tmp_path)
    assert any("excluded" in error for error in errors)
    errors = check_sources(source(root, commit, selected_paths=["missing/**"]), tmp_path)
    assert any("missing" in error for error in errors)


def test_router_rejects_wrong_header_and_columns(tmp_path):
    router = tmp_path / "ROUTER.md"
    router.write_text("| id | when | role | after | outputs |\n|---|---|---|---|---|\n| x | a | b | — | c |\n", encoding="utf-8")
    with pytest.raises(ValueError, match="header"):
        parse_router(router)


def test_resolver_orders_shared_dependencies_without_mutating_input():
    rows = [RouterRow("b", "b", "—", "a", "b"),
            RouterRow("c", "c", "—", "b", "c"),
            RouterRow("a", "a", "—", "—", "a")]
    original = copy.deepcopy(rows)
    assert resolve_selection(rows, ["b", "c"], set(), set()) == ["a", "b", "c"]
    assert rows == original


@pytest.mark.parametrize("reverse", [False, True])
def test_explicit_selection_is_preserved_regardless_of_catalog_order(reverse):
    rows = [RouterRow("first", "analysis", "—", "—", "report"),
            RouterRow("second", "analysis", "—", "—", "report")]
    if reverse:
        rows.reverse()
    assert resolve_selection(rows, ["second"], set(), set()) == ["second"]


def test_router_validator_rejects_dangling_prerequisite(tmp_path):
    cap = tmp_path / "capabilities"
    cap.mkdir()
    (cap / "x.md").write_text('---\n' + INTENTS + 'id: x\nrole: testing\nwhen: "—"\nafter: ["missing"]\noutputs: ["x"]\nchecks: ["ok"]\n---\n## Sources\nSource: demo\n', encoding="utf-8")
    router = tmp_path / "ROUTER.md"
    router.write_text(ROUTER_HEADER + "| x | testing | — | missing | x | testing.verify |\n", encoding="utf-8")
    assert any("missing" in error for error in validate_capabilities_and_router(cap, router))


@pytest.fixture
def build_project(repo, tmp_path):
    root, commit = repo
    project = tmp_path / "project"
    project.mkdir()
    cap = project / "capabilities"
    cap.mkdir()
    (cap / "x.md").write_text('---\n' + INTENTS + 'id: x\nrole: testing\nwhen: "—"\nafter: []\noutputs: ["x"]\nchecks: ["ok"]\n---\n## Sources\nSource: demo\n', encoding="utf-8")
    (project / "ROUTER.md").write_text(ROUTER_HEADER + "| x | testing | — | — | x | testing.verify |\n", encoding="utf-8")
    copy_prompts(project)
    manifest = source(root, commit)
    manifest["plugin"] = {"slug": "muro", "name": "Muro", "command": "muro", "version": "0.1.0"}
    manifest["sources"][0]["copyright"] = "Copyright (c) 2026 Example"
    manifest["sources"][0]["intake"] = {"goal": "Extract deterministic test capability rules"}
    (project / "sources.json").write_text(json.dumps(manifest), encoding="utf-8")
    shutil.copytree(Path(__file__).resolve().parent.parent / "muro", project / "muro",
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    return project


def test_release_copies_verified_remote_license(build_project, tmp_path):
    manifest_path = build_project / "sources.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    source_path = Path(manifest["sources"][0].pop("repo_path"))
    manifest["sources"][0]["repo_url"] = source_path.as_uri()
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    result = build_release(manifest_path, build_project, tmp_path / "output")
    assert (result / "LICENSES" / "demo.txt").read_text(encoding="utf-8") == MIT


def test_release_never_deletes_existing_output(build_project, tmp_path):
    target = tmp_path / "output" / "muro"
    target.mkdir(parents=True)
    (target / "user-file.txt").write_text("keep", encoding="utf-8")
    with pytest.raises((ValueError, FileExistsError, RuntimeError)):
        build_release(build_project / "sources.json", build_project, tmp_path / "output")
    assert (target / "user-file.txt").read_text(encoding="utf-8") == "keep"


def test_unavailable_remote_aborts_before_release_output(build_project, tmp_path):
    manifest_path = build_project / "sources.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    del manifest["sources"][0]["repo_path"]
    manifest["sources"][0]["repo_url"] = (tmp_path / "missing.git").as_uri()
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises((ValueError, RuntimeError)):
        build_release(manifest_path, build_project, tmp_path / "output")
    assert not (tmp_path / "output" / "muro").exists()


def test_selected_file_with_disallowed_spdx_header_is_rejected(repo, tmp_path):
    root, _ = repo
    (root / "SKILL.md").write_text("<!-- SPDX-License-Identifier: GPL-3.0-only -->\n# Skill\n", encoding="utf-8")
    git(root, "add", "SKILL.md")
    git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "different license")
    assert check_sources(source(root, git(root, "rev-parse", "HEAD")), tmp_path)


@pytest.mark.parametrize("header", [
    "<!-- Copyright 2026 Example LLC. SPDX-License-Identifier: MIT -->",
    "/* SPDX-License-Identifier: MIT */",
    "# SPDX-License-Identifier: MIT",
])
def test_selected_file_with_matching_spdx_header_in_a_comment_is_accepted(repo, tmp_path, header):
    # EGM intake, 2026-11-14: google/elephant-goldfish-model closes its header
    # with "-->"; the closer was read as part of the identifier and refused.
    root, _ = repo
    (root / "SKILL.md").write_text(header + "\n# Skill\n", encoding="utf-8")
    git(root, "add", "SKILL.md")
    git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "same license")
    assert check_sources(source(root, git(root, "rev-parse", "HEAD")), tmp_path) == []


def test_reserved_slug_and_invalid_plugin_types_are_reported():
    from muro import validate_plugin_identity
    assert validate_plugin_identity({"slug": "help", "name": "Muro", "command": "muro", "version": "1"})
    assert validate_plugin_identity({"slug": 10, "name": "Muro", "command": "muro", "version": "1"})


def test_apache_release_carries_license_notice_and_modification(repo, build_project, tmp_path):
    root, _ = repo
    license_bytes = (Path(__file__).parent / "fixtures" / "apache-2.0.txt").read_bytes()
    (root / "LICENSE").write_bytes(license_bytes)
    (root / "NOTICE").write_text("Example upstream Apache attribution", encoding="utf-8")
    git(root, "add", "LICENSE", "NOTICE")
    git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "Apache")
    manifest_path = build_project / "sources.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["sources"][0]["commit"] = git(root, "rev-parse", "HEAD")
    manifest["sources"][0]["license"] = "Apache-2.0"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    result = build_release(manifest_path, build_project, tmp_path / "apache-output")
    assert (result / "LICENSES" / "demo.txt").read_bytes() == license_bytes
    assert "Example upstream Apache attribution" in (result / "NOTICE.md").read_text(encoding="utf-8")
    assert "Modified by Muro" in (result / "capabilities" / "x.md").read_text(encoding="utf-8")


def test_working_tree_license_changes_do_not_change_pinned_snapshot(repo, tmp_path):
    root, commit = repo
    (root / "LICENSE").write_text("This is not MIT", encoding="utf-8")
    assert check_sources(source(root, commit, repo_path=str(root.relative_to(tmp_path))), tmp_path) == []


def test_mit_license_with_added_restrictions_is_not_accepted(repo, tmp_path):
    root, _ = repo
    (root / "LICENSE").write_text(MIT.replace("Permission is hereby", "NO REDISTRIBUTION.\nPermission is hereby"), encoding="utf-8")
    git(root, "add", "LICENSE")
    git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "restricted")
    assert check_sources(source(root, git(root, "rev-parse", "HEAD")), tmp_path)


def test_frontmatter_delimiters_inside_quoted_value_are_not_separators(tmp_path):
    from muro import parse_capability
    file = tmp_path / "x.md"
    file.write_text('---\n' + INTENTS + 'id: x\nrole: testing\nwhen: "intent:foo---bar"\nafter: []\noutputs: ["x"]\nchecks: ["ok"]\n---\n## Sources\nSource: demo\n', encoding="utf-8")
    assert parse_capability(file).when == "intent:foo---bar"


def test_cli_build_and_existing_output_fail_safely(portable_project):
    script = Path(__file__).resolve().parent.parent / "muro_build.py"
    args = [sys.executable, str(script), "--manifest", str(portable_project / "sources.json"), "--build"]
    first = subprocess.run(args, capture_output=True, text=True)
    assert first.returncode == 0, first.stderr
    target = portable_project / "dist" / "muro"
    (target / "user-file.txt").write_text("keep", encoding="utf-8")
    second = subprocess.run(args, capture_output=True, text=True)
    assert second.returncode != 0
    assert (target / "user-file.txt").read_text(encoding="utf-8") == "keep"


def test_new_domain_roles_do_not_require_editing_python(tmp_path):
    cap = tmp_path / "capabilities"
    cap.mkdir()
    (cap / "x.md").write_text('---\n' + INTENTS + 'id: x\nrole: sql-analysis\nwhen: "—"\nafter: []\noutputs: ["x"]\nchecks: ["ok"]\n---\n## Sources\nSource: demo\n', encoding="utf-8")
    router = tmp_path / "ROUTER.md"
    router.write_text(ROUTER_HEADER + "| x | sql-analysis | — | — | x | testing.verify |\n", encoding="utf-8")
    assert validate_capabilities_and_router(cap, router) == []


def test_build_cannot_bypass_validation_with_stale_in_memory_rows(portable_project, tmp_path):
    from muro import parse_capabilities
    capabilities = parse_capabilities(portable_project / "capabilities")
    rows = parse_router(portable_project / "ROUTER.md")
    (portable_project / "ROUTER.md").write_text("bad router", encoding="utf-8")
    with pytest.raises(ValueError):
        build_release(portable_project / "sources.json", portable_project, tmp_path / "output", capabilities, rows)
    assert not (tmp_path / "output" / "muro").exists()
