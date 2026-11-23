"""Delivery form: structure checks and host files for AI-authored decisions (no form is chosen in Python)."""
from __future__ import annotations

import base64
import json
import re
from pathlib import Path
from typing import Any

from .argv_template import literal_parts, template_errors
from .custom_instructions import metadata_errors, reference_errors, validate_binding

DELIVERY_FILE = "delivery.json"
FORMS = ("capability", "always-on", "hook", "mcp-server", "package-tool", "dropped")
# Text every receiving prompt pays for, so it is bounded. The budget grows with the sources the AI gave a
# permanent place: one allowance for each source with an always-on decision (owner, 2026-11-12).
# The allowance is sized so a real always-on source fits in its own words: content is never shortened to fit
# (the larger of Marionette's two, i-have-adhd, is about 7000 characters). Exact token cost depends on the model.
ALWAYS_ON_PER_SOURCE = 6000
# Arbitrary source command hooks; native prompt registration is supported on every host.
HOOK_HOSTS = ("claude-code", "codex")
KNOWN_HOSTS = ("claude-code", "codex", "pi", "opencode", "hermes")
SESSION_MATCHER = "startup|resume|clear|compact|fork"


def always_on_limit(document: Any) -> int:
    """Characters `always_on` may hold: one allowance per source with an always-on decision. Counts, never judges."""
    decisions = document.get("decisions") if isinstance(document, dict) else None
    sources = {item["source"] for item in decisions if isinstance(item, dict) and item.get("form") == "always-on"
               and isinstance(item.get("source"), str)} if isinstance(decisions, list) else set()
    sources = {"custom-instructions" if source.startswith("custom-instructions/") else source for source in sources}
    return ALWAYS_ON_PER_SOURCE * len(sources)
_DECISION_KEYS = {"source", "content", "form", "targets", "reason"}
_WIRING_KEYS = {"host", "capability", "event", "matcher", "run"}
_WIRING_OPTIONAL = {"timeout"}
# One declaration per server, host-neutral: each adapter writes the form its host reads (ADR-0030).
_SERVER_KEYS = {"name", "source", "run"}
_SERVER_OPTIONAL = {"env"}
_SERVER_NAME = re.compile(r"[a-z][a-z0-9-]{0,63}")
_ENV_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
_PACKAGE_ROOT = "<package_root>"
# A packaged path inside a value: alone, after `--option=`, or in a list joined by `;` or `:`.
_PACKAGED_PATH = re.compile(re.escape(_PACKAGE_ROOT) + r"/([^;:]*)")
_RESERVED_ENV = ("PLUGIN_ROOT", "PLUGIN_DATA")   # an Agent Plugins host drops a server that sets them
MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json"
# One server for the whole package, its tools declared as data; the owner's answer that precedes it is recorded.
_DOCUMENT_KEYS = {"decisions", "always_on", "hooks", "mcp_servers", "package_server", "server_choice",
                  "custom_instructions"}
_PACKAGE_SERVER_KEYS = {"name", "children", "tools"}
_TOOL_KEYS = {"name", "source", "description", "input_schema"}
_TOOL_OPTIONAL = {"annotations", "timeout", "env"}
_TOOL_COMMANDS = {"forward", "run"}
_TOOL_NAME = re.compile(r"[a-z][a-z0-9_]{0,39}")
_FORWARDED_NAME = re.compile(r"[A-Za-z0-9_-]{1,64}")   # a forwarded tool keeps the child's name, whatever its spelling
PACKAGE_SERVER_FILE = "package-server.json"   # the two sections the server reads at start, beside `muro.py`
PACKAGE_SERVER_ACTION = "tools-server"
PACKAGE_SERVER_HOSTS = ("claude-code",)   # run live there; the other hosts keep what they register today
_CHOICE_KEYS = {"asked_on", "answer", "given_on"}
_DATE = re.compile(r"\d{4}-\d{2}-\d{2}", re.ASCII)
_COMMIT = re.compile(r"[0-9a-fA-F]{7,}")


def load_delivery(package_dir: Path, *, packaged: bool = False) -> dict[str, Any] | None:
    """The package's delivery document, or None: then everything is an on-demand capability and nothing registers."""
    path = package_dir / DELIVERY_FILE
    document = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None
    validate_binding(package_dir, document, packaged=packaged)
    return document


def session_text(document: dict[str, Any] | None) -> str:
    return (document or {}).get("always_on", "") or ""


