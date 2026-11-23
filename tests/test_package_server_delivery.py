"""The shape of a package server's declaration in `delivery.json` (the design of 2026-11-23).

`package_server` declares one MCP server for the whole package, its tools as data; `server_choice` records the
owner's answer to the question that precedes it. Python checks shape and references; it never chooses a tool, a
child or a form. The servers and tools here are stubs; no real source is named.
"""
import copy

import pytest

from muro.delivery import FORMS, server_section_errors, server_sections, validate_delivery
from muro.guide import _I18N


class Cap:
    def __init__(self, identifier, hooks=()):
        self.id = identifier
        self.hooks = list(hooks)


def doc(**over):
    base = {"decisions": [{"source": "demo", "content": "The whole skill.", "form": "capability",
                           "targets": ["x"], "reason": "One task-specific procedure."}]}
    base.update(over)
    return base


def decision(form, targets, source="demo"):
    return {"source": source, "content": "Part of the source.", "form": form, "targets": targets, "reason": "Because."}


def errors_for(document, capabilities=None, sources=("demo",)):
    return validate_delivery(document, capabilities or [Cap("x")], set(sources))


SERVER = {"name": "stub", "source": "demo", "run": ["python", "-m", "stub_server"],
          "env": {"PYTHONPATH": "<package_root>/scripts/demo/lib"}}


def served(**over):
    return doc(decisions=[*doc()["decisions"], decision("mcp-server", ["x"])],
               mcp_servers=[{**SERVER, **over}])


TOOL_SCHEMA = {"type": "object", "properties": {"q": {"type": "string"}}, "required": ["q"]}
FORWARD = {"name": "echo", "source": "demo", "description": "Echo, in the child's words.",
           "input_schema": {"type": "object", "properties": {}}, "forward": {"server": "stub", "tool": "echo"}}
RUN = {"name": "lookup", "source": "demo", "description": "Look up q.", "input_schema": TOOL_SCHEMA,
       "run": ["node", "<package_root>/scripts/demo/tool.js", "{q}"]}
CHOICE = {"asked_on": "2026-11-23", "answer": "one server", "given_on": {"sources": {"demo": "abc1234"}, "shown": ["echo"]}}


def packaged(tools=(FORWARD, RUN), children=("stub",), **over):
    base = served()
    base["decisions"].append(decision("package-tool", ["x"]))
    base["package_server"] = {"name": "pack", "children": list(children), "tools": [copy.deepcopy(t) for t in tools]}
    base["server_choice"] = copy.deepcopy(CHOICE)
    base.update(over)
    return base


def tool(document, name):
    return next(t for t in document["package_server"]["tools"] if t["name"] == name)


def test_a_declared_package_server_is_valid():
    assert errors_for(packaged()) == []


def test_package_tool_is_a_form_that_needs_a_target():
    assert "package-tool" in FORMS
    assert any("needs at least one target" in e
               for e in errors_for(packaged(decisions=[*served()["decisions"], decision("package-tool", [])])))


def test_the_guide_has_a_label_for_every_form():
    # guide.py reads a label for each decision's form: a form without one fails the build of its package.
    assert all(f"form_{form}" in labels for form in FORMS for labels in _I18N.values())


def _two_echoes(document):
    document["package_server"]["tools"] = [tool(document, "echo"), copy.deepcopy(tool(document, "echo"))]


def _both(document):
    tool(document, "echo")["run"] = ["node", "x.js"]


def _renamed(document):
    tool(document, "echo")["name"] = "echo2"


def _without_schema(document):
    del tool(document, "lookup")["input_schema"]


def _set(name, key, value):
    def mutate(document):
        tool(document, name)[key] = value
    return mutate


def _program(document):
    tool(document, "lookup")["run"][0] = "<package_root>/x"


def _choice(key, value):
    def mutate(document):
        document["server_choice"][key] = value
    return mutate


