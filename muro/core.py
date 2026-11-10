# muro/core.py
"""Pure core logic: validation, parsing, plan resolution. No I/O side effects."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
import json

# ----------------------------------------------------------------------
# Constants
# ----------------------------------------------------------------------
RESERVED_COMMANDS = {
    "help", "clear", "compact", "init", "review", "plan", "model",
    "config", "status", "mcp", "agent", "login", "logout", "doctor", "bug",
}

SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
COMMIT_PATTERN = re.compile(r"^[a-f0-9]{40}$")
# .svg is text (XML), not binary media
BINARY_EXTS = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4",
    ".woff", ".woff2", ".ttf", ".otf", ".ico"
}

MIT_MARKER = "Permission is hereby granted, free of charge"
APACHE_MARKER = "Apache License"
APACHE_VERSION_MARKER = "Version 2.0"

# ----------------------------------------------------------------------
# Data Classes
# ----------------------------------------------------------------------
@dataclass
class Capability:
    id: str
    role: str
    when: str
    after: list[str]
    outputs: list[str]
    checks: list[str]
    body: str
    path: Path
    intents: list[dict[str, Any]] = field(default_factory=list)
    tools: list[dict[str, Any]] = field(default_factory=list)
    hooks: list[dict[str, Any]] = field(default_factory=list)
    conflicts: list[str] = field(default_factory=list)

    @property
    def after_str(self) -> str:
        return ", ".join(self.after) if self.after else "—"

    @property
    def outputs_str(self) -> str:
        return ", ".join(self.outputs) if self.outputs else "—"


@dataclass
class RouterRow:
    id: str
    role: str
    when: str
    after: str  # stored as displayed string
    outputs: str
    intents: str = ""

    def after_list(self) -> list[str]:
        return [d.strip() for d in self.after.split(",") if d.strip() and d.strip() != "—"]

    def outputs_list(self) -> list[str]:
        return [o.strip() for o in self.outputs.split(",") if o.strip()]

    def intents_list(self) -> list[str]:
        return [i.strip() for i in self.intents.split(",") if i.strip()]


# ----------------------------------------------------------------------
# Plugin Identity Validation
# ----------------------------------------------------------------------
def validate_plugin_identity(plugin: dict[str, Any], installed_roots: list[Path] | None = None) -> list[str]:
    """Return identity errors, optionally checking caller-approved host roots."""
    errors: list[str] = []
    slug = plugin.get("slug", "")
    name = plugin.get("name", "")
    command = plugin.get("command", "")
    version = plugin.get("version", "")

    if not isinstance(slug, str) or not slug:
        errors.append("plugin.slug is required")
    elif not SLUG_PATTERN.match(slug):
        errors.append(f"plugin.slug must be kebab-case (lowercase, hyphens): {slug}")
    elif slug in RESERVED_COMMANDS:
        errors.append(f"plugin.slug '{slug}' is a reserved host command")
    elif slug.startswith(("claude-", "anthropic-", "anthropics-", "cc-plugin-")) or slug in {"claude", "anthropic", "anthropics", "claude-code", "claude-mods", "synced", "anthropic-skills"}:
        errors.append(f"plugin.slug '{slug}' is reserved by the host")

    if not isinstance(name, str) or not name.strip():
        errors.append("plugin.name is required")

    if not isinstance(command, str) or not command:
        errors.append("plugin.command is required")
    elif not SLUG_PATTERN.match(command):
        errors.append(f"plugin.command must be kebab-case: {command}")
    elif command in RESERVED_COMMANDS:
        errors.append(f"plugin.command '{command}' is a reserved host command")

    if not isinstance(version, str) or not version.strip():
        errors.append("plugin.version is required")

    for root in installed_roots or []:
        if not root.is_dir():
            errors.append(f"installed host root not found: {root}")
            continue
        for candidate in root.iterdir():
            if not candidate.is_dir():
                continue
            manifest = candidate / ".claude-plugin" / "plugin.json"
            if manifest.is_file():
                try:
                    other = json.loads(manifest.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    continue
                if other.get("name") == slug or candidate.name == slug:
                    errors.append(f"plugin.slug collides with installed plugin: {candidate}")
            for skill in candidate.glob("skills/*/SKILL.md"):
                if skill.parent.name == command:
                    errors.append(f"plugin.command collides with installed skill: {skill.parent}")
            if (candidate / "SKILL.md").is_file() and candidate.name == command:
                errors.append(f"plugin.command collides with installed skill: {candidate}")

    return errors


# ----------------------------------------------------------------------
# Capability Parsing
# ----------------------------------------------------------------------
CAP_FIELDS = ("id", "role", "when", "after", "outputs", "checks", "intents", "tools", "hooks", "conflicts")


def validate_intents(intents: Any) -> list[str]:
    """Validate the AI-authored catalog's shape, never its semantic classification."""
    if not isinstance(intents, list) or not intents:
        return ["intents must be a nonempty array of AI-authored records"]
    errors = []
    seen = set()
    for item in intents:
        if not isinstance(item, dict) or set(item) != {"id", "description", "excludes"}:
            errors.append("each intent requires exactly id, description and excludes")
            continue
        identifier = item["id"]
        if not isinstance(identifier, str) or not re.fullmatch(r"[a-z0-9]+(?:[.-][a-z0-9]+)*", identifier):
            errors.append("intent id must be a lowercase dotted or kebab-case identifier")
        elif identifier in seen:
            errors.append(f"duplicate intent id: {identifier}")
        else:
            seen.add(identifier)
        if not isinstance(item["description"], str) or not item["description"].strip():
            errors.append("intent description must be nonempty")
        if not isinstance(item["excludes"], list) or any(not isinstance(x, str) or not x.strip() for x in item["excludes"]):
            errors.append("intent excludes must be a list of nonempty strings")
    return errors