def mcp_servers(document: dict[str, Any] | None) -> list[dict[str, Any]]:
    """The MCP servers a release registers: the ones its delivery document declares, and no other."""
    return (document or {}).get("mcp_servers", []) or []


def package_server(document: dict[str, Any] | None) -> dict[str, Any] | None:
    """The package's one declared server, or None: then every declared server registers as itself."""
    return (document or {}).get("package_server")


def server_sections(document: dict[str, Any] | None) -> dict[str, Any]:
    """What the package server reads at start: its own declaration and the servers it may start as children."""
    return {"package_server": package_server(document), "mcp_servers": mcp_servers(document)}


def place_package_root(value: str, package_root: str) -> str:
    return value.replace(_PACKAGE_ROOT, package_root)


def placed_env(declared: dict[str, Any], package_root: str) -> dict[str, str]:
    """What a declared server or tool adds to the environment, with the package root in place."""
    return {name: place_package_root(value, package_root) for name, value in declared.get("env", {}).items()}


def server_launch(server: dict[str, Any], package_root: str) -> dict[str, Any]:
    """One declared server as a program, its arguments and its environment, with the package root in place."""
    return {"command": server["run"][0], "args": [place_package_root(part, package_root) for part in server["run"][1:]],
            "env": placed_env(server, package_root)}


def placeholder_launches(document: dict[str, Any] | None) -> list[dict[str, Any]]:
    """The declared servers for a host whose plugin resolves its own location in code (Pi, OpenCode)."""
    return [{"name": server["name"], **server_launch(server, _PACKAGE_ROOT)} for server in mcp_servers(document)]


def registered_servers(document: dict[str, Any] | None, host: str) -> list[dict[str, Any]]:
    """What a host registers: on a package-server host the package server stands for its children."""
    declaration = package_server(document)
    if declaration is None or host not in PACKAGE_SERVER_HOSTS:
        return mcp_servers(document)
    kept = [server for server in mcp_servers(document) if server["name"] not in declaration["children"]]
    return [*kept, {"name": declaration["name"], "run": ["python", f"{_PACKAGE_ROOT}/muro.py", PACKAGE_SERVER_ACTION]}]


def claude_code_mcp(document: dict[str, Any] | None, command: str) -> dict[str, Any] | None:
    """The `.mcp.json` a Claude Code plugin registers when enabled, or None when no server is declared."""
    root = f"${{CLAUDE_PLUGIN_ROOT}}/skills/{command}"
    servers = {server["name"]: server_launch(server, root) for server in registered_servers(document, "claude-code")}
    return {"mcpServers": servers} if servers else None


def agent_plugins_mcp(document: dict[str, Any] | None, package_root: str) -> dict[str, Any] | None:
    """The `mcp.json` of an Agent Plugins v1 package (Codex, Hermes), or None when no server is declared."""
    servers = {server["name"]: {"type": "stdio", **server_launch(server, package_root)}
               for server in mcp_servers(document)}
    return {"$schema": MCP_SCHEMA, "mcpServers": servers} if servers else None


def _path_errors(label: str, source: str, values: list[str], package_dir: Path) -> list[str]:
    errors = []
    own = f"scripts/{source}/"
    for value in values:
        for relative in _PACKAGED_PATH.findall(value):
            # Its own source's folder is all a server may name: a host that installs the servers as a
            # package of their own (Hermes) carries nothing else.
            if ".." in relative.split("/") or not (relative + "/").startswith(own):
                errors.append(f"{label} names a path outside {own}: {relative}")
            elif not (package_dir / relative).exists():
                errors.append(f"{label} names a file that is not packaged: {relative}")
    return errors


def packaged_path_errors(document: dict[str, Any] | None, package_dir: Path) -> list[str]:
    """A declared server, and a tool that runs a command, must start from files the release carries. A path check."""
    errors = []
    for server in mcp_servers(document):
        errors += _path_errors(f"mcp server {server['name']}", server["source"],
                               [*server["run"], *server.get("env", {}).values()], package_dir)
    for tool in (package_server(document) or {}).get("tools", []):
        if "run" in tool:
            errors += _path_errors(f"package tool {tool['name']}", tool["source"],
                                   [*literal_parts(tool["run"]), *tool.get("env", {}).values()], package_dir)
    return errors


