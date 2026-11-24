"""The `server_review` record of `delivery.json` and the checks that hold it closed (spec of 2026-11-24, C1 to C8).

The harmonizing AI writes the record: what every tool of every absorbed server does to the world, which tools
overlap, and what became of each one. Python checks its shape, its closure and its references and decides nothing
about meaning, so these fixtures prove mechanics only; they say nothing about whether an AI judges well. Servers,
tools and commands here are stubs; no real source is named.
"""
import ast
import copy
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from muro import server_review
from muro.delivery import validate_delivery
from muro.server_review import (DECIDED_BY, EFFECTS, FATES, GATED, JUDGMENTS, KINDS, TEXT_LIMITS, commit_matches,
                                gated_tools, needs_review, release_errors, server_review_errors)

PREFIX = "server_review: "
PINNED = "abc1234" + "0" * 33              # the commit the fixture source is pinned at
SOURCES = [{"id": "demo", "commit": PINNED}]
OTHER = "e" * 40
TWO_SOURCES = [*SOURCES, {"id": "other", "commit": OTHER}]


class Cap:
    """A capability as the checks read it (id, tools, body) and as validate_delivery reads it (hooks)."""

    def __init__(self, identifier, tools=(), body="", hooks=()):
        self.id = identifier
        self.tools = [dict(tool) for tool in tools]
        self.body = body
        self.hooks = list(hooks)


CAPS = [Cap("x", tools=[{"name": "echo"}, {"name": "lookup"}], body="Echo the input, then look it up with lookup.")]


def decision(form):
    return {"source": "demo", "content": "Part of the source.", "form": form, "targets": ["x"], "reason": "Because."}


def tool(identifier, overlaps=None, **over):
    """One roster entry, valid: a server tool of the source, kept as registered, that nothing else does."""
    entry = {"id": identifier, "source": "demo", "kind": "server-tool", "effect": "none",
             "basis": "Its description in the server's README, under Tools.", "fate": "registered",
             "decided_by": "ai", "reason": "Kept as the server offers it."}
    if overlaps:
        entry["overlaps"] = list(overlaps)
    else:
        entry["alone"] = "No other tool does this."
    entry.update(over)
    return entry


FORWARD = {"name": "echo", "source": "demo", "description": "Echo, in the child's words.",
           "input_schema": {"type": "object", "properties": {}}, "forward": {"server": "stub", "tool": "echo"}}
RUN = {"name": "lookup", "source": "demo", "description": "Look up q.",
       "input_schema": {"type": "object", "properties": {"q": {"type": "string"}}, "required": ["q"]},
       "run": ["node", "<package_root>/scripts/demo/tool.js", "lookup", "{q}"]}
PAIR = {"tools": ["stub/ping", "side/ping"], "judgment": "merge", "survivor": "side/ping",
        "reason": "Both answer a ping with the same fields; the side server's copy stays registered.",
        "evidence": ["README.md#tools"]}


def lookup():
    return tool("tool/lookup", kind="command", effect="sends", fate="served", served_as="lookup",
                decided_by="owner", basis="SKILL.md, under Commands.")


def roster():
    return [
        tool("stub/echo", fate="served", served_as="echo"),
        tool("stub/ping", ["side/ping"], fate="left-out"),
        tool("side/ping", ["stub/ping"]),
        tool("stub/post", effect="writes", fate="left-out", decided_by="owner",
             reason="The owner keeps tools that write off the package server."),
        lookup(),
    ]


def base():
    """A package server with one child (`stub`) beside a registered server (`side`) and one command, reviewed."""
    return copy.deepcopy({
        "decisions": [decision("capability"), decision("mcp-server"), decision("package-tool")],
        "mcp_servers": [{"name": "stub", "source": "demo", "run": ["python", "-m", "stub_server"]},
                        {"name": "side", "source": "demo", "run": ["python", "-m", "side_server"]}],
        "package_server": {"name": "pack", "children": ["stub"], "tools": [FORWARD, RUN]},
        "server_choice": {"asked_on": "2026-11-24", "answer": "Serve the lookup and keep posting off the server.",
                          "given_on": {"sources": {"demo": "abc1234"}, "shown": ["stub/post", "tool/lookup"]}},
        "server_review": {"judged_on": {"demo": "abc1234"}, "tools": roster(), "pairs": [PAIR]},
    })


def servers_only():
    """Servers registered as they are: no package server, so nothing is served or left out."""
    document = base()
    del document["package_server"], document["server_choice"]
    document["decisions"] = [decision("capability"), decision("mcp-server")]
    document["server_review"] = {"judged_on": {"demo": "abc1234"}, "pairs": [], "tools": [
        tool("stub/echo"), tool("side/ping", effect="writes")]}
    return document


def run_only():
    """A package server that only runs a packaged command: no absorbed server, no child."""
    document = base()
    del document["mcp_servers"]
    document["decisions"] = [decision("capability"), decision("package-tool")]
    document["package_server"] = {"name": "pack", "children": [], "tools": [copy.deepcopy(RUN)]}
    document["server_choice"]["given_on"]["shown"] = ["tool/lookup"]
    document["server_review"] = {"judged_on": {"demo": "abc1234"}, "tools": [lookup()], "pairs": []}
    return document


def errors_for(document, capabilities=None, sources=("demo",)):
    return server_review_errors(document, CAPS if capabilities is None else capabilities, set(sources))


def entry(document, identifier):
    return next(item for item in document["server_review"]["tools"] if item["id"] == identifier)


def the_pair(document):
    return document["server_review"]["pairs"][0]


def set_tool(identifier, **changes):
    def mutate(document):
        entry(document, identifier).update(changes)
    return mutate


def drop_tool_key(identifier, *keys):
    def mutate(document):
        for key in keys:
            del entry(document, identifier)[key]
    return mutate


def set_pair(**changes):
    def mutate(document):
        the_pair(document).update(changes)
    return mutate


def drop_pair_key(*keys):
    def mutate(document):
        for key in keys:
            del the_pair(document)[key]
    return mutate


def set_review(**changes):
    def mutate(document):
        document["server_review"].update(changes)
    return mutate


def add_tool(*entries):
    def mutate(document):
        document["server_review"]["tools"].extend(entries)
    return mutate


def add_pair(*pairs):
    def mutate(document):
        document["server_review"]["pairs"].extend(copy.deepcopy(list(pairs)))
    return mutate


def several(*mutations):
    def mutate(document):
        for mutation in mutations:
            mutation(document)
    return mutate


def without_package_server(document):
    del document["package_server"], document["server_choice"]


def assert_reports(document, message, capabilities=None):
    errors = errors_for(document, capabilities)
    assert any(message in error for error in errors), errors
    assert all(error.startswith(PREFIX) for error in errors), errors


