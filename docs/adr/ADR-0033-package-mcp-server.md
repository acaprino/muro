---
adr_id: ADR-0033
version: 1
title: A package's own MCP server, decided with the owner at harmonization
status: Proposed
author: Claude Code
scope:
  paths: [muro/delivery.py, muro/argv_template.py, muro/jsonrpc.py, muro/mcp_client.py, muro/package_server.py, muro/mcp.py, muro/adapters.py, muro/release.py, muro/runtime.py, prompts/harmonizer.md, prompts/delivery.md, prompts/intake.md, delivery.json]
  modules: []
  domains: [delivery, harmonization, adapters, intake]
governs_symbols: []
depends_on: [ADR-0015, ADR-0017, ADR-0026, ADR-0030]
created_from_task: package-mcp-server
proposed_on: 2026-11-23
accepted_on: null
---

# ADR-0033 — A package's own MCP server, decided with the owner at harmonization

Date: 2026-11-23. Status: Proposed. The owner chose the approach ("1") and
accepted the fixes of a fresh-context review ("auto accept"); the explanatory
text and the implementation choices are not separately approved. What was built,
the decisions taken while building it and what was not run are in the amendment
and in "Not run" at the end. The design called this record ADR-0032. That number
was taken on `develop` by the record of the projects write side of the desktop app,
so this one is ADR-0033.

## Intent and why

Muro joins several plugins into one. It harmonizes their skills: it compares them,
merges or separates them, writes one catalog. It does not harmonize their MCP
servers. A server a source ships is registered as it is, under the source's name;
the AI decides it at intake, without asking the owner (ADR-0030). Tools a source
ships as command-line programs stay commands that a capability has the host run.

The owner's words, 2026-11-23, about Supads:

- "io voglio che supads abbia il suo custom mcp server"
- "questo dovrebbe fare parte di un lavoro di armonizzazione;
  muro deve chiedere cosa fare di eventuali server mcp"
- "in questo caso stiamo unendo più plugin in un super plugin, con stessa area tematica"
- asked what the server must hold beyond the absorbed servers' tools:
  "ads creation and management campaign"
- of three ways to build it (a declared package server; only the question; a
  server written by the AI for each package): "1"
- shown the review's findings and the proposed fixes, six of them marked as
  changing what gets built: "auto accept"

In ADR-0030 the owner was offered "C: one Muro server that proxies every absorbed
server" and chose A (each server registered as it is). This design adds a
variant of C: a server in front of the absorbed servers it is told to start,
which can also serve absorbed commands. A stays available as one of the answers
the owner can give.

## Problem

Today a plugin made from several sources shows, on the host, the name and the
whole tool list of each absorbed server, including tools no capability calls, and
its command-line tools need a shell permission for each call. The owner has no
say in which tools a package registers. Supads registers `supercmo`'s 22 tools, 7
of which no capability calls, and runs its ads commands through the shell
(`docs/verification/2026-11-21-supads-intake.md` in `acaprino/supads`: the
packaged server started by hand on Windows 11, `tools/list` 46,245 bytes, on
2026-11-21).

Success for Supads, each point measured in verification:

1. One server, named `supads`, is what the host shows.
2. Its `tools/list` answer is smaller in bytes than `supercmo`'s alone.
3. The read commands of the ads programs are callable as tools, with no shell
   permission.
4. The source's draft-first rule holds in three of three trials where the host is
   asked for a write operation with the tool registered (this decides the second
   delivery).

## Terms

- **The pipeline**, in order: `init` (scaffold a package), `intake` (the AI reads
  one pinned source and writes capabilities), `harmonize` (the AI compares all
  capabilities and writes the catalog), `validate`, `check-sources`, `build`
  (stage a release). `muro agent` and `muro absorb` run the AI steps through an
  API with no person present: the unattended forms.
- **Owner**: the person who owns the package. **Harmonizer AI**: the model doing
  the harmonize step. **Host AI**: the model of the user's coding agent at run
  time. **The factory**: Muro. **Hosts**: Claude Code, Codex, Pi, OpenCode,
  Hermes; each has an adapter in the release.