def package_server_gate_errors(document: dict[str, Any] | None, sources: list[dict[str, Any]]) -> list[str]:
    """The build's gate: a package server is released only on the owner's answer, given on the sources as pinned."""
    declaration = package_server(document)
    if declaration is None:
        return []
    if "server_choice" not in document:
        return ["the package server needs the owner's recorded answer (server_choice)"]
    recorded = document["server_choice"]["given_on"]["sources"]
    pinned = {source["id"]: source["commit"] for source in sources}
    used = {tool["source"] for tool in declaration["tools"]}
    used |= {server["source"] for server in mcp_servers(document) if server["name"] in declaration["children"]}
    errors = [f"the owner's answer does not cover source {source}" for source in sorted(used - recorded.keys())]
    errors += [f"the owner's answer was given on {source} at {commit}, now pinned at {pinned[source][:8]}: ask again"
               for source, commit in recorded.items()
               if source in pinned and not pinned[source].lower().startswith(commit.lower())]
    shown = document["server_choice"]["given_on"]["shown"]   # a tool added at an unchanged commit needs the answer too
    return errors + [f"the owner's answer does not cover tool {tool['name']}: ask again"
                     for tool in declaration["tools"] if tool["name"] not in shown]


def _text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _run_errors(run: Any, label: str) -> list[str]:
    """A declared command is literal argv, for a hook and for a server alike."""
    if not isinstance(run, list) or not run or any(not _text(part) for part in run):
        return [f"{label}: run must be a nonempty list of command parts"]
    errors = []
    if any(ch.isspace() for ch in run[0]) or '"' in run[0]:
        errors.append(f"{label}: the program (first part of run) must be one bare word")
    if any('"' in part for part in run[1:]):
        errors.append(f"{label}: a run argument must not contain a double quote")
    return errors


def _program_errors(run: Any, label: str) -> list[str]:
    """Codex and Hermes accept only a bare program name, and no host form substitutes the program."""
    if isinstance(run, list) and run and isinstance(run[0], str) and _PACKAGE_ROOT in run[0]:
        return [f"{label}: the program (first part of run) is a command on the host, never a "
                f"{_PACKAGE_ROOT} path; pass the packaged file as an argument"]
    return []


def _env_errors(env: Any, label: str) -> list[str]:
    """The environment of a server or of a command: plain names, text values, nothing a host sets itself."""
    if not isinstance(env, dict):
        return [f"{label}: env must be an object of names and text values"]
    if any(not isinstance(key, str) or not _ENV_NAME.fullmatch(key) for key in env):
        return [f"{label}: env names must be plain variable names"]
    if any(not isinstance(value, str) for value in env.values()):
        return [f"{label}: env values must be text"]
    if any(key.upper() in _RESERVED_ENV for key in env):
        return [f"{label}: env names {' and '.join(_RESERVED_ENV)} are reserved by the hosts, "
                "which set them for the server"]
    return []


def _server_errors(servers: Any, source_ids: set[str], server_sources: set[str]) -> list[str]:
    """Shape and references of the declared servers; which source ships a server is the AI's decision."""
    if not isinstance(servers, list):
        return ["mcp_servers must be an array of server declarations"]
    errors: list[str] = []
    names: set[str] = set()
    declared: set[str] = set()
    for server in servers:
        if not isinstance(server, dict) or set(server) - _SERVER_OPTIONAL != _SERVER_KEYS:
            errors.append("each mcp server requires exactly name, source and run, and may add env")
            continue
        name, source = server["name"], server["source"]
        if not isinstance(name, str) or not _SERVER_NAME.fullmatch(name):
            errors.append(f"mcp server {name}: name must be lowercase letters, digits and hyphens, starting with a letter")
        elif name in names:
            errors.append(f"mcp server {name} is declared twice")
        else:
            names.add(name)
        if not isinstance(source, str) or source not in source_ids:
            errors.append(f"mcp server {name} names unknown source {source}")
        elif source not in server_sources:
            errors.append(f"mcp server {name}: source {source} has no mcp-server decision")
        else:
            declared.add(source)
        errors += _run_errors(server["run"], f"mcp server {name}")
        errors += _program_errors(server["run"], f"mcp server {name}")
        errors += _env_errors(server.get("env", {}), f"mcp server {name}")
    for source in sorted(server_sources - declared):
        errors.append(f"source {source} has an mcp-server decision but declares no server")
    return errors


