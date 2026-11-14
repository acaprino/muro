---
adr_id: ADR-0022
version: 1
title: The CLI runs the AI-owned steps itself (MCP server, OpenAI-compatible agent) and absorbs one skill into one harness
status: Proposed
author: Alfio Caprino
scope:
  paths:
    - muro/mcp.py
    - muro/agent.py
    - muro/scaffold.py
    - muro/installer.py
    - muro/cli.py
    - AGENTS.md
    - README.md
  modules: []
  domains:
    - factory
    - cli
    - delivery
depends_on:
  - ADR-0008
  - ADR-0009
  - ADR-0011
  - ADR-0021
governs_symbols: []
created_from_task: agentic-cli-mcp-and-absorb
proposed_on: 2026-11-14
proposed_at_sha: 59013ea
accepted_on: null
accepted_at_sha: null
last_verified_sha: null
retired_on: null
retired_reason: null
supersedes: []
superseded_by: null
changes: []
---

# ADR-0022: The CLI runs the AI-owned steps itself (MCP server, OpenAI-compatible agent) and absorbs one skill into one harness

Lines marked **Owner** are what the owner said on 2026-11-14, continuing the
direction recorded in ADR-0021; lines marked **Call** are implementation
choices open to correction.

## Context

**Owner**, 2026-11-14:

- The pipeline is driven "tramite comandi, tramite LLM, cioè tramite prompt
  input utente. Adesso magari creiamo un exe che può anche essere agentico o
  utilizzare un server MCP... che possiamo anche avere un server MCP da
  installare in Claude per farlo, o in Codex per esempio, oppure impostare un
  API key e un endpoint di un API OpenAI compatible per farlo."
- "dobbiamo anche dare questa nuova riga di comando... per semplicemente
  creare e installare il pacchetto di una skill esistente a cui do il link,
  una repo GitHub per esempio... e installarlo in un harness che gli indico, e
  devo indicargli il path dell'harness che ricavo eventualmente anche tramite
  Mukade... se quella skill, quel plugin non c'è per l'harness specifico su
  cui lo voglio installare, deve saperlo convertire."
- "Tutto questo è solo per Muro. Poi, una volta che Muro sa fare questo,
  passiamo a Shinatama."

## Principle

ADR-0008 does not move: the LLM owns intake, harmonization and review in every
mode, and Python prepares, restricts, validates and refuses. What this record
adds is *who relays the prompt to the LLM*: a person (as today), an MCP host
(Claude Code, Codex, any client), or Muro itself through an OpenAI-compatible
endpoint. "Conversion for a harness" is not a new engine: it is the factory's
own pipeline — intake and harmonization produce the package, and the release's
native adapters are the conversion.

## Decision

1. **`muro mcp`** serves the factory on stdio (newline-delimited JSON-RPC 2.0;
   initialize, tools/list, tools/call, ping) so an MCP host drives it. The
   tools are thin wrappers of the CLI operations plus `init_package` and
   `install_adapter`. The prepare_* tools stage PROMPT.md and evidence; the
   host AI reads them, judges, and writes the artifacts with its own file
   tools, then calls `validate` — the host's permission system governs those
   writes, not Muro.
2. **`muro agent <intake|harmonize|review>`** runs one AI-owned step through an
   OpenAI-compatible `/chat/completions` endpoint (`--api-base`, `--model`).
   The key comes only from an environment variable (`--api-key-env`; default
   `MURO_API_KEY`, then `OPENAI_API_KEY`) — never a command-line argument, and
   it is never written anywhere. Plain `http` is refused off localhost. The
   model must answer with one JSON object `{"files": {path: content}, "notes"}`;
   paths are allowlisted (`capabilities/<kebab>.md` and the five catalog files
   for intake/harmonize; only `REVIEW.md`, in the staged workbench, for
   review), traversal is rejected, and a rejected or invalid answer gets the
   errors back for up to `--rounds` attempts. After writing: intake runs a
   shape check (the artifacts parse; full catalog validation would wrongly
   demand ROUTER.md before harmonization), harmonize runs the full validation.
   **Call:** intake evidence is inlined into the prompt (the endpoint has no
   file tools) with per-file and total budgets; what is not inlined is listed
   so the model can report it as a gap instead of guessing.
3. **`muro init <repo-url> <directory>`** scaffolds a single-source package:
   pin resolved upstream (the newest non-prerelease tag per AGENTS.md, or
   `--release <tag>`, or `--head`), license declared by the caller and
   verified by the existing gate before anything is written, curated
   `--select` and an intake `--goal` required — the scaffold refuses an
   implicit "take everything". A local path becomes `repo_path`, a URL
   `repo_url`.
4. **`muro install <adapter-dir> --harness <h> --home <path>`** executes the
   built adapter's own `INSTALL.md`: `claude plugin marketplace add` +
   `plugin install` under `CLAUDE_CONFIG_DIR`; `codex plugin marketplace add`
   + `plugin add` under `CODEX_HOME`; `pi install` under
   `PI_CODING_AGENT_DIR`; for OpenCode, the documented config edit (the
   adapter's `file://` URL appended to `plugins` in `opencode.json`,
   idempotently). The home path is the caller's to supply — resolving it
   through Mukade's installation scan is the caller's step (Shinatama's,
   next), not Muro's. A missing host CLI is a clear refusal that points at
   INSTALL.md. **Call:** Hermes stays manual; its INSTALL.md has no command to
   execute.
5. **`muro absorb <repo-url> <directory> ...`** chains the keeper flow in one
   command: init → agent intake → agent harmonize → validate → build →
   install (when `--harness`/`--home` are given). It requires the agent
   configuration; with an MCP host, the host runs the same chain through the
   MCP tools instead.

## Open

- Direct native install without conversion: when the linked repository already
  *is* a plugin for the target harness, installing it as-is (no absorb) is the
  host's own command; whether Muro should detect and offer that shortcut is
  not decided here.
- A live `muro agent` run against a real endpoint (no key was available where
  this was built); the mechanics are covered by a scripted endpoint in tests.
- Codex and Pi installs are implemented from their adapters' INSTALL.md but
  not yet run on the real hosts.

## Verification

`docs/verification/2026-11-14-CLI2-agentic-factory.md`: 15 new tests (scaffold
pins and gate, MCP exchange over a pipe, scripted-endpoint agent runs with
repair rounds and traversal rejection, installer paths), a live MCP call from
a real headless Claude Code session, and a live `muro install` of the built
Marionette adapter into a fresh Claude home.