- **Source**: a pinned repository a package absorbs. **Capability**: one on-demand
  method in the catalog. **Decision**: an entry of `delivery.json` saying what a
  part of a source became; its **form** is one of `capability`, `always-on`,
  `hook`, `mcp-server`, `dropped`; its **targets** are the
  capabilities it serves. **`catalog_digest`**: a hash of the catalog and of
  `delivery.json`; when it changes, the routing eval is run again.
  **`<package_root>`**: the folder of the installed release.
- **An `mcp_servers` entry** (ADR-0030): `{"name", "source", "run": [argv], "env": {}}`,
  one absorbed server and how it starts from packaged files.
- **Weight** of a tool list: the bytes of the server's `tools/list` answer.
- Rules cited: ADR-0015 (a package's scope is its sources; to change it, add or
  remove a source); ADR-0017 (Muro never alters what a source prescribes, except
  for a recorded collision; text that acts in every session keeps the source's own
  words); ADR-0026 (a source travels with every file its method uses; a capability
  never hands the host a part to do by hand); ADR-0030 (absorbed servers). All in
  `docs/adr/` and summarized in `AGENTS.md`.

## Goals

1. At harmonization, when a source of the package ships an MCP server, the
   Harmonizer AI shows the owner the evidence and asks what to do with the
   servers. The answer is recorded in the owner's words.
2. One of the answers is a package server: a single server, named for the package,
   whose tools are declared as data in `delivery.json`. A tool either forwards to a
   tool of an absorbed server or runs an absorbed command.
3. The factory ships one generic server program that serves any package's
   declaration, within the stated limit that a forwarded server offers tools only.
   No per-package code.
4. Claude Code registers the package server in this work. Each other host
   registers it after its own live run; until then it registers the absorbed
   servers as today.
5. Supads is harmonized again with this, in two deliveries. Delivery 1: the package
   server with the generation and research tools of `supercmo` and the read
   commands of the Google, Meta, LinkedIn and TikTok Ads programs of
   `marketingskills`. Delivery 2: the write commands (create, update, pause,
   enable, budget, audiences), only if success point 4 holds.

## Non-goals

- New tools that no source carries. A store for products, prompts or processes is
  not built here: no source has commands for it.
- A server written by the AI for one package.
- Remote (HTTP) servers, and servers a source calls and does not ship (Composio
  and AIsa, two connector services named by `marketingskills`; Ryze AI, a
  connector the owner excluded). They are not declared; a capability that needs
  one connects it at run time.
- Changing what an absorbed tool does, sends or costs.
- Registering the package server on Codex, Pi, OpenCode or Hermes, and changing the
  Hermes companion package, in this work.
- A label for the new form in the desktop app.

## Anti-goals (a failure even if it works)

- Python choosing which tools exist, merging two tools, or choosing between one
  server and several. Those are the owner's answer and the AI's authored data.
- A package server that hides what leaves the machine or adds a limit the source
  does not state (owner decision of 2026-11-12, in `AGENTS.md`).
- A tool description that drops, weakens or invents a rule of the source.
- Shell syntax anywhere.
- A package without the declaration behaving differently from today.

## Constraints

- Python standard library only; host-neutral; no Muro command executes upstream
  code at intake, harmonization or build.
- One copy of each piece of knowledge (owner principle of 2026-11-14).
- Nothing is compiled or built locally; the full suite runs on GitHub Actions.
  Locally only the targeted tests.
- `delivery.json` takes part in `catalog_digest`.
- A host joins the list of registering hosts only after it was run live.

## Approaches considered

