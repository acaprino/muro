"""Emit a native Hermes plugin; the host owns prompt assembly and permissions."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path


_REGISTER_SKILLS = '''"""Generated native Hermes registration. No work runs until the host loads it."""
from pathlib import Path


def register(ctx):
    root = Path(__file__).resolve().parent
    for skill in sorted((root / "skills").glob("*/SKILL.md")):
        ctx.register_skill(skill.parent.name, skill)
'''


# Hermes accepts at most 4,000 characters in one system prompt section and 8,000 in all of
# them, and skips what is over (hermes_cli/plugins_dispatch.py, read at upstream 34ecc0fa,
# 2026-11-12). A longer policy keeps its words and changes channel: `pre_llm_call`, whose
# return the host appends to the turn's user message and replays with it.
_SECTION_LIMIT = 4000
# The host spills one hook return over `hooks.output_spill.max_chars` (default 10,000) to disk.
_PIECE_LIMIT = 8000

_TURN_HOOK = '''
    pieces = []
    for paragraph in policy.strip().split("\\n\\n"):
        if pieces and len(pieces[-1]) + 2 + len(paragraph) <= %d:
            pieces[-1] += "\\n\\n" + paragraph
        else:
            pieces.append(paragraph)

    def sent(piece, history):
        for message in history or ():
            if not isinstance(message, dict):
                continue
            for value in (message.get("api_content"), message.get("content")):
                parts = value if isinstance(value, list) else [value]
                for part in parts:
                    text = part.get("text") if isinstance(part, dict) else part
                    if isinstance(text, str) and piece in text:
                        return True
        return False

    def deliver(piece):
        # Once per session, and again when compression dropped it; never the same text twice.
        def policy_context(conversation_history=None, **_):
            return None if sent(piece, conversation_history) else {"context": piece}
        return policy_context

    for piece in pieces:
        ctx.register_hook("pre_llm_call", deliver(piece))
''' % _PIECE_LIMIT


def write_hermes_adapter(root: Path, plugin: dict, has_policy: bool) -> None:
    """Package existing skills and the declared policy without touching host state."""
    manifest = {
        "name": plugin["slug"],
        "version": plugin["version"],
        "description": f"{plugin['name']} - unified multi-host coordinator plugin",
        "author": "Muro contributors",
    }
    # JSON is a YAML subset; generation needs no YAML library or host dependencies.
    (root / "plugin.yaml").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    registration = _REGISTER_SKILLS
    if has_policy:
        section_id = plugin["slug"] + ".always-on"
        if len(section_id) > 128:
            # Hermes bounds IDs; retain readable identity without merging long shared prefixes.
            suffix = "." + hashlib.sha256(plugin["slug"].encode("utf-8")).hexdigest() + ".always-on"
            section_id = plugin["slug"][:128 - len(suffix)] + suffix
        registration += f'''
    register_section = getattr(ctx, "register_system_prompt_section", None)
    if not callable(register_section):
        import warnings
        warnings.warn(
            {plugin["name"] + " always-on policy is not active: upgrade Hermes to a version with " + "register_system_prompt_section, then reload the plugin and start a new session. " + "The packaged skills remain available."!r},
            RuntimeWarning, stacklevel=2,
        )
        return
    # The build already bounded the policy (one allowance per contributing source); never cut it here.
    policy = (root / "policy.md").read_text(encoding="utf-8")
    if len(policy.strip()) <= {_SECTION_LIMIT}:
        register_section({section_id!r}, policy, position="after_memory", max_chars={_SECTION_LIMIT})
        return
''' + _TURN_HOOK
    (root / "__init__.py").write_text(registration, encoding="utf-8")
