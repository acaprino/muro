---
adr_id: ADR-0005
version: 1
title: Apache-2.0 appendix copyright notice in the license gate and NOTICE
status: Proposed
author: Alfio Caprino
scope:
  paths:
    - muro/sources.py
    - muro/release.py
    - sources.json
  modules: []
  domains:
    - licensing
    - factory
    - release
governs_symbols: []
depends_on: []
created_from_task: genoffice-integration
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

# ADR-0005: Apache-2.0 appendix copyright notice in the license gate and NOTICE

<!-- adr-header:start -->
Version 1 · Proposed 2026-11-09 by Alfio Caprino
<!-- adr-header:end -->

## Context and Problem Statement

ADR-0002 requires a root `LICENSE` whose normalized text matches the MIT or
Apache-2.0 template. The Apache-2.0 appendix tells licensors to replace
`Copyright [yyyy] [name of copyright owner]` with their own information. The
first real Apache-2.0 source, GenOffice, does exactly that
(`Copyright 2026 Mainfunc, Inc.`), so the whole-text hash rejected a license
whose terms are unchanged. The same source showed that the release collected
every license line beginning with the word "copyright" as a notice, including
wrapped lines of the license terms.

This record was written while implementing the owner's request to include
GenOffice. The rule below is an implementation choice made for that request; its
text is not separately approved.

## Decision Drivers

- The gate must keep failing closed on any change to the license terms.
- A license used the way its own appendix instructs is the approved license.
- `NOTICE.md` must list real copyright notices, never license prose.

## Decision

For Apache-2.0 only, before hashing, the gate restores the appendix placeholder
when the appendix contains exactly one line starting with `Copyright` and that
line is a plain notice: `Copyright`, optional `(c)` or `©`, a year or year
range, and an owner of at most 100 characters without brackets. Nothing else is
normalized; the result is compared with the unchanged template hash.

`NOTICE.md` lists, per source, the MIT header copyright lines or the filled
Apache appendix notice. An Apache license that keeps the placeholder contributes
no copyright line; its upstream `NOTICE` file is still reproduced.

## Verified Interview Examples

- **EX-001** (filled notice): the template with `Copyright 2026 Mainfunc, Inc.`
  in the appendix. Expected: the gate accepts it, with LF or CRLF line endings.
- **EX-002** (rider after the notice): the notice followed by a line such as
  `Non-commercial use only.` Expected: rejected as not matching the template.
- **EX-003** (changed terms): a grant clause shortened, with or without a filled
  notice. Expected: rejected.
- **EX-004** (notice extraction): a license laid out so that a terms line begins
  with `copyright license to reproduce`. Expected: `NOTICE.md` lists only
  `Copyright 2026 Mainfunc, Inc.` for that source.

## Rejected Alternatives

- **RA-001**: keep the exact-template hash. Rejected because it refuses every
  Apache-2.0 project that follows the appendix, without protecting any term.
- **RA-002**: ignore the whole appendix. Rejected because extra lines placed
  there would no longer be detected.
- **RA-003**: take the copyright line from `sources.json`. Rejected because the
  manifest field is declared by hand and not verified against the pinned commit.

## Enforceable Invariants

- **INV-001**: every Apache-2.0 difference other than one plain copyright line
  in the appendix fails the gate.
- **INV-002**: a missing year, a second `Copyright` line, added lines, or an
  owner longer than 100 characters in that slot fails the gate.
- **INV-003**: copyright lines in `NOTICE.md` come only from the MIT header or
  the Apache appendix notice of the verified license.

## Consequences

One line of an Apache license is accepted on its shape, not on a hash: text that
fits a plain copyright line is not inspected further. The gate still does not
prove ownership or the rights to every asset, as the README states. MIT handling
is unchanged.

## Confirmation

Run `python -m pytest -q tests/test_apache_notice_gate.py`,
`python muro_build.py --check-sources` and build a fresh release; read the
Apache source's block in `NOTICE.md`.
