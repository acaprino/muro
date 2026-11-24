"""The API keys a package's tools read, declared as data: a variable's name and what it unlocks, never a value.

`credentials` is an optional list in `delivery.json`. The AI writes it at harmonization (it merges what each source
takes, says what each key unlocks and, with the owner's own words, which come first); Python checks its shape and its
references, and puts the entries in order by `rank` alone. There is no field that could hold a value, so no key, token
or other secret can enter the package through it, and no message below repeats anything the document holds.
"""
from __future__ import annotations

import re
from typing import Any

KEY = "credentials"
# The name of an environment variable. One copy: delivery.py checks the `env` of a server and of a tool with it.
ENV_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
USED_BY = ("sources", "capabilities", "tools")
_REQUIRED = frozenset({"env", "service", "required", "unlocks"})
_ALLOWED = _REQUIRED | {"rank", "route", "used_by"}
_FIELD_NAME = re.compile(r"[a-z_]{1,24}")   # an unexpected key is named only when it reads as a plain field name


def _text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def declared_credentials(document: Any) -> list[dict[str, Any]]:
    """The entries a delivery document declares, as it declares them; none when it declares none."""
    entries = document.get(KEY) if isinstance(document, dict) else None
    return [entry for entry in entries if isinstance(entry, dict)] if isinstance(entries, list) else []


def in_order(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Entries with a rank first, the lowest rank first, then the others as declared. The one reordering there is."""
    ranked = sorted((entry for entry in entries if type(entry.get("rank")) is int), key=lambda entry: entry["rank"])
    return ranked + [entry for entry in entries if type(entry.get("rank")) is not int]


def _roster(review: Any) -> set[str] | None:
    """The tool ids a server review lists, or None when it has no readable roster: then no tool name is checked."""
    tools = review.get("tools") if isinstance(review, dict) else None
    ids = {item["id"] for item in tools if isinstance(item, dict) and isinstance(item.get("id"), str)} \
        if isinstance(tools, list) else set()
    return ids or None


def _shape_errors(label: str, entry: dict[str, Any]) -> list[str]:
    errors = []
    missing = sorted(_REQUIRED - set(entry))
    if missing:
        errors.append(f"{label} lacks {', '.join(missing)}")
    extra = [key for key in entry if key not in _ALLOWED]
    if extra:
        named = sorted(key for key in extra if isinstance(key, str) and _FIELD_NAME.fullmatch(key))
        shown = f" ({', '.join(named)})" if named else ""
        errors.append(f"{label} has keys outside env, service, required, unlocks, rank, route and used_by{shown}: "
                      "a credential names its variable and has no field for a value")
    return errors


def _field_errors(label: str, index: int, entry: dict[str, Any], envs: dict[str, int], ranks: dict[int, int]) -> list[str]:
    errors = []
    if "env" in entry:
        env = entry["env"]
        if not isinstance(env, str) or not ENV_NAME.fullmatch(env):
            errors.append(f"{label}: env must be the name of an environment variable "
                          "(letters, digits and underscores, not starting with a digit)")
        elif env in envs:
            errors.append(f"{label}: env repeats the variable of {KEY}[{envs[env]}]")
        else:
            envs[env] = index
    errors += [f"{label}: {field} must be nonempty text" for field in ("service", "unlocks", "route")
               if field in entry and not _text(entry[field])]
    if "required" in entry and type(entry["required"]) is not bool:
        errors.append(f"{label}: required must be true or false")
    if "rank" in entry:
        rank = entry["rank"]
        if type(rank) is not int or rank < 1:
            errors.append(f"{label}: rank must be a positive whole number")
        elif rank in ranks:
            errors.append(f"{label}: rank repeats the rank of {KEY}[{ranks[rank]}]")
        else:
            ranks[rank] = index
    return errors


def _used_by_errors(label: str, used_by: Any, known: dict[str, tuple[set[str] | None, str]]) -> list[str]:
    """`known` maps each group to the names that exist and what one is called; None means the group is not checked."""
    if not isinstance(used_by, dict):
        return [f"{label}: used_by must be an object with sources, capabilities and tools"]
    errors = [f"{label}: used_by may hold only sources, capabilities and tools"] if set(used_by) - set(USED_BY) else []
    for group in USED_BY:
        if group not in used_by:
            continue
        names = used_by[group]
        if not isinstance(names, list):
            errors.append(f"{label}: used_by.{group} must be a list of names")
            continue
        exists, what = known[group]
        for position, name in enumerate(names):
            if not _text(name):
                errors.append(f"{label}: used_by.{group}[{position}] must be nonempty text")
            elif exists is not None and name not in exists:
                errors.append(f"{label}: used_by.{group}[{position}] is not {what}")
    return errors


def credential_errors(document: Any, capability_ids: set[str], source_ids: set[str]) -> list[str]:
    """Shape and references of the `credentials` of a delivery document; nothing when it declares none.

    Each entry has exactly `env`, `service`, `required` and `unlocks`, and may add `rank`, `route` and `used_by`.
    `env` and `rank` are unique. `used_by` names sources and capabilities that exist. Its tools are checked only
    against the roster of a `server_review` that has one, and never fail otherwise. An error names an entry by its
    position and repeats nothing the entry holds, so a key pasted into the wrong field is not echoed.
    """
    if not isinstance(document, dict) or KEY not in document:
        return []
    entries = document[KEY]
    if not isinstance(entries, list):
        return [f"{KEY} must be a list of credential declarations"]
    known = {"sources": (source_ids, "a source of this package"),
             "capabilities": (capability_ids, "a capability of this package"),
             "tools": (_roster(document.get("server_review")), "a tool of the server review")}
    errors: list[str] = []
    envs: dict[str, int] = {}
    ranks: dict[int, int] = {}
    for index, entry in enumerate(entries):
        label = f"{KEY}[{index}]"
        if not isinstance(entry, dict):
            errors.append(f"{label} must be an object with env, service, required and unlocks")
            continue
        errors += _shape_errors(label, entry) + _field_errors(label, index, entry, envs, ranks)
        if "used_by" in entry:
            errors += _used_by_errors(label, entry["used_by"], known)
    return errors
