"""A client that runs an absorbed MCP server as a child process (ADR-0030).

The child here is a stub written into `tmp_path`: it speaks only what the tests need and
names no real server. Every wait on a child is bounded: a watchdog closes a child that is
still running after `WATCHDOG` seconds, which turns a hung test into a failure.
"""
import json
import subprocess
import sys
import threading
import time

import pytest

from muro import __version__, mcp_client
from muro.jsonrpc import METHOD_NOT_FOUND, PROTOCOL_VERSION
from muro.mcp_client import ChildError, ChildServer, kill_tree

WATCHDOG = 10
WAIT = 10  # seconds a call may take in a test before it counts as hung

STUB = r'''
import json
import subprocess
import sys
import threading

mode = sys.argv[1]
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
out = threading.Lock()
stops = {}          # request id -> Event set by notifications/cancelled
asked = threading.Event()
asked_answer = {}   # the client's answer to the request the stub made
HEARTBEAT = "import sys, time\nfor n in range(300):\n    open(sys.argv[1], 'w').write(str(n))\n    time.sleep(0.05)\n"


def send(message):
    with out:
        sys.stdout.write(json.dumps(message, ensure_ascii=False) + "\n")
        sys.stdout.flush()


def reply(msg_id, result):
    send({"jsonrpc": "2.0", "id": msg_id, "result": result})


def text_result(text):
    return {"content": [{"type": "text", "text": text}], "isError": False}


def tool_call(msg_id, arguments):
    if arguments.get("progress"):
        send({"jsonrpc": "2.0", "method": "notifications/progress",
              "params": {"progressToken": "t", "progress": 1}})
    if arguments.get("ask"):
        send({"jsonrpc": "2.0", "id": "ask-1", "method": "sampling/createMessage", "params": {}})
        asked.wait(5)
        text = json.dumps(asked_answer.get("error"))
    elif stops[msg_id].wait(arguments.get("wait", 0)):
        send({"jsonrpc": "2.0", "id": msg_id, "error": {"code": -1, "message": "cancelled"}})
        return
    else:
        text = json.dumps(arguments, ensure_ascii=False)
    reply(msg_id, text_result(text))


banner = mode == "echo"
for line in sys.stdin:
    message = json.loads(line)
    method, msg_id = message.get("method"), message.get("id")
    if method is None and msg_id == "ask-1":
        asked_answer.update(message)
        asked.set()
    elif method == "notifications/cancelled":
        stops[message["params"]["requestId"]].set()
    elif msg_id is None:
        continue
    elif method == "initialize":
        if banner:
            print("banner, not json", flush=True)
            banner = False
        if mode == "spawns":
            subprocess.Popen([sys.executable, "-c", HEARTBEAT, sys.argv[2]], stdin=subprocess.DEVNULL)
        reply(msg_id, {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}},
                       "serverInfo": {"name": "stub", "version": "0"}})
        if mode == "dies":
            sys.exit(0)
    elif method == "tools/list":
        cursor = message.get("params", {}).get("cursor")
        if mode == "paged":
            page = {"tools": [{"name": "two"}]} if cursor else {"tools": [{"name": "one"}], "nextCursor": "next"}
            reply(msg_id, page)
        else:
            reply(msg_id, {"tools": [{"name": "echo", "inputSchema": {"type": "object"}}]})
    elif method == "tools/call" and mode == "rpc-error":
        send({"jsonrpc": "2.0", "id": msg_id, "error": {"code": -1, "message": "refused"}})
    elif method == "tools/call":
        stops[msg_id] = threading.Event()
        threading.Thread(target=tool_call, args=(msg_id, message["params"]["arguments"]), daemon=True).start()

if mode == "spawns":
    threading.Event().wait(60)  # a server that does not stop when its input ends
'''


@pytest.fixture
def stub(tmp_path):
    path = tmp_path / "stub_server.py"
    path.write_text(STUB, encoding="utf-8")
    started = []

    def make(mode="echo", *extra):
        child = ChildServer("stub", {"command": sys.executable, "args": [str(path), mode, *extra], "env": {}})
        watchdog = threading.Timer(WATCHDOG, child.close)
        watchdog.daemon = True
        watchdog.start()
        started.append((child, watchdog))
        return child

    yield make
    for child, watchdog in started:
        watchdog.cancel()
        child.close()


def wait_until(condition, seconds=5):
    deadline = time.monotonic() + seconds
    while not condition():
        assert time.monotonic() < deadline, "the condition did not hold in time"
        time.sleep(0.02)


def test_a_call_returns_the_childs_result_unchanged(stub):
    child = stub()
    child.start()
    result = child.call("echo", {"a": 1}, timeout=WAIT)
    assert result == {"content": [{"type": "text", "text": '{"a": 1}'}], "isError": False}


def test_a_banner_line_on_stdout_is_ignored(stub):
    child = stub()
    child.start()
    assert [tool["name"] for tool in child.tools()] == ["echo"]


