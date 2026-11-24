"""The shape of a package server's declaration in `delivery.json` (the design of 2026-11-23).

`package_server` declares one MCP server for the whole package, its tools as data; `server_choice` records the
owner's answer to the question that precedes it. Python checks shape and references; it never chooses a tool, a
child or a form. The servers and tools here are stubs; no real source is named.
"""
import copy
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from muro import build_release
from muro.delivery import (FORMS, claude_code_mcp, install_note, package_server_gate_errors, server_section_errors,
                           server_sections, validate_delivery)
from muro.guide import _I18N
from muro.jsonrpc import tool_result
from review_helpers import ensure_review, reviewed, tool_id
from test_package_server import Host


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
CHOICE = {"asked_on": "2026-11-23", "answer": "one server", "given_on": {"sources": {"demo": "abc1234"}, "shown": ["echo", "lookup"]}}


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


def test_a_child_no_tool_forwards_to_is_refused():
    # Claude Code registers only the package server, so a child no tool forwards to would never be started.
    document = packaged(children=("stub", "other"))
    document["mcp_servers"].append({**SERVER, "name": "other"})
    assert errors_for(document) == ["child other has no tool that forwards to it: remove it from children or forward a tool"]
    tool(document, "echo")["forward"]["server"] = "other"
    assert errors_for(document) == ["child stub has no tool that forwards to it: remove it from children or forward a tool"]


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


# --- The gate, the packaged paths and what a host registers (the build) ---------------------------------------

PACKAGED = "<package_root>/scripts/demo/SKILL.source.md"   # the one file the fixture source packages


def declare(project, **over):
    document = served(run=["python", PACKAGED, "--stdio"], env={"STUB_HOME": "<package_root>/scripts/demo"}, **over)
    (project / "delivery.json").write_text(json.dumps(document), encoding="utf-8")
    return document


def build(project, tmp_path):
    ensure_review(project)       # a release with servers needs its server_review; most of these tests are about what it registers
    return build_release(project / "sources.json", project, tmp_path / "out")


GATED = {"echo": "sends", "lookup": "writes"}      # both declared tools write or send: the owner decides them
PINNED = "abc1234" + "0" * 33


def declare_packaged(project, choice=True, effects=None, **over):
    """A package server with a forwarded tool and a command, its review, and the owner's answer for what it gated."""
    options = {"tools": (FORWARD, {**RUN, "run": ["python", PACKAGED, "{q}"]}), **over}
    document = packaged(**options)
    document["mcp_servers"] = [{**SERVER, "run": ["python", PACKAGED, "--stdio"], "env": {}}]
    commit = json.loads((project / "sources.json").read_text(encoding="utf-8"))["sources"][0]["commit"]
    document = reviewed(document, commit, effects)
    document["server_choice"]["given_on"]["sources"] = {"demo": commit[:8]}
    document["server_choice"]["given_on"]["shown"] = [tool_id(t) for t in document["package_server"]["tools"]
                                                      if (effects or {}).get(t["name"], "none") != "none"]
    if not choice:
        del document["server_choice"]
    (project / "delivery.json").write_text(json.dumps(document), encoding="utf-8")
    return document


def test_the_build_refuses_a_package_server_without_the_owners_answer_when_a_tool_writes_or_sends(portable_project, tmp_path):
    declare_packaged(portable_project, choice=False, effects=GATED)
    with pytest.raises(ValueError, match="needs the owner's recorded answer"):
        build(portable_project, tmp_path)


def test_a_package_server_of_tools_that_neither_write_nor_send_needs_no_answer(portable_project, tmp_path):
    # Amendment of 2026-11-24: the owner is asked only about what writes or sends; the AI decides the rest and says why.
    declare_packaged(portable_project, choice=False)
    assert (build(portable_project, tmp_path) / "package-server.json").is_file()


def test_validation_alone_accepts_it(portable_project):
    document = declare_packaged(portable_project, choice=False, effects=GATED)
    assert errors_for(document) == []                       # shape only: the gate is the build's


