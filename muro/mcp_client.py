"""A client for one MCP server run as a child process (ADR-0030).

The package server starts an absorbed server, lists its tools and forwards calls to it.
One reader thread per child routes each answer to the call waiting for it, so any number of
calls share one child and no caller reads the child's output.
"""
from __future__ import annotations

import contextlib
import itertools
import os
import queue
import signal
import subprocess
import sys
import threading
from typing import Any, Callable

from . import __version__
from .jsonrpc import METHOD_NOT_FOUND, PROTOCOL_VERSION, error, read_messages, write_message

CLOSE_WAIT = 2  # seconds a child gets to exit by itself once its input is closed
KILL_WAIT = 5   # seconds a killed child gets to disappear and its output to end


class ChildError(RuntimeError):
    """A child server could not start, refused a call, stopped, or did not answer in time."""


def kill_tree(process: subprocess.Popen) -> None:
    """Kill `process` and what it started; on POSIX it must have been started in its own session."""
    if sys.platform == "win32":
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(process.pid)], capture_output=True, check=False)
    else:
        with contextlib.suppress(ProcessLookupError):
            os.killpg(process.pid, signal.SIGKILL)


class ChildServer:
    def __init__(self, name: str, launch: dict[str, Any], cwd: str | None = None) -> None:
        self.name = name
        self._launch = launch
        self._cwd = cwd
        self._process: subprocess.Popen | None = None
        self._reader: threading.Thread | None = None
        self._ids = itertools.count(1)
        self._lock = threading.Lock()        # guards _waiters, _progress and _stopped
        self._write_lock = threading.Lock()  # one writer at a time on the child's stdin
        self._waiters: dict[int, queue.Queue] = {}
        self._progress: dict[int, Callable[[dict[str, Any]], None]] = {}
        self._stopped = True                 # until start() has a process
        self._closed = False
        self._tools: list[dict[str, Any]] | None = None

    @property
    def alive(self) -> bool:
        return self._process is not None and self._process.poll() is None

    def start(self) -> None:
        command = self._launch["command"]
        try:
            self._process = subprocess.Popen(
                [command, *self._launch["args"]], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                text=True, encoding="utf-8", errors="replace", cwd=self._cwd,
                env={**os.environ, **self._launch["env"]}, start_new_session=True)  # ignored on Windows
        except FileNotFoundError:
            raise ChildError(f"{self.name}: program not found: {command}") from None
        except OSError as exc:
            raise ChildError(f"{self.name}: cannot start {command}: {exc}") from None
        self._stopped = False
        self._reader = threading.Thread(target=self._read, args=(self._process.stdout,), daemon=True)
        self._reader.start()
        try:
            self._request("initialize", {
                "protocolVersion": PROTOCOL_VERSION, "capabilities": {},
                "clientInfo": {"name": "muro-package-server", "version": __version__}})
            # A child that already stopped is reported by the first call, not here.
            with contextlib.suppress(ChildError):
                self._send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        except ChildError:
            self.close()
            raise

    def tools(self) -> list[dict[str, Any]]:
        if self._tools is None:
            tools: list[dict[str, Any]] = []
            params: dict[str, Any] = {}
            while True:
                page = self._request("tools/list", params)
                tools += page.get("tools", [])
                if not page.get("nextCursor"):
                    break
                params = {"cursor": page["nextCursor"]}
            self._tools = tools
        return self._tools

    def call(self, tool: str, arguments: dict[str, Any],
             on_progress: Callable[[dict[str, Any]], None] | None = None,
             timeout: float | None = None) -> dict[str, Any]:
        return self._request("tools/call", {"name": tool, "arguments": arguments}, on_progress, timeout)

    def cancel_all(self) -> None:
        with self._lock:
            pending = list(self._waiters)
        for msg_id in pending:
            with contextlib.suppress(ChildError):
                self._send({"jsonrpc": "2.0", "method": "notifications/cancelled",
                            "params": {"requestId": msg_id}})

    def close(self) -> None:
        process = self._process
        if process is None or self._closed:
            return
        self._closed = True
        with contextlib.suppress(OSError, ValueError):
            process.stdin.close()
        with contextlib.suppress(subprocess.TimeoutExpired):
            process.wait(CLOSE_WAIT)
        kill_tree(process)
        with contextlib.suppress(subprocess.TimeoutExpired):
            process.wait(KILL_WAIT)
        self._reader.join(KILL_WAIT)
        if not self._reader.is_alive():
            process.stdout.close()

    def _request(self, method: str, params: dict[str, Any],
                 on_progress: Callable[[dict[str, Any]], None] | None = None,
                 timeout: float | None = None) -> dict[str, Any]:
        waiter: queue.Queue = queue.Queue()
        with self._lock:
            if self._stopped:
                raise ChildError(f"{self.name}: the server stopped")
            msg_id = next(self._ids)
            self._waiters[msg_id] = waiter
            if on_progress is not None:
                self._progress[msg_id] = on_progress
        try:
            self._send({"jsonrpc": "2.0", "id": msg_id, "method": method, "params": params})
            try:
                reply = waiter.get(timeout=timeout)
            except queue.Empty:
                raise ChildError(f"{self.name}: no answer after {timeout:g} seconds") from None
        finally:
            with self._lock:
                self._waiters.pop(msg_id, None)
                self._progress.pop(msg_id, None)
        if reply is None:
            raise ChildError(f"{self.name}: the server stopped")
        if "error" in reply:
            problem = reply["error"]
            raise ChildError(f"{self.name}: {problem.get('message') if isinstance(problem, dict) else problem}")
        return reply.get("result", {})

    def _send(self, message: dict[str, Any]) -> None:
        try:
            write_message(message, self._process.stdin, self._write_lock)
        except (OSError, ValueError):  # the pipe is broken or already closed
            raise ChildError(f"{self.name}: the server stopped") from None

    def _read(self, stdout) -> None:
        try:
            for message in read_messages(stdout):
                if message is not None:
                    self._dispatch(message)
        except (OSError, ValueError):
            pass  # the stream was closed under the reader: the child is gone either way
        finally:
            with self._lock:
                self._stopped = True
                waiting = list(self._waiters.values())
            for waiter in waiting:
                waiter.put(None)

    def _dispatch(self, message: dict[str, Any]) -> None:
        method, msg_id = message.get("method"), message.get("id")
        if method is None:
            if isinstance(msg_id, int):
                with self._lock:
                    waiter = self._waiters.pop(msg_id, None)
                if waiter is not None:
                    waiter.put(message)
        elif msg_id is not None:
            # This client offers a child no method: sampling, roots and the rest are the host's.
            with contextlib.suppress(ChildError):
                self._send(error(msg_id, METHOD_NOT_FOUND, f"Method not found: {method}"))
        elif method == "notifications/progress":
            with self._lock:
                relays = list(self._progress.values())
            for relay in relays:
                with contextlib.suppress(Exception):  # a relay that fails must not stop the reader
                    relay(message)
