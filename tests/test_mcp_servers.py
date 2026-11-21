"""A source's MCP server is absorbed and registered by the release (ADR-0030).

Owner, 2026-11-21: "Secondo me Muro dovrebbe inglobare anche server mcp". The server's
files travel with their source at the pinned commit; `delivery.json` declares the server
once, host-neutral, and each adapter writes the form its host reads. Python checks shape
and references and emits what is declared: it never chooses a form, a name or a host.
The servers here are stubs; no real source is named.
"""
import pytest

from muro.delivery import validate_delivery


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
