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
