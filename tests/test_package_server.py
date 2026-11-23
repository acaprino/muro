"""The package server: it lists the declared tools and forwards calls to the children it starts (ADR-0030).

The package is built in `tmp_path`; its one child is the stub of `mcp_stub`, which names no real server.
`Host` runs the server as a subprocess, as a host does; `Local` calls `PackageServer` in this process,
for what needs a monkeypatched wait. Every wait on the server is bounded by `WAIT`.
"""
import contextlib
import io
import itertools
import json
import os
import shutil
import subprocess
import sys
import threading
from pathlib import Path

import pytest

from mcp_stub import STUB, wait_until
from muro import __version__, package_server
from muro.adapters import _LAUNCHER
from muro.delivery import PACKAGE_SERVER_ACTION, PACKAGE_SERVER_FILE, server_section_errors
from muro.jsonrpc import (INTERNAL_ERROR, INVALID_PARAMS, INVALID_REQUEST, METHOD_NOT_FOUND, PARSE_ERROR,
                          PROTOCOL_VERSION, tool_result)
from muro.mcp_client import kill_tree
from muro.package_server import PackageServer, serve

ROOT = Path(__file__).resolve().parent.parent
WAIT = 10  # seconds the server may take to answer before a test counts it as hung
SCHEMA = {"type": "object"}  # what the stub lists as the input schema of its one tool
ECHO = {"name": "echo", "source": "demo", "description": "Echo, in the child's words.",
        "input_schema": SCHEMA, "forward": {"server": "stub", "tool": "echo"}}
GONE = {**ECHO, "name": "gone", "forward": {"server": "stub", "tool": "gone"}}
LOOKUP = {"name": "lookup", "source": "demo", "description": "Look up q.",
          "input_schema": {"type": "object", "properties": {"q": {"type": "string"}}, "required": ["q"]},
          "run": ["python", "<package_root>/scripts/demo/stub.py", "{q}"]}
SERVE = "from pathlib import Path; from muro.package_server import serve; raise SystemExit(serve(Path(r'{package}')))"
STOPPED = "the tool {tool} is not what this package declares (missing, or its schema changed)"


def build_package(tmp_path, tools=(ECHO,), mode="echo", entry=None):
    package = tmp_path / "pack"
    (package / "scripts" / "demo").mkdir(parents=True)
    (package / "scripts" / "demo" / "stub.py").write_text(STUB, encoding="utf-8")
    sections = {"package_server": {"name": "pack", "children": ["stub"], "tools": list(tools)},
                "mcp_servers": [entry or {"name": "stub", "source": "demo",
                                          "run": ["python", "<package_root>/scripts/demo/stub.py", mode]}]}
    if entry is None:  # a fixture that cannot pass the server's own check proves nothing
        assert server_section_errors(sections) == []
    (package / PACKAGE_SERVER_FILE).write_text(json.dumps(sections), encoding="utf-8")
    return package


def marker(package, name):
    return package / "scripts" / "demo" / name


class Peer:
    """What a host does with a server: sends requests, collects everything that comes back, in order."""

    def __init__(self, deliver=None):
        self.deliver = deliver
        self.messages = []
        self._ids = itertools.count(1)
        self._news = threading.Condition()

    def put(self, message):
        with self._news:
            self.messages.append(message)
            self._news.notify_all()

    def wait(self, predicate, what):
        with self._news:
            assert self._news.wait_for(lambda: any(predicate(m) for m in self.messages), WAIT), \
                f"no {what} in {WAIT} seconds; got {self.messages}"
            return next(m for m in self.messages if predicate(m))

    def answer(self, msg_id):
        return self.wait(lambda m: m.get("id") == msg_id and "method" not in m, f"answer to {msg_id}")

    def request(self, method, params=None):
        msg_id = next(self._ids)
        self.deliver({"jsonrpc": "2.0", "id": msg_id, "method": method,
                      **({} if params is None else {"params": params})})
        return msg_id

    def notify(self, method, params=None):
        self.deliver({"jsonrpc": "2.0", "method": method, **({} if params is None else {"params": params})})

    def ask(self, method, params=None):
        return self.answer(self.request(method, params))

    def call_request(self, name, arguments=None, meta=None):
        params = {"name": name, "arguments": arguments or {}}
        if meta is not None:
            params["_meta"] = meta
        return self.request("tools/call", params)

    def call(self, name, arguments=None, meta=None):
        return self.answer(self.call_request(name, arguments, meta))["result"]

    def notifications(self, method):
        return [m for m in self.messages if m.get("method") == method]