| Approach | What | Trade-off | Verdict |
| --- | --- | --- | --- |
| A, ADR-0030 | Each absorbed server registered as it is | No new code; every tool of every server, several names, no owner say | Kept as an answer the owner can give |
| C, ADR-0030 | One Muro server proxying every absorbed server | One name; a proxy to build and keep faithful | Chosen in part by the owner on 2026-11-23, as approach 1 below |
| 1. Declared package server | The owner is asked; tools are data; one generic program serves them | One code path, reviewable tools, absorbed servers stay re-pinnable; a client, a proxy and a template grammar to build | **Chosen** ("1") |
| 2. Only the question | Muro asks; answers are register or not | Small; gives no single server and no command tools | Rejected: does not give what the owner asked for |
| 3. Server written by the AI per package | Free-form code | Different code in every package, under no shared test; its tools would create and change paid campaigns | Rejected |
| 4. Commands only, no proxy | A package server for commands; `supercmo` registered beside it | No child processes, no proxy fidelity question; two servers on the host | Rejected: the owner asked for one server |
| 5. Commands stay shell steps | Nothing changes for commands | The draft-first method stays in the path by construction; a shell permission per call | Kept for the write commands until success point 4 holds |
| 6. Trim a server's list without a proxy | Register `supercmo` with fewer tools | Would be the cheapest; no host offers it and the source's server has no such option | Not possible |
| No server at all | An absorbed server left unregistered | — | Not an answer: a server the capabilities call cannot be left for the user to register by hand (ADR-0026); a server nobody needs is removed by removing its source (ADR-0015) |

## The design

```text
host ── stdio ──> package server (factory's generic program, reads package-server.json)
                     ├─ forward ──> child: an absorbed server, started on first call
                     └─ run ─────> an absorbed command, argv built from the declaration
```

### 1. The question to the owner

**When.** At harmonization, when `delivery.json` declares at least one
`mcp_servers` entry (a server a source ships). A package with no shipped server is
not asked and does not change; Marionette's next harmonization asks nothing.

**Evidence**, gathered by the Harmonizer AI from the pinned source files and the
catalog, and labelled an estimate (no server is started for it):

- each shipped server: its tools, what each does and sends, the estimated weight
  of its tool list, which capabilities call which tools, tools no capability
  calls, and what the server declares besides tools (resources, prompts, an
  `instructions` text);
- tools of different servers, or a server tool and a command, that do the same
  thing;
- each command-line program the methods run: its commands as two lists, those
  that read and those that write, and the credentials it takes from the
  environment.

**The question**, asked with the host's question tool where it has one: each
server registered as it is (today), or one package server; and for a package
server, which tools it serves, which commands become tools, and whether any
server stays registered beside it. The AI gives its recommendation and the weight
of each option. It does not proceed on its own choice.

**The record**, in `delivery.json`:

```json
"server_choice": {
  "asked_on": "2026-11-23",
  "answer": "<the owner's own words>",
  "given_on": {"sources": {"supercmo-skills": "3bf78a42", "marketingskills": "5b2b400e"},
               "shown": ["image_generate", "meta-ads campaigns list"]}
}
```

`given_on` is authored by the AI: the serving sources with the commits the answer
was given on, and the names of the tools and commands shown. At a later
harmonization the AI asks again only when there is no answer or that evidence
differs; otherwise it shows the recorded answer. A re-pin of a serving source asks
again, also when no tool changed: that is the stated cost of binding the answer.

### 2. The declaration

A new top-level key of `delivery.json`. It is a declaration, not a form.

```json
"package_server": {
  "name": "supads",
  "children": ["supercmo"],
  "tools": [
    {"name": "image_generate",
     "source": "supercmo-skills",
     "forward": {"server": "supercmo", "tool": "image_generate"},
     "description": "<the child's own description, copied>",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "meta_campaigns_list",
     "source": "marketingskills",
     "description": "<AI-authored; quotes the source's rule where one applies>",
     "input_schema": {"type": "object",
                      "properties": {"account_id": {"type": "string"},
                                     "limit": {"type": "integer"}},
                      "required": ["account_id"]},
     "run": ["node", "<package_root>/scripts/marketingskills/tools/clis/meta-ads.js",
             "campaigns", "list", "--account-id", "{account_id}",
             {"if": "limit", "args": ["--limit", "{limit}"]}],
     "annotations": {"readOnlyHint": true, "openWorldHint": true}}
  ]
}
```

- `name`: the server's name on the hosts; lowercase letters, digits, hyphens; not
  the name of a server that stays registered.
- `children`: names from `mcp_servers` that the package server starts as child
  processes. A server named here is not registered on the hosts by itself; one not
  named is registered as today. Only a server that declares tools alone may be a
  child: one that also offers resources, prompts, an `instructions` text or
  server-initiated requests stays registered separately, because the package
  server forwards tools only and a part of a source is never dropped without a
  decision.
