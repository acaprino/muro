# The `muro` command line

Muro has two parts. The desktop app is the harness manager, plugin sync and updater ([desktop app](desktop.md), [its CLI](desktop-cli.md)). The factory is the harmonizer: it absorbs pinned skills and plugins into one package with a catalog, a coordinator and a release for every harness, as it does for Marionette. This page is about the factory.

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
licenses, SPDX conflicts and that every declared `notice_paths` file is a
selected file that ships. Two declared fields are checked against the pinned
tree: a binary file (an image, a font, a video) is refused unless `media_paths`
names it (ADR-0027), and an unselected file that a selected file names is
refused unless `omissions` explains it with a reason (ADR-0026). `muro build`
applies the same two rules; `muro intake` and `muro init` do not apply the
second, because completing the selection is the intake's work. Contacts the
pinned Git remotes; `--offline-pins` checks manifest shape and local
repositories only.

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
`.muro/factory/intake/<source-id>/` with `PROMPT.md`, `source.json`, the
pinned files under `files/` and `coverage.json`: what the pinned commit holds
outside `selected_paths` (`left_out`) and which of those files and folders the
selected files name (`referenced`, with `named_in`). The host AI judges from it
whether the selection is complete; when it adds paths to `selected_paths`, run
the command again (ADR-0026). The source must already be in the manifest with
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

- `pin: release` — first that the pinned tag still exists upstream **and still
  points at the pinned commit**, then against the newest same-prefix,
  non-prerelease tag by numeric order;
- `pin: head` — against the upstream HEAD commit;
- `pin: static` — reported `frozen`.

Statuses: `current`, `behind`, `drifted` (the pinned tag was deleted upstream,
or was moved off the pinned commit — the retag case a supply-chain watcher
must not miss), `frozen`, `unknown` (tag scheme unreadable — never guessed),
`error` (remote unreachable, with the reason). Exit `0` when everything is
current or frozen, `1` otherwise — made for a watcher to poll.
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
| `opencode` | config edit: the adapter's `file://` URL appended to `plugins` in the home's existing `opencode.json` (project form), else in `.config/opencode/opencode.json` under the home (the user-level path its INSTALL.md names) | — |

The home path is the caller's to supply — resolve it yourself or through
Mukade's installation scan. Re-running an install is safe: a marketplace the
home already registered is kept (`already present, kept: …` in the output) and
the plugin install still runs; a *changed* package still needs a version bump,
because hosts cache an installed plugin by version. A missing host CLI is a
clear refusal pointing at the adapter's `INSTALL.md`. Hermes has no automated
install; follow its adapter's `INSTALL.md` by hand. Verified live on claude-code; the codex and
pi recipes are their adapters' own commands, not yet run on real hosts
(ADR-0022, Open).

```sh
muro install /tmp/stage/marionette/adapters/claude-code \
  --harness claude-code --home ~/.claude-test
```

### `muro marketplace <repository> <folder>`

Writes, at the root of a repository that publishes a built release in its
subfolder `<folder>`, the marketplace of each host that has one:
`.claude-plugin/marketplace.json` (Claude Code) and
`.agents/plugins/marketplace.json` (Codex). Each is the adapter's own
marketplace with every plugin's source moved to the adapter folder
(`./<folder>/adapters/<harness>`), so the format stays where the build writes
it. Claude Code (`claude plugin marketplace add owner/repo`), Codex and the
desktop app then find the plugin from the repository's address. Every file is
read before any is written: a folder that is not inside the repository, or
holds no built Claude Code or Codex adapter, writes nothing and exits `1`.
The `Release Marionette` workflow runs it in `acaprino/marionette`.

```sh
muro marketplace ./package marionette
# Wrote package/.claude-plugin/marketplace.json
# Wrote package/.agents/plugins/marketplace.json
```

### `muro license-check <folder>`

Walks `<folder>` (the folders named `.git` are not entered) and tests every
regular file whose name starts with `LICENSE`, `LICENCE` or `COPYING`, in any
letter case, against the factory's own template check, first for MIT and then for
Apache-2.0. Links and unreadable files are skipped. It runs no Git command and
contacts nothing. It exists for a caller that wants to know before an AI run
whether the source has any license text the factory could accept.

- When at least one file passes: exit `0` and one JSON document on stdout, the
  paths relative to `<folder>` with `/` separators, sorted by path:
  `{"licenses": [{"path": "LICENSE", "license": "MIT"}]}`.