class Host(Peer):
    """A server run as a subprocess, spoken to through its pipes."""

    def __init__(self, argv, cwd):
        super().__init__(self._write)
        self.process = subprocess.Popen(argv, cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE, text=True, encoding="utf-8",
                                        start_new_session=True)  # so kill_tree may reach the whole tree
        self._reader = threading.Thread(target=self._read, daemon=True)
        self._reader.start()

    def _write(self, message):
        self.process.stdin.write(json.dumps(message, ensure_ascii=False) + "\n")
        self.process.stdin.flush()

    def _read(self):
        for line in self.process.stdout:
            self.put(json.loads(line))

    def close(self):
        with contextlib.suppress(OSError, ValueError):
            self.process.stdin.close()
        try:
            self.process.wait(WAIT)
        except subprocess.TimeoutExpired:
            kill_tree(self.process)
            self.process.wait(WAIT)
        self._reader.join(WAIT)  # it ends with the process, and only then may the pipes be closed
        for pipe in (self.process.stdout, self.process.stderr):
            pipe.close()


@pytest.fixture
def host_with(tmp_path):
    hosts = []

    def make(**options):
        package = build_package(tmp_path, **options)
        host = Host([sys.executable, "-c", SERVE.format(package=package)], ROOT)
        host.package = package
        hosts.append(host)
        return host

    yield make
    for host in hosts:
        host.close()


@pytest.fixture
def host(host_with):
    return host_with()


@pytest.fixture
def local(tmp_path):
    servers = []

    def make(**options):
        package = build_package(tmp_path, **options)
        sections = json.loads((package / PACKAGE_SERVER_FILE).read_text(encoding="utf-8"))
        peer = Peer()
        peer.package = package
        peer.server = PackageServer(package, sections, peer.put)
        peer.deliver = peer.server.handle
        servers.append(peer.server)
        return peer

    yield make
    for server in servers:
        server.close()


def text_of(result):
    return result["content"][0]["text"]


def test_initialize_names_the_package_server(host):
    answer = host.ask("initialize", {"protocolVersion": "2025-03-26", "capabilities": {}})
    assert answer["result"] == {"protocolVersion": "2025-03-26", "capabilities": {"tools": {}},
                                "serverInfo": {"name": "pack", "version": __version__}}


def test_initialize_offers_its_own_protocol_version_when_the_host_names_none(local):
    assert local().ask("initialize", {})["result"]["protocolVersion"] == PROTOCOL_VERSION


def test_tools_list_comes_from_the_declaration_and_starts_nothing(host):
    answer = host.ask("tools/list")
    assert answer["result"] == {"tools": [{"name": "echo", "description": ECHO["description"], "inputSchema": SCHEMA}]}
    assert not marker(host.package, "started").exists()
    host.call("echo")  # the marker is how a start shows
    assert marker(host.package, "started").exists()


def test_tools_list_carries_the_annotations_a_tool_declares(host_with):
    host = host_with(tools=[{**ECHO, "annotations": {"readOnlyHint": True}}])
    listed = host.ask("tools/list")["result"]["tools"]
    assert listed[0]["annotations"] == {"readOnlyHint": True}


def test_a_forwarded_call_returns_the_childs_result(host):
    result = host.call("echo", {"a": 1})
    assert text_of(result) == '{"a": 1}'
    assert result["isError"] is False


def test_text_that_is_not_ascii_survives_the_server_both_ways(host):
    # Ё is two bytes of which the second is undefined in the Windows code page: a server that reads in it fails here.
    assert text_of(host.call("echo", {"a": "è→日Ё"})) == '{"a": "è→日Ё"}'


def test_ping_is_answered_while_a_call_runs(host):
    call = host.call_request("echo", {"wait": 1.0})
    ping = host.request("ping")
    host.answer(ping)
    host.answer(call)
    answered = [m["id"] for m in host.messages if "method" not in m]
    assert answered.index(ping) < answered.index(call)


def test_two_first_calls_at_once_start_the_child_once(host):
    calls = [host.call_request("echo", {"n": n}) for n in (1, 2)]
    assert [text_of(host.answer(call)["result"]) for call in calls] == ['{"n": 1}', '{"n": 2}']
    assert marker(host.package, "started").read_text() == "x"


def test_a_tool_the_child_no_longer_has_is_named(host_with):
    host = host_with(tools=[ECHO, GONE])
    result = host.call("gone")
    assert result == tool_result("stub: " + STOPPED.format(tool="gone"), True)
    assert text_of(host.call("echo", {"a": 1})) == '{"a": 1}'  # the others still work


def test_a_changed_schema_is_named_the_same_way(host_with):
    host = host_with(tools=[{**ECHO, "input_schema": {"type": "object", "properties": {"x": {}}}}])
    assert host.call("echo") == tool_result("stub: " + STOPPED.format(tool="echo"), True)