- A tool has exactly one of `forward` and `run`. Its `name` matches
  `[a-z][a-z0-9_]{0,39}` and is unique in the server and against the tools of
  servers that stay registered.
- **A forwarded tool** keeps the child's name, description and input schema, copied
  at harmonization from the pinned source. They change only when two tools would
  share a name, and that collision is recorded (ADR-0017). A tool description is
  loaded in every session and a direct tool call opens no capability, so it keeps
  the source's words. The saving of a package server therefore comes from the tools
  left out, not from shorter descriptions.
- **A `run` tool** has `input_schema` and an **argv template**: a list whose items
  are literal strings, placeholders `{param}` that are a whole item, and
  conditional groups `{"if": "<param>", "args": [...]}` or
  `{"unless": "<param>", "args": [...]}`. A group is not nested; its `args` hold
  literals and placeholders. The first item is a program on the host. Packaged
  files are named with `<package_root>` and lie under `scripts/<source>/` of the
  tool's `source`. Optional: `timeout` in whole seconds (default 120), `env` under
  the rules of a server's `env` (never a secret). The rules the server applies to
  a call:
  1. an argument not in the schema is refused; `type`, `required` and `enum` are
     enforced, and nothing else of JSON Schema;
  2. a placeholder outside a group names a required property;
  3. a string is passed as is, a number in its JSON form; a boolean is only a
     group's condition; an array or an object is refused;
  4. a string value that begins with `-` is refused, unless the property declares
     `"allow_leading_dash": true` (the ads programs read any item starting with
     `--` as a flag);
  5. an `if` group is included when the argument was given and is not `false`; an
     `unless` group when it was not given or is `false`.

  A `run` tool has no description in the source: the AI writes it and quotes the
  source's rule in full where one applies to that command.
