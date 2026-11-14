"""Tests for init (scaffold), the MCP stdio server, the OpenAI-compatible agent
runner and the installer's non-host-command paths."""
import json
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

from muro.agent import _parse_files, _post_chat, _write_files, read_api_key, run_step
from muro.installer import _marketplace_names, install_adapter
from muro.scaffold import scaffold_package
from test_cli import git, make_repo, review_package
from test_regressions import MIT

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "examples" / "marionette"  # the example plugin the factory builds


def licensed_repo(tmp_path, tags=("v1.0.0",)):
    root = tmp_path / "upstream"
    root.mkdir()
    git(root, "init", "-q")
    (root / "LICENSE").write_text(MIT, encoding="utf-8")
    (root / "SKILL.md").write_text("# skill", encoding="utf-8")
    git(root, "add", ".")
    git(root, "commit", "-q", "-m", "one")
    for tag in tags:
        git(root, "tag", tag)
    return root


# --- init / scaffold ----------------------------------------------------------

def test_scaffold_pins_newest_release_and_passes_the_gate(tmp_path):
    upstream = licensed_repo(tmp_path, tags=["v1.0.0", "v1.2.0", "v2.0.0-rc1"])
    package = tmp_path / "package"
    manifest_path = scaffold_package(package, str(upstream), slug="my-skill", license_name="MIT",
                                     goal="absorb the skill", selected=["SKILL.md"],
                                     release=None, head=False)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    source = manifest["sources"][0]
    assert source["pin"] == "release" and source["release"] == "v1.2.0"  # rc skipped
    assert len(source["commit"]) == 40
    assert manifest["plugin"]["slug"] == "my-skill"
    assert source["intake"]["goal"] == "absorb the skill"


def test_scaffold_requires_curation_and_refuses_overwrite(tmp_path):
    upstream = licensed_repo(tmp_path)
    package = tmp_path / "package"
    with pytest.raises(ValueError, match="select"):
        scaffold_package(package, str(upstream), slug=None, license_name="MIT",
                         goal="g", selected=[], release=None, head=False)
    scaffold_package(package, str(upstream), slug=None, license_name="MIT",
                     goal="g", selected=["SKILL.md"], release=None, head=False)
    with pytest.raises(ValueError, match="already exists"):
        scaffold_package(package, str(upstream), slug=None, license_name="MIT",
                         goal="g", selected=["SKILL.md"], release=None, head=False)


def test_scaffold_head_pin_when_asked(tmp_path):
    upstream = licensed_repo(tmp_path, tags=())
    package = tmp_path / "package"
    manifest_path = scaffold_package(package, str(upstream), slug=None, license_name="MIT",
                                     goal="g", selected=["SKILL.md"], release=None, head=True)
    source = json.loads(manifest_path.read_text(encoding="utf-8"))["sources"][0]
    assert source["pin"] == "head" and len(source["commit"]) == 40


# --- MCP stdio server ---------------------------------------------------------

def mcp_exchange(requests):
    stdin = "".join(json.dumps(r) + "\n" for r in requests)
    result = subprocess.run([sys.executable, "-m", "muro", "mcp"], input=stdin,
                            capture_output=True, text=True, cwd=ROOT, timeout=120)
    assert result.returncode == 0, result.stderr
    return [json.loads(line) for line in result.stdout.splitlines() if line.strip()]


def test_mcp_initialize_list_and_call():
    replies = mcp_exchange([
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05"}},
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        {"jsonrpc": "2.0", "id": 3, "method": "tools/call",
         "params": {"name": "validate", "arguments": {"manifest": "examples/marionette/sources.json"}}},
        {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "no-such-tool", "arguments": {}}},
        {"jsonrpc": "2.0", "id": 5, "method": "nonsense/method"},
    ])
    by_id = {r.get("id"): r for r in replies}
    assert by_id[1]["result"]["serverInfo"]["name"] == "muro"
    names = {t["name"] for t in by_id[2]["result"]["tools"]}
    assert {"validate", "prepare_intake", "init_package", "install_adapter", "baseline"} <= names
    assert by_id[3]["result"]["isError"] is False
    assert "OK" in by_id[3]["result"]["content"][0]["text"]
    assert by_id[4]["result"]["isError"] is True
    assert by_id[5]["error"]["code"] == -32601


# --- agent runner -------------------------------------------------------------

class FakeEndpoint:
    """An OpenAI-compatible /chat/completions endpoint with scripted answers."""

    def __init__(self, answers):
        self.answers = list(answers)
        self.calls = 0
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                length = int(self.headers.get("Content-Length", 0))
                self.rfile.read(length)
                outer.calls += 1
                answer = outer.answers[min(outer.calls, len(outer.answers)) - 1]
                body = json.dumps({"choices": [{"message": {"content": answer}}]}).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}/v1"

    def close(self):
        self.server.shutdown()
        self.server.server_close()


