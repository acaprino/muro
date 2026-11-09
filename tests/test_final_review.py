"""Regression tests from the independent final implementation review."""
import json
from pathlib import Path
import shutil

import pytest

from muro import (
    build_release,
    check_sources,
    parse_router,
    resolve_plan,
    validate_plugin_identity,
)
from muro.runtime import Coordinator
from test_regressions import git

ROOT = Path(__file__).resolve().parent.parent


def runtime_package(tmp_path):
    root = tmp_path / "package"
    root.mkdir()
    shutil.copytree(ROOT / "capabilities", root / "capabilities")
    shutil.copy2(ROOT / "ROUTER.md", root / "ROUTER.md")
    return root


def test_new_task_does_not_reuse_old_outputs_and_archives_previous_map(tmp_path):
    package = runtime_package(tmp_path)
    project = tmp_path / "consumer"
    coordinator = Coordinator(package, project)
    old = "Build a landing page with scroll animation"
    coordinator._write_state({"task": old, "plan": ["visual-direction", "motion-principles", "gsap-scrolltrigger"],
                              "stack_tokens": ["stack:gsap"], "outputs": {"palette": "old", "motion-spec": "old"},
                              "results": []})
    new_task = "Create another landing page with scroll animation"
    result = coordinator.propose(new_task, {"stack:gsap"})
    assert result["plan"] == ["visual-direction", "motion-principles", "gsap-scrolltrigger"]
    coordinator.confirm(new_task, result["plan"], {"stack:gsap"})
    assert coordinator._state()["task"] == new_task
    assert coordinator._state()["outputs"] == {}
    assert any((project / ".muro" / "archive").iterdir())


def test_documented_merge_audit_comment_is_ignored(tmp_path):
    path = tmp_path / "ROUTER.md"
    path.write_text("""| id | role | when | after | outputs |
|---|---|---|---|---|
| x | testing | — | — | x |
<!-- MERGE AUDIT
| role | kept_id | dropped_id | conflicts_resolved | specifics_preserved |
|------|---------|------------|--------------------|---------------------|
| art-direction | visual-direction | other | conflict | preserved |
-->
""", encoding="utf-8")
    rows = parse_router(path)
    assert [row.id for row in rows] == ["x"]


def test_explicitly_conflicting_stacks_are_rejected():
    rows = [{"id": "gsap", "role": "scroll-code", "when": "stack:gsap", "after": [], "outputs": ["code"]},
            {"id": "css", "role": "scroll-code", "when": "stack:css-only", "after": [], "outputs": ["code"]}]
    with pytest.raises(ValueError, match="onflict"):
        resolve_plan(rows, ["scroll-code"], {"stack:gsap", "stack:css-only"}, set())


def test_registered_provenance_and_intake_are_required(portable_project, tmp_path):
    (portable_project / "capabilities" / "x.md").write_text(
        '---\nid: x\nrole: testing\nwhen: "—"\nafter: []\noutputs: ["x"]\nchecks: ["ok"]\n---\n## Sources\nSource: unregistered\n', encoding="utf-8")
    with pytest.raises(ValueError, match="unregistered"):
        build_release(portable_project / "sources.json", portable_project, tmp_path / "output")


def test_outdated_local_head_is_rejected(repo, tmp_path):
    root, old = repo
    (root / "new.txt").write_text("advance", encoding="utf-8")
    git(root, "add", "new.txt")
    git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "advance")
    src = {"id": "demo", "repo_path": str(root), "commit": old, "license": "MIT",
           "selected_paths": ["SKILL.md"], "excluded_paths": []}
    assert any("HEAD" in e for e in check_sources({"sources": [src]}, tmp_path))


def test_helper_dependencies_keep_layout_and_must_be_selected(repo, tmp_path):
    root, commit = repo
    (root / "scripts").mkdir()
    (root / "assets").mkdir()
    (root / "library").mkdir()
    (root / "scripts" / "start.mjs").write_text("import { color } from '../assets/effects/fx.js';\n", encoding="utf-8")
    (root / "assets" / "effects").mkdir()
    (root / "assets" / "effects" / "fx.js").write_text("/* example: import fx from './assets/effects/fx.js'; */\nconst base = new URL('./', import.meta.url);\nexport const color = {};\n", encoding="utf-8")
    (root / "library" / "type.json").write_text("{}", encoding="utf-8")
    git(root, "add", ".")
    git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "helpers")
    src = {"id": "demo", "repo_path": str(root), "commit": git(root, "rev-parse", "HEAD"),
           "license": "MIT", "selected_paths": ["scripts/start.mjs", "library/type.json"], "excluded_paths": []}
    project = tmp_path / "project"
    project.mkdir()
    (project / "capabilities").mkdir()
    (project / "capabilities" / "x.md").write_text(
        '---\nid: x\nrole: testing\nwhen: "—"\nafter: []\noutputs: ["x"]\nchecks: ["ok"]\n---\n## Sources\nSource: demo\n', encoding="utf-8")
    (project / "ROUTER.md").write_text("| id | role | when | after | outputs |\n|---|---|---|---|---|\n| x | testing | — | — | x |\n", encoding="utf-8")
    shutil.copytree(ROOT / "muro", project / "muro", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    src["intake"] = {"goal": "test"}
    (project / "sources.json").write_text(json.dumps({"plugin": {"slug": "muro", "name": "Muro", "command": "muro", "version": "1"}, "sources": [src]}), encoding="utf-8")
    with pytest.raises(ValueError, match="fx.js"):
        build_release(project / "sources.json", project, tmp_path / "missing")
    src["selected_paths"].append("assets/effects/fx.js")
    (project / "sources.json").write_text(json.dumps({"plugin": {"slug": "muro", "name": "Muro", "command": "muro", "version": "1"}, "sources": [src]}), encoding="utf-8")
    result = build_release(project / "sources.json", project, tmp_path / "present")
    assert (result / "scripts" / "demo" / "scripts" / "start.mjs").is_file()
    assert (result / "scripts" / "demo" / "assets" / "effects" / "fx.js").is_file()
    assert (result / "scripts" / "demo" / "library" / "type.json").is_file()


def test_command_names_the_skill_and_slug_names_the_map(portable_project, tmp_path):
    manifest_path = portable_project / "sources.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["plugin"]["command"] = "collect"
    manifest["plugin"]["slug"] = "collector"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    result = build_release(manifest_path, portable_project, tmp_path / "output")
    assert (result / "adapters" / "codex" / "skills" / "collect" / "muro.py").is_file()
    coordinator = Coordinator(result, tmp_path / "consumer")
    assert coordinator.state_dir == tmp_path / "consumer" / ".collector"


def test_installed_identity_collision_is_detected_only_when_roots_are_supplied(tmp_path):
    (tmp_path / "other" / ".claude-plugin").mkdir(parents=True)
    (tmp_path / "other" / ".claude-plugin" / "plugin.json").write_text('{"name":"muro"}', encoding="utf-8")
    plugin = {"slug": "muro", "name": "Muro", "command": "muro", "version": "1"}
    assert validate_plugin_identity(plugin, installed_roots=[tmp_path])
