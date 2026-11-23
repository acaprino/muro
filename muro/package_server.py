"""The package server: one MCP server for a whole package, its tools declared as data (ADR-0032).

It lists the tools `package-server.json` declares. A forwarded call goes to the absorbed server that
owns the tool, started as a child on its first call; a `run` tool starts its declared command with no
shell. A call runs on its own thread, so the read loop never waits for one: `ping` and a cancellation
are answered while a call is in a child or a command runs.
"""
from __future__ import annotations

import contextlib
import json
import os
import re
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import IO, Any, Callable
from urllib.parse import urlparse
from urllib.request import url2pathname

from . import __version__
from .argv_template import build_argv, is_batch_program
from .delivery import PACKAGE_SERVER_FILE, placed_env, server_launch, server_section_errors
from .jsonrpc import (INTERNAL_ERROR, INVALID_PARAMS, INVALID_REQUEST, METHOD_NOT_FOUND, PARSE_ERROR,
                      PROTOCOL_VERSION, error, read_messages, result, tool_result, write_message)
from .mcp_client import (DRAIN_WAIT, KILL_WAIT, ChildError, ChildServer, ChildTimeout, kill_tree,
                         resolve_program)

START_WAIT = 30   # seconds a child gets to start and list its tools
ROOTS_WAIT = 5    # seconds the host gets to answer roots/list
JOIN_WAIT = 10    # seconds a call gets to finish once the server closes
ROOTS_ID = "roots-1"  # the id of the one request this server makes
DEFAULT_TIMEOUT = 120    # seconds a command gets when its tool declares none
OUTPUT_LIMIT = 100_000   # characters of a command's output that reach the host
POLL = 0.05              # seconds between two looks at a running command
STOP_NOTE = "The effect of this command is unknown: read the current state before any retry."
CANCELLED = f"Cancelled by the host. {STOP_NOTE}"
# Bytes of a stream that are kept: four for each character that may be returned, and one to know it is cut.
_KEEP = OUTPUT_LIMIT * 4 + 1