# --- The constants ---------------------------------------------------------------------------------------------

def test_the_constants_are_the_specs():
    assert EFFECTS == ("none", "writes", "sends", "writes-and-sends", "undetermined")
    assert FATES == ("served", "registered", "command", "left-out")
    assert KINDS == ("server-tool", "command")
    assert JUDGMENTS == ("keep-both", "merge", "discard")
    assert DECIDED_BY == ("ai", "owner")
    assert TEXT_LIMITS == {"basis": 600, "reason": 400, "alone": 300, "pair_reason": 600}


def test_every_effect_but_none_is_gated_and_undetermined_is_one_of_them():
    assert GATED == frozenset({"writes", "sends", "writes-and-sends", "undetermined"})
    assert "none" not in GATED and "undetermined" in GATED
    assert GATED == frozenset(EFFECTS) - {"none"}


# --- The fixtures are what they claim ----------------------------------------------------------------------------

@pytest.mark.parametrize("make", [base, servers_only, run_only])
def test_a_fixture_is_a_valid_delivery_document_once_its_review_is_set_aside(make):
    # The fixtures must be the shapes delivery.py accepts for the servers, the package server and the answer.
    document = make()
    del document["server_review"]
    assert validate_delivery(document, [Cap("x")], {"demo"}) == []


@pytest.mark.parametrize("make", [base, servers_only, run_only])
def test_a_valid_record_has_no_error_anywhere(make):
    document = make()
    assert errors_for(document) == []
    assert release_errors(document, SOURCES) == []
    assert release_errors(document, SOURCES, owner=False) == []


def test_a_document_without_a_review_has_nothing_to_check():
    document = base()
    del document["server_review"]
    assert errors_for(document) == []
    document["server_review"] = None            # a null is read as absent, as delivery.py reads a null package_server
    assert errors_for(document) == []


# --- C1: shape ---------------------------------------------------------------------------------------------------

SHAPE = [
    # the record itself
    (lambda d: d.update(server_review=[]), "the record must be an object with exactly judged_on, tools and pairs"),
    (lambda d: d.update(server_review="x"), "the record must be an object with exactly judged_on, tools and pairs"),
    (lambda d: d["server_review"].pop("pairs"), "exactly judged_on, tools and pairs: missing pairs"),
    (lambda d: d["server_review"].update(extra=1), "exactly judged_on, tools and pairs: unknown extra"),
    (lambda d: (d["server_review"].pop("pairs"), d["server_review"].update(extra=1)),
     "exactly judged_on, tools and pairs: missing pairs; unknown extra"),
    (set_review(tools={}), "tools must be a list of tool entries"),
    (set_review(pairs="x"), "pairs must be a list of pair entries"),
    (set_review(judged_on=[]), "judged_on must be an object of source ids and commits"),
    # judged_on
    (lambda d: d["server_review"]["judged_on"].update(ghost="abc1234"),
     "judged_on names ghost, which is not a source of this package"),
    (lambda d: d["server_review"]["judged_on"].update(demo="abc12"),
     "judged_on: the commit of demo must be at least 7 hex characters"),
    (lambda d: d["server_review"]["judged_on"].update(demo="zzzzzzz"),
     "judged_on: the commit of demo must be at least 7 hex characters"),
    (lambda d: d["server_review"]["judged_on"].update(demo=7),
     "judged_on: the commit of demo must be at least 7 hex characters"),
    (lambda d: d["server_review"]["judged_on"].clear(), "judged_on does not cover source demo, which tool stub/echo"),
    # a tool entry
    (add_tool(7), "tools[5] must be an object"),
    (drop_tool_key("stub/echo", "basis", "reason"), "tool stub/echo: missing basis, reason"),
    (drop_tool_key("stub/echo", "effect"), "tool stub/echo: missing effect"),
    (set_tool("stub/echo", extra=1), "tool stub/echo: unknown key extra"),
    (drop_tool_key("stub/echo", "id"), "tools[0]: missing id"),
    (set_tool("stub/echo", id=""), "tools[0]: id must be nonempty text with no leading or trailing space"),
    (set_tool("stub/echo", id=" stub/echo"), "tools[0]: id must be nonempty text with no leading or trailing space"),
    (set_tool("stub/echo", id="stub/echo "), "tools[0]: id must be nonempty text with no leading or trailing space"),
    (set_tool("stub/echo", id=7), "tools[0]: id must be nonempty text with no leading or trailing space"),
    (add_tool(tool("stub/echo")), "tool stub/echo: id appears more than once"),
    (set_tool("stub/echo", source="ghost"), "tool stub/echo: source ghost is not a source of this package"),
    (set_tool("stub/echo", source=["demo"]), "tool stub/echo: source ['demo'] is not a source of this package"),
    (set_tool("stub/echo", kind="program"), "tool stub/echo: kind must be one of server-tool, command"),
    (set_tool("stub/echo", effect="write"),
     "tool stub/echo: effect must be one of none, writes, sends, writes-and-sends, undetermined"),
    (set_tool("stub/echo", effect=["none"]),
     "tool stub/echo: effect must be one of none, writes, sends, writes-and-sends, undetermined"),
    (set_tool("stub/echo", fate="gone"), "tool stub/echo: fate must be one of served, registered, command, left-out"),
    (set_tool("stub/echo", decided_by="nobody"), "tool stub/echo: decided_by must be one of ai, owner"),
    (set_tool("stub/echo", basis=""), "tool stub/echo: basis must be nonempty text"),
    (set_tool("stub/echo", basis=7), "tool stub/echo: basis must be nonempty text"),
    (set_tool("stub/echo", reason="  "), "tool stub/echo: reason must be nonempty text"),
    (set_tool("stub/echo", alone=""), "tool stub/echo: alone must be nonempty text"),
    (set_tool("stub/echo", overlaps=["stub/ping"]), "tool stub/echo: has both overlaps and alone"),
    (set_tool("stub/echo", overlaps=[""]), "tool stub/echo: has both overlaps and alone"),
    (set_tool("stub/echo", overlaps=None), "tool stub/echo: has both overlaps and alone"),
    (drop_tool_key("stub/echo", "alone"), "tool stub/echo: has neither overlaps nor alone"),
    (set_tool("stub/ping", overlaps=[]), "tool stub/ping: overlaps must be a nonempty list of tool ids (a tool that "
                                         "overlaps nothing gives alone instead)"),
    (set_tool("stub/ping", overlaps="side/ping"), "tool stub/ping: overlaps must be a nonempty list of tool ids"),
    (set_tool("stub/ping", overlaps=[""]), "tool stub/ping: overlaps must be a nonempty list of tool ids"),
    (set_tool("stub/ping", overlaps=[3]), "tool stub/ping: overlaps must be a nonempty list of tool ids"),
    (drop_tool_key("stub/echo", "served_as"), "tool stub/echo: fate served needs served_as"),
    (set_tool("stub/echo", served_as=""), "tool stub/echo: served_as must be nonempty text"),
    (set_tool("side/ping", served_as="ping"), "tool side/ping: served_as is only for fate served"),
    # a pair
    (add_pair("x"), "pairs[1] must be an object"),
    (drop_pair_key("evidence"), "pair (stub/ping, side/ping): missing evidence"),
    (set_pair(extra=1), "pair (stub/ping, side/ping): unknown key extra"),
    (set_pair(tools=["stub/ping"]), "pairs[0]: tools must be exactly two distinct tool ids"),
    (set_pair(tools=["stub/ping", "stub/ping"]), "pairs[0]: tools must be exactly two distinct tool ids"),
    (set_pair(tools=["stub/ping", 3]), "pairs[0]: tools must be exactly two distinct tool ids"),
    (set_pair(tools="stub/ping"), "pairs[0]: tools must be exactly two distinct tool ids"),
    (set_pair(tools=["stub/ping", "side/ping", "stub/echo"]), "pairs[0]: tools must be exactly two distinct tool ids"),
    (set_pair(judgment="both"), "judgment must be one of keep-both, merge, discard"),
    (set_pair(reason=""), "pair (stub/ping, side/ping): reason must be nonempty text"),
    (set_pair(evidence=[]), "evidence must be a nonempty list of source paths or sections"),
    (set_pair(evidence=[""]), "evidence must be a nonempty list of source paths or sections"),
    (set_pair(evidence="README.md"), "evidence must be a nonempty list of source paths or sections"),
    (drop_pair_key("survivor"), "judgment merge needs survivor, one of its two ids"),
    (set_pair(survivor="stub/echo"), "survivor must be one of its two ids"),
    (set_pair(judgment="keep-both"), "survivor is only for merge and discard"),
]


