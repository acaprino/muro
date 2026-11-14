"""A stdio MCP server exposing the factory's operations to a host agent.

The host AI (Claude Code, Codex, or any MCP client) keeps the judgment
(ADR-0008): the prepare_* tools stage PROMPT.md and evidence on disk for the
host to read, the host writes the resulting artifacts into the package with
its own file tools, and validate/check_sources/build verify and package them.
No tool here calls an LLM. Transport: newline-delimited JSON-RPC 2.0 on
stdin/stdout, one message per line.
"""
from __future__ import annotations

import io
import json
import sys
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from typing import Any, Callable

from . import __version__

_PREPARED = ("Read PROMPT.md and the evidence it names in the returned directory, do the "
             "judgment yourself, write the resulting files into the package directory with "
             "your own file tools, then call validate.")


def _tool(name: str, description: str, properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {"name": name, "description": description,
            "inputSchema": {"type": "object", "properties": properties, "required": required}}


_MANIFEST = {"manifest": {"type": "string", "description": "Path to the package's sources.json"}}


def tool_definitions() -> list[dict[str, Any]]:
    return [
        _tool("validate", "Validate the package's capabilities, ROUTER.md, entries and delivery.", _MANIFEST, []),
        _tool("check_sources", "Verify pinned sources, licenses and plugin identity (contacts the pinned remotes).",
              {**_MANIFEST, "offline_pins": {"type": "boolean"}}, []),
        _tool("build", "Build a release of the package.",
              {**_MANIFEST, "out": {"type": "string", "description": "Stage under this folder instead of dist/"}}, []),
        _tool("baseline", "Report, read-only, how each source pin stands against its upstream (JSON).", _MANIFEST, []),
        _tool("prepare_intake", f"Stage a source's intake workbench. {_PREPARED}",
              {**_MANIFEST, "source_id": {"type": "string"}}, ["source_id"]),
        _tool("prepare_harmonize", f"Stage the harmonization prompt. {_PREPARED}", _MANIFEST, []),
        _tool("prepare_review", f"Stage the decisions-review prompt; write REVIEW.md into the staged directory. {_PREPARED}",
              _MANIFEST, []),
        _tool("eval_prepare", "Stage the routing eval prompt and cases, without the expectations.", _MANIFEST, []),
        _tool("eval_score", "Score eval decisions (a JSON file you wrote) against eval-cases.json.",
              {**_MANIFEST, "decisions": {"type": "string"}}, ["decisions"]),
        _tool("init_package",
              "Scaffold a new single-source package from a repository link: resolves the pin "
              "(newest non-prerelease tag, or --head), verifies the license gate, writes sources.json. "
              "The goal and the curated selection are yours to supply.",
              {"directory": {"type": "string"}, "repo_url": {"type": "string"},
               "license": {"type": "string", "description": "MIT or Apache-2.0, as the source's LICENSE says"},
               "goal": {"type": "string", "description": "The source-specific intake goal"},
               "select": {"type": "array", "items": {"type": "string"}, "description": "Selected paths/patterns"},
               "slug": {"type": "string"}, "release": {"type": "string"}, "head": {"type": "boolean"}},
              ["directory", "repo_url", "license", "goal", "select"]),
        _tool("install_adapter",
              "Install a built host adapter into a harness home, with the host's own command "
              "(claude-code, codex, pi) or config edit (opencode). The home path is the caller's.",
              {"adapter_dir": {"type": "string"}, "harness": {"type": "string"}, "home": {"type": "string"}},
              ["adapter_dir", "harness", "home"]),
    ]


def _captured(fn: Callable[[], int]) -> tuple[int, str]:
    buffer = io.StringIO()
    with redirect_stdout(buffer), redirect_stderr(buffer):
        try:
            code = fn()
        except (OSError, ValueError) as exc:
            print(exc, file=sys.stderr)
            code = 1
    return code, buffer.getvalue().strip()


def call_tool(name: str, arguments: dict[str, Any], default_manifest: Path) -> tuple[int, str]:
    from . import cli

    manifest_arg = Path(arguments.get("manifest") or default_manifest)

    def with_manifest(run: Callable[[dict, Path, Path], int]) -> tuple[int, str]:
        def body() -> int:
            loaded = cli._read_manifest(manifest_arg)
            if loaded is None:
                return 1
            manifest, manifest_path, project_root = loaded
            return run(manifest, manifest_path, project_root)
        return _captured(body)

    if name == "validate":
        return with_manifest(lambda m, _p, root: cli._run_validate(m, root))
    if name == "check_sources":
        return with_manifest(lambda m, _p, root: cli._run_check_sources(m, root, bool(arguments.get("offline_pins"))))
    if name == "build":
        out = Path(arguments["out"]) if arguments.get("out") else None
        return with_manifest(lambda _m, path, root: cli._run_build(path, root, out, []))
    if name == "baseline":
        return with_manifest(lambda m, _p, root: cli._run_baseline(m, root, as_json=True))
    if name == "prepare_intake":
        return with_manifest(lambda m, _p, root: cli._run_intake(m, root, str(arguments["source_id"])))
    if name == "prepare_harmonize":
        return with_manifest(lambda _m, _p, root: cli._run_harmonize(root))
    if name == "prepare_review":
        return with_manifest(lambda _m, _p, root: cli._run_review(root))
    if name == "eval_prepare":
        return with_manifest(lambda _m, _p, root: cli._run_eval(root, True, None))
    if name == "eval_score":
        return with_manifest(lambda _m, _p, root: cli._run_eval(root, False, Path(arguments["decisions"])))
    if name == "init_package":
        def init_body() -> int:
            from .scaffold import scaffold_package
            path = scaffold_package(
                Path(arguments["directory"]), str(arguments["repo_url"]),
                slug=arguments.get("slug"), license_name=str(arguments["license"]),
                goal=str(arguments["goal"]), selected=[str(s) for s in arguments["select"]],
                release=arguments.get("release"), head=bool(arguments.get("head")))
            print(path)
            return 0
        return _captured(init_body)
    if name == "install_adapter":
        def install_body() -> int:
            from .installer import install_adapter
            for line in install_adapter(Path(arguments["adapter_dir"]),
                                        str(arguments["harness"]), Path(arguments["home"])):
                print(line)
            return 0
        return _captured(install_body)
    return 1, f"Unknown tool: {name}"


def _write(message: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def serve(default_manifest: Path) -> int:
    """Serve MCP on stdio until stdin closes."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            _write({"jsonrpc": "2.0", "id": None,
                    "error": {"code": -32700, "message": "Parse error"}})
            continue
        method = message.get("method")
        msg_id = message.get("id")
        if method and method.startswith("notifications/"):
            continue
        if method == "initialize":
            params = message.get("params") or {}
            _write({"jsonrpc": "2.0", "id": msg_id, "result": {
                "protocolVersion": params.get("protocolVersion") or "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "muro", "version": __version__},
            }})
            continue
        if method == "ping":
            _write({"jsonrpc": "2.0", "id": msg_id, "result": {}})
            continue
        if method == "tools/list":
            _write({"jsonrpc": "2.0", "id": msg_id, "result": {"tools": tool_definitions()}})
            continue
        if method == "tools/call":
            params = message.get("params") or {}
            name = params.get("name", "")
            arguments = params.get("arguments") or {}
            try:
                code, text = call_tool(name, arguments, default_manifest)
            except Exception as exc:  # a tool bug must not kill the server
                code, text = 1, f"{type(exc).__name__}: {exc}"
            _write({"jsonrpc": "2.0", "id": msg_id, "result": {
                "content": [{"type": "text", "text": text or f"exit {code}"}],
                "isError": code != 0,
            }})
            continue
        if msg_id is not None:
            _write({"jsonrpc": "2.0", "id": msg_id,
                    "error": {"code": -32601, "message": f"Method not found: {method}"}})
    return 0
