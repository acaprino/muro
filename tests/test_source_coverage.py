"""What a source holds outside its selection is evidence for the intake AI (ADR-0026).

The intake AI used to receive only the files in `selected_paths`. A source whose
SKILL.md runs scripts, copies a kit and gates on checkers that were never selected
was absorbed as "write it by hand, the rest is not packaged" (taste-skill in
a real package: 11 files of 1,631). Preparation now reports what was left out and which
of it the selected files name. Python resolves paths; it never judges what is needed.
"""
import json
import subprocess

from muro.agent import _inline_evidence
from muro.coverage import source_coverage
from muro.factory import prepare_intake
from routing_helpers import copy_prompts
from test_regressions import MIT

SKILL = b"""# Demo skill
Run `node scripts/gate.mjs` before reporting. Read references/voice.md in full.
Copy the stylesheets from assets/kit/ into the page; the scripts do the rest.
"""
SIZES = {
    "skill/SKILL.md": len(SKILL),
    "skill/references/system.md": 40,
    "skill/references/voice.md": 300,
    "skill/scripts/gate.mjs": 200,
    "skill/scripts/shoot.mjs": 150,
    "skill/assets/kit/a.css": 10,
    "skill/assets/kit/b.css": 12,
    "examples/one/index.html": 500,
    "examples/two/index.html": 700,
    "README.md": 60,
}


def coverage(system=b"# System\n", skill=SKILL):
    return source_coverage({"skill/SKILL.md": skill, "skill/references/system.md": system}, SIZES)


def referenced(report):
    return {row["path"]: row for row in report["referenced"]}


def test_an_unselected_file_named_by_a_selected_file_is_reported_with_who_names_it():
    rows = referenced(coverage())
    assert rows["skill/scripts/gate.mjs"] == {
        "path": "skill/scripts/gate.mjs", "kind": "file", "files": 1, "bytes": 200, "named_in": ["skill/SKILL.md"]}
    assert rows["skill/references/voice.md"]["named_in"] == ["skill/SKILL.md"]


def test_a_named_folder_is_reported_with_the_unselected_files_it_holds():
    assert referenced(coverage())["skill/assets/kit"] == {
        "path": "skill/assets/kit", "kind": "directory", "files": 2, "bytes": 22, "named_in": ["skill/SKILL.md"]}


def test_a_folder_named_at_the_end_of_a_sentence_is_still_a_folder():
    assert "skill/assets" in referenced(coverage(skill=b"Mount everything under assets/.\n"))


def test_a_plain_word_is_not_a_reference_to_a_folder_of_that_name():
    # "the scripts do the rest" is prose: only a path (a slash, or a file name with a dot) counts.
    assert "skill/scripts" not in referenced(coverage())


def test_a_sibling_file_named_without_its_folder_resolves_from_the_file_that_names_it():
    rows = referenced(coverage(system=b"Voice rules live in voice.md.\n", skill=b"# Demo\n"))
    assert rows["skill/references/voice.md"]["named_in"] == ["skill/references/system.md"]


def test_a_parent_relative_path_resolves_from_the_file_that_names_it():
    rows = referenced(coverage(system=b"Then run ../scripts/shoot.mjs --w 1440\n", skill=b"# Demo\n"))
    assert rows["skill/scripts/shoot.mjs"]["named_in"] == ["skill/references/system.md"]


def test_a_path_behind_a_placeholder_an_install_location_or_a_link_still_resolves():
    for text in (b"node ${CLAUDE_SKILL_DIR}/scripts/gate.mjs",
                 b"node ~/.claude/skills/skill/scripts/gate.mjs",
                 b"[gate](https://example.invalid/blob/main/skill/scripts/gate.mjs)"):
        assert "skill/scripts/gate.mjs" in referenced(coverage(skill=text)), text


def test_a_path_is_read_from_the_nearest_folder_where_it_exists():
    # taste-skill, 2026-11-17: `assets/` in SKILL.md also matched an unrelated `assets/` at the repository root.
    sizes = {**SIZES, "scripts/gate.mjs": 5, "references/system.md": 7}
    report = source_coverage({"skill/SKILL.md": b"node scripts/gate.mjs, then references/system.md",
                              "skill/references/system.md": b""}, sizes)
    # The second path exists nearest as a selected file, so the unselected namesake at the root is not it either.
    assert [row["path"] for row in report["referenced"]] == ["skill/scripts/gate.mjs"]


