"""The server review: what the harmonizing AI records about every tool of every server a package absorbs, and the
checks that hold that record closed (ADR-0033, amendment of 2026-11-24).

The record is the optional top-level key `server_review` of `delivery.json`, an object with exactly three keys:

    judged_on  {source id: commit}, the commits the judgments were made on (at least 7 hex characters)
    tools      the roster: one entry for each tool of each server, and each command a package tool runs, with
               id, source, kind, effect, basis, overlaps or alone, fate, served_as (only when served), decided_by
               and reason
    pairs      one entry for each pair of tools that overlap, with tools, judgment, survivor (merge and discard
               only), reason and evidence

The AI writes every field, its meaning included: what a tool does to the world (`effect`), whether another tool does
the same, and what became of it (`fate`: served by the package server, registered as the source ships it, a command
the capabilities run, or left out because another tool stands in its place). Python checks shape, closure and
references and never classifies, merges or chooses: it holds no list of tool names, words or effects of its own.

The checks, in the order their messages come. Every message starts with `server_review: `, names what it is about
(the tool id, the pair, the source or the server) and says what to change.

    C1 shape      keys, types, enums, nonempty text, text limits, unique ids, known sources, `judged_on` commits and its
                  cover of every source with a roster entry. A malformed document is reported, never raised on.
    C2 closure    every `overlaps` id is a roster id other than the entry's own; every pair of tools one lists of the
                  other has exactly one entry in `pairs`, and every pair has such an edge.
    C3 fate       a package server's declared tools are served by exactly one roster entry each, and no entry is served
                  without a declared tool; with no package server nothing is served or left out; `registered` and
                  `left-out` follow the package server's children; a server-tool id names a declared server and shares
                  its source; a command is only served or a command.
    C4 pair       in a merge or a discard the survivor stays and the other tool is left out; two left-out tools, and a
                  pair that holds a command, are keep-both.
    C5 names      a left-out server tool is named by no capability, in its `tools` or as a whole word inside a code
                  span or fenced block of its body (prose does not count), unless its bare name is shared with
                  another roster entry (then the name cannot decide).
    C6 owner      with a package server, a tool whose effect is gated and that is served or left out is the owner's
                  decision (`decided_by: owner`).
    C7 relevance  a review exists only for a package that declares servers or a package server, and each declared
                  server has a tool in it.
    C8 release    `release_errors`, the build's gate: a package that declares servers carries the review, judged on the
                  commits now pinned; with a package server, the owner's recorded answer covers each gated tool that is
                  served or left out (its source at the pinned commit, its id shown). The AI's own step asks for it
                  with `owner=False`.

Gated effects are every effect except `none`. The gate fails closed: `undetermined` is gated, and a missing or
unknown effect is a shape error that every function here reads as gated, never as `none`.

Readings the spec leaves open, taken once: a `null` `server_review` is read as absent (as delivery.py reads a null
`package_server`); a command is a roster entry of kind `command`; the bare name of an id is what follows its first
slash, or the whole id when it has none; a name in a capability's body counts only as a whole word, case-sensitive,
with letters, digits, `_` and `-` as the letters of a word, and only inside code (a bare word in prose is not a
reference: the first real run had `transcribe` as an ordinary verb in two bodies); an empty `overlaps` list beside
`alone` is read as the `alone` case; a roster source that the manifest does not pin cannot be compared and is refused
by `release_errors`.

What the checks prove, and what they do not. Python cannot see a server's tools (it starts nothing), so these checks
prove closure over a record the AI wrote, not that the roster is complete, that an effect is right, or that every
similar pair was found. Those are covered by the blind effect reading, the review and the owner's reading of the list
of what the AI decided alone.

Pure functions over data, standard library only. This module imports nothing of the factory (delivery.py imports it),
so each function takes what it needs as an argument.
"""
from __future__ import annotations

import re
from collections import Counter
from typing import Any, NamedTuple

EFFECTS = ("none", "writes", "sends", "writes-and-sends", "undetermined")
GATED = frozenset(effect for effect in EFFECTS if effect != "none")   # `none` alone skips the owner
FATES = ("served", "registered", "command", "left-out")
KINDS = ("server-tool", "command")
JUDGMENTS = ("keep-both", "merge", "discard")
DECIDED_BY = ("ai", "owner")
# Provisional (spec of 2026-11-24). Characters: a count, nothing semantic. The one place the limits are written.
TEXT_LIMITS = {"basis": 600, "reason": 400, "alone": 300, "pair_reason": 600}