@pytest.mark.parametrize("mutate, message", SHAPE)
def test_shape_is_checked(mutate, message):
    document = base()
    mutate(document)
    assert_reports(document, message)


@pytest.mark.parametrize("where, key, limit", [
    ("tool", "basis", 600), ("tool", "reason", 400), ("tool", "alone", 300), ("pair", "reason", 600)])
def test_a_text_at_its_limit_passes_and_one_character_more_asks_to_shorten(where, key, limit):
    def set_text(document, size):
        target = entry(document, "stub/echo") if where == "tool" else the_pair(document)
        target[key] = "x" * size

    document = base()
    set_text(document, limit)
    assert errors_for(document) == []
    set_text(document, limit + 1)
    assert_reports(document, f"{key} is {limit + 1} characters, over {limit}: shorten it")


def test_a_shape_error_does_not_hide_the_closure_errors_beside_it():
    # A text over its limit is the commonest slip; the AI should see it together with a missing pair, not after it.
    document = base()
    entry(document, "stub/echo")["basis"] = "x" * 601
    document["server_review"]["pairs"].clear()
    errors = errors_for(document)
    assert any("shorten it" in error for error in errors) and any("pairs has no entry for them" in error for error in errors)


def test_the_source_must_be_one_of_the_manifest():
    document = base()
    assert errors_for(document, sources=("other",))      # `demo` is no source of this manifest
    assert any("source demo is not a source of this package" in error for error in errors_for(document, sources=()))


def test_an_empty_overlaps_beside_alone_is_the_alone_case():
    # A model writes `"overlaps": []` for every tool that overlaps nothing (41 of 62 entries of the first real record):
    # it says what `alone` says, so it is read as absent and costs no message.
    document = base()
    for item in document["server_review"]["tools"]:
        if "alone" in item:
            item["overlaps"] = []
    assert any(item["overlaps"] == [] for item in document["server_review"]["tools"])
    assert errors_for(document) == []


# --- C2: closure -------------------------------------------------------------------------------------------------

CLOSURE = [
    (set_tool("stub/ping", overlaps=["ghost/x"]), "tool stub/ping: overlaps names ghost/x, which is not a roster id"),
    (set_tool("stub/ping", overlaps=["stub/ping"]), "tool stub/ping: overlaps names itself"),
    (lambda d: d["server_review"]["pairs"].clear(),
     "pair (side/ping, stub/ping): the tools overlap but pairs has no entry for them"),
    (add_pair(PAIR), "pair (stub/ping, side/ping): the pair is judged 2 times: keep one entry"),
    (add_pair({**PAIR, "tools": ["side/ping", "stub/ping"]}),
     "pair (stub/ping, side/ping): the pair is judged 2 times: keep one entry"),
    (add_pair({**PAIR, "judgment": "keep-both"}), "the pair is judged 2 times"),
    (add_pair({"tools": ["stub/echo", "stub/post"], "judgment": "keep-both", "reason": "They are unrelated.",
               "evidence": ["README.md"]}), "pair (stub/echo, stub/post): neither tool lists the other in overlaps"),
    (set_pair(tools=["stub/ping", "ghost/x"], survivor="stub/ping"), "pair (stub/ping, ghost/x): ghost/x is not a roster id"),
]


@pytest.mark.parametrize("mutate, message", CLOSURE)
def test_closure_is_checked(mutate, message):
    document = base()
    mutate(document)
    assert_reports(document, message)


def test_an_overlap_listed_by_one_tool_only_needs_one_pair():
    document = base()
    set_tool("side/ping", alone="Nothing else pings.")(document)
    del entry(document, "side/ping")["overlaps"]
    assert errors_for(document) == []


def test_a_pair_listed_twice_is_one_message():
    document = base()
    add_pair(PAIR, {**PAIR, "tools": ["side/ping", "stub/ping"]})(document)
    assert len([e for e in errors_for(document) if "is judged" in e]) == 1


def test_a_pair_member_that_is_no_roster_id_is_said_once_without_a_missing_edge_on_top():
    document = base()
    document["server_review"]["pairs"].append({**PAIR, "tools": ["stub/echo", "ghost/x"], "judgment": "keep-both"})
    del document["server_review"]["pairs"][-1]["survivor"]
    errors = errors_for(document)
    assert any("pair (stub/echo, ghost/x): ghost/x is not a roster id" in error for error in errors)
    assert not any("neither tool lists the other" in error for error in errors)


# --- C3: fate and declaration ------------------------------------------------------------------------------------

def _forwarding(document):
    document["package_server"]["tools"][0]["forward"]["tool"] = "other"