def test_two_calls_at_once_each_get_their_own_answer(stub):
    child = stub()
    child.start()
    answers = {}

    def run(key, arguments):
        answers[key] = child.call("echo", arguments, timeout=WAIT)["content"][0]["text"]

    threads = [threading.Thread(target=run, args=(1, {"wait": 0.3, "n": 1})),
               threading.Thread(target=run, args=(2, {"n": 2}))]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(WAIT)
    assert answers == {1: '{"wait": 0.3, "n": 1}', 2: '{"n": 2}'}


def test_a_json_rpc_error_is_a_child_error(stub):
    child = stub("rpc-error")
    child.start()
    with pytest.raises(ChildError, match="stub: refused"):
        child.call("echo", {}, timeout=WAIT)


def test_a_child_that_stops_is_reported(stub):
    child = stub("dies")
    child.start()
    with pytest.raises(ChildError, match="stub: the server stopped"):
        child.call("echo", {}, timeout=WAIT)


def test_no_answer_in_time_is_reported(stub):
    child = stub()
    child.start()
    with pytest.raises(ChildError, match="stub: no answer after 0.2 seconds"):
        child.call("echo", {"wait": 2}, timeout=0.2)


def test_a_missing_program_is_named():
    child = ChildServer("stub", {"command": "no-such-program-xyz", "args": [], "env": {}})
    with pytest.raises(ChildError, match="stub: program not found: no-such-program-xyz"):
        child.start()


def test_close_stops_the_process(stub):
    child = stub()
    child.start()
    assert child.alive
    child.close()
    assert not child.alive


def test_the_tool_list_is_asked_once(stub):
    child = stub()
    child.start()
    first = child.tools()
    assert child.tools() is first


def test_a_paged_tool_list_is_read_to_its_end(stub):
    child = stub("paged")
    child.start()
    assert [tool["name"] for tool in child.tools()] == ["one", "two"]


def test_text_that_is_not_ascii_survives_both_ways(stub):
    child = stub()
    child.start()
    result = child.call("echo", {"a": "è→日"}, timeout=WAIT)
    assert result["content"][0]["text"] == '{"a": "è→日"}'


def test_progress_reaches_the_handler_of_a_pending_call(stub):
    child = stub()
    child.start()
    seen = []
    child.call("echo", {"progress": 1}, on_progress=seen.append, timeout=WAIT)
    assert [message["method"] for message in seen] == ["notifications/progress"]
    assert seen[0]["params"] == {"progressToken": "t", "progress": 1}


def test_a_request_from_the_child_is_answered_method_not_found(stub):
    child = stub()
    child.start()
    result = child.call("echo", {"ask": 1}, timeout=WAIT)
    assert json.loads(result["content"][0]["text"]) == {
        "code": METHOD_NOT_FOUND, "message": "Method not found: sampling/createMessage"}


def test_cancel_all_cancels_every_pending_call(stub):
    child = stub()
    child.start()
    in_flight = threading.Event()
    outcome = []

    def run():
        try:
            child.call("echo", {"wait": 30, "progress": 1}, on_progress=lambda message: in_flight.set(),
                       timeout=WAIT)
        except ChildError as exc:
            outcome.append(str(exc))

    thread = threading.Thread(target=run)
    thread.start()
    assert in_flight.wait(WAIT)
    child.cancel_all()
    thread.join(WAIT)
    assert not thread.is_alive()
    assert outcome == ["stub: cancelled"]


def test_close_stops_the_whole_tree(stub, tmp_path, monkeypatch):
    monkeypatch.setattr(mcp_client, "CLOSE_WAIT", 0.2)
    beat = tmp_path / "beat"

    def beats():
        try:
            return int(beat.read_text())
        except (OSError, ValueError):
            return -1

    child = stub("spawns", str(beat))
    child.start()
    wait_until(lambda: beats() > 0)
    child.close()
    time.sleep(0.2)
    seen = beats()
    time.sleep(0.5)
    assert beats() == seen


def test_the_handshake_names_the_client(tmp_path):
    path = tmp_path / "record.py"
    path.write_text(
        "import json, sys\n"
        "first = json.loads(sys.stdin.readline())\n"
        "print(json.dumps({'jsonrpc': '2.0', 'id': first['id'], 'result': {}}), flush=True)\n"
        "second = json.loads(sys.stdin.readline())\n"
        "open(sys.argv[1], 'w').write(json.dumps([first, second]))\n",
        encoding="utf-8")
    seen = tmp_path / "seen.json"
    child = ChildServer("stub", {"command": sys.executable, "args": [str(path), str(seen)], "env": {}})
    watchdog = threading.Timer(WATCHDOG, child.close)
    watchdog.daemon = True
    watchdog.start()
    try:
        child.start()
        wait_until(seen.exists)
    finally:
        watchdog.cancel()
        child.close()
    first, second = json.loads(seen.read_text())
    assert first["method"] == "initialize"
    assert first["params"] == {"protocolVersion": PROTOCOL_VERSION, "capabilities": {},
                               "clientInfo": {"name": "muro-package-server", "version": __version__}}
    assert second == {"jsonrpc": "2.0", "method": "notifications/initialized"}


def test_kill_tree_stops_a_process_started_in_its_own_session():
    process = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"], start_new_session=True)
    kill_tree(process)
    process.wait(WAIT)
    assert process.returncode is not None