def _tool_errors(tools: list, children: list[str], declared: dict[str, Any]) -> list[str]:
    """The tools of the package server: each one's own shape, then the rules that hold between them."""
    errors: list[str] = []
    seen: set[str] = set()
    # The name a tool has before a collision is resolved: its child's own for a forwarded tool.
    natural = [t["forward"].get("tool") if isinstance(t.get("forward"), dict) else t.get("name")
               for t in tools if isinstance(t, dict)]
    for tool in tools:
        keys = set(tool) if isinstance(tool, dict) else set()
        if not _TOOL_KEYS <= keys or keys - _TOOL_KEYS - _TOOL_OPTIONAL - _TOOL_COMMANDS \
                or len(keys & _TOOL_COMMANDS) != 1:
            errors.append("each package tool requires name, source, description and input_schema, exactly one of "
                          "forward and run, and may add annotations, timeout and env")
            continue
        name = tool["name"]
        label = f"package_server tool {name}"
        spelling = _FORWARDED_NAME if "forward" in tool else _TOOL_NAME
        if not isinstance(name, str) or not spelling.fullmatch(name):
            errors.append(f"package_server tool name must match {spelling.pattern}: {name}")
        elif name in seen:
            errors.append(f"{label} is declared twice")
        else:
            seen.add(name)
        if not _text(tool["source"]):
            errors.append(f"{label}: source must be a source id")
        if not _text(tool["description"]):
            errors.append(f"{label}: description must be nonempty text")
        schema = tool["input_schema"]
        if "run" not in tool and (not isinstance(schema, dict) or schema.get("type") != "object"):
            errors.append(f'{label}: input_schema must be an object with "type": "object"')
        annotations = tool.get("annotations", {})
        if not isinstance(annotations, dict) or any(not isinstance(value, bool) for value in annotations.values()):
            errors.append(f"{label}: annotations values are true or false, in an object of hint names")
        if "forward" in tool:
            errors += [f"{label}: {key} applies to a run tool" for key in ("timeout", "env") if key in tool]
            errors += _forward_errors(tool, label, children, declared, natural)
            continue
        if "timeout" in tool and (type(tool["timeout"]) is not int or tool["timeout"] < 1):
            errors.append(f"{label}: timeout must be a positive number of whole seconds")
        if "env" in tool:
            errors += _env_errors(tool["env"], label)
        errors += _run_errors(literal_parts(tool["run"]), label) + _program_errors(tool["run"], label)
        errors += template_errors(tool["run"], schema, label)
    return errors


def _forward_errors(tool: dict, label: str, children: list[str], declared: dict[str, Any],
                    natural: list) -> list[str]:
    forward = tool["forward"]
    if not isinstance(forward, dict) or set(forward) != {"server", "tool"} \
            or not isinstance(forward["server"], str) or not _text(forward["tool"]):
        return [f"{label}: forward must be an object with exactly server and tool, both text"]
    server, child_tool = forward["server"], forward["tool"]
    errors = []
    if server not in children:
        errors.append(f"{label}: forwards to a server that is not a child: {server}")
    elif server in declared and tool["source"] != declared[server].get("source"):
        errors.append(f"{label}: its source must be the source of its child {server}, "
                      f"{declared[server].get('source')}")
    if tool["name"] != child_tool and natural.count(child_tool) < 2:
        errors.append(f"{label}: a forwarded tool keeps the child's tool name ({child_tool}) unless two tools of the "
                      "server would share a name")
    return errors


def server_section_errors(sections: Any) -> list[str]:
    """Every check of the package server's declaration that needs neither the capabilities nor the manifest."""
    if not isinstance(sections, dict):
        return ["the server sections must be an object with package_server and mcp_servers"]
    declaration = sections.get("package_server")
    if declaration is None:
        return []
    servers = sections.get("mcp_servers")
    declared = {s["name"]: s for s in servers if isinstance(s, dict) and isinstance(s.get("name"), str)} \
        if isinstance(servers, list) else {}
    if not isinstance(declaration, dict) or set(declaration) != _PACKAGE_SERVER_KEYS:
        return ["package_server requires exactly name, children and tools"]
    name, children, tools = declaration["name"], declaration["children"], declaration["tools"]
    errors: list[str] = []
    if not isinstance(children, list) or any(not isinstance(child, str) for child in children):
        errors.append("package_server children must be a list of server names")
        children = []
    else:
        errors += [f"package_server children names a server that is not declared: {child}"
                   for child in dict.fromkeys(children) if child not in declared]
        errors += [f"package_server children names {child} twice" for child in dict.fromkeys(children)
                   if children.count(child) > 1]
    if not isinstance(name, str) or not _SERVER_NAME.fullmatch(name):
        errors.append("package_server name must be lowercase letters, digits and hyphens, starting with a letter")
    elif name in declared and name not in children:
        errors.append(f"package_server name {name} shares its name with a registered server")
    if not isinstance(tools, list) or not tools:
        return errors + ["package_server tools must be a nonempty list of tool declarations"]
    return errors + _tool_errors(tools, children, declared)


