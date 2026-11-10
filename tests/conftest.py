"""Hermetic Git fixtures used by release and source checks."""
import json
import subprocess
import shutil
from pathlib import Path

import pytest

from test_regressions import MIT
from routing_helpers import INTENTS, ROUTER_HEADER, copy_prompts


@pytest.fixture
def repo(tmp_path):
    root = tmp_path / "source"
    root.mkdir()
    def git(*args):
        return subprocess.run(["git", "-C", str(root), *args], check=True,
                              capture_output=True, text=True).stdout.strip()
    git("init", "-q")
    (root / "LICENSE").write_text(MIT, encoding="utf-8")
    (root / "SKILL.md").write_text("# Skill", encoding="utf-8")
    (root / "references").mkdir()
    (root / "references" / "photo.png").write_bytes(b"not redistributed")
    git("add", ".")
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "initial")
    return root, git("rev-parse", "HEAD")


@pytest.fixture
def portable_project(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    def git(*args):
        return subprocess.run(["git", "-C", str(repo), *args], check=True,
                              capture_output=True, text=True).stdout.strip()
    git("init", "-q")
    (repo / "LICENSE").write_text(MIT, encoding="utf-8")
    (repo / "SKILL.md").write_text("# Skill", encoding="utf-8")
    git("add", ".")
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture")
    project = tmp_path / "project"
    project.mkdir()
    cap = project / "capabilities"
    cap.mkdir()
    (cap / "x.md").write_text('---\n' + INTENTS + 'id: x\nrole: testing\nwhen: "—"\nafter: []\noutputs: ["x"]\nchecks: ["ok"]\n---\n## Sources\nSource: demo\n', encoding="utf-8")
    (project / "ROUTER.md").write_text(ROUTER_HEADER + "| x | testing | — | — | x | testing.verify |\n", encoding="utf-8")
    copy_prompts(project)
    manifest = {"plugin": {"slug": "muro", "name": "Muro", "command": "muro", "version": "0.1.0"},
                "sources": [{"id": "demo", "repo_path": str(repo), "commit": git("rev-parse", "HEAD"), "pin": "head",
                             "license": "MIT", "selected_paths": ["SKILL.md"], "excluded_paths": [],
                             "runtime_deps": [{"name": "gsap", "license": "separate", "bundled": False}],
                             "intake": {"goal": "Extract deterministic test capability rules"}}]}
    (project / "sources.json").write_text(json.dumps(manifest), encoding="utf-8")
    shutil.copytree(Path(__file__).resolve().parent.parent / "muro", project / "muro",
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    return project
