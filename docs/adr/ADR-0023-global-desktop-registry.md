---
adr_id: ADR-0023
version: 1
title: A desktop registry alongside the factory
status: Proposed
author: Codex
scope:
  paths: [apps/desktop, crates/muro-registry, crates/muro-desktop-runtime]
  modules: []
  domains: []
governs_symbols: []
depends_on: [ADR-0011, ADR-0016]
created_from_task: custom-instructions
proposed_on: 2026-11-15
accepted_on: null
---

# ADR-0023 — A desktop registry alongside the factory

Date: 2026-11-15. Status: implementation of the owner's approved desktop design; this text has not been separately approved.

## Owner requirements

Provide a Tauri UI resembling the owner's Shinatama/Xiox tools, with the approved Muro-logo visual design. Manage global harness instances and a unified plugin store, including third-party plugins, version selection, sync, reinstall, maintenance and opt-in removal of plugins outside the desired registry. Use Mukade for harness information and Muro's existing adaptation machinery when an upstream distribution is not native to a target.

## Implementation choices

The Windows-first desktop is a separate TypeScript/Tauri/Rust application. `muro/` remains the host-neutral Python factory. Mukade is pinned as a Rust dependency; its session roots are not inferred to be plugin roots. Instances have explicit executable/root and exclusive-mode configuration. Registry state, observed inventory, immutable artifacts, job state and operation journals are separate data.

Source resolution records upstream identity and provenance. Native distribution detection uses declared manifests; semantic intake and harmonization remain real host AI work. Adapted artifacts are tied to their source revision and become stale when it changes. The desktop runs factory validation, source checks and a staged build before recording an AI result. No factory preparation command is represented as completed AI reasoning.

Plans bind registry revision, observed inventory and artifact digests. Writes use locks and atomic replacement; apply refuses stale inputs. Preparation precedes installation and exclusive removals. Unknown inventory blocks execution. Recovery retains evidence and requires a new observed plan. Automation is opt-in while the app/tray is alive; there is no installed background service.

Private embedded Python is hash-verified against the official distribution. The app uses its own WebView2 profile even when launched by another WebView application. Budgeted AI jobs initially use Claude Code; unsupported budget guarantees are rejected explicitly.

## Cost and boundaries

Owner amendment during implementation: the deliverable must be native and portable, and all operations must use its own command-line executables, including Mukade. The GUI therefore uses a bundled `muroctl` backend process with correlated JSON requests. Bundled Mukade retains its upstream CLI and adds explicitly named JSON discovery/resolve commands. Git, curl and embedded Python travel with the folder; a portable marker selects adjacent data. The same actions are documented for direct CLI use. This supersedes the initial in-process desktop backend choice.

Planning and applying perform additional inventory scans and artifact hashing, with no LLM calls. Resolution adds release/Git requests. AI adaptation consumes an explicitly started host session, its configured dollar budget and separate factory checks. No extra approval is added for read-only discovery; installation/removal is represented in the reviewable sync plan. Host permissions may still deny an operation. Native and simulated verification evidence are reported separately. Neither this implementation nor its tests authorize publication, personal plugin installation or replacing existing release output.
