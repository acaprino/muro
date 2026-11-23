# better-layout absorbed into Marionette (2026-11-23)

Owner request: add `OneWave-AI/claude-skills/responsive-layout-builder` to Marionette; then, on seeing alternatives,
"è meglio solo better layout forse" and "ui craft è pesante". Result: one source, `better-layout`, and no other.

## How the source was chosen

Four candidates were compared from their published files (all MIT):

| Candidate | Pin mode | Finding |
|---|---|---|
| OneWave `responsive-layout-builder` | release v2.1.0 | A 5 KB cheat sheet of Tailwind snippets and device-preset breakpoints. Nothing on safe areas, touch targets or `dvh`. Not taken. The skill's presence at the v2.1.0 tag was not checked |
| `educlopez/ui-craft` `adapt` | release v1.0.21 | A mobile-first pass that sends the host to a 38 KB system skill (discovery, anti-slop, knobs). A staged intake was prepared, then removed at the owner's word ("pesante"). Nothing of it is in the manifest or the package |
| `ehmo/platform-design-skills` | head | Native iOS, Android and iPadOS guidance. Not read beyond its folder list; not taken |
| `boraoztunc/skills` `better-layout` | head | Taken, but not from this repository (below) |

## Licence finding that changed the pin

`boraoztunc/skills` has no `LICENSE` for the `better-*` skills: its root `LICENSE` is Emil Kowalski's, and
`NOTICE-jakubkrehel.md` says the `better-*` family is vendored, unmodified, from `jakubkrehel/skills` under
`LICENSE-jakubkrehel`. The source is therefore the original upstream: `jakubkrehel/skills`, root `LICENSE` MIT,
Copyright (c) 2026 Jakub Krehel, head `672ae44ace6aaed65b86cbb1e2fd6fbea0e79578`. It has no release and no tag, so the
pin is `head` (ADR-0009). The upstream copy differs from the vendored one (it has `reporting.md`, where the vendored copy
has `review-output.md`), so the vendored text was not used.

## What was read and selected

Read in full from the intake snapshot: `skills/better-layout/SKILL.md`, `grouping-and-alignment.md`,
`spacing-and-adaptivity.md`, `reporting.md`, and the root `LICENSE`. `coverage.json`: 5 files selected, 0 referenced
outside the selection (the skill names its sibling skills but links none by path), 22 left out.

Not read: the sibling skills (`better-accessibility`, `better-ui`, `better-motion`, `better-typography`,
`better-writing`, `better-colors`, `better-interface`) and `skills/better-layout/agents/`. They are not selected. The
owner took only better-layout, so they are not described as duplicates of anything; the capability states what it does
not apply because of them (Sources, "Changes for coexistence (ADR-0017)").

## What it became

- One capability, `layout-structure` (role `layout-structure`), intents `ui.layout-structure` and `ui.layout-review`,
  outputs `layout_changes` and `layout_report`, discovery entry `marionette-design-review`. No hook, no always-on text.
- `delivery.json`: one `capability` decision for the four files, one `dropped` decision for the frontmatter
  description (routing) and the hand-offs to skills the package does not carry, with the reason.
- Boundaries stated from the neighbours: `design-file` (`design-file.update`) and `design-review`
  (`ui.hierarchy-rhythm-review`) name layout structure as another owner. Three eval cases separate "fix the layout in
  code", "report only" and "responsive limits in DESIGN.md".
- Package version 0.5.1 → 0.6.0; catalog 37 → 38 capabilities, 16 → 17 sources; README and CHANGELOG updated.

## Commands and results (this machine, Python only)

| Command | Result |
|---|---|
| `python -m muro intake better-layout --manifest examples/marionette/sources.json` | Workbench staged |
| `python muro_build.py --manifest examples/marionette/sources.json --validate` | `OK: capabilities and ROUTER.md valid` |
| `python muro_build.py --manifest examples/marionette/sources.json --check-sources` | `OK: all sources and plugin identity valid` |
| `python -m pytest -q tests/test_better_layout_intake.py tests/test_capabilities_read_originals.py` | 49 passed |
| `tests/test_lessons.py::test_router_line_cap_counts_prose_not_catalog_rows`, `tests/test_claude_design_intake.py::test_discovery_entries_examples_and_eval_cases_cover_the_design_capabilities`, `tests/test_audit_p1.py::test_strict_frontmatter_parser_tokened_lock_unlock_and_safe_launcher`, `tests/test_audit_host.py::test_compact_plan_fits_inline_and_keeps_what_the_ai_needs` | 4 passed, after the catalog-size counts were raised from 37 to 38 (and 77 to 78) |
| `python muro_build.py --manifest examples/marionette/sources.json --build --out <scratch>` | First run failed: `Failed to connect to github.com:443` while fetching `genspark-ai/genoffice`, a source this change does not touch. The second run built `marionette/` |

The staged build carries `capabilities/layout-structure.md` in the Claude Code, Codex and Hermes adapters,
`scripts/better-layout/` with `SKILL.source.md`, `grouping-and-alignment.md`, `spacing-and-adaptivity.md`,
`reporting.md` and `LICENSE`, `LICENSES/better-layout.txt`, a `NOTICE.md` line (MIT, Copyright (c) 2026 Jakub Krehel)
and the new sentence in the `marionette-design-review` entry that names `better-layout` among what it replaces.

## GitHub Actions (develop, commit d53a3fe)

The first push (9a7a5fb) failed four tests of the full Marionette suite that the targeted runs had not covered, and
all four were caused by this change: the plugin description plus the umbrella suffix exceeded 1024 characters
(`test_absorbed_names`, `test_audit_p0`: the description had been cut and lost its explainer terms); the router passed
its 80-line text cap once a test appended a line (`test_ai_routing`); and the pin-mode table lacked the new source
(`test_pin_modes`). 860 passed, 4 failed in that run. Fixed in d53a3fe: the description gained the word "layout" and
two phrases were shortened, with no topic dropped (886 of 887 characters); the two-line HTML comment at the end of
ROUTER.md became one line; `better-layout` was added to the pin-mode table. The full description of layout stays in the
`marionette-design-review` entry.

| Workflow | Result on d53a3fe |
|---|---|
| `Marionette` (run 45152737956) | Test 864 passed, 2 skipped; validate, check sources and build; pack the project file: all green |
| `Tests` (run 45152737940) | Python 336 passed, 14 skipped (modules that do not name Marionette); Rust, frontend, design rules, type check, build, shell and browser tests: all green |

## Not executed

- The routing evaluation (`--prepare-eval` and `--score-eval`) with a host AI: the three new eval cases are authored,
  not scored. The new test selects the capability through explicit decision fixtures, which prove mechanics only.
- A live run on any host. Nothing was installed. The capability's behaviour on a real layout task is untested.
- The AI-owned intake and harmonization were done by the host model in this session; no second review pass.
- Merge into `main` and the package release (`docs/releases/marionette-v0.6.0.md` is written; the pull request is the owner's).
