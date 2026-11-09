# muro/core.py
"""Pure core logic: validation, parsing, plan resolution. No I/O side effects."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
import copy
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

    def after_list(self) -> list[str]:
        return [d.strip() for d in self.after.split(",") if d.strip() and d.strip() != "—"]

    def outputs_list(self) -> list[str]:
        return [o.strip() for o in self.outputs.split(",") if o.strip()]


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
CAP_FIELDS = ("id", "role", "when", "after", "outputs", "checks")

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
    for key in ("after", "outputs", "checks"):
        if not isinstance(front[key], list) or any(not isinstance(x, str) or not x for x in front[key]):
            raise ValueError(f"{path}: {key} must be a list of nonempty strings")

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
    if cells(table[0]) != ["id", "role", "when", "after", "outputs"]:
        raise ValueError(f"{path}: invalid router header")
    if len(cells(table[1])) != 5 or any(not re.fullmatch(r":?-{3,}:?", x) for x in cells(table[1])):
        raise ValueError(f"{path}: invalid table separator")
    rows = []
    for line in table[2:]:
        parts = cells(line)
        if len(parts) != 5 or any(not p for p in parts):
            raise ValueError(f"{path}: expected five nonempty columns: {line}")
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
        for dep in c.after:
            if dep not in graph:
                errors.append(f"Capability {c.id}: missing prerequisite {dep}")
    for r in router_rows:
        cap = by_id.get(r.id)
        if cap and (r.role != cap.role or r.when != cap.when or r.after_list() != cap.after or r.outputs_list() != cap.outputs):
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
# Plan Resolver (4-rule router)
# ----------------------------------------------------------------------
def resolve_plan(
    router_rows: list[RouterRow],
    roles_needed: list[str],
    stack_tokens: set[str],
    satisfied_outputs: set[str]
) -> list[str]:
    """
    Apply the 4 rules:
    1. merge handled at build-time (not here)
    2. variant: filter by `when` against stack_tokens, pick first compatible
    3. after: order by dependencies, skip if outputs already satisfied
    4. No MoE (handled externally via static ## Checks)
    """
    # Accept the original dictionary interface as well as RouterRow instances.
    def text(value: Any) -> str:
        return ", ".join(value) if isinstance(value, list) else str(value)
    router_rows = [RouterRow(r["id"], r["role"], r["when"], text(r["after"]), text(r["outputs"])) if isinstance(r, dict) else r for r in router_rows]
    # Map role -> list of rows (preserve ROUTER.md order for tie-break)
    if {"stack:gsap", "stack:css-only"}.issubset(stack_tokens):
        raise ValueError("Conflicting stack constraints: stack:gsap and stack:css-only")
    role_map: dict[str, list[RouterRow]] = {}
    for r in router_rows:
        role_map.setdefault(r.role, []).append(r)

    # 1) Pick exactly one variant per required role
    selected: list[RouterRow] = []
    for role in roles_needed:
        candidates = role_map.get(role, [])
        if not candidates:
            raise ValueError(f"No capability for required role: {role}")

        # Filter by `when` condition
        compatible: list[RouterRow] = []
        for c in candidates:
            when = c.when.strip()
            if not when or when == "—":
                compatible.append(c)
                continue
            # Simple token match: when="stack:gsap" -> check if "stack:gsap" in stack_tokens
            # when="intent:ui,stack:gsap" -> all tokens must be present
            required = [t.strip() for t in when.split(",")]
            if all(tok in stack_tokens for tok in required):
                compatible.append(c)

        if not compatible:
            # Detailed error with why each candidate failed
            reasons = []
            for c in candidates:
                when = c.when.strip()
                if when and when != "—":
                    required = [t.strip() for t in when.split(",")]
                    missing = [tok for tok in required if tok not in stack_tokens]
                    reasons.append(f"{c.id}: missing tokens {missing}")
                else:
                    reasons.append(f"{c.id}: always compatible (unexpected)")
            raise ValueError(
                f"No compatible variant for role '{role}' with stack tokens {sorted(stack_tokens)}. "
                f"Candidates: {'; '.join(reasons)}"
            )

        # Deep copy to avoid mutating original router_rows
        selected.append(copy.deepcopy(compatible[0]))

    by_id = {r.id: r for r in router_rows}
    if len(by_id) != len(router_rows):
        raise ValueError("Duplicate router id")
    plan: list[str] = []
    done: set[str] = set()
    visiting: set[str] = set()
    def visit(row: RouterRow) -> None:
        if row.id in done:
            return
        if row.id in visiting:
            raise ValueError(f"Cycle in prerequisites at {row.id}")
        # Do not redo ancestors when a prerequisite's outputs are already present.
        outputs = row.outputs_list()
        if outputs and set(outputs).issubset(satisfied_outputs):
            done.add(row.id)
            return
        visiting.add(row.id)
        for dep_id in row.after_list():
            if dep_id not in by_id:
                raise ValueError(f"Missing prerequisite capability: {dep_id}")
            visit(by_id[dep_id])
        visiting.remove(row.id)
        done.add(row.id)
        plan.append(row.id)
    for row in reversed(selected):
        visit(row)
    return plan
