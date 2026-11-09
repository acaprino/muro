---
adr_id: ADR-0002
version: 1
title: Simplified 2-prompt factory, branded collector manifest, and 4-rule contextual router
status: Accepted
author: Alfio Caprino
scope:
  paths:
    - sources.json
    - muro_build.py
    - prompts/**
    - capabilities/**
    - ROUTER.md
    - adapters/**
    - dist/**
  modules:
  domains:
    - factory
    - intake
    - harmonization
    - coordinator
    - release
    - multi-host
    - licensing
governs_symbols:
depends_on:
created_from_task: simplify-muro-factory-router
proposed_on: 2026-11-08
proposed_at_sha: fcfefea846fca0286cb278a5ca003f14a6a053e5
accepted_on: 2026-11-09
accepted_at_sha: fcfefea846fca0286cb278a5ca003f14a6a053e5
last_verified_sha: null
retired_on: null
retired_reason: null
supersedes:
superseded_by: null
changes:
---

# ADR-0002: Simplified 2-prompt factory, branded collector manifest, and 4-rule contextual router

<!-- adr-header:start -->
Version 1 · Accepted 2026-11-09 at fcfefea · proposed 2026-11-08 by Alfio Caprino
<!-- adr-header:end -->

## Context and Problem Statement

`ADR-0001` established that Muro has two layers (the **factory** first, then the **coordinator** plugin) and six core invariants (`INV-001` through `INV-006`). Subsequent design iterations explored complex intermediate representations (`component.ir.json`), boolean AST/SAT routing solvers, atomic slot leases, and five-stage SBOM/fragment-span scanners. The project owner rejected that complexity as overengineered for a human-curated list of 4–15 open-source skills and asked to settle four concrete questions with maximum simplicity, clarity, and efficiency:

1. How to keep prompts at the center of intake and harmonization while using minimal deterministic scripting (~150 lines of standard-library Python).
2. How the router behaves when multiple skills or plugins cover the same task or thematic area (MoE vs. single-winner by priority vs. sequential activation).
3. How the factory knows under what brand/name (`slug`, `name`, `command`) to generate the new collector plugin and how it resolves naming collisions across commands, capability IDs, scripts, and host-reserved commands.
4. How the pre-intake license gate deterministically enforces `MIT` and `Apache-2.0` provenance without enterprise bureaucracy.

## Decision Drivers

- **Radical simplicity:** no JSON IR schemas, no SAT solvers, no runtime lease daemons, and no third-party Python dependencies.
- **Zero cognitive load and zero collisions:** one configurable collector plugin identity (`plugin.slug`, `plugin.command`) with automatic collision checks against host built-ins and internal files.
- **Deterministic conflict resolution:** overlapping skills must never fire together or give contradictory advice in the same step.
- **Strict `MIT` / `Apache-2.0` provenance:** unpinned local folders without a `LICENSE` file (such as `~/.claude/skills/design-taste-frontend`, which shares `0/1650` identical files with `marketplaces/taste-skill@9b4bf937`) must be refused automatically before intake.

## Decision

### 1. Minimal Factory Architecture (2 Prompts + Markdown Capabilities + `muro_build.py`)

The factory consists of:
- `sources.json`: declares the target collector plugin identity (`plugin: {slug, name, command, version}`) and the curated list of pinned Git sources (`id`, `repo`, `commit`, `license`, `selected_paths`, `excluded_paths`, `runtime_deps`).
- `prompts/intake.md`: transforms each approved source's `selected_paths` into 1–3 Markdown files under `capabilities/<id>.md`. Each file carries a 6-field YAML front matter (`id`, `role`, `when`, `after`, `outputs`, `checks`), actionable instructions, an optional `## Specifics` section, a `## Checks` section, and a `## Sources` provenance footer.
- `prompts/harmonizer.md`: reads all `capabilities/<id>.md` files and writes a single `ROUTER.md` (`<= 80` lines) containing a 1-row-per-capability Markdown table (`id | role | when | after | outputs`) plus the 4-step runtime routing rule.
- `muro_build.py` (~150 lines, Python 3 standard library): runs `--check-sources` (pre-intake license and pin check) and `--build` (validates `capabilities/*.md` and `ROUTER.md`, checks command collisions, copies `LICENSES/<source-id>.txt`, generates `NOTICE.md`, and emits the packaged plugin under `dist/<slug>/` for Claude Code, Codex, Pi, OpenCode, and Hermes).

### 2. Collector Plugin Branding and 3-Level Collision Resolution

- **Configurable collector identity:** `sources.json` defines `plugin.slug` (default `"muro"`), `plugin.name` (default `"Muro"`), `plugin.command` (default `"muro"`), and `plugin.version` (default `"0.1.0"`). `muro_build.py` parameterizes the output directory (`dist/<slug>/`), host manifests (`.claude-plugin/plugin.json`, root `SKILL.md`), the single slash command (`/<command>`), and the consumer project's work-map path (`.<slug>/map.md`).
- **Level 1 — Public command collisions eliminated (`INV-003`):** absorbed skills never retain their upstream slash commands or public `SKILL.md` files; only `/<command>` is exposed.
- **Level 2 — Internal ID and script collisions:** `muro_build.py` fails the build on duplicate `capabilities/<id>.md` identifiers and namespaces copied helper scripts under `dist/<slug>/scripts/<source-id>/`.
- **Level 3 — Host command and installed-plugin collisions:** `muro_build.py` rejects any `plugin.command` or `plugin.slug` that matches a reserved native host command (`help`, `clear`, `compact`, `init`, `review`, `plan`, `model`, `config`, `status`, `mcp`, `agent`, `login`, `logout`, `doctor`, `bug`) or collides with another third-party plugin installed in the user's host directories.

### 3. Four-Rule Router & Harmonizer Behavior for Same-Area Capabilities

When multiple sources touch the same thematic area, Muro applies four rules:
1. **`merge` (Same `role`, compatible or conflicting rules -> Build-time Merge):** The Harmonizer merges overlapping rules for the same role into one canonical `capabilities/<id>.md`. `sources.json` list order resolves direct contradictions; non-conflicting specialized rules from lower-priority sources are preserved under `## Specifics` with explicit applicability conditions.
2. **`variant` (Same `role`, mutually exclusive stack/technology -> Runtime Safe Filter + Single Winner):** Separate capability files sharing a `role` carry distinct `when` stack conditions (e.g., `gsap-scrolltrigger` vs. `css-scroll`). At runtime, the Router filters by `when` against the project's actual stack and constraints first, then selects at most one compatible survivor (using table order as tie-breaker only among compatible survivors; if zero survive, it asks or blocks rather than injecting an incompatible dependency).
3. **`after` (Complementary workflow stages -> Runtime Sequential Handoff with Deterministic Skip):** Capabilities representing ordered stages (`visual-direction` -> `motion-principles` -> `gsap-scrolltrigger`) run sequentially, loading one `capabilities/<id>.md` per step (via fresh subagent on Claude Code, Codex, OpenCode, and Hermes, or sequential turns on Pi) and recording bullet decisions and artifact paths in `.<slug>/map.md ## Outputs`. A prerequisite step in `after` is skipped automatically if its declared `outputs` keys are already present in `.<slug>/map.md ## Outputs`.
4. **No Runtime MoE (Static `## Checks` for Evaluation):** Parallel multi-agent synthesis is never used at runtime. Each capability defines a static `## Checks` list, and the final evaluation step verifies the checklists of the capabilities executed in the plan.

### 4. Deterministic Pre-Intake License Gate

`muro_build.py --check-sources` enforces:
- Every source in `sources.json` has a resolvable Git repository path/URL, an immutable 40-character commit SHA matching `HEAD`, and a root `LICENSE` file whose normalized text matches the SPDX `MIT` or `Apache-2.0` template.
- Binary media and external asset-fetcher scripts (such as `scripts/assets.mjs` fetching `CC BY-SA` or `Unsplash` assets) are listed in `excluded_paths` and refused if present in `selected_paths`.
- Target-project runtime libraries (such as `gsap`) are declared in `runtime_deps` with their own package license and listed in `NOTICE.md` as non-bundled target dependencies, never inheriting the skill's `MIT` license.

## Verified Interview Examples

- **EX-001** (nominal same-area sequence and variant filtering): Input: user runs `/muro` on a landing page with a scroll-pinned hero in a project allowing GSAP -> Expected: Router filters `scroll-code` variants to `gsap-scrolltrigger`, orders `visual-direction -> motion-principles -> gsap-scrolltrigger`, loads one capability file per step, writes `.muro/map.md ## Outputs` (`palette`, `typography`, `motion-spec`, `reduced-motion`), and runs each capability's `## Checks` at the end.
- **EX-002** (boundary skip and forbidden-stack protection): Input: `.muro/map.md ## Outputs` already contains `motion-spec` and `reduced-motion`, or the project forbids external JS animation libraries -> Expected: when `motion-spec` is already present, the Router skips `motion-principles` and runs only `scroll-code`; when GSAP is forbidden and no compatible alternative exists, the Router refuses `gsap-scrolltrigger` and asks a 1-line decision instead of falling back to GSAP.
- **EX-003** (rejection of unlicensed local folder and reserved command name): Input: `sources.json` points to `~/.claude/skills/design-taste-frontend` (no `LICENSE` file, `0` identical files with `marketplaces/taste-skill@9b4bf937`) or sets `plugin.command: "review"` -> Expected: `muro_build.py` exits non-zero and refuses both before generating any output.

## Rejected Alternatives

- **RA-001**: Prompt-to-JSON-IR (`component.ir.json`) with boolean AST predicates, SAT overlap solver, atomic slot leases, and 5-gate scancode/SBOM/fragment-span tracking. Rejected by the owner as overengineered for a curated list of 4–15 skills.
- **RA-002**: Runtime MoE (spawning parallel expert subagents on the same build or review step and synthesizing their outputs at runtime). Rejected because it multiplies token cost and latency while reintroducing contradictory advice.
- **RA-003**: Blind first-row fallback when no `when` condition matches a `variant` role. Rejected because it can select an incompatible or forbidden library (such as GSAP in a CSS-only project).
- **RA-004**: Exposing each absorbed skill's original slash commands alongside `/muro`. Rejected because it violates `ADR-0001 INV-003` and creates command collisions across sources and hosts.

## Enforceable Invariants

- **INV-001**: `ROUTER.md` never exceeds 80 lines and contains at most one table row per `capabilities/<id>.md` file.
- **INV-002**: No single execution step ever loads two `capabilities/<id>.md` files sharing the same `role`.
- **INV-003**: A `variant` capability whose `when` stack constraint conflicts with the target project is never selected by priority fallback.
- **INV-004**: Every prerequisite in `after` is executed first unless all of its declared `outputs` keys already exist in `.<slug>/map.md ## Outputs`.
- **INV-005**: `muro_build.py` fails closed if `plugin.slug` or `plugin.command` is empty, non-kebab-case, or matches a reserved host command (`help`, `clear`, `compact`, `init`, `review`, `plan`, `model`, `config`, `status`, `mcp`, `agent`, `login`, `logout`, `doctor`, `bug`), if any two capabilities share an `id`, or if `after` contains a cycle.
- **INV-006**: `muro_build.py --check-sources` fails closed if any source in `sources.json` lacks a 40-character Git commit SHA, lacks a root `LICENSE` matching `MIT` or `Apache-2.0`, or includes any path matching `excluded_paths` or binary media extensions.

## Consequences

- The entire factory toolchain is implemented in one standard-library Python script (`muro_build.py`), one manifest (`sources.json`), and two Markdown prompts (`prompts/intake.md`, `prompts/harmonizer.md`).
- Renaming or rebranding the generated collector plugin requires editing only `plugin.slug`, `plugin.name`, and `plugin.command` in `sources.json` and re-running `python muro_build.py --build`.
- Every merged rule from overlapping sources is auditable via the `## Specifics` and `## Sources` sections of `capabilities/<id>.md`.

## Confirmation

- Automated `pytest` suite (`tests/test_muro_build.py`) exercising `EX-001`, `EX-002`, `EX-003`, and `INV-001` through `INV-006` on synthetic and real local fixtures (`marketplaces/mattpocock@4ae2317d`, `marketplaces/taste-skill@9b4bf937`, and quarantined `design-taste-frontend`).