def test_an_answer_given_on_another_commit_asks_again():
    document = reviewed(packaged(), "f" * 40, GATED)
    sources = [{"id": "demo", "commit": "f" * 40}]
    document["server_choice"]["given_on"]["shown"] = ["stub/echo", "cmd/lookup"]
    assert package_server_gate_errors(document, sources) == [
        "server_review: the owner's answer was given on demo at abc1234, now pinned at ffffffff: ask again"]
    document["server_choice"]["given_on"]["sources"] = {}
    assert package_server_gate_errors(document, sources) == ["server_review: the owner's answer does not cover source demo"]
    assert package_server_gate_errors(doc(), sources) == []     # no server, nothing to review
    assert any("no server_review" in e for e in package_server_gate_errors(served(), sources))


def test_the_gate_reads_the_recorded_commit_whatever_its_case_and_asks_for_the_answer_when_missing():
    document = reviewed(packaged(), "ABC1234", GATED)
    document["server_choice"]["given_on"] = {"sources": {"demo": "ABC1234"}, "shown": ["stub/echo", "cmd/lookup"]}
    sources = [{"id": "demo", "commit": PINNED}]
    assert package_server_gate_errors(document, sources) == []
    del document["server_choice"]
    assert package_server_gate_errors(document, sources) == [
        "server_review: the package server needs the owner's recorded answer (server_choice)"]
    assert package_server_gate_errors(None, []) == []


def test_the_gate_asks_again_for_a_tool_the_answer_did_not_show():
    # A gated tool added at an unchanged commit would otherwise build with no question, for tools that act on accounts.
    document = reviewed(packaged(), "abc1234", GATED)
    document["server_choice"]["given_on"]["shown"] = ["stub/echo"]
    assert package_server_gate_errors(document, [{"id": "demo", "commit": PINNED}]) == [
        "server_review: the owner's answer does not cover tool cmd/lookup: ask again"]


def test_the_build_refuses_a_tool_the_answer_did_not_show(portable_project, tmp_path):
    declare_packaged(portable_project, effects=GATED)
    path = portable_project / "delivery.json"
    document = json.loads(path.read_text(encoding="utf-8"))
    document["server_choice"]["given_on"]["shown"] = ["stub/echo"]
    path.write_text(json.dumps(document), encoding="utf-8")
    with pytest.raises(ValueError, match="the owner's answer does not cover tool cmd/lookup: ask again"):
        build(portable_project, tmp_path)


def test_the_gate_asks_for_each_source_a_gated_tool_uses():
    document = reviewed(packaged(tools=(FORWARD, {**RUN, "source": "other"})), {"demo": "f" * 40, "other": "e" * 40}, GATED)
    document["server_choice"]["given_on"] = {"sources": {}, "shown": ["stub/echo", "cmd/lookup"]}
    sources = [{"id": "demo", "commit": "f" * 40}, {"id": "other", "commit": "e" * 40}]
    assert package_server_gate_errors(document, sources) == [
        "server_review: the owner's answer does not cover source demo",
        "server_review: the owner's answer does not cover source other"]


def test_a_package_server_of_commands_only_is_reviewed_and_gated_like_any_other():
    # No absorbed server and no child: the commands it runs are where a write would be, and today's gate catches them.
    declared = packaged(tools=({**RUN, "run": ["python", PACKAGED, "{q}"]},), children=())
    del declared["mcp_servers"]
    declared["decisions"] = [*doc()["decisions"], decision("package-tool", ["x"])]
    sources = [{"id": "demo", "commit": PINNED}]
    assert any("no server_review" in e for e in package_server_gate_errors(declared, sources))
    document = reviewed(declared, PINNED, {"lookup": "writes"})
    document["server_choice"]["given_on"] = {"sources": {"demo": "abc1234"}, "shown": []}
    assert package_server_gate_errors(document, sources) == ["server_review: the owner's answer does not cover tool cmd/lookup: ask again"]
    document["server_choice"]["given_on"]["shown"] = ["cmd/lookup"]
    assert package_server_gate_errors(document, sources) == []


