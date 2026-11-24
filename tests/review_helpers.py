"""A valid `server_review` for the made-up packages of the tests that build releases with servers.

Those tests are about what a release registers, not about the review: this gives a package that declares a server (or
a package server) the minimal record that the build needs, every tool judged `none` unless a test says otherwise. The
review's own checks are in tests/test_server_review.py. Stub names only.
"""
import copy
import json

from muro.server_review import needs_review

COMMAND_PROGRAM = "cmd"      # the program under which the roster files a `run` tool of the package server


def _entry(identifier, source, kind, fate, effect="none", served_as=None):
    entry = {"id": identifier, "source": source, "kind": kind, "effect": effect, "basis": "Fixture: read from a stub.",
             "alone": "Fixture: nothing else does this.", "fate": fate,
             "decided_by": "ai" if effect == "none" else "owner", "reason": "Fixture: kept as the package declares it."}
    if served_as:
        entry["served_as"] = served_as
    return entry


def tool_id(declared):
    """The roster id of a declared tool: `<server>/<tool>` of its child, or `cmd/<name>` for a command it runs."""
    forward = declared.get("forward")
    return f'{forward["server"]}/{forward["tool"]}' if forward else f"{COMMAND_PROGRAM}/{declared['name']}"


def reviewed(document, commits, effects=None):
    """A copy of the document with a minimal valid review of what it declares.

    `commits` is one commit for every source, or {source: commit}. `effects` maps the name of a declared tool to an
    effect other than `none`; the owner decides those, so the entry says so.
    """
    effects = effects or {}
    declaration = document.get("package_server")
    children = set(declaration["children"]) if declaration else set()
    tools = [_entry(tool_id(declared), declared["source"], "command" if "run" in declared else "server-tool", "served",
                    effects.get(declared["name"], "none"), declared["name"])
             for declared in (declaration or {}).get("tools", [])]
    tools += [_entry(f'{server["name"]}/echo', server["source"], "server-tool", "registered")
              for server in document.get("mcp_servers", []) if server["name"] not in children]
    judged = {source: commits[source] if isinstance(commits, dict) else commits
              for source in sorted({entry["source"] for entry in tools})}
    document = copy.deepcopy(document)
    document["server_review"] = {"judged_on": judged, "tools": tools, "pairs": []}
    return document


def ensure_review(project):
    """Give the package at `project` a valid review when it declares servers and has none, before a test builds it."""
    path = project / "delivery.json"
    if not path.is_file():                      # a package with no delivery document declares no server
        return
    document = json.loads(path.read_text(encoding="utf-8"))
    if needs_review(document) and "server_review" not in document:
        sources = json.loads((project / "sources.json").read_text(encoding="utf-8"))["sources"]
        path.write_text(json.dumps(reviewed(document, {s["id"]: s["commit"] for s in sources})), encoding="utf-8")