def _choice_sources(document):
    document["server_choice"]["given_on"]["sources"] = {"ghost": "abc1234"}


def _no_decision(document):
    document["decisions"] = served()["decisions"]


def _no_run_tool(document):
    document["package_server"]["tools"] = [tool(document, "echo")]


def _own_name(document):
    document["package_server"].update(name="stub", children=[])


@pytest.mark.parametrize("mutate, message", [
    (lambda d: d["package_server"].update(children=["ghost"]), "children names a server that is not declared: ghost"),
    (_own_name, "shares its name with a registered server"),
    (_two_echoes, "tool echo is declared twice"),
    (_set("lookup", "name", "Bad-Name"), "tool name must match"),
    (_set("echo", "name", "bad name"), "tool name must match"),
    (_both, "exactly one of forward and run"),
    (lambda d: tool(d, "echo")["forward"].update(server="other"), "forwards to a server that is not a child"),
    (_renamed, "keeps the child's tool name"),
    (_without_schema, "input_schema"),
    (_set("lookup", "run", ["node", "{nope}"]), "is not a property of the schema"),
    (_set("lookup", "run", ["node", 'a"b', "{q}"]), "must not contain a double quote"),
    (_program, "the program"),
    (_set("echo", "timeout", 5), "timeout applies to a run tool"),
    (_set("echo", "annotations", {"readOnlyHint": "yes"}), "annotations values are true or false"),
    (_no_decision, "has no package-tool decision"),
    (_no_run_tool, "has a package-tool decision but no tool runs its commands"),
    (_choice("asked_on", "yesterday"), "asked_on"),
    (_choice("answer", ""), "answer"),
    (_choice_sources, "names unknown source ghost"),
    (lambda d: d.update(extra=1), "delivery.json must be an object"),
])
def test_the_declaration_is_checked(mutate, message):
    document = packaged()
    mutate(document)
    errors = errors_for(document)
    assert any(message in error for error in errors), errors


def test_a_document_without_the_declaration_is_checked_as_before():
    assert errors_for(served()) == []          # no package_server, no server_choice: valid, as today


def test_sections_carry_only_what_the_server_reads():
    sections = server_sections(packaged())
    assert set(sections) == {"package_server", "mcp_servers"} and server_section_errors(sections) == []
    assert server_sections(doc()) == {"package_server": None, "mcp_servers": []}


# --- Beyond the table: the rules that hold the server's own checks --------------------------------------------

def test_the_server_sections_alone_carry_every_check_that_needs_no_capability():
    # The server reads only these two sections at start (no capabilities, no manifest), so they hold these checks.
    sections = server_sections(packaged(children=["ghost"]))
    assert any("not declared: ghost" in e for e in server_section_errors(sections))
    assert server_section_errors({"package_server": None, "mcp_servers": []}) == []
    assert server_section_errors([]) != []


@pytest.mark.parametrize("key, value", [
    ("timeout", 0), ("timeout", True), ("timeout", 1.5), ("timeout", "30"),
    ("env", {"my path": "x"}), ("env", {"PLUGIN_ROOT": "x"}), ("env", ["A"]),
    ("annotations", ["readOnlyHint"]),
])
def test_a_run_tools_optional_keys_are_checked(key, value):
    document = packaged()
    tool(document, "lookup")[key] = value
    assert errors_for(document) != []


def test_a_run_tool_may_carry_timeout_env_and_annotations():
    document = packaged()
    tool(document, "lookup").update(timeout=30, env={"HOME_DIR": "<package_root>/scripts/demo"},
                                    annotations={"readOnlyHint": True, "openWorldHint": False})
    assert errors_for(document) == []


def test_a_forwarded_tool_may_be_renamed_when_two_tools_would_share_a_name():
    # A run tool already named `echo`: the child's `echo` cannot keep its name, and any unique one is accepted.
    document = packaged()
    tool(document, "lookup")["name"] = "echo"
    tool(document, "echo")["name"] = "echo2"
    assert errors_for(document) == []