def test_claude_code_registers_the_package_server_and_the_other_hosts_what_they_did(portable_project, tmp_path):
    declare_packaged(portable_project)
    release = build(portable_project, tmp_path)
    claude = json.loads((release / "adapters/claude-code/.mcp.json").read_text(encoding="utf-8"))
    assert claude == {"mcpServers": {"pack": {"command": "python", "env": {},
        "args": ["${CLAUDE_PLUGIN_ROOT}/skills/muro/muro.py", "tools-server"]}}}
    codex = json.loads((release / "adapters/codex/mcp.json").read_text(encoding="utf-8"))
    assert list(codex["mcpServers"]) == ["stub"]            # not run live: the absorbed server, as today
    sections = json.loads((release / "package-server.json").read_text(encoding="utf-8"))
    assert sections["package_server"]["name"] == "pack" and [s["name"] for s in sections["mcp_servers"]] == ["stub"]
    assert (release / "adapters/claude-code/skills/muro/package-server.json").read_text(encoding="utf-8") ==            (release / "package-server.json").read_text(encoding="utf-8")


def test_a_server_kept_beside_the_package_server_stays_registered(portable_project, tmp_path):
    declare_packaged(portable_project, children=[], tools=({**RUN, "run": ["python", PACKAGED, "{q}"]},))
    release = build(portable_project, tmp_path)
    claude = json.loads((release / "adapters/claude-code/.mcp.json").read_text(encoding="utf-8"))
    assert list(claude["mcpServers"]) == ["stub", "pack"]


def test_a_run_tool_must_name_files_the_release_carries(portable_project, tmp_path):
    declare_packaged(portable_project, tools=(FORWARD, {**RUN, "run": ["python", "<package_root>/scripts/demo/nope.js", "{q}"]}))
    with pytest.raises(ValueError, match="package tool lookup names a file that is not packaged"):
        build(portable_project, tmp_path)


def test_a_run_tool_may_name_only_the_folder_of_its_own_source(portable_project, tmp_path):
    declare_packaged(portable_project, tools=(FORWARD, {**RUN, "run": ["python", "<package_root>/scripts/demo/../x.py", "{q}"],
                                                       "env": {"HOME_DIR": "<package_root>/scripts/other"}}))
    with pytest.raises(ValueError, match="package tool lookup names a path outside scripts/demo/: scripts/demo/../x.py"
                                         ".*package tool lookup names a path outside scripts/demo/: scripts/other"):
        build(portable_project, tmp_path)


def test_a_release_without_a_package_server_writes_no_such_file(portable_project, tmp_path):
    declare(portable_project)
    release = build(portable_project, tmp_path)
    assert not (release / "package-server.json").exists()
    assert not (release / "adapters/claude-code/skills/muro/package-server.json").exists()


# --- The installed plugin end to end, and what INSTALL.md says ------------------------------------------------

SCRIPT = "<package_root>/scripts/demo/tool.py"   # packaged by `scripted_project`: it prints its arguments as JSON
LIVE = "the package server `pack` is registered only on Claude Code for now; this host is added after a live run on it."


@pytest.fixture
def scripted_project(portable_project):
    """The shared fixture project, whose source also packages `tool.py`."""
    path = portable_project / "sources.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    source = manifest["sources"][0]
    repo = Path(source["repo_path"])

    def git(*args):
        return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True).stdout.strip()

    (repo / "tool.py").write_text("import json, sys\nsys.stdout.write(json.dumps(sys.argv[1:]))\n", encoding="utf-8")
    git("add", "tool.py")
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "tool")
    source["commit"] = git("rev-parse", "HEAD")
    source["selected_paths"] = ["SKILL.md", "tool.py"]
    path.write_text(json.dumps(manifest), encoding="utf-8")
    return portable_project


def test_the_emitted_entry_serves_a_run_tool_from_a_root_with_spaces(scripted_project, tmp_path):
    declare_packaged(scripted_project, children=[], tools=({**RUN, "run": ["python", SCRIPT, "{q}"]},))
    release = build(scripted_project, tmp_path)
    root = tmp_path / "plugin root è & 100%"
    shutil.copytree(release / "adapters/claude-code", root)
    entry = json.loads((root / ".mcp.json").read_text(encoding="utf-8"))["mcpServers"]["pack"]
    assert entry["command"] == "python"

    def expand(text):  # as the host does, before it starts the entry
        return text.replace("${CLAUDE_PLUGIN_ROOT}", str(root))

    env = {**os.environ, **{name: expand(value) for name, value in entry["env"].items()}}
    host = Host([sys.executable, *map(expand, entry["args"])], tmp_path, env)   # this interpreter stands for `python`
    try:
        assert host.ask("initialize", {"capabilities": {}})["result"]["serverInfo"]["name"] == "pack"
        assert [tool["name"] for tool in host.ask("tools/list")["result"]["tools"]] == ["lookup"]
        assert host.call("lookup", {"q": "two words"}) == tool_result('["two words"]')
    finally:
        host.close()


