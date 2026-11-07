---
adr_id: ADR-0001
version: 1
title: Muro is a factory that compiles curated skills into one multi-host coordinator plugin
status: Proposed
author: Alfio Caprino
scope:
  paths:
  modules:
  domains:
    - factory
    - intake
    - harmonization
    - coordinator
    - release
    - multi-host
governs_symbols:
depends_on:
created_from_task: brainstorm-muro
proposed_on: 2026-11-03
proposed_at_sha: null
accepted_on: null
accepted_at_sha: null
last_verified_sha: null
retired_on: null
retired_reason: null
supersedes:
superseded_by: null
changes:
---

# ADR-0001: Muro is a factory that compiles curated skills into one multi-host coordinator plugin

<!-- adr-header:start -->
Version 1 · Proposed 2026-11-03 by Alfio Caprino
<!-- adr-header:end -->

## Context and Problem Statement

The user has hundreds of plugins, skills and agents installed across several
agent hosts (Claude Code, Codex, Pi, OpenCode, Hermes). The cognitive load of
knowing which exist, what they are called, which combine with which, and when to
invoke them rests on the user. The model, in turn, receives a listing of
hundreds of names and chooses poorly among them.

The project D:\Projects\Muro has no code yet (2026-11-03). This record answers:
what kind of thing is Muro, and in which order are its parts built?

## Decision Drivers

- The user must never have to remember a skill name, install a plugin by hand,
  or know which skill pairs with which.
- The result must run identically on Claude Code, Codex, Pi, OpenCode and
  Hermes from the first release.
- Adding, updating or removing a source skill must not require manual
  re-harmonization of the whole plugin.
- Each absorbed source keeps its value (knowledge, resources, protocol) but
  loses its separate identity: one vocabulary, no duplicated rules.
- Every source must be open source under a permissive license, because the
  factory rewrites and redistributes its text.

## Decision

Muro has two layers, built in this order:

1. **The factory** (built first). A set of agents and scripts that produce the
   product plugin from a curated source list:
   - an *agent designer* that writes the agents the factory and the product need;
   - one *intake process per source* (analysis script plus intake agent), custom
     to that source, that decomposes it into Muro components;
   - a *harmonizer* (agents plus scripts) that deduplicates, aligns vocabulary,
     declares for every component when it activates, how (autonomous, after a
     short confirmation, inside a workflow) and what it hands to the next
     component;
   - a *release step* that regenerates documentation, host adapters and a new
     plugin version on every add, update or removal.
2. **The product**: a single coordinator plugin. The user speaks in natural
   language; the coordinator infers intent, asks one short confirmation, builds
   a task-specific work map in local markdown (decisions, prototypes to choose
   from, research), works it one step at a time switching on only the needed
   components, and keeps a feedback loop with the user through build and
   evaluation, not only planning. One universal command is the safety net on
   hosts without description-based activation.

The source list is curated by the user and grows one source at a time.

## Verified Interview Examples

- **EX-001** (nominal case): Input: user types "fai una landing page per
  questo prodotto, con un hero che si anima allo scroll" -> Expected: the
  coordinator confirms its reading in one line, runs a short brief, builds a
  map (direction, mockups, motion, scroll implementation), produces one or more
  mockups, lets the user choose, then builds; tasteskill v2, motion-design
  and GSAP ScrollTrigger knowledge activate per step, never all at once.
- **EX-002** (boundary case): Input: a task small enough for one step
  ("rinomina questa funzione") -> Expected: the map degenerates to one step and
  the coordinator does it without ceremony.
- **EX-003** (rejection or error case): Input: a source is added to the list
  by copying its files into the plugin without an intake process -> Expected:
  the harmonizer rejects the release; every source enters only through its own
  intake.

## Rejected Alternatives

- **RA-001**: Install the best plugins side by side and rely on the host to
  pick. Rejected: the user still carries the names, the plugins conflict and
  triplicate context.
- **RA-002**: A domain plugin (design and motion only). Rejected: the problem is
  universal; design was only the first example.
- **RA-003**: A generic compiler that ingests any list mechanically. Rejected:
  sources differ in nature (resource packs, protocols, technical knowledge);
  each needs a tailored intake.
- **RA-004**: Work map on a remote issue tracker (as wayfinder does). Rejected:
  Muro must work on projects without a remote repository and on every host;
  the map lives in local markdown in a dedicated, ignorable folder.
- **RA-005**: Claude Code first, other hosts later. Rejected: multi-host from
  day one, so the core stays host-neutral.
- **RA-006**: Absorbing commercial or login-gated sources (Craftwork was the
  first candidate). Rejected: rewriting and redistributing their text is a
  licensing problem; the first list drops Craftwork.

## Enforceable Invariants

- **INV-001**: The core (components, maps, protocols) contains nothing that
  depends on one host's hooks or mechanisms; host specifics live only in
  adapters.
- **INV-002**: Every component in the product was produced by a registered
  intake process for a source on the curated list.
- **INV-003**: The product exposes at most one user-facing command.
- **INV-004**: Every add, update or removal of a source regenerates
  documentation, adapters and a new release through the factory, never by hand.
- **INV-005**: No long autonomous run without a report to the user: each map
  step states what was done, what is proposed and what is asked.
- **INV-006**: Every source on the list is under a permissive open-source
  license (MIT, Apache-2.0, BSD or equivalent); the intake records license
  and copyright holder, the release carries the attributions, and a source
  failing the gate is refused at intake.

## Consequences

- The first implementation work is the factory, not the product.
- The repository holds: the curated source list, one intake per source, the
  harmonizer, the release pipeline, and the generated product plugin plus its
  host adapters.
- Documentation and releases are generated artifacts.

## Confirmation

- A factory test that runs the full pipeline on the first source list and
  produces a plugin that passes each host's structural validation.
- A check that fails the release when a component lacks a registered intake.
- A check that the core references no host-specific mechanism.
- A check that every source manifest names an accepted license.