def validate_operations(tools: Any, hooks: Any) -> list[str]:
    """Host-independent operational metadata, not executable tool/hook wiring."""
    errors = []
    if not isinstance(tools, list):
        return ["tools must be an array"]
    names = set()
    for tool in tools:
        if (not isinstance(tool, dict) or set(tool) != {"name", "purpose", "required"}
                or not isinstance(tool["name"], str) or not tool["name"].strip()
                or not isinstance(tool["purpose"], str) or not tool["purpose"].strip()
                or not isinstance(tool["required"], bool)):
            errors.append("each tool requires name, purpose and boolean required")
        elif tool["name"] in names:
            errors.append(f"duplicate tool: {tool['name']}")
        else:
            names.add(tool["name"])
    if not isinstance(hooks, list):
        return errors + ["hooks must be an array"]
    for hook in hooks:
        if (not isinstance(hook, dict) or set(hook) != {"event", "action", "tools", "policy"}
                or any(not isinstance(hook[k], str) or not hook[k].strip() for k in ("event", "action", "policy"))
                or hook["policy"] not in {"manual", "host-approved"}
                or not isinstance(hook["tools"], list)
                or any(not isinstance(name, str) or name not in names for name in hook["tools"])):
            errors.append("each hook requires event, action, declared tools and policy manual|host-approved")
    return errors


