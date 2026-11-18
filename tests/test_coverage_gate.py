"""A source cannot be checked or released with a file its method names left out and unexplained (ADR-0026).

Evidence alone did not stop the taste-skill intake: the gap was written down twice and shipped.
The source check and the build now refuse an unselected file that a selected file names unless
the intake AI declared it in `omissions` with a reason. Python checks that the declaration
exists and matches; whether the reason is good is the AI's and the owner's judgment.
"""
import json
from pathlib import Path
import subprocess

import pytest

from muro import build_release, check_sources
from muro.factory import prepare_intake
from muro.scaffold import scaffold_package
from routing_helpers import copy_prompts
from test_license_path_gate import make_repo, manifest
from test_regressions import MIT

FILES = {
    "LICENSE": MIT,
    "SKILL.md": "# Demo\nRun `node scripts/gate.mjs` when done. Copy the stylesheets from assets/kit/.\n",
    "scripts/gate.mjs": "// gate\n",
    "assets/kit/a.css": "a{}\n",
    "assets/kit/b.css": "b{}\n",
    "tests/test_gate.mjs": "// the source's own test, named by nothing selected\n",
}
EVERYTHING = ["SKILL.md", "scripts/gate.mjs", "assets/kit/**"]


def errors_for(tmp_path, **changes):
    root, commit = make_repo(tmp_path, FILES)
    return check_sources(manifest(root, commit, **{"selected_paths": ["SKILL.md"], **changes}), tmp_path)


def test_a_named_file_left_out_without_a_declaration_fails_the_source_check(tmp_path):
    errors = errors_for(tmp_path)
    assert len(errors) == 1
    assert "name 3 unselected files with no declared omission" in errors[0]
    for path in ("scripts/gate.mjs", "assets/kit/a.css", "assets/kit/b.css"):
        assert path in errors[0]
    assert "(named in SKILL.md)" in errors[0] and "omissions" in errors[0]
    assert "tests/test_gate.mjs" not in errors[0]          # left out, but no selected file names it


def test_selecting_what_the_method_names_passes(tmp_path):
    assert errors_for(tmp_path, selected_paths=EVERYTHING) == []


def test_a_declared_omission_with_a_reason_passes(tmp_path):
    omissions = [{"paths": ["scripts/gate.mjs", "assets/**"], "reason": "Fixture: the demo method is described, not run."}]
    assert errors_for(tmp_path, omissions=omissions) == []


def test_a_named_folder_needs_every_unselected_file_under_it_explained(tmp_path):
    omissions = [{"paths": ["scripts/gate.mjs", "assets/kit/a.css"], "reason": "Only one stylesheet is explained."}]
    errors = errors_for(tmp_path, omissions=omissions)
    assert errors and "name 1 unselected file with no declared omission: assets/kit/b.css" in errors[0]


@pytest.mark.parametrize("value", [
    "scripts/gate.mjs", 42, None, ["scripts/gate.mjs"], [{"paths": ["scripts/gate.mjs"]}],
    [{"paths": ["scripts/gate.mjs"], "reason": "  "}], [{"paths": [], "reason": "No paths."}],
    [{"paths": "scripts/gate.mjs", "reason": "Not a list."}], [{"paths": ["../x"], "reason": "Unsafe."}],
    [{"paths": ["scripts/gate.mjs"], "reason": "Extra key.", "form": "dropped"}],
])
def test_a_malformed_or_unreasoned_omission_fails_closed(tmp_path, value):
    errors = errors_for(tmp_path, omissions=value)
    assert errors and "omissions" in errors[0] and "reason" in errors[0]


def test_an_omission_that_matches_nothing_left_out_is_refused(tmp_path):
    omissions = [{"paths": ["scripts/gate.mjs", "assets/**", "docs/**"], "reason": "docs/ does not exist."}]
    errors = errors_for(tmp_path, omissions=omissions)
    assert errors and "omissions matched no unselected file: docs/**" in errors[0]


def test_a_file_cannot_be_both_selected_and_declared_omitted(tmp_path):
    omissions = [{"paths": ["scripts/**"], "reason": "Contradicts the selection."}]
    errors = errors_for(tmp_path, selected_paths=EVERYTHING, omissions=omissions)
    assert errors and "omissions pattern matches a selected file: scripts/**" in errors[0]


def test_a_long_list_of_unexplained_files_is_cut_with_the_count_kept(tmp_path):
    files = {"LICENSE": MIT, "SKILL.md": "# Demo\nMount everything under kit/.\n",
             **{f"kit/part-{index:02d}.css": "x{}\n" for index in range(30)}}
    root, commit = make_repo(tmp_path, files)
    errors = check_sources(manifest(root, commit, selected_paths=["SKILL.md"]), tmp_path)
    assert errors and "name 30 unselected files" in errors[0] and "(+22 more)" in errors[0]
    assert len(errors[0]) < 900


def test_intake_can_still_be_prepared_for_a_source_the_gate_refuses(tmp_path):
    # The workbench is where the intake AI learns what is missing: preparing it must not need a clean gate.
    root, commit = make_repo(tmp_path, FILES)
    src = {**manifest(root, commit, selected_paths=["SKILL.md"])["sources"][0], "intake": {"goal": "Absorb the demo"}}
    copy_prompts(tmp_path)
    workbench = prepare_intake(src, tmp_path, tmp_path / "intake")
    assert json.loads((workbench / "coverage.json").read_text(encoding="utf-8"))["referenced"]


def test_a_new_package_can_be_scaffolded_before_its_intake_completes_the_selection(tmp_path):
    root, _commit = make_repo(tmp_path, FILES)
    path = scaffold_package(tmp_path / "package", str(root), slug="demo-pack", license_name="MIT",
                            goal="Absorb the demo", selected=["SKILL.md"], release=None, head=True)
    assert path.is_file()


def _point_the_fixture_skill_at_an_unselected_script(portable_project):
    manifest_path = portable_project / "sources.json"
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    repo = Path(data["sources"][0]["repo_path"])

    def git(*args):
        return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True).stdout.strip()

    (repo / "SKILL.md").write_text("# Skill\nRun `node scripts/gate.mjs` when done.\n", encoding="utf-8")
    (repo / "scripts").mkdir()
    (repo / "scripts" / "gate.mjs").write_text("// gate\n", encoding="utf-8")
    git("add", ".")
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "a gate the skill names")
    data["sources"][0]["commit"] = git("rev-parse", "HEAD")
    manifest_path.write_text(json.dumps(data), encoding="utf-8")
    return manifest_path, data


def test_a_release_is_not_built_from_a_source_with_an_unexplained_omission(portable_project, tmp_path):
    manifest_path, data = _point_the_fixture_skill_at_an_unselected_script(portable_project)
    with pytest.raises(ValueError, match="no declared omission: scripts/gate.mjs"):
        build_release(manifest_path, portable_project, tmp_path / "out")
    assert not (tmp_path / "out" / "muro").exists()
    data["sources"][0]["selected_paths"] = ["SKILL.md", "scripts/gate.mjs"]
    manifest_path.write_text(json.dumps(data), encoding="utf-8")
    release = build_release(manifest_path, portable_project, tmp_path / "out")
    assert (release / "scripts" / "demo" / "scripts" / "gate.mjs").is_file()