def test_a_child_that_dies_is_started_again_on_the_next_call(host_with):
    host = host_with(mode="dies-once")
    assert host.call("echo", {"a": 1}) == tool_result("stub: the server stopped", True)
    assert host.call("echo", {"a": 1}) == tool_result('{"a": 1}')
    assert marker(host.package, "started").read_text() == "xx"


def test_an_unknown_tool_and_an_unknown_method(host):
    assert host.call("nope") == tool_result("This server does not serve the tool nope", True)
    error = host.ask("no/such")["error"]
    assert error == {"code": METHOD_NOT_FOUND, "message": "Method not found: no/such"}


@pytest.mark.parametrize("params", ["not an object", None, {}, {"name": 5, "arguments": {}}],
                         ids=["not an object", "no params", "no name", "name that is not text"])
def test_a_call_without_a_tool_name_is_an_invalid_params_error(local, params):
    peer = local()
    assert peer.ask("tools/call", params)["error"] == {"code": INVALID_PARAMS, "message": "Invalid params"}
    assert peer.ask("ping")["result"] == {}


@pytest.mark.parametrize("arguments", [["a"], [], "text", ""], ids=["list", "empty list", "text", "empty text"])
def test_arguments_that_are_not_an_object_are_refused(local, arguments):
    peer = local()
    result = peer.ask("tools/call", {"name": "echo", "arguments": arguments})["result"]
    assert result == tool_result("The arguments of the tool echo must be an object", True)
    assert not marker(peer.package, "started").exists()  # refused before any child starts


def test_a_call_with_no_arguments_runs_with_none(local):
    peer = local()
    assert text_of(peer.ask("tools/call", {"name": "echo"})["result"]) == "{}"


@pytest.mark.parametrize("method", [None, 5, ["ping"]], ids=["null", "number", "list"])
def test_a_request_whose_method_is_not_text_is_an_invalid_request(local, method):
    peer = local()
    peer.deliver({"jsonrpc": "2.0", "id": 7, "method": method})
    assert peer.answer(7)["error"] == {"code": INVALID_REQUEST, "message": "Invalid Request"}
    assert peer.ask("ping")["result"] == {}


def test_a_message_that_makes_the_server_raise_is_answered_with_an_internal_error(local, monkeypatch):
    peer = local()
    monkeypatch.setattr(PackageServer, "_listed", staticmethod(lambda tool: 1 / 0))
    error = peer.ask("tools/list")["error"]
    assert error["code"] == INTERNAL_ERROR and error["message"].startswith("Internal error: ZeroDivisionError")
    assert peer.ask("ping")["result"] == {}


def test_a_notification_whose_method_is_not_text_is_ignored(local):
    peer = local()
    peer.deliver({"jsonrpc": "2.0", "method": 5})
    assert peer.ask("ping")["result"] == {}


def test_a_tool_the_child_lists_and_the_package_does_not_declare_is_not_reachable(local):
    peer = local(tools=[GONE])  # the stub lists echo, which this package does not declare
    assert peer.call("echo") == tool_result("This server does not serve the tool echo", True)
    assert not marker(peer.package, "started").exists()


def test_a_line_that_is_not_json_is_a_parse_error(host):
    host.process.stdin.write("not json\n")
    host.process.stdin.flush()
    error = host.wait(lambda m: "error" in m and m["id"] is None, "parse error")["error"]
    assert error == {"code": PARSE_ERROR, "message": "Parse error"}


def test_a_command_tool_is_not_run_yet(host_with):
    host = host_with(tools=[ECHO, LOOKUP])
    assert host.call("lookup", {"q": "a"}) == tool_result("This server does not run commands yet", True)


def test_the_progress_of_a_call_reaches_the_host_unchanged_and_once(host):
    first = host.call_request("echo", {"wait": 0.5, "progress": 1}, meta={"progressToken": "pa"})
    second = host.call_request("echo", {"wait": 0.5, "progress": 1}, meta={"progressToken": "pb"})
    host.answer(first)
    host.answer(second)
    progress = host.notifications("notifications/progress")
    assert sorted(m["params"]["progressToken"] for m in progress) == ["pa", "pb"]
    assert {"jsonrpc": "2.0", "method": "notifications/progress",
            "params": {"progressToken": "pa", "progress": 1}} in progress


def test_cancelling_reaches_the_child(host):
    call = host.call_request("echo", {"wait": 30, "progress": 1}, meta={"progressToken": "p"})
    host.wait(lambda m: m.get("method") == "notifications/progress", "progress")  # the call is in the child
    host.notify("notifications/cancelled", {"requestId": call})
    assert host.answer(call)["result"] == tool_result("stub: cancelled", True)


