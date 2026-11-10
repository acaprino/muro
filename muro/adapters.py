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
description: {name} AI-routed coordinator for the capabilities in its catalog. Classify requests by meaning before selecting work; load one capability per step. Never invoke original absorbed skills.
---

# {name} coordinator

The offline `GUIDE.html` beside this file explains this release's decision graph,
commands, intents and handoffs. It is documentation, not an activation mechanism.

1. Read the user's task and relevant project context. Run:
   `python {launcher} plan --task "<user task>" --project "<current project>"`.
2. The result is `classification-required`: follow its `instructions` from
   `prompts/classify.md` and reason over the returned compact catalog. YOU are the
   AI classifier. Interpret outcomes, negations and constraints; never use keyword
   matching or ask the user to classify skills.
   Check required tools and hook policies for selected capabilities and prerequisites
   against this host's actual integrations and permissions; never auto-register hooks.
   Save the required JSON response locally, preserving context.task,
   context.stack_tokens and context.catalog_digest.
   Repeat the command with `--classification "<json-file>"` and the same stack options.
   A `no_match` or `needs_clarification` result stops execution; explain or ask its
   questions. Never silently substitute a coordinator or another variant.
3. If `direct`, apply only its instructions and run its checks; no work map or
   record call is needed. If `confirm`, show its ordered plan and obtain one-line
   approval unless already authorized. Repeat with --classification and --confirm.
   Use `resume` for an existing map; --new archives evidence when confirming a
   freshly classified task. Read only the returned active capability body.
4. Perform the returned step using the host's tools. Do not load other capabilities.
   Replace `<package_root>` in its instructions with the returned `package_root`;
   helper paths never resolve against the user's project.
   When the step needs a runtime dependency that is missing (a package, a
   command-line tool, an application), install it as the instructions say: state
   in one line what is installed, from where and to where, then check it answers
   and continue. Do not stop to ask whether to install and do not switch to
   another engine; a failed install blocks only the work that depends on it.
   On Claude Code use an isolated Agent when helpful; Codex may use `spawn_agent`
   with `fork_turns: "none"`; OpenCode may use `subagent`; Hermes may use
   `delegate_task`; Pi executes sequentially in the main session.
5. For a mapped step, write required output keys as JSON strings and call
   `python {launcher} record --project "<current project>" --map-id <map_id> --capability <capability> --outputs <json-file>`,
   copying `map_id` and `capability` from that step's result. Never edit the managed
   map or state files yourself, invent outputs or overwrite earlier ones. A stale
   map or wrong-step error means the evidence belongs to other work: stop and report
   it; never resubmit it under another binding. The next result gives the next step.
6. At completion run the returned `## Checks` with real tools. For a map, record each
   result separately using `check --project "<current project>" --map-id <map_id> --capability <owner> --result <json-file>`,
   taking the owner from `checks_by_capability`. Each JSON object must be
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
        shutil.copytree(dist / "prompts", skill_dir / "prompts")
        shutil.copytree(dist / "LICENSES", skill_dir / "LICENSES")
        shutil.copy2(dist / "NOTICE.md", skill_dir / "NOTICE.md")
        shutil.copy2(dist / "sources.json", skill_dir / "sources.json")
        shutil.copy2(dist / "GUIDE.html", skill_dir / "GUIDE.html")
        shutil.copy2(dist / "guide-examples.json", skill_dir / "guide-examples.json")
        if (dist / "scripts").is_dir():
            shutil.copytree(dist / "scripts", skill_dir / "scripts")
        (root / "INSTALL.md").write_text(
            f"# {plugin['name']} on {host}\n\n"
            f"Install the complete folder `skills/{plugin['command']}` as one skill; do not copy only SKILL.md. "
            "It includes its runtime, capabilities, license notices and offline `GUIDE.html`. "
            f"Open `skills/{plugin['command']}/GUIDE.html` for this release's illustrated decision graph and commands. "
            "The universal fallback is `python muro.py` inside that folder. "
            "See README.md in the source project for current verification limits.\n",
            encoding="utf-8")
        if host == "claude-code":
            (root / ".claude-plugin").mkdir()
            (root / ".claude-plugin" / "plugin.json").write_text(json.dumps(plugin_doc, indent=2), encoding="utf-8")
