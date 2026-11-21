---
adr_id: ADR-0030
version: 1
title: A source's MCP server is absorbed and registered by the release
status: Proposed
author: Claude Code
scope:
  paths: [muro/delivery.py, muro/adapters.py, muro/native_policy.py, muro/release.py, prompts/delivery.md, prompts/intake.md, delivery.json]
  modules: []
  domains: [delivery, adapters, intake]
governs_symbols: []
depends_on: [ADR-0007, ADR-0015, ADR-0016, ADR-0017, ADR-0019, ADR-0026, ADR-0027]
created_from_task: supads-package
proposed_on: 2026-11-21
accepted_on: null
---

# ADR-0030 — A source's MCP server is absorbed and registered by the release

Date: 2026-11-21. Status: the owner approved this design before any code
("Approvo"). The implementation and what was run are in the amendment at the
end; the explanatory text is not separately approved.

## Context

The owner asked for a new package, `supads`, from two sources. One of them,
superCMO-skills v0.1.27 (Apache-2.0), is 23 skills that do their work through
the tools of an MCP server (`image_generate`, `setup_status` and others). The
source ships that server in the same repository (`scripts/supercmo_skills/`)
and registers it on its hosts as `uvx supercmo-skills@0.1.27`, which downloads
the published package from PyPI.

Muro has no form for this. `delivery.json` knows `capability`, `always-on`,
`hook` and `dropped`; a release registers session text and hooks and nothing
else. A capability's `tools` field names logical operations for the host AI to
map to tools it already has. So today the skills would be absorbed and their
server would not: the capability could only install the original server as a
runtime dependency (ADR-0007), from PyPI, outside the pinned commit and outside
the license gate.

## Owner statements

Asked how the server should reach whoever installs supads, with "runtime
dependency installed by the setup capability" offered as the recommended
option: "Secondo me Muro dovrebbe inglobare anche server mcp".

Offered three ways to do that (A: the server's code is selected, packaged and
registered by the plugin; B: only the source's own `uvx` command is registered;
C: one Muro server that proxies every absorbed server): "a".

## Decision

1. **The server's code travels with its source.** The intake selects the files
   the server runs from, like any other file the method uses at run time
   (ADR-0026). What runs is the pinned commit the license gate verified.

2. **`delivery.json` declares the server.** A fifth form, `mcp-server`, and a
   top-level `mcp_servers` array:

   ```json
   {"decisions": [
      {"source": "<source id>", "content": "<the server and what its tools do>",
       "form": "mcp-server", "targets": ["<capability whose steps call its tools>"],
       "reason": "<why it registers by itself, and what every session pays>"}],
    "mcp_servers": [
      {"name": "<server name>", "source": "<source id>",
       "run": ["python", "-m", "<module>"],
       "env": {"PYTHONPATH": "<package_root>/scripts/<source-id>/<path>"}}]}
   ```

   `run` is literal argv, with the rules a hook's `run` already has (one shared
   check, not a second copy). `env` is optional: what the server needs to find
   its own packaged files, with `<package_root>` for them. Keys and other
   secrets are never written there; the source's own way of delivering them is
   carried as content. The declaration has no `host`: a server is the same
   program everywhere, and each adapter turns the one declaration into its
   host's form (owner principle of 2026-11-14).

3. **Each adapter registers it in its host's own form.** Read from each host's
   documentation or source on 2026-11-21 by a delegated research; none of it
   has been run:

   | Host | Form | Root of the packaged files |
   | --- | --- | --- |
   | Claude Code | `.mcp.json` at the plugin root | `${CLAUDE_PLUGIN_ROOT}` in `args` and `env` |
   | Codex | root `mcp.json` beside the root `plugin.json` the adapter already writes; `"type": "stdio"` | `${PLUGIN_ROOT}` in `args` and `env` |
   | Pi | `pi.registerMcpServer(name, {...})` in the generated extension | absolute path built by the extension |
   | OpenCode | `ctx.mcp.transform(...)` in the generated plugin (V2 API) | absolute path built by the plugin |
   | Hermes | none in the native `register(ctx)` API the adapter uses | — |

   A host joins the list of registering hosts only after the registration was
   run on it. All five are installed on the owner's machine. Codex there is
   0.169.0 and the form above was read in a later source tree, so Codex is the
   likeliest to differ.