- **Declared defaults carry the source's rule.** Where the source prescribes draft
  first (the ads skill: "Draft first on live accounts ... apply only with the
  user's explicit approval"), a write tool is declared with
  `{"unless": "apply", "args": ["--dry-run"]}` and an `apply` boolean in its
  schema, and the declaration cites the source's sentence. This is the source's
  rule as data, not a limit of Muro's.
- `annotations`: MCP tool annotations, authored from what the source says the tool
  does: hints to the host's own permission system. The server adds no confirmation
  step. `idempotentHint` only where the source says a command is safe to repeat.

**Forms and decisions.** `mcp-server` keeps its meaning, a server the source
ships. A new sixth form, `package-tool`: a command of the source served as a tool
of the package server, with the capabilities whose steps call it as `targets`.
Tools of a child that the package server leaves out get one `dropped` decision
listing them, with the owner's answer as its reason. The reason of the server's
decision states the weight of the package server's own tool list.

Capability bodies keep naming a tool as their source does, which is also its name
in the package server. What changes on the host is the server the tool appears
under, so tool ids change (below, `INSTALL.md`).

### 3. The generic server program

Three components in the factory's runtime, shipped in every release:

- **Message helpers** for MCP over stdio, moved out of `muro/mcp.py` into a module
  that `muro/mcp.py` and the package server both import.
- **A client** for child servers, new: start with `server_launch` (the command,
  arguments and environment the adapter would have registered), `initialize`, one
  reader thread per child, `tools/list`, `tools/call`, shutdown.
- **The package server**, `muro/package_server.py`, started as
  `python <package_root>/muro.py <subcommand>`.

Behaviour:

- It reads `package-server.json` beside the launcher (written by the build: the
  `package_server` and `mcp_servers` sections), checks it with the function the
  build uses for those sections, and serves exactly the declared tools. A missing
  or invalid file: it exits, naming the file and the first error.
- `initialize`: it answers with tools only. When the host declares roots, it asks
  `roots/list` once and uses the first root as the working directory of children
  and commands; otherwise its own working directory.
- `tools/list`: answered from the declaration. Nothing is started.
- The read loop never blocks: each `tools/call` runs on a worker thread; `ping` is
  answered at once; `notifications/cancelled` is forwarded to a child or kills a
  `run` process; a child's progress notifications are relayed to the host.
- `tools/call`, forwarded: the child starts on the first call to one of its tools
  and is kept for the session. On that first call the server compares the declared
  tool with the child's own list; a missing tool or a different schema is an error
  naming the tool. The child's result is returned unchanged, `isError` included. A
  child that dies is started again once; a second failure is an error naming the
  child.
- `tools/call`, run: argv is built from the template and the arguments, with no
  shell. A program that resolves to a `.cmd` or `.bat` file is refused by the
  function the hook trampoline already uses, because Windows runs those through
  `cmd.exe`. Output is decoded as UTF-8 with
  replacement and cut at 100,000 characters with a notice. A nonzero exit is
  `isError` with stderr and the exit code. A program not found is an error naming
  it. On timeout the process tree is killed and the result is `isError` saying the
  command was stopped after N seconds, that its effect is unknown, and that the
  state must be read before a retry, with the partial output.
- On shutdown it stops its children and any running command, with their process
  trees.

### 4. Validation, the gate and the hosts

**Shape**, in `muro/delivery.py`, applied by every caller of `validate_delivery`:
the shape of `package_server` and `server_choice`; names; `children` name declared
servers; `forward` names a child; the argv template (a new function for its own
items, which calls the existing `_run_errors` for literals, so there is one check
of a literal part); placeholders are properties of the schema; packaged paths lie
under the tool's source folder and exist in the release; a `package-tool` decision
exists for every source a `run` tool names. The top-level key list gains the two
keys.

**The gate**, one new function called by `build` only: it refuses a
`package_server` when `server_choice` has no answer, or when a commit in
`given_on.sources` differs from `sources.json`. It proves a record, not consent.

| Caller | Missing answer, no `package_server` | `package_server` without a valid answer |
| --- | --- | --- |
| `validate`, `intake`, `harmonize`, `init`, evals, guide, packaged runtime | accepted | accepted (shape only) |
| `check-sources` | does not read `delivery.json` | does not read `delivery.json` |
| `build` | accepted: servers registered as today | refused |

**Unattended runs** (`muro agent`, `muro absorb`): no owner can be asked, so the
step writes no `package_server`; the servers stay declared as intake left them,
and its notes say that the question is open. `absorb` finishes as it does today.

**Existing packages and fixtures.** A package that declares `mcp_servers` and no
`package_server` builds as before. Supads is the first to declare one.

**The launcher exception.** The factory's own launcher (`muro.py` at the package
root) is the one packaged path outside `scripts/<source>/` that a server entry may
name, and only for the package server.

**Hosts.** No new host form: the package server is one more server in the file an
adapter already writes.

| Host | In this work | With a `package_server` declared |
| --- | --- | --- |
| Claude Code | registers it, after the live run of section 6 | `.mcp.json`: the package server and the servers not in `children` |
| Codex, Pi, OpenCode | not yet run live | ignore `package_server`; register every declared server as today |
| Hermes | not yet run live | companion package unchanged: every declared server as today |

Each host's `INSTALL.md` says which of the two it does. Where the package server is
registered it also says that tool ids changed with the server's name, so an allow
rule a user saved for the old ids stops matching (not verified on a host), and, as
today, that an original server with the same tools already on the host offers them
twice.

### 5. Prompts and documents

- `prompts/harmonizer.md`: a section "Servers and tools": when to ask, the
  evidence, the question, the record, asking again only on changed evidence, never
  proceeding on the AI's own choice, and the comparison of tools across sources
  (the same tool twice is merged or one is left out, each with a source-grounded
  reason).
- `prompts/delivery.md`: the `package_server` declaration, the argv template and
  its rules, the form `package-tool`, the source's words for a forwarded tool, the
  source's rule as a declared default, the weight statement, and that secrets
  never enter the declaration.
- `prompts/intake.md`: record a source's command-line programs as evidence for
  harmonization (commands, read or write, credentials) without choosing a form.
- ADR-0033, `AGENTS.md` (the paragraph on servers), `docs/cli.md` for the
  launcher's subcommand, the re-pin procedure ("copy a child's tool descriptions and
  schemas again").
- `GUIDE.html`: package tools under their sources' decisions. No new view.

### 6. Verification

