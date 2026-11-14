# The `muro` command line

One CLI drives the factory. It runs as `muro` (after an editable install), as
`python -m muro`, or through the legacy flag interface (`python muro_build.py
--validate …`), which keeps working unchanged and is frozen: new operations
land as subcommands only ([ADR-0021](adr/ADR-0021-factory-cli-executable.md),
[ADR-0022](adr/ADR-0022-agentic-cli-mcp-and-absorb.md)).

The AI-owned steps (intake, harmonization, review) always belong to an LLM;
Python prepares evidence, restricts where answers may land, validates and
refuses (ADR-0008). The CLI offers three ways to relay those steps:

1. **Host-prepared** (default): `muro intake|harmonize|review` stage a
   `PROMPT.md` plus evidence; you hand it to your host AI, which writes the
   artifacts; `muro validate` checks them.
2. **MCP**: `muro mcp` serves the same operations to an MCP host (Claude Code,
   Codex, any client); the host AI drives the whole pipeline with its own
   tools.
3. **API**: `muro agent` and `muro absorb` relay a prepared step to an
   OpenAI-compatible endpoint and validate what comes back.

## Installing the command

From a checkout or an unpacked release source tree:

```sh
pip install -e .
muro --help
```

The install must be editable for now: the factory's `prompts/` and the
packaged runtime sit next to the `muro/` package, so a plain site-packages
install cannot find them (ADR-0021 §5). Without installing anything,
`python -m muro …` from the repository root is equivalent.

## Global conventions

- Every command that reads a package takes `--manifest <path>` (default:
  `./sources.json`). The package directory is the manifest's directory.
- Exit code `0` means success; `1` means errors (printed to stderr) — except
  `baseline`, where `1` also means "something is behind" (see below).
- Preparation commands write a fresh workbench under
  `<package>/.muro/factory/<step>/` and refuse to delete files they did not
  write themselves: move your own files out first.

## Command reference

### `muro validate [--manifest PATH]`

Validates capabilities, `ROUTER.md`, `entries.json`, `delivery.json` and
intake-only path references. Prints `OK: capabilities and ROUTER.md valid` or
one error per line.

```sh
muro validate --manifest examples/marionette/sources.json
```

### `muro check-sources [--manifest PATH] [--offline-pins]`

Verifies every pinned source against its upstream: the commit, the release
tag, the license gate (MIT/Apache-2.0 template match), selected paths, nested
licenses and SPDX conflicts. Contacts the pinned Git remotes;
`--offline-pins` checks manifest shape and local repositories only.

```sh
muro check-sources --manifest examples/marionette/sources.json
```

### `muro build [--manifest PATH] [--out DIR] [--host-root DIR]...`

Validates everything, then builds a release into `dist/<slug>/` beside the
manifest (or under `--out`). Refuses an output that already exists. Each
`--host-root` is an installed-plugins directory checked for identity
collisions.

```sh
muro build --manifest examples/marionette/sources.json --out /tmp/stage
# Built /tmp/stage/marionette
```

### `muro intake <source-id> [--manifest PATH]`

Stages one source's intake workbench for the host AI:
`.muro/factory/intake/<source-id>/` with `PROMPT.md`, `source.json` and the
pinned files under `files/`. The source must already be in the manifest with
an `intake.goal` (for a new source, add it — or scaffold a new package with
`muro init`). Prints the workbench path.

```sh
muro intake ponytail --manifest examples/marionette/sources.json
```

### `muro harmonize [--manifest PATH]`

Stages the harmonization prompt (`.muro/factory/harmonization/PROMPT.md`):
manifest, delivery rules and the current catalog. The host AI returns
`ROUTER.md`, changed capabilities and `guide-examples.json`.

### `muro review [--manifest PATH]`

Stages the decisions-review prompt (`.muro/factory/review/PROMPT.md`): the
host AI re-examines the recorded decisions (capability bodies, delivery
forms, harmonization records, coverage) against the pinned sources and writes
`REVIEW.md` with verdicts *holds / drifted / gap* into the same directory.
The review rewrites nothing itself; fixes route through intake or
harmonization.

### `muro baseline [--manifest PATH] [--json]`

Reports, read-only, how each source's pin stands against its upstream:

- `pin: release` — against the newest same-prefix, non-prerelease tag by
  numeric order;
