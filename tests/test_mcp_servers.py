"""A source's MCP server is absorbed and registered by the release (ADR-0030).

Owner, 2026-11-21: "Secondo me Muro dovrebbe inglobare anche server mcp". The server's
files travel with their source at the pinned commit; `delivery.json` declares the server
once, host-neutral, and each adapter writes the form its host reads. Python checks shape
and references and emits what is declared: it never chooses a form, a name or a host.
The servers here are stubs; no real source is named.
"""
import json
import os
import subprocess

import pytest

from muro import build_release
from muro.delivery import MCP_SCHEMA, claude_code_mcp, server_launch, validate_delivery


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


def test_a_declared_server_is_valid():
    assert errors_for(served()) == []


def test_env_is_optional():
    document = served()
    del document["mcp_servers"][0]["env"]
    assert errors_for(document) == []


@pytest.mark.parametrize("document, message", [
    (doc(mcp_servers=[SERVER]), "has no mcp-server decision"),
    (doc(decisions=[*doc()["decisions"], decision("mcp-server", ["x"])]),
     "has an mcp-server decision but declares no server"),
    (doc(decisions=[*doc()["decisions"], decision("mcp-server", [])], mcp_servers=[SERVER]),
     "needs at least one target"),
    (doc(decisions=[*doc()["decisions"], decision("mcp-server", ["x"])], mcp_servers={"stub": SERVER}),
     "mcp_servers must be an array"),
    (served(name="Stub Server"), "name must be"),
    (served(source="other"), "unknown source other"),
    (served(run=[]), "run must be a nonempty list"),
    (served(run=["python m", "x"]), "one bare word"),
    (served(run=["python", 'say "hi"']), "double quote"),
    (served(env={"my path": "x"}), "env names must be"),
    (served(env={"PYTHONPATH": 3}), "env values must be text"),
    (served(env=["PYTHONPATH"]), "env must be an object"),
    (served(host="codex"), "requires exactly name, source and run"),
])
def test_server_declarations_are_checked(document, message):
    errors = errors_for(document)
    assert any(message in error for error in errors), errors


def test_two_servers_cannot_share_a_name():
    document = served()
    document["mcp_servers"].append(dict(SERVER))
    assert any("declared twice" in error for error in errors_for(document))


def test_a_source_may_declare_a_server_beside_its_other_forms():
    # One source, three forms: a capability, a server its steps call, a dropped part. Each keeps its own check.
    document = served()
    document["decisions"].append(decision("dropped", []))
    assert errors_for(document) == []


def test_hook_wirings_keep_the_run_check_they_share_with_servers():
    active = {"event": "UserPromptSubmit", "action": "Print a marker.", "tools": ["shell"], "policy": "active"}
    wiring = {"host": "claude-code", "capability": "x", "event": "UserPromptSubmit", "matcher": "",
              "run": ["my python", "x.py"]}
    errors = errors_for(doc(decisions=[decision("hook", ["x"])], hooks=[wiring]), [Cap("x", [active])])
    assert any("hook wiring for x" in error and "one bare word" in error for error in errors), errors


# --- What a release writes for the hosts that read a file (Claude Code, Codex) ---------------------------------

PACKAGED = "<package_root>/scripts/demo/SKILL.source.md"   # the one file the fixture source packages


def declare(project, **over):
    document = served(run=["python", PACKAGED, "--stdio"], env={"STUB_HOME": "<package_root>/scripts/demo"}, **over)
    (project / "delivery.json").write_text(json.dumps(document), encoding="utf-8")
    return document


def build(project, tmp_path):
    return build_release(project / "sources.json", project, tmp_path / "out")


def test_claude_code_and_codex_register_the_declared_server(portable_project, tmp_path):
    declare(portable_project)
    release = build(portable_project, tmp_path)
    assert (release / "scripts/demo/SKILL.source.md").is_file()
    claude = json.loads((release / "adapters/claude-code/.mcp.json").read_text(encoding="utf-8"))
    assert claude == {"mcpServers": {"stub": {
        "command": "python",
        "args": ["${CLAUDE_PLUGIN_ROOT}/skills/muro/scripts/demo/SKILL.source.md", "--stdio"],
        "env": {"STUB_HOME": "${CLAUDE_PLUGIN_ROOT}/skills/muro/scripts/demo"}}}}
    codex = json.loads((release / "adapters/codex/mcp.json").read_text(encoding="utf-8"))
    assert codex == {"$schema": MCP_SCHEMA, "mcpServers": {"stub": {
        "type": "stdio", "command": "python",
        "args": ["${PLUGIN_ROOT}/skills/muro/scripts/demo/SKILL.source.md", "--stdio"],
        "env": {"STUB_HOME": "${PLUGIN_ROOT}/skills/muro/scripts/demo"}}}}
    for host in ("claude-code", "codex"):
        install = (release / "adapters" / host / "INSTALL.md").read_text(encoding="utf-8")
        assert "MCP server `stub`" in install and "same tools" in install