_PREFIX = "server_review: "
_NOT_GATED = "none"
_OWNER = "owner"
_RECORD_KEYS = ("judged_on", "tools", "pairs")
_TOOL_REQUIRED = ("id", "source", "kind", "effect", "basis", "fate", "decided_by", "reason")
_TOOL_OPTIONAL = ("overlaps", "alone", "served_as")
_PAIR_REQUIRED = ("tools", "judgment", "reason", "evidence")
_PAIR_OPTIONAL = ("survivor",)
_COMMIT = re.compile(r"[0-9a-fA-F]{7,}")
_WORD = "A-Za-z0-9_-"                      # the characters of a word in a capability's body
# What a body writes as code: a fenced block or an inline span on one line. A tool named in plain prose does not
# count: a tool can be called `transcribe` and a body can say "do not transcribe the label" (a real package did).
_CODE = re.compile(r"```.*?```|`[^`\n]+`", re.S)
_STEP = "run the harmonization step 'Servers and tools'"
_EFFECT_NOTE = (" (an effect that is missing or unknown is never read as none: write undetermined when the source "
                "does not say)")


# --- Reading the document without trusting it ---------------------------------------------------------------------

def _say(text: str) -> str:
    return _PREFIX + text


def _text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _id_ok(value: Any) -> bool:
    """An id is nonempty text with no leading or trailing space."""
    return isinstance(value, str) and value != "" and value == value.strip()


def _one_of(value: Any, allowed: tuple[str, ...]) -> bool:
    return isinstance(value, str) and value in allowed


def _items(value: Any) -> list:
    return list(value) if isinstance(value, (list, tuple)) else []


def _dicts(value: Any) -> list[dict]:
    return [item for item in _items(value) if isinstance(item, dict)]