def test_agent_review_writes_the_finding_file(tmp_path):
    root = review_package(tmp_path)
    endpoint = FakeEndpoint([json.dumps({"files": {"REVIEW.md": "## holds\n- all"}, "notes": "done"})])
    try:
        code = run_step("review", None, {}, root, endpoint.base, "test-model", "k", 2,
                        validate=lambda: (0, "unused"))
    finally:
        endpoint.close()
    assert code == 0 and endpoint.calls == 1
    assert (root / ".muro" / "factory" / "review" / "REVIEW.md").read_text(encoding="utf-8").startswith("## holds")


def test_agent_rejected_paths_get_a_repair_round(tmp_path):
    root = review_package(tmp_path)
    endpoint = FakeEndpoint([
        json.dumps({"files": {"notes.txt": "wrong place"}}),
        json.dumps({"files": {"REVIEW.md": "fixed"}}),
    ])
    try:
        code = run_step("review", None, {}, root, endpoint.base, "test-model", "k", 2,
                        validate=lambda: (0, "unused"))
    finally:
        endpoint.close()
    assert code == 0 and endpoint.calls == 2
    assert not (root / ".muro" / "factory" / "review" / "notes.txt").exists()


def test_agent_gives_up_after_rounds(tmp_path):
    root = review_package(tmp_path)
    endpoint = FakeEndpoint(["no json here at all"])
    try:
        code = run_step("review", None, {}, root, endpoint.base, "test-model", "k", 2,
                        validate=lambda: (0, "unused"))
    finally:
        endpoint.close()
    assert code == 1 and endpoint.calls == 2


def test_post_chat_refuses_plain_http_off_localhost():
    with pytest.raises(ValueError, match="https"):
        _post_chat("http://example.com/v1", "k", "m", [])


def test_read_api_key_env_only(monkeypatch):
    monkeypatch.delenv("MURO_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(ValueError, match="MURO_API_KEY"):
        read_api_key(None)
    monkeypatch.setenv("MY_KEY", "secret")
    assert read_api_key("MY_KEY") == "secret"


def test_write_files_blocks_traversal(tmp_path):
    with pytest.raises(ValueError, match="rejected"):
        _write_files({"../evil.md": "x"}, tmp_path, lambda p: True)
    with pytest.raises(ValueError, match="rejected"):
        _write_files({"capabilities/../../evil.md": "x"}, tmp_path, lambda p: True)


def test_parse_files_tolerates_a_fenced_answer():
    files, notes = _parse_files('```json\n{"files": {"ROUTER.md": "x"}, "notes": "n"}\n```')
    assert files == {"ROUTER.md": "x"} and notes == "n"


# --- installer ----------------------------------------------------------------

ADAPTERS = None  # resolved lazily from a staged build when one exists


def built_adapter(tmp_path, host):
    """Stage a minimal fake adapter directory shaped like a built one."""
    adapter = tmp_path / "adapters" / host
    adapter.mkdir(parents=True)
    (adapter / "INSTALL.md").write_text("## Install\n", encoding="utf-8")
    if host == "claude-code":
        meta = adapter / ".claude-plugin"
        meta.mkdir()
        (meta / "marketplace.json").write_text(json.dumps(
            {"name": "demo", "plugins": [{"name": "demo", "source": "./"}]}), encoding="utf-8")
    return adapter


def test_opencode_install_is_a_config_edit(tmp_path):
    adapter = built_adapter(tmp_path, "opencode")
    home = tmp_path / "home"
    done = install_adapter(adapter, "opencode", home)
    config = json.loads((home / "opencode.json").read_text(encoding="utf-8"))
    assert config["plugins"] == [adapter.resolve().as_uri()]
    assert done and "opencode.json" in done[0]
    install_adapter(adapter, "opencode", home)  # idempotent
    config = json.loads((home / "opencode.json").read_text(encoding="utf-8"))
    assert len(config["plugins"]) == 1


def test_missing_host_cli_is_a_clear_refusal(tmp_path, monkeypatch):
    adapter = built_adapter(tmp_path, "pi")
    monkeypatch.setenv("PATH", str(tmp_path))  # nothing on PATH
    with pytest.raises(ValueError, match="INSTALL.md"):
        install_adapter(adapter, "pi", tmp_path / "home")


def test_marketplace_names_are_read_from_the_adapter(tmp_path):
    adapter = built_adapter(tmp_path, "claude-code")
    assert _marketplace_names(adapter, "claude-code") == ("demo", "demo")


def test_installer_refuses_an_unbuilt_directory(tmp_path):
    with pytest.raises(ValueError, match="INSTALL.md"):
        install_adapter(tmp_path, "opencode", tmp_path / "home")
