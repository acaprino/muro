# charles-skills, three more skills absorbed into Marionette (2026-11-25)

Later the same day as `2026-11-25-charles-skills-intake.md`. Owner requests, in order: "integra anche
`.../charles-skills/tree/main/skills`" (the whole folder), then "cosa consigli di portarci a bordo?", then "A" to the
first group of the recommendation, and while the work ran: "MI RACOCMANDO, armonia con ui pro max ecc ecc" and "come
le gestisci voglio spere". Result: three more skills of the same source, three new capabilities, and the way they
coexist with ui-ux-pro-max and the other sources written down.

## The recommendation and the choice

The recommendation was made on the description and requirements of the 17 skills not yet absorbed, not on their full
text. Group A, which the owner chose: charles-design-laws, charles-ux-animation, charles-design-tips. Left out by that
choice and not read: the editing and qol shelves, charles-store-screenshots, charles-unreasonable-craft,
charles-create-posters, charles-hero-mockups and charles-unslop. One fact about them was verified: charles-unslop
declares `license: CC-BY-4.0` in its frontmatter, and the license gate accepts MIT and Apache-2.0 only
(`muro/sources.py`). None is described as a duplicate of anything.

## The source

Same source and pin as the first intake: `LemonFace0309/charles-skills`, MIT, Copyright (c) 2026 Charles Liu, head
`83de509dd10b77ebaf83c3f9986b538cdaf19b63` (still the head when this intake started). `excluded_paths` held
`skills/drops/**`, which would have covered the new files: it is now one entry per README, example folder and
unselected skill. `coverage.json` after preparing again: 20 files selected, 0 referenced outside the selection.

Read in full from the snapshot: the three `SKILL.md` files. Read with long lines cut at 300 to 400 characters:
`references/recipes.md` and `references/techniques.md` of charles-ux-animation (every section, every number that the
body quotes). Read outside the snapshot, as evidence only: the three READMEs and the shelf README.

## What it became

| Skill | Capability | Intents | Outputs | Entry |
|---|---|---|---|---|
| charles-design-laws | `ux-laws` | `ui.ux-laws`, `ui.ux-laws-review` | `ux_changes`, `ux_report` | `marionette-ux` (new) |
| charles-design-tips | `design-tips` | `ui.design-tips`, `ui.design-tips-review` | `tips_changes`, `tips_report` | `marionette-ux` (new) |
| charles-ux-animation | `interaction-motion` | `ui.interaction-motion`, `ui.interaction-review` | `interaction_changes`, `interaction_report` | `marionette-motion` |

No hook, no always-on text, no MCP server, no credential, no runtime dependency, no script. Catalog 40 → 43
capabilities, sources unchanged at 18, absorbed skills 66 → 69. The package version stays 0.7.0: it was on `develop`
only (remote `main` at 0.6.0, no `release/marionette-v0.7.0` branch in `acaprino/marionette`), so its notes and
changelog were rewritten for five skills instead of two.

## How the overlaps are handled

One capability per skill, each with a build and a review intent, as `layout-structure` has. Each skill has its own
procedure and findings table, so none was merged into an existing capability. `design-tips` was compared with
`interface-polish` first, because the two share a few rows.

1. **The order of authority is the owner's of 2026-11-17, unchanged:** the request, a project `DESIGN.md` that is not a
   starter, a Master or tokens in the repository, a recorded direction or motion specification. A step's own source
   comes after all of them. A value that traces to a recorded system is reported, not changed.
2. **ui-ux-pro-max stays the lookup.** `design-guidance` looks rules up in packaged data and reports; its results
   stay proposals, as its body already said. A request that names UI Pro Max, or asks for rules with no code to change,
   goes there.
3. **No source is rewritten where numbers differ.** Each difference is recorded in the capability's Sources with the
   file and rule it comes from, read in the packaged originals:

   | Thing | charles-skills | Other source | Common value |
   |---|---|---|---|
   | Body line height | 1.4–1.5 (design-tips, tip 6) | 1.5–1.75 (ui-ux-pro-max, `line-height`) | 1.5 |
   | Exit against entrance | 20–30% shorter (ux-animation) | "~60–70% of enter duration" (ui-ux-pro-max, `exit-faster-than-enter`); entrances 30–50% longer (motion-design) | 30% shorter |
   | Press scale | 0.96, never below 0.95 | 0.95–1.05 (ui-ux-pro-max, `scale-feedback`) | 0.96 |
   | Touch target | 44×44px on touch | 44×44pt / 48×48dp (ui-ux-pro-max, `touch-target-size`) | 48dp on Android |
   | Curves | springs only for what follows a finger | "Prefer spring/physics-based curves" (ui-ux-pro-max, `spring-physics`) | none |
   | Destructive actions | Undo for what is reversible; confirm only what cannot be undone | "Confirm before destructive actions" (ui-ux-pro-max, `confirmation-dialogs`) | none |
   | Tooltip | 125ms | 80–120ms (motion-design); inside 150–250ms (charles-polish) | none |
   | Reduced motion | every animation off, fades included | opacity fades kept (motion-design) | none |
   | Greys | tinted toward blue unless warm on purpose (tip 4) | neutrals lean toward the palette (charles-color-analysis) | none |

   Where a common value exists the body names it. Where none exists the step follows its own method and names the
   difference in its report when the other value is recorded in the plan.