4. **Python validates and emits, and decides nothing.** `validate_delivery`
   checks the shape, that the server's source exists and has an `mcp-server`
   decision, that every such decision has a server, and that names are unique.
   The build refuses a server whose `run` or `env` names a packaged path that
   is not in the release. The packaged runtime validates the same document
   with the same function. A package without the declaration registers no
   server. The whole document already takes part in `catalog_digest`.

5. **The judgment is the AI's, with the cost stated.** `prompts/delivery.md`
   gains the form. A registered server is paid for in every session: the host
   loads its tool descriptions whether or not the task is about them. The
   decision's reason states that cost. `prompts/intake.md` says that a source's
   own MCP server is selected and declared, and that the original's
   registration (its `.mcp.json`, its installer) is evidence, not something to
   ship.

6. **The original steps aside by name.** `INSTALL.md` lists each registered
   server and says that a server with the same tools already configured on the
   host must be removed: on Pi and Hermes a same-name server in the user's own
   configuration wins over the plugin's, and on every host two copies offer the
   same tools twice.

## What this does not do

- It does not run a remote (HTTP) server, start anything at build or intake, or
  write a host's configuration: the server is registered by the plugin's own
  files and started by the host.
- It does not install the server's dependencies. Those stay runtime
  dependencies under ADR-0007.
- It does not repair a source. The absorbed server's own limits are recorded
  as they are (below).
- `GUIDE.html` shows a server decision under its source, like every other
  decision, and no separate list of servers. The desktop app has no label for
  the form yet: it shows its raw name, `mcp-server`, and does not count it in
  "What it became".
- Tool names are the host's: Claude Code exposes a plugin's tools as
  `mcp__plugin_<plugin>_<server>__<tool>`. Capability bodies name a tool as the
  source does and leave the mapping to the host AI, as `tools` already does.

## Open questions for the owner

1. **Hermes.** The native adapter cannot register a server. Either the release
   says so in `INSTALL.md` and the server is added on Hermes by the user (one
   entry in `config.yaml`), or the Hermes adapter is rebuilt as a portable
   package, which the research found possible and did not verify. ADR-0026
   forbids a capability that hands the host a part of the method to do by hand,
   and a capability that edits a host's MCP configuration is close to
   installing the plugin itself (ADR-0007). Proposal: first version registers
   on the four other hosts and states the Hermes limit; the portable package is
   a later decision.
2. **Verification needs a push.** The full suite runs on GitHub Actions only.
   Running it means a commit on `develop` and a push, which need the owner's
   request.

## What is known about the first server it will carry

Read in the pinned source, not executed:

- The server and its tools import only the standard library, except the four
  calendar tools, which need `icalendar` and `python-dateutil`.
- `calendar_store.py` imports `fcntl`, which Windows does not have. The import
  is guarded, so the server starts; the calendar tools answer with the
  source's "dependencies missing" hint on Windows whatever is installed.
- It registers about 20 tools. Their descriptions come from a 53 KB file: up
  to roughly 13,000 tokens in a session on a host that loads every schema at
  start. Not measured on any host.
- It sends opt-out anonymous telemetry (`TELEMETRY.md`) and its setup offers a
  paid managed key before bring-your-own keys. Both are carried as content.

## Verification planned

- `tests/test_mcp_servers.py`, with a stub stdio server and no name of any real
  source: every validation refusal; the file each adapter writes; the stub
  started from the emitted Claude Code and Codex entries with the plugin root
  in a path with spaces; a release with no declaration registers nothing; a
  declared path missing from the release fails the build.