def _another_server(document):
    document["mcp_servers"].append({"name": "third", "source": "demo", "run": ["python", "-m", "third_server"]})


FATE = [
    # every declared tool has exactly one roster entry served as its name, and no served entry lacks a tool
    (drop_tool_key("tool/lookup", "served_as"), "tool tool/lookup: fate served needs served_as"),
    (several(set_tool("tool/lookup", fate="command"), drop_tool_key("tool/lookup", "served_as")),
     "package_server tool lookup has no roster entry with fate served and served_as lookup"),
    (set_tool("stub/echo", served_as="ghost"), "tool stub/echo: its fate is served as ghost, but package_server declares no tool named ghost"),
    (set_tool("stub/echo", served_as="ghost"), "package_server tool echo has no roster entry with fate served and served_as echo"),
    (add_tool(tool("stub/echo2", fate="served", served_as="echo")), "package_server tool echo is served by 2 roster entries (stub/echo, stub/echo2)"),
    (_forwarding, "tool stub/echo: serves the forwarded tool echo, so its id must be stub/other"),
    (set_tool("tool/lookup", kind="server-tool"),
     "tool tool/lookup: serves the tool lookup, which runs a command, so its kind must be command"),
    # registered and left-out against the servers and the children
    (set_tool("side/ping", id="ghost/ping"), "tool ghost/ping: a server-tool id is <server>/<tool>"),
    (set_tool("side/ping", id="ping"), "tool ping: a server-tool id is <server>/<tool>"),
    (set_tool("side/ping", id="side/"), "tool side/: a server-tool id is <server>/<tool>"),
    (set_tool("side/ping", source="other"), "tool side/ping: source other differs from the source of its server side (demo)"),
    (set_tool("side/ping", id="stub/ping2"), "tool stub/ping2: fate registered, but its server stub is a child of the package server"),
    (set_tool("stub/ping", id="side/ping2"), "tool side/ping2: fate left-out, but its server side is not a child of the package server"),
    # a command
    (several(set_tool("tool/lookup", fate="registered"), drop_tool_key("tool/lookup", "served_as")),
     "tool tool/lookup: a command is never registered or left-out"),
    (several(set_tool("tool/lookup", fate="left-out"), drop_tool_key("tool/lookup", "served_as")),
     "tool tool/lookup: a command is never registered or left-out"),
    (set_tool("stub/ping", fate="command"), "tool stub/ping: fate command requires kind command"),
]


@pytest.mark.parametrize("mutate, message", FATE)
def test_fate_and_declaration_are_checked(mutate, message):
    document = base()
    mutate(document)
    assert_reports(document, message)


def test_a_declared_tool_with_its_one_served_entry_passes_whatever_the_order():
    document = base()
    document["server_review"]["tools"].reverse()
    assert errors_for(document) == []


@pytest.mark.parametrize("fate", ["served", "left-out"])
def test_without_a_package_server_no_entry_is_served_or_left_out(fate):
    document = base()
    without_package_server(document)
    entry(document, "stub/echo")["fate"] = fate
    assert any(f"tool stub/echo: fate {fate} needs a package_server, and the package declares none" in error
               for error in errors_for(document))
    assert any("tool stub/post: fate left-out needs a package_server" in error for error in errors_for(document))


def test_without_a_package_server_registered_servers_alone_are_fine():
    assert errors_for(servers_only()) == []


def test_a_registered_server_may_be_a_child_of_no_package_server():
    document = servers_only()
    entry(document, "stub/echo")["fate"] = "registered"
    assert errors_for(document) == []


def test_a_server_tool_id_names_a_declared_server_and_the_source_of_that_server():
    document = base()
    _another_server(document)
    document["server_review"]["tools"].append(tool("third/x"))
    assert errors_for(document) == []
    entry(document, "third/x")["source"] = "other"
    assert any("source other differs from the source of its server third (demo)" in e
               for e in errors_for(document, sources=("demo", "other")))


def test_a_command_that_is_not_served_may_be_a_command():
    document = base()
    add_tool(tool("tool/ls", kind="command", fate="command"))(document)
    assert errors_for(document) == []


def test_the_entry_that_serves_a_forwarded_tool_is_a_server_tool():
    document = base()
    set_tool("stub/echo", kind="command")(document)
    assert_reports(document, "serves the forwarded tool echo, so its kind must be server-tool")


@pytest.mark.parametrize("identifier", ["stub/echo", "tool/lookup"])
def test_the_entry_that_serves_a_tool_carries_the_source_the_tool_is_declared_with(identifier):
    # The owner's answer is read from the source of the roster entry: a different source would be covered at another commit.
    document = base()
    set_tool(identifier, source="other")(document)
    document["server_review"]["judged_on"]["other"] = "e" * 7
    errors = errors_for(document, sources=("demo", "other"))
    assert any("so its source must be demo" in error for error in errors), errors


# --- C4: pair and fate -------------------------------------------------------------------------------------------

def _third_left_out(document):
    # A second left-out tool of the child, overlapping `stub/ping`: both members of a new pair are left out.
    set_tool("stub/ping", overlaps=["side/ping", "stub/pong"])(document)
    add_tool(tool("stub/pong", ["stub/ping"], fate="left-out"))(document)


def _command_overlaps(document):
    set_tool("tool/lookup", overlaps=["stub/echo"])(document)
    del entry(document, "tool/lookup")["alone"]
    set_tool("stub/echo", overlaps=["tool/lookup"])(document)
    del entry(document, "stub/echo")["alone"]


def _pair(judgment, first, second, survivor=None):
    pair = {"tools": [first, second], "judgment": judgment, "reason": "Judged from the READMEs.",
            "evidence": ["README.md"]}
    if survivor:
        pair["survivor"] = survivor
    return pair


PAIR_FATE = [
    (set_pair(survivor="stub/ping"), "judgment merge: the non-survivor side/ping must be left-out, its fate is registered"),
    (set_pair(survivor="stub/ping"), "judgment merge: the survivor stub/ping must not be left-out"),
    (set_pair(judgment="discard", survivor="stub/ping"), "judgment discard: the non-survivor side/ping must be left-out"),
    (several(_third_left_out, add_pair(_pair("merge", "stub/ping", "stub/pong", "stub/pong"))),
     "pair (stub/ping, stub/pong): both tools are left-out, so the judgment must be keep-both"),
    (several(_third_left_out, add_pair(_pair("discard", "stub/ping", "stub/pong", "stub/ping"))),
     "pair (stub/ping, stub/pong): both tools are left-out, so the judgment must be keep-both"),
    (several(_command_overlaps, add_pair(_pair("merge", "tool/lookup", "stub/echo", "stub/echo"))),
     "pair (tool/lookup, stub/echo): a pair with a command is keep-both only"),
    (several(_command_overlaps, add_pair(_pair("discard", "stub/echo", "tool/lookup", "tool/lookup"))),
     "pair (stub/echo, tool/lookup): a pair with a command is keep-both only"),
]