def _tool_reference_errors(document: dict[str, Any], source_ids: set[str], tool_sources: set[str]) -> list[str]:
    """The sources the package server's tools name, against the sources and the package-tool decisions."""
    declaration = package_server(document)
    tools = declaration.get("tools") if isinstance(declaration, dict) else None
    errors: list[str] = []
    runs: dict[str, str] = {}
    for tool in tools if isinstance(tools, list) else []:
        source = tool.get("source") if isinstance(tool, dict) else None
        if not isinstance(source, str):
            continue
        if source not in source_ids:
            errors.append(f"package_server tool {tool.get('name')} names unknown source {source}")
        if "run" in tool:
            runs.setdefault(source, str(tool.get("name")))
    errors += [f"source {source} has no package-tool decision, and tool {tool} runs its commands"
               for source, tool in runs.items() if source in source_ids and source not in tool_sources]
    errors += [f"source {source} has a package-tool decision but no tool runs its commands"
               for source in sorted(tool_sources - set(runs))]
    return errors


def _choice_errors(choice: Any, source_ids: set[str]) -> list[str]:
    """The owner's recorded answer: a date, their words, and the evidence it was given on."""
    if not isinstance(choice, dict) or set(choice) != _CHOICE_KEYS:
        return ["server_choice requires exactly asked_on, answer and given_on"]
    errors = []
    if not isinstance(choice["asked_on"], str) or not _DATE.fullmatch(choice["asked_on"]):
        errors.append("server_choice asked_on must be a date written YYYY-MM-DD")
    if not _text(choice["answer"]):
        errors.append("server_choice answer must be nonempty text, the owner's own words")
    given = choice["given_on"]
    if not isinstance(given, dict) or set(given) != {"sources", "shown"}:
        return errors + ["server_choice given_on requires exactly sources and shown"]
    sources = given["sources"]
    if not isinstance(sources, dict):
        errors.append("server_choice given_on sources must be an object of source ids and commits")
        sources = {}
    for source, commit in sources.items():
        if source not in source_ids:
            errors.append(f"server_choice given_on names unknown source {source}")
        if not isinstance(commit, str) or not _COMMIT.fullmatch(commit):
            errors.append(f"server_choice given_on: the commit of {source} must be at least 7 hex characters")
    if not isinstance(given["shown"], list) or any(not _text(item) for item in given["shown"]):
        errors.append("server_choice given_on shown must be a list of the tool and command names shown")
    return errors


