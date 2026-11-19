# Marionette: taste-skill removed, figma-design becomes canvas-design (2026-11-19)

## Why

Two owner decisions in one session, both on Marionette's scope:

- "eliminiamo taste-skill da marionette, la ritengo troppo prescrittiva e costrittiva". ADR-0017 does not
  allow softening a source for taste, so the scope is changed the way ADR-0015 gives: the source is removed.
- On `figma-design`, asked first to be ignored unless it could serve FigCraft: "allora rinominiamola in
  generico non figma". The capability is renamed and no longer bound to Figma.

`elayadesign/ai-design-skills` was already a source, pinned at its upstream head `456d9e0d` (no release or
tag upstream); the pin is unchanged.

## What changed in the package

- `sources.json`: the `taste-skill` source is removed (16 sources); `taste-skill` and
  `design-taste-frontend` leave `plugin.replaces`; the plugin description names "Figma, FigCraft" (887
  characters; the umbrella skill cuts a description over 888). The runtime dependency and the intake goal
  of `ai-design-skills` are no longer worded for Figma alone.
- `capabilities/visual-direction.md`: rewritten on landing-page-design alone. Id, role, the two intents and
  the seven outputs are kept. Part B of the source (B1 to B7, B11), A2's tagline line, A5's note, the
  "Visual" block of the checklist, B8 and B9 apply again as written: they had been left out only because
  taste-skill contradicted them on a built page. Tools: file access, and an optional browser for the 390px
  check. No hook. Checks `house_rules_met`, `screens_reviewed`, `checks_run`, `finish_gate_closed` are
  replaced by `visual_system_met`, `states_and_ship_met`, `mobile_checked`.
- `capabilities/figma-design.md` → `capabilities/canvas-design.md`: id and role `canvas-design`, intent
  `ui.canvas-design`, tool `design-canvas`. Step 1 keeps the source's Figma calls for Figma and has another
  editor do the same work with its own operations; no design rule, name or value of the source is changed.
  The tagline section follows the source again.
- Ten other capabilities: exclusions and provenance notes that said "dealt" or "Figma work".
- `delivery.json`: the two taste-skill decisions and both `hooks` wirings are removed (the package registers
  no hook now); the three `ai-design-skills` decisions are rewritten; five reasons of other sources that
  cited taste-skill are corrected. 83 decisions.
- `entries.json`, `ROUTER.md` (79 of 80 text lines), `guide-examples.json` (26, one for FigCraft),
  `eval-cases.json` (76, one for FigCraft).
- Tests: `tests/test_taste_skill_intake.py` deleted; the id renamed in ten test files; assertions tied to
  taste-skill's files, hook and wording replaced in `test_ai_routing`, `test_live_host_fixes`,
  `test_pin_modes`, `test_reharmonization`, `test_zero_slop_design_intake`, `test_runtime`.
- `AGENTS.md` (the note on Marionette's active hook) and `README.md` (one example row).

## Commands and results

- `python muro_build.py --manifest examples/marionette/sources.json --validate`: `OK: capabilities and
  ROUTER.md valid`.
- `python muro_build.py --manifest examples/marionette/sources.json --check-sources`: `OK: all sources and
  plugin identity valid` (contacts the 16 pinned remotes).
- `python muro_build.py --manifest examples/marionette/sources.json --build --out <scratch>`, on the final
  files: built; 2,268 files, 53 MB, no path of taste-skill, 37 capabilities, no `Stop` entry in the Claude
  Code and Codex hook files, both ai-design-skills originals packaged as `SKILL.source.md`.
- Targeted tests, first group (16 files: the intake tests of the design sources, routing, runtime, needs,
  check scope, audits, lessons): 209 passed and 2 failed in 494.67 s. The two failures were the plugin
  description cut by the umbrella skill (923 characters against a budget of 888) and an assertion on a
  taste-skill sentence; after the fix, the four files concerned: 29 passed.
- Targeted tests, second group (25 other files that read the package, 353 tests): **not completed**. The
  host stopped the run for low memory after 237 of 353: 234 passed, 2 skipped, 1 error in the setup of
  `test_capabilities_read_originals::test_every_packaged_original_a_body_names_is_in_the_release` (its
  fixture builds a release; the traceback was lost with the run, and a second build of the same package
  was running at that time). Its path check, applied by hand to the staged final build: 165 named paths,
  none missing. The 116 tests that never ran are in `test_live_host_fixes`, `test_media_paths_gate`,
  `test_motion_design_intake`, `test_muro`, `test_muro_build`, `test_native_install`,
  `test_open_paper_skills_intake`, `test_policy_original_wording`, `test_ponytail_intake`,
  `test_source_coverage`, `test_superpowers_intake`, `test_text_humanizer_intake` and
  `test_tokeneconomizer_intake`. `test_live_host_fixes` was edited in this change and has not run since.
- The full suite, in the `Tests` workflow on `develop` at `9c08521` (run 44614646279): 725 passed, 16
  skipped in 141 s, then source validation, source checks and a build. It includes the tests that never
  ran locally, `test_capabilities_read_originals` and `test_live_host_fixes` among them.

## Routing eval

`muro eval prepare`, then one fresh model session (Claude Fable 5.2, a subagent of the working session)
classified the 76 cases from `PROMPT.md` and `contexts.json` alone, without the expectations; `muro eval
score`: 76 of 76. One sample.

Two limits. The classifier saw the catalog at digest `f3e89f8d…`; two lines of `visual-direction`'s body
and the plugin description changed afterwards (digest `1add8309…`). A second `prepare` gave a `PROMPT.md`
and a `contexts.json` identical to the first apart from the digest, so the decisions were rebound to the
new digest and scored. And the session that wrote the catalog also wrote the two new expectations.

The previous decisions file in the eval folder was kept, renamed beside it.

## Not executed

- No page was built with the new `visual-direction` in a live host, and no session checked that a host
  follows it.
- `canvas-design` was not run in Figma or in FigCraft. What FigCraft offers is taken from the README of
  `storytold/figcraft` (read on 2026-11-19): variables with modes, aliases and scopes, text styles, auto
  layout, component sets with variants, prototype transitions, an MCP server (`figcraft-cli mcp`). Whether
  it covers every rule of the source (a variable bound to a gradient stop, a custom bezier on a transition,
  opacity stored in a variable) is not known.
- No install on a host. Committed and pushed on the owner's request the same evening; the package version
  goes to 0.5.0 with the release notes in `docs/releases/marionette-v0.5.0.md`.

## Open for the owner

- The website step now follows a source that is itself a fixed system: four typefaces and one per site, a
  mandatory hero text gradient, a mandatory tagline reveal, six dark backgrounds. The source lets the
  user's explicit prompt override each rule. Narrowing it further is an owner decision.
- With taste-skill went the only automated check of a built page in a browser.
