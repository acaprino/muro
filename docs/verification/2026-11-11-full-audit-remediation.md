# Full 360-degree audit remediation — 2026-11-11

## Scope

Owner authorized implementing all audit findings (`"all"`) across P0, P1 and P2
while preserving local changes in `README.md` and `effectiveness-metrics.json`,
making no commit, push, installation or replacement of existing `dist/` output.
See [ADR-0013](../adr/ADR-0013-runtime-lifecycle-discovery-and-factory-isolation.md).

## TDD RED → GREEN slices

1. **Slice 1 — P0 (`tests/test_audit_p0.py`, 5 tests):**
   - **RED:** `5 failed in 0.75s` (`css-scroll` hardcoded `.muro/`; `KeyError: 'state_dir'`; missing `Coordinator.complete`; misleading `catalog_digest` message; `_skill` lacked `capabilities` discovery synthesis).
   - **GREEN:** `5 passed in 1.57s` after injecting `state_dir`, `map_path` and `recorded_outputs` into `_instruction()`, replacing `.muro/` across all 12 Marionette capabilities, rejecting `.muro/` when `plugin.slug != "muro"`, adding `map_status: active|completed` + `complete` + `record --direct`, isolating new tasks from outdated saved `catalog_digest`, parameterizing `{plugin.name}` in `NOTICE.md` and `map.md`, and generating bounded `"Use when..."` `SKILL.md` descriptions.
2. **Slice 2 — P1 (`tests/test_audit_p1.py`, 5 tests):**
   - **RED:** `5 failed in 1.09s` (`step` CLI action absent; `step_id` rejected; `preserve_completed` absent; domain leak `'Figma'` in `prompts/classify.md`; unknown frontmatter key `need:` silently accepted).
   - **GREEN:** `10 passed in 5.39s` (`test_audit_p0.py` + `test_audit_p1.py`) after adding inline `*-json` and single-consumer `"-"` stdin flags, all-or-nothing in-memory validated `step_atomic`, `effective_checks` and `output_attestation`, `step_id` (`cap#n`) multi-instance support with namespaced outputs, `--preserve-completed` with prerequisite validation, manifest-driven `stack.detectors` and `stack.conflicts` in `sources.json`, domain-neutral `prompts/classify.md`, strict stdlib frontmatter key/YAML-list checks, tokened JSON `.write-lock` + `unlock --token`, and `ROUTER.md`-guarded `_LAUNCHER`.
3. **Slice 3 — P2 & Governance (`tests/test_audit_p2.py`, 5 tests):**
   - **RED:** `5 failed in 2.05s` (`install_policy: confirm` absent; `--offline-pins` absent; `GUIDE.html` hardcoded `lang="it"`; `cytoscape.min.js` duplicated in adapter `muro/`; `FRD-0001` at v1 and `ADR-0003`/`0008` missing frontmatter fields).
   - **GREEN:** `5 passed in 2.83s` after adding `plugin.install_policy` (`auto|confirm`), `--offline-pins` (explicitly disclosing skipped HTTPS fetches), English-default + configurable `en|it` `GUIDE.html`, adapter `muro/` slimming (retaining `vendor/cytoscape/LICENSE`), `ADR-0013`, completed `ADR-0003`/`0008` frontmatter, and `FRD-0001` v2.

## Verification commands and results

| Command | Result |
|---|---|
| `python -m pytest -q` | **243 passed in 129.69s** |
| `python muro_build.py --manifest examples/marionette/sources.json --validate` | `OK: capabilities and ROUTER.md valid` |
| `python muro_build.py --manifest examples/marionette/sources.json --check-sources --offline-pins` | `OK: manifest pins and local sources valid; skipped remote fetch (--offline-pins)` |
| `python muro_build.py --manifest examples/marionette/sources.json --check-sources` | `OK: all sources and plugin identity valid` (verified against all 8 pinned Git remotes) |
| Fresh staged release of `examples/marionette/sources.json` in `Temp\opencode` + all 5 standalone host launchers (`claude-code`, `codex`, `pi`, `opencode`, `hermes`) copied outside checkout (`PYTHONPATH` unset) running `plan --confirm` → atomic `step` #1 → atomic `step` #2 (`completed`) → subsequent 1-step `direct` `plan` | **5/5 passed** (`mode == "completed"` then `mode == "direct"`, `.marionette` state dir, `recorded_outputs` propagated, `NOTICE.md` branded `Marionette`, `GUIDE.html` `lang="en"`, slimmed `skill/muro` verified) |

## Browser check of the rewritten GUIDE.html (resumed session, same day)

Fresh staged releases of `examples/marionette/sources.json` in the session
scratchpad, served over local HTTP, opened in Chromium via Playwright.

| Build | Viewport | Result |
|---|---|---|
| `language` unset (factory default `en`) | 1366×700 | `lang="en"`, graph canvas drawn, 13 node buttons, 19 intent options, 0 console errors (1 warning: Cytoscape's custom `wheelSensitivity` notice, a setting that predates this change), no leftover `__MURO_*__` placeholders. Path "Landing nuova in Figma" → status `Example: … · 2 steps`; Figma Design drawer shows the conditional prerequisite on visual-direction; close and Reset restore the base view. |
| `language: "it"` | 390×844 | `lang="it"`, title `Marionette · Mappa della release 0.1.0`, toolbar `Percorsi / Intenti / Ripristina`, no horizontal overflow, path "Landing con animazioni allo scroll" → `Esempio: … · 3 passi`, drawer is a 390 px bottom sheet with Italian headings, 0 console errors. |

Finding: with the English default, Marionette's guide mixed an English UI with
the Italian titles, tasks and reasons of its own `guide-examples.json`.
Implementation choice: Marionette sets `plugin.language: "it"`, which keeps the
Italian guide it shipped with before this change; the factory default stays
English for new packages. Capability bodies remain English in both, as before.

The first `rel-it` build attempt failed with `WinError 112` (drive C: at 99%
use); the staging folder was removed by the build's cleanup and the retry
succeeded. After the language change: `--validate` OK, `python -m pytest -q`
**243 passed in 73.42s**. Not checked: touch gestures, browsers other than
Chromium.

## Integration boundaries and unexecuted checks

- All AI classifications in automated tests and launcher checks are explicit test fixtures; they validate Python's protocol, validation, state isolation and packaging, not live LLM reasoning quality.
- Live interactive natural-language discovery and multi-turn agent execution inside actual running sessions of Claude Code, Codex, Pi, OpenCode and Hermes remain unexecuted and unmeasured empirically.
- No runtime external tool installation (`GenOffice`, `Node 22+`, `Chrome`, `gsap`) or external MCP integration (`Figma MCP`) was executed during verification.
