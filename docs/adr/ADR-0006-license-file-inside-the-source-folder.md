---
adr_id: ADR-0006
version: 1
title: License file declared inside the source folder
status: Proposed
author: Alfio Caprino
scope:
  paths:
    - muro/sources.py
    - sources.json
  modules: []
  domains:
    - licensing
    - factory
    - release
governs_symbols: []
depends_on: []
created_from_task: license-path-gate
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

# ADR-0006: License file declared inside the source folder

<!-- adr-header:start -->
Version 1 · Proposed 2026-11-09 by Alfio Caprino
<!-- adr-header:end -->

## Context and Problem Statement

ADR-0002 requires a root `LICENSE`. Some repositories have none and license each
skill folder separately: `anthropics/skills` carries `skills/pptx/LICENSE.txt`,
`skills/docx/LICENSE.txt` and so on, all Apache-2.0, and no root license. The
gate rejected them with "root LICENSE missing" although the selected files are
plainly licensed. The owner asked for the gate to be extended.

The same repositories exposed a gap in the nested-license check: it only looked
for a file named exactly `LICENSE`, so a folder holding `LICENSE.txt` under a
root-licensed repository silently inherited the root license.

The rule below is an implementation choice made for the owner's request to
extend the gate; its text is not separately approved.

## Decision Drivers

- The gate must still verify the actual license text at the pinned commit.
- A license must never be stretched over files outside the folder it sits in.
- A more specific license must never be overridden without an explicit choice.

## Decision

A source may declare `license_path`, a plain repository-relative file path. When
absent, the license is the root `LICENSE`, as before.

The declared file must exist as a regular file at the pinned commit and match
the declared MIT or Apache-2.0 text under the existing rules (ADR-0005). It
covers only its own folder: every selected path must lie under the directory
that contains the license file, otherwise the check fails. Two folders with
their own licenses are therefore two source entries.

For any selected path, a license file in a directory deeper than the verified
license stops the check. Recognized names are `LICENSE`, `LICENSE.txt`,
`LICENSE.md`, `LICENCE`, `LICENCE.txt`, `LICENCE.md` and `COPYING`. Declaring
that deeper file as `license_path` is the explicit, reviewed choice.

The `NOTICE` carried into a release is the one beside the verified license: the
root `NOTICE` for a root license, `<folder>/NOTICE` for a declared one.

## Verified Interview Examples

- **EX-001** (folder license): no root `LICENSE`, `skills/demo/LICENSE.txt`
  declared, `skills/demo/SKILL.md` selected. Expected: accepted.
- **EX-002** (not declared): same repository without `license_path`. Expected:
  "root LICENSE missing".
- **EX-003** (stretching): `skills/pptx/LICENSE.txt` declared and
  `skills/docx/SKILL.md` selected. Expected: rejected as outside the folder
  covered by `license_path`.
- **EX-004** (deeper license): `skills/demo/vendor/LICENSE` exists and
  `skills/demo/vendor/part.md` is selected under `skills/demo/LICENSE.txt`.
  Expected: nested license requires review; accepted once the deeper file is the
  declared one.
- **EX-005** (other file names): a root-licensed repository with
  `sub/LICENSE.txt` and `sub/file.md` selected. Expected: nested license
  requires review.

## Rejected Alternatives

- **RA-001**: search the tree for the nearest license automatically. Rejected
  because choosing which license governs a file is a rights decision that must
  be visible in the manifest.
- **RA-002**: accept a list of license paths per source. Rejected for now: one
  verified text per source keeps `LICENSES/<id>.txt` and `NOTICE.md` unambiguous.
- **RA-003**: trust the license named in a README. Rejected because only the
  license text at the pinned commit is verified.

## Enforceable Invariants

- **INV-001**: a source passes only when its license file, root or declared,
  matches the approved text at the pinned commit.
- **INV-002**: with a declared `license_path`, a selected path outside that
  file's directory fails the check.
- **INV-003**: a recognized license file deeper than the verified one fails the
  check for the selected paths under it.
- **INV-004**: an unsafe, missing, non-file or pattern `license_path` fails
  closed.

## Consequences

Third-party notices that a repository keeps elsewhere, for example a root
`THIRD_PARTY_NOTICES.md`, are not collected: they must be read during intake
when the selected files depend on them. Widening the recognized names can stop a
source that passed before; the seven sources registered on 2026-11-09 still pass.
The requirement that the pinned commit equal the remote HEAD is unchanged.

## Confirmation

Run `python -m pytest -q tests/test_license_path_gate.py` and
`python muro_build.py --check-sources`. Check a real folder-licensed repository
through `check_sources` with and without `license_path`.
