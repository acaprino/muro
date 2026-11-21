# Absorbed MCP servers: tests and live host runs (2026-11-21)

Record for [ADR-0030](../adr/ADR-0030-absorbed-mcp-servers.md): a release
registers the MCP server a source ships, started from its packaged files.

## What was built for the runs

A throwaway package outside the repository, slug `paper-crane`, command
`crane`, one source `demo` (a local Git repository with `LICENSE`, `SKILL.md`
and `server.py`). `server.py` is a stub MCP server over stdio with one tool,
`crane_marker`, which returns `CRANE-MARKER-7391`, the absolute path of the
file it runs from and the value of `CRANE_HOME`. Its `delivery.json` declares:

```json
{"name": "crane", "source": "demo",
 "run": ["python", "<package_root>/scripts/demo/server.py"],
 "env": {"CRANE_HOME": "<package_root>/scripts/demo"}}
```

Built with `python muro_build.py --manifest <package>/sources.json --build
--out <scratch>` at commit `b183df2`. No real source's server was run.

## Live runs

One session per host, started one at a time, on Windows 11. Sample size: one
call per host.

| Host | How the release was loaded | Result |
| --- | --- | --- |
| Claude Code 2.1.330, `claude-haiku-5-5` | `claude -p … --plugin-dir <adapters/claude-code> --permission-mode dontAsk --allowedTools mcp__plugin_paper-crane_crane__crane_marker --setting-sources project,local --no-session-persistence --max-budget-usd 1` | Init event: server `plugin:paper-crane:crane`, `connected`, source `plugin`; tool `mcp__plugin_paper-crane_crane__crane_marker`. The model called it once and got the marker; `file` was `<adapter>\skills\crane\scripts\demo\server.py` and `home` the expanded `${CLAUDE_PLUGIN_ROOT}` path. 2 turns, 0 denials, 0.019 USD |
| Codex 0.169.0 | `muro install <adapters/codex> --harness codex --home <scratch home>` (runs `codex plugin marketplace add` and `codex plugin add paper-crane@paper-crane`), then `codex mcp list` | `crane`, command `python`, argument `<scratch home>\plugins\cache\paper-crane\paper-crane\0.1.0/skills/crane/scripts/demo/server.py`, env `CRANE_HOME`, `PLUGIN_ROOT`, `PLUGIN_DATA`, cwd the installed plugin root, status `enabled` |
| Pi 1.4.0, `openrouter/moonshotai/kimi-k2.6` | `pi install <adapters/pi>` with `PI_CODING_AGENT_DIR` on a scratch home, then `pi -p … --no-session --mode json` | Tool `mcp__crane__crane_marker` called (through Pi's `codemode`); the marker came back with `file` under `<adapter>\skills\crane\scripts\demo` |
| OpenCode 2.2.5, `thinkingmachines/inkling-2-mini` | a scratch project's `opencode.json` with `{"plugins": ["file:///<adapters/opencode>"]}`, then `opencode run --standalone --auto …` | `tools.crane.crane_marker()` executed; the marker came back with `file` under `<adapter>\skills\crane\scripts\demo` |
| Hermes v0.23.1 | not installed, not run in a session (below) | `hermes plugins validate <adapters/hermes-mcp>`: "plugin.json parses (Agent Plugins v1)", "Validation passed". Hermes's own loader (`hermes_cli.agent_plugins.load_agent_plugin`) on the same folder: no diagnostics, server `crane` translated to command `python`, argument `<package>/scripts/demo/server.py`, cwd the package root, env with `CRANE_HOME` expanded |

## Findings

- **Claude Code and `--strict-mcp-config`.** A first Claude Code run with
  `--strict-mcp-config` loaded the plugin and its skill and no MCP server at
  all: that flag also drops the servers a plugin registers. The recipe in
  `AGENTS.md` adds it "to test the package alone"; a package with a server
  cannot be tested with it. The run above was made without it, so the owner's
  own connectors were loaded beside the plugin's server.
- **`pi mcp list` and `opencode mcp list` do not show these servers.** Both
  commands read the configuration files only; a server registered by an
  extension or a plugin exists inside a session. Pi's documentation says so
  ("Shell commands do not load extensions").
- **Working directory.** Codex and Hermes start a plugin's server with the
  plugin root as working directory. A server that writes relative to its
  working directory writes inside the installed plugin on those hosts. The
  declaration has no `cwd`; a source with such a server needs its capability
  to pass an explicit output folder.
- **`muro install --harness pi` fails on Windows** with `[WinError 2]`: the
  installer starts `pi` without resolving the npm shim (`pi.cmd`). Not caused
  by this change and not fixed here; Pi was installed with `pi install`
  directly.

## Tests

`tests/test_mcp_servers.py` (36 tests): the declaration's refusals; the files
written for the five hosts; the build refusing a declared path the release
does not carry; a stub started from the emitted Claude Code entry with the
plugin root in a path with spaces, an accent, `&` and `%`, and with `$`, `%`
and a backslash in an `env` value; the generated Pi and OpenCode modules
executed with Node against fake host objects; the native Hermes plugin
byte-equal with and without servers; a release without the declaration writes
none of these files; no real source is named in `muro/` or `prompts/`.

Full suite, GitHub Actions `Tests` workflow on `develop`: run 44947854037 at
`b183df2` failed on two expectations of `tests/test_project_file.py` that
listed the four earlier forms (`muro project info` counts decisions by every
form, so `became` gains `mcp-server`). Fixed in `26add45`; the result of the
run on that commit is recorded at the end of this file.

## Not run

- Codex: no session called the tool. The scratch home has no login, so the
  check stops at `codex mcp list`. The installed Codex is 0.169.0; the form was
  read in a later source tree and worked on this version.
- Hermes: the portable package was not installed and no session used it. With
  `HERMES_HOME` on a scratch folder Hermes answers "no dependency environment
  is committed for this install; run `hermes pm repair`", and installing into
  the owner's home would change their configuration. Validation and the
  loader prove that Hermes accepts the package and how it would start the
  server, not that a session reaches the tool. `INSTALL.md` for Hermes still
  carries no install command.
- No host was tested with a server already configured under the same name.
- No real absorbed server was started on any host. The first one is the
  subject of the supads intake.
- The desktop app was not run; it has no label for the new form.
- Sessions were ephemeral where the host allows it (Claude Code, Pi). One
  short session remains in the owner's OpenCode history. The session folder
  Claude Code left under `~/.claude/projects/` was deleted.
