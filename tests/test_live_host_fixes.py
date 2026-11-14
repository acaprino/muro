"""Fixes for what the live runs on Codex, OpenCode, Pi and Claude Code found (2026-11-12).

1. Codex registers every SKILL.md under .agents/skills recursively: the absorbed originals packaged
   as helpers became live skills that bypass the coordinator. Packaged copies are SKILL.source.md.
2. Pi confirmed a two-step map, then did both steps' work and never submitted: a step result now
   names its scope, the steps that remain and the exact arguments that submit it.
3. Pi passed --stack css-only: the error now names the token and the accepted form.
"""
import json
import re
import shutil
from pathlib import Path

import pytest

from muro import build_release, parse_capabilities, validate_capabilities_and_router
from muro.core import parse_router
from muro.routing import validate_stack
from muro.runtime import Coordinator
from routing_helpers import copy_prompts, proposed

ROOT = Path(__file__).resolve().parent.parent
MARIONETTE = ROOT / "examples" / "marionette"


def test_release_never_ships_a_file_named_skill_md_below_a_skill_folder():
    release = build_release(MARIONETTE / "sources.json", MARIONETTE, Path(pytest.importorskip("tempfile").mkdtemp()) / "out")
    try:
        for host in ("claude-code", "codex", "pi", "opencode", "hermes"):
            skills = release / "adapters" / host / "skills"
            nested = [p for p in skills.rglob("SKILL.md") if p.parent.parent != skills]
            assert nested == [], (host, [str(p.relative_to(skills)) for p in nested[:5]])
            assert (skills / "marionette" / "scripts" / "taste-skill" / "SKILL.source.md").is_file()
            assert (skills / "marionette" / "scripts" / "ui-ux-pro-max" / ".claude" / "skills" / "ui-ux-pro-max"
                    / "SKILL.source.md").is_file()
        assert not list((release / "scripts").rglob("SKILL.md"))
    finally:
        shutil.rmtree(release.parent.parent, ignore_errors=True)


def test_capabilities_reference_packaged_source_skills_by_their_packaged_name():
    caps = parse_capabilities(MARIONETTE / "capabilities")
    pattern = re.compile(r"<(?:package_root|[A-Z]{2})>[^\s`'\")]*SKILL\.md")
    for cap in caps:
        assert not pattern.search(cap.body), (cap.id, pattern.search(cap.body).group(0))
    body = next(c for c in caps if c.id == "visual-direction").body
    assert "<TS>/SKILL.source.md" in body
    # Provenance lines keep the upstream file name.
    assert "skills/taste-skill/SKILL.md" in body


def test_validation_rejects_a_packaged_reference_to_skill_md(tmp_path):
    caps = parse_capabilities(MARIONETTE / "capabilities")
    rows = parse_router(MARIONETTE / "ROUTER.md")
    broken = next(c for c in caps if c.id == "paper-search")
    broken.body = broken.body + "\nRead `<package_root>/scripts/open-paper-skills/skills/paper-search/SKILL.md` first.\n"
    errors = validate_capabilities_and_router(caps, rows, plugin_slug="marionette")
    assert any("SKILL.source.md" in e and "paper-search" in e for e in errors), errors


@pytest.fixture
def coordinator(tmp_path):
    pkg = tmp_path / "pkg"
    pkg.mkdir()
    shutil.copytree(MARIONETTE / "capabilities", pkg / "capabilities")
    shutil.copy2(MARIONETTE / "ROUTER.md", pkg / "ROUTER.md")
    copy_prompts(pkg)
    return Coordinator(pkg, tmp_path / "consumer")


def test_a_mapped_step_names_its_scope_the_remaining_steps_and_how_to_submit(coordinator):
    task = "Decidi il movimento delle card e implementalo solo in CSS"
    stack = {"stack:css-only"}
    plan = proposed(coordinator, task, ["motion-principles", "css-scroll"], stack)["plan"]
    step = coordinator.confirm(task, plan, stack)
    assert step["capability"] == "motion-principles"
    assert step["remaining_steps"] == ["css-scroll"]
    submit = step["submit"]
    assert submit.startswith("step ") and f"--map-id {step['map_id']}" in submit
    assert "--capability motion-principles" in submit and "step.json" in submit
    assert str(coordinator.project_root) in submit
    assert "css-scroll" in step["scope"] and "only" in step["scope"]
    nxt = coordinator.record({"motion-spec": "fade 24px", "reduced-motion": "static"}, step["map_id"], "motion-principles")
    assert nxt["capability"] == "css-scroll" and nxt["remaining_steps"] == []
    assert "--capability css-scroll" in nxt["submit"]
    checks = coordinator.record({"code-patch": "styles.css", "scroll-verified": "browser"}, nxt["map_id"], "css-scroll")
    assert checks["mode"] == "checks"
    assert checks["submit_check"].startswith("check ") and f"--map-id {checks['map_id']}" in checks["submit_check"]
    assert checks["submit_complete"] == f'complete --project "{coordinator.project_root}" --map-id {checks["map_id"]}'


def test_direct_steps_carry_no_map_submission(coordinator):
    result = proposed(coordinator, "Converti a.docx in PDF", ["office-files"])
    # No map: nothing of the mapped flow travels with a direct step. The output
    # handoff still gets its one-line command (record --direct), because a live
    # host left required_outputs unrecorded without it (2026-11-14).
    assert result["mode"] == "direct" and "map_id" not in result and "remaining_steps" not in result
    assert "scope" not in result and "--map-id" not in result["submit"]
    assert result["submit"].startswith("record ") and "--direct --capability office-files" in result["submit"]


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
