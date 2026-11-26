---
adr_id: ADR-0035
version: 1
title: The plugin of one harness is extracted from the project file
status: Proposed
author: Claude Code
scope:
  paths: [muro/project.py, muro/cli.py, tests/test_project_extract.py, crates/muro-desktop-runtime/src/projects.rs, apps/desktop/src/pages/project/write/ExtractDialog.tsx]
  modules: []
  domains: [projects]
governs_symbols: []
depends_on: [ADR-0028, ADR-0034]
created_from_task: project-extract
proposed_on: 2026-11-26
accepted_on: null
---

# ADR-0035: The plugin of one harness is extracted from the project file

Date: 2026-11-26. Status: Proposed. The request is the owner's, in the words quoted
below. The command, the action and this text are implementation choices and are not
separately approved.

## Context

A `.mp` carries the built plugin of every harness (`release/<slug>/adapters/<harness>/`,
each with its own `INSTALL.md`). A project store puts all of them in a repository
(ADR-0034). Someone who wants the plugin of one harness on their computer had to
unpack the whole project (`muro project unpack`) and find the folder.

## The owner's words (2026-11-26)

- "muro deve aer eufnzione per crare estrazione adattata a claude code, o codxe o
  altri harnes suspportati a partire da mp"
- "come favea daodan una volta che era multiharness"
- On where it lives, offered the two choices, the owner chose the button in the app
  and the command ("Pulsante nell'app e comando").

## Decision

`muro project extract FILE.mp --harness H --out DIR`, and **Extract…** in the window
(`extract_project`), write what the file carries for `H` into `DIR/<H>/`.

## Implementation choices (not separately approved)

- Nothing is built or adapted again: the folder is the file's, byte for byte, as a
  release of a store publishes what the file holds (ADR-0034, decision 3).
- The file is verified first (`muro project verify`).
- One harness per call. For `hermes`, `hermes-mcp/` comes with it when the build has
  it, because Hermes's `INSTALL.md` reaches the server package as `../hermes-mcp`.
- `DIR` may hold other things; a folder that would be written must not be there.
  Nothing is overwritten or removed, except what this call itself half wrote.
- The harnesses offered are the build's folders that hold an `INSTALL.md`. The window
  offers the five Muro builds; the command refuses one the build lacks.
- No store layout (root marketplaces, notes) is written: pushing the file does that.

## Not done

- Installing from a repository's address on Pi or OpenCode, which Daodan's former
  multiharness repository offered. A store writes the root marketplaces of Claude
  Code and Codex only (ADR-0034).

## Not run

- Rust and the window are not compiled or run on the owner's computer: GitHub Actions
  builds and tests them.
- No extracted folder was installed in a live harness for this change.