@pytest.mark.parametrize("mutate, message", PAIR_FATE)
def test_pair_and_fate_are_checked(mutate, message):
    document = base()
    mutate(document)
    assert_reports(document, message)


def test_a_discard_with_the_right_fates_passes_as_a_merge_does():
    document = base()
    set_pair(judgment="discard")(document)
    assert errors_for(document) == []


def test_keep_both_is_allowed_whatever_the_fates():
    document = base()
    set_pair(judgment="keep-both")(document)
    del the_pair(document)["survivor"]
    assert errors_for(document) == []


def test_two_left_out_members_are_a_keep_both_and_it_passes():
    # Found on a real record: two tools of the same child, both left out, judged as a merge.
    document = base()
    several(_third_left_out, add_pair(_pair("keep-both", "stub/ping", "stub/pong")))(document)
    assert errors_for(document) == []


def test_a_command_pair_that_is_keep_both_passes():
    document = base()
    several(_command_overlaps, add_pair(_pair("keep-both", "tool/lookup", "stub/echo")))(document)
    assert errors_for(document) == []


def test_a_wrong_merge_of_two_left_out_tools_gets_one_message_not_three():
    document = base()
    several(_third_left_out, add_pair(_pair("merge", "stub/ping", "stub/pong", "stub/pong")))(document)
    messages = [e for e in errors_for(document) if "pair (stub/ping, stub/pong)" in e]
    assert len(messages) == 1


# --- C5: names ---------------------------------------------------------------------------------------------------

def test_a_left_out_tool_named_by_no_capability_passes():
    assert errors_for(base(), [Cap("x", tools=[{"name": "echo"}], body="Use echo.")]) == []


def test_a_capability_that_lists_a_left_out_tool_is_named():
    caps = [*CAPS, Cap("y", tools=[{"name": "post"}])]
    assert_reports(base(), "tool stub/post: left-out, but capability y names post in its tools list", caps)


def test_a_capability_whose_body_names_a_left_out_tool_as_code_is_named():
    caps = [*CAPS, Cap("y", body="Then run `post` on the result.")]
    assert_reports(base(), "tool stub/post: left-out, but capability y names post in its body as code", caps)


def test_a_name_in_the_tools_and_the_body_is_one_message_for_that_capability():
    caps = [Cap("y", tools=[{"name": "post"}], body="Then `post` it.")]
    messages = [e for e in errors_for(base(), caps) if "capability y" in e]
    assert len(messages) == 1 and "in its tools list and its body as code" in messages[0]


@pytest.mark.parametrize("body, named", [
    # code: an inline span on one line, or a fenced block
    ("Call `stub/post` now", True), ("Then `post`.", True), ("(`post`)", True), ("`post`", True),
    ("`a,post,b`", True), ("`post --now`", True), ("```\npost(1)\n```", True), ("```sh\nrun post\n```", True),
    # prose is not a reference, whatever the word
    ("Then post.", False), ("post", False), ("(post)", False), ("Call stub/post now", False),
    ("Do not post the label.", False),
    # a span that holds another word, or the word only as part of one
    ("`Post` it", False), ("`post-office`", False), ("`repost`", False), ("`post_it`", False), ("`posts`", False),
    ("`pre-post`", False), ("`2post`", False),
    # code that does not close is not code
    ("Then `post it", False), ("```\npost(1)", False), ("`post\n`", False)])
def test_the_body_names_a_tool_as_a_whole_word_inside_code_only(body, named):
    errors = errors_for(base(), [Cap("y", body=body)])
    assert any("capability y names post in its body as code" in e for e in errors) is named, errors


def test_an_ordinary_verb_that_is_also_a_left_out_tool_name_is_not_a_reference():
    # The first real package said "Do not transcribe what the label says" in two bodies while one of its server tools
    # was called transcribe and was left out: that is prose, and asking the model to rewrite it would alter the source.
    document = base()
    add_tool(tool("stub/transcribe", effect="writes", fate="left-out", decided_by="owner"))(document)
    prose = [Cap("y", body="Do not transcribe what the label says: redrawn text comes back warped.")]
    assert errors_for(document, prose) == []
    code = [Cap("y", body="Transcribe it with `transcribe`.")]
    assert_reports(document, "tool stub/transcribe: left-out, but capability y names transcribe in its body as code",
                   code)


def test_a_bare_name_two_roster_entries_share_is_not_decided_by_name():
    # `ping` is the bare name of `stub/ping` (left out) and of `side/ping` (registered): a capability may use it.
    caps = [Cap("y", tools=[{"name": "ping"}], body="Ping the server with ping.")]
    assert errors_for(base(), caps) == []


def test_a_bare_name_a_command_shares_is_not_decided_by_name_either():
    document = base()
    add_tool(tool("post", kind="command", fate="command"))(document)
    assert errors_for(document, [Cap("y", tools=[{"name": "post"}], body="Run post.")]) == []


def test_only_a_left_out_server_tool_is_checked_by_name():
    # `side/ping` is registered and `echo` is served: naming them is the point.
    caps = [Cap("y", tools=[{"name": "echo"}, {"name": "ping"}], body="echo, then side/ping.")]
    assert errors_for(base(), caps) == []


def test_a_capability_without_tools_or_body_is_read_as_empty():
    caps = [SimpleNamespace(id="y"), SimpleNamespace(id="z", tools=None, body=None),
            SimpleNamespace(id="w", tools=[None, 3, {"name": 5}, {}], body=7)]
    assert errors_for(base(), caps) == []


# --- C6: the owner decides what the package server serves or leaves out of what acts on the world ---------------

OWNER = [
    (set_tool("tool/lookup", decided_by="ai"), "tool tool/lookup: its effect sends is gated and its fate is served, so the owner decides it"),
    (set_tool("stub/post", decided_by="ai"), "tool stub/post: its effect writes is gated and its fate is left-out, so the owner decides it"),
    (set_tool("stub/echo", effect="undetermined"), "tool stub/echo: its effect undetermined is gated and its fate is served"),
    (set_tool("stub/echo", effect="writes-and-sends"), "tool stub/echo: its effect writes-and-sends is gated"),
    (set_tool("stub/echo", effect="sends"), "so the owner decides it"),
]


@pytest.mark.parametrize("mutate, message", OWNER)
def test_a_gated_tool_served_or_left_out_by_the_ai_is_refused(mutate, message):
    document = base()
    mutate(document)
    assert_reports(document, message)