def test_the_folder_a_file_lives_in_is_not_a_reference_to_what_was_left_out():
    rows = referenced(coverage(skill=b"Hosts install this under skills/, as the skill/ folder.\n"))
    assert rows == {}


def test_selected_and_nonexistent_paths_are_not_reported():
    rows = referenced(coverage(skill=b"See references/system.md and scripts/absent.mjs.\n"))
    assert rows == {}


def test_left_out_rolls_a_folder_with_nothing_selected_into_one_row():
    report = coverage()
    assert report["left_out"] == [
        {"path": "README.md", "kind": "file", "files": 1, "bytes": 60},
        {"path": "examples", "kind": "directory", "files": 2, "bytes": 1200},
        {"path": "skill/assets", "kind": "directory", "files": 2, "bytes": 22},
        {"path": "skill/references/voice.md", "kind": "file", "files": 1, "bytes": 300},
        {"path": "skill/scripts", "kind": "directory", "files": 2, "bytes": 350},
    ]


def test_totals_count_both_sides_of_the_selection():
    report = coverage()
    assert report["selected"] == {"files": 2, "bytes": len(SKILL) + 40}
    assert report["unselected"] == {"files": 8, "bytes": 1932}


def _source_with_unselected_helper(tmp_path):
    root = tmp_path / "source"
    (root / "scripts").mkdir(parents=True)
    (root / "LICENSE").write_text(MIT, encoding="utf-8")
    (root / "SKILL.md").write_text("# Skill\nRun `node scripts/gate.mjs` when done.\n", encoding="utf-8")
    (root / "scripts" / "gate.mjs").write_text("// gate\n", encoding="utf-8")

    def git(*args):
        return subprocess.run(["git", "-C", str(root), *args], check=True, capture_output=True, text=True).stdout.strip()

    git("init", "-q")
    git("add", ".")
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "initial")
    return {"id": "demo", "repo_path": str(root), "commit": git("rev-parse", "HEAD"), "pin": "head", "license": "MIT",
            "selected_paths": ["SKILL.md"], "excluded_paths": [], "intake": {"goal": "Absorb the skill"}}


def test_intake_preparation_writes_the_coverage_of_the_pinned_commit_and_points_the_prompt_at_it(tmp_path):
    copy_prompts(tmp_path)
    workbench = prepare_intake(_source_with_unselected_helper(tmp_path), tmp_path, tmp_path / "intake")
    report = json.loads((workbench / "coverage.json").read_text(encoding="utf-8"))
    assert [row["path"] for row in report["referenced"]] == ["scripts/gate.mjs"]
    assert report["referenced"][0]["named_in"] == ["SKILL.md"]
    assert not (workbench / "files" / "scripts").exists()      # evidence of what is missing, not the file itself
    prompt = (workbench / "PROMPT.md").read_text(encoding="utf-8")
    assert "./coverage.json" in prompt and "What the selection leaves out" in prompt


def test_a_second_preparation_replaces_the_coverage_of_the_first(tmp_path):
    copy_prompts(tmp_path)
    src = _source_with_unselected_helper(tmp_path)
    prepare_intake(src, tmp_path, tmp_path / "intake")
    src["selected_paths"] = ["SKILL.md", "scripts/gate.mjs"]      # the AI completed the selection
    workbench = prepare_intake(src, tmp_path, tmp_path / "intake")
    assert json.loads((workbench / "coverage.json").read_text(encoding="utf-8"))["referenced"] == []
    assert (workbench / "files" / "scripts" / "gate.mjs").is_file()


def test_an_api_model_without_file_tools_receives_the_coverage_inline(tmp_path):
    copy_prompts(tmp_path)
    workbench = prepare_intake(_source_with_unselected_helper(tmp_path), tmp_path, tmp_path / "intake")
    evidence = _inline_evidence(workbench)
    assert "### coverage.json" in evidence and '"scripts/gate.mjs"' in evidence


def test_the_intake_prompt_has_a_skill_read_before_it_is_left_out_as_a_duplicate():
    # A real intake, 2026-11-11: explain-anything-html was left out of open-paper-skills, unread, as
    # "served by explain-this", which starts on other requests and makes another page.
    from pathlib import Path
    prompt = (Path(__file__).resolve().parent.parent / "prompts" / "intake.md").read_text(encoding="utf-8")
    section = " ".join(prompt.split("## What the selection leaves out", 1)[1].split("\n## ", 1)[0].split())
    assert "another source already serves" in section and "read its skill file first" in section
    assert "when it starts" in section and "what it produces" in section