- `tests/test_package_server.py`, with stub servers and stub commands and no name
  of a real source: every shape refusal; the gate in `build` and its absence
  elsewhere; a forwarded call reaching a stub child, with its result, its error, a
  tool missing in the child, a child that dies; each rule of the argv template, a
  leading-dash value, a batch program; a timeout with its message; `ping` answered
  during a long call; cancellation; the files each adapter writes with and without
  a package server; a package without the declaration writing what it writes today,
  byte-equal.
- The fixtures of `tests/test_mcp_servers.py` and `tests/test_delivery.py` that
  declare servers still pass unchanged, because they declare no package server.
- Supads, in its own repository: no new intake (the server and `tools/**` are
  selected at 0.2.0). Harmonized again as 0.3.0 with the owner's answer recorded;
  `--validate`, `--check-sources`, a staged build; the routing eval run again; the
  packaged server started by hand and its `tools/list` measured against 46,245
  bytes; one forwarded read-only call (`setup_status`, which reports which keys are
  set) and one `run` tool with `--dry-run`. Nothing is generated and no campaign is
  created.
- One live session on Claude Code with the staged Supads, recording the working
  directory and the environment variables that reach the server.
- **The test that decides delivery 2**, on Claude Code, with one write tool
  declared with its `--dry-run` default: three requests that name a write operation
  ("create a campaign", "activate it", "raise the budget"). Pass: all three end in a
  dry run or in the capability's draft, none in an applied change. A fail keeps the
  write commands as shell steps of the capability.
- A record in `docs/verification/` with what was not run.

## Risks and mitigations

| Risk | Effect | Mitigation or accepted limit | Shown by |
| --- | --- | --- | --- |
| A host calls a write tool directly, without the capability that carries draft first | A campaign changed or money spent without a draft | Two deliveries; the declared `--dry-run` default; the source's rule quoted in the description | The deciding test of section 6 |
| A model-written value read as a flag | Another option set on a paid account | Leading-dash values refused unless declared | Unit test |
| A program that is a batch file | Command injection through `&` and `%` | Refused, with the trampoline's function | Unit test |
| Credentials in the inherited environment | Every tool of the server can use them | Accepted: the source's programs are built so; stated in `INSTALL.md`; never in the declaration, never printed by the server | Review of the output path |
| A child hangs or dies | A tool that never answers | Per-call timeout, one restart, a named error | Unit test |
| One server for everything | A bad file or a missing `python` removes every tool at once | Accepted and stated; the build validates the file it writes | Build test |
| Timeout on a write | A retry spends twice | The "effect unknown" result | Unit test |
| Processes left behind on Windows | Stray `node` or `python` | Process trees killed on timeout and shutdown | Test on Windows in CI |
| Tool-list growth | Bytes in every session | Weight stated in the decision and measured; the owner chooses the list | Supads measurement |
| Working directory is the plugin folder (Codex, Hermes) | Outputs lost at update, project files not found | `roots/list`; a host registers only after its live run records it | Live run per host |
| A re-pin changes a child's tools | A declared tool that no longer matches | The gate asks again on a new commit; the first-call comparison | Unit test |
| Saved permissions stop matching | A user is prompted again | Stated in `INSTALL.md` and release notes | Not verified |

## Amendment: implementation (2026-11-23)

The design above is the owner-chosen intent. What follows records how it was built,
and each place where the code differs from the text above. Where they differ, this
amendment is what the code does.

**Where the knowledge lives.**

- `muro/jsonrpc.py`: the message helpers, moved out of `muro/mcp.py`. The factory's
  MCP server, the package server and the client all use them.
- `muro/mcp_client.py`: `ChildServer`, the client that starts one absorbed server
  and calls its tools; `resolve_program`; `kill_tree`.
- `muro/package_server.py`: the server, `PackageServer` and `serve`. The design left
  the launcher's subcommand name to the builder: it is the action `tools-server`,
  which `muro/runtime.py` runs through `serve` before any catalog is loaded,
  because the server reads only its own file.
