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
from review_helpers import ensure_review


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
    ensure_review(project)       # a release with servers needs its server_review; these tests are about what it registers
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


# --- Hosts whose plugin registers a server in code (Pi, OpenCode) -----------------------------------------------

import shutil
from pathlib import Path

from muro.native_policy import write_opencode_adapter, write_pi_adapter

PLUGIN = {"slug": "paper-crane", "command": "crane", "name": "Paper Crane", "version": "1.2.3"}
RAW = r"a$b%c\d ${HOME} `x` 'q'"
LAUNCH = [{"name": "stub", "command": "python", "args": ["<package_root>/scripts/demo/server.py", "two words"],
           "env": {"STUB_HOME": "<package_root>/scripts/demo", "RAW": RAW}}]


def package(tmp_path, policy=False):
    root = tmp_path / "release with spaces è"
    skill = root / "skills" / "crane"
    skill.mkdir(parents=True)
    (skill / "SKILL.md").write_text('---\nname: crane\ndescription: "Use when: creating a document."\n---\n\n# Crane\n',
                                    encoding="utf-8")
    if policy:
        (root / "policy.md").write_text("Keep the complete scope.", encoding="utf-8", newline="")
    return root


def node(tmp_path, root, source):
    executable = shutil.which("node")
    if not executable:
        pytest.skip("Node is needed to execute native Pi/OpenCode package entrypoints")
    script = tmp_path / "host-boundary.mjs"
    script.write_text(source, encoding="utf-8")
    done = subprocess.run([executable, str(script), str(root)], cwd=tmp_path, capture_output=True, text=True,
                          encoding="utf-8")
    assert done.returncode == 0, done.stderr or done.stdout
    return json.loads(done.stdout)


def expected_paths(root):
    home = Path(root) / "skills" / "crane" / "scripts" / "demo"
    return home, home / "server.py"


def test_pi_registers_the_server_with_the_paths_of_its_own_install(tmp_path):
    root = package(tmp_path)
    write_pi_adapter(root, PLUGIN, False, LAUNCH)
    manifest = json.loads((root / "package.json").read_text(encoding="utf-8"))
    assert manifest["pi"]["extensions"] == ["./extensions/mcp.js"]
    calls = node(tmp_path, root, r"""
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root = process.argv[2];
const extension = (await import(pathToFileURL(path.join(root, 'extensions', 'mcp.js')).href)).default;
const calls = [];
extension({on() {}, registerMcpServer: (name, config) => calls.push({name, config})});
console.log(JSON.stringify(calls));
""")
    home, server = expected_paths(root)
    [call] = calls
    assert call["name"] == "stub" and call["config"]["command"] == "python"
    assert [Path(call["config"]["args"][0]), call["config"]["args"][1]] == [server, "two words"]
    assert Path(call["config"]["env"]["STUB_HOME"]) == home and call["config"]["env"]["RAW"] == RAW


def test_pi_keeps_its_policy_extension_beside_the_server(tmp_path):
    root = package(tmp_path, policy=True)
    write_pi_adapter(root, PLUGIN, True, LAUNCH)
    manifest = json.loads((root / "package.json").read_text(encoding="utf-8"))
    assert manifest["pi"]["extensions"] == ["./extensions/policy.js", "./extensions/mcp.js"]


def test_opencode_registers_the_server_through_its_mcp_editor(tmp_path):
    root = package(tmp_path)
    write_opencode_adapter(root, PLUGIN, False, LAUNCH)
    calls = node(tmp_path, root, r"""
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root = process.argv[2];
const plugin = (await import(pathToFileURL(path.join(root, 'index.js')).href)).default;
const calls = [];
await plugin.setup({
  skill: {transform: async (fn) => fn({add() {}})},
  session: {hook: async () => {}},
  mcp: {transform: async (fn) => fn({set: (name, config) => calls.push({name, config})})},
});
console.log(JSON.stringify(calls));
""")
    home, server = expected_paths(root)
    [call] = calls
    assert call["name"] == "stub" and call["config"]["type"] == "local"
    assert call["config"]["command"][0] == "python" and Path(call["config"]["command"][1]) == server
    assert call["config"]["command"][2] == "two words"
    assert Path(call["config"]["environment"]["STUB_HOME"]) == home and call["config"]["environment"]["RAW"] == RAW


