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
from test_cli import git, make_repo, manifest_for, review_package
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


def test_scaffold_failure_leaves_no_phantom_directory(tmp_path):
    upstream = tmp_path / "upstream"  # a repo without LICENSE fails the gate
    upstream.mkdir()
    git(upstream, "init", "-q")
    (upstream / "SKILL.md").write_text("# skill", encoding="utf-8")
    git(upstream, "add", ".")
    git(upstream, "commit", "-q", "-m", "one")
    git(upstream, "tag", "v1.0.0")
    package = tmp_path / "package"
    with pytest.raises(ValueError, match="verification failed"):
        scaffold_package(package, str(upstream), slug=None, license_name="MIT",
                         goal="g", selected=["SKILL.md"], release=None, head=False)
    assert not package.exists()


def test_scaffold_head_pin_when_asked(tmp_path):
    upstream = licensed_repo(tmp_path, tags=())
    package = tmp_path / "package"
    manifest_path = scaffold_package(package, str(upstream), slug=None, license_name="MIT",
                                     goal="g", selected=["SKILL.md"], release=None, head=True)
    source = json.loads(manifest_path.read_text(encoding="utf-8"))["sources"][0]
    assert source["pin"] == "head" and len(source["commit"]) == 40


def test_baseline_reports_a_moved_pinned_tag_as_drifted(tmp_path):
    from muro.baseline import baseline_report as report

    root, first, head = make_repo(tmp_path, tags=["v1.0.0"])
    git(root, "tag", "-f", "v1.0.0", head)  # upstream force-moved the pinned tag
    rows = report(manifest_for(root, first, "release", "v1.0.0"), tmp_path)
    assert rows[0]["status"] == "drifted"
    assert "moved tag" in rows[0]["note"]
    assert rows[0]["upstream"] == head[:12]


def test_baseline_reports_a_deleted_pinned_tag_as_drifted(tmp_path):
    from muro.baseline import baseline_report as report

    root, first, _ = make_repo(tmp_path, tags=["v1.0.0", "v1.1.0"])
    git(root, "tag", "-d", "v1.0.0")
    rows = report(manifest_for(root, first, "release", "v1.0.0"), tmp_path)
    assert rows[0]["status"] == "drifted"
    assert "no longer upstream" in rows[0]["note"]


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


def test_parse_files_keeps_traversal_visible_and_strips_only_dot_slash():
    files, _ = _parse_files(json.dumps({"files": {"../ROUTER.md": "x", "./entries.json": "y"}}))
    assert "../ROUTER.md" in files  # not silently rewritten; _write_files rejects it
    assert "entries.json" in files
    with pytest.raises(ValueError, match="rejected"):
        _write_files(files, Path("/tmp"), lambda p: True)


def test_agent_removes_stale_files_from_a_rejected_round(tmp_path):
    root = review_package(tmp_path)
    endpoint = FakeEndpoint([
        json.dumps({"files": {"capabilities/zz-bogus.md": "junk", "ROUTER.md": "r1"}}),
        json.dumps({"files": {"ROUTER.md": "r2"}}),
    ])
    reports = iter([(1, "capabilities/zz-bogus.md: bad frontmatter"), (0, "OK")])
    try:
        code = run_step("harmonize", None, {}, root, endpoint.base, "test-model", "k", 2,
                        validate=lambda: next(reports))
    finally:
        endpoint.close()
    assert code == 0 and endpoint.calls == 2
    assert not (root / "capabilities" / "zz-bogus.md").exists()
    assert (root / "ROUTER.md").read_text(encoding="utf-8") == "r2"


def test_captured_turns_a_parse_crash_into_a_repair_report():
    from muro.cli import _captured

    def boom():
        raise ValueError("capabilities/x.md: missing YAML front matter (---)")

    code, report = _captured(boom)
    assert code == 1 and "front matter" in report


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


def test_opencode_fresh_home_uses_the_user_level_config(tmp_path):
    adapter = built_adapter(tmp_path, "opencode")
    home = tmp_path / "home"
    done = install_adapter(adapter, "opencode", home)
    config_path = home / ".config" / "opencode" / "opencode.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    assert config["plugins"] == [adapter.resolve().as_uri()]
    assert done and "opencode.json" in done[0]
    install_adapter(adapter, "opencode", home)  # idempotent
    config = json.loads(config_path.read_text(encoding="utf-8"))
    assert len(config["plugins"]) == 1


def test_opencode_existing_project_config_wins(tmp_path):
    adapter = built_adapter(tmp_path, "opencode")
    home = tmp_path / "home"
    home.mkdir()
    (home / "opencode.json").write_text("{}", encoding="utf-8")
    install_adapter(adapter, "opencode", home)
    config = json.loads((home / "opencode.json").read_text(encoding="utf-8"))
    assert config["plugins"] == [adapter.resolve().as_uri()]
    assert not (home / ".config").exists()


def test_marketplace_already_added_is_tolerated(tmp_path, monkeypatch):
    import muro.installer as installer_mod

    adapter = built_adapter(tmp_path, "claude-code")
    calls = []

    class Result:
        def __init__(self, returncode, stderr=""):
            self.returncode, self.stderr, self.stdout = returncode, stderr, ""

    def fake_run(command, **_kwargs):
        calls.append(command)
        if command[:4] == ["claude", "plugin", "marketplace", "add"]:
            return Result(1, "Error: marketplace 'demo' already exists")
        return Result(0)

    monkeypatch.setattr(installer_mod.shutil, "which", lambda name: f"/bin/{name}")
    monkeypatch.setattr(installer_mod.subprocess, "run", fake_run)
    done = install_adapter(adapter, "claude-code", tmp_path / "home")
    assert any("already present, kept" in line for line in done)
    assert calls[-1][:3] == ["claude", "plugin", "install"]  # install still ran


def test_other_marketplace_failures_still_raise(tmp_path, monkeypatch):
    import muro.installer as installer_mod

    adapter = built_adapter(tmp_path, "claude-code")

    class Result:
        returncode, stderr, stdout = 1, "Error: network unreachable", ""

    monkeypatch.setattr(installer_mod.shutil, "which", lambda name: f"/bin/{name}")
    monkeypatch.setattr(installer_mod.subprocess, "run", lambda *a, **k: Result())
    with pytest.raises(ValueError, match="network unreachable"):
        install_adapter(adapter, "claude-code", tmp_path / "home")


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
