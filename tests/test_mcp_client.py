"""A client that runs an absorbed MCP server as a child process (ADR-0030).

The child is the stub of `mcp_stub`: it speaks only what the tests need and names no real server.
Every wait on a child is bounded: a watchdog closes a child that is still running after `WATCHDOG`
seconds, which turns a hung test into a failure.
"""
import json
import os
import subprocess
import sys
import threading
import time

import pytest

from mcp_stub import SLEEPERS, STUB, WATCHDOG, stub, wait_until  # noqa: F401  (stub is a fixture)
from muro import __version__, mcp_client
from muro.jsonrpc import METHOD_NOT_FOUND, PROTOCOL_VERSION
from muro.mcp_client import ChildError, ChildServer, ChildTimeout, kill_tree, resolve_program

WAIT = 10  # seconds a call may take in a test before it counts as hung


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


def test_a_child_that_stopped_is_not_alive_when_the_call_reports_it(stub):
    child = stub("dies")
    child.start()
    with pytest.raises(ChildError):
        child.call("echo", {}, timeout=WAIT)
    assert not child.alive


def test_no_answer_in_time_is_reported(stub):
    child = stub()
    child.start()
    with pytest.raises(ChildError, match="stub: no answer after 0.2 seconds"):
        child.call("echo", {"wait": 2}, timeout=0.2)


def test_a_missing_program_is_named():
    child = ChildServer("stub", {"command": "no-such-program-xyz", "args": [], "env": {}})
    with pytest.raises(ChildError, match="stub: program not found: no-such-program-xyz"):
        child.start()


def test_a_file_that_cannot_run_is_named(tmp_path):
    not_a_program = tmp_path / "notes.txt"
    not_a_program.write_text("not a program", encoding="utf-8")
    child = ChildServer("stub", {"command": str(not_a_program), "args": [], "env": {}})
    with pytest.raises(ChildError, match="stub: cannot start .*notes.txt"):
        child.start()


def program(directory, name):
    """A file that counts as the program `name` on this platform."""
    directory.mkdir(exist_ok=True)
    path = directory / (f"{name}.exe" if os.name == "nt" else name)
    path.write_text("not a program", encoding="utf-8")
    path.chmod(0o755)
    return path


@pytest.fixture
def where_windows_looks_first(monkeypatch):
    """The environment Windows has by default: the working directory is searched for a program before PATH."""
    monkeypatch.delenv("NoDefaultCurrentDirectoryInExePath", raising=False)


def test_a_bare_name_is_found_on_the_absolute_entries_of_path(tmp_path, monkeypatch):
    found = program(tmp_path / "bin", "demo-prog")
    monkeypatch.setenv("PATH", os.pathsep.join(["", "relative", str(tmp_path / "empty"), str(tmp_path / "bin")]))
    assert os.path.samefile(resolve_program("demo-prog"), found)
    assert os.path.isabs(resolve_program("demo-prog"))


@pytest.mark.parametrize("path", ["{empty}", ".", "bin", "{empty}{sep}.{sep}{sep}bin"],
                         ids=["no entry", "dot", "relative entry", "dot, empty and relative entries"])
def test_the_working_directory_is_never_searched(tmp_path, monkeypatch, where_windows_looks_first, path):
    here = tmp_path / "here"
    program(here, "demo-prog")
    program(here / "bin", "demo-prog")
    monkeypatch.chdir(here)
    monkeypatch.setenv("PATH", path.format(empty=tmp_path / "empty", sep=os.pathsep))
    assert resolve_program("demo-prog") is None


def test_a_name_with_a_relative_directory_part_is_refused_and_an_absolute_one_is_used_as_it_is(tmp_path, monkeypatch):
    found = program(tmp_path / "bin", "demo-prog")
    monkeypatch.chdir(tmp_path)
    assert resolve_program("bin/demo-prog") is None
    assert resolve_program(os.path.join(".", "bin", "demo-prog")) is None
    assert resolve_program(str(found)) == str(found)
    assert resolve_program(str(tmp_path / "bin" / "nothing")) == str(tmp_path / "bin" / "nothing")


@pytest.mark.skipif(os.name != "nt", reason="only Windows has PATHEXT")
def test_pathext_decides_which_file_of_a_name_is_the_program(tmp_path, monkeypatch):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "demo-tool").write_text("a script cmd.exe cannot run", encoding="utf-8")  # no extension in PATHEXT
    (bin_dir / "demo-tool.cmd").write_text("@echo off\r\n", encoding="utf-8")
    monkeypatch.setenv("PATH", str(bin_dir))
    assert resolve_program("demo-tool").lower() == str(bin_dir / "demo-tool.cmd").lower()
    assert resolve_program("demo-tool.cmd").lower() == str(bin_dir / "demo-tool.cmd").lower()


def test_a_child_command_is_found_on_path_only(tmp_path, monkeypatch, where_windows_looks_first):
    here = tmp_path / "here"
    program(here, "demo-child")  # a file that no host could run: it shows only that it was picked
    monkeypatch.chdir(here)
    child = ChildServer("stub", {"command": "demo-child", "args": [], "env": {}})
    with pytest.raises(ChildError, match="stub: program not found: demo-child"):
        child.start()