def test_the_entry_starts_the_launcher_of_the_commands_skill_folder():
    entry = claude_code_mcp(packaged(), "crane")["mcpServers"]["pack"]
    assert entry["args"] == ["${CLAUDE_PLUGIN_ROOT}/skills/crane/muro.py", "tools-server"]


def test_install_notes_say_where_the_package_server_is_registered(portable_project, tmp_path):
    declare_packaged(portable_project)
    release = build(portable_project, tmp_path)
    claude = (release / "adapters/claude-code/INSTALL.md").read_text(encoding="utf-8")
    assert "MCP server `pack`" in claude and "starts `stub` itself" in claude
    assert ("Tools appear under the server `pack`. Their ids changed with the server's name: a permission rule "
            "saved for the old ids no longer matches.") in claude
    for host in ("codex", "pi", "opencode", "hermes"):
        note = (release / "adapters" / host / "INSTALL.md").read_text(encoding="utf-8")
        assert f"This host registers the absorbed servers as they are: {LIVE}" in note
        assert "MCP server `stub`" in note and "Their ids changed" not in note


INHERITS = "A command one of its tools runs inherits the environment of the server process, credentials included."


def test_the_install_note_says_a_command_inherits_the_session_environment_when_a_tool_runs_one(portable_project, tmp_path):
    declare_packaged(portable_project)
    release = build(portable_project, tmp_path)
    claude = (release / "adapters/claude-code/INSTALL.md").read_text(encoding="utf-8")
    assert f"no longer matches. {INHERITS}" in claude
    for host in ("codex", "pi", "opencode", "hermes"):    # the package server is not registered there
        assert "inherits" not in (release / "adapters" / host / "INSTALL.md").read_text(encoding="utf-8")


def test_the_install_note_says_nothing_of_commands_when_the_tools_only_forward(portable_project, tmp_path):
    document = declare_packaged(portable_project, tools=(FORWARD,))
    document["decisions"] = [item for item in document["decisions"] if item["form"] != "package-tool"]
    (portable_project / "delivery.json").write_text(json.dumps(document), encoding="utf-8")
    claude = (build(portable_project, tmp_path) / "adapters/claude-code/INSTALL.md").read_text(encoding="utf-8")
    assert "The package server `pack` starts `stub` itself" in claude and "inherits" not in claude


def test_the_other_hosts_register_none_of_the_package_server(portable_project, tmp_path):
    declare_packaged(portable_project)
    release = build(portable_project, tmp_path)
    for path in ("adapters/pi/extensions/mcp.js", "adapters/opencode/index.js"):
        text = (release / path).read_text(encoding="utf-8")
        assert '"stub"' in text and '"pack"' not in text
    for path in ("adapters/codex/mcp.json", "adapters/hermes-mcp/mcp.json"):
        assert list(json.loads((release / path).read_text(encoding="utf-8"))["mcpServers"]) == ["stub"]


def test_a_package_server_with_no_absorbed_server_is_still_named_in_the_notes(portable_project, tmp_path):
    document = declare_packaged(portable_project, children=[], tools=({**RUN, "run": ["python", PACKAGED, "{q}"]},))
    document["decisions"] = [item for item in document["decisions"] if item["form"] != "mcp-server"]
    del document["mcp_servers"]
    del document["server_review"]       # it listed the absorbed server that is no longer declared: build() writes a new one
    (portable_project / "delivery.json").write_text(json.dumps(document), encoding="utf-8")
    release = build(portable_project, tmp_path)
    claude = (release / "adapters/claude-code/INSTALL.md").read_text(encoding="utf-8")
    assert "MCP server `pack`" in claude
    assert "The package server `pack` serves the commands this package declares. Tools appear under" in claude
    assert "Their ids changed" not in claude    # no child, so no tool had other ids before
    assert list(json.loads((release / "adapters/claude-code/.mcp.json").read_text(encoding="utf-8"))["mcpServers"]) == ["pack"]
    for host in ("codex", "pi", "opencode", "hermes"):
        note = (release / "adapters" / host / "INSTALL.md").read_text(encoding="utf-8")
        assert f"This host registers no server of this package: {LIVE}" in note and "MCP server" not in note