def test_an_ungated_tool_may_be_decided_by_the_ai_and_a_gated_one_by_the_owner():
    document = base()
    set_tool("stub/echo", decided_by="owner")(document)
    assert errors_for(document) == []


def test_a_gated_tool_that_stays_registered_is_not_the_owners_to_decide():
    document = base()
    set_tool("side/ping", effect="writes")(document)
    assert errors_for(document) == []


def test_without_a_package_server_the_owner_decides_nothing():
    document = servers_only()
    entry(document, "stub/echo").update(effect="undetermined", decided_by="ai")
    assert errors_for(document) == []


# --- C7: relevance -----------------------------------------------------------------------------------------------

def test_a_review_without_servers_is_refused():
    review = {"judged_on": {"demo": "abc1234"}, "tools": [], "pairs": []}
    for document in ({"server_review": review}, {"mcp_servers": [], "server_review": review}):
        assert any("server_review is present but the package declares no mcp_servers and no package_server: remove it"
                   in e for e in errors_for(document)), document


def test_a_declared_server_with_no_roster_entry_is_named():
    document = base()
    _another_server(document)
    assert_reports(document, "mcp server third has no tool in server_review")
    document["server_review"]["tools"].append(tool("third/x"))
    assert errors_for(document) == []


def test_a_roster_id_that_only_starts_like_a_server_name_does_not_count_for_it():
    document = base()
    document["mcp_servers"].append({"name": "sid", "source": "demo", "run": ["python", "-m", "sid_server"]})
    assert_reports(document, "mcp server sid has no tool in server_review")        # `side/ping` is not `sid/...`


def test_a_package_server_of_commands_only_is_reviewed_without_any_absorbed_server():
    document = run_only()
    assert errors_for(document) == []
    del document["server_review"]["tools"][0]["served_as"]
    assert_reports(document, "tool tool/lookup: fate served needs served_as")


def test_a_package_server_of_commands_only_is_gated_like_any_other():
    document = run_only()
    set_tool("tool/lookup", decided_by="ai")(document)
    assert_reports(document, "tool tool/lookup: its effect sends is gated and its fate is served, so the owner decides it")
    set_tool("tool/lookup", decided_by="owner")(document)
    assert errors_for(document) == []
    entry(document, "tool/lookup")["kind"] = "server-tool"
    assert_reports(document, "serves the tool lookup, which runs a command, so its kind must be command")


# --- C8: the release gate ----------------------------------------------------------------------------------------

def test_needs_review_reads_the_declared_servers():
    assert needs_review({"mcp_servers": [{"name": "stub"}]})
    assert needs_review({"package_server": {"name": "pack", "children": [], "tools": []}})
    assert needs_review({"mcp_servers": [], "package_server": {}})
    assert not needs_review({"mcp_servers": []})
    assert not needs_review({"package_server": None})
    assert not needs_review({"decisions": []})
    for garbage in (None, [], "x", 0, True):
        assert needs_review(garbage) is False


@pytest.mark.parametrize("make", [base, servers_only, run_only])
def test_a_package_that_declares_servers_must_carry_its_review(make):
    document = make()
    del document["server_review"]
    expected = PREFIX + "the package declares servers and no server_review: run the harmonization step 'Servers and tools'"
    assert release_errors(document, SOURCES) == [expected]
    assert release_errors(document, SOURCES, owner=False) == [expected]
    document["server_review"] = None
    assert release_errors(document, SOURCES) == [expected]


def test_the_owner_switch_is_keyword_only():
    with pytest.raises(TypeError):
        release_errors(base(), SOURCES, False)


def test_the_release_gate_leaves_the_shape_to_the_shape_check():
    # C8 compares commits and ids; a text over its limit is C1's, said once by the check that owns it.
    document = base()
    entry(document, "stub/echo")["basis"] = "x" * 601
    assert release_errors(document, SOURCES) == []
    assert any("shorten it" in error for error in errors_for(document))


def test_a_declared_server_list_that_is_not_empty_counts_as_declared_whatever_it_holds():
    # Fail closed: a malformed `mcp_servers` is the shape check's to refuse, and does not excuse the review.
    assert needs_review({"mcp_servers": "x"}) and needs_review({"mcp_servers": [None]})
    assert release_errors({"mcp_servers": [None]}, SOURCES) == [
        PREFIX + "the package declares servers and no server_review: run the harmonization step 'Servers and tools'"]


def test_a_package_without_servers_needs_no_review():
    assert release_errors({"decisions": []}, SOURCES) == []
    assert release_errors({"mcp_servers": []}, SOURCES) == []
    assert release_errors({"mcp_servers": [], "server_review": {"judged_on": {}, "tools": [], "pairs": []}}, SOURCES) == []


@pytest.mark.parametrize("review", [[], "x", 0, {}, {"judged_on": {}, "tools": {}, "pairs": []},
                                    {"judged_on": [], "tools": [], "pairs": []}, {"judged_on": {}, "tools": []}])
def test_a_review_that_is_not_a_record_does_not_pass_the_gate(review):
    document = base()
    document["server_review"] = review
    errors = release_errors(document, SOURCES)
    assert len(errors) == 1 and "server_review is not a record of judged_on, tools and pairs" in errors[0]


@pytest.mark.parametrize("recorded", ["abc1234", "ABC1234", "AbC1234", "abc12340", PINNED, PINNED.upper()])
def test_a_judgment_made_on_a_prefix_of_the_pinned_commit_stands_whatever_its_case(recorded):
    document = base()
    document["server_review"]["judged_on"]["demo"] = recorded
    assert release_errors(document, SOURCES) == []


@pytest.mark.parametrize("recorded", ["abc1235", "abc123", "f" * 7, "abc12340" + "0" * 33, "zzzzzzz", "", 7, None])
def test_a_judgment_made_on_another_commit_asks_to_judge_again(recorded):
    document = base()
    document["server_review"]["judged_on"]["demo"] = recorded
    assert release_errors(document, SOURCES) == [
        PREFIX + f"judged on demo at {recorded}, now pinned at abc12340: judge again"]


def test_a_source_the_judgment_does_not_name_asks_to_judge_again():
    document = base()
    document["server_review"]["judged_on"] = {}
    assert release_errors(document, SOURCES) == [PREFIX + "judged_on does not cover source demo: judge again"]