def _as_dict(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def _text_list(value: Any) -> bool:
    return isinstance(value, list) and bool(value) and all(_text(item) for item in value)


def _strings(values: Any) -> set[str]:
    try:
        return {value for value in values if isinstance(value, str)}
    except TypeError:
        return set()


def _add(missing: list[str]) -> str:
    return "add it" if len(missing) == 1 else "add them"


def _unique(errors: list[str]) -> list[str]:
    return list(dict.fromkeys(errors))


def _enum(entry: dict, key: str, allowed: tuple[str, ...]) -> str | None:
    """The value of `key` when it is one of `allowed`; None otherwise (an unreadable field is C1's to report)."""
    value = entry.get(key)
    return value if _one_of(value, allowed) else None


def _review(document: Any) -> Any:
    """The `server_review` value, or None when the document has none (a null is read as absent)."""
    return document.get("server_review") if isinstance(document, dict) else None


class _Declared(NamedTuple):
    """What delivery.json declares about servers, read once and tolerant of any shape."""
    servers: dict      # name -> the declared server, for each `mcp_servers` entry that has a text name
    package: bool      # a package_server is declared (present and not null)
    children: tuple    # the names of the servers the package server starts itself
    tools: tuple       # the tools the package server declares, as written


def _declared(document: Any) -> _Declared:
    document = _as_dict(document)
    declaration = document.get("package_server")
    body = _as_dict(declaration)
    return _Declared({server["name"]: server for server in _dicts(document.get("mcp_servers"))
                      if isinstance(server.get("name"), str)},
                     declaration is not None,
                     tuple(child for child in _items(body.get("children")) if isinstance(child, str)),
                     tuple(_dicts(body.get("tools"))))


class _Tool(NamedTuple):
    """A roster entry that has a usable id, each other field as the checks may rely on it (None when unreadable)."""
    id: str
    source: Any
    kind: str | None
    effect: Any          # as written: anything but `none` is gated
    fate: str | None
    decided_by: str | None
    served_as: str | None
    overlaps: tuple


def _roster(review: Any) -> list[_Tool]:
    tools = []
    for entry in _dicts(_as_dict(review).get("tools")):
        identifier = entry.get("id")
        if not _id_ok(identifier):
            continue
        served_as = entry.get("served_as")
        tools.append(_Tool(identifier, entry.get("source"), _enum(entry, "kind", KINDS), entry.get("effect"),
                           _enum(entry, "fate", FATES), _enum(entry, "decided_by", DECIDED_BY),
                           served_as if _text(served_as) else None,
                           tuple(other for other in _items(entry.get("overlaps")) if _text(other))))
    return tools


class _Pair(NamedTuple):
    """A pair entry whose `tools` are two distinct text ids."""
    tools: tuple
    judgment: str | None
    survivor: Any


def _pair_ids(pair: dict) -> tuple | None:
    ids = pair.get("tools")
    if isinstance(ids, list) and len(ids) == 2 and all(_text(item) for item in ids) and ids[0] != ids[1]:
        return (ids[0], ids[1])
    return None


def _pairs(review: Any) -> list[_Pair]:
    found = []
    for pair in _dicts(_as_dict(review).get("pairs")):
        ids = _pair_ids(pair)
        if ids is not None:
            found.append(_Pair(ids, _enum(pair, "judgment", JUDGMENTS), pair.get("survivor")))
    return found


def _pair_label(ids: tuple) -> str:
    return f"pair ({ids[0]}, {ids[1]})"


def _bare(identifier: str) -> str:
    """The tool's own name: what follows the first slash of its id, or the whole id when it has none."""
    return identifier.partition("/")[2] if "/" in identifier else identifier


# --- The small public functions ----------------------------------------------------------------------------------

def needs_review(document: Any) -> bool:
    """A package declares servers (`mcp_servers` nonempty) or a package server: then it carries a review."""
    return isinstance(document, dict) and (bool(document.get("mcp_servers"))
                                           or document.get("package_server") is not None)


def gated_tools(document: Any) -> list[dict]:
    """The roster entries the owner decides: a gated effect, served or left out by the package server.

    Empty without a package server. A missing or unknown effect is gated, never `none` (fail closed). The entries
    are the document's own dicts, not copies.
    """
    if not isinstance(document, dict) or document.get("package_server") is None:
        return []
    return [entry for entry in _dicts(_as_dict(_review(document)).get("tools"))
            if entry.get("effect") != _NOT_GATED and entry.get("fate") in ("served", "left-out")]


def commit_matches(pinned: Any, recorded: Any) -> bool:
    """The recorded commit is at least 7 hex characters and a prefix of the pinned one, in either case.

    One function for the judgments (`judged_on`) and for the owner's answer: both are made on a commit that the
    manifest pins in full.
    """
    if not isinstance(pinned, str) or not isinstance(recorded, str) or not _COMMIT.fullmatch(recorded):
        return False
    return pinned.lower().startswith(recorded.lower())


# --- C1: shape ---------------------------------------------------------------------------------------------------

def _structure_errors(review: Any) -> list[str]:
    """The record's own three parts. Without them nothing inside can be read, so nothing else is checked."""
    if not isinstance(review, dict):
        return [_say("the record must be an object with exactly judged_on, tools and pairs")]
    missing = [key for key in _RECORD_KEYS if key not in review]
    unknown = sorted(str(key) for key in review if key not in _RECORD_KEYS)
    if missing or unknown:
        detail = "; ".join(part for part in (f"missing {', '.join(missing)}" if missing else "",
                                             f"unknown {', '.join(unknown)}" if unknown else "") if part)
        return [_say(f"the record must be an object with exactly judged_on, tools and pairs: {detail}")]
    errors = []
    if not isinstance(review["tools"], list):
        errors.append(_say("tools must be a list of tool entries"))
    if not isinstance(review["pairs"], list):
        errors.append(_say("pairs must be a list of pair entries"))
    if not isinstance(review["judged_on"], dict):
        errors.append(_say("judged_on must be an object of source ids and commits"))
    return errors


def _text_errors(label: str, key: str, value: Any, limit: int) -> list[str]:
    if not _text(value):
        return [_say(f"{label}: {key} must be nonempty text")]
    if len(value) > limit:
        return [_say(f"{label}: {key} is {len(value)} characters, over {limit}: shorten it")]
    return []


def _tool_shape_errors(entry: Any, index: int, source_ids: set[str]) -> list[str]:
    if not isinstance(entry, dict):
        return [_say(f"tools[{index}] must be an object")]
    identifier = entry.get("id")
    label = f"tool {identifier}" if _id_ok(identifier) else f"tools[{index}]"
    errors: list[str] = []
    missing = [key for key in _TOOL_REQUIRED if key not in entry]
    unknown = sorted(str(key) for key in entry if key not in _TOOL_REQUIRED and key not in _TOOL_OPTIONAL)
    if missing:
        errors.append(_say(f"{label}: missing {', '.join(missing)}: {_add(missing)}"))
    if unknown:
        errors.append(_say(f"{label}: unknown key {', '.join(unknown)}: remove it"))
    if "id" in entry and not _id_ok(identifier):
        errors.append(_say(f"{label}: id must be nonempty text with no leading or trailing space"))
    if "source" in entry and not (isinstance(entry["source"], str) and entry["source"] in source_ids):
        errors.append(_say(f"{label}: source {entry['source']} is not a source of this package: use a source id of "
                           "the manifest"))
    for key, allowed in (("kind", KINDS), ("effect", EFFECTS), ("fate", FATES), ("decided_by", DECIDED_BY)):
        if key in entry and not _one_of(entry[key], allowed):
            errors.append(_say(f"{label}: {key} must be one of {', '.join(allowed)}"
                               f"{_EFFECT_NOTE if key == 'effect' else ''}"))
    for key in ("basis", "reason", "alone"):
        if key in entry:
            errors += _text_errors(label, key, entry[key], TEXT_LIMITS[key])
    # An empty `overlaps` list beside `alone` says the same thing as `alone` alone: a model writes it for every tool
    # that overlaps nothing (41 of 62 entries of the first record), so it is read as absent and costs no message.
    says_alone = "alone" in entry and entry.get("overlaps") == []
    if "overlaps" in entry and "alone" in entry and not says_alone:
        errors.append(_say(f"{label}: has both overlaps and alone: keep the one that is true"))
    elif "overlaps" not in entry and "alone" not in entry:
        errors.append(_say(f"{label}: has neither overlaps nor alone: give the ids of the tools it overlaps, or why "
                           "nothing else does this"))
    if "overlaps" in entry and not says_alone and not _text_list(entry["overlaps"]):
        errors.append(_say(f"{label}: overlaps must be a nonempty list of tool ids (a tool that overlaps nothing "
                           "gives alone instead)"))
    fate = entry.get("fate")
    if fate == "served":
        if "served_as" not in entry:
            errors.append(_say(f"{label}: fate served needs served_as, the name of the package_server tool it serves"))
        elif not _text(entry["served_as"]):
            errors.append(_say(f"{label}: served_as must be nonempty text"))
    elif _one_of(fate, FATES) and "served_as" in entry:
        errors.append(_say(f"{label}: served_as is only for fate served: remove it"))
    return errors


def _pair_shape_errors(pair: Any, index: int) -> list[str]:
    if not isinstance(pair, dict):
        return [_say(f"pairs[{index}] must be an object")]
    ids = _pair_ids(pair)
    label = _pair_label(ids) if ids else f"pairs[{index}]"
    errors: list[str] = []
    missing = [key for key in _PAIR_REQUIRED if key not in pair]
    unknown = sorted(str(key) for key in pair if key not in _PAIR_REQUIRED and key not in _PAIR_OPTIONAL)
    if missing:
        errors.append(_say(f"{label}: missing {', '.join(missing)}: {_add(missing)}"))
    if unknown:
        errors.append(_say(f"{label}: unknown key {', '.join(unknown)}: remove it"))
    if "tools" in pair and ids is None:
        errors.append(_say(f"{label}: tools must be exactly two distinct tool ids"))
    if "judgment" in pair and not _one_of(pair["judgment"], JUDGMENTS):
        errors.append(_say(f"{label}: judgment must be one of {', '.join(JUDGMENTS)}"))
    if "reason" in pair:
        errors += _text_errors(label, "reason", pair["reason"], TEXT_LIMITS["pair_reason"])
    if "evidence" in pair and not _text_list(pair["evidence"]):
        errors.append(_say(f"{label}: evidence must be a nonempty list of source paths or sections"))
    judgment = _enum(pair, "judgment", JUDGMENTS)
    if judgment in ("merge", "discard"):
        if "survivor" not in pair:
            errors.append(_say(f"{label}: judgment {judgment} needs survivor, one of its two ids"))
        elif ids is not None and pair["survivor"] not in ids:
            errors.append(_say(f"{label}: survivor must be one of its two ids"))
    elif judgment is not None and "survivor" in pair:
        errors.append(_say(f"{label}: survivor is only for merge and discard: remove it"))
    return errors


def _judged_on_errors(review: dict, source_ids: set[str]) -> list[str]:
    judged = review["judged_on"]
    errors = []
    for source, commit in judged.items():
        if not (isinstance(source, str) and source in source_ids):
            errors.append(_say(f"judged_on names {source}, which is not a source of this package: use a source id of "
                               "the manifest"))
        if not (isinstance(commit, str) and _COMMIT.fullmatch(commit)):
            errors.append(_say(f"judged_on: the commit of {source} must be at least 7 hex characters"))
    first: dict[str, str] = {}
    for tool in _roster(review):
        if isinstance(tool.source, str) and tool.source in source_ids:
            first.setdefault(tool.source, tool.id)
    errors += [_say(f"judged_on does not cover source {source}, which tool {identifier} names: add the commit its "
                    "tools were judged on")
               for source, identifier in first.items() if source not in judged]
    return errors


def _shape_errors(review: dict, source_ids: set[str]) -> list[str]:
    """C1, for a record whose three parts are the right kinds of value."""
    errors: list[str] = []
    for index, entry in enumerate(review["tools"]):
        errors += _tool_shape_errors(entry, index, source_ids)
    counts = Counter(entry["id"] for entry in _dicts(review["tools"]) if _id_ok(entry.get("id")))
    errors += [_say(f"tool {identifier}: id appears more than once: ids are unique, so merge the entries or "
                    "rename one")
               for identifier, count in counts.items() if count > 1]
    for index, pair in enumerate(review["pairs"]):
        errors += _pair_shape_errors(pair, index)
    return errors + _judged_on_errors(review, source_ids)


# --- C2: closure -------------------------------------------------------------------------------------------------

def _closure_errors(roster: list[_Tool], pairs: list[_Pair]) -> list[str]:
    ids = {tool.id for tool in roster}
    errors: list[str] = []
    edges: dict[frozenset, tuple] = {}            # {A, B} such that one lists the other -> the two ids, sorted
    for tool in roster:
        for other in tool.overlaps:
            if other == tool.id:
                errors.append(_say(f"tool {tool.id}: overlaps names itself: list the other tool it overlaps"))
            elif other not in ids:
                errors.append(_say(f"tool {tool.id}: overlaps names {other}, which is not a roster id: use the id of "
                                   "a tool entry"))
            else:
                edges.setdefault(frozenset((tool.id, other)), tuple(sorted((tool.id, other))))
    written: dict[frozenset, tuple] = {}
    counts: Counter = Counter()
    for pair in pairs:
        written.setdefault(frozenset(pair.tools), pair.tools)
        counts[frozenset(pair.tools)] += 1
    for key, ordered in edges.items():
        if counts[key] == 0:
            errors.append(_say(f"{_pair_label(ordered)}: the tools overlap but pairs has no entry for them: add one "
                               "with judgment keep-both, merge or discard"))
        elif counts[key] > 1:
            errors.append(_say(f"{_pair_label(written[key])}: the pair is judged {counts[key]} times: keep one entry"))
    for pair in pairs:
        unknown = [identifier for identifier in pair.tools if identifier not in ids]
        if unknown:
            errors.append(_say(f"{_pair_label(pair.tools)}: {' and '.join(unknown)} "
                               f"{'is' if len(unknown) == 1 else 'are'} not a roster id: name two tool entries"))
        elif frozenset(pair.tools) not in edges:
            errors.append(_say(f"{_pair_label(pair.tools)}: neither tool lists the other in overlaps: remove the pair "
                               "or add the overlap"))
    return errors


# --- C3: fate and declaration ------------------------------------------------------------------------------------

def _forward_id(declared_tool: dict) -> str | None:
    forward = declared_tool.get("forward")
    if isinstance(forward, dict) and isinstance(forward.get("server"), str) and isinstance(forward.get("tool"), str):
        return f"{forward['server']}/{forward['tool']}"
    return None


def _served_errors(entry: _Tool, declared_tool: dict, name: str) -> list[str]:
    """The roster entry that serves a declared tool: a forwarded tool has its child's id and is a server tool, a run
    tool is a command, and either carries the source the tool is declared with (the owner's answer is read from the
    entry's source, so a different one would be covered at another source's commit)."""
    forwards, runs = "forward" in declared_tool, "run" in declared_tool
    errors: list[str] = []
    if forwards and not runs:
        expected = _forward_id(declared_tool)
        if expected is not None and entry.id != expected:
            errors.append(_say(f"tool {entry.id}: serves the forwarded tool {name}, so its id must be {expected}: the "
                               "child's server and the tool's own name"))
        if entry.kind not in (None, "server-tool"):
            errors.append(_say(f"tool {entry.id}: serves the forwarded tool {name}, so its kind must be server-tool"))
    elif runs and not forwards and entry.kind not in (None, "command"):
        errors.append(_say(f"tool {entry.id}: serves the tool {name}, which runs a command, so its kind must be command"))
    source = declared_tool.get("source")
    if isinstance(source, str) and entry.source != source:
        errors.append(_say(f"tool {entry.id}: serves the tool {name}, declared with source {source}, so its source "
                           f"must be {source}"))
    return errors


def _server_tool_errors(tool: _Tool, declared: _Declared) -> list[str]:
    label = f"tool {tool.id}"
    server, _, name = tool.id.partition("/")
    if not name or server not in declared.servers:
        known = ", ".join(sorted(declared.servers)) or "none declared"
        errors = [_say(f"{label}: a server-tool id is <server>/<tool>, <server> one of the declared mcp_servers "
                       f"({known}) and <tool> the server's own name for it: rename it")]
    else:
        errors = []
        source = declared.servers[server].get("source")
        if tool.source != source:
            errors.append(_say(f"{label}: source {tool.source} differs from the source of its server {server} "
                               f"({source}): use {source}"))
        if tool.fate == "registered" and server in declared.children:
            errors.append(_say(f"{label}: fate registered, but its server {server} is a child of the package server: "
                               "the package server starts it, so the fate is served or left-out"))
        if tool.fate == "left-out" and declared.package and server not in declared.children:
            errors.append(_say(f"{label}: fate left-out, but its server {server} is not a child of the package "
                               "server: nothing starts it through the package server, so the fate is registered"))
    if tool.fate == "command":
        errors.append(_say(f"{label}: fate command requires kind command"))
    return errors


def _fate_errors(roster: list[_Tool], declared: _Declared) -> list[str]:
    errors: list[str] = []
    for tool in roster:
        if not declared.package and tool.fate in ("served", "left-out"):
            errors.append(_say(f"tool {tool.id}: fate {tool.fate} needs a package_server, and the package declares "
                               "none: use registered for a server tool, or command for a command"))
        if tool.kind == "command" and tool.fate in ("registered", "left-out"):
            errors.append(_say(f"tool {tool.id}: a command is never registered or left-out: its fate is served or "
                               "command"))
        elif tool.kind == "server-tool":
            errors += _server_tool_errors(tool, declared)
    if not declared.package:
        return errors
    served: dict[str, list[_Tool]] = {}
    for tool in roster:
        if tool.fate == "served" and tool.served_as is not None:
            served.setdefault(tool.served_as, []).append(tool)
    names: set[str] = set()
    for declared_tool in declared.tools:
        name = declared_tool.get("name")
        if not isinstance(name, str) or name in names:
            continue
        names.add(name)
        found = served.get(name, [])
        if not found:
            errors.append(_say(f"package_server tool {name} has no roster entry with fate served and served_as "
                               f"{name}: add one"))
        elif len(found) > 1:
            errors.append(_say(f"package_server tool {name} is served by {len(found)} roster entries "
                               f"({', '.join(tool.id for tool in found)}): keep one"))
        else:
            errors += _served_errors(found[0], declared_tool, name)
    for name, found in served.items():
        if name not in names:
            errors += [_say(f"tool {tool.id}: its fate is served as {name}, but package_server declares no tool named "
                            f"{name}: fix served_as, or declare the tool") for tool in found]
    return errors


# --- C4: pair and fate -------------------------------------------------------------------------------------------

def _pair_fate_errors(roster: list[_Tool], pairs: list[_Pair]) -> list[str]:
    by_id: dict[str, _Tool] = {}
    for tool in roster:
        by_id.setdefault(tool.id, tool)
    errors: list[str] = []
    for pair in pairs:
        first, second = (by_id.get(identifier) for identifier in pair.tools)
        if first is None or second is None or pair.judgment in (None, "keep-both"):
            continue          # unreadable, or a judgment that asks nothing of the fates: C1 and C2 have said so
        label = _pair_label(pair.tools)
        if "command" in (first.kind, second.kind):
            errors.append(_say(f"{label}: a pair with a command is keep-both only: set the judgment to keep-both"))
        elif first.fate == "left-out" and second.fate == "left-out":
            errors.append(_say(f"{label}: both tools are left-out, so the judgment must be keep-both: neither "
                               "stays to merge into"))
        elif pair.survivor in pair.tools:
            winner, loser = (first, second) if pair.survivor == first.id else (second, first)
            if loser.fate is not None and loser.fate != "left-out":
                errors.append(_say(f"{label}: judgment {pair.judgment}: the non-survivor {loser.id} must be left-out, "
                                   f"its fate is {loser.fate}: leave it out, or judge the pair keep-both"))
            if winner.fate == "left-out":
                errors.append(_say(f"{label}: judgment {pair.judgment}: the survivor {winner.id} must not be "
                                   "left-out: name the other tool the survivor, or judge the pair keep-both"))
    return errors


# --- C5: names ---------------------------------------------------------------------------------------------------

def _capability_views(capabilities: Any) -> list[tuple]:
    """Each capability as (id, the names in its tools list, its body), whatever it is made of."""
    views = []
    for capability in _items(capabilities):
        listed = [tool.get("name") for tool in _items(getattr(capability, "tools", None)) if isinstance(tool, dict)]
        body = getattr(capability, "body", None)
        views.append((getattr(capability, "id", None), [name for name in listed if isinstance(name, str)],
                      body if isinstance(body, str) else ""))
    return views


def _name_errors(roster: list[_Tool], capabilities: Any) -> list[str]:
    shared = Counter(_bare(tool.id) for tool in roster)
    views = _capability_views(capabilities)
    errors: list[str] = []
    for tool in roster:
        name = _bare(tool.id)
        if tool.kind != "server-tool" or tool.fate != "left-out" or not name or shared[name] > 1:
            continue          # a bare name two entries share cannot be decided by name
        word = re.compile(f"(?<![{_WORD}]){re.escape(name)}(?![{_WORD}])")
        for capability_id, listed, body in views:
            where = [place for place, hit in (("its tools list", name in listed),
                                              ("its body as code", any(word.search(code.group())
                                                                       for code in _CODE.finditer(body)))) if hit]
            if where:
                errors.append(_say(f"tool {tool.id}: left-out, but capability {capability_id} names {name} in "
                                   f"{' and '.join(where)}: remove the reference, or give the tool another fate"))
    return errors


# --- C6: the owner ---------------------------------------------------------------------------------------------

def _owner_errors(roster: list[_Tool], declared: _Declared) -> list[str]:
    if not declared.package:
        return []
    errors = []
    for tool in roster:
        if tool.effect != _NOT_GATED and tool.fate in ("served", "left-out") and tool.decided_by != _OWNER:
            effect = tool.effect if isinstance(tool.effect, str) else "(missing or unreadable)"
            errors.append(_say(f"tool {tool.id}: its effect {effect} is gated and its fate is {tool.fate}, so the "
                               "owner decides it: ask the owner and record decided_by owner"))
    return errors


# --- C7: relevance -----------------------------------------------------------------------------------------------

def _presence_errors(document: Any) -> list[str]:
    if needs_review(document):
        return []
    return [_say("server_review is present but the package declares no mcp_servers and no package_server: remove it")]


def _relevance_errors(document: Any, declared: _Declared, roster: list[_Tool]) -> list[str]:
    errors = _presence_errors(document)
    return errors + [_say(f"mcp server {name} has no tool in server_review: judge each of its tools, with ids "
                          f"{name}/<tool>")
                     for name in declared.servers if not any(tool.id.startswith(f"{name}/") for tool in roster)]


# --- C1 to C7 ----------------------------------------------------------------------------------------------------

def server_review_errors(document: Any, capabilities: Any, source_ids: Any) -> list[str]:
    """C1 to C7 over a delivery document: shape, closure, fate, pairs, names, owner and relevance.

    `capabilities` are objects with `.id`, `.tools` (dicts with a `name`) and `.body`; `source_ids` are the
    manifest's. Returns [] when the document has no `server_review`; never raises, whatever the document holds.
    Whether the package must have a review is `release_errors`'s question, not this one's. These checks prove
    closure over the record the AI wrote, nothing more (see the module docstring).
    """
    review = _review(document)
    if review is None:
        return []
    structure = _structure_errors(review)
    if structure:
        return _unique(structure + _presence_errors(document))
    roster, pairs, declared = _roster(review), _pairs(review), _declared(document)
    return _unique(_shape_errors(review, _strings(source_ids)) + _closure_errors(roster, pairs)
                   + _fate_errors(roster, declared) + _pair_fate_errors(roster, pairs)
                   + _name_errors(roster, capabilities) + _owner_errors(roster, declared)
                   + _relevance_errors(document, declared, roster))


# --- C8: the release gate ----------------------------------------------------------------------------------------

def _pinned(sources: Any) -> dict[str, str]:
    return {source["id"]: source["commit"] for source in _dicts(sources)
            if isinstance(source.get("id"), str) and isinstance(source.get("commit"), str)}


def _judged_errors(review: dict, pinned: dict[str, str]) -> list[str]:
    """Each source with a roster entry was judged on a commit that is a prefix of the one now pinned."""
    judged = review["judged_on"]
    errors = []
    for source in dict.fromkeys(tool.source for tool in _roster(review) if isinstance(tool.source, str)):
        if source not in judged:
            errors.append(_say(f"judged_on does not cover source {source}: judge again"))
        elif source not in pinned:
            errors.append(_say(f"source {source} is not among the pinned sources, so judged_on cannot be compared: "
                               "judge again"))
        elif not commit_matches(pinned[source], judged[source]):
            errors.append(_say(f"judged on {source} at {judged[source]}, now pinned at {pinned[source][:8]}: judge "
                               "again"))
    return errors


def _answer_errors(document: dict, pinned: dict[str, str]) -> list[str]:
    """The owner's recorded answer covers each tool of G: its source at the pinned commit, its id shown."""
    gated = gated_tools(document)
    if not gated:
        return []
    if "server_choice" not in document:
        return [_say("the package server needs the owner's recorded answer (server_choice)")]
    given = _as_dict(_as_dict(document["server_choice"]).get("given_on"))
    recorded = _as_dict(given.get("sources"))
    shown = _strings(_items(given.get("shown")))
    errors = []
    for source in dict.fromkeys(entry.get("source") for entry in gated if isinstance(entry.get("source"), str)):
        if source not in recorded:
            errors.append(_say(f"the owner's answer does not cover source {source}"))
        elif source in pinned and not commit_matches(pinned[source], recorded[source]):
            errors.append(_say(f"the owner's answer was given on {source} at {recorded[source]}, now pinned at "
                               f"{pinned[source][:8]}: ask again"))
    for entry in gated:
        identifier = entry.get("id")
        if not _id_ok(identifier):
            errors.append(_say("the owner's answer cannot cover a tool without an id: fix server_review"))
        elif identifier not in shown:
            errors.append(_say(f"the owner's answer does not cover tool {identifier}: ask again"))
    return errors


def release_errors(document: Any, sources: Any, *, owner: bool = True) -> list[str]:
    """C8, the build's gate. `sources` are the manifest's `{"id", "commit"}` entries, the commits as pinned.

    A package that declares servers or a package server must carry its review, judged on the commits now pinned.
    With `owner`, a package server also needs the owner's recorded answer for each gated tool it serves or leaves
    out; the AI's own step passes `owner=False`, since only the owner writes that answer. Never raises. It
    compares commits and ids and judges nothing: whether the review is right is not something it can see.
    """
    if not needs_review(document):
        return []
    review = _review(document)
    if review is None:
        return [_say(f"the package declares servers and no server_review: {_STEP}")]
    if _structure_errors(review):
        return [_say(f"server_review is not a record of judged_on, tools and pairs: {_STEP} again")]
    pinned = _pinned(sources)
    errors = _judged_errors(review, pinned)
    if owner and _declared(document).package:
        errors += _answer_errors(document, pinned)
    return _unique(errors)
