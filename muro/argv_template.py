"""The argv template of a package tool: its shape check against the tool's schema, and the builder of one call's argv."""
from __future__ import annotations

import json
import math
import os
import re
from typing import Any

_PLACEHOLDER = re.compile(r"\{([a-z][a-z0-9_]*)\}")
_PACKAGE_ROOT = "<package_root>"
_TYPES = ("string", "integer", "number", "boolean")
_TYPE_NAMES = {"string": "a string", "integer": "an integer", "number": "a number", "boolean": "a boolean"}
_SCHEMA_KEYS = ("type", "properties", "required")
_PROPERTY_KEYS = ("type", "enum", "allow_leading_dash")
_GROUPS = ({"if", "args"}, {"unless", "args"})


def _is_type(value: Any, kind: str) -> bool:
    if kind == "boolean":
        return isinstance(value, bool)
    if isinstance(value, bool):  # bool is an int in Python, and neither an integer nor a number in JSON
        return False
    if kind == "string":
        return isinstance(value, str)
    if kind == "integer":
        return isinstance(value, int)
    return isinstance(value, (int, float)) and (not isinstance(value, float) or math.isfinite(value))


def _placeholder(item: Any) -> str | None:
    match = _PLACEHOLDER.fullmatch(item) if isinstance(item, str) else None
    return match.group(1) if match else None


def literal_parts(run: Any) -> list[str]:
    """The string items of `run` and of every group's `args` that are not a whole placeholder, in order."""
    parts: list[str] = []
    for item in run if isinstance(run, list) else []:
        group = item.get("args") if isinstance(item, dict) else [item]
        parts += [part for part in group if isinstance(part, str) and _placeholder(part) is None] \
            if isinstance(group, list) else []
    return parts


def _schema_errors(schema: Any) -> list[str]:
    if not isinstance(schema, dict) or schema.get("type") != "object" or not isinstance(schema.get("properties"), dict):
        return ['schema must be {"type": "object", "properties": {...}, "required": [...]}']
    errors = [f"schema key {key} is outside the enforced subset ({', '.join(_SCHEMA_KEYS)})"
              for key in schema if key not in _SCHEMA_KEYS]
    required = schema.get("required", [])
    if not isinstance(required, list) or any(not isinstance(name, str) for name in required):
        errors.append("schema required must be a list of property names")
    else:
        errors += [f"schema required names {name}, which is not a property of the schema"
                   for name in required if name not in schema["properties"]]
    for name, prop in schema["properties"].items():
        if not isinstance(prop, dict):
            errors.append(f"property {name} must be an object")
            continue
        errors += [f"property {name}: key {key} is outside the enforced subset ({', '.join(_PROPERTY_KEYS)})"
                   for key in prop if key not in _PROPERTY_KEYS]
        kind = prop.get("type")
        if kind not in _TYPES:
            errors.append(f"property {name}: type must be one of {', '.join(_TYPES)}")
        elif "enum" in prop and (not isinstance(prop["enum"], list) or not prop["enum"]
                                 or not all(_is_type(member, kind) for member in prop["enum"])):
            errors.append(f"property {name}: enum must be a nonempty list of {kind} values")
        if "allow_leading_dash" in prop and not isinstance(prop["allow_leading_dash"], bool):
            errors.append(f"property {name}: allow_leading_dash must be true or false")
    return errors


