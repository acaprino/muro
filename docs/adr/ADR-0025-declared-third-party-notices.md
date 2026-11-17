---
adr_id: ADR-0025
version: 1
title: Third-party notices declared by the source
status: Proposed
author: Claude Code
scope:
  paths: [muro/sources.py, muro/release.py, sources.json]
  modules: []
  domains: [licensing, factory, release]
governs_symbols: []
depends_on: [ADR-0002, ADR-0005, ADR-0006]
created_from_task: zero-slop-design-intake
proposed_on: 2026-11-17
accepted_on: null
---

# ADR-0025 — Third-party notices declared by the source

Date: 2026-11-17. Status: implements the owner's decision of the same day; this
explanatory text has not been separately approved.

## Context

The license gate verifies one license text for each source, checks nested
license files and rejects a selected file whose SPDX header names another
license. It cannot see inside a prebuilt file. zero-slop-design v0.2.1 ships
`tools/zsd.mjs`, a bundle of the project's own MIT code with ninety-three
third-party packages under MIT, ISC and Apache-2.0 (`@google/design.md` 0.4.0
among them). The bundle carries no SPDX header, so the gate accepts it as MIT,
and the aggregated `NOTICE.md` would have declared the source MIT and nothing
else. The upstream lists those packages and their license texts in
`THIRD_PARTY_NOTICES.md`, a file the gate did not know: it reads only a file
named `NOTICE` beside the verified license (ADR-0006).

## Owner decision

Asked whether to touch the factory, ship the notices only beside the bundle or
stay on an older release, the owner confirmed on 2026-11-17: pin the tag, ship
the notices beside the bundle, and add support in the factory as a field the
source declares, not as a file name written in the code.

## Decision

A source may declare `notice_paths`: a list of plain repository-relative file
paths. Each one must be a selected file that ships: a path that is not selected,
or that `intake_only_paths` keeps out of the package, fails the source check.
Globs, unsafe paths, duplicates and a value that is not a list fail closed.

The file travels as any selected file, under `scripts/<source-id>/`. For each
declared path the aggregated `NOTICE.md` adds one line under the source that
says where the third-party notices of its bundled code are. The text is not
copied into `NOTICE.md`: that file is repeated in every standalone host skill,
and the declared file is already packaged beside it.

Nothing is inferred from a file name. A selected `THIRD_PARTY_NOTICES.md` that
no source declares is packaged and not mentioned. Whether a source's files embed
third-party code is a finding of the intake that reads them.

## What this does not do

The gate still verifies one license per source and does not parse the declared
file or check that it covers what the bundle embeds: that is the review made
when the source is added or re-pinned. A license outside MIT and Apache-2.0
inside a bundle is not detected by this field.

## Verification

`tests/test_notice_paths_gate.py` covers the accepted case, the optional field,
a path that is not selected, a path kept at intake only, malformed and unsafe
values, a release without the declaration and a release with it, in the
aggregated notice and in every host skill folder. Results are recorded in
`docs/verification/2026-11-17-zero-slop-design-intake.md`.
