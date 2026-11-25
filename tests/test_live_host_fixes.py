"""Fixes for what the live runs on Codex, OpenCode, Pi and Claude Code found (2026-11-12).

1. Codex registers every SKILL.md under .agents/skills recursively: the absorbed originals packaged
   as helpers became live skills that bypass the coordinator. Packaged copies are SKILL.source.md.
2. Pi confirmed a two-step map, then did both steps' work and never submitted: a step result now
   names its scope, the steps that remain and the exact arguments that submit it.
3. Pi passed --stack css-only: the error now names the token and the accepted form.
"""
import json
import shutil

import pytest

from muro import build_release, parse_capabilities, validate_capabilities_and_router
from muro.core import parse_router
from muro.routing import validate_stack
from muro.runtime import Coordinator
from routing_helpers import FIXTURE, copy_delivery, copy_prompts, proposed
from test_cli import git
from test_intake_only_paths import update


def test_release_never_ships_a_file_named_skill_md_below_a_skill_folder(portable_project, tmp_path):
    # The upstream keeps an original skill at its root, one in a skills folder and one in a host's dot-folder.
    repo = tmp_path / "repo"
    for folder in ("skills/alpha", ".claude/skills/beta"):
        (repo / folder).mkdir(parents=True)
        (repo / folder / "SKILL.md").write_text(f"# Original in {folder}", encoding="utf-8")
    git(repo, "add", ".")
    git(repo, "commit", "-qm", "nested originals")
    update(portable_project, commit=git(repo, "rev-parse", "HEAD"), selected_paths=["SKILL.md", "skills/**", ".claude/**"])
    release = build_release(portable_project / "sources.json", portable_project, tmp_path / "out")
    for host in ("claude-code", "codex", "pi", "opencode", "hermes"):
        skills = release / "adapters" / host / "skills"
        packaged = skills / "muro" / "scripts" / "demo"
        for original in ("SKILL.source.md", "skills/alpha/SKILL.source.md", ".claude/skills/beta/SKILL.source.md"):
            assert (packaged / original).is_file(), (host, original)     # the originals travel, under the other name
        assert (skills / "muro" / "SKILL.md").is_file()                  # the one skill a host registers
        nested = [p for p in skills.rglob("SKILL.md") if p.parent.parent != skills]
        assert nested == [], (host, [str(p.relative_to(skills)) for p in nested[:5]])
    assert (release / "scripts" / "demo" / "skills" / "alpha" / "SKILL.source.md").is_file()
    assert not list((release / "scripts").rglob("SKILL.md"))


def test_validation_rejects_a_packaged_reference_to_skill_md():
    caps = parse_capabilities(FIXTURE / "capabilities")
    rows = parse_router(FIXTURE / "ROUTER.md")
    assert validate_capabilities_and_router(caps, rows, plugin_slug="pressroom") == []
    broken = next(c for c in caps if c.id == "fact-check")
    broken.body = broken.body + "\nRead `<package_root>/scripts/editorial-desk/skills/fact-check/SKILL.md` first.\n"
    errors = validate_capabilities_and_router(caps, rows, plugin_slug="pressroom")
    assert any("SKILL.source.md" in e and "fact-check" in e for e in errors), errors


@pytest.fixture
def coordinator(tmp_path):
    pkg = tmp_path / "pkg"
    pkg.mkdir()
    shutil.copytree(FIXTURE / "capabilities", pkg / "capabilities")
    shutil.copy2(FIXTURE / "ROUTER.md", pkg / "ROUTER.md")
    copy_prompts(pkg)
    copy_delivery(pkg)
    return Coordinator(pkg, tmp_path / "consumer")


def test_a_mapped_step_names_its_scope_the_remaining_steps_and_how_to_submit(coordinator):
    task = "Decidi il movimento delle sezioni e implementalo solo in CSS"
    stack = {"stack:css-only"}
    plan = proposed(coordinator, task, ["pacing-spec", "scroll-build-css"], stack)["plan"]
    step = coordinator.confirm(task, plan, stack)
    assert step["capability"] == "pacing-spec"
    assert step["remaining_steps"] == ["scroll-build-css"]
    submit = step["submit"]
    assert submit.startswith("step ") and f"--map-id {step['map_id']}" in submit
    assert "--capability pacing-spec" in submit and "step.json" in submit
    assert str(coordinator.project_root) in submit
    assert "scroll-build-css" in step["scope"] and "only" in step["scope"]
    nxt = coordinator.record({"pacing-plan": "fade 24px", "reduced-motion": "static"}, step["map_id"], "pacing-spec")
    assert nxt["capability"] == "scroll-build-css" and nxt["remaining_steps"] == []
    assert "--capability scroll-build-css" in nxt["submit"]
    checks = coordinator.record({"scroll-patch": "styles.css", "scroll-verified": "browser"}, nxt["map_id"], "scroll-build-css")
    assert checks["mode"] == "checks"
    assert checks["submit_check"].startswith("check ") and f"--map-id {checks['map_id']}" in checks["submit_check"]
    assert checks["submit_complete"] == f'complete --project "{coordinator.project_root}" --map-id {checks["map_id"]}'


def test_direct_steps_carry_no_map_submission(coordinator):
    result = proposed(coordinator, "Converti capitolo.docx in PDF", ["manuscript-files"])
    # No map: nothing of the mapped flow travels with a direct step. The output
    # handoff still gets its one-line command (record --direct), because a live
    # host left required_outputs unrecorded without it (2026-11-14).
    assert result["mode"] == "direct" and "map_id" not in result and "remaining_steps" not in result
    assert "scope" not in result and "--map-id" not in result["submit"]
    assert result["submit"].startswith("record ") and "--direct --capability manuscript-files" in result["submit"]


def test_a_bare_stack_word_gets_an_error_that_shows_the_accepted_form():
    with pytest.raises(ValueError) as error:
        validate_stack({"css-only"})
    message = str(error.value)
    assert "'css-only'" in message and "stack:css-only" in message


def test_generated_skill_tells_the_host_to_submit_each_step_before_the_next(portable_project, tmp_path):
    release = build_release(portable_project / "sources.json", portable_project, tmp_path / "out")
    for host in ("claude-code", "codex", "pi", "opencode", "hermes"):
        text = (release / "adapters" / host / "skills" / "muro" / "SKILL.md").read_text(encoding="utf-8")
        assert "`submit`" in text and "`remaining_steps`" in text
        assert "Do not start the work of a later step" in text
        assert "`--stack stack:css-only`" in text
