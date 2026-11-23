"""The package server: one MCP server for a whole package, its tools declared as data (ADR-0032).

It lists the tools `package-server.json` declares and forwards each call to the absorbed server that
owns the tool, started as a child on its first call. A call runs on its own thread, so the read loop
never waits for one: `ping` and a cancellation are answered while a call is in a child.
"""
from __future__ import annotations

import contextlib
import json
import sys
import threading
import time
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse
from urllib.request import url2pathname

from . import __version__
from .delivery import PACKAGE_SERVER_FILE, server_launch, server_section_errors
from .jsonrpc import (METHOD_NOT_FOUND, PARSE_ERROR, PROTOCOL_VERSION, error, read_messages, result, tool_result,
                      write_message)
from .mcp_client import ChildError, ChildServer, ChildTimeout

START_WAIT = 30   # seconds a child gets to start and list its tools
ROOTS_WAIT = 5    # seconds the host gets to answer roots/list
JOIN_WAIT = 10    # seconds a call gets to finish once the server closes
ROOTS_ID = "roots-1"  # the id of the one request this server makes


class _Slot:
    """One child server: its start is serialized by `lock`; `listing` is the child's own tool list, by name."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.server: ChildServer | None = None
        self.listing: dict[str, Any] | None = None


def _params(message: dict[str, Any]) -> dict[str, Any]:
    params = message.get("params")
    return params if isinstance(params, dict) else {}


class PackageServer:
    def __init__(self, package: Path, sections: dict[str, Any], send: Callable[[dict[str, Any]], None]) -> None:
        self._package = package
        self._send = send
        self._declaration = sections["package_server"]
        self._tools = {tool["name"]: tool for tool in self._declaration["tools"]}
        self._entries = {s["name"]: s for s in sections["mcp_servers"] if isinstance(s, dict) and "name" in s}
        self._slots = {tool["forward"]["server"]: _Slot() for tool in self._tools.values() if "forward" in tool}
        self._lock = threading.Lock()  # guards _workers, _closed and every slot's server
        self._workers: set[threading.Thread] = set()
        self._closed = False
        self._roots_wanted = False
        self._roots_deadline: float | None = None
        self._roots_done = threading.Event()
        self._cwd: str | None = None

    def handle(self, message: dict[str, Any]) -> None:
        method, msg_id = message.get("method"), message.get("id")
        if method is None:
            if msg_id == ROOTS_ID:
                self._take_roots(message)
        elif msg_id is None:
            if method == "notifications/cancelled":
                for server in self._servers(listed=True):
                    server.cancel_all()
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
            worker = threading.Thread(target=self._work, args=(message,), name="package-server-call", daemon=True)
            with self._lock:
                self._workers.add(worker)
            worker.start()
        else:
            self._send(error(msg_id, METHOD_NOT_FOUND, f"Method not found: {method}"))

    def close(self) -> None:
        """Stop every child, which wakes the calls waiting on one, and wait for those calls to answer."""
        with self._lock:
            self._closed = True
            workers = list(self._workers)
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

    def _servers(self, listed: bool = False) -> list[ChildServer]:
        """The children that exist; with `listed`, only those past their start: a cancel must not reach a handshake."""
        with self._lock:
            return [slot.server for slot in self._slots.values()
                    if slot.server is not None and (slot.listing is not None or not listed)]

    def _take_roots(self, message: dict[str, Any]) -> None:
        answer = message.get("result")
        roots = answer.get("roots") if isinstance(answer, dict) else None
        for root in roots if isinstance(roots, list) else []:
            uri = root.get("uri") if isinstance(root, dict) else None
            if isinstance(uri, str) and uri.startswith("file://"):
                self._cwd = url2pathname(urlparse(uri).path)
                break
        self._roots_done.set()

    def _working_directory(self) -> str | None:
        if self._roots_deadline is not None:
            self._roots_done.wait(max(self._roots_deadline - time.monotonic(), 0))
        return self._cwd

    def _work(self, message: dict[str, Any]) -> None:
        try:
            outcome = self._call(_params(message))
        except Exception as exc:  # a call that raises must still be answered, or the host waits for it forever
            outcome = tool_result(f"{type(exc).__name__}: {exc}", True)
        self._send(result(message["id"], outcome))
        with self._lock:
            self._workers.discard(threading.current_thread())

    def _call(self, params: dict[str, Any]) -> dict[str, Any]:
        name = params.get("name")
        tool = self._tools.get(name) if isinstance(name, str) else None
        if tool is None:
            return tool_result(f"This server does not serve the tool {name}", True)
        if "run" in tool:
            return tool_result("This server does not run commands yet", True)
        arguments, meta = params.get("arguments") or {}, params.get("_meta")
        return self._forward(tool, arguments, meta if isinstance(meta, dict) else None)

    def _forward(self, declared: dict[str, Any], arguments: dict[str, Any],
                 meta: dict[str, Any] | None) -> dict[str, Any]:
        child, tool = declared["forward"]["server"], declared["forward"]["tool"]
        slot = self._slots[child]
        try:
            with slot.lock:
                if slot.server is None or not slot.server.alive:
                    self._drop(slot, slot.server)
                    self._start(slot, child)
                server, listing = slot.server, slot.listing
        except ChildError as exc:
            return tool_result(str(exc), True)
        if tool not in listing or listing[tool] != declared["input_schema"]:
            return tool_result(f"{child}: the tool {tool} is not what this package declares "
                               "(missing, or its schema changed)", True)
        token = meta.get("progressToken") if meta else None

        def relay(message: dict[str, Any]) -> None:
            if (message.get("params") or {}).get("progressToken") == token:
                self._send(message)  # every pending call of a child gets each notification: only the owner relays it

        try:
            return server.call(tool, arguments, relay if token is not None else None, meta=meta)
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
        except Exception:  # whatever the child sent, a half-started child must not stay registered
            self._drop(slot, server)
            raise


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
        sys.stdout.reconfigure(encoding="utf-8")
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
