---
adr_id: ADR-0014
version: 1
title: Discovery entries — AI-authored area skills that route into the one coordinator
status: Proposed
author: Alfio Caprino
scope:
  paths:
    - muro/entries.py
    - muro/adapters.py
    - muro/release.py
    - muro/cli.py
    - muro/factory.py
    - prompts/harmonizer.md
    - examples/marionette/entries.json
  modules: []
  domains:
    - harmonization
    - release
    - multi-host
governs_symbols: []
depends_on:
  - ADR-0001
  - ADR-0008
  - ADR-0013
created_from_task: discovery-entries
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

# ADR-0014: Discovery entries

## Context

The first live Claude Code runs (`docs/verification/2026-11-11-claude-code-host-test.md`)
showed the single umbrella skill losing description-based discovery: to the still
installed originals, and, with those switched off, to a narrower bundled skill
(`dataviz` for a dashboard request). A description that covers every area of a
package is weaker than one written for a single kind of request. The owner chose
this option ("1") among area entries, exclusive installation and explicit
invocation only.

## Decision

- A package may carry `entries.json`: `entries` of `{name, description, capabilities}`.
  The harmonizing AI authors and reviews
  it (`prompts/harmonizer.md`, "Discovery entries"): the grouping and the wording
  are semantic decisions and never come from Python.
- Python (`muro/entries.py`) checks only structure: exact keys, kebab-case names
  that start with `<command>-`, unique names, one-line descriptions of at most
  1024 characters, known capability ids, and full coverage (every capability is
  in an entry). `--validate` and the build apply it;
  invalid entries stop the build before any output is staged.
- The build emits one skill folder per entry in every host adapter, holding only
  `SKILL.md`: the same protocol and embedded classification rules as the umbrella
  skill, the entry's own name and description, a scope line, and the instruction
  to classify against the whole returned catalog. Entries run the umbrella
  folder's runtime (`${CLAUDE_PLUGIN_ROOT}/skills/<command>/muro.py` on Claude Code,
  `<skill-directory>/../<command>/muro.py` elsewhere); `INSTALL.md` says to install
  them beside it.
- On Claude Code each entry declares `user-invocable: false`: the model can invoke
  it, but the slash menu keeps one user-facing command, `/<command>`, consistent
  with ADR-0001 INV-003. Other hosts get no such field.
- Entries are discovery metadata, outside the catalog digest: changing them does
  not invalidate stored classifications.
- A description is written to frontmatter as a plain scalar when that is safe
  and as a double-quoted string otherwise (`: `, ` #`, a leading YAML
  indicator). Found live on 2026-11-11: the engineering entry's unquoted
  description made its frontmatter invalid and Claude Code did not list it.

Marionette declares five entries (web design, motion, Office, explainer,
engineering). A first version let a capability be `unrouted` and left `work-map`
out "pending the owner's decision on software work". That was a misreading, and
the owner corrected it the same day: a package's scope is what its intake
absorbed, so there was no decision to wait for. `unrouted` was removed.

## Consequences

- Each entry adds one description to every session's skill listing.
- On hosts without a hidden-skill field, entries can appear as separate skills.
- Entries improve the chance of being found, not the quality of a decision; the
  live result is recorded in the verification file.

## Confirmation

`python -m pytest -q tests/test_discovery_entries.py`, the full suite,
`--validate` on Marionette, and the live discovery rerun in the verification record.