def test_without_a_package_server_install_notes_are_what_they_were(portable_project, tmp_path):
    declare(portable_project)
    release = build(portable_project, tmp_path)
    for host in ("claude-code", "codex", "pi", "opencode", "hermes"):
        assert "package server" not in (release / "adapters" / host / "INSTALL.md").read_text(encoding="utf-8")


# --- The keys in INSTALL.md (owner, 2026-11-24: the API keys are shown in the guide and in the install notes) ------

def with_keys(project, entries, **over):
    """A delivery document that declares `credentials` and nothing that registers anything by itself."""
    document = doc(credentials=entries, **over)
    (project / "delivery.json").write_text(json.dumps(document), encoding="utf-8")
    return document


def credential(env, service, unlocks, required=True, **more):
    return {"env": env, "service": service, "required": required, "unlocks": unlocks, **more}


KEY_LIST = [credential("LAST_KEY", "Last service", "The last thing.", required=False),
            credential("SECOND_KEY", "Second service", "The second thing.", rank=2),
            credential("FIRST_KEY", "First service", "The first thing.", rank=1, route="Read from the variable."),
            credential("OTHER_KEY", "Other service", "The other thing.", required=False)]
KEYS_LEAD = ("The tools of this package read these environment variables. This file names them and never holds a "
             "value.")
RANKED = " The entries with a rank come first, in that order: get those first."


def keys_section(text):
    assert text.count("\n## Keys\n") == 1, text
    return text.split("\n## Keys\n", 1)[1].split("\n## ", 1)[0]


def test_every_install_note_lists_the_keys_in_order_and_never_a_value(portable_project, tmp_path):
    with_keys(portable_project, KEY_LIST)
    release = build(portable_project, tmp_path)
    for host in ("claude-code", "codex", "pi", "opencode", "hermes"):
        note = (release / "adapters" / host / "INSTALL.md").read_text(encoding="utf-8")
        section = keys_section(note)
        assert section.startswith(f"\n{KEYS_LEAD}{RANKED}\n\n"), host
        assert [line for line in section.splitlines() if line.startswith("- ")] == [
            "- `FIRST_KEY` (First service, required, rank 1): The first thing.",
            "- `SECOND_KEY` (Second service, required, rank 2): The second thing.",
            "- `LAST_KEY` (Last service, optional): The last thing.",
            "- `OTHER_KEY` (Other service, optional): The other thing."], host
        # Before the install command, which stays the last section of the file; and not a word of how a host
        # passes variables to a server, which no run has shown.
        assert "## Install" not in section and (host == "hermes" or note.index("## Keys") < note.index("## Install"))
        assert not any(word in section.lower() for word in ("server", "inherit", "forward", "passes", "host "))


def test_a_package_with_credentials_and_nothing_else_still_gets_its_keys_section(portable_project, tmp_path):
    with_keys(portable_project, [credential("EXAMPLE_API_KEY", "Example", "Looking things up.")])
    release = build(portable_project, tmp_path)
    for host in ("claude-code", "codex", "pi", "opencode", "hermes"):
        note = (release / "adapters" / host / "INSTALL.md").read_text(encoding="utf-8")
        assert keys_section(note).startswith(f"\n{KEYS_LEAD}\n\n- `EXAMPLE_API_KEY` (Example, required): Looking things up.")
        assert "The entries with a rank" not in note        # nothing is ranked: nothing is "first"


def test_the_keys_come_after_the_other_notes_so_no_note_falls_under_their_heading(portable_project, tmp_path):
    document = with_keys(portable_project, KEY_LIST)
    document["decisions"].append(decision("always-on", []))
    document["always_on"] = "A fact for every session."
    (portable_project / "delivery.json").write_text(json.dumps(document), encoding="utf-8")
    note = (build(portable_project, tmp_path) / "adapters/claude-code/INSTALL.md").read_text(encoding="utf-8")
    assert note.index("The declared policy in `policy.md`") < note.index("## Keys") < note.index("## Install")
    assert "\n## " not in note.split("\n## Keys", 1)[0]