def test_every_source_with_a_roster_entry_is_compared_and_only_those():
    document = base()
    entry(document, "tool/lookup")["source"] = "other"
    document["server_choice"]["given_on"]["sources"]["other"] = "eeeeeee"
    document["server_review"]["judged_on"]["other"] = "eeeeeee"
    assert release_errors(document, TWO_SOURCES) == []
    document["server_review"]["judged_on"]["other"] = "ddddddd"
    assert PREFIX + "judged on other at ddddddd, now pinned at eeeeeeee: judge again" in release_errors(document, TWO_SOURCES)
    document["server_review"]["judged_on"]["ghost"] = "1111111"      # no roster entry: not compared
    document["server_review"]["judged_on"]["other"] = "eeeeeee"
    assert release_errors(document, TWO_SOURCES) == []


def test_a_roster_source_the_manifest_does_not_pin_cannot_be_compared_and_is_refused():
    document = base()
    entry(document, "tool/lookup")["source"] = "other"
    document["server_review"]["judged_on"]["other"] = "eeeeeee"
    errors = release_errors(document, SOURCES)
    assert any("source other is not among the pinned sources" in e and e.startswith(PREFIX) for e in errors), errors


def test_the_owner_part_is_skipped_when_asked_and_enforced_by_default():
    document = base()
    del document["server_choice"]
    assert release_errors(document, SOURCES, owner=False) == []
    assert release_errors(document, SOURCES) == [PREFIX + "the package server needs the owner's recorded answer (server_choice)"]
    assert release_errors(document, SOURCES, owner=True) == release_errors(document, SOURCES)


def test_a_gated_served_or_left_out_tool_needs_the_owner_to_have_been_shown_its_id():
    document = base()
    document["server_choice"]["given_on"]["shown"] = ["tool/lookup"]
    assert release_errors(document, SOURCES) == [PREFIX + "the owner's answer does not cover tool stub/post: ask again"]
    document["server_choice"]["given_on"]["shown"] = ["post", "lookup"]          # names are not ids
    assert release_errors(document, SOURCES) == [
        PREFIX + "the owner's answer does not cover tool stub/post: ask again",
        PREFIX + "the owner's answer does not cover tool tool/lookup: ask again"]
    assert release_errors(document, SOURCES, owner=False) == []


def test_the_answer_must_hold_every_source_of_the_gated_tools():
    document = base()
    document["server_choice"]["given_on"]["sources"] = {}
    assert release_errors(document, SOURCES) == [PREFIX + "the owner's answer does not cover source demo"]
    entry(document, "tool/lookup")["source"] = "other"
    document["server_review"]["judged_on"]["other"] = "eeeeeee"
    document["server_choice"]["given_on"]["sources"] = {"demo": "abc1234"}
    assert release_errors(document, TWO_SOURCES) == [PREFIX + "the owner's answer does not cover source other"]


@pytest.mark.parametrize("recorded, ok", [("abc1234", True), ("ABC1234", True), (PINNED, True), ("abc1235", False),
                                           ("abc123", False), ("fffffff", False)])
def test_the_answer_must_have_been_given_on_the_pinned_commit(recorded, ok):
    document = base()
    document["server_choice"]["given_on"]["sources"]["demo"] = recorded
    expected = [] if ok else [PREFIX + f"the owner's answer was given on demo at {recorded}, now pinned at abc12340: ask again"]
    assert release_errors(document, SOURCES) == expected


def test_without_a_gated_served_or_left_out_tool_no_answer_is_needed():
    document = base()
    set_tool("stub/post", effect="none")(document)
    set_tool("tool/lookup", effect="none")(document)
    del document["server_choice"]
    assert release_errors(document, SOURCES) == []
    set_tool("side/ping", effect="writes")(document)             # gated, but it stays registered: not the answer's business
    assert release_errors(document, SOURCES) == []


def test_a_gated_tool_that_stays_registered_does_not_need_to_be_shown():
    document = base()
    set_tool("side/ping", effect="sends")(document)
    assert release_errors(document, SOURCES) == []


def test_an_answer_without_a_package_server_is_not_this_functions_business():
    document = servers_only()
    document["server_choice"] = {"garbage": True}
    assert release_errors(document, SOURCES) == []
    assert release_errors(document, SOURCES, owner=False) == []


def test_a_package_of_commands_only_asks_the_owner_like_any_other():
    document = run_only()
    assert release_errors(document, SOURCES) == []
    document["server_choice"]["given_on"]["shown"] = []
    assert release_errors(document, SOURCES) == [PREFIX + "the owner's answer does not cover tool tool/lookup: ask again"]
    del document["server_choice"]
    assert release_errors(document, SOURCES) == [PREFIX + "the package server needs the owner's recorded answer (server_choice)"]
    assert release_errors(document, SOURCES, owner=False) == []


def test_a_malformed_answer_covers_nothing():
    document = base()
    for answer in (None, [], "x", {}, {"given_on": None}, {"given_on": {"sources": [], "shown": "x"}}):
        document["server_choice"] = answer
        errors = release_errors(document, SOURCES)
        assert any("the owner's answer does not cover source demo" in e for e in errors), (answer, errors)
        assert any("the owner's answer does not cover tool stub/post: ask again" in e for e in errors), (answer, errors)


def test_a_gated_entry_without_an_id_cannot_be_covered():
    document = base()
    del entry(document, "stub/post")["id"]
    errors = release_errors(document, SOURCES)
    assert any("the owner's answer cannot cover a tool without an id" in e for e in errors), errors


# --- The helpers the build and the owner's answer share ------------------------------------------------------------

@pytest.mark.parametrize("pinned, recorded, expected", [
    (PINNED, "abc1234", True), (PINNED, "ABC1234", True), (PINNED.upper(), "abc1234", True), (PINNED, PINNED, True),
    (PINNED, "abc12340", True), ("abc1234", "abc1234", True),
    (PINNED, "abc123", False), (PINNED, "", False), (PINNED, "abc1235", False), (PINNED, "zzzzzzz", False),
    (PINNED, " abc1234", False), (PINNED, "abc1234 ", False), ("abc1234", "abc12340", False),
    ("", "abc1234", False), ("", "", False), (None, "abc1234", False), (PINNED, None, False), (7, 7, False),
    ([], "abc1234", False), (PINNED, ["abc1234"], False)])
def test_a_recorded_commit_matches_when_it_is_a_prefix_of_the_pinned_one(pinned, recorded, expected):
    assert commit_matches(pinned, recorded) is expected


def test_gated_tools_are_the_gated_entries_the_package_server_serves_or_leaves_out():
    document = base()
    assert [item["id"] for item in gated_tools(document)] == ["stub/post", "tool/lookup"]
    set_tool("side/ping", effect="writes")(document)                  # registered: not in G
    assert [item["id"] for item in gated_tools(document)] == ["stub/post", "tool/lookup"]
    set_tool("stub/echo", effect="undetermined")(document)            # undetermined is gated
    assert [item["id"] for item in gated_tools(document)] == ["stub/echo", "stub/post", "tool/lookup"]