- One live session per host on the staged supads release, started one at a
  time, with the owner's own MCP servers excluded (`--strict-mcp-config` on
  Claude Code), recorded in `docs/verification/` with what was not run.

## Amendment: implementation (2026-11-21)

The owner's answers to the two open questions: on Hermes, "Rifai l'adapter
Hermes ora"; on verification, commits and a push on `develop` are allowed.

**Hermes.** Read in the installed Hermes v0.23.1 before writing code
(`hermes_cli/plugin_validate.py`, `hermes_cli/agent_plugins.py`): a folder
with `plugin.yaml` is a native plugin and "the native plugin.yaml always
wins"; its `mcp.json` is not read. Only a package whose one manifest is
`plugin.json` (Agent Plugins v1) registers servers, and such a package has no
`register(ctx)`, so it cannot deliver the session policy. Replacing the native
adapter with a portable one would have traded a working policy for the server.
Implementation choice, not the owner's wording: the native adapter stays as it
is, and a release that declares servers also writes `adapters/hermes-mcp`, a
portable package with `plugin.json`, `mcp.json` and its own copy of
`scripts/<source-id>/` for each serving source (an installed package is its own
root). A test holds the native plugin byte-equal with and without servers.

**Other hosts, as implemented.** Claude Code: `.mcp.json` at the adapter root.
Codex: `mcp.json` beside the root Agent Plugins `plugin.json`. Pi: a second
extension, `extensions/mcp.js`, calling `pi.registerMcpServer` (present in the
installed 1.4.0). OpenCode: `ctx.mcp.transform` with `editor.set(name, {type:
"local", command, environment})` (the editor's methods were read in the
installed 2.2.5). Pi and OpenCode give no root variable inside a server entry,
so the generated module resolves the package root of its own install.

**Where the knowledge lives.** `muro/delivery.py`: validation, the one
`<package_root>` substitution (`server_launch`), the two file forms and the
packaged-path check. The adapter modules only write their host's file. The
hook `run` check is shared with servers (`_run_errors`). The packaged-path
check applies to servers only; a hook wiring that names a missing file still
builds, as before.

**After the whole-branch review (same day).** A fresh reviewer found inputs
the first version accepted and shipped broken. Now refused: a `<package_root>`
path as the program (no host form substitutes it, and Codex and Hermes accept
only a bare program name); the env names `PLUGIN_ROOT` and `PLUGIN_DATA`
(Hermes drops a server that sets them); a packaged path outside
`scripts/<the server's source>/`, with `..`, or missing from the release,
wherever it stands in a value (alone, after `--option=`, in a list joined by
`;` or `:`). The Hermes companion carries `NOTICE.md` and the license of each
serving source: it is installed on its own and ships absorbed files. The
generated Pi and OpenCode modules substitute the root with a function, because
`replaceAll` reads `$$`, `$&` and `$'` in a replacement string and an install
path may hold them. Left as they are, recorded: a double quote in a server
argument is refused though no shell is involved; a `.cmd` or `.bat` program is
accepted for a server and refused for a hook only at run time.

**Verified.** `tests/test_mcp_servers.py`: the declaration's refusals; the
files written for all five hosts; a stub server started from the emitted
Claude Code entry with the plugin root in a path with spaces, an accent, `&`
and `%`; the generated Pi and OpenCode modules executed with Node against fake
host objects; a release without the declaration writes none of these files.
Fixtures prove mechanics only.

**Live, with a stub server (2026-11-21).** A session called the server's tool
on Claude Code 2.1.330, Pi 1.4.0 and OpenCode 2.2.5. Codex 0.169.0 lists the
server as enabled after the plugin is installed; no Codex session called it.
Hermes v0.23.1 validates the portable package and its own loader translates
the server; it was not installed and no Hermes session was run. No real
absorbed server has been started on any host. Details and what was not run:
`docs/verification/2026-11-21-absorbed-mcp-servers.md`.