def test_the_end_of_input_stops_the_server_and_a_child_with_a_call_in_flight(host):
    host.call_request("echo", {"wait": 30, "progress": 1}, meta={"progressToken": "p"})
    host.wait(lambda m: m.get("method") == "notifications/progress", "progress")
    host.process.stdin.close()
    assert host.process.wait(WAIT) == 0
    assert marker(host.package, "stopped").exists()  # the child saw its own input end


def test_the_end_of_input_leaves_no_call_running(tmp_path):
    package = build_package(tmp_path)
    lines = "".join(json.dumps(message) + "\n" for message in (
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "echo", "arguments": {"wait": 30}}},
        {"jsonrpc": "2.0", "id": 2, "method": "ping"}))
    out = io.StringIO()
    assert serve(package, io.StringIO(lines), out) == 0
    assert not [t for t in threading.enumerate() if t.name == "package-server-worker"]
    assert '"id": 2' in out.getvalue()


def test_cancelling_one_call_by_its_id_leaves_the_others(host):
    slow = host.call_request("echo", {"wait": 30, "progress": 1}, meta={"progressToken": "pa"})
    short = host.call_request("echo", {"wait": 2.0, "progress": 1}, meta={"progressToken": "pb"})
    for token in ("pa", "pb"):  # both are in the child
        host.wait(lambda m: m.get("params", {}).get("progressToken") == token, f"progress {token}")
    host.notify("notifications/cancelled", {"requestId": 999})  # names no pending call
    host.notify("notifications/cancelled", {"requestId": [slow]})  # not an id at all
    host.notify("notifications/cancelled", {"requestId": slow})
    assert host.answer(slow)["result"] == tool_result("stub: cancelled", True)
    assert host.answer(short)["result"] == tool_result('{"wait": 2.0, "progress": 1}')


def test_a_child_dropped_by_another_call_just_after_it_started_is_reported(local, monkeypatch):
    peer = local()
    start = PackageServer._start

    def start_then_drop(self, slot, child):
        start(self, slot, child)
        self._drop(slot, slot.server)  # what a failing call of another worker does at this moment

    monkeypatch.setattr(PackageServer, "_start", start_then_drop)
    assert peer.call("echo") == tool_result("stub: the server stopped", True)


def test_a_result_with_a_lone_surrogate_reaches_the_host_as_its_escape(host):
    assert text_of(host.call("echo", {"surrogate": 1})) == "\ud83d"


def test_a_cancellation_does_not_hold_up_the_read_loop(local):
    peer = local(mode="deaf-after-list")
    peer.call_request("echo", {"blob": "x" * 2_000_000})  # the child reads nothing: this write stays in flight
    child = peer.server._slots["stub"]
    wait_until(lambda: child.server is not None and child.server._write_lock.locked())
    asked = []

    def read_loop():  # what serve() does with the next two lines of input
        peer.notify("notifications/cancelled", {"requestId": 1})
        asked.append(peer.request("ping"))

    threading.Thread(target=read_loop, daemon=True).start()
    wait_until(lambda: asked)
    assert peer.answer(asked[0])["result"] == {}


def roots(peer, answer):
    """Declare the roots capability, finish the handshake and answer the server's roots/list with `answer`."""
    peer.ask("initialize", {"protocolVersion": PROTOCOL_VERSION, "capabilities": {"roots": {}}})
    peer.notify("notifications/initialized")
    asked = peer.wait(lambda m: m.get("method") == "roots/list", "roots request")
    if answer is not None:
        peer.deliver({"jsonrpc": "2.0", "id": asked["id"], "result": {"roots": answer}})


def working_directory(peer):
    return Path(text_of(peer.call("echo", {"show_cwd": 1})))


def test_the_first_file_root_is_where_children_work(local, tmp_path):
    work = tmp_path / "work dir"
    work.mkdir()
    peer = local()
    roots(peer, [{"uri": "https://example.invalid/x"}, {"uri": work.as_uri()}, {"uri": tmp_path.as_uri()}])
    assert working_directory(peer).samefile(work)


@pytest.mark.parametrize("answer", [None, [], [{"uri": "https://example.invalid/x"}], [{"uri": "file://["}],
                                    [{"uri": "file:///C:/a:b"}], [{"uri": "file:///no/such/directory"}],
                                    [{"uri": 5}, "file:///x", None]],
                         ids=["no answer", "no roots", "no file root", "bad host", "bad drive", "not a directory",
                              "not roots"])
