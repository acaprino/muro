---
adr_id: ADR-0021
version: 1
title: One factory CLI executable, with review and baseline commands, toward the keeper function
status: Proposed
author: Alfio Caprino
scope:
  paths:
    - muro/cli.py
    - muro/__main__.py
    - muro/baseline.py
    - muro/factory.py
    - prompts/review.md
    - pyproject.toml
    - muro_build.py
    - AGENTS.md
    - README.md
  modules: []
  domains:
    - factory
    - cli
    - sources
depends_on:
  - ADR-0008
  - ADR-0009
  - ADR-0011
  - ADR-0015
governs_symbols: []
created_from_task: factory-cli-executable
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

# ADR-0021: One factory CLI executable, with review and baseline commands, toward the keeper function

Lines marked **Owner** are what the owner said on 2026-11-14 (in the Shinatama
design conversation); lines marked **Call** are choices made while implementing
and are open to correction.

## Context

**Owner**, 2026-11-14, while designing Shinatama's assistant mode and its skill
catalog:

- "partiamo col dare a Muro la capacità di avere un eseguibile con parametri
  cli. Sia per richiamare armonizzatore, con comandi per review, update delle
  baseline, nuovo intake ecc ecc".
- The direction this serves: "le logiche di adattamento e conversione, muro le
  ha già tutte, quindi può essere un modulo condiviso/importato in shinatama
  come tool"; "muro può creare un exe con un comando che converte una skill o
  un plugin per un dato harness"; "quindi cambierebbe un po' anche l'identità
  di muro".
- The two functions of that identity: "ha funzione di harmonizer e creatore di
  un unico plugin a partire da molti — oppure il tenere un plugin aggiornato,
  installato nelle harness desiderate e in caso di adattarlo per l'harness
  specifico".

So Muro gains a second product shape alongside the factory: a command-line tool
that other software (first consumer: Shinatama, as a pinned executable) and
people can call for one operation at a time. This record covers the first step:
the CLI itself, with the factory's existing operations as subcommands plus the
two the owner named that did not exist — review and baseline. The keeper
function (adapt one skill/plugin for a given harness, install it, keep it
updated — "uno → molte harness") is the direction, not this change; its
commands come with their own record once designed.

ADR-0011's boundary ("Muro is only the factory; packages are their own
product") is not moved by this change: the CLI exposes factory operations.
The identity extension the owner described will amend it when the keeper
commands arrive.

## Decision

1. **One CLI, two surfaces.** `muro <command>` (also `python -m muro`) is the
   interface; the legacy flag interface (`muro_build.py --validate ...`) keeps
   working unchanged, because the README quickstart, the release workflow and
   the verification records use it. Both run the same command functions in
   `muro/cli.py`; detection is by the presence of a legacy action flag.
2. **Commands.** `validate`, `check-sources [--offline-pins]`,
   `build [--out] [--host-root]`, `intake <source-id>` (the owner's "nuovo
   intake": the source is added to the manifest first, then prepared),
   `harmonize`, `review`, `baseline [--json]`, `eval prepare`,
   `eval score <decisions>`. Each takes `--manifest` (default `sources.json`).
3. **`review`** prepares an evidence bundle (manifest, catalog, delivery
   decisions, the review prompt `prompts/review.md`) in
   `.muro/factory/review/` for the host AI to re-examine the package's
   recorded decisions against its pinned sources. Preparation only supplies
   evidence (ADR-0008): Python judges nothing, and the review rewrites nothing
   by itself — findings route through intake or harmonization. **Call:** a
   package's own prompts directory overrides per file; a package without its
   own `review.md` gets the factory's, so existing packages are reviewable.
4. **`baseline`** (the owner's "update delle baseline") reports, read-only,
   how each source's pin stands against its upstream: `release` pins against
   the newest same-prefix, non-prerelease tag by numeric order; `head` pins
   against the upstream HEAD; `static` pins are reported frozen. Exit 0 when
   everything is current or frozen, 1 otherwise, so a watcher (Shinatama) can
   poll it. `--json` is the machine form. **Call:** tag ordering is a
   mechanical version sort, not a semantic judgment; an unreadable tag scheme
   is reported `unknown`, never guessed. Re-pinning itself stays the
   documented owner/AI procedure (AGENTS.md, "Adding or re-pinning a source");
   this command changes no manifest.
5. **Executable.** `pyproject.toml` declares the `muro` console script
   (`muro.exe` on Windows), stdlib-only at runtime as before. **Call and
   limit:** install editable (`pip install -e .`) from a checkout or an
   unpacked release source tree; a plain site-packages install cannot yet find
   `prompts/` and the packaged runtime, which sit next to the package. A
   single-file distribution (zipapp or native exe) needs those resources moved
   into package data first; that relocation is the recorded next step, not
   smuggled into this change.

## Consequences

- Shinatama (and anything else) can pin a Muro revision and call one operation
  per invocation with a stable exit code and, for `baseline`, machine-readable
  output.
- Two new factory operations exist that the flag interface never had; the flag
  interface itself is frozen as-is and gains no new flags.
- The keeper commands ("adapt", "install", "update" for one skill/plugin on
  one harness) have a CLI to land in when they are designed.

## Verification

`docs/verification/2026-11-14-CLI1-factory-cli.md`: full test suite, both
interfaces on Marionette, a staged build, `check-sources` against the pinned
remotes, and a live `baseline` run that found one source genuinely behind
(genoffice v0.12.852 → v0.13.18) with every other pin current.