def template_errors(run: Any, schema: Any, label: str) -> list[str]:
    """The shape of the template's own items against the schema; the literals' own check is the caller's."""
    errors = _schema_errors(schema)
    if not isinstance(schema, dict) or not isinstance(schema.get("properties"), dict):
        return [f"{label}: {error}" for error in errors]
    properties = schema["properties"]
    required = schema.get("required") if isinstance(schema.get("required"), list) else []

    def part_errors(part: Any, where: str, in_group: bool) -> list[str]:
        if isinstance(part, dict):  # only a group's args can reach here with a dict
            return [f"{where} is a group inside a group: groups are not nested"]
        if not isinstance(part, str) or not part:
            return [f"{where} must be a nonempty string"]
        name = _placeholder(part)
        if name is None:
            return [f"{where}: a placeholder is a whole item, got {part!r}"] if "{" in part or "}" in part else []
        if name not in properties:
            return [f"{where}: placeholder {name} is not a property of the schema"]
        found = []
        if isinstance(properties[name], dict) and properties[name].get("type") == "boolean":
            found.append(f"{where}: placeholder {name}: a boolean is only a group's condition")
        if not in_group and name not in required:
            found.append(f"{where}: placeholder {name} outside a group must be a required property")
        return found

    if not isinstance(run, list) or not run:
        return [f"{label}: {error}" for error in errors] + [f"{label}: run must be a nonempty list of items"]
    if not isinstance(run[0], str) or _placeholder(run[0]) is not None:
        errors.append("the program (first item) is a literal")
    for index, item in enumerate(run):
        where = f"item {index}"
        if not isinstance(item, dict):
            errors += part_errors(item, where, False)
            continue
        if set(item) not in _GROUPS:
            errors.append(f"{where}: a group has exactly one of if and unless, and args")
            continue
        key = "if" if "if" in item else "unless"
        if not isinstance(item[key], str) or item[key] not in properties:
            errors.append(f"{where}: {key} {item[key]!r} is not a property of the schema")
        if not isinstance(item["args"], list) or not item["args"]:
            errors.append(f"{where}: args must be a nonempty list of strings")
            continue
        for number, part in enumerate(item["args"]):
            errors += part_errors(part, f"{where} args {number}", True)
    return [f"{label}: {error}" for error in errors]


def argument_errors(arguments: Any, schema: dict) -> list[str]:
    """What the schema's enforced subset refuses in one call's arguments: unknown, missing, mistyped, off the enum."""
    if not isinstance(arguments, dict):
        return ["arguments must be an object"]
    properties = schema["properties"]
    errors = [f"{name} is not an argument of this tool" for name in arguments if name not in properties]
    errors += [f"missing required argument {name}" for name in schema.get("required", []) if name not in arguments]
    for name, value in arguments.items():
        prop = properties.get(name)
        if prop is None:
            continue
        if not _is_type(value, prop["type"]):
            errors.append(f"{name} must be {_TYPE_NAMES[prop['type']]}")
        elif "enum" in prop and value not in prop["enum"]:
            errors.append(f"{name} must be one of {', '.join(json.dumps(member) for member in prop['enum'])}")
    return errors


def _argument(name: str, arguments: dict, schema: dict) -> str:
    if name not in arguments:  # a placeholder in a group may name another optional property
        raise ValueError(f"{name} is used by the command and was not given")
    value = arguments[name]
    if not isinstance(value, str):
        return json.dumps(value)
    if value.startswith("-") and not schema["properties"][name].get("allow_leading_dash"):
        raise ValueError(f"argument {name} begins with -, and its property does not declare allow_leading_dash")
    return value


def build_argv(run: list, arguments: dict, schema: dict, package_root: str) -> list[str]:
    """One call's argv from a validated template; raises ValueError with the first refusal. Never substitutes into a value."""
    errors = argument_errors(arguments, schema)
    if errors:
        raise ValueError(errors[0])
    argv: list[str] = []
    for item in run:
        if isinstance(item, dict):
            key = "if" if "if" in item else "unless"
            given = item[key] in arguments and arguments[item[key]] is not False  # is: 0 == False
            if given != (key == "if"):
                continue
        for part in item["args"] if isinstance(item, dict) else [item]:
            name = _placeholder(part)
            argv.append(part.replace(_PACKAGE_ROOT, package_root) if name is None else _argument(name, arguments, schema))
    return argv


def is_batch_program(path: str) -> bool:
    """A `.bat` or `.cmd` file, which Windows runs through cmd.exe (the check the hook trampoline makes)."""
    return os.path.splitext(path)[1].lower() in (".bat", ".cmd")
