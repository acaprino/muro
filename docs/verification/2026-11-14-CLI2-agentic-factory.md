# CLI2 — agentic factory: MCP server, OpenAI-compatible agent, init/install/absorb (2026-11-14)

Linux container (cloud session), Python 3.13, Claude Code CLI 2.1.325 on PATH;
Codex, OpenCode and Pi CLIs absent. Change: ADR-0022 (`muro/mcp.py`,
`muro/agent.py`, `muro/scaffold.py`, `muro/installer.py`, CLI wiring).

## Checks run

| Check | Result |
| --- | --- |
| `python -m pytest -q tests/test_agentic.py tests/test_cli.py` | 27 passed |
| MCP over a pipe: initialize → tools/list → tools/call validate → unknown tool → unknown method | serverInfo muro; 11 tools; validate OK/isError false; unknown tool isError true; -32601 |
| **Live MCP in a real host**: headless `claude -p` with `--mcp-config` starting `python -m muro mcp`, `--strict-mcp-config`, allowed tool `mcp__muro__validate` | The session called the tool and reported "OK: capabilities and ROUTER.md valid" |
| **Live install (claude-code)**: `muro install <staged marionette adapter> --harness claude-code --home <fresh dir>` | exit 0; `claude plugin marketplace add` + `claude plugin install marionette@marionette` ran under `CLAUDE_CONFIG_DIR`; plugin cache holds `marionette/marionette/0.2.0` and `installed_plugins.json` |
| `muro init` on a local MIT fixture repo (tags v1.0.0, v1.2.0, v2.0.0-rc1) | pins v1.2.0 (rc skipped), 40-char commit, gate passes; refuses empty `--select` and an existing manifest; `--head` pins HEAD |

## New tests (`tests/test_agentic.py`, 15)

Scaffold: newest-release pinning with prereleases skipped, curation and
overwrite refusals, head pin. MCP: full exchange in a subprocess. Agent
runner against a scripted local endpoint: review writes REVIEW.md; a rejected
path gets one repair round and succeeds; a JSON-less answer fails after the
configured rounds; plain http off localhost refused; key read from environment
only; path traversal rejected before any write; fenced JSON tolerated.
Installer: opencode config edit (idempotent), missing host CLI refusal naming
INSTALL.md, marketplace names read from the adapter, unbuilt directory refused.

## Not executed

- `muro agent` against a real LLM endpoint (no API key in this environment):
  request/response mechanics are proven against the scripted endpoint only; no
  claim is made about any model's intake or harmonization quality.
- `muro install` on real Codex and Pi hosts (CLIs absent here): their recipes
  are the adapters' own INSTALL.md commands, constructed and unit-tested but
  not run live. OpenCode's config edit ran on a temp file, not a live OpenCode.
- `muro absorb` end to end (it chains the unexecuted agent steps).
- Windows.