- `muro/argv_template.py`: the template's shape check against the schema, the
  builder of one call's argv and the one batch-file check, `is_batch_program`
  with its message `batch_refusal`. The package server uses it for commands and
  for children. The hook trampoline in `muro/delivery.py` keeps its own inline
  check of a batch file: it is a one-line Python program that runs before `muro`
  can be imported, so it cannot call this module. The design (section 3 and the
  risk table) said the server refuses a batch file by "the function the hook
  trampoline already uses"; there are two checks, for that reason.
- `muro/delivery.py`: `package_server`, `server_sections`, `server_section_errors`
  (every check that needs neither the capabilities nor the manifest, which the
  server also runs on its own file), `package_server_gate_errors` (called by
  `build` only), `registered_servers` and `install_note`. `_run_errors` stays the
  one check of a literal part and is called on the literal items of a template.
- The launcher is not a declared path. `registered_servers` synthesizes the entry
  `["python", "<package_root>/muro.py", "tools-server"]` for the package server,
  with no `source`, so the rule that a declared server names only
  `scripts/<its source>/` needs no exception for it.
- The build writes `package-server.json` (the two sections) at the release root
  and beside the launcher of each host's skill folder. On Claude Code the entry
  is `${CLAUDE_PLUGIN_ROOT}/skills/<command>/muro.py tools-server`, and
  `PACKAGE_SERVER_HOSTS` lists the hosts that register it: Claude Code only.

**Rulings taken while building.** Each states what was decided, why, and what is
lost if it was wrong.

1. **A `run` tool's schema may carry `description`**, at the top level and on each
   property, and a property may carry `allow_leading_dash`. The implementation
   plan said any other key is an error, which would have removed the argument text
   a model needs, and the design is silent on it. Only `type`, `required` and
   `enum` are enforced; any other key is refused.
2. **A placeholder inside a group names the group's own `if` property or a
   required property.** Rule 2 of the design spoke only of a placeholder outside a
   group, and the plan left the case open. A declaration error should surface at
   the build, not at a call, so it is refused at validation. If a legitimate
   template shape is refused, the rule is relaxed.
3. **A forwarded tool keeps the child's name whatever its spelling.** For a
   forwarded tool the name pattern is `[A-Za-z0-9_-]{1,64}`; the strict
   `[a-z][a-z0-9_]{0,39}` holds for `run` tools only. The design puts "keeps the
   child's name" first, and the strict pattern would make a child tool named
   `getThing` impossible to forward. A host that rejects such a name rejects the
   child's own name too. A forwarded name may differ from the child's only when
   two tools of the server would share one.
4. **The gate also asks that every declared tool name is in `given_on.shown`**
   ("the owner's answer does not cover tool X: ask again"). The design binds the
   answer to "the names of the tools and commands shown". Without this, a tool
   added at an unchanged commit builds with no question, for tools that act on
   paid accounts. A command that becomes a tool is listed under the tool's `name`:
   the `shown` example of section 1 (`meta-ads campaigns list`) would be refused for
   a tool named `meta_campaigns_list`. A Harmonizer AI that lists commands under
   other names in `shown` is asked to list the tool names.
5. **Cancellation is by request id.** `notifications/cancelled` cancels only the
   call whose host request id is `params.requestId`. MCP names the request, and
   cancelling an unrelated call would be a wrong result for it. A host that sends
   no id cancels nothing, and the call runs to its end. A boolean never names a
   call.
6. **The `roots/list` request follows `notifications/initialized`**, not
   `initialize`. The MCP lifecycle allows a request from the server only after
   initialization completes. A command or child waits up to 5 seconds for the
   answer, then works where the server does.
7. **A program is resolved on `PATH` only, never in the working directory.** One
   resolver serves run tools, child servers and `taskkill`. `shutil.which` searches
   the current directory first on Windows, and the working directory is the user's
   project: a planted `python.exe` or `node.exe` would run with the user's
   credentials. A user who keeps a program only in the project folder must put it
   on `PATH`.
8. **A child whose command is a batch file is not started.** It is refused with
   the run tools' message. The resolver now finds batch shims that used to fail as
   "program not found", and `cmd.exe` would re-parse `<package_root>` arguments that
   hold `&` or `%`. ADR-0030 left a batch program accepted for a server the host
   starts, and that is unchanged. An absorbed server shipped only as a batch shim
   cannot be a child and stays registered separately.
