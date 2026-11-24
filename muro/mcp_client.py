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
from .argv_template import batch_refusal, is_batch_program
from .jsonrpc import METHOD_NOT_FOUND, PROTOCOL_VERSION, error, read_messages, write_message

CLOSE_WAIT = 2  # seconds a child gets to exit by itself once its input is closed
KILL_WAIT = 5   # seconds a killed child gets to disappear
DRAIN_WAIT = 1  # seconds the reader gets to deliver what a child wrote once the child is gone


class ChildError(RuntimeError):
    """A child server could not start, refused a call, stopped, or did not answer in time."""


class ChildTimeout(ChildError):
    """A child server did not answer within the time a caller allowed."""


def resolve_program(name: str) -> str | None:
    """The program `name` as an absolute path, or None when there is none.

    A bare name is looked for in the absolute entries of PATH and never in the working directory, which
    Windows searches first and where a project could plant a program under the name of a real one: a name
    that starts a command or a child server is resolved here and never left to the system (`kill_tree` starts
    taskkill by its own path instead). A name with a directory part is used as it is when it is absolute and
    refused when it is not."""
    if os.path.dirname(name):
        return name if os.path.isabs(name) else None
    extensions = ([ext for ext in os.environ.get("PATHEXT", ".COM;.EXE;.BAT;.CMD").split(os.pathsep) if ext]
                  if os.name == "nt" else [])
    # cmd.exe takes a file as it is only when its extension is in PATHEXT, and otherwise adds each extension.
    files = [name] if not extensions or name.upper().endswith(tuple(ext.upper() for ext in extensions)) else []
    files += [name + ext for ext in extensions]
    for entry in filter(os.path.isabs, os.environ.get("PATH", "").split(os.pathsep)):  # not "", ".", or any relative
        for file in files:
            path = os.path.join(entry, file)
            if os.path.isfile(path) and os.access(path, os.X_OK):
                return path
    return None


