"""Native package entrypoints for AI-authored policy, without source code or host configuration writes."""
from __future__ import annotations

import json
from pathlib import Path


def _write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_pi_adapter(root: Path, plugin: dict, has_policy: bool) -> None:
    """Expose the skills and, when declared, one structured Pi system-prompt section."""
    manifest = {"name": plugin["slug"], "version": plugin["version"], "type": "module",
                "pi": {"skills": ["./skills"], "extensions": []}}
    if has_policy:
        manifest["pi"]["extensions"] = ["./extensions/policy.js"]
        (root / "extensions").mkdir(exist_ok=True)
        section = json.dumps("muro_policy_" + plugin["slug"])
        (root / "extensions" / "policy.js").write_text(
            'import { readFileSync } from "node:fs";\n\n'
            'const policy = readFileSync(new URL("../policy.md", import.meta.url), "utf8");\n'
            'export default function packagePolicy(pi) {\n'
            '  pi.on("before_agent_start", (event) => {\n'
            f'    event.systemPromptOptions.sections[{section}] = policy;\n'
            '  });\n'
            '}\n', encoding="utf-8")
    _write_json(root / "package.json", manifest)


def _packaged_skills(root: Path) -> list[dict]:
    """Compile only factory-generated SKILL frontmatter; never inspect absorbed source scripts."""
    skills = []
    for path in sorted((root / "skills").glob("*/SKILL.md")):
        text = path.read_text(encoding="utf-8")
        frontmatter, separator, body = text.removeprefix("---\n").partition("\n---\n")
        if not text.startswith("---\n") or not separator:
            raise ValueError(f"Generated skill has no frontmatter: {path}")
        fields = {}
        for line in frontmatter.splitlines():
            key, _, value = line.partition(":")
            if key in {"name", "description"}:
                value = value.strip()
                fields[key] = json.loads(value) if value.startswith('"') else value
        if not fields.get("name") or not fields.get("description"):
            raise ValueError(f"Generated skill needs a name and description: {path}")
        skills.append({"id": fields["name"], **fields, "path": path.relative_to(root).as_posix(),
                       "content": body.strip()})
    return skills


def write_opencode_adapter(root: Path, plugin: dict, has_policy: bool) -> None:
    """A dependency-free OpenCode V2 plugin: skills and optional outgoing system text."""
    _write_json(root / "package.json", {"name": plugin["slug"], "version": plugin["version"],
                                       "type": "module", "exports": {".": "./index.js"}})
    _write_json(root / "skills.json", _packaged_skills(root))
    policy_read = ('const policy = readFileSync(new URL("./policy.md", import.meta.url), "utf8");\n'
                   if has_policy else "")
    policy_hooks = '''    const appendPolicy = (event) => {
      if (!event.system.some((part) => part.type === "text" && part.text === policy)) {
        event.system.push({type: "text", text: policy});
      }
    };
    for (const kind of ["context", "compaction", "generate", "title"]) {
      await ctx.session.hook(kind, appendPolicy);
    }
''' if has_policy else ""
    (root / "index.js").write_text(
        'import { readFileSync } from "node:fs";\n'
        'import { fileURLToPath } from "node:url";\n\n'
        'const skills = JSON.parse(readFileSync(new URL("./skills.json", import.meta.url), "utf8"));\n'
        + policy_read + '\nexport default {\n'
        f'  id: {json.dumps(plugin["slug"])},\n'
        '  async setup(ctx) {\n'
        '    await ctx.skill.transform((editor) => {\n'
        '      for (const skill of skills) {\n'
        '        editor.add({...skill, path: fileURLToPath(new URL(skill.path, import.meta.url))});\n'
        '      }\n'
        '    });\n'
        + policy_hooks + '  },\n};\n', encoding="utf-8")
