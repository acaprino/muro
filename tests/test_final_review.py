"""Regression tests from the independent final implementation review."""
import json
from pathlib import Path
import shutil

import pytest

from muro import (
    build_release,
    check_sources,
    parse_router,
    RouterRow,
    validate_plugin_identity,
)
from muro.runtime import Coordinator
from muro.routing import resolve_selection
from test_regressions import git
from routing_helpers import FIXTURE, INTENTS, ROUTER_HEADER, copy_delivery, copy_prompts, decision, proposed

ROOT = Path(__file__).resolve().parent.parent


def runtime_package(tmp_path):
    root = tmp_path / "package"
    root.mkdir()
    shutil.copytree(FIXTURE / "capabilities", root / "capabilities")
    shutil.copy2(FIXTURE / "ROUTER.md", root / "ROUTER.md")
    copy_prompts(root)
    copy_delivery(root)
    return root


def test_new_task_does_not_reuse_old_outputs_and_archives_previous_map(tmp_path):
    package = runtime_package(tmp_path)
    project = tmp_path / "consumer"
    coordinator = Coordinator(package, project)
    old = "Plan a story and build its scroll movement"
    old_route = decision(coordinator, old, ["story-brief", "pacing-spec", "scroll-build-gsap"], {"stack:gsap"})
    coordinator._write_state({"schema_version": 2, "map_id": "previous-map", "classification": old_route, "task": old, "plan": ["story-brief", "pacing-spec", "scroll-build-gsap"],
                              "stack_tokens": ["stack:gsap"], "outputs": {"angle": "old", "pacing-plan": "old"},
                              "results": []})
    new_task = "Plan another story and build its scroll movement"
    result = proposed(coordinator, new_task, ["story-brief", "pacing-spec", "scroll-build-gsap"], {"stack:gsap"})
    assert result["plan"] == ["story-brief", "pacing-spec", "scroll-build-gsap"]
    coordinator.confirm(new_task, result["plan"], {"stack:gsap"})
    assert coordinator._state()["task"] == new_task
    assert coordinator._state()["outputs"] == {}
    assert any((project / ".muro" / "archive").iterdir())


def test_documented_merge_audit_comment_is_ignored(tmp_path):
    path = tmp_path / "ROUTER.md"
    path.write_text("""| id | role | when | after | outputs | intents |
|---|---|---|---|---|---|
| x | testing | — | — | x | testing.verify |
<!-- MERGE AUDIT
| role | kept_id | dropped_id | conflicts_resolved | specifics_preserved |
|------|---------|------------|--------------------|---------------------|
| art-direction | visual-direction | other | conflict | preserved |
-->
""", encoding="utf-8")
    rows = parse_router(path)
    assert [row.id for row in rows] == ["x"]


def test_explicitly_conflicting_stacks_are_rejected():
    rows = [RouterRow("gsap", "scroll-code", "stack:gsap", "—", "code"),
            RouterRow("css", "scroll-code", "stack:css-only", "—", "code")]
    with pytest.raises(ValueError, match="onflict"):
        resolve_selection(rows, ["gsap"], {"stack:gsap", "stack:css-only"}, set())


def test_registered_provenance_and_intake_are_required(portable_project, tmp_path):
    (portable_project / "capabilities" / "x.md").write_text(
        '---\n' + INTENTS + 'id: x\nrole: testing\nwhen: "—"\nafter: []\noutputs: ["x"]\nchecks: ["ok"]\n---\n## Sources\nSource: unregistered\n', encoding="utf-8")
    with pytest.raises(ValueError, match="unregistered"):
        build_release(portable_project / "sources.json", portable_project, tmp_path / "output")


