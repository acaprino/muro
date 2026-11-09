"""Host adapters sharing the same host-neutral Python coordinator."""
from __future__ import annotations

import json
from pathlib import Path
import shutil


_LAUNCHER = '''from pathlib import Path
import sys
package = Path(__file__).resolve().parent
if package.name in {"claude-code", "codex", "pi", "opencode", "hermes"}:
    package = package.parent.parent
sys.path.insert(0, str(package))
from muro.runtime import runtime_main
raise SystemExit(runtime_main(["--package", str(package), *sys.argv[1:]]))
'''


def _skill(plugin: dict, host: str) -> str:
    slug, name = plugin["command"], plugin["name"]
    if host == "claude-code":
        launcher = f"${{CLAUDE_PLUGIN_ROOT}}/skills/{slug}/muro.py"
    else:
        launcher = "<skill-directory>/muro.py"
    return f'''---
name: {slug}
description: {name} coordinator for UI and scroll-animation work. Use for a landing page, visual direction, motion specification, or sequential task map. One capability is loaded per step; never invoke original absorbed skills.
---

# {name} coordinator

1. Read the user's task. For a UI or scroll-animation request, run:
   `python {launcher} plan --task "<user task>" --project "<current project>"`.
2. If the result is `direct`, apply only its `instructions`. No work map is needed.
3. If the result is `confirm`, show its ordered `plan` and ask for one-line approval.
   After approval repeat with `--confirm`. Read only the returned capability body.
4. Perform the returned step using the host's tools. Do not load other capabilities.
   On Claude Code use an isolated Agent when helpful; Codex may use `spawn_agent`
   with `fork_turns: "none"`; OpenCode may use `subagent`; Hermes may use
   `delegate_task`; Pi executes sequentially in the main session.
5. After the step, write required output keys as JSON strings and call
   `python {launcher} record --project "<current project>" --outputs <json-file>`.
   Never invent outputs or overwrite earlier ones. The next result gives the next step.
6. At completion run the returned `## Checks` with real tools, then record each
   result separately using `check --result <json-file>`. Each JSON object must be
   {{"name": "<check>", "status": "pass|fail|not-tested", "evidence": "<command/output or observation>"}}.
   Static checklists are not evidence of passing. Do not modify source plugins.
'''


def write_adapters(dist: Path, plugin: dict, package_source: Path) -> None:
    """Write documented skill layouts and independently runnable host launchers."""
    shutil.copytree(package_source, dist / "muro", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    (dist / "muro.py").write_text(_LAUNCHER, encoding="utf-8")
    plugin_doc = {
        "name": plugin["slug"], "displayName": plugin["name"],
        "version": plugin["version"],
        "description": f"{plugin['name']} — unified multi-host coordinator plugin",
        "author": {"name": "Muro contributors"},
    }
    (dist / ".claude-plugin").mkdir()
    (dist / ".claude-plugin" / "plugin.json").write_text(json.dumps(plugin_doc, indent=2), encoding="utf-8")
    for host in ("claude-code", "codex", "pi", "opencode", "hermes"):
        root = dist / "adapters" / host
        skill_dir = root / "skills" / plugin["command"]
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text(_skill(plugin, host), encoding="utf-8")
        (skill_dir / "muro.py").write_text(_LAUNCHER, encoding="utf-8")
        # A skill directory is independently installable, not a text-only stub.
        shutil.copytree(dist / "muro", skill_dir / "muro")
        shutil.copy2(dist / "ROUTER.md", skill_dir / "ROUTER.md")
        shutil.copytree(dist / "capabilities", skill_dir / "capabilities")
        shutil.copytree(dist / "LICENSES", skill_dir / "LICENSES")
        shutil.copy2(dist / "NOTICE.md", skill_dir / "NOTICE.md")
        shutil.copy2(dist / "sources.json", skill_dir / "sources.json")
        if (dist / "scripts").is_dir():
            shutil.copytree(dist / "scripts", skill_dir / "scripts")
        (root / "INSTALL.md").write_text(
            f"# {plugin['name']} on {host}\n\n"
            f"Install the complete folder `skills/{plugin['command']}` as one skill; do not copy only SKILL.md. "
            "It includes its runtime, capabilities and license notices. "
            "The universal fallback is `python muro.py` inside that folder. "
            "See README.md in the source project for current verification limits.\n",
            encoding="utf-8")
        if host == "claude-code":
            (root / ".claude-plugin").mkdir()
            (root / ".claude-plugin" / "plugin.json").write_text(json.dumps(plugin_doc, indent=2), encoding="utf-8")
