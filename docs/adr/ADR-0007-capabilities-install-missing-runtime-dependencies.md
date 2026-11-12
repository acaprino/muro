---
adr_id: ADR-0007
version: 1
title: Capabilities install their missing runtime dependencies
status: Proposed
author: Alfio Caprino
scope:
  paths:
    - prompts/intake.md
    - prompts/classify.md
    - capabilities/**
    - muro/adapters.py
  modules: []
  domains:
    - intake
    - coordinator
    - runtime
governs_symbols: []
depends_on: []
created_from_task: runtime-dependency-install
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

# ADR-0007: Capabilities install their missing runtime dependencies

<!-- adr-header:start -->
Version 1 · Proposed 2026-11-09 by Alfio Caprino
<!-- adr-header:end -->

## Context and Problem Statement

Capabilities drive external tools that Muro does not bundle: a command-line
application, an npm or pip package, a renderer. Until now a capability stopped
and reported when such a tool was missing, and the classification prompt told
the host AI to return `needs_clarification`. On the owner's machine that made the
Office capabilities stop at their first step.

Owner decision of 2026-11-09, in the owner's words: "il plugin/skill dovrebbero
installarli se necessario". The wording of the rules below is this record's
implementation of that decision and is not separately approved.

## Decision Drivers

- The owner should not have to install anything by hand to get the requested result.
- An installation must be visible, come from an official source and be verified.
- A missing tool must never turn into a silently different engine or a faked result.

## Decision

A capability installs a runtime dependency it needs and finds missing: a
package, a command-line tool or an application. It does not stop the work to ask
whether to install. Before installing it states in one line what is installed,
from which official source and where it goes. It uses the narrowest scope that
works, the project and then the current user, checks that the installed tool
answers, and continues.

It never substitutes another engine and never produces the file by another
route. A failed installation, an installer that needs the user, or the user's
objection blocks only the deliveries that depend on that tool, and is reported.
The host's own permission prompts still apply.

Intake records, for each dependency, how to check it and the official way to
install it, taken from the source material; when the source gives none, the
capability says so instead of inventing a command. The runtime classifier does
not treat an installable dependency as a reason to stop or to switch capability.

This covers runtime dependencies only. Intake and build install nothing. A
capability does not install the skill or plugin itself. Hooks remain passive
metadata and are never installed or activated. A host integration that needs the
user's account or approval is not installable this way and still leads to a
clarification.

## Verified Interview Examples

- **EX-001** (missing engine): a deck is requested and `genoffice` is not
  installed. Expected: the step states what it installs and from where, installs
  it, confirms `genoffice --version`, then builds the deck.
- **EX-002** (install fails): the installer needs the user or fails. Expected:
  the step says which action is the user's and stops that delivery; no deck is
  simulated and no other writer is used.
- **EX-003** (not installable): the task needs a Figma integration tied to the
  user's account. Expected: the classifier asks or reports the limit; nothing is
  installed.

## Rejected Alternatives

- **RA-001**: keep stopping and reporting. Rejected by the owner decision.
- **RA-002**: install during intake or build. Rejected because the factory must
  stay inert and the dependency belongs to the machine that runs the task.
- **RA-003**: fall back to another library when the engine is missing. Rejected
  because the result would no longer be the capability's verified output.

## Enforceable Invariants

- **INV-001**: a capability body that needs an external tool tells the host how
  to check it and, when the source provides one, how to install it.
- **INV-002**: no capability instructs a silent substitute or a simulated result
  when its tool is missing.
- **INV-003**: intake and build perform no installation; hooks are never
  installed or activated.

## Consequences

Capabilities can change the user's machine: downloads, packages, applications.
The one-line statement and the host's permission prompts are the user's view of
it. Install commands transcribed from a source can be wrong or out of date; they
are instructions for the host AI, not code Python runs or checks. The three
GenOffice capabilities now install GenOffice from its official releases; the
selected skill gives no unattended install command, so on some platforms the
installer may need the user.

## Confirmation

Run the full pytest suite. The host skill text and the GenOffice capability
bodies are asserted to carry the rule. An actual installation has not been
exercised; confirm it on a machine without the tool before relying on it.

## Amendment: a source whose function is its hooks (2026-11-11)

Implementation choice made while absorbing microsoft/TokenEconomizer into
Marionette at the owner's request ("In marionette"); the wording is not
separately approved. TokenEconomizer's three mechanisms run only when the host
calls its dispatcher on six events, so "hooks remain passive" left its engine
packaged but idle. The rule is kept and made precise:

- Intake catalogs each default hook as `{event, action, tools, policy}` with
  policy `host-approved`, and says in `## Sources` what the source registers by
  default.
- The release contains nothing a host registers by itself: the upstream hook
  manifests are packaged as reference data under `scripts/<source-id>/`, never
  at a plugin or skill root, and no adapter manifest names hooks. A test checks
  this for every host.
- A capability may register or remove a source's hooks only as a step the user
  explicitly asked for in the task. Before writing anything it states the
  events, the files and state the hooks write, the model calls they make and
  where those are billed, and the host versions the source was verified on; it
  writes project-scope settings, merges, refuses a file that does not parse, and
  removes exactly what it added.
- Classification never registers a hook (unchanged, `prompts/classify.md`).