def test_without_servers_the_pi_and_opencode_packages_are_what_they_were(tmp_path):
    before, after = package(tmp_path / "a", policy=True), package(tmp_path / "b", policy=True)
    write_pi_adapter(before, PLUGIN, True)
    write_pi_adapter(after, PLUGIN, True, [])
    write_opencode_adapter(before, PLUGIN, True)
    write_opencode_adapter(after, PLUGIN, True, [])
    for name in ("package.json", "index.js", "extensions/policy.js"):
        assert (before / name).read_bytes() == (after / name).read_bytes()
    assert not (after / "extensions" / "mcp.js").exists()
    assert "mcp" not in (after / "index.js").read_text(encoding="utf-8")


def test_a_release_registers_the_declared_server_on_pi_and_opencode(portable_project, tmp_path):
    declare(portable_project)
    release = build(portable_project, tmp_path)
    assert '"stub"' in (release / "adapters/pi/extensions/mcp.js").read_text(encoding="utf-8")
    assert '"stub"' in (release / "adapters/opencode/index.js").read_text(encoding="utf-8")
    for host in ("pi", "opencode"):
        assert "MCP server `stub`" in (release / "adapters" / host / "INSTALL.md").read_text(encoding="utf-8")


# --- Hermes: a portable package beside the native plugin ---------------------------------------------------------
# Read in Hermes v0.23.1 (hermes_cli/plugin_validate.py, agent_plugins.py): a folder with plugin.yaml is
# native and its mcp.json is ignored; only a plugin.json-only Agent Plugins package registers servers.

def test_hermes_gets_a_portable_package_beside_the_native_one(portable_project, tmp_path):
    declare(portable_project)
    release = build(portable_project, tmp_path)
    native, portable = release / "adapters/hermes", release / "adapters/hermes-mcp"
    assert (native / "plugin.yaml").is_file()
    assert not (native / "mcp.json").exists() and not (native / "plugin.json").exists()
    assert not (portable / "plugin.yaml").exists() and not (portable / "skills").exists()
    manifest = json.loads((portable / "plugin.json").read_text(encoding="utf-8"))
    assert manifest == {"$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
                        "name": "muro-mcp", "version": "0.1.0",
                        "description": "Muro: MCP servers of the unified plugin"}
    mcp = json.loads((portable / "mcp.json").read_text(encoding="utf-8"))
    assert set(mcp) == {"$schema", "mcpServers"} and mcp["$schema"] == MCP_SCHEMA
    assert mcp["mcpServers"] == {"stub": {"type": "stdio", "command": "python",
                                          "args": ["${PLUGIN_ROOT}/scripts/demo/SKILL.source.md", "--stdio"],
                                          "env": {"STUB_HOME": "${PLUGIN_ROOT}/scripts/demo"}}}
    assert (portable / "scripts/demo/SKILL.source.md").read_bytes() == (release / "scripts/demo/SKILL.source.md").read_bytes()
    install = (native / "INSTALL.md").read_text(encoding="utf-8")
    assert "MCP server `stub`" in install and "hermes-mcp" in install


def test_a_release_without_servers_has_no_hermes_companion(portable_project, tmp_path):
    assert not (build(portable_project, tmp_path) / "adapters/hermes-mcp").exists()


def test_the_native_hermes_plugin_is_the_same_with_and_without_servers(portable_project, tmp_path):
    policy = doc(decisions=[*doc()["decisions"], decision("always-on", [])], always_on="Keep the complete scope.")
    (portable_project / "delivery.json").write_text(json.dumps(policy), encoding="utf-8")
    before = build_release(portable_project / "sources.json", portable_project, tmp_path / "before") / "adapters/hermes"
    both = declare(portable_project)
    both["decisions"].append(decision("always-on", []))
    both["always_on"] = "Keep the complete scope."
    (portable_project / "delivery.json").write_text(json.dumps(both), encoding="utf-8")
    ensure_review(portable_project)
    after = build_release(portable_project / "sources.json", portable_project, tmp_path / "after") / "adapters/hermes"
    for name in ("plugin.yaml", "__init__.py", "policy.md"):
        assert (before / name).read_bytes() == (after / name).read_bytes()


# --- The judgment stays the AI's: the prompts carry the form, Python carries no source ----------------------------

ROOT = Path(__file__).resolve().parent.parent


def test_the_delivery_prompt_states_the_server_form_and_its_cost():
    text = (ROOT / "prompts" / "delivery.md").read_text(encoding="utf-8")
    assert "- `mcp-server`:" in text and '"mcp_servers"' in text
    section = text.split("## MCP servers", 1)[1].split("\n## ", 1)[0]
    for required in ("every session", "intake_only_paths", "<package_root>", "same tools"):
        assert required in section, required