def test_without_credentials_the_install_note_is_the_string_it_was():
    base = doc(decisions=[*doc()["decisions"], decision("always-on", [])], always_on="A fact for every session.")
    for host in ("claude-code", "codex", "pi", "opencode", "hermes"):
        before = install_note(base, host, "demo")
        assert before and "Keys" not in before
        assert install_note({**base, "credentials": []}, host, "demo") == before
        assert install_note({**base, "credentials": "oops"}, host, "demo") == before
    assert install_note(doc(), "claude-code", "demo") == "" == install_note(doc(credentials=[]), "claude-code", "demo")
    assert install_note(None, "claude-code", "demo") == ""


def test_every_entry_is_one_line_whatever_its_text_holds():
    messy = credential("EXAMPLE_API_KEY", "Example\nservice\r\n   ", "Looks things up,\n\nin two\tparagraphs.", rank=1)
    assert install_note(doc(credentials=[messy]), "claude-code", "demo") == (
        f"\n\n## Keys\n\n{KEYS_LEAD}{RANKED}\n\n"
        "- `EXAMPLE_API_KEY` (Example service, required, rank 1): Looks things up, in two paragraphs.")


# --- The contract in words: the prompts, the ADR and the documents ---------------------------------------------

PROMPTS = Path(__file__).resolve().parent.parent / "prompts"


def test_the_harmonizer_prompt_asks_the_owner_about_servers():
    text = " ".join((PROMPTS / "harmonizer.md").read_text(encoding="utf-8").split())   # a re-wrapped line keeps its phrase
    for phrase in ("## Servers and tools", "ships an MCP server", "Never proceed on your own choice",
                   "read from the pinned source files", "an estimate", "no server is started", "as two lists",
                   "only when there is no recorded answer or the evidence changed",
                   # The server step of 2026-11-24: a record, a judgment for each pair, the owner only for what writes or sends.
                   "`server_review`", "the code wins", "tools you decided alone", "6000 characters",
                   "a pair that holds a command", "no logical requirement of a capability needs it",
                   # With no owner the owner's keys stay as the file has them, and the review agrees with them.
                   "With no owner to ask, leave `package_server` and `server_choice` exactly as the file has them",
                   "every server tool is `registered` and every command is `command`",
                   "Where it holds one, the owner's answer stands"):
        assert phrase in text, phrase
    assert "under its `name`" not in text      # `shown` holds the ids of the tools that write or send, not declared names


def test_the_delivery_prompt_states_the_declaration():
    text = (PROMPTS / "delivery.md").read_text(encoding="utf-8")
    for phrase in ("## The package server", "keeps the child's name, description and input schema", "argv template",
                   "`package-tool`", "Only a server that declares tools alone may be a child",
                   "the source's rule as a declared default", "`server_choice`", "allow_leading_dash",
                   "Never a key, a token or another secret", "key for key",
                   "as the child's own `tools/list` gives it", "not checked against a running server",
                   "get one `dropped` decision that lists them, with the owner's answer as its reason"):
        assert phrase in text, phrase
    output = text.split("\n## Output", 1)[1]
    assert "`package_server`" in output and "`server_choice`" in output and "package-tool" in output
    assert "`server_review`" in output


def test_the_delivery_prompt_states_the_server_review_and_the_rule_for_an_effect_once():
    text = " ".join((PROMPTS / "delivery.md").read_text(encoding="utf-8").split())
    for phrase in ("## The server review", "## Effects of a tool", "`undetermined`", "A file the tool can replace is a change",
                   "spends (credits, money: `writes`)", "the highest value", "case you would call marginal is a doubt",
                   "`none` is the only value that skips the owner", "at most 600 characters",
                   "Python checks shape, closure and these references"):
        assert phrase in text, phrase
    assert text.count("## Effects of a tool") == 1           # one copy of the rule: the evals read this section
    package_server = text.split("## The package server", 1)[1].split("\n## ", 1)[0]
    assert "id` of every such tool" in package_server and "A package server whose tools all have effect `none`" in package_server


