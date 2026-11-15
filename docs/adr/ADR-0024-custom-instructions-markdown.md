---
adr_id: ADR-0024
version: 1
title: Owner Markdown enters AI harmonization
status: Proposed
author: Codex
scope:
  paths: [muro/custom_instructions.py, muro/delivery.py, prompts, crates/muro-registry]
  modules: []
  domains: []
governs_symbols: []
depends_on: [ADR-0003, ADR-0016, ADR-0017]
created_from_task: custom-instructions
proposed_on: 2026-11-15
accepted_on: null
---

# ADR-0024 — Owner Markdown enters AI harmonization

Date: 2026-11-15. Status: implements the owner's approved folder-based design;
this explanatory text has not been separately approved.

## Owner requirements

Allow custom instructions in harmonized packages through a `custom-instructions/`
folder containing free Markdown. The LLM understands the content and decides
whether to produce system prompt text or another appropriate form. Preserve
these instructions in later harmonizations. Add Marionette's requested ADHD
progress recaps, document actual user steps and publish its next release.

## Contract

The folder sits beside `sources.json`; `.md` files are collected recursively as
UTF-8, without required frontmatter. Filename and order have no semantic role.
Preparation includes byte-preserving snapshots and hashes; no script decides
form, precedence, scope or coexistence. The host LLM makes those judgments using
the existing delivery forms, recording decisions for each exact input path.

`delivery.custom_instructions` carries `digest`, a `files` map of relative paths
to SHA-256, and AI-authored `intake_only_paths`. The collection digest is SHA-256
of UTF-8 `path + newline + file_sha256 + newline` entries sorted by relative
POSIX path. This is version binding, not evidence of semantic reasoning.
Upstream Git/license checks remain unchanged; owner-authored Markdown is
identified separately rather than impersonating a Git source.

Delivery and runtime evidence are invalid after inputs change. Source validation
requires the full input inventory. A build emits `custom-instructions.lock.json`
and retains only the originals its AI decision says runtime needs; standalone
runtimes validate those retained bytes and the receipt. `SKILL.md` is renamed to
`SKILL.source.md`, consistent with absorbed originals. The collection contributes
one 6000-character permanent-policy allowance, independent of file count.

The desktop stores the customization folder separately from upstream snapshots,
snapshots it for AI adaptation and binds distributions to its digest. External
edits do not increment registry revision, so file digests are also checked before
recording results and applying plans. Reading or saving instructions installs
nothing; synchronization remains a separate operation.

## Marionette decision and cost

The owner recap instruction concerns all work, including waits and autonomous
decisions, so it becomes permanent policy with no invented procedure or output.
Its words are preserved. A marked coexistence line distinguishes updates during
work from redundant closing recaps forbidden by i-have-adhd rule 10; existing
mode controls remain in effect. The original is intake-only once carried in
policy. No fixed interval or new approval gate is imposed.

Cost is local reads/hashes and additional evidence in already-required AI
harmonization. The chosen policy contributes text to sessions, with no new
mandatory model call or recurring hook. Verification records distinguish
mechanical tests, native adapter delivery and actual model behavior.