- When none passes: exit `1`, nothing on stdout and the bare line `no file in the
  source is the complete MIT or Apache-2.0 text the factory accepts` on stderr.
- When `<folder>` does not exist or is not a folder: exit `1` and the bare line
  `folder not found: <folder>` on stderr.

Neither line has a prefix, so a caller can print it after its own words. This is
a preflight: any license-named file that passes is enough, one inside a vendored
dependency included, and it does not say which file licenses which path. The
license gate is the one `check-sources` and `build` apply to the pinned commit
(ADR-0005, ADR-0006).

```sh
muro license-check ./source
# {
#   "licenses": [
#     {
#       "path": "LICENSE",
#       "license": "MIT"
#     }
#   ]
# }
```

### `muro mcp [--manifest PATH] [--tools NAME[,NAME...]]`

Serves the factory as an MCP stdio server (newline-delimited JSON-RPC 2.0).
`--tools` serves only the named tools: they alone are listed and run, a call to
any other is refused by name before it does anything, and a name the server
does not have is refused at start (exit 1, nothing served). Without it every
tool is served. Give a host agent only what its job needs: the desktop starts
the server for a simulation with `--tools simulate_prepare,simulate_check`,
because the text the agent works from may come from a project file of anyone.
Tools: `validate`, `check_sources`, `build`, `baseline`, `prepare_intake`,
`prepare_harmonize`, `prepare_review`, `eval_prepare`, `eval_score`,
`init_package`, `install_adapter`, `simulate_prepare`, `simulate_check`. Every
tool takes an optional `manifest` argument overriding the server default. The
`prepare_*` tools stage `PROMPT.md` and evidence on disk; the host AI reads
them, does the judgment, writes the artifacts with its own file tools (under
the host's own permissions), then calls `validate`. The two `simulate_*` tools
take a `project` (a `.mp`) instead of a manifest and return JSON: see
[`muro project simulate`](#muro-project-simulate--simulate-prepare--simulate-check).

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

Owner Markdown in `custom-instructions/` beside the manifest is included in
intake, harmonization and review evidence. After editing those files, run
`muro agent harmonize --manifest <package>/sources.json --model <your-model>`
to let the configured API model apply and validate the changes. To use your
existing host LLM instead, run `muro harmonize --manifest <package>/sources.json`
and give it the generated `PROMPT.md`, or use the MCP `prepare_harmonize` tool.
The input files remain unchanged. Validation rejects delivery tied to older
file contents, names or membership; no command infers their meaning itself.
If the Markdown changes while the model works, the step stops with
`custom-instructions changed during AI work; prepare again before writing results`
before writing that round's files. See [custom instructions](custom-instructions.md) for folder
layout, removal, runtime retention and a complete Marionette example.

- `--model` (required): the model id the endpoint serves.
- `--api-base`: base URL, default `https://api.openai.com/v1`. Plain `http`
  is refused except on localhost.
- `--api-key-env`: the environment variable holding the key. Default:
  `MURO_API_KEY`, then `OPENAI_API_KEY`. The key is **never** a command-line
  argument and is never written anywhere. The value must be a variable name in
  capitals (`^[A-Z_][A-Z0-9_]{0,63}$`: the keys of several providers carry no hyphen and would
  read as names under a looser rule); anything else is refused with "The key
  setting must name an environment variable, not hold a key", without repeating it, so a key
  pasted there by mistake is not echoed (`muro absorb` and `muro project simulate` read the
  same option through `read_api_key`).
- `--rounds`: attempts, default 2 — a rejected or invalid answer gets the
  errors fed back once.
- `source-id`: required with `intake` only.

The model must answer with exactly one JSON object
`{"files": {"<relative path>": "<content>"}, "notes": "…"}`. Paths are
allowlisted (`capabilities/<kebab-id>.md`, `ROUTER.md`,
`guide-examples.json`, `entries.json`, `delivery.json`, `eval-cases.json`
for intake/harmonize; only `REVIEW.md`, in the staged workbench, for review);
traversal is rejected before anything is written. After writing, intake runs
a shape check and harmonize runs the full catalog validation; failures —
including a file that fails to parse — are fed back within `--rounds`, and a
file written by an earlier, rejected round that the repair round no longer
names is removed, so a misnamed file cannot poison every later validation. For intake, the pinned evidence is inlined into
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

### `muro project pack --manifest PKG/sources.json --out FILE.mp [--sources-cache DIR] [--release DIR]` / `muro project unpack FILE.mp --out DIR` / `muro project info FILE.mp [--summary] [--cache DIR]` / `muro project verify FILE.mp [--cache DIR]`

(Writing a project: [`muro project new` / `edit` / `commit`](#muro-project-new--edit--commit) below.)

The `.mp` project file ([ADR-0028](adr/ADR-0028-desktop-projects-and-sync.md) decision 12): one zip that carries
everything about a unified plugin. Its first member, stored uncompressed, is `mimetype`
(`application/vnd.muro.project+zip`). The other members:

| Member | What it is |
| --- | --- |
| `project.json` | `{schema: 1, name, slug, version, author, created, changed, repository: {url, branch, tag_prefix} \| null, builtin}`; times ISO 8601 in UTC; `slug` is the plugin's slug in `sources.json`; the version lives once, in `sources.json`: `pack` writes the plugin's version there into the packed file, whatever the source `project.json` says (it is carried byte for byte when they agree) |
| the package | `sources.json`, `delivery.json`, `ROUTER.md`, `entries.json`, `guide-examples.json`, `eval-cases.json` (each when present), `capabilities/`, `custom-instructions/` and `prompts/` (when the package has its own); nothing else in the folder travels |
| `records.json`, `history.json`, `CHANGELOG.md` | `{records: [...]}`, `{runs: [...]}` and the release notes; a package without them gets empty ones |
| `inputs/<source id>/…` | each source's selected paths (media and `notice_paths` files included), its license file and the `NOTICE` beside it (the files the build's license gate carries with a source; Apache-2.0 asks for the NOTICE to travel), at the pinned commit |
| `release/<slug>/…` | a built release, as `build --out` lays it out |

`pack` reads the package named by `--manifest` (its folder is the package) and refuses a package that does not
`validate`, a missing or malformed `project.json`, a source that fails its check, a link anywhere in what it
carries, and a file that `unpack` would refuse. Each source is fetched and checked at its pin with the same
functions `check-sources` and `build` use (license gate, coverage gate, the pin's release or HEAD); like
`check-sources`, it needs the network unless the source is local or already in `--sources-cache`. That folder
keeps one snapshot per source id and commit (`<DIR>/<id>/<commit>/…`, the files exactly as `inputs/<id>/`
holds them) and, beside it, `<DIR>/<id>/<commit>.stamp`: the digest of what the snapshot was fetched for
(the commit and the source's `selected_paths`, `media_paths`, `notice_paths`, `license_path`, `excluded_paths`
and `license`). `pack` reads a snapshot whose stamp matches without fetching, and fetches again, replacing it,
when the stamp differs or is missing (a snapshot made before stamps existed, or by hand); it stores the one it
fetched. To use a cache without the network, fill it with a pack first. `--release` is the `--out` folder of a
build (`<DIR>/<slug>/…`); `pack` refuses one that is not the build of this package (the `sources.json` plugin
slug and version, and the capability ids, must be the package's: `muro project verify`'s check); without it the
file carries no release. The file is written whole or not at all, and the same project packs
to the same bytes (sorted members, fixed times), so the SHA-256 of the file identifies it.

`verify` checks that the plugin a `.mp` carries (`release/<slug>/`) was built from the package it carries: the
release's `sources.json` plugin slug and version and its capability ids must equal the package's. It prints
`{"verified": true}`, or exits 1 with "The plugin inside this project does not match the project: it was not
built from it" and what differs; a project with no release has nothing to disagree with. The desktop runs it
before it installs a project's plugin.

`unpack` writes into a new (or empty) folder only, all or nothing. It also refuses a member that is outside the layout above (the
package files and folders, `project.json`, `records.json`, `history.json`, `CHANGELOG.md`, `inputs/` and `release/`): a `.mp` that
carries `.claude/settings.json`, `.mcp.json` or a `CLAUDE.md` at its root is refused, because the folder it writes is where an AI run
works and a coding agent reads its own configuration from there. A `.mp` from elsewhere is untrusted input:
a member with an absolute path, a drive letter, `..`, a backslash, a colon, a control character, one of
`< > " | ? *`, a name ending in a dot or space, a Windows device name (`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`COM9`,
`LPT1`-`LPT9`, with or without an extension), or that is a link, a device or encrypted is refused before
anything is written, a file that is not a zip, or whose
first member is not the stored `mimetype`, is refused as `Not a Muro project file`, and unpacking stops at 2 GiB
uncompressed or 50,000 members (`MAX_BYTES`, `MAX_MEMBERS` in `muro/project.py`; `pack` stops at the same).

`info` prints JSON on stdout. It unpacks the file once per SHA-256 of its content into `--cache` (default: a
per-user folder, `%LOCALAPPDATA%\muro\projects` on Windows, else `$XDG_CACHE_HOME/muro/projects` or
`~/.cache/muro/projects`; nothing prunes it) and reads it from there. It answers everything the project page
shows:

| Key | What it holds |
| --- | --- |
| `project` | `project.json` as it is |
| `plugin` | `{name, slug, version, description}` of `sources.json` |
| `inputs` | per source `{id, url, pin, release, commit, license, paths, became}`: `url` is its public https address and `release` its published release, `null` when it has none (a local checkout path never shows); `paths` are its `selected_paths`; `became` counts its `delivery.json` decisions by form, `{capability, always-on, hook, mcp-server, dropped}` |
| `decisions` | the decisions of `delivery.json` as they are (empty without one) |
| `records`, `history`, `changelog` | `records.json`'s records, `history.json`'s runs, `CHANGELOG.md` as text |
| `prompts` | `[{file, text}]`: `intake.md`, `harmonizer.md`, `delivery.md` and `classify.md`, the package's own folder or else the factory's (`prompts_dir`, as the build resolves them) |
| `instructions` | `[{path, text}]`: the owner's Markdown files under `custom-instructions/`, `path` relative to it, the text as written (a file that is not UTF-8 is refused) |
| `graph` | `{entries, capabilities, examples}`: `entries` are the discovery entries `{name, description, capabilities}` (the description as a host reads it, with the sentence naming what the entry absorbs; empty without `entries.json`); `capabilities` and `examples` are the release guide's own data (`muro.guide.guide_data`: each capability with its title, body, intents, needs, conflicts, outputs, checks and check scope, and each example resolved to its steps), computed on the package as the file holds it, not on a release it may carry |
| `files` | `[{part, path, detail}]`: the list "What this project file holds", with the project's own counts |
| `digest` | the SHA-256 of the file |

A file that lacks `project.json`, `sources.json`, `records.json`, `history.json` or `CHANGELOG.md`, or holds one
that is not what its name says (a `project.json` that fails the rules above, a plugin that fails the build's
identity check, a catalog, delivery document or entries file that fails the build's validation), is refused with
the reason. `pack` and `unpack` print the path they wrote. Exit `0` on success, `1` with the reason on stderr
otherwise.

`info --summary` is what a list of projects shows: `{project, plugin: {name, slug, version}, inputs,
capabilities, entries, examples, records, runs, digest}` (the counts) and none of the capability bodies that make the full
`info` large (610 KB for Marionette). The counts are the full `info`'s own. A file that is missing or invalid is
`{"error": reason}` on stdout with exit `0`, so one bad file never hides the others from a list (the desktop
runs it once per listed project and reads the full `info` only for the project it opens).

```sh
muro build --manifest examples/marionette/sources.json --out /tmp/stage
muro project pack --manifest examples/marionette/sources.json --out marionette.mp \
  --sources-cache ~/.cache/muro-sources --release /tmp/stage
muro project info marionette.mp
```

### `muro project new` / `edit` / `commit`

Writing a project ([ADR-0032](adr/ADR-0032-desktop-projects-write-side.md)). Python packs, records and guards; what the
package means is the host AI's, which writes it between `new` (or `unpack`) and `commit`.

```sh
muro project new DIR --name N --slug S --author A [--version 0.1.0] [--repository URL [--branch B] [--tag-prefix P]]
muro project edit FILE.mp --expect-digest SHA256 [--name N] [--author A] [--repository URL [--branch B] [--tag-prefix P] | --no-repository] [--records FILE.json] [--changelog FILE.md]
muro project commit DIR --out FILE.mp (--expect-digest SHA256 | --create) --operation TEXT [--step patch|minor|major|none] [--summary FILE.md] [--engine E] [--budget USD]
```

`new` writes a new project's work folder (new or empty): `project.json` (schema 1, `builtin` false, `created` and `changed`
now, in UTC), an empty `records.json`, `history.json` and `CHANGELOG.md`. It writes no package: `sources.json`, the
capabilities, the router and the rest are the host AI's (intake and harmonization). It prints the folder.

`edit` changes what a person owns, with no AI and no network: the name, the author and the repository of `project.json`
(`changed` moves), every record of `records.json` (`{records: [...]}` or a bare list; each `{id, date, subjects, text, author:
muro|you, binding}`, an id of letters, digits, `.`, `_` or `-`, unique, a real `YYYY-MM-DD` date, a nonempty text of at most
20,000 characters) and the text of `CHANGELOG.md` (at most 1 MiB). The file is unpacked, changed and packed again with its own
copies of the inputs (they fill a sources cache of the edit's own, stamped for each source as `sources.json` declares it) and
its own release, which the package, unchanged, still matches. It is replaced only while it still has `--expect-digest`;
otherwise "The project file changed since it was opened: open it again and repeat the change". Prints `{path, digest}`.

`commit` turns a work folder into the project file, after the AI changed an unpacked project (`--expect-digest` of the file it
was unpacked from) or wrote a new one (`--create`: refused where a file is). It refuses a folder without `sources.json` or
`project.json`, and a plugin id that changed. What the project is (`project.json`'s identity), its history and its changelog are the
desktop's, not the folder's: `commit` takes them from the project as the desktop holds it (the file it replaces), so an agent that
rewrote them changes nothing. It refuses a folder whose `records.json` changes or removes a record of the owner's (`author: you`) or
adds a record that is `binding`: the AI writes its own records (`author: muro`), never the owner's rules. The version moves by `--step` from the file's (default `patch`; a new project
keeps its own). It builds the package with `build_release` (identity, catalog, router, delivery, prompts, intake goals,
entries, the license and coverage gates of every source, every adapter), then appends the run to `history.json` (`{id:
<slug>-v<version>, time, version, status: completed, budget_usd, engine, operation, pins: {source id: commit}, changelog}`), sets
`project.json`'s version and `changed`, puts a new entry on top of `CHANGELOG.md` (`# <name> <version>`, the `--summary` text,
then the mechanical differences as a list: inputs added, removed or moved, capabilities added or removed, instruction files
added, changed or removed, and the catalog's size), packs the folder with that release and replaces the file under the same
digest guard. An input the old file already carried at the same pin and selection is taken from its copy, not fetched. Nothing
is written to `--out` unless all of it succeeds. Prints `{path, digest, version, run}`.

All three exit `0` on success and `1` with the reason on stderr (`Project new|edit|commit failed: ...`).

### `muro project simulate` / `simulate-prepare` / `simulate-check`

```sh
muro project simulate <FILE.mp | --manifest PKG/sources.json> --task T [--stack TOKEN]... --model M [--api-base URL] [--api-key-env VAR] [--cache DIR]
muro project simulate-prepare <FILE.mp | --manifest PKG/sources.json> --task T [--stack TOKEN]... [--cache DIR]
muro project simulate-check <FILE.mp | --manifest PKG/sources.json> --context FILE --answer FILE [--cache DIR]
```

The simulator answers one question: which capabilities would this request activate, and in what order? The
decision is the AI's ([ADR-0028](adr/ADR-0028-desktop-projects-and-sync.md) decision 10). Python prepares what a
classifier reads and validates its answer with the runtime's own rules; it never matches words in the request, never
repairs an answer and never completes one. There are two ways to reach the AI, and both end in the same check:

- a coding agent on the computer, through the MCP tools `simulate_prepare` and `simulate_check` of `muro mcp`
  (the same results as the two subcommands below): it asks for the material, classifies with the prompt it got, and
  sends its answer back to be checked;
- an OpenAI-compatible endpoint, through `simulate`, as `muro agent` reaches one.

The package is a `.mp` file (unpacked once per SHA-256 of its content into `--cache`, as `info` does) or a
`--manifest` (default `./sources.json` when neither is named); naming both is refused. A package needs no
`eval-cases.json` to be simulated.

`simulate-prepare` prints `{"context": {"task", "stack_tokens", "catalog_digest"}, "prompt": "..."}`. The
`context` is what the AI's answer must copy exactly. The `prompt` is built by the function that builds the prompt of
an eval case (`muro eval prepare`): the permanent session policy, the one context, the compact catalog and the
classification rules, after a short instruction to answer with one JSON object. For Marionette it is about 80,000
characters. `--stack` tokens (`stack:*`, repeatable) are inputs: with no project to look at, nothing is detected.

`simulate-check` takes that context and the AI's answer (two JSON files) and prints one of:

```json
{"valid": true, "status": "selected", "reason": "...", "questions": [],
 "steps": [{"step_id": "x", "capability": "x", "intent": null, "reason": null, "added_as_prerequisite": true},
           {"step_id": "y", "capability": "y", "intent": "testing.verify", "reason": "...", "added_as_prerequisite": false}]}
{"valid": false, "errors": ["Unknown capability in AI classification: ghost"]}
```

`status` is `selected`, `no_match` or `needs_clarification` (the last two are valid answers with no steps; the
questions are the AI's). The steps come only from a validated decision, in the order the runtime plans them
(`routing.resolve_selection`), with the `after` prerequisites it adds marked `added_as_prerequisite`: nobody chose
an intent or a reason for those, so both are `null`. An answer that is invalid is never shown as steps: an unknown
capability or intent, a context that is not the one prepared for this catalog (a changed catalog needs a new
`simulate-prepare`), a missing `needs` judgment, a constraint the context lacks, two owners of one output.

`simulate` does both in one command: it prepares, sends the prompt as one user message to `<api-base>/chat/completions`
with the model named, takes the first JSON object of the answer (a code fence or a sentence around it is fine) and
checks it. It prints the same result with `"engine": "api"` and `"model"`. An answer with no JSON object at all is an
invalid answer (`valid` false). Cost: one request carrying the whole prompt; nothing is retried.

- `--model` (required), `--api-base` (default `https://api.openai.com/v1`; plain `http` is refused except on
  localhost) and `--api-key-env` (default: `MURO_API_KEY`, then `OPENAI_API_KEY`) are those of `muro agent`.
- The key comes only from that environment variable. It is never an argument, a file, output or part of a message,
  not even one an endpoint echoes back.
- Exit `0` whenever a result was printed, valid or not: an invalid decision is what the simulation found, so read
  `valid`. Exit `1` with the reason on stderr when it could not run: no package, a request or stack the runtime
  refuses, an unreadable file, no key, an endpoint that cannot be reached or answers with an error.

```sh
export MURO_API_KEY=…
muro project simulate marionette.mp --task "Convert the Word document to PDF" --model gpt-5.2
muro project simulate-prepare marionette.mp --task "Landing page with scroll animations" --stack stack:gsap > prepared.json
# the host AI classifies with the prompt in prepared.json, saves that file's context as context.json and its answer as answer.json
muro project simulate-check marionette.mp --context context.json --answer answer.json
```

The mechanics are covered by tests against fixtures and a scripted endpoint; no claim is made about any model's
classification of a request.

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
| — | `muro review`, `muro baseline`, `muro init`, `muro install`, `muro license-check`, `muro mcp`, `muro agent`, `muro absorb`, `muro project` |

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

**Make a project file and ask it something.** `muro build --manifest PKG/sources.json
--out DIR`, then `muro project pack --manifest PKG/sources.json --out FILE.mp --release
DIR` (needs the network once, for the inputs; `--sources-cache` keeps them), `muro
project info FILE.mp` to read what the desktop's project page shows, and `muro
project simulate FILE.mp --task "…" --model M` (or `simulate-prepare` and
`simulate-check` from a host that does the classifying) to see which capabilities a
request activates. The desktop app opens the same file under Projects.

**Keep a package current.** Poll `muro baseline --json` (exit 1 = something
moved); before re-pinning, run `muro review` and follow AGENTS.md "Adding or
re-pinning a source"; after re-pinning, re-run intake for that source,
harmonize, validate, build, install.

## Security notes

- API keys only from environment variables; never arguments, never logged,
  never stored.
- `muro agent` and `muro project simulate` refuse plain `http` endpoints off localhost.
- Model answers can only land on the allowlisted package paths; path
  traversal is rejected before any write.
- A `.mp` from elsewhere is untrusted input: `unpack` refuses traversal, absolute paths, drive letters and links
  before it writes anything, and stops at 2 GiB or 50,000 members.
- Source material is evidence, not instructions: intake and build never
  execute upstream code, and the license gate runs before anything is
  packaged or scaffolded.