def test_the_intake_prompt_records_command_line_programs_as_evidence():
    text = (PROMPTS / "intake.md").read_text(encoding="utf-8")
    for phrase in ("command-line programs as evidence for harmonization", "read or write",
                   "which credentials it takes from the environment", "without choosing a form",
                   "For each tool of a shipped server, record the same evidence", "read from the code"):
        assert phrase in text, phrase


def test_the_review_prompt_reexamines_the_server_judgments_and_names_every_form():
    text = " ".join((PROMPTS / "review.md").read_text(encoding="utf-8").split())
    assert "Server judgments" in text and "anchored on the record" in text
    assert "(capability, always-on, hook, mcp-server, package-tool, dropped)" in text


def test_the_contract_is_recorded():
    root = PROMPTS.parent
    adr = (root / "docs/adr/ADR-0033-package-mcp-server.md").read_text(encoding="utf-8")
    assert "adr_id: ADR-0033" in adr and "muro deve chiedere cosa fare di eventuali server mcp" in adr
    assert "(ADR-0033)" in (root / "AGENTS.md").read_text(encoding="utf-8")
    assert "tools-server" in (root / "docs/cli.md").read_text(encoding="utf-8")


def test_the_documents_name_the_form_and_record_what_was_not_run():
    root = PROMPTS.parent
    assert "mcp-server, package-tool, dropped}" in (root / "docs/cli.md").read_text(encoding="utf-8")
    agents = " ".join((root / "AGENTS.md").read_text(encoding="utf-8").split())
    assert "`mcp-server`, `package-tool` or `dropped`" in agents
    assert "does not cover a source" in agents    # the gate's refusal for a source the answer never named
    adr = (root / "docs/adr/ADR-0033-package-mcp-server.md").read_text(encoding="utf-8")
    assert "## Amendment: implementation (2026-11-23)" in adr
    not_run = adr.split("## Not run", 1)[1]
    for phrase in ("Claude Code included", "POSIX", "Supads has not been harmonized again", "Delivery 2", "shutil.which",
                   "environment variables that reach the server"):
        assert phrase in not_run, phrase


def test_the_amendment_of_2026_11_24_records_what_it_replaces_and_what_was_not_run():
    root = PROMPTS.parent
    adr = " ".join((root / "docs/adr/ADR-0033-package-mcp-server.md").read_text(encoding="utf-8").split())
    assert "## Amendment: server harmonization (2026-11-24)" in adr
    amendment = adr.split("## Amendment: server harmonization (2026-11-24)", 1)[1]
    for phrase in ("`server_review`", "ruling 4", "only about the tools that write or send", "fails closed", "decided alone",
                   "gate for a package server of commands only", "Not run (this amendment)", "One run, one model",
                   "the code wins over a description"):
        assert phrase in amendment, phrase
    agents = " ".join((root / "AGENTS.md").read_text(encoding="utf-8").split())
    assert "`server_review`" in agents and "write or send" in agents
    assert "does not cover a source" in agents       # still the gate's refusal for a source the answer never named


def test_the_adr_says_what_ci_does_not_run_what_a_release_carries_and_the_condition_before_a_first_release():
    adr = (PROMPTS.parent / "docs/adr/ADR-0033-package-mcp-server.md").read_text(encoding="utf-8")
    amendment, not_run = adr.split("## Amendment: implementation (2026-11-23)", 1)[1].split("## Not run", 1)
    amendment, not_run = " ".join(amendment.split()), " ".join(not_run.split())
    # CI: the risk row names a Windows test in CI, and the Python tests run on ubuntu-latest only.
    for text in (amendment, not_run):
        assert "ubuntu-latest" in text and "taskkill" in text
    assert "Windows job is the owner's decision" in not_run
    # What a release carries: byte-equal holds for the registration files, not for the release.
    assert "byte-equal holds for the registration files" in amendment
    assert "form_package-tool" in amendment and "jsonrpc.py" in amendment
    # The condition before a first release.
    assert "no package that declares `package_server` is released before the live Claude Code run" in not_run
    assert "allow_leading_dash" in not_run and "console windows" in not_run
