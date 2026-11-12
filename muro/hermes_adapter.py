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
    register_section({section_id!r}, policy, position="after_memory", max_chars=len(policy))
'''
    (root / "__init__.py").write_text(registration, encoding="utf-8")