def test_an_effect_that_is_missing_or_unknown_is_gated_never_none():
    document = base()
    del entry(document, "stub/echo")["effect"]
    entry(document, "stub/ping")["effect"] = "write"
    assert [item["id"] for item in gated_tools(document)] == ["stub/echo", "stub/ping", "stub/post", "tool/lookup"]


def test_no_gated_tool_without_a_package_server():
    assert gated_tools(servers_only()) == []
    document = base()
    document["package_server"] = None
    assert gated_tools(document) == []


# --- Never raises, always a list of strings ------------------------------------------------------------------------

GARBAGE = [None, True, 0, 1.5, "", " ", "x", [], ["x"], [[1]], [None, 3], {}, {"a": 1}, {"id": ["x"]}]
DOCUMENTS = [None, [], "x", 0, 1.5, True, {}, {"decisions": 3}, {"server_review": None}, {"server_review": []},
             {"server_review": {}}, {"server_review": "x"}, {"server_review": 7}, {"mcp_servers": "x"},
             {"mcp_servers": [None, 3, "x", {}, {"name": 3}, {"name": ["x"]}], "server_review": {}},
             {"package_server": [], "server_review": {"judged_on": 1, "tools": 2, "pairs": 3}},
             {"package_server": {"tools": 3, "children": 4}, "mcp_servers": 5,
              "server_review": {"judged_on": {"demo": 7}, "tools": [None, 3, {}, {"id": ["x"]}], "pairs": [None, {}]}},
             {"mcp_servers": [{"name": "stub"}], "server_review": {
                 "judged_on": {"demo": 7}, "pairs": [{"tools": [{}, {}]}, {"tools": [["x"], ["y"]], "judgment": []}],
                 "tools": [{"id": ["x"], "effect": {}, "overlaps": [[1]], "fate": [], "kind": {}, "source": []},
                           {"id": "a/b", "overlaps": [{}], "served_as": [], "decided_by": []}]}}]


def run_all(document, capabilities=CAPS, source_ids=frozenset({"demo"}), sources=SOURCES):
    results = [server_review_errors(document, capabilities, source_ids), release_errors(document, sources),
               release_errors(document, sources, owner=False)]
    for result in results:
        assert isinstance(result, list), result
        assert all(isinstance(error, str) and error.startswith(PREFIX) for error in result), result
    assert isinstance(gated_tools(document), list) and all(isinstance(item, dict) for item in gated_tools(document))
    assert isinstance(needs_review(document), bool)
    return results


@pytest.mark.parametrize("document", DOCUMENTS)
def test_a_malformed_document_is_reported_and_never_raises(document):
    run_all(document)


def test_a_malformed_review_is_reported_by_the_shape_check():
    for review in ([], "x", 0, {}, {"judged_on": 1, "tools": 2, "pairs": 3}):
        assert errors_for({"mcp_servers": [{"name": "stub"}], "server_review": review}) != []


def walk(value, path=()):
    yield path
    if isinstance(value, dict):
        for key, item in value.items():
            yield from walk(item, (*path, key))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from walk(item, (*path, index))


def replaced(document, path, garbage):
    clone = copy.deepcopy(document)
    parent = clone
    for step in path[:-1]:
        parent = parent[step]
    parent[path[-1]] = garbage
    return clone


def removed(document, path):
    clone = copy.deepcopy(document)
    parent = clone
    for step in path[:-1]:
        parent = parent[step]
    del parent[path[-1]]
    return clone


@pytest.mark.parametrize("make", [base, servers_only, run_only])
def test_no_single_value_replaced_by_garbage_or_removed_makes_a_check_raise(make):
    # Every value, key and item of the whole document (the review, the servers, the package server, the answer)
    # in turn: replaced by each kind of garbage, and removed.
    document = make()
    for path in list(walk(document))[1:]:
        for garbage in GARBAGE:
            try:
                run_all(replaced(document, path, garbage))
            except Exception as error:   # report which value broke it, not only that something did
                pytest.fail(f"{path} replaced by {garbage!r}: {error!r}")
        try:
            run_all(removed(document, path))
        except Exception as error:
            pytest.fail(f"{path} removed: {error!r}")


@pytest.mark.parametrize("capabilities", [None, 5, "x", [None], [object()], [SimpleNamespace()], {}, (),
                                          [SimpleNamespace(id=1, tools="x", body=[])], (Cap("x"),)])
def test_garbage_capabilities_never_raise(capabilities):
    run_all(base(), capabilities=capabilities)


@pytest.mark.parametrize("source_ids", [None, 5, "demo", [], [None, 3], {"demo": 1}, frozenset(), ("demo",)])
def test_garbage_source_ids_never_raise(source_ids):
    run_all(base(), source_ids=source_ids)


@pytest.mark.parametrize("sources", [None, 5, "x", [None], [{}], [{"id": "demo"}], [{"id": 1, "commit": 2}],
                                      [{"id": "demo", "commit": None}], {}, ({"id": "demo", "commit": PINNED},)])
def test_garbage_sources_never_raise(sources):
    run_all(base(), sources=sources)


def test_the_same_document_gives_the_same_messages_in_the_same_order():
    document = base()
    several(set_tool("stub/echo", effect="writes", decided_by="ai"), set_pair(survivor="stub/ping"),
            lambda d: d["server_review"]["judged_on"].clear())(document)
    first = errors_for(document)
    assert len(first) > 3 and first == errors_for(copy.deepcopy(document))
    assert release_errors(document, SOURCES) == release_errors(copy.deepcopy(document), SOURCES)
    assert len(first) == len(set(first))


# --- The module stands alone ---------------------------------------------------------------------------------------

def test_the_module_is_standard_library_only_and_imports_nothing_of_muro():
    # delivery.py will import this module, so it may not import delivery.py (or any module of the factory) back.
    tree = ast.parse(Path(server_review.__file__).read_text(encoding="utf-8"))
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported |= {alias.name.split(".")[0] for alias in node.names}
        elif isinstance(node, ast.ImportFrom):
            assert node.level == 0, "a relative import reaches another module of the factory"
            imported.add((node.module or "").split(".")[0])
    assert imported <= set(sys.stdlib_module_names) and "muro" not in imported, imported


def test_the_module_says_what_its_checks_do_not_prove():
    text = " ".join((server_review.__doc__ or "").split())
    for phrase in ("starts nothing", "not that the roster is complete", "that an effect is right",
                   "every similar pair was found", "blind effect reading", "owner's reading"):
        assert phrase in text, phrase