def test_outdated_local_head_is_rejected(repo, tmp_path):
    root, old = repo
    (root / "new.txt").write_text("advance", encoding="utf-8")
    git(root, "add", "new.txt")
    git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "advance")
    src = {"id": "demo", "repo_path": str(root), "commit": old, "pin": "head", "license": "MIT",
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
    src = {"id": "demo", "repo_path": str(root), "commit": git(root, "rev-parse", "HEAD"), "pin": "head",
           "license": "MIT", "selected_paths": ["scripts/start.mjs", "library/type.json"], "excluded_paths": []}
    project = tmp_path / "project"
    project.mkdir()
    (project / "capabilities").mkdir()
    (project / "capabilities" / "x.md").write_text(
        '---\n' + INTENTS + 'id: x\nrole: testing\nwhen: "—"\nafter: []\noutputs: ["x"]\nchecks: ["ok"]\n---\n## Sources\nSource: demo\n', encoding="utf-8")
    (project / "ROUTER.md").write_text(ROUTER_HEADER + "| x | testing | — | — | x | testing.verify |\n", encoding="utf-8")
    copy_prompts(project)
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


def _helper_project(tmp_path, root, selected):
    src = {"id": "demo", "repo_path": str(root), "commit": git(root, "rev-parse", "HEAD"), "pin": "head", "license": "MIT",
           "selected_paths": selected, "excluded_paths": [], "intake": {"goal": "test"}}
    project = tmp_path / "project"
    (project / "capabilities").mkdir(parents=True)
    (project / "capabilities" / "x.md").write_text(
        '---\n' + INTENTS + 'id: x\nrole: testing\nwhen: "—"\nafter: []\noutputs: ["x"]\nchecks: ["ok"]\n---\n## Sources\nSource: demo\n', encoding="utf-8")
    (project / "ROUTER.md").write_text(ROUTER_HEADER + "| x | testing | — | — | x | testing.verify |\n", encoding="utf-8")
    copy_prompts(project)
    shutil.copytree(ROOT / "muro", project / "muro", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    (project / "sources.json").write_text(json.dumps(
        {"plugin": {"slug": "muro", "name": "Muro", "command": "muro", "version": "1"}, "sources": [src]}), encoding="utf-8")
    return project


def _commit_helpers(root, files):
    for name, text in files.items():
        (root / name).parent.mkdir(parents=True, exist_ok=True)
        (root / name).write_text(text, encoding="utf-8")
    git(root, "add", ".")
    git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "helpers")


def test_an_import_quoted_in_a_string_or_a_url_on_a_runtime_base_is_not_a_missing_helper(repo, tmp_path):
    # taste-skill v2.5.1, 2026-11-17: both stopped the build of a source selected whole.
    root, _commit = repo
    _commit_helpers(root, {
        "kit/build-index.mjs": "export const doc = {\n  load: \"import ui from './ui.js'; ui.loadAll(document)\",\n};\n",
        "kit/demo.js": "export async function meta(base) {\n  return fetch(new URL('./meta.json', base));\n}\n",
    })
    project = _helper_project(tmp_path, root, ["kit/**"])
    result = build_release(project / "sources.json", project, tmp_path / "out")
    assert (result / "scripts" / "demo" / "kit" / "demo.js").is_file()


@pytest.mark.parametrize("code, missing", [
    ("import { a } from './absent.js';\n", "absent.js"),
    ("import {\n  a,\n  b,\n} from './absent.js';\n", "absent.js"),
    ("export { a } from './absent.js';\n", "absent.js"),
    ("const a = 1;import{b}from'./absent.js';\n", "absent.js"),
    ("const data = new URL('./absent.json', import.meta.url);\n", "absent.json"),
    ("const mod = await import('./absent.js');\n", "absent.js"),
], ids=["import", "multiline", "re-export", "minified", "module-url", "dynamic"])
def test_a_real_relative_dependency_that_is_not_packaged_still_stops_the_build(repo, tmp_path, code, missing):
    root, _commit = repo
    _commit_helpers(root, {"kit/tool.mjs": code})
    project = _helper_project(tmp_path, root, ["kit/**"])
    with pytest.raises(ValueError, match=f"Missing helper dependency.*{missing}"):
        build_release(project / "sources.json", project, tmp_path / "out")