def parse_capability(path: Path) -> Capability:
    """Parse a capabilities/<id>.md file, return Capability dataclass."""
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValueError(f"{path}: missing YAML front matter (---)")
    try:
        end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
    except StopIteration:
        raise ValueError(f"{path}: malformed front matter")
    fm_text = "\n".join(lines[1:end]).strip()
    body = "\n".join(lines[end + 1:]).strip()

    front: dict[str, Any] = {}
    for line_num, line in enumerate(fm_text.splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        if ":" not in line:
            raise ValueError(f"{path}:{line_num}: frontmatter line must contain ':': {line}")
        k, raw_v = line.split(":", 1)
        k = k.strip()
        raw_v = raw_v.strip()

        # Try to parse as JSON first (handles arrays, objects, strings, numbers, booleans)
        try:
            v = json.loads(raw_v)
        except json.JSONDecodeError:
            if raw_v.startswith(("[", "{", '"')):
                raise ValueError(f"{path}:{line_num}: invalid frontmatter value: {raw_v}")
            # Fall back to raw string (strip surrounding quotes if present)
            if (raw_v.startswith('"') and raw_v.endswith('"')) or \
               (raw_v.startswith("'") and raw_v.endswith("'")):
                v = raw_v[1:-1]
            else:
                v = raw_v

        if k in front:
            raise ValueError(f"{path}:{line_num}: duplicate frontmatter key: {k}")
        front[k] = v

    missing = [f for f in CAP_FIELDS if f not in front]
    if missing:
        raise ValueError(f"{path}: missing frontmatter fields: {missing}")

    for key in ("id", "role", "when"):
        if not isinstance(front[key], str) or not front[key].strip():
            raise ValueError(f"{path}: {key} must be a nonempty string")
    for key in ("after", "outputs", "checks", "conflicts"):
        if not isinstance(front[key], list) or any(not isinstance(x, str) or not x for x in front[key]):
            raise ValueError(f"{path}: {key} must be a list of nonempty strings")

    intent_errors = validate_intents(front["intents"])
    if intent_errors:
        raise ValueError(f"{path}: {'; '.join(intent_errors)}")
    operation_errors = validate_operations(front["tools"], front["hooks"])
    if operation_errors:
        raise ValueError(f"{path}: {'; '.join(operation_errors)}")

    if front["id"] != path.stem:
        raise ValueError(f"{path}: capability id '{front['id']}' does not match filename '{path.stem}'")

    # Parse after/outputs as lists
    after_val = front["after"]
    if isinstance(after_val, list):
        after_list = [str(d).strip() for d in after_val if str(d).strip()]
    else:
        after_list = [d.strip() for d in str(after_val).split(",") if d.strip() and d.strip() != "—"]

    outputs_val = front["outputs"]
    if isinstance(outputs_val, list):
        outputs_list = [str(o).strip() for o in outputs_val if str(o).strip()]
    else:
        outputs_list = [o.strip() for o in str(outputs_val).split(",") if o.strip()]

    checks_val = front["checks"]
    if isinstance(checks_val, list):
        checks_list = [str(c).strip() for c in checks_val if str(c).strip()]
    else:
        checks_list = [c.strip() for c in str(checks_val).split(",") if c.strip()]

    if "## Sources" not in body:
        raise ValueError(f"{path}: missing ## Sources provenance section")

    return Capability(
        id=front["id"],
        role=front["role"],
        when=front["when"],
        after=after_list,
        outputs=outputs_list,
        checks=checks_list,
        body=body,
        path=path,
        intents=front["intents"],
        tools=front["tools"],
        hooks=front["hooks"],
        conflicts=front["conflicts"],
    )


# ----------------------------------------------------------------------
# Capability & Router Validation
# ----------------------------------------------------------------------
def parse_router(path: Path) -> list[RouterRow]:
    raw_lines = path.read_text(encoding="utf-8").splitlines()
    if len(raw_lines) > 80:
        raise ValueError(f"{path}: router exceeds 80 lines")
    # Harmonizer merge audits are documentation, never router rows.
    lines = []
    in_comment = False
    for line in raw_lines:
        stripped = line.strip()
        if in_comment:
            if "-->" in stripped:
                in_comment = False
            continue
        if stripped.startswith("<!--"):
            if "-->" not in stripped:
                in_comment = True
            continue
        lines.append(line)
    table = [line.strip() for line in lines if line.strip().startswith("|")]
    if len(table) < 2:
        raise ValueError(f"{path}: missing router table")
    def cells(line: str) -> list[str]:
        if not line.endswith("|"):
            raise ValueError(f"{path}: malformed router row: {line}")
        return [part.strip() for part in line.split("|")[1:-1]]
    if cells(table[0]) != ["id", "role", "when", "after", "outputs", "intents"]:
        raise ValueError(f"{path}: invalid router header; regenerate with the AI harmonizer (six columns including intents)")
    if len(cells(table[1])) != 6 or any(not re.fullmatch(r":?-{3,}:?", x) for x in cells(table[1])):
        raise ValueError(f"{path}: invalid table separator")
    rows = []
    for line in table[2:]:
        parts = cells(line)
        if len(parts) != 6 or any(not p for p in parts):
            raise ValueError(f"{path}: expected six nonempty columns: {line}")
        rows.append(RouterRow(*parts))
    return rows


def validate_capabilities_and_router(
    capabilities: list[Capability],
    router_rows: list[RouterRow],
    registered_sources: set[str] | None = None,
) -> list[str]:
    """Validate capabilities and router rows; return list of errors."""
    errors: list[str] = []
    if isinstance(capabilities, Path) and isinstance(router_rows, Path):
        try:
            capabilities = [parse_capability(p) for p in sorted(capabilities.glob("*.md"))]
            router_rows = parse_router(router_rows)
        except (OSError, ValueError) as exc:
            return [str(exc)]

    if not capabilities:
        errors.append("no capabilities provided")
    if not router_rows:
        errors.append("no router rows provided")

    # 1-to-1 correspondence
    cap_ids = {c.id for c in capabilities}
    router_ids = {r.id for r in router_rows}
    if cap_ids != router_ids:
        missing_in_router = cap_ids - router_ids
        missing_in_caps = router_ids - cap_ids
        if missing_in_router:
            errors.append(f"Capabilities missing from ROUTER.md: {sorted(missing_in_router)}")
        if missing_in_caps:
            errors.append(f"ROUTER.md references missing capabilities: {sorted(missing_in_caps)}")

    # Duplicate IDs
    if registered_sources is not None:
        for cap in capabilities:
            sources = set(re.findall(r"(?im)^\s*(?:-\s*)?Source:\s*([a-z0-9][a-z0-9-]*)", cap.body))
            if not sources:
                errors.append(f"Capability {cap.id}: no registered source provenance")
            unknown = sorted(sources - registered_sources)
            if unknown:
                errors.append(f"Capability {cap.id}: unregistered source(s): {', '.join(unknown)}")
    seen: set[str] = set()
    for c in capabilities:
        errors.extend(f"Capability {c.id}: {error}" for error in validate_intents(c.intents))
        errors.extend(f"Capability {c.id}: {error}" for error in validate_operations(c.tools, c.hooks))
        if c.when != "—" and any(not re.fullmatch(r"stack:[a-z0-9]+(?:[.-][a-z0-9]+)*", token.strip()) for token in c.when.split(",")):
            errors.append(f"Capability {c.id}: when accepts only stack constraints or —; classify intents separately")
        if c.id in seen:
            errors.append(f"Duplicate capability id: {c.id}")
        seen.add(c.id)

    seen.clear()
    for r in router_rows:
        if r.id in seen:
            errors.append(f"Duplicate router row id: {r.id}")
        seen.add(r.id)

    # Cycle detection in `after`
    graph: dict[str, list[str]] = {c.id: c.after for c in capabilities}
    by_id = {c.id: c for c in capabilities}
    for c in capabilities:
        for conflict in c.conflicts:
            if conflict not in by_id or conflict == c.id:
                errors.append(f"Capability {c.id}: invalid conflict reference {conflict}")
        for dep in c.after:
            if dep not in graph:
                errors.append(f"Capability {c.id}: missing prerequisite {dep}")
    for r in router_rows:
        cap = by_id.get(r.id)
        if cap and (r.role != cap.role or r.when != cap.when or r.after_list() != cap.after or r.outputs_list() != cap.outputs
                    or r.intents_list() != [i["id"] for i in cap.intents if isinstance(i, dict) and "id" in i]):
            errors.append(f"Router row {r.id} disagrees with capability frontmatter")

    def has_cycle(node: str, visited: set[str], stack: set[str], path: list[str]) -> list[str] | None:
        visited.add(node)
        stack.add(node)
        path.append(node)
        for dep in graph.get(node, []):
            if dep not in visited:
                result = has_cycle(dep, visited, stack, path)
                if result:
                    return result
            elif dep in stack:
                # Found cycle, return the cycle path
                cycle_start = path.index(dep)
                return path[cycle_start:] + [dep]
        stack.remove(node)
        path.pop()
        return None

    visited: set[str] = set()
    for n in graph:
        if n not in visited:
            cycle = has_cycle(n, visited, set(), [])
            if cycle:
                errors.append(f"Cycle detected in 'after' dependencies: {' -> '.join(cycle)}")
                break

    return errors


# ----------------------------------------------------------------------
# Legacy API: fail closed instead of choosing capabilities by role.
# ----------------------------------------------------------------------
def resolve_plan(
    router_rows: list[RouterRow],
    roles_needed: list[str],
    stack_tokens: set[str],
    satisfied_outputs: set[str]
) -> list[str]:
    """Keep legacy imports usable, but never derive a selection from role names."""
    raise ValueError(
        "Role-based resolve_plan is disabled; request host AI classification through "
        "Coordinator.propose or plan, then submit the explicit decision with --classification. "
        "Roles, intent tokens and catalog order cannot select capabilities."
    )