def validate_delivery(document: Any, capabilities: list, source_ids: set[str]) -> list[str]:
    """Check shape, references and that every declared form has something behind it. Forms stay the AI's decision."""
    if not isinstance(document, dict) or "decisions" not in document or set(document) - _DOCUMENT_KEYS:
        return ["delivery.json must be an object with decisions and only decisions, always_on, hooks, mcp_servers, "
                "package_server, server_choice and custom_instructions"]
    custom = document.get("custom_instructions")
    if "custom_instructions" in document:
        errors = metadata_errors(custom)
        if errors:
            return errors
        if "custom-instructions" in source_ids or any(isinstance(s, str) and s.startswith("custom-instructions/") for s in source_ids):
            return ["custom-instructions is reserved for owner Markdown, not an upstream source id"]
        source_ids = source_ids | set(custom["files"])
    decisions = document["decisions"]
    if not isinstance(decisions, list) or not decisions:
        return ["delivery.json decisions must be a nonempty array"]
    known = {cap.id: cap for cap in capabilities}
    errors: list[str] = reference_errors(document, capabilities)
    decided_sources: set[str] = set()
    forms: set[str] = set()
    hook_targets: set[str] = set()
    server_sources: set[str] = set()
    tool_sources: set[str] = set()
    for item in decisions:
        if not isinstance(item, dict) or set(item) != _DECISION_KEYS:
            errors.append("each decision requires exactly source, content, form, targets and reason")
            continue
        source, form, targets = item["source"], item["form"], item["targets"]
        if not isinstance(source, str) or source not in source_ids:
            errors.append(f"decision names unknown source {source}")
        else:
            decided_sources.add(source)
        if not _text(item["content"]) or not _text(item["reason"]):
            errors.append(f"decision for {source}: content and reason must be nonempty text")
        if not isinstance(form, str) or form not in FORMS:
            errors.append(f"decision for {source}: form must be one of {', '.join(FORMS)}")
            continue
        forms.add(form)
        if not isinstance(targets, list) or any(not isinstance(t, str) for t in targets):
            errors.append(f"decision for {source}: targets must be a list of capability ids")
            continue
        for target in targets:
            if target not in known:
                errors.append(f"decision for {source}: unknown capability {target}")
        if form in ("capability", "hook", "mcp-server", "package-tool") and not targets:
            errors.append(f"decision for {source}: form {form} needs at least one target capability")
        if form in ("dropped", "always-on") and targets:
            errors.append(f"decision for {source}: form {form} takes no targets")
        if form == "hook":
            hook_targets.update(t for t in targets if t in known)
        if form == "mcp-server" and isinstance(source, str):
            server_sources.add(source)
        if form == "package-tool" and isinstance(source, str):
            tool_sources.add(source)
    for missing in sorted(source_ids - decided_sources):
        errors.append(f"source {missing} has no delivery decision: every intake records what it became and why")

    text = document.get("always_on")
    if "always-on" in forms and text is None:
        errors.append("a decision has form always-on but the always_on text is missing")
    if text is not None:
        if "always-on" not in forms:
            errors.append("always_on text is present but no decision has form always-on")
        if not _text(text):
            errors.append("always_on must be nonempty text")
        else:
            limit = always_on_limit(document)
            if limit and len(text) > limit:
                errors.append(f"always_on exceeds {limit} characters ({ALWAYS_ON_PER_SOURCE} for each source with "
                              f"an always-on decision, {limit // ALWAYS_ON_PER_SOURCE} here): every session pays for it")

    wirings = document.get("hooks", [])
    if not isinstance(wirings, list):
        return errors + ["hooks must be an array of wirings"]
    wired: set[str] = set()
    for wiring in wirings:
        if not isinstance(wiring, dict) or set(wiring) - _WIRING_OPTIONAL != _WIRING_KEYS:
            errors.append("each hook wiring requires exactly host, capability, event, matcher and run, "
                          "and may add timeout")
            continue
        if "timeout" in wiring and (type(wiring["timeout"]) is not int or wiring["timeout"] < 1):
            errors.append(f"hook wiring for {wiring['capability']}: timeout must be a positive number of whole "
                          "seconds, the one the source declares for its hook")
        host, capability, run = wiring["host"], wiring["capability"], wiring["run"]
        if not isinstance(host, str) or host not in KNOWN_HOSTS:
            errors.append(f"hook wiring names unknown host {host}")
        elif host not in HOOK_HOSTS:
            errors.append(f"this factory does not register hooks on {host} (only on {', '.join(HOOK_HOSTS)}): "
                          "say so in the decision's reason instead of declaring a wiring")
        if not isinstance(capability, str) or capability not in known:
            errors.append(f"hook wiring names unknown capability {capability}")
        elif capability not in hook_targets:
            errors.append(f"hook wiring for {capability} has no hook decision that targets it")
        else:
            wired.add(capability)
        if not _text(wiring["event"]):
            errors.append(f"hook wiring for {capability}: event must be the host's event name")
        if not isinstance(wiring["matcher"], str):
            errors.append(f"hook wiring for {capability}: matcher must be a string (empty for every occurrence)")
        errors += _run_errors(run, f"hook wiring for {capability}")
    for capability in sorted(hook_targets):
        if not any(h.get("policy") == "active" for h in known[capability].hooks):
            errors.append(f"capability {capability} is a hook target but its catalog declares no hook with policy active")
        if capability not in wired:
            errors.append(f"capability {capability} has a hook decision but no wiring for any host")
    for cap in capabilities:
        if cap.id not in hook_targets and any(h.get("policy") == "active" for h in cap.hooks):
            errors.append(f"capability {cap.id} declares an active hook but no hook decision targets it")
    errors += _server_errors(document.get("mcp_servers", []), source_ids, server_sources)
    errors += server_section_errors(server_sections(document))
    errors += _tool_reference_errors(document, source_ids, tool_sources)
    return errors + (_choice_errors(document["server_choice"], source_ids) if "server_choice" in document else [])


def unregistered_active_hooks(capabilities: list) -> list[str]:
    """Without a delivery document nothing registers, so the catalog cannot call a hook active."""
    return [f"capability {cap.id} declares an active hook but the package has no {DELIVERY_FILE}"
            for cap in capabilities if any(h.get("policy") == "active" for h in cap.hooks)]


