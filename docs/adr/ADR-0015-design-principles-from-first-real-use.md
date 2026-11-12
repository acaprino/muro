---
adr_id: ADR-0015
version: 1
title: Design principles learned from the first audit and live host tests
status: Proposed
author: Alfio Caprino
scope:
  paths:
    - muro/**
    - prompts/**
    - tests/**
    - AGENTS.md
  modules: []
  domains:
    - factory
    - coordinator
    - runtime
    - verification
governs_symbols: []
depends_on:
  - ADR-0003
  - ADR-0013
  - ADR-0014
created_from_task: lessons-from-first-real-use
proposed_on: 2026-11-11
proposed_at_sha: 4c77a6c
accepted_on: null
accepted_at_sha: null
last_verified_sha: null
retired_on: null
retired_reason: null
supersedes: []
superseded_by: null
changes: []
---

# ADR-0015: Design principles learned from the first audit and live host tests

## Context

On 2026-11-11 Muro was audited, replayed against its own runtime and run for the
first time inside a real host (records:
`docs/verification/2026-11-11-full-audit-remediation.md`,
`docs/verification/2026-11-11-claude-code-host-test.md`). The owner asked that the
failures, attempts and successes refine the specifications, code and prompts
("apprendere da questi fallimenti, tentativi e successi"). The principles and
their wording below are this record's reading of that evidence, not separately
approved text.

What the evidence showed, in one line each:

- Almost every failure appeared the second time: second turn (refinement
  archived the map), second task (`direct` dead after one map), second run
  (preparation and build refused existing output), second version (upgrade
  blamed the new decision), second package (`.muro/` paths under `.marionette/`).
- Where Python stood in for meaning with a proxy, it was wrong: step count for
  step weight, task string for task identity.
- 228 green tests hid defects that one run from outside exposed: the test slug
  equalled the default, AI decisions were fixtures, no host had ever loaded the
  plugin.
- Each safeguard was sensible alone; nobody had summed them: 25 calls and about
  6,000 tokens per task, and a "no temp files" fix that broke host permissions.
- Discovery, not routing, was the first real problem: 0 of 3 before area entries,
  3 of 4 after; the remaining loss was to installed originals of absorbed sources.
- AI classification, the centre of ADR-0003, was right every time it ran live.

## Decision: one rule about scope, then five principles with their mechanisms

0. **Scope is set at intake.** Muro builds a plugin for an agent harness out of
   the skills and plugins put through intake. What those sources do, the plugin
   does: code, design, documents or anything else. No other lever exists and
   none is added: no domain allow-list, no capability hidden from discovery, no
   question to the owner about whether a covered domain is wanted. Owner
   correction of 2026-11-11, after this record's author asked exactly that
   question about software work ("lo stabilisce il fatto se aggiungiamo o meno
   skills o plugins in intake che lavorano su codice").
   - `entries.json` requires every capability to be in an entry (ADR-0014).
   - Eval cases expect what the catalog covers; `no_match` is for requests no
     absorbed source serves.

1. **Design for the second time.** Every flow is specified and tested on its
   second pass as well as its first.
   - Preparation commands replace their own previous output and refuse only when
     the folder holds files Muro did not write.
   - `--build --out <dir>` stages a release anywhere; `dist/` stays protected.
   - `plan --amend`: when the user refines a request that has an active map, the
     host classifies the refined request and the runtime starts a new map that
     carries over every step whose recorded work is still valid. A kept step is
     stale, and is redone, when an `after` prerequisite, an applying `needs`
     prerequisite or the producer of an output it `reads` is redone. The earlier
     map is archived as before.
2. **Declare, do not infer.** A fact the runtime needs about meaning is
   AI-authored catalog data, or an AI judgment, never a Python proxy.
   - `resumable: true` (optional capability frontmatter): a long or interactive
     step gets a map even as the only step, returned as `confirm` with
     `approval: not-needed`. Step count no longer stands in for step weight.
   - `plugin.replaces`: the skills and plugins a package absorbs. Every
     `INSTALL.md` tells the user to switch them off, because an installed
     original competes for the same requests.
   - Discovery entries (ADR-0014) and `needs` (ADR-0012) follow the same rule.
3. **Verify from outside.** Fixtures prove mechanics only.
   - Routing eval: a package may carry `eval-cases.json` (request, stack tokens,
     expected status and ordered capabilities, including near-misses and
     `no_match`). `--prepare-eval` writes the rules, compact catalog and case
     contexts for the host AI, never the expectations; `--score-eval` validates
     each decision with the runtime's rules and compares. Python does not classify.
   - A contract change that touches the host protocol is run once in a real host
     before it is called done, with the recipe in AGENTS.md, and the result goes
     in `docs/verification/` with its cost and sample size.
   - Tests of package behaviour use a package whose slug differs from the default.
   - Before reasoning about why a skill is not chosen, confirm the host lists it.
     A skill with invalid frontmatter is dropped without an error: the
     engineering entry was never loaded (an unquoted `: ` in its description),
     and two rounds of analysis blamed a competing skill and the host's habits
     for what was a generator bug. Generated frontmatter values are quoted when
     YAML requires it, and the author's words are never reworded to fit.
4. **Fit the host, measured.** The host's own mechanics are part of the contract.
   - One-line calls, JSON written by the host's file tool, pre-approval through
     the host's own field, output small enough to be shown inline (ADR-0013
     amendment).
   - What is already in the conversation is passed to the step, not asked again.
   - Calls, denials and cost per task are recorded in every live verification.
5. **Keep AI semantics, shrink ceremony.** Live runs confirmed ADR-0003; they did
   not confirm that more protocol means more assurance. A safeguard is added with
   its per-task cost stated, and removed when nothing verifies what it records.

## Amendment after the second-source intake (same day)

Adding one source of six capabilities to Marionette (12 to 18) tripped two limits
that held only at the first size. Both are instances of principle 1 and of rule 0:
a limit that stops the next intake is a second lever on scope.

- **Router cap.** `parse_router` rejected any `ROUTER.md` over 80 lines, table
  rows included (ADR-0002 INV-001, written when the router was the model's
  reading). The table grows by one row per capability, so the cap now counts
  only lines outside the table. The harmonization record still has to stay short.
- **Compact catalog.** The full compact catalog grew from 16.2 KB to 25.6 KB,
  close to the size the host stopped showing inline (29.4 KB). `plan --compact
  --focus <ids>` returns the named capabilities in full and every other one as a
  brief index (id, role, intent ids and descriptions, `brief: true`);
  `--brief` returns the index alone. Nothing is hidden from the classifier, and
  it is told to refocus before selecting a brief entry. An entry skill asks for
  its own capabilities in focus; the umbrella skill starts from the index.
  Measured on Marionette: index 9.4 KB, focused views 10.7 to 12.9 KB. Cost: one
  more `plan --compact` call when the task needs a capability outside the focus.
  Classification is still validated against the whole catalog and its digest.

## Amendment after the first run on every host (2026-11-12)

Codex, OpenCode and Pi ran Marionette live for the first time
([record](../verification/2026-11-12-all-hosts-live.md)). Two findings changed
the build and the runtime, both under principle 4 (fit the host):

- **No live copies of absorbed originals.** Codex registers every `SKILL.md`
  under a skills folder, at any depth, so the source skills packaged as helpers
  became 19 competing skills, and one run read an original instead of the
  coordinator. Packaged source skills are now `SKILL.source.md`; capability
  bodies use that name and validation enforces it.
- **A step states its scope and its submission.** Pi confirmed a two-step map,
  did both steps and never submitted. Each mapped step now returns `scope`,
  `remaining_steps` and the exact `submit` arguments, and `checks` returns
  `submit_check` and `submit_complete`. In the next run every host, Pi included,
  closed the map. Cost: a few hundred characters per step result.

## Enforceable Invariants

- **INV-000**: every capability in a package's catalog is reachable through a
  discovery entry; scope changes only by adding or removing a source.
- **INV-001**: preparation and eval commands succeed when rerun unchanged, and
  never delete a file they did not write.
- **INV-002**: `--amend` without an active map fails; with one, it never carries
  over a step whose declared inputs are redone.
- **INV-003**: `direct` versus mapped execution of a single step depends on the
  capability's declared `resumable`, on no heuristic.
- **INV-004**: the eval prompt contains no expectation; the scorer accepts only
  decisions that pass runtime validation.
- **INV-005**: `plugin.replaces`, when declared, appears in every host's `INSTALL.md`.
- **INV-006**: every generated `SKILL.md` description is a valid YAML scalar that
  round-trips to the authored text.
- **INV-007**: a focused or brief catalog lists every capability of the package;
  a focused entry equals its full compact entry; an unknown focus id fails.
- **INV-008**: the router cap counts text lines only, never catalog rows.
- **INV-009**: no file named `SKILL.md` exists below a host skill folder of a
  release except each skill's own.
- **INV-010**: a mapped step result names its remaining steps and the exact
  arguments that submit it.

## Open questions for the owner

- Whether `--build` should keep failing when a `head` source moved (ADR-0009), now
  that `--out` makes rebuilding routine.
- Whether the absorbed originals on the owner's own hosts are switched off.

## Confirmation

`python -m pytest -q tests/test_lessons.py`, the full suite, `--validate`, and the
eval result recorded in `docs/verification/2026-11-11-claude-code-host-test.md`.