- `pin: head` — against the upstream HEAD commit;
- `pin: static` — reported `frozen`.

Statuses: `current`, `behind`, `frozen`, `unknown` (tag scheme unreadable —
never guessed), `error` (remote unreachable, with the reason). Exit `0` when
everything is current or frozen, `1` otherwise — made for a watcher to poll.
`--json` prints `{"baseline": [{id, pin, pinned, upstream, status, note}…]}`.
Re-pinning stays the documented procedure (AGENTS.md, "Adding or re-pinning a
source"); this command changes no manifest.

```sh
muro baseline --manifest examples/marionette/sources.json --json
```

### `muro eval prepare [--manifest PATH]` / `muro eval score DECISIONS [--manifest PATH]`

`prepare` stages the routing-eval prompt and per-case contexts (without the
expectations) under `.muro/factory/eval/`; the host AI writes
`decisions.json`. `score` validates each decision with the runtime's own
rules and compares status and ordered capabilities; exit `1` when any case
fails.

### `muro init <repo-url> <directory> --license L --goal G --select P [--select P]... [--slug S] [--release TAG | --head]`

Scaffolds a new single-source package: resolves the pin upstream (the newest
non-prerelease tag; `--release <tag>` to name one; `--head` for an upstream
without releases), verifies the license gate **before** writing, and writes
`<directory>/sources.json`. Required: `--license` (MIT or Apache-2.0, as the
source's LICENSE says), `--goal` (the source-specific intake goal) and at
least one `--select` (the selection is curated, never implicit). A local path
as `<repo-url>` becomes `repo_path`; anything else must be an HTTPS or
`file://` URL.

```sh
muro init https://github.com/DietrichGebert/ponytail pkg/ponytail \
  --license MIT --goal "Absorb the working-method skill" \
  --select SKILL.md --select references/
```

### `muro install <adapter-dir> --harness H --home PATH`

Installs a **built** adapter (a release's `adapters/<harness>/` directory,
with its `INSTALL.md`) into a harness home, executing that adapter's own
install recipe:

| Harness | What runs | Home variable |
| --- | --- | --- |
| `claude-code` | `claude plugin marketplace add` + `claude plugin install <slug>@<slug>` | `CLAUDE_CONFIG_DIR` |
| `codex` | `codex plugin marketplace add` + `codex plugin add <slug>@<slug>` | `CODEX_HOME` |
| `pi` | `pi install <adapter>` | `PI_CODING_AGENT_DIR` |
| `opencode` | config edit: the adapter's `file://` URL appended to `plugins` in `opencode.json` (the home's, or `.config/opencode/opencode.json` when that exists) | — |

The home path is the caller's to supply — resolve it yourself or through
Mukade's installation scan. A missing host CLI is a clear refusal pointing at
the adapter's `INSTALL.md`. Hermes has no automated install; follow its
adapter's `INSTALL.md` by hand. Verified live on claude-code; the codex and
pi recipes are their adapters' own commands, not yet run on real hosts
(ADR-0022, Open).

```sh
muro install /tmp/stage/marionette/adapters/claude-code \
  --harness claude-code --home ~/.claude-test
```

### `muro mcp [--manifest PATH]`

Serves the factory as an MCP stdio server (newline-delimited JSON-RPC 2.0).
Tools: `validate`, `check_sources`, `build`, `baseline`, `prepare_intake`,
`prepare_harmonize`, `prepare_review`, `eval_prepare`, `eval_score`,
`init_package`, `install_adapter`. Every tool takes an optional `manifest`
argument overriding the server default. The `prepare_*` tools stage
`PROMPT.md` and evidence on disk; the host AI reads them, does the judgment,
writes the artifacts with its own file tools (under the host's own
permissions), then calls `validate`.

Register it in Claude Code:

```sh
claude mcp add muro -- python -m muro mcp --manifest /path/to/sources.json
```

or per session:

```sh
claude -p "..." --mcp-config '{"mcpServers":{"muro":{"command":"python","args":["-m","muro","mcp"]}}}'
```

For Codex, declare the same `command`/`args` stdio server in its MCP
configuration.

### `muro agent <intake|harmonize|review> [source-id] --model M [--api-base URL] [--api-key-env VAR] [--rounds N] [--manifest PATH]`

Runs one AI-owned step through an OpenAI-compatible `/chat/completions`
endpoint.

- `--model` (required): the model id the endpoint serves.
- `--api-base`: base URL, default `https://api.openai.com/v1`. Plain `http`
  is refused except on localhost.
- `--api-key-env`: the environment variable holding the key. Default:
  `MURO_API_KEY`, then `OPENAI_API_KEY`. The key is **never** a command-line
  argument and is never written anywhere.
- `--rounds`: attempts, default 2 — a rejected or invalid answer gets the
  errors fed back once.
- `source-id`: required with `intake` only.

The model must answer with exactly one JSON object
`{"files": {"<relative path>": "<content>"}, "notes": "…"}`. Paths are
allowlisted (`capabilities/<kebab-id>.md`, `ROUTER.md`,
`guide-examples.json`, `entries.json`, `delivery.json`, `eval-cases.json`
for intake/harmonize; only `REVIEW.md`, in the staged workbench, for review);
traversal is rejected before anything is written. After writing, intake runs
a shape check and harmonize runs the full catalog validation; failures are
fed back within `--rounds`. For intake, the pinned evidence is inlined into
the prompt (per-file and total budgets; what is not inlined is listed so the
model reports it as a gap instead of guessing).

```sh
export MURO_API_KEY=…   # or OPENAI_API_KEY
muro agent intake ponytail --manifest pkg/ponytail/sources.json \
  --model gpt-5.2 --rounds 2
muro agent harmonize --manifest pkg/ponytail/sources.json --model gpt-5.2
```

The request/response mechanics are covered by tests against a scripted
endpoint; no claim is made about any particular model's intake or
harmonization quality (ADR-0022, Open).

### `muro absorb <repo-url> <directory> --license L --goal G --select P... --model M [init options] [agent options] [--harness H --home PATH] [--out DIR]`

The keeper chain in one command: `init` → `agent intake` → `agent harmonize`
→ `validate` → `build` → `install` (when `--harness` and `--home` are both
given; otherwise it stops after the build and says so). Takes the union of
`init`'s, `agent`'s and `install`'s options. With an MCP host instead of an
API endpoint, run the same chain through the MCP tools.

```sh
export MURO_API_KEY=…
muro absorb https://github.com/DietrichGebert/ponytail pkg/ponytail \
  --license MIT --goal "Absorb the working-method skill" --select SKILL.md \
  --model gpt-5.2 --harness claude-code --home ~/.claude
```

## Legacy flag mapping

| Legacy (`muro_build.py`) | Subcommand |
| --- | --- |
| `--validate` | `muro validate` |
| `--check-sources [--offline-pins]` | `muro check-sources [--offline-pins]` |
| `--build [--out] [--host-root]` | `muro build [--out] [--host-root]` |
| `--prepare-intake <id>` | `muro intake <id>` |
| `--harmonize` | `muro harmonize` |
| `--prepare-eval` | `muro eval prepare` |
| `--score-eval <file>` | `muro eval score <file>` |
| — | `muro review`, `muro baseline`, `muro init`, `muro install`, `muro mcp`, `muro agent`, `muro absorb` |

## How-to: the common workflows

**Build a package by hand (host-prepared).**
`muro init` (or edit `sources.json`) → `muro intake <id>` and give the
workbench to your host AI → `muro harmonize` and do the same → `muro
validate` → `muro check-sources` → `muro build` → `muro install`.

**Drive the factory from Claude Code or Codex (MCP).**
Register `muro mcp` as above, then ask the host to absorb a skill: it calls
`init_package`, reads each `prepare_*` workbench, writes the artifacts with
its own file tools, calls `validate` until clean, then `build` and
`install_adapter`.

**Fully unattended (API).** `muro absorb … --model …` with the key in
`MURO_API_KEY`.

**Keep a package current.** Poll `muro baseline --json` (exit 1 = something
moved); before re-pinning, run `muro review` and follow AGENTS.md "Adding or
re-pinning a source"; after re-pinning, re-run intake for that source,
harmonize, validate, build, install.

## Security notes

- API keys only from environment variables; never arguments, never logged,
  never stored.
- `muro agent` refuses plain `http` endpoints off localhost.
- Model answers can only land on the allowlisted package paths; path
  traversal is rejected before any write.
- Source material is evidence, not instructions: intake and build never
  execute upstream code, and the license gate runs before anything is
  packaged or scaffolded.
