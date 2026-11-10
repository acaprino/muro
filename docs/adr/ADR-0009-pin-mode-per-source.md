---
adr_id: ADR-0009
version: 1
title: Pin mode per source (release, head, static)
status: Proposed
author: Alfio Caprino
scope:
  paths:
    - muro/sources.py
    - sources.json
  modules: []
  domains:
    - factory
    - release
governs_symbols: []
depends_on: []
created_from_task: pin-mode-per-source
proposed_on: 2026-11-10
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

# ADR-0009: Pin mode per source (release, head, static)

<!-- adr-header:start -->
Version 1 · Proposed 2026-11-10 by Alfio Caprino
<!-- adr-header:end -->

## Context and Problem Statement

Until now the gate required every pinned commit to equal the upstream HEAD.
GenOffice commits many times a day, so `--check-sources` and `--build` broke
within hours of each re-pin, and each re-pin pulled in whatever commit happened
to be on top.

Owner decisions of 2026-11-10: "solo release pubblicate", "no HEAD di commit a
caso", and, for the upstreams that publish no release, "ogni intake ha una
modalità, o release o head commit, o static version", and `head` for the four
upstreams without a release. The modes and their assignment are the owner's;
the field names and the checks are implementation choices, and this text is not
separately approved.

## Decision Drivers

- A source must not change because an upstream pushed an unrelated commit.
- What a pin means must be visible in the manifest, not inferred.
- The exact commit stays the unit that is verified, licensed and packaged.

## Decision

Every source declares `pin`, one of:

- `release`: the commit is the one a published tag points to. The entry also
  carries `release`, the tag name. The gate asks the remote for that tag, peels
  an annotated tag, and fails unless it resolves to `commit`.
- `head`: the commit equals the upstream HEAD, as before. For a source that is
  deliberately followed commit by commit.
- `static`: the commit is a reviewed snapshot that follows nothing. The gate
  only requires that the commit exists and can be fetched.

`pin` is mandatory and never defaulted. `release` is required with
`pin: release` and refused with the other modes. `commit` remains a full SHA in
every mode; a tag never replaces it, so a tag moved upstream fails the check
instead of changing the package.

An upstream that publishes releases is pinned in `release` mode. An upstream
with no release or tag is pinned in `head` mode. `static` is available for a
source the owner wants frozen; no source uses it today.

## Verified Interview Examples

- **EX-001** (release): tag `v1.0.0` on the first commit, HEAD one commit later,
  entry pinned to the first commit with `release: v1.0.0`. Expected: accepted.
- **EX-002** (wrong commit): same tag, entry pinned to HEAD. Expected: "is not
  release v1.0.0".
- **EX-003** (unknown tag): `release: v9.9.9`. Expected: "release v9.9.9 not
  found".
- **EX-004** (head moved): `pin: head` on the first commit. Expected: does not
  match HEAD.
- **EX-005** (static): `pin: static` on the first commit. Expected: accepted.
- **EX-006** (undeclared): no `pin`. Expected: "pin must be one of release,
  head, static".

## Rejected Alternatives

- **RA-001**: keep HEAD for everything and re-pin often. Rejected by the owner.
- **RA-002**: remove the upstreams that publish no release. Not chosen: the
  owner asked for a mode per intake instead.
- **RA-003**: require the newest release. Rejected: a new upstream release would
  break the build again; adopting it is a reviewed re-pin.
- **RA-004**: ask the hosting service whether the tag is a published release.
  Rejected: the gate stays standard-library Git and host-neutral. Git proves the
  tag and its commit; that the tag is a published, non-draft release is checked
  at intake and written in the verification record.

## Enforceable Invariants

- **INV-001**: a source without a valid `pin` fails the check.
- **INV-002**: in `release` mode the remote tag must resolve to the pinned
  commit; a missing, malformed or moved tag fails closed.
- **INV-003**: in `head` mode the pinned commit must equal the upstream HEAD.
- **INV-004**: in every mode the pinned commit must exist and license,
  selection and packaging are read from it.

## Consequences

`--check-sources` and `--build` no longer fail because a release-pinned
upstream moved. They still fail when one of the four `head` sources moves,
until its diff is reviewed and it is re-pinned. Nothing tells the owner that a newer release
exists: updating is a deliberate re-pin with a reviewed diff. A `static` source
can fall arbitrarily far behind. Supersedes the sentence of ADR-0006 that the
pinned commit must equal the remote HEAD.

Moving to releases took two sources back to older content: GenOffice from an
unreleased commit to `v0.12.852` (skill 2.68.0) and UI UX Pro Max to `v2.15.0`,
80 commits behind the commit reviewed on 2026-11-09. See the verification
record of 2026-11-10.

## Confirmation

Run `python -m pytest -q tests/test_pin_modes.py` and
`python muro_build.py --check-sources`.