def kill_tree(process: subprocess.Popen) -> None:
    """Kill `process` and what it started; on POSIX it must have been started in its own session."""
    if sys.platform == "win32":
        system32 = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32")  # by path: see resolve_program
        subprocess.run([os.path.join(system32, "taskkill.exe"), "/T", "/F", "/PID", str(process.pid)],
                       capture_output=True, check=False)
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
        # On POSIX poll() lags behind an exit while the watcher waits; _stopped is set before a caller sees the error.
        return self._process is not None and not self._stopped and self._process.poll() is None

    def start(self, timeout: float | None = None) -> None:
        command = self._launch["command"]
        program = resolve_program(command)
        if program is None:
            raise ChildError(f"{self.name}: program not found: {command}")
        if is_batch_program(program):  # cmd.exe would re-parse the arguments, which hold `<package_root>` paths
            raise ChildError(batch_refusal(command))
        with self._lock:  # a close() comes before the process, which then never starts, or after it, and stops it
            if self._closed:
                raise ChildError(f"{self.name}: the server stopped")
            try:
                self._process = subprocess.Popen(
                    [program, *self._launch["args"]], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                    text=True, encoding="utf-8", errors="replace", cwd=self._cwd,
                    env={**os.environ, **self._launch["env"]}, start_new_session=True)  # ignored on Windows
            except FileNotFoundError:
                raise ChildError(f"{self.name}: program not found: {command}") from None
            except OSError as exc:
                raise ChildError(f"{self.name}: cannot start {command}: {exc}") from None
            self._stopped = False
        self._reader = threading.Thread(target=self._read, args=(self._process.stdout,), daemon=True)
        self._reader.start()
        # A grandchild that keeps the output pipe open would hide the child's exit from the reader.
        threading.Thread(target=self._watch, args=(self._process,), daemon=True).start()
        try:
            self._request("initialize", {
                "protocolVersion": PROTOCOL_VERSION, "capabilities": {},
                "clientInfo": {"name": "muro-package-server", "version": __version__}}, timeout=timeout)
            # A child that already stopped is reported by the first call, not here.
            with contextlib.suppress(ChildError):
                self._send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        except ChildError:
            self.close()
            raise

    def tools(self, timeout: float | None = None) -> list[dict[str, Any]]:
        if self._tools is None:
            tools: list[dict[str, Any]] = []
            params: dict[str, Any] = {}
            while True:
                # shortcut: each page gets the whole timeout, upgrade if a child pages its list slowly
                page = self._request("tools/list", params, timeout=timeout)
                tools += page.get("tools", [])
                if not page.get("nextCursor"):
                    break
                params = {"cursor": page["nextCursor"]}
            self._tools = tools
        return self._tools

    def call(self, tool: str, arguments: dict[str, Any],
             on_progress: Callable[[dict[str, Any]], None] | None = None,
             timeout: float | None = None, meta: dict[str, Any] | None = None,
             on_id: Callable[[int], None] | None = None) -> dict[str, Any]:
        """`on_id` receives the id the child knows this call by, before the call is sent: what `cancel` needs."""
        params: dict[str, Any] = {"name": tool, "arguments": arguments}
        if meta is not None:
            params["_meta"] = meta
        return self._request("tools/call", params, on_progress, timeout, on_id)

    def cancel(self, msg_id: int) -> None:
        """Tell the child the call is cancelled and stop waiting for it: a child that follows MCP may send no answer."""
        with contextlib.suppress(ChildError):
            self._send({"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": msg_id}})
        with self._lock:
            waiter = self._waiters.pop(msg_id, None)
        if waiter is not None:
            waiter.put({"error": {"message": "cancelled"}})  # an answer that arrives later finds no one waiting

    def cancel_all(self) -> None:
        with self._lock:
            pending = list(self._waiters)
        for msg_id in pending:
            self.cancel(msg_id)

    def close(self) -> None:
        with self._lock:
            process, was_closed = self._process, self._closed
            self._closed = True
        if process is None or was_closed:
            return
        # A write blocked on a child that reads nothing holds this lock and the stream's own: closing
        # stdin would wait behind it, so a busy child is killed first and stdin is closed afterwards.
        idle = self._write_lock.acquire(blocking=False)
        if idle:
            try:
                with contextlib.suppress(OSError, ValueError):
                    process.stdin.close()
            finally:
                self._write_lock.release()
            with contextlib.suppress(subprocess.TimeoutExpired):
                process.wait(CLOSE_WAIT)
        kill_tree(process)
        with contextlib.suppress(subprocess.TimeoutExpired):
            process.wait(KILL_WAIT)
        if not idle and process.poll() is not None:
            with contextlib.suppress(OSError, ValueError):
                process.stdin.close()  # the blocked write has failed with the child gone
        self._stop()
        self._reader.join(DRAIN_WAIT)

    def _request(self, method: str, params: dict[str, Any],
                 on_progress: Callable[[dict[str, Any]], None] | None = None,
                 timeout: float | None = None, on_id: Callable[[int], None] | None = None) -> dict[str, Any]:
        waiter: queue.Queue = queue.Queue()
        with self._lock:
            if self._stopped:
                raise ChildError(f"{self.name}: the server stopped")
            msg_id = next(self._ids)
            self._waiters[msg_id] = waiter
            if on_progress is not None:
                self._progress[msg_id] = on_progress
        try:
            if on_id is not None:
                on_id(msg_id)
            self._send({"jsonrpc": "2.0", "id": msg_id, "method": method, "params": params})
            try:
                reply = waiter.get(timeout=timeout)
            except queue.Empty:
                raise ChildTimeout(f"{self.name}: no answer after {timeout:g} seconds") from None
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
            self._stop()  # so `alive` is false when the caller sees the error
            raise ChildError(f"{self.name}: the server stopped") from None

    def _read(self, stdout) -> None:
        try:
            for message in read_messages(stdout):
                if message is not None:
                    self._dispatch(message)
        except (OSError, ValueError):
            pass  # the stream was closed under the reader: the child is gone either way
        finally:
            self._stop()
            with contextlib.suppress(OSError, ValueError):
                stdout.close()

    def _watch(self, process: subprocess.Popen) -> None:
        process.wait()
        self._reader.join(DRAIN_WAIT)  # an answer written just before the exit is still delivered
        self._stop()

    def _stop(self) -> None:
        """No answer will come any more: refuse new requests and wake every waiting call."""
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