9. **Progress reaches the host.** The package server passes the host's `_meta` to
   the child, so the child sees the `progressToken` and only the call that owns the
   token relays each progress notification. A child sends progress only for a
   request that carries the token.
10. **The install note of the other hosts claims no live run.** Their `INSTALL.md`
    says: the package server is registered only on Claude Code for now; the host is
    added after a live run on it. No live session has run yet, and an install claim
    is written only after the real host ran it (`AGENTS.md`, "Architecture and
    ownership").

**As built, where it differs from the design.**

- The gate also refuses an answer that does not name a source whose tool or child
  the package server uses. A recorded commit is compared as a prefix of the
  pinned commit, in either case, and has at least 7 hex characters.
- A child that dies: the call that was waiting for it is answered with an error
  naming the child, and it is not repeated. The next call that needs the child
  starts it again. The design said "started again once; a second failure is an
  error".
- A forwarded call has no time limit of the server's: it ends when the child
  answers, the child stops, the host cancels it or the server closes. Only the
  start of a child and its first `tools/list` are limited, to 30 seconds, and a
  child that does not answer in time is given up with an error naming it. The
  "per-call timeout" of the risk table is the `run` tool's.
- The first-call comparison covers the tool's presence and its `inputSchema`. A
  changed description is not detected there. The gate asks the owner again when
  the pinned commit of a serving source changes.
- The five rules apply to `run` tools. A forwarded call goes to the child as it
  came, and the child validates it.
- Rule 4 is for strings. A negative number reaches the program as `-5`.
- The build starts no server, so it does not check that a child "declares tools
  alone" and does not know the tools of a server that stays registered, so it does
  not check that a tool name differs from them. The Harmonizer AI does both from
  the source, and the prompts say so.
- `PACKAGE_SERVER_HOSTS` holds Claude Code although no live session has run, which
  differs from the constraint that a host joins the list after it was run live. The
  live run of section 6 can only happen on a build that registers the server, and
  nothing in `INSTALL.md` says the registration was run.
- The design said `INSTALL.md` states that credentials in the inherited
  environment reach every tool of the server. The Claude Code note states it for
  commands: when the package server has a `run` tool it adds "A command one of its
  tools runs inherits the environment of this session, credentials included." It
  says nothing of a child server, which starts with the same environment.
- `GUIDE.html` shows a `package-tool` decision under its source like any other
  (a label was added, in English and Italian). It does not list the package
  server's tools.

**Verified.** Tests with stub servers and stub commands, no name of a real source:
`tests/test_argv_template.py`, `tests/test_jsonrpc.py`, `tests/test_mcp_client.py`
(the stub child is `tests/mcp_stub.py`), `tests/test_package_server.py` and
`tests/test_package_server_delivery.py`, which includes the shape refusals, the gate
in `build` and its absence elsewhere, the files each adapter writes with and
without a package server, and the emitted Claude Code entry started from a root
whose path holds spaces, an accent, `&` and `%`. `tests/test_mcp_servers.py` passes
unchanged. In `tests/test_delivery.py` and `tests/test_project_file.py` only the
assertions that list the document's keys and the forms changed. Run on Windows, by
file. Fixtures prove mechanics only.

## Not run

- No live host session has run on any host, Claude Code included. The `.mcp.json`
  entry was started from a copy of the adapter folder by a test, not by Claude
  Code.
- The POSIX branches of the client and the server (`killpg`, `start_new_session`,
  the resolver's POSIX branch) have not run: this work was done on Windows. The
  Linux run of the `Tests` workflow on GitHub Actions is the check, and the full
  suite has not run locally.
- Supads has not been harmonized again. The owner's question has not been asked for
  it, no `package_server` is declared for it, and the weight of its tool list has
  not been measured against 46,245 bytes.
- Delivery 2, the write commands, is not built, and the test that decides it has
  not been run.
- `muro/delivery.py` (the hook trampoline) and `muro/installer.py` still resolve a
  program with `shutil.which`, which searches the working directory first on
  Windows. That is outside this change.
- That a permission rule saved for the old tool ids stops matching, as `INSTALL.md`
  says, was not verified on a host.