def test_a_child_is_started_by_the_path_its_command_was_resolved_to(tmp_path):
    script = tmp_path / "stub_server.py"
    script.write_text(STUB, encoding="utf-8")
    child = ChildServer("stub", {"command": "python", "args": [str(script), "echo"], "env": {}})
    watchdog = threading.Timer(WATCHDOG, child.close)
    watchdog.daemon = True
    watchdog.start()
    try:
        child.start()
        started_as = child._process.args[0]
        assert os.path.isabs(started_as) and os.path.samefile(started_as, resolve_program("python"))
    finally:
        watchdog.cancel()
        child.close()


@pytest.mark.skipif(os.name != "nt", reason="taskkill is a Windows program")
def test_taskkill_is_not_taken_from_the_working_directory(tmp_path, monkeypatch, where_windows_looks_first):
    (tmp_path / "taskkill.exe").write_text("not a program", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    process = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
    try:
        kill_tree(process)
        process.wait(WAIT)
        assert process.returncode is not None
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(WAIT)


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


def test_a_call_shows_the_meta_it_is_given(stub):
    child = stub()
    child.start()
    without = child.call("echo", {"show_meta": 1}, timeout=WAIT)
    with_meta = child.call("echo", {"show_meta": 1}, meta={"progressToken": "p1"}, timeout=WAIT)
    assert without["content"][0]["text"] == "null"
    assert with_meta["content"][0]["text"] == '{"progressToken": "p1"}'


def test_close_wakes_a_call_that_is_waiting(stub, tmp_path, monkeypatch):
    monkeypatch.setattr(mcp_client, "CLOSE_WAIT", 0.2)
    child = stub("escapes", str(tmp_path / SLEEPERS))
    child.start()
    in_flight = threading.Event()
    outcome = []

    def run():
        try:
            child.call("echo", {"wait": 30, "progress": 1}, on_progress=lambda message: in_flight.set())
        except ChildError as exc:
            outcome.append(str(exc))

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    assert in_flight.wait(WAIT)
    child.close()
    thread.join(2)
    assert not thread.is_alive()
    assert outcome == ["stub: the server stopped"]


def test_a_call_does_not_wait_for_a_pipe_that_a_grandchild_holds_open(stub, tmp_path):
    child = stub("orphans", str(tmp_path / SLEEPERS))
    child.start()
    outcome = []

    def run():
        try:
            child.call("echo", {})
        except ChildError as exc:
            outcome.append(str(exc))

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    thread.join(4)
    assert not thread.is_alive()
    assert outcome == ["stub: the server stopped"]


def test_close_does_not_wait_for_a_write_the_child_does_not_read(stub):
    child = stub("deaf")
    child.start()
    outcome = []

    def run():
        try:
            child.call("echo", {"blob": "x" * 2_000_000})
        except ChildError as exc:
            outcome.append(str(exc))

    writer = threading.Thread(target=run, daemon=True)
    writer.start()
    wait_until(child._write_lock.locked)
    closer = threading.Thread(target=child.close, daemon=True)
    closer.start()
    closer.join(5)
    assert not closer.is_alive()
    assert not child.alive
    writer.join(2)
    assert outcome == ["stub: the server stopped"]


def test_a_failed_write_marks_the_child_stopped_before_the_error_is_seen(stub):
    child = stub("deaf")
    child.start()
    child._process.stdin.close()  # the child is still running, so only the failed write can tell
    with pytest.raises(ChildError, match="stub: the server stopped"):
        child.call("echo", {}, timeout=WAIT)
    assert not child.alive


def test_start_gives_up_on_a_child_that_never_answers_the_handshake(stub):
    child = stub("mute")
    with pytest.raises(ChildTimeout, match="stub: no answer after 0.3 seconds"):
        child.start(timeout=0.3)
    assert not child.alive


def test_the_first_tool_list_gives_up_on_a_child_that_never_answers_it(stub):
    child = stub("no-list")
    child.start()
    with pytest.raises(ChildTimeout, match="stub: no answer after 0.3 seconds"):
        child.tools(timeout=0.3)


def test_a_child_closed_before_it_starts_never_starts(stub, tmp_path):
    child = stub()
    child.close()
    with pytest.raises(ChildError, match="stub: the server stopped"):
        child.start()
    assert not child.alive
    assert not (tmp_path / "started").exists()  # the stub writes this when it runs


def test_cancel_cancels_the_one_call_whose_id_it_is_given(stub):
    child = stub()
    child.start()
    ids, outcome, in_flight = {}, {}, threading.Event()

    def run(key, arguments):
        try:
            outcome[key] = child.call("echo", arguments, on_progress=lambda message: in_flight.set(),
                                      timeout=WAIT, on_id=lambda msg_id: ids.__setitem__(key, msg_id))
        except ChildError as exc:
            outcome[key] = str(exc)

    threads = [threading.Thread(target=run, args=("slow", {"wait": 30, "progress": 1})),
               threading.Thread(target=run, args=("short", {"wait": 1.0}))]
    for thread in threads:
        thread.start()
    assert in_flight.wait(WAIT)
    wait_until(lambda: len(ids) == 2)
    child.cancel(ids["slow"])
    for thread in threads:
        thread.join(WAIT)
    assert outcome["slow"] == "stub: cancelled"
    assert outcome["short"]["content"][0]["text"] == '{"wait": 1.0}'