def allows_empty_catalog(document: Any, capabilities: list, source_ids: set[str]) -> bool:
    """An explicit, valid permanent policy is a useful package without procedural skills."""
    return bool(document is not None and not validate_delivery(document, capabilities, source_ids)
                and session_text(document))


def _command(run: list[str], package_root: str) -> str:
    """Keep declared argv and installed paths out of the host's shell syntax.

    Only the constant Python trampoline reaches the shell. Its encoded data is
    decoded after dispatch; host root variables are expanded there, once, and
    the declared program inherits the hook's streams through shell=False.
    Windows batch files are rejected because the OS still dispatches them
    through cmd, which would reinterpret the arguments.
    """
    payload = base64.b64encode(json.dumps({"run": run, "root": package_root},
                                         ensure_ascii=True).encode("utf-8")).decode("ascii")
    script = (
        "import base64,json,os,shutil,string,subprocess,sys;"
        f"p=json.loads(base64.b64decode('{payload}'));"
        "root=string.Template(p['root']).substitute(os.environ);"
        "argv=[part.replace('<package_root>',root) for part in p['run']];"
        "program=shutil.which(argv[0]) or argv[0];"
        "sys.exit('Windows batch hooks require an explicit executable and script') "
        "if os.name=='nt' and os.path.splitext(program)[1].lower() in ('.bat','.cmd') else None;"
        "argv[0]=program;"
        "sys.exit(subprocess.run(argv,shell=False).returncode)"
    )
    return f'python -c "{script}"'


def _hook(wiring: dict[str, Any], package_root: str) -> dict[str, Any]:
    """One declared command hook as both hosts read it; the source's own timeout when the wiring carries one."""
    hook: dict[str, Any] = {"type": "command", "command": _command(wiring["run"], package_root)}
    if "timeout" in wiring:
        hook["timeout"] = wiring["timeout"]
    return hook


def claude_code_hooks(document: dict[str, Any] | None, slug: str, name: str) -> dict[str, Any] | None:
    """The `hooks/hooks.json` a Claude Code plugin registers when enabled, or None when nothing is declared."""
    if not document:
        return None
    package_root = f"${{CLAUDE_PLUGIN_ROOT}}/skills/{slug}"
    events: dict[str, list] = {}
    for wiring in document.get("hooks", []):
        if wiring["host"] != "claude-code":
            continue
        group: dict[str, Any] = {"hooks": [_hook(wiring, package_root)]}
        if wiring["matcher"]:
            group = {"matcher": wiring["matcher"], **group}
        events.setdefault(wiring["event"], []).append(group)
    if not events:
        return None
    return {"description": f"{name}: registered from this release's {DELIVERY_FILE}", "hooks": events}


def codex_hooks(document: dict[str, Any] | None, slug: str, name: str) -> dict[str, Any] | None:
    """Codex's native developer-instruction channel, plus explicitly declared source hooks."""
    if not document:
        return None
    package_root = f"${{PLUGIN_ROOT}}/skills/{slug}"
    events: dict[str, list] = {}
    if session_text(document):
        for event in ("SessionStart", "SubagentStart"):
            hook = {"type": "command", "command": _command(
                ["python", "<package_root>/muro.py", "session-context", "--hook-event", event], package_root)}
            group = {"hooks": [hook]}
            if event == "SessionStart":
                group["matcher"] = SESSION_MATCHER
            events[event] = [group]
    for wiring in document.get("hooks", []):
        if wiring["host"] != "codex":
            continue
        group: dict[str, Any] = {"hooks": [_hook(wiring, package_root)]}
        if wiring["matcher"]:
            group["matcher"] = wiring["matcher"]
        events.setdefault(wiring["event"], []).append(group)
    return {"description": f"{name}: declared delivery", "hooks": events} if events else None


# Where each host reads a plugin's servers (ADR-0030). Run live on 2026-11-21: Claude Code, Pi and OpenCode in a
# session, Codex up to `codex mcp list`; Hermes only through its own validator and loader.
_SERVER_CHANNELS = {
    "claude-code": "the plugin's `.mcp.json`, when the plugin is enabled",
    "codex": "the plugin's `mcp.json`",
    "pi": "`pi.registerMcpServer` in the package's `extensions/mcp.js`, at every load",
    "opencode": "the package plugin's `mcp.transform`",
    "hermes": ("the portable package in `../hermes-mcp`, a second plugin to install and enable beside this one "
               "(Hermes reads a plugin's servers only from a package whose one manifest is `plugin.json`; accepted by "
               "Hermes's own validator and loader, not run in a live Hermes session)"),
}


