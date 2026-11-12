"""Emit Claude Code's native additive system-prompt module."""
from __future__ import annotations

import json
from pathlib import Path


def write_claude_policy(root: Path, plugin: dict) -> str | None:
    """Emit a mod for a staged adapter's policy.md; return its hooks-relative path.

    The caller owns hooks/hooks.json and merges the returned path into modules,
    alongside any declared event hooks. This writes no host settings. The policy
    is embedded at build time, so loading it needs no filesystem or process API.
    "session" is Claude's cache scope, not an agent-selection constraint.

    API: https://code.claude.com/docs/en/plugins/mods/reference
    """
    policy_path = root / "policy.md"
    if not policy_path.is_file():
        return None
    policy = policy_path.read_text(encoding="utf-8")
    if not policy.strip():
        return None
    section_id = json.dumps(f"{plugin['slug']}:policy")
    text = json.dumps(policy, ensure_ascii=True)
    module = f'''// Generated from this release's policy.md. Claude Code loads this ES module.
const POLICY = {{ id: {section_id}, text: {text}, scope: "session" }};

export function register(on) {{
  on("prompt.compose", async ($, event, next) => {{
    const prompt = await next(event);
    const sections = prompt.sections.filter(section => section.id !== POLICY.id);
    return {{ ...prompt, sections: [...sections, POLICY] }};
  }});
}}
'''
    hooks = root / "hooks"
    hooks.mkdir(parents=True, exist_ok=True)
    (hooks / "policy.mjs").write_text(module, encoding="utf-8")
    return "./policy.mjs"