def test_a_forwarded_tool_keeps_the_childs_name_whatever_its_spelling():
    document = packaged()
    tool(document, "echo").update(name="getThing-2", forward={"server": "stub", "tool": "getThing-2"})
    assert errors_for(document) == []


def test_a_run_tool_keeps_the_strict_name():
    document = packaged()
    tool(document, "lookup")["name"] = "getThing"
    assert any("tool name must match [a-z][a-z0-9_]{0,39}: getThing" in e for e in errors_for(document))


def test_a_forwarded_tool_takes_the_source_of_its_child():
    document = packaged()
    document["mcp_servers"][0]["source"] = "other"
    assert any("source of its child" in e for e in errors_for(document, sources=("demo", "other")))


def test_a_tool_may_not_name_an_unknown_source():
    document = packaged()
    tool(document, "lookup")["source"] = "ghost"
    assert any("names unknown source ghost" in e for e in errors_for(document))


def test_a_program_that_is_a_placeholder_is_refused():
    document = packaged()
    tool(document, "lookup")["run"] = ["{q}", "x"]
    assert any("the program (first item) is a literal" in e for e in errors_for(document))


def test_a_package_server_may_have_children_and_no_run_tool_or_the_reverse():
    assert errors_for(packaged(tools=(RUN,), children=())) == []
    document = packaged(tools=(FORWARD,))
    document["decisions"] = served()["decisions"]
    assert errors_for(document) == []


@pytest.mark.parametrize("declaration, message", [
    ([], "requires exactly name, children and tools"),
    ({"name": "pack", "children": [], "tools": [RUN], "extra": 1}, "requires exactly name, children and tools"),
    ({"name": "pack", "tools": [RUN]}, "requires exactly name, children and tools"),
    ({"name": "Pack", "children": [], "tools": [RUN]}, "package_server name must be"),
    ({"name": "pack", "children": "stub", "tools": [RUN]}, "children must be a list"),
    ({"name": "pack", "children": ["stub", "stub"], "tools": [RUN]}, "children names stub twice"),
    ({"name": "pack", "children": [], "tools": []}, "tools must be a nonempty list"),
    ({"name": "pack", "children": [], "tools": {}}, "tools must be a nonempty list"),
    ({"name": "pack", "children": [], "tools": ["lookup"]}, "each package tool requires"),
])
def test_a_malformed_declaration_is_reported_and_never_raises(declaration, message):
    errors = errors_for(packaged(package_server=declaration))
    assert any(message in error for error in errors), errors


@pytest.mark.parametrize("choice", [
    [], {"asked_on": "2026-11-23", "answer": "x"},
    {**CHOICE, "given_on": {"sources": {"demo": "abc1234"}}},
    {**CHOICE, "given_on": {"sources": [], "shown": []}},
    {**CHOICE, "given_on": {"sources": {"demo": "abc123"}, "shown": []}},
    {**CHOICE, "given_on": {"sources": {"demo": "not-hex-zz"}, "shown": []}},
    {**CHOICE, "given_on": {"sources": {"demo": "abc1234"}, "shown": [""]}},
    {**CHOICE, "given_on": {"sources": {"demo": "abc1234"}, "shown": "echo"}},
    {**CHOICE, "asked_on": 20261123},
])
def test_a_malformed_server_choice_is_reported(choice):
    assert errors_for(packaged(server_choice=choice)) != []


def test_a_server_choice_is_valid_without_a_package_server():
    # The owner may answer "each server as it is": the answer is recorded, nothing else is declared.
    document = served()
    document["server_choice"] = copy.deepcopy(CHOICE)
    assert errors_for(document) == []


def test_a_full_length_commit_is_accepted():
    document = packaged()
    document["server_choice"]["given_on"]["sources"]["demo"] = "3bf78a42c5d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7"
    assert errors_for(document) == []
