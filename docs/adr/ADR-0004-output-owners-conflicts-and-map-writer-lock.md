---
adr_id: ADR-0004
version: 1
title: Output ownership, conflict guards and atomic map writes
status: Proposed
author: Alfio Caprino
scope:
  paths:
    - capabilities/**
    - muro/routing.py
    - muro/runtime.py
  modules: []
  domains:
    - harmonization
    - coordinator
    - runtime
    - factory
governs_symbols: []
depends_on: []
created_from_task: ui-ux-pro-max-integration
proposed_on: 2026-11-09
proposed_at_sha: 2e0fa680e6efd66d29d2d088294d39baf7fcc761
accepted_on: null
accepted_at_sha: null
last_verified_sha: null
retired_on: null
retired_reason: null
supersedes: []
superseded_by: null
changes: []
---

# ADR-0004: Output ownership, conflict guards and atomic map writes

<!-- adr-header:start -->
Version 1 · Proposed 2026-11-09 by Alfio Caprino
<!-- adr-header:end -->

## Context and Problem Statement

The runtime AI chooses capabilities and their intent pairs, but independent
capabilities can conflict on side effects or claim the same output. Older maps
could also lose evidence if two host processes performed read/modify/write
concurrently. The UI UX Pro Max integration makes these conflicts explicit
without adding semantic rules to Python.

## Decision Drivers

- Python must never infer intent or select a capability from task text.
- One owner per output and explicit sequential handoffs are required.
- Incompatible capabilities must stop before any tool runs or map is written.
- Previous task evidence must survive both conflicts and concurrent writers.

## Decision

Capabilities declare `conflicts`, an array of incompatible capability IDs.
During catalog construction and runtime resolution, Python validates the declared
references and rejects conflicting selections before execution. An output key
has one producer; a different role/capability cannot claim it later in the same
plan. Stack alternatives share an intent but never run as interchangeable
variants. Conflicts remain visible even when outputs were previously completed.

Map mutations acquire an exclusive `.write-lock` before reading state and retain
it through modification and atomic replacement of both `state.json` and
`map.md`. A busy map fails without changing evidence. The lock is not deleted
or treated as stale automatically. Previous maps are archived on confirmation
of a different/new task instead of being silently migrated.

Each map receives a fresh `map_id` when it is created, returned with every mapped
step. Outputs are accepted only with that `map_id` and the capability of the
active step; a check result only with that `map_id` and a capability of the plan
that owns the check, and is stored with its capability. Evidence for a replaced
map or another step fails without changing state. A state without `map_id` is
legacy and is not resumed. Capability bodies hand outputs over through
`## Output handoff` instead of writing the map, and reference helpers as
`<package_root>/scripts/<source-id>/...`, resolved with the `package_root`
returned by the runtime rather than against the consumer project.

## Verified Interview Examples

- **EX-001** (output conflict): two capabilities with different roles both
  declare `shared` as an output. Expected: resolution raises an output-producer
  conflict and writes no state.
- **EX-002** (declared conflict): `figma-design` and `motion-principles` are
  selected while their `conflicts` declarations include each other. Expected:
  selection is rejected before any tool or map write, including when outputs
  already exist.
- **EX-003** (busy writer): another process owns `.write-lock`. Expected:
  `record` fails with a writer/busy error and leaves prior state byte-identical.
- **EX-004** (late evidence): a host finishes a step of map A after another
  session replaced it with map B, for the same or a different task. Expected:
  `record` and `check` carrying A's `map_id` fail as stale and leave B's state
  byte-identical.
- **EX-005** (wrong step): outputs are submitted for `motion-principles` while
  `visual-direction` is the active step. Expected: rejection naming the active
  step; nothing is recorded.

## Rejected Alternatives

- **RA-001**: infer conflicts from roles or domains in Python. Rejected because
  roles are metadata, while actual incompatibilities belong to AI-authored
  `conflicts`.
- **RA-002**: atomic replacement without a writer lock. Rejected because a
  second process can still overwrite a newer read/modify/write cycle.
- **RA-003**: ignore conflicts when outputs are complete. Rejected because
  completed artifacts do not establish compatibility of subsequent work.

## Enforceable Invariants

- **INV-001**: every output key has exactly one producer in a resolved plan.
- **INV-002**: declared incompatible capability IDs are rejected before
  execution, regardless of previously satisfied outputs.
- **INV-003**: read/modify/write of a map holds one exclusive writer lock through
  both state and map replacement; a busy map is not overwritten.
- **INV-004**: outputs and check results are recorded only with the active map's
  `map_id` and, respectively, the active step's capability or the capability
  owning the check; any other binding changes nothing.
- **INV-005**: only the coordinator writes the managed map and state; packaged
  helper paths resolve under the returned `package_root`.

## Consequences

Capability metadata remains inert: `conflicts`, `tools` and `hooks` grant no
permissions and register no native hook. Tests supply AI decisions as fixtures;
they do not claim to evaluate semantic reasoning. Each host adapter must use the
same Python writer protocol and package the current runtime.

## Confirmation

Run the full pytest suite and `python muro_build.py --validate`. Verify a fresh
release, its launcher outside the checkout, and `claude plugin validate`. The
suite includes duplicate producers, declared conflicts, completed-output
conflicts, another-writer evidence preservation, stale-map and wrong-step
evidence, and the same binding through every packaged host launcher.
