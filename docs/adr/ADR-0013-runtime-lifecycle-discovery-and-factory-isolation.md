---
adr_id: ADR-0013
version: 1
title: Slug-neutral step handoff, map completion lifecycle, low-ceremony batch CLI and factory isolation
status: Proposed
author: Alfio Caprino
scope:
  paths:
    - muro/core.py
    - muro/routing.py
    - muro/runtime.py
    - muro/adapters.py
    - muro/sources.py
    - muro/cli.py
    - muro/guide.py
    - muro/guide.html
    - prompts/classify.md
    - prompts/intake.md
    - examples/marionette/**
  modules: []
  domains:
    - factory
    - routing
    - coordinator
    - runtime
    - release
governs_symbols: []
depends_on:
  - ADR-0003
  - ADR-0004
  - ADR-0011
  - ADR-0012
created_from_task: full-360-audit-remediation
proposed_on: 2026-11-11
proposed_at_sha: 77b7a76584d996ca3a54b4ee12e4482f0c2842eb
accepted_on: null
accepted_at_sha: null
last_verified_sha: null
retired_on: null
retired_reason: null
supersedes: []
superseded_by: null
changes: []
---

# ADR-0013: Slug-neutral step handoff, map completion lifecycle, low-ceremony batch CLI and factory isolation

## Context and Problem Statement

A 360-degree audit of Muro and its `examples/marionette/` package on 2026-11-11
identified systemic defects across runtime handoff, map lifecycle, host-harness
UX, factory/package isolation (`ADR-0011`), and operational resilience:

1. `Coordinator` wrote `.<slug>/map.md` (`.marionette/map.md`), omitted `state_dir`
   and prior `outputs` from step payloads, while all 12 Marionette capabilities
   hardcoded `.muro/map.md` (masked in tests that omitted `sources.json`).
2. `state.json` had no completion state: after the first mapped plan, single-step
   `direct` mode (`REQ-010`) stopped working permanently, and a 1-word catalog
   update blocked brand-new tasks with a misleading `catalog_digest` error.
3. Host `SKILL.md` frontmatter emitted a domain-blind description, preventing
   natural-language skill discovery (`REQ-001`), while a 3-step plan required
   25+ CLI calls and ~21 temporary JSON files.
4. Marionette-specific names (`gsap`, `css-only`, `Figma`, `work-map`) remained in
   `muro/` and `prompts/classify.md`; duplicate capability selections were blocked
   even for distinct step instances; frontmatter parsing ignored unknown keys;
   locks carried no recovery token; and `GUIDE.html` hardcoded Italian UI over
   English catalog artifacts.

The owner authorized implementing all audit remediations (`"all"`). The wording
below records the implemented design and remains Proposed pending separate text
approval.

## Decision

1. **Slug-neutral handoff and discovery:**
   - Every `direct` and `step` instruction payload includes `state_dir`, `map_path`
     and `recorded_outputs`. Capability bodies reference `<state_dir>/map.md` and
     `recorded_outputs`; `--validate` rejects literal `.muro/` in capability bodies
     whenever `plugin.slug != "muro"`.
   - `SKILL.md` generates a bounded (`<= 1024` chars) `"Use when..."` description
     from `plugin.description` or the catalog's capability titles and intents.
   - `NOTICE.md` and `map.md` parameterize `{plugin.name}`.
2. **Map completion lifecycle and digest isolation:**
   - Maps track `map_status` (`active` or `completed`). `complete --map-id` (and
     atomic `step` on the final step when all declared checks are `pass` or
     `not-tested`) marks the map `completed`.
   - `direct` mode activates whenever `len(plan) == 1`, `new` is false and no
     `active` map exists, restoring zero-ceremony one-step execution (`REQ-010`).
     `record --direct` optionally saves `context-outputs.json` for cross-turn handoff.
   - Fresh tasks and completed maps do not validate an older map's `catalog_digest`;
     active incomplete maps with an outdated digest raise an error naming
     `state.json` and `--new`.
3. **Low-ceremony atomic `step`, multi-instance `step_id` and selective replan:**
   - CLI options accept inline JSON (`--classification-json`, `--outputs-json`,
     `--result-json`, `--step-json`) or `"-"` stdin (at most one stdin consumer
     per invocation), eliminating temporary files.
   - `step` validates `outputs` and batched `checks` in memory before publishing
     a single atomic state snapshot. Check results retain full append-only history
     while exposing `effective_checks` and `output_attestation` (`verified-file`
     vs `self-attested`, enforced strictly under `--verify-files` for `output_types`
     declaring `"path"`).
   - Repeated capabilities in one plan use explicit `"step_id": "<cap>#<n>"` with
     namespaced output keys (`<cap>#<n>.<key>`), while single-instance steps keep
     flat output keys. `--preserve-completed` retains verified upstream steps and
     their prerequisites across `--new` replans.
4. **Factory isolation, strict parser, tokened lock recovery and packaging:**
   - Stack detectors and conflict groups live in `sources.json` (`stack.detectors`,
     `stack.conflicts`); `prompts/classify.md` contains zero package-specific names.
   - Frontmatter parsing remains Python standard-library-only and rejects unknown
     keys and multiline `- ` YAML list lines.
   - `.write-lock` stores JSON `{pid, token, host, created_at}` and `unlock --token`
     atomically reclaims verified orphaned locks without unsafe PID signalling or
     racy TTL deletion; plain-text locks remain busy.
   - `_LAUNCHER` checks `ROUTER.md` presence before stepping up directories;
     `plugin.install_policy` (`auto` default per ADR-0007, or `confirm`),
     `plugin.language` (`en` default, or `it` for `GUIDE.html`), `--offline-pins`,
     and slimmed adapter `muro/` copies (omitting duplicate `cytoscape.min.js`
     while preserving `LICENSE`) complete the release contract.

## Amendment after the first live host test (same day)

The first live Claude Code run
([record](../verification/2026-11-11-claude-code-host-test.md)) showed that inline
and stdin JSON work against the host: a heredoc's newlines split the command, so
the `Bash(python *)` allow rule no longer matched, and the 29.4 KB
`classification-required` output was persisted to a file. Implementation choices:

- `plan --compact` returns the context, the returned `classification_path` and
  the catalog with empty fields and the `—` marker omitted, minified. The
  classification rules from `prompts/classify.md` are embedded in every
  generated `SKILL.md`, loaded once per session. `propose()` without `compact`
  is unchanged.
- The generated `SKILL.md` keeps every call on one line and has the host write
  each JSON (classification, step, direct outputs) with its file tool into the
  state folder, then pass the path. The inline and stdin flags remain in the CLI
  but are no longer recommended to hosts.
- The Claude Code `SKILL.md` declares
  `allowed-tools: Bash(python ${CLAUDE_PLUGIN_ROOT}/skills/<command>/muro.py *) Edit(./.<slug>/**)`;
  the grant lasts for the turn that invokes the skill. Other hosts get no rule.
- The runtime writes `.<slug>/.gitignore` (`*`) on its first write and when a
  classification file sits in the state folder.
- Isolated agents run a step only when it asks the user nothing.

## Enforceable Invariants

- **INV-001**: When `plugin.slug != "muro"`, any capability body containing `.muro/` fails validation.
- **INV-002**: An invalid check in an atomic `step` batch leaves `state.json` byte-identical.
- **INV-003**: A completed map never blocks `direct` mode or fresh-task routing after a catalog update.
- **INV-004**: `prompts/` contains no Marionette-specific dependency or capability identifiers.
- **INV-005**: Unknown frontmatter keys and token-mismatched `unlock` calls fail closed.

## Confirmation

Run `python -m pytest -q` (including `tests/test_audit_p0.py`,
`tests/test_audit_p1.py` and `tests/test_audit_p2.py`) and
`python muro_build.py --manifest examples/marionette/sources.json --validate`.
