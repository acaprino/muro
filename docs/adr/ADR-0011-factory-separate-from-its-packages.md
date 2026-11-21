---
adr_id: ADR-0011
version: 1
title: The factory is separate from the packages it builds
status: Proposed
author: Alfio Caprino
scope:
  paths:
    - muro/factory.py
    - muro/release.py
    - examples/marionette
  modules: []
  domains:
    - factory
    - release
governs_symbols: []
depends_on: []
created_from_task: factory-separate-from-packages
proposed_on: 2026-11-10
proposed_at_sha: 77b7a76
accepted_on: null
accepted_at_sha: null
last_verified_sha: null
retired_on: null
retired_reason: null
supersedes: []
superseded_by: null
changes: []
---

# ADR-0011: The factory is separate from the packages it builds

## Context

Owner correction of 2026-11-10: "muro è il progetto che data una lista di plugin
e skill li unifica in un coerente plugin intelligente"; "queste skill che stai
unificando ora vanno in un pacchetto a sé, non sono parte di Muro"; "deve essere
un esempio di un plugin, che puoi chiamare es. marionette". Dependencies such as
GSAP or Chrome "sono da valutare runtime caso per caso".

Until then the design, motion, Office and explainer catalog lived in the
repository root and carried the plugin identity `muro`, so the factory and one
of its outputs looked like the same thing.

## Decision

- Muro is the factory: `muro/` (validation, build, runtime, adapters, guide),
  `prompts/` and `muro_build.py`. It holds no package-specific knowledge.
- A package is a directory with `sources.json`, `capabilities/`, `ROUTER.md` and
  `guide-examples.json`. Every command takes it through `--manifest`.
- The example package is `examples/marionette/`, with plugin identity
  `marionette`. Its outputs (`dist/`, `.muro/factory/`) stay under its directory.
- Prompts and the shipped runtime come from the factory. A package directory
  that has its own `prompts/` or `muro/` uses those instead.
- No dependency manifest gate: the host AI judges at runtime what a task needs
  and installs what is missing (ADR-0007). `runtime_deps` is intake guidance.

## Consequences

- `python muro_build.py --validate` without `--manifest` finds no package in the
  repository root.
- The released launcher is still `muro.py` and the runtime package `muro`: that
  is the factory's engine inside every plugin, not the plugin's name.
- An earlier, uncommitted ADR-0011 draft (intake dependency audit with a build
  gate) was withdrawn the same day and never took effect.

The decisions are the owner's; this wording is not separately approved.

## Amendment: a package is released from its own repository (2026-11-19)

Owner request of 2026-11-19: "dobbiamo portare marionette in una repository
pubblica a sé, cambiando anche il flow di rilascio in muro quando compila
marionette, creando PR verso branch marionette". Until then Marionette
0.2.0 to 0.4.0 were published among Muro's own releases, beside `muro-v*`, and
`acaprino/marionette` held only its first build, `v0.1.0`.

- Marionette's releases are published from `acaprino/marionette`, public, with
  the tag `marionette-v<version>` and the same zip layout as before
  (`marionette-<version>.zip` holding `marionette/`, and its SHA-256).
- Muro still builds it. The package source stays in `examples/marionette/`:
  the request names Muro as the place where Marionette is compiled, and the
  factory's own checks run on it. Moving the source is a separate decision.
- The `Release Marionette` workflow, still on the owner's request, pushes the
  build as `marionette/` and its notes as `releases/<tag>.md` to the branch
  `release/<tag>` of that repository, where a workflow opens the pull request
  into `main`. Merging it is the release, as a merge into `main` is everywhere
  else; the repository's `release.yml` then publishes the tag and the assets.
- It refuses a tag that exists in either repository, so a version published
  here is never published again there.
- The push uses a write deploy key of `acaprino/marionette` only (secret
  `MARIONETTE_DEPLOY_KEY`), not a personal token.

Implementation choices, not the owner's words: the deploy key, the branch
name, the notes file and the build kept whole in Git (280 MiB, 12,060 files,
none over 5 MiB, measured on the 0.4.0 build of 2026-11-19).

## Amendment of 2026-11-21

Merging a change to `examples/marionette/sources.json`'s `plugin.version` into Muro's `main`
requests a new package build. GitHub Actions starts it automatically. The manual trigger remains
available for recovery. The owner can review the generated package in its release PR before merging
it to publish the archive and checksum. The factory and package retain their independent versions.
