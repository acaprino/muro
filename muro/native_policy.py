"""Native package entrypoints for AI-authored policy, without source code or host configuration writes."""
from __future__ import annotations

import json
from pathlib import Path


def _write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _servers_js(servers: list[dict], package_url: str) -> str:
    """The declared servers as JS data, with the package root of this install in place (ADR-0030).

    Neither host gives a plugin-root variable inside a server entry, so the module resolves its own location.
    """
    return ('const serverRoot = fileURLToPath(new URL(%s, import.meta.url));\n'
            # A function, not a string: replaceAll reads $$, $& and $' in a replacement string.
            'const place = (value) => value.replaceAll("<package_root>", () => serverRoot);\n'
            'const servers = %s.map((server) => ({...server, args: server.args.map(place),\n'
            '  env: Object.fromEntries(Object.entries(server.env).map(([key, value]) => [key, place(value)]))}));\n'
            % (json.dumps(package_url), json.dumps(list(servers), ensure_ascii=True, indent=2)))


def write_pi_adapter(root: Path, plugin: dict, has_policy: bool, servers: list[dict] = ()) -> None:
    """Expose the skills and, when declared, one structured Pi system-prompt section and the MCP servers."""
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
    if servers:
        manifest["pi"]["extensions"].append("./extensions/mcp.js")
        (root / "extensions").mkdir(exist_ok=True)
        # Pi does not save an extension's servers: they are registered again at every load.
        (root / "extensions" / "mcp.js").write_text(
            'import { fileURLToPath } from "node:url";\n\n'
            + _servers_js(servers, "../skills/" + plugin["command"])
            + '\nexport default function packageServers(pi) {\n'
            '  for (const {name, command, args, env} of servers) {\n'
            '    pi.registerMcpServer(name, {command, args, env});\n'
            '  }\n'
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


def write_opencode_adapter(root: Path, plugin: dict, has_policy: bool, servers: list[dict] = ()) -> None:
    """A dependency-free OpenCode V2 plugin: skills, optional outgoing system text and the declared MCP servers."""
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
    server_data = _servers_js(servers, "./skills/" + plugin["command"]) if servers else ""
    server_setup = '''    await ctx.mcp.transform((editor) => {
      for (const {name, command, args, env} of servers) {
        editor.set(name, {type: "local", command: [command, ...args], environment: env});
      }
    });
''' if servers else ""
    (root / "index.js").write_text(
        'import { readFileSync } from "node:fs";\n'
        'import { fileURLToPath } from "node:url";\n\n'
        'const skills = JSON.parse(readFileSync(new URL("./skills.json", import.meta.url), "utf8"));\n'
        + policy_read + server_data + '\nexport default {\n'
        f'  id: {json.dumps(plugin["slug"])},\n'
        '  async setup(ctx) {\n'
        '    await ctx.skill.transform((editor) => {\n'
        '      for (const skill of skills) {\n'
        '        editor.add({...skill, path: fileURLToPath(new URL(skill.path, import.meta.url))});\n'
        '      }\n'
        '    });\n'
        + policy_hooks + server_setup + '  },\n};\n', encoding="utf-8")