def test_a_release_without_the_declaration_registers_no_server(portable_project, tmp_path):
    release = build(portable_project, tmp_path)
    assert not list(release.rglob(".mcp.json")) and not list(release.rglob("mcp.json"))
    assert "MCP server" not in (release / "adapters/claude-code/INSTALL.md").read_text(encoding="utf-8")


def test_a_declared_path_missing_from_the_release_stops_the_build(portable_project, tmp_path):
    document = served(run=["python", "<package_root>/scripts/demo/absent.py"])
    (portable_project / "delivery.json").write_text(json.dumps(document), encoding="utf-8")
    with pytest.raises(ValueError, match="mcp server stub names a file that is not packaged: scripts/demo/absent.py"):
        build(portable_project, tmp_path)
    assert not (tmp_path / "out" / "muro").exists()


def test_a_missing_env_path_stops_the_build_too(portable_project, tmp_path):
    document = served(run=["python", "-m", "stub"], env={"PYTHONPATH": "<package_root>/scripts/demo/lib"})
    (portable_project / "delivery.json").write_text(json.dumps(document), encoding="utf-8")
    with pytest.raises(ValueError, match="not packaged: scripts/demo/lib"):
        build(portable_project, tmp_path)


STUB = (
    "import json, os, sys\n"
    "request = json.loads(sys.stdin.readline())\n"
    "print(json.dumps({'jsonrpc': '2.0', 'id': request['id'], 'result': {\n"
    "    'args': sys.argv[1:], 'home': os.environ.get('STUB_HOME'), 'raw': os.environ.get('RAW')}}), flush=True)\n"
)


def test_the_emitted_entry_starts_the_server_where_the_plugin_is_installed(tmp_path):
    # The host expands its root variable and starts the program with no shell: spaces, accents and
    # characters a shell would read stay data.
    root = tmp_path / "plugin root è & 100%"
    package = root / "skills" / "crane"
    (package / "scripts" / "demo").mkdir(parents=True)
    (package / "scripts" / "demo" / "server.py").write_text(STUB, encoding="utf-8")
    raw = r"a$b%c\d ${HOME} `x`"
    document = served(run=["python", "<package_root>/scripts/demo/server.py", "--flag", "two words"],
                      env={"STUB_HOME": "<package_root>/scripts/demo", "RAW": raw})
    [entry] = claude_code_mcp(document, "crane")["mcpServers"].values()
    assert entry == server_launch(document["mcp_servers"][0], "${CLAUDE_PLUGIN_ROOT}/skills/crane")
    expand = lambda value: value.replace("${CLAUDE_PLUGIN_ROOT}", str(root))   # what the host does
    done = subprocess.run([entry["command"], *map(expand, entry["args"])], cwd=tmp_path, text=True, encoding="utf-8",
                          input='{"jsonrpc":"2.0","id":7,"method":"initialize"}\n', capture_output=True,
                          env={**os.environ, **{key: expand(value) for key, value in entry["env"].items()}})
    assert done.returncode == 0, done.stderr
    reply = json.loads(done.stdout)
    assert reply["id"] == 7
    assert reply["result"] == {"args": ["--flag", "two words"], "home": str(root) + "/skills/crane/scripts/demo",
                               "raw": raw}


def test_a_server_and_a_hook_of_one_source_are_both_registered(portable_project, tmp_path):
    active = {"event": "UserPromptSubmit", "action": "Print a marker.", "tools": ["shell"], "policy": "active"}
    cap = portable_project / "capabilities" / "x.md"
    text = cap.read_text(encoding="utf-8")
    shell = [{"name": "shell", "purpose": "Run the packaged marker script.", "required": True}]
    cap.write_text(text.replace("tools: []", "tools: " + json.dumps(shell))
                   .replace("hooks: []", "hooks: " + json.dumps([active])), encoding="utf-8")
    document = declare(portable_project)
    document["decisions"].append(decision("hook", ["x"]))
    document["hooks"] = [{"host": "claude-code", "capability": "x", "event": "UserPromptSubmit", "matcher": "",
                          "run": ["python", "-c", "print(1)"]}]
    (portable_project / "delivery.json").write_text(json.dumps(document), encoding="utf-8")
    root = build(portable_project, tmp_path) / "adapters" / "claude-code"
    assert "UserPromptSubmit" in json.loads((root / "hooks/hooks.json").read_text(encoding="utf-8"))["hooks"]
    assert list(json.loads((root / ".mcp.json").read_text(encoding="utf-8"))["mcpServers"]) == ["stub"]