def _package_server_note(declaration: dict[str, Any], host: str, absorbed: bool) -> str:
    """Where the package server is registered: only on the hosts of PACKAGE_SERVER_HOSTS, and on no other."""
    name = declaration["name"]
    if host not in PACKAGE_SERVER_HOSTS:
        lead = "This host registers the absorbed servers as they are" if absorbed \
            else "This host registers no server of this package"
        return (f"{lead}: the package server `{name}` is registered only on Claude Code for now; "
                "this host is added after a live run on it.")
    children = ", ".join(f"`{child}`" for child in declaration["children"])
    served = (f"starts {children} itself, on the first call that needs it, and serves the tools this package declares"
              if children else "serves the commands this package declares")
    moved = (" Their ids changed with the server's name: a permission rule saved for the old ids no longer matches."
             if children else "")
    return f"The package server `{name}` {served}. Tools appear under the server `{name}`.{moved}"


def install_note(document: dict[str, Any] | None, host: str, command: str) -> str:
    """What this host's adapter registers by itself, and what it does not."""
    declaration = package_server(document)
    if not document or not (session_text(document) or document.get("hooks") or mcp_servers(document) or declaration):
        return ""
    notes = []
    channel = _SERVER_CHANNELS.get(host)
    servers = registered_servers(document, host)
    server_note = ""
    if servers and channel:
        names = ", ".join(f"`{server['name']}`" for server in servers)
        server_note = (f"MCP server {names}: registered automatically through {channel}, and started from this "
                       "package's own files. If a server with the same tools is already configured on this host "
                       "(the original this package absorbed), remove it: two copies offer the same tools twice.")
    if declaration:
        server_note = f"{server_note} {_package_server_note(declaration, host, bool(mcp_servers(document)))}".strip()
    if server_note:
        notes.append(server_note)
    if session_text(document):
        channels = {
            "claude-code": "a native `prompt.compose` module in `hooks/hooks.json`, adding a system-prompt section while preserving the host's other sections. Requires Claude Code mods (2.1.287+) enabled",
            "codex": "`SessionStart` and `SubagentStart` in `hooks/hooks.json`, adding developer instructions on startup, resume, clear, compaction, fork and subagent creation. Codex's own hook trust review and feature policy still apply",
            "pi": "the native `before_agent_start` extension, adding a named system-prompt section on each run, including after compaction and session changes. Requires Pi's structured `systemPromptOptions.sections` API",
            "opencode": "the native package plugin's system-context hooks, preserving existing system parts and messages. Requires OpenCode's package plugin API (verified on 2.2.5)",
            "hermes": ("`register_system_prompt_section`, preserving the host's core prompt, when the policy is at most 4,000 characters. Hermes accepts no more in one section (8,000 in all of them) and skips what is over, so a longer policy is never cut: it registers a `pre_llm_call` hook instead, and Hermes appends the whole text to the user message of the first turn and again after a compression removed it. That is the turn's context, not the system prompt. Hermes writes a hook return over `hooks.output_spill.max_chars` (default 10,000) to disk and shows a preview; the policy is sent in pieces of at most 8,000 characters, so keep that setting at 8,000 or more. " if len(session_text(document).strip()) > 4000 else "`register_system_prompt_section`, preserving the host's core prompt. ") + "Requires a Hermes version exposing that API; an older host reports an explicit warning instead of claiming activation. After updating a policy, start a new session: a resumed session may retain its persisted system prompt. Not run in a live Hermes conversation",
        }
        notes.append(f"The declared policy in `policy.md` registers automatically through {channels[host]}. "
                     "Install or load the complete adapter as a native plugin/package; copying only its skills does not load the policy. "
                     "The factory never edits host configuration or changes permissions.")
    wired = [w for w in document.get("hooks", []) if w["host"] == host]
    if wired:
        notes.append("The source command hooks declared for this host also register through `hooks/hooks.json`; other hosts' wirings do not run here. "
                     "Arguments are literal argv. Windows `.cmd`/`.bat` programs are rejected; declare the underlying executable and script directly.")
    elif document.get("hooks"):
        notes.append("This release's source command hooks target other hosts and do not run here.")
    return "\n\n" + "\n\n".join(notes) if notes else ""