class _Slot:
    """One child server: its start is serialized by `lock`; `listing` is the child's own tool list, by name."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.server: ChildServer | None = None
        self.listing: dict[str, Any] | None = None


def _params(message: dict[str, Any]) -> dict[str, Any]:
    params = message.get("params")
    return params if isinstance(params, dict) else {}


def _root_directory(uri: str) -> str | None:
    """The directory a `file://` root names, or None when it does not decode or is not a directory that exists."""
    try:
        path = url2pathname(urlparse(uri).path)
    except (ValueError, OSError):  # file://[ is not a host, and a drive path may carry a second colon
        return None
    if os.name == "nt":
        path = re.sub(r"^\\(?=[A-Za-z]:)", "", path)  # file:///c%3A/x: url2pathname keeps the slash before the drive
    return path if os.path.isdir(path) else None


def _text(raw: bytes) -> str:
    text = raw.decode("utf-8", errors="replace")
    return (text[:OUTPUT_LIMIT] + f"\n[output cut at {OUTPUT_LIMIT} characters]") if len(text) > OUTPUT_LIMIT else text


def _drain(pipe: IO[bytes], kept: bytearray) -> None:
    """Read `pipe` to its end, so the command never waits on a full one, and keep the first `_KEEP` bytes of it."""
    try:
        while chunk := pipe.read1(65536):
            kept += chunk[:_KEEP - len(kept)]
    except (OSError, ValueError):
        pass  # the pipe was closed under the reader
    finally:
        with contextlib.suppress(OSError, ValueError):
            pipe.close()


def run_command(argv: list[str], cwd: str | None, env: dict[str, str], timeout: int,
                cancelled: threading.Event) -> dict[str, Any]:
    """Run `argv` with no shell and no input until it exits, `timeout` seconds pass or `cancelled` is set.

    The answer is a tool result. A command that was stopped has its process tree killed, and its answer says
    that its effect is unknown."""
    if cancelled.is_set():  # a call that was cancelled, or that came while the server closes, starts nothing
        return tool_result(CANCELLED, True)
    try:
        process = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   cwd=cwd, env=env, start_new_session=True)  # ignored on Windows
    except OSError as exc:
        return tool_result(f"Cannot start {argv[0]}: {exc}", True)
    kept = (bytearray(), bytearray())
    readers = [threading.Thread(target=_drain, args=(pipe, sink), daemon=True)
               for pipe, sink in zip((process.stdout, process.stderr), kept)]
    for reader in readers:
        reader.start()
    deadline = time.monotonic() + timeout
    killed = False
    # shortcut: the exit is noticed by polling every POLL seconds, upgrade if that latency ever matters
    while process.poll() is None:
        if cancelled.is_set() or time.monotonic() >= deadline:
            killed = True
            kill_tree(process)
            with contextlib.suppress(subprocess.TimeoutExpired):
                process.wait(KILL_WAIT)
            break
        cancelled.wait(POLL)
    drained = time.monotonic() + DRAIN_WAIT  # a grandchild that keeps a pipe open must not hold the answer back
    for reader in readers:
        reader.join(max(drained - time.monotonic(), 0))
    out, err = (_text(bytes(sink)) for sink in kept)
    if not killed:
        if process.returncode == 0:
            return tool_result(out)
        return tool_result(f"exit {process.returncode}\n{err}\n{out}", True)
    if cancelled.is_set():
        return tool_result(CANCELLED, True)
    return tool_result(f"Stopped after {timeout} seconds. {STOP_NOTE}\n{out}", True)


class PackageServer:
    def __init__(self, package: Path, sections: dict[str, Any], send: Callable[[dict[str, Any]], None]) -> None:
        self._package = package
        self._send = send
        self._declaration = sections["package_server"]
        self._tools = {tool["name"]: tool for tool in self._declaration["tools"]}
        servers = sections.get("mcp_servers")
        self._entries = ({s["name"]: s for s in servers if isinstance(s, dict) and "name" in s}
                         if isinstance(servers, list) else {})
        self._slots = {tool["forward"]["server"]: _Slot() for tool in self._tools.values() if "forward" in tool}
        self._lock = threading.Lock()  # guards _workers, _calls, _commands, _closed and every slot's server and listing
        self._workers: set[threading.Thread] = set()
        self._calls: dict[Any, Callable[[], None]] = {}  # host request id of a running call -> how to cancel it
        self._commands: set[threading.Event] = set()  # the stop of each running command: close() sets them all
        self._closed = False
        self._roots_wanted = False
        self._roots_deadline: float | None = None
        self._roots_done = threading.Event()
        self._cwd: str | None = None

    def handle(self, message: dict[str, Any]) -> None:
        try:
            self._dispatch(message)
        except Exception as exc:  # a message the server cannot take must not end it
            if "method" in message and message.get("id") is not None:
                self._send(error(message["id"], INTERNAL_ERROR, f"Internal error: {type(exc).__name__}: {exc}"))

    def _dispatch(self, message: dict[str, Any]) -> None:
        msg_id = message.get("id")
        if "method" not in message:  # an answer: the one request this server makes is roots/list
            if msg_id == ROOTS_ID and self._roots_deadline is not None:
                self._take_roots(message)
            return
        method = message["method"]
        if not isinstance(method, str):
            if msg_id is not None:
                self._send(error(msg_id, INVALID_REQUEST, "Invalid Request"))
        elif msg_id is None:
            if method == "notifications/cancelled":
                request_id = _params(message).get("requestId")
                if isinstance(request_id, (str, int)) and not isinstance(request_id, bool):  # True == 1
                    self._spawn(self._cancel, request_id)
            elif method == "notifications/initialized" and self._roots_wanted:
                self._roots_deadline = time.monotonic() + ROOTS_WAIT
                self._send({"jsonrpc": "2.0", "id": ROOTS_ID, "method": "roots/list"})
        elif method == "initialize":
            self._initialize(msg_id, _params(message))
        elif method == "ping":
            self._send(result(msg_id, {}))
        elif method == "tools/list":
            self._send(result(msg_id, {"tools": [self._listed(tool) for tool in self._tools.values()]}))
        elif method == "tools/call":
            params = message.get("params")
            if isinstance(params, dict) and isinstance(params.get("name"), str):
                stop = threading.Event()  # a cancellation sets it; the call is registered before its worker runs
                with self._lock:
                    self._calls[msg_id] = stop.set
                self._spawn(self._work, message, stop)
            else:
                self._send(error(msg_id, INVALID_PARAMS, "Invalid params"))
        else:
            self._send(error(msg_id, METHOD_NOT_FOUND, f"Method not found: {method}"))

    def _spawn(self, target: Callable[..., None], *args: Any) -> None:
        """Run `target` off the read loop, which a write to a child that reads nothing could hold up."""
        worker = threading.Thread(target=self._tracked, args=(target, *args), name="package-server-worker", daemon=True)
        with self._lock:
            self._workers.add(worker)
        worker.start()

    def _tracked(self, target: Callable[..., None], *args: Any) -> None:
        try:
            target(*args)
        finally:
            with self._lock:
                self._workers.discard(threading.current_thread())

    def _cancel(self, request_id: Any) -> None:
        """Cancel the call the host numbered `request_id`; one that is not pending needs nothing."""
        with self._lock:
            cancel = self._calls.get(request_id)
        if cancel is not None:
            cancel()

    def close(self) -> None:
        """Stop every command and child, which wakes the calls waiting on one, and wait for the calls to end."""
        with self._lock:
            self._closed = True
            workers = list(self._workers)
            commands = list(self._commands)
        for stop in commands:
            stop.set()  # the call of each command kills its process tree
        for server in self._servers():
            server.close()
        deadline = time.monotonic() + JOIN_WAIT
        for worker in workers:
            worker.join(max(deadline - time.monotonic(), 0))

    def _initialize(self, msg_id: Any, params: dict[str, Any]) -> None:
        capabilities = params.get("capabilities")
        self._roots_wanted = isinstance(capabilities, dict) and "roots" in capabilities
        version = params.get("protocolVersion")
        self._send(result(msg_id, {
            "protocolVersion": version if isinstance(version, str) and version else PROTOCOL_VERSION,
            "capabilities": {"tools": {}},
            "serverInfo": {"name": self._declaration["name"], "version": __version__}}))

    @staticmethod
    def _listed(tool: dict[str, Any]) -> dict[str, Any]:
        entry = {"name": tool["name"], "description": tool["description"], "inputSchema": tool["input_schema"]}
        if "annotations" in tool:
            entry["annotations"] = tool["annotations"]
        return entry

    def _servers(self) -> list[ChildServer]:
        with self._lock:
            return [slot.server for slot in self._slots.values() if slot.server is not None]

    def _take_roots(self, message: dict[str, Any]) -> None:
        answer = message.get("result")
        roots = answer.get("roots") if isinstance(answer, dict) else None
        for root in roots if isinstance(roots, list) else []:
            uri = root.get("uri") if isinstance(root, dict) else None
            directory = _root_directory(uri) if isinstance(uri, str) and uri.startswith("file://") else None
            if directory is not None:
                self._cwd = directory
                break
        self._roots_done.set()

    def _working_directory(self) -> str | None:
        if self._roots_deadline is not None:
            self._roots_done.wait(max(self._roots_deadline - time.monotonic(), 0))
        return self._cwd

    def _work(self, message: dict[str, Any], stop: threading.Event) -> None:
        try:
            outcome = self._call(message["params"], message["id"], stop)
        except Exception as exc:  # a call that raises must still be answered, or the host waits for it forever
            outcome = tool_result(f"{type(exc).__name__}: {exc}", True)
        finally:
            with self._lock:
                self._calls.pop(message["id"], None)
        self._send(result(message["id"], outcome))

    def _call(self, params: dict[str, Any], request_id: Any, stop: threading.Event) -> dict[str, Any]:
        name = params["name"]  # handle() checked it is text
        tool = self._tools.get(name)
        if tool is None:
            return tool_result(f"This server does not serve the tool {name}", True)
        arguments = params.get("arguments")
        if arguments is None:
            arguments = {}
        elif not isinstance(arguments, dict):
            return tool_result(f"The arguments of the tool {name} must be an object", True)
        if "run" in tool:
            return self._run(tool, arguments, stop)
        meta = params.get("_meta")
        return self._forward(tool, arguments, meta if isinstance(meta, dict) else None, request_id, stop)

    def _run(self, tool: dict[str, Any], arguments: dict[str, Any], stop: threading.Event) -> dict[str, Any]:
        with self._lock:
            if self._closed:
                stop.set()
            self._commands.add(stop)  # close() sets it
        try:
            root = str(self._package)
            try:
                argv = build_argv(tool["run"], arguments, tool["input_schema"], root)
            except ValueError as exc:
                return tool_result(str(exc), True)
            found = resolve_program(argv[0])
            if found is None:
                return tool_result(f"Program not found on this machine: {argv[0]}", True)
            if is_batch_program(found):
                return tool_result(f"{argv[0]} is a batch file, which Windows runs through cmd.exe: declare the "
                                   "executable and its script instead", True)
            env = {**os.environ, **placed_env(tool, root)}
            return run_command([found, *argv[1:]], self._working_directory(), env,  # the file that was checked runs
                               tool.get("timeout", DEFAULT_TIMEOUT), stop)
        finally:
            with self._lock:
                self._commands.discard(stop)

    def _forward(self, declared: dict[str, Any], arguments: dict[str, Any], meta: dict[str, Any] | None,
                 request_id: Any, stop: threading.Event) -> dict[str, Any]:
        child, tool = declared["forward"]["server"], declared["forward"]["tool"]
        slot = self._slots[child]
        try:
            with slot.lock:
                current = slot.server  # one look: another worker's drop may clear it at any moment
                if current is None or not current.alive:
                    self._drop(slot, current)
                    self._start(slot, child)
                with self._lock:  # a failing call of another worker may clear both at once
                    server, listing = slot.server, slot.listing
        except ChildError as exc:
            return tool_result(str(exc), True)
        if server is None or listing is None:
            return tool_result(f"{child}: the server stopped", True)
        if tool not in listing or listing[tool] != declared["input_schema"]:
            return tool_result(f"{child}: the tool {tool} is not what this package declares "
                               "(missing, or its schema changed)", True)
        token = meta.get("progressToken") if meta else None

        def relay(message: dict[str, Any]) -> None:
            if (message.get("params") or {}).get("progressToken") == token:
                self._send(message)  # every pending call of a child gets each notification: only the owner relays it

        def known(child_id: int) -> None:
            with self._lock:
                self._calls[request_id] = lambda: server.cancel(child_id)
            if stop.is_set():  # cancelled before the child had the call: it never gets it
                raise ChildError(f"{child}: cancelled")

        try:
            return server.call(tool, arguments, relay if token is not None else None, meta=meta, on_id=known)
        except ChildError as exc:
            if not server.alive:
                self._drop(slot, server)
            return tool_result(str(exc), True)

    def _drop(self, slot: _Slot, server: ChildServer | None) -> None:
        """Close a child that stopped or failed to start, so the next call starts another."""
        if server is None:
            return
        server.close()
        with self._lock:
            if slot.server is server:
                slot.server, slot.listing = None, None

    def _start(self, slot: _Slot, child: str) -> None:
        """Start `child` and read its tool list, within START_WAIT in all; `slot.lock` is held."""
        try:
            launch = server_launch(self._entries.get(child), str(self._package))
        except Exception as exc:  # the file was valid when written, but it is edited by hand now and then
            raise ChildError(f"{child}: its declaration cannot be launched ({type(exc).__name__}: {exc})") from None
        server = ChildServer(child, launch, self._working_directory())
        with self._lock:
            if self._closed:
                raise ChildError(f"{child}: the server is closing")
            slot.server = server  # from here close() reaches it, also while it starts
        began = time.monotonic()
        try:
            server.start(START_WAIT)
            listed = server.tools(max(START_WAIT - (time.monotonic() - began), 0))
            slot.listing = {t["name"]: t.get("inputSchema") for t in listed
                            if isinstance(t, dict) and isinstance(t.get("name"), str)}
        except ChildTimeout:
            self._drop(slot, server)
            raise ChildError(f"{child}: no answer after {START_WAIT:g} seconds at start") from None
        except ChildError:
            self._drop(slot, server)
            raise
        except Exception as exc:  # whatever the child sent, a half-started child must not stay registered
            self._drop(slot, server)
            raise ChildError(f"{child}: cannot start ({type(exc).__name__}: {exc})") from None


def _load(package: Path) -> tuple[dict[str, Any] | None, str]:
    """The sections of `package-server.json`, or None and the first thing wrong with the file."""
    try:
        sections = json.loads((package / PACKAGE_SERVER_FILE).read_text(encoding="utf-8"))
    except OSError as exc:
        return None, f"cannot be read: {exc.strerror or exc}"
    except ValueError as exc:
        return None, f"is not valid JSON: {exc}"
    problems = server_section_errors(sections)
    if not problems and not (isinstance(sections, dict) and sections.get("package_server")):
        problems = ["package_server is not declared"]
    return (None, problems[0]) if problems else (sections, "")


def serve(package: Path, stdin=None, stdout=None) -> int:
    """Serve MCP on stdio until stdin closes; 1 when the declaration cannot be read or does not pass."""
    sections, problem = _load(package)
    if sections is None:
        print(f"{PACKAGE_SERVER_FILE}: {problem}", file=sys.stderr)
        return 1
    if stdin is None:
        sys.stdin.reconfigure(encoding="utf-8", errors="replace")  # MCP is UTF-8, whatever the console's code page
        stdin = sys.stdin
    if stdout is None:
        # A lone surrogate in a result (JSON.stringify writes one for half a pair) goes out as its escape, unchanged.
        sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
        stdout = sys.stdout
    out_lock = threading.Lock()

    def send(message: dict[str, Any]) -> None:
        with contextlib.suppress(OSError, ValueError):  # the host closed its end: nobody is left to tell
            write_message(message, stdout, out_lock)

    server = PackageServer(package, sections, send)
    try:
        for message in read_messages(stdin):
            if message is None:
                send(error(None, PARSE_ERROR, "Parse error"))
            else:
                server.handle(message)
    finally:
        server.close()
    return 0