4. **Timing and reduced motion** keep the rule of 2026-11-12: a recorded `motion-spec` and `reduced-motion` win, after a
   project design file's motion values. `motion-principles` stays their owner.
5. **Animation code** had no owner outside scroll. `interaction-motion` writes the animation people trigger; the
   scroll-code steps keep scroll, `motion-principles` keeps the specification.
6. **Laws stated twice.** More than a dozen laws are in both charles-design-laws and charles-ux-animation. Both files
   stay whole; a request about what a screen asks of people goes to `ux-laws`, one about how it moves and responds to
   `interaction-motion`. The hand-off in charles-design-laws to charles-ux-animation now names that capability.
7. **Boundaries from both sides.** `design-guidance`, `motion-principles`, `interface-polish`, `design-review`,
   `layout-structure`, `color-critique` and `ui-prototype` each gained an exclude, and four of them a harmonization note.

## Blind routing check

Twenty-two requests in Italian, written to be contested, were classified in two rounds (sixteen, then six) by a separate agent that received only the
runtime's classification prompt (`muro project simulate-prepare`, about 101,000 characters) and the contexts.
It did not see any expectation, the repository or this conversation. Each answer was then checked with
`muro project simulate-check`.

| Result | Count |
|---|---|
| Answers valid under the runtime's rules | 22 of 22 |
| Requests with one expected owner that got it | 20 of 20 |
| Open requests (no expectation) | 2 |

The second round was added after a review of the first: it had tested `design-review` only on a generated look and on contrast. Its six requests are a last check before delivery with a verdict (`ui.polish-pass`), hierarchy and rhythm (`ui.hierarchy-rhythm-review`), missing hover, focus and disabled states (`ui.interaction-states`, which the agent weighed against interaction motion), a layout that breaks at 320px (`layout-structure`), a pre-delivery checklist for React Native (`design-guidance`) and heading spacing with line height and label casing (`design-tips`, weighed against the hierarchy review). All six went to that owner.

The first round's fourteen cover each new capability in both intents and the near misses that must keep their owner: a generated
look and a contrast fix stay `design-review`, rules for a stack and a request that names UI Pro Max stay
`design-guidance`, hover timing without code stays `motion-principles`, a modal that "feels off" and a frame-by-frame
check stay `interface-polish`, muddy colours stay `color-critique`.

The two open requests name no lens: "Rifinisci la schermata Dashboard.tsx" went to `interface-polish`
(`ui.craft-polish`) and "Rivedi la schermata Profile.tsx e dimmi cosa non va, senza modificarla" to `interface-polish`
(`ui.craft-review`). The agent reported that for the second a request for clarification was the real alternative, with
five review intents able to take it.

Limits: one model (the same family as the one that wrote the catalog), one run, twenty-two requests. It is evidence that
the boundaries can be read as intended, not that they hold in general. The owner's `decisions.json` of 2026-11-19 in
the eval workbench was not touched, and `muro eval score` was not run on the 115 cases.

## Commands and results (this machine, Python only)

| Command | Result |
|---|---|
| `python -m muro intake charles-skills --manifest examples/marionette/sources.json` | Workbench staged again; 20 files |
| `python muro_build.py --manifest examples/marionette/sources.json --validate` | `OK: capabilities and ROUTER.md valid` |
| `python muro_build.py --manifest examples/marionette/sources.json --check-sources` | `OK: all sources and plugin identity valid` |
| Targeted `python -m pytest -q` (the two charles test modules, the fast tests of `test_capabilities_read_originals`, `test_lessons`, `test_absorbed_names`, `test_audit_p0`, `test_pin_modes`, `test_better_layout_intake`, `test_claude_design_intake`, `test_discovery_entries`) | First run: 1 failed, 160 passed. The failure was this change's: the design-tips body did not carry the "375px wide" of the source's first verification check outside its tool description. Added to the body; the module then passed (15 passed) |
| `python muro_build.py --manifest examples/marionette/sources.json --build --out <scratch>` | Built `marionette/` |
| `python -m pytest -q -m marionette` (every module marked `marionette`) | 894 passed, 4 skipped, in one run of 15 minutes |
| After the review fixes (one line of `ux-laws` and its Sources, three eval cases added and two reworded, one guide example reworded): `--validate`, then `python -m pytest -q` on the two charles modules, the fast test of `test_capabilities_read_originals`, `test_eval_blind_ids`, `test_eval_intents`, `test_lessons`, `test_release_guide`, `test_simulate`, `test_absorbed_names`, `test_audit_p0` | `OK`; 196 passed |
| Second `--build --out <scratch>` on the final content | Built `marionette/`, 43 capabilities |

The staged build carries the three capabilities in all five adapters, the skill `marionette-ux` in all five, the
sentence naming `charles-ux-animation` in `marionette-motion`, and the five files under
`scripts/charles-skills/skills/drops/` with each `SKILL.md` stored as `SKILL.source.md`.

## Not executed

- The full suite in GitHub Actions, until this change is committed and pushed.
- `muro eval score` on the 115 eval cases with a host AI. All ten new cases use a request of the blind check word for word, and each got its owner there once. None was scored by the eval command.
- A live run on any host. Nothing was installed. No capability's behaviour on a real task is tested.
- The AI-owned intake and harmonization were done by the host model in this session, with a second read by a reviewer
  model before writing and no independent human review.
