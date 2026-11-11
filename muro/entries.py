"""Discovery entries: structure checks for AI-authored area skills (no semantic grouping in Python)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .core import RESERVED_COMMANDS, SLUG_PATTERN

ENTRIES_FILE = "entries.json"
MAX_DESCRIPTION = 1024  # Agent Skills description limit; Claude Code lists at most 1,536 characters


def load_entries(package_dir: Path) -> dict[str, Any] | None:
    """The package's entries document, or None when it declares no discovery entries."""
    path = package_dir / ENTRIES_FILE
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None


def validate_entries(document: Any, capabilities: list, plugin: dict[str, Any]) -> list[str]:
    """Check shape, naming, references and full coverage. Grouping and wording stay the AI's decision."""
    command = plugin.get("command", "")
    known = {cap.id for cap in capabilities}
    if not isinstance(document, dict) or set(document) != {"entries"}:
        return ["entries.json must be an object with exactly entries"]
    entries = document["entries"]
    errors: list[str] = []
    if not isinstance(entries, list) or not entries:
        return ["entries.json entries must be a nonempty array"]
    names: set[str] = set()
    routed: set[str] = set()
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) != {"name", "description", "capabilities"}:
            errors.append("each entry requires exactly name, description and capabilities")
            continue
        name, description, members = entry["name"], entry["description"], entry["capabilities"]
        if not isinstance(name, str) or not SLUG_PATTERN.fullmatch(name):
            errors.append(f"entry name must be kebab-case: {name}")
        elif not name.startswith(f"{command}-"):
            errors.append(f"entry name {name} must start with '{command}-' so it cannot collide with other skills")
        elif name in RESERVED_COMMANDS:
            errors.append(f"entry name {name} is a reserved host command")
        elif name in names:
            errors.append(f"duplicate entry name: {name}")
        else:
            names.add(name)
        if not isinstance(description, str) or not description.strip() or "\n" in description:
            errors.append(f"entry {name}: description must be one nonempty line")
        elif len(description) > MAX_DESCRIPTION:
            errors.append(f"entry {name}: description exceeds {MAX_DESCRIPTION} characters")
        if not isinstance(members, list) or not members or any(not isinstance(m, str) for m in members):
            errors.append(f"entry {name}: capabilities must be a nonempty list of capability ids")
            continue
        if len(set(members)) != len(members):
            errors.append(f"entry {name}: duplicate capability")
        for member in members:
            if member not in known:
                errors.append(f"entry {name}: unknown capability {member}")
            routed.add(member)
    # A package's scope is what its intake absorbed. Whatever is in the catalog must be findable;
    # to leave something out, leave its source out of intake.
    for missing in sorted(known - routed):
        errors.append(f"capability {missing} has no entry: everything intake absorbed must be discoverable")
    return errors
