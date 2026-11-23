"""The stub MCP server and its fixture, shared by the tests of the client and of the package server.

The child is a script written into `tmp_path`: it speaks only what the tests need and names no real
server. Every wait on a child is bounded: a watchdog closes a child that is still running after
`WATCHDOG` seconds, which turns a hung test into a failure.
"""
import contextlib
import os
import signal
import sys
import threading
import time

import pytest

from muro.mcp_client import ChildServer

WATCHDOG = 10
SLEEPERS = "sleepers"  # file in tmp_path where the stub's long-lived processes write their pids

STUB = r'''
import json
import os
import subprocess
import sys
import threading
from pathlib import Path

mode = sys.argv[1]
with Path(__file__).with_name("started").open("a") as marker:
    marker.write("x")  # one letter for each start of the stub
DIED = Path(__file__).with_name("died")  # dies-once: the first process to be asked for a call leaves it
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
out = threading.Lock()
stops = {}          # request id -> Event set by notifications/cancelled
asked = threading.Event()
asked_answer = {}   # the client's answer to the request the stub made
SLEEPER = "import os, sys, time\nopen(sys.argv[1], 'a').write(str(os.getpid()) + chr(10))\ntime.sleep(12)\n"
SPAWNER = ("import subprocess, sys\nsubprocess.Popen([sys.executable, '-c', sys.argv[1], sys.argv[2]], "
           "stdin=subprocess.DEVNULL, start_new_session=True)\n")
HEARTBEAT = "import sys, time\nfor n in range(300):\n    open(sys.argv[1], 'w').write(str(n))\n    time.sleep(0.05)\n"


def send(message):
    with out:
        sys.stdout.write(json.dumps(message, ensure_ascii=False) + "\n")
        sys.stdout.flush()


def reply(msg_id, result):
    send({"jsonrpc": "2.0", "id": msg_id, "result": result})


def text_result(text):
    return {"content": [{"type": "text", "text": text}], "isError": False}


def tool_call(msg_id, params):
    arguments = params["arguments"]
    if arguments.get("progress"):
        token = (params.get("_meta") or {}).get("progressToken", "t")
        send({"jsonrpc": "2.0", "method": "notifications/progress",
              "params": {"progressToken": token, "progress": 1}})
    if arguments.get("ask"):
        send({"jsonrpc": "2.0", "id": "ask-1", "method": "sampling/createMessage", "params": {}})
        asked.wait(5)
        text = json.dumps(asked_answer.get("error"))
    elif arguments.get("show_meta"):
        text = json.dumps(params.get("_meta"))
    elif arguments.get("show_cwd"):
        text = os.getcwd()
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
        if mode == "orphans":  # a process that keeps the output pipe open after the stub is gone
            subprocess.Popen([sys.executable, "-c", SLEEPER, sys.argv[2]], stdin=subprocess.DEVNULL)
        if mode == "escapes":  # the same, in a process the stub's tree no longer reaches
            subprocess.run([sys.executable, "-c", SPAWNER, SLEEPER, sys.argv[2]], stdin=subprocess.DEVNULL)
        if mode != "mute":  # mute: never answers the handshake
            reply(msg_id, {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}},
                           "serverInfo": {"name": "stub", "version": "0"}})
        if mode == "dies":
            sys.exit(0)
        if mode == "deaf":
            threading.Event().wait(20)  # busy: reads nothing for a while
    elif method == "tools/list" and mode == "no-list":
        continue  # never answers the tool list
    elif method == "tools/list":
        cursor = message.get("params", {}).get("cursor")
        if mode == "paged":
            page = {"tools": [{"name": "two"}]} if cursor else {"tools": [{"name": "one"}], "nextCursor": "next"}
            reply(msg_id, page)
        else:
            reply(msg_id, {"tools": [{"name": "echo", "inputSchema": {"type": "object"}}]})
        if mode == "deaf-after-list":
            threading.Event().wait(20)  # busy: reads nothing for a while
    elif method == "tools/call" and mode == "orphans":
        sys.exit(0)  # stops without answering
    elif method == "tools/call" and mode == "dies-once" and not DIED.exists():
        DIED.write_text("1")
        sys.exit(0)  # stops without answering, once
    elif method == "tools/call" and mode == "rpc-error":
        send({"jsonrpc": "2.0", "id": msg_id, "error": {"code": -1, "message": "refused"}})
    elif method == "tools/call":
        stops[msg_id] = threading.Event()
        threading.Thread(target=tool_call, args=(msg_id, message["params"]), daemon=True).start()

Path(__file__).with_name("stopped").write_text("1")  # the input ended
if mode in ("spawns", "escapes"):
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
    sleepers = tmp_path / SLEEPERS
    for pid in sleepers.read_text().split() if sleepers.exists() else []:
        with contextlib.suppress(OSError):
            os.kill(int(pid), signal.SIGTERM)


def wait_until(condition, seconds=5):
    deadline = time.monotonic() + seconds
    while not condition():
        assert time.monotonic() < deadline, "the condition did not hold in time"
        time.sleep(0.02)