def test_without_a_file_root_children_work_where_the_server_does(local, monkeypatch, answer):
    monkeypatch.setattr(package_server, "ROOTS_WAIT", 0.3)
    peer = local()
    roots(peer, answer)
    assert working_directory(peer).samefile(os.getcwd())


def test_a_root_that_does_not_decode_is_skipped_for_the_next(local, tmp_path):
    work = tmp_path / "work"
    work.mkdir()
    peer = local()
    roots(peer, [{"uri": "file://["}, {"uri": "file:///C:/a:b"}, {"uri": work.as_uri()}])
    assert working_directory(peer).samefile(work)


@pytest.mark.skipif(sys.platform != "win32", reason="the drive form of a file URL is a Windows one")
def test_a_root_with_the_drive_colon_escaped_is_used(local, tmp_path):
    work = tmp_path / "work"
    work.mkdir()
    drive, rest = work.as_uri().removeprefix("file:///").split(":", 1)  # the form an editor sends: file:///c%3A/...
    peer = local()
    roots(peer, [{"uri": f"file:///{drive.lower()}%3A{rest}"}])
    assert working_directory(peer).samefile(work)


@pytest.mark.parametrize("message", [{"result": "x"}, {"result": ["a"]}, {"error": {"code": -1, "message": "no"}}, {}],
                         ids=["text result", "list result", "error", "empty"])
def test_a_message_with_the_id_of_the_roots_request_that_is_not_an_answer_is_harmless(local, message):
    peer = local()
    roots(peer, None)
    peer.deliver({"jsonrpc": "2.0", "id": package_server.ROOTS_ID, **message})
    assert working_directory(peer).samefile(os.getcwd())


def test_a_message_with_the_id_of_the_roots_request_before_any_request_is_ignored(local, tmp_path):
    peer = local()
    peer.deliver({"jsonrpc": "2.0", "id": package_server.ROOTS_ID, "result": {"roots": [{"uri": tmp_path.as_uri()}]}})
    assert working_directory(peer).samefile(os.getcwd())


@pytest.mark.parametrize("mode", ["mute", "no-list"])
def test_a_child_that_does_not_start_in_time_is_given_up(local, monkeypatch, mode):
    monkeypatch.setattr(package_server, "START_WAIT", 0.5)
    peer = local(mode=mode)
    for _ in range(2):  # the child that failed is not kept: the second call starts another and fails the same way
        assert peer.call("echo") == tool_result("stub: no answer after 0.5 seconds at start", True)


@pytest.mark.parametrize("entry", [{"name": "stub", "source": "demo"}, {"name": "stub", "source": "demo", "run": [1]}],
                         ids=["no run", "program that is not text"])
def test_a_child_whose_declaration_cannot_be_launched_is_named(local, entry):
    peer = local(entry=entry)
    result = peer.call("echo")
    assert result["isError"] is True and text_of(result).startswith("stub: ")
    assert peer.ask("ping")["result"] == {}


@pytest.mark.parametrize("break_file", [
    lambda path: path.unlink(),
    lambda path: path.write_text("{not json", encoding="utf-8"),
    lambda path: path.write_text(json.dumps({"package_server": {"name": "Bad"}, "mcp_servers": []}), encoding="utf-8"),
    lambda path: path.write_text(json.dumps({"package_server": None, "mcp_servers": []}), encoding="utf-8"),
], ids=["missing", "not json", "invalid", "no package server"])
def test_a_missing_or_invalid_file_stops_the_server(tmp_path, break_file):
    package = build_package(tmp_path)
    break_file(package / PACKAGE_SERVER_FILE)
    done = subprocess.run([sys.executable, "-c", SERVE.format(package=package)], cwd=ROOT, input="",
                          capture_output=True, text=True, encoding="utf-8", timeout=WAIT)
    assert done.returncode == 1
    assert done.stderr.startswith(f"{PACKAGE_SERVER_FILE}: ")
    assert done.stdout == ""


def test_the_launcher_action_serves(tmp_path):
    package = build_package(tmp_path)
    shutil.copytree(ROOT / "muro", package / "muro", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    (package / "muro.py").write_text(_LAUNCHER, encoding="utf-8")
    host = Host([sys.executable, str(package / "muro.py"), PACKAGE_SERVER_ACTION], tmp_path)
    try:
        assert host.ask("initialize", {"capabilities": {}})["result"]["serverInfo"]["name"] == "pack"
        assert [tool["name"] for tool in host.ask("tools/list")["result"]["tools"]] == ["echo"]
        assert text_of(host.call("echo", {"a": 1})) == '{"a": 1}'
    finally:
        host.close()