def test_the_intake_prompt_sends_a_shipped_server_to_the_delivery_protocol():
    text = (ROOT / "prompts" / "intake.md").read_text(encoding="utf-8")
    assert "`mcp-server`" in text and "runtime dependency" in text


def test_the_guide_names_a_server_decision(portable_project, tmp_path):
    declare(portable_project)
    guide = (build(portable_project, tmp_path) / "GUIDE.html").read_text(encoding="utf-8")
    assert "MCP server registered by the plugin" in guide


def test_the_factory_names_no_real_server():
    for path in [*(ROOT / "muro").glob("*.py"), *(ROOT / "prompts").glob("*.md"), Path(__file__)]:
        assert "super" + "cmo" not in path.read_text(encoding="utf-8").lower(), path


# --- Findings of the whole-branch review (2026-11-21) ------------------------------------------------------------

def test_the_program_of_a_server_is_a_command_never_a_packaged_path():
    # Codex and Hermes accept only a bare program name; the packaged file is an argument.
    errors = errors_for(served(run=["<package_root>/scripts/demo/bin/server"]))
    assert any("program" in error and "<package_root>" in error for error in errors), errors


@pytest.mark.parametrize("name", ["PLUGIN_ROOT", "PLUGIN_DATA"])
def test_env_cannot_set_a_name_the_hosts_reserve(name):
    errors = errors_for(served(env={name: "x"}))
    assert any("reserved" in error for error in errors), errors


@pytest.mark.parametrize("run, env, message", [
    (["python", "--config=<package_root>/scripts/demo/absent.json"], {}, "not packaged: scripts/demo/absent.json"),
    (["python", "<package_root>/scripts/demo/../../ROUTER.md"], {}, "outside scripts/demo/"),
    (["python", "<package_root>/ROUTER.md"], {}, "outside scripts/demo/"),
    (["python", "-m", "stub"], {"PYTHONPATH": "<package_root>/scripts/demo;<package_root>/scripts/demo/absent"},
     "not packaged: scripts/demo/absent"),
])
def test_every_packaged_path_a_server_names_is_checked(portable_project, tmp_path, run, env, message):
    (portable_project / "delivery.json").write_text(json.dumps(served(run=run, env=env)), encoding="utf-8")
    with pytest.raises(ValueError, match=message):
        build(portable_project, tmp_path)


@pytest.mark.parametrize("separator", [";", ":"])
def test_a_list_of_packaged_folders_builds(portable_project, tmp_path, separator):
    value = separator.join(["<package_root>/scripts/demo", "<package_root>/scripts/demo"])
    document = served(run=["python", PACKAGED], env={"PYTHONPATH": value})
    (portable_project / "delivery.json").write_text(json.dumps(document), encoding="utf-8")
    entry = json.loads((build(portable_project, tmp_path) / "adapters/claude-code/.mcp.json").read_text(encoding="utf-8"))
    root = "${CLAUDE_PLUGIN_ROOT}/skills/muro/scripts/demo"
    assert entry["mcpServers"]["stub"]["env"]["PYTHONPATH"] == separator.join([root, root])


def test_the_hermes_companion_carries_the_licenses_of_what_it_ships(portable_project, tmp_path):
    declare(portable_project)
    release = build(portable_project, tmp_path)
    portable = release / "adapters/hermes-mcp"
    assert (portable / "LICENSES/demo.txt").read_bytes() == (release / "LICENSES/demo.txt").read_bytes()
    assert (portable / "NOTICE.md").read_bytes() == (release / "NOTICE.md").read_bytes()


def test_a_dollar_sign_in_the_install_path_stays_a_dollar_sign(tmp_path):
    # String.replaceAll reads $$, $& and $' in a replacement string.
    root = package(tmp_path / "price $& a$$b $'")
    write_pi_adapter(root, PLUGIN, False, LAUNCH)
    calls = node(tmp_path, root, r"""
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const extension = (await import(pathToFileURL(path.join(process.argv[2], 'extensions', 'mcp.js')).href)).default;
const calls = [];
extension({on() {}, registerMcpServer: (name, config) => calls.push({name, config})});
console.log(JSON.stringify(calls));
""")
    home, server = expected_paths(root)
    assert Path(calls[0]["config"]["args"][0]) == server and Path(calls[0]["config"]["env"]["STUB_HOME"]) == home
