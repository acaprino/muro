"""Line-delimited JSON-RPC 2.0 messages, as the MCP stdio transport writes and reads them.

One message is one line of JSON on a stream. Every MCP server and client of the factory uses
these helpers, so a reply has one shape and one byte layout wherever it is made.
"""
from __future__ import annotations

import contextlib
import json
import sys
import threading
from typing import Any, Iterator, TextIO

PARSE_ERROR = -32700
METHOD_NOT_FOUND = -32601
PROTOCOL_VERSION = "2024-11-05"


def write_message(message: dict[str, Any], stream: TextIO | None = None,
                  lock: threading.Lock | None = None) -> None:
    """Write one message as one flushed line; `lock` is held for the write and the flush."""
    line = json.dumps(message, ensure_ascii=False) + "\n"
    out = stream if stream is not None else sys.stdout
    with lock or contextlib.nullcontext():
        out.write(line)
        out.flush()


def read_messages(stream: TextIO) -> Iterator[dict[str, Any] | None]:
    """One item per nonblank line of `stream`: the message, or None for a line that is not a JSON object."""
    for line in stream:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            yield None
            continue
        yield message if isinstance(message, dict) else None


def result(msg_id: Any, payload: dict[str, Any]) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": msg_id, "result": payload}


def error(msg_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}}


def tool_result(text: str, is_error: bool = False) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": text}], "isError": is_error}
