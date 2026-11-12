"""A transformed original is not shipped (ADR-0016 amendment of 2026-11-12).

`selected_paths` are what the intake AI reads. Until now every selected file was also
packaged under `scripts/<source-id>/`, so a file whose content had been restated in
capability bodies, or dropped, still travelled in the release with nothing reading it.
`intake_only_paths` is the AI's declaration that a selected file is evidence only.
Python removes it from the package and rejects a capability that points at it; it
never decides which files those are.
"""
import json
import subprocess

import pytest

from muro import build_release
from muro.factory import prepare_intake, unpackaged_reference_errors
from muro.sources import check_sources, inspect_source

HOSTS = ("claude-code", "codex", "pi", "opencode", "hermes")


@pytest.fixture
def project(portable_project, tmp_path):
    """The portable fixture plus a second selected file, `prompt.md`, that the package marks as intake only."""
    repo = tmp_path / "repo"
    (repo / "prompt.md").write_text("# A prompt whose rules were restated in capability bodies", encoding="utf-8")
    (repo / "notes").mkdir()
    (repo / "notes" / "a.md").write_text("note", encoding="utf-8")

    def git(*args):
        return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True).stdout.strip()

    git("add", ".")
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "prompt")
    update(portable_project, commit=git("rev-parse", "HEAD"), selected_paths=["SKILL.md", "prompt.md", "notes/**"],
           intake_only_paths=["prompt.md"])
    return portable_project


def update(project, **fields):
    path = project / "sources.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    manifest["sources"][0].update(fields)
    path.write_text(json.dumps(manifest), encoding="utf-8")
    return manifest


def source(project):
    return json.loads((project / "sources.json").read_text(encoding="utf-8"))["sources"][0]


def test_an_intake_only_file_is_read_at_intake_and_absent_from_the_release(project, tmp_path):
    workbench = prepare_intake(source(project), project, tmp_path / "intake")
    assert (workbench / "files" / "prompt.md").is_file()          # the intake AI still reads it
    release = build_release(project / "sources.json", project, tmp_path / "out")
    roots = [release] + [release / "adapters" / host / "skills" / "muro" for host in HOSTS]
    for root in roots:
        helpers = root / "scripts" / "demo"
        assert (helpers / "SKILL.source.md").is_file() and (helpers / "notes" / "a.md").is_file()
        assert not (helpers / "prompt.md").exists()
    # The source is still credited: its text shaped the capabilities.
    assert "demo" in (release / "NOTICE.md").read_text(encoding="utf-8")
    assert (release / "LICENSES" / "demo.txt").is_file()


def test_a_pattern_marks_every_file_it_matches(project, tmp_path):
    update(project, intake_only_paths=["notes/**"])
    release = build_release(project / "sources.json", project, tmp_path / "out")
    assert (release / "scripts" / "demo" / "prompt.md").is_file()
    assert not (release / "scripts" / "demo" / "notes").exists()


def test_without_the_field_every_selected_file_is_packaged_as_before(project, tmp_path):
    manifest = json.loads((project / "sources.json").read_text(encoding="utf-8"))
    del manifest["sources"][0]["intake_only_paths"]
    (project / "sources.json").write_text(json.dumps(manifest), encoding="utf-8")
    release = build_release(project / "sources.json", project, tmp_path / "out")
    assert (release / "scripts" / "demo" / "prompt.md").is_file()


@pytest.mark.parametrize("value, message", [
    ("prompt.md", "intake_only_paths must be a list"),
    (["../prompt.md"], "unsafe source path or pattern"),
    (["absent.md"], "intake_only_paths matched no selected file: absent.md"),
    # LICENSE exists in the repository but was never selected, so there is nothing to keep out of the package.
    (["LICENSE"], "intake_only_paths matched no selected file: LICENSE"),
])
def test_the_declaration_is_checked_against_the_selection(project, value, message):
    manifest = update(project, intake_only_paths=value)
    with pytest.raises(ValueError, match=message):
        inspect_source(manifest["sources"][0], project)
    assert any(message in error for error in check_sources(manifest, project))


@pytest.mark.parametrize("intake_only", [[], ["notes/**"]], ids=["packaged", "intake-only"])
@pytest.mark.parametrize("defect, message", [
    ("nested-license", "nested LICENSE requires review"),
    ("conflicting-spdx", "conflicting SPDX license"),
    ("invalid-utf8", "not UTF-8 text"),
])
def test_selected_files_keep_license_and_text_checks_when_intake_only_is_declared(
        project, tmp_path, intake_only, defect, message):
    repo = tmp_path / "repo"
    selected = repo / "notes" / "a.md"
    if defect == "nested-license":
        (repo / "notes" / "LICENSE").write_bytes((repo / "LICENSE").read_bytes())
    elif defect == "conflicting-spdx":
        selected.write_text("<!-- SPDX-License-Identifier: GPL-3.0-only -->\n# Note\n", encoding="utf-8")
    else:
        selected.write_bytes(b"# Note\n\xff")

    def git(*args):
        return subprocess.run(["git", "-C", str(repo), *args], check=True,
                              capture_output=True, text=True).stdout.strip()

    git("add", ".")
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "source defect fixture")
    manifest = update(project, commit=git("rev-parse", "HEAD"), intake_only_paths=intake_only)

    with pytest.raises(ValueError, match=message):
        inspect_source(manifest["sources"][0], project)
    assert any(message in error for error in check_sources(manifest, project))


def test_a_capability_cannot_point_at_a_file_the_release_does_not_carry(project, tmp_path):
    cap = project / "capabilities" / "x.md"
    text = cap.read_text(encoding="utf-8")
    cap.write_text(text.replace("## Sources", "Read `<package_root>/scripts/demo/prompt.md` first.\n## Sources"),
                   encoding="utf-8")
    with pytest.raises(ValueError, match="scripts/demo/prompt.md is read at intake only and is not packaged"):
        build_release(project / "sources.json", project, tmp_path / "out")
    assert not (tmp_path / "out" / "muro").exists()


def test_reference_check_names_the_capability_and_ignores_packaged_files():
    class Cap:
        id, body = "x", "Use `<package_root>/scripts/demo/notes/a.md` and `<package_root>/scripts/demo/prompt.md`."

    assert unpackaged_reference_errors([Cap], "demo", ["prompt.md"]) == [
        "Capability x: scripts/demo/prompt.md is read at intake only and is not packaged"]
    assert unpackaged_reference_errors([Cap], "demo", []) == []


def test_the_delivery_prompt_tells_the_ai_when_an_original_travels():
    from pathlib import Path
    rules = (Path(__file__).resolve().parent.parent / "prompts" / "delivery.md").read_text(encoding="utf-8")
    assert "intake_only_paths" in rules and "needs it at run time" in rules
