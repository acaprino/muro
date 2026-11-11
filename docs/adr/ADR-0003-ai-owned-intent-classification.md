---
adr_id: ADR-0003
version: 1
title: AI-owned intent classification from intake to runtime
status: Proposed
author: Alfio Caprino
scope:
  paths:
    - prompts/**
    - muro/routing.py
    - muro/runtime.py
  modules: []
  domains:
    - factory
    - routing
    - coordinator
governs_symbols: []
depends_on:
  - ADR-0001
  - ADR-0002
created_from_task: ai-owned-intent-classification
proposed_on: 2026-11-09
accepted_on: null
proposed_at_sha: 2e0fa680e6efd66d29d2d088294d39baf7fcc761
accepted_at_sha: null
last_verified_sha: null
retired_on: null
retired_reason: null
supersedes: []
superseded_by: null
changes: []
---

# ADR-0003: AI-owned intent classification

## Context and authorization

The owner explicitly requires AI classification for every absorbed skill/plugin
and for runtime requests. The owner authorized fixing the complete flow and
updating prompts, router, ADR, README and AGENTS.md. This decision amends the
routing/frontmatter portions of ADR-0002; its license, branding and sequential
execution requirements remain applicable. Technical JSON field choices below
are implementation decisions, not separately client-validated requirements.

The previous runtime used `_INTENT_KEYWORDS`, substring matching in
`infer_roles()`, automatic stack-variant expansion, and a coordinator fallback.
Consequently `hero` could imply animation and a new domain needed Python edits.
The existing factory already delegates semantic work to the host AI through
prompts; the runtime must use the same ownership boundary.

## Decision

- **Intake AI owns classification.** Each capability declares a nonempty
  `intents` array of `{id, description, excludes}` records. IDs are an open
  vocabulary derived from the source's actual purpose; a plugin can supply
  multiple skills/intents. Provenance documents which selected source supplied
  each competence. Intent is a desired outcome, role is a workflow responsibility,
  and `when` contains only factual `stack:*` constraints (or `—`). Mandatory
  `tools` and `hooks` arrays capture adopted operational requirements. Tools
  declare name, purpose and required; hooks declare event, action, tool references
  and manual/host-approved policy. The host AI checks availability and permission;
  metadata neither registers hooks nor executes them. Empty arrays describe only
  the selected/adapted scope, not all upstream defaults.
  `conflicts` declares incompatible capability IDs across any roles. The current
  schema has ten mandatory frontmatter fields; the router remains six columns.
- **Harmonizer AI owns the catalog.** It normalizes equivalent intents, preserves
  distinct outcomes and source coverage, resolves merges/variants/dependencies,
  and copies intent IDs into the sixth `ROUTER.md` column. Neither preparation
  command runs an LLM or synthesizes semantic classifications in Python.
- **Host AI owns runtime selection.** `plan` without a classification returns
  `classification-required`, the runtime prompt and compact capability metadata.
  The host reasons over the request and project context and supplies JSON through
  `--classification`. It explicitly selects capability/intent pairs with reasons,
  or returns `no_match` / `needs_clarification`. These are not coordinator fallbacks.
- **Python owns mechanics.** It validates schema, task/stack/catalog binding,
  known capability/intent pairs, incompatible or duplicate-role selections and
  dependency constraints; orders only the selected capabilities and prerequisites;
  and handles confirmation, outputs and checks. It never infers meaning from text,
  expands every animation into scroll implementation, or changes an AI selection.
- **State and packaging preserve the contract.** Confirmed maps retain the
  classification and catalog digest. Resume reuses that decision, never reclassifies
  by keywords. Legacy or stale maps fail with migration guidance; `--new` archives
  previous evidence. All five independently installable host skills include the
  runtime prompt and instruct their AI to perform this handoff.

The resulting decision structure is a graph: alternatives share a role/outcome
and differ by constraints; complementary stages are linked by `after`. The AI
builds and selects meaningful paths; Python checks references and ordering.

## Non-interference

The owner additionally requires that combined skills not overwrite, contradict,
cancel or damage each other's work, and asks for autonomous implementation choices.
The AI must analyze competing authority, shared artifacts, tool effects and hooks
when building/selecting the graph. Python rejects declared cross-role conflicts,
duplicate role variants and multiple producers of an output before execution.
Compatible stages use explicit prerequisites and consumed outputs, not parallel
writers. Undeclared semantic/file effects still require AI inspection and actual
checks; these mechanics are not a guarantee of semantic correctness.

State mutations hold an exclusive writer lock around the complete read/modify/write
transaction. A second writer fails without changing evidence. Crash-left locks
require operator verification rather than automatic deletion. Existing map data
is archived on an explicitly confirmed fresh classification, not silently replaced.
## Alternatives considered

Keyword lists or a hardcoded UI taxonomy violate the owner's requirement.
A new server-side LLM SDK would duplicate the host AI and introduce credentials,
providers and dependencies without a requirement. The chosen host-AI protocol
uses the existing prompt-driven architecture and Python standard library.

## Acceptance and verification

Missing classification cannot execute a capability. A static hero cannot be
automatically routed to motion; a motion specification cannot automatically imply
scroll code. A new non-UI intent works without Python changes. Invalid/stale AI
responses, contradictory variants and incompatible prerequisites are rejected
without writing state. Multi-step resume keeps its decision and evidence.

Automated tests simulate host AI responses and verify the handoff, not LLM
reasoning quality or model authorship. Real host sessions and semantic quality
evaluations must be reported separately. No script can prove that supplied JSON
was authored by AI; adapters and prompts establish that responsibility.
