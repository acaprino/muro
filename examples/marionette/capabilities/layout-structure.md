---
id: layout-structure
role: layout-structure
when: —
after: []
outputs: ["layout_changes", "layout_report"]
checks: ["surface_read_in_full", "detection_patterns_checked", "failures_shown", "project_tokens_used", "stress_verification_stated", "report_in_source_format"]
intent_checks: {"ui.layout-structure": ["surface_read_in_full", "detection_patterns_checked", "project_tokens_used", "stress_verification_stated"], "ui.layout-review": ["surface_read_in_full", "detection_patterns_checked", "failures_shown", "project_tokens_used", "stress_verification_stated", "report_in_source_format"]}
check_conditions: {"project_tokens_used": "The project has a spacing scale, a density system or tokens of its own."}
intents: [{"id":"ui.layout-structure","description":"Set or repair the structure of a layout in the project's own code so it holds when resized, translated and mirrored: grouping by space, shared alignment edges, logical properties for RTL, reading order and one primary action per view, cues for hidden content, clearance between controls, insets and safe areas on narrow and mobile viewports, full-bleed content, content-driven breakpoints and container queries, and room for longer translated text.","excludes":["Recording responsive limits, breakpoints or spacing tokens as data in a DESIGN.md is design file authoring; implementing interface changes from a design file is design file application.","Contrast, keyboard reach, focus and target sizes are the accessibility audit of design review.","Choosing the look, palette, typefaces or the structure of a landing page is visual direction; low-fidelity layout sketches are wireframes.","Animation and scroll behaviour are motion; edits inside a design tool's canvas file are canvas design."]},{"id":"ui.layout-review","description":"Review existing interface code for layout failures (clipped or overlapping content at 320px or 200% zoom, overflowing grid or flex tracks, fixed heights on text, viewport media queries inside reusable components, broken RTL mirroring, missing cues for hidden content) and report them as located findings with a severity and a verdict, without changing the code.","excludes":["A review of a change's logic, correctness or complexity is engineering review.","The generic-look, interaction-states and polish passes, and the accessibility audit, are design review.","Fixing what the review finds is the structure intent and starts only when the user asks for it."]}]
tools: [{"name":"file-access","purpose":"Read the interface code with its styles and tokens; the structure intent also edits it in place.","required":true},{"name":"browser","purpose":"Render the page to check every supported width, 320px, 200% zoom and the RTL mirror. Without one the static checks run and the rest is reported as not verified.","required":false}]
hooks: []
conflicts: []
reads: ["design_file", "design_tokens", "layout", "constraints"]
---

# Layout Structure (build, repair and review)

Sets how an interface is grouped, aligned, ordered and made to adapt, then stress-tests the result by resizing, translating and mirroring it. The method is `<package_root>/scripts/better-layout/SKILL.source.md`; recipes are in `grouping-and-alignment.md` and `spacing-and-adaptivity.md` beside it, the report format in `reporting.md`. Open a packaged original only at the section a step names. The original is the full version and wins where this body differs, except for the changes listed in the Sources section.

## Behavior

1. **Read the surface.** Take the file or component the user names; failing that, the most recently modified interface file; if unclear, ask. Read it with the styles, tokens and components it references. Write every fix in the project's own styling system, never a second one beside it. The numbers below apply only where the project has no spacing scale or density system; where it has one, use its tokens, and a recorded `design_tokens`, `design_file` or `layout` governs.
2. **Set the structure** (`ui.layout-structure`), by the principles of the method (`SKILL.source.md`, one section each; open the section and its recipe when the case needs it):
   - **Group with space**, shapes second, separator lines last and only where space cannot carry the structure. The gap between groups is at least 2× the gap within one (8px inside, 16px or more between).
   - **Controls look like controls**: a shape, a border, an underline or a consistent zone, never the styling of the static text beside them.
   - **Shared edges**: a small set of alignment edges, one spacing step per nesting level (16px is a useful default).
   - **Logical properties** for anything that mirrors (`margin-inline-start`, `inset-inline-start`, `text-align: start`); physical left and right only for physical geometry such as safe-area insets.
   - **Order by importance**: the key content near the top and the leading edge, identifying content first and metadata and actions last. Visual order equals DOM order: no `order`, `row-reverse` or grid placement that moves content out of source sequence.
   - **One primary action per view**; with more than 3 secondary actions, put them behind a menu; prefer a short view that links deeper to a long one that shows everything.
   - **Hint at hidden content**: every off-screen or collapsed item has a visible cue (the project's own, a 16–32px peek, or a disclosure control), and a truncated value the user needs has a way to the full text that keyboard users reach.
   - **Clearance**: 12px between adjacent bordered or filled controls, 24px between the visible glyphs of borderless text and icon controls (counting each button's padding); compact layouts may use less while hit areas never overlap and the controls stay distinct.
   - **Insets and safe areas**: full-width buttons stay inside the layout margins (about 16px inline on mobile) unless they follow platform chrome, account for safe areas and stay distinguishable; backgrounds and media bleed to the edges, controls and text stay inside margins and safe areas. `env(safe-area-inset-*)` is non-zero only with `viewport-fit=cover`. A sticky header gets `scroll-padding-block-start` equal to its height.
   - **Hold structure until it breaks**: breakpoints come from the content, not device presets; keep the expanded layout until it stops fitting; prefer container queries for components; test the smallest and the largest supported sizes first.
   - **Plan for growth and clipping**: translated strings grow, short ones proportionally more, so a one-word button label is the riskiest text; size text boxes with `max-width` and `min-height`, never a fixed width or height, and let rows wrap; test with pseudo-localization and one long-string locale such as German; never place a critical action where resizing, zoom or scrolling clips it.
3. **Check the detection patterns**: go through every row of `## Before you finish` in `SKILL.source.md` against the code (an overflowing `1fr` track or flex child, `100vw`, `100vh` on a mobile full-height pane, fixed `height` on text, `@media` inside a reusable component, `container-type` without a definite width, safe-area insets without `viewport-fit=cover`, mixed logical and physical insets, `float: left`, `translateX` or `background-position: left` in mirrored UI, a sticky header without `scroll-padding-block-start`). The structure intent fixes each one it finds; the review intent reports it.
4. **Verify.** With a browser, check every supported width, 320px, 200% zoom and the RTL mirror. Without one, check logical against physical properties, container and media queries against the supported viewport list, and DOM order against visual order. Report every check you could not run as `Not verified`.
5. **Review** (`ui.layout-review`): report, do not edit. A finding needs a failure you can show (a clip, an overlap, a broken mirror, a misread group); a value that merely differs from a starting point is not one. Use the severity ladder and the table of `reporting.md`, group findings under the principle each violates, one row per root cause listing every location, and end with `Block` or `Approve`, never `Approve` for coverage you did not inspect. With nothing to report, write "No actionable layout findings" and the verification.
6. **Record** `layout_changes` (files and what changed; `none` for a review) and `layout_report` (the report; `none` for a structure pass that was not asked to report), and summarize what was verified and what was not.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return both output keys as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Severity (`reporting.md`): `HIGH` blocks content or an action at a supported viewport; clipping or overlap at 320px width or 200% zoom is always `HIGH`, as is truncated content with no way to the full value and content past a scroll edge or behind a disclosure with no visible cue. `MEDIUM` harms hierarchy, reading order or adaptability. `LOW` is isolated alignment or spacing polish.
- The source leaves hit areas and focus, radius and shadows, animation, line length and text spacing, truncation mechanics, the words, and the colour of the primary action to other skills of its repository. Those skills are not in this package (see Sources): the step does not apply their rules and says which of them it left out.
- Nothing is installed.

## Checks

- **surface_read_in_full**: the named file or component was read with the styles, tokens and components it references.
- **detection_patterns_checked**: every row of the detection table was checked against the code; those found are fixed (structure) or reported (review).
- **failures_shown**: every finding rests on a failure that can be shown (clip, overlap, broken mirror or misread group), not on a value that differs from a starting point.
- **project_tokens_used**: fixes use the project's spacing scale, density system and tokens; the source's starting numbers appear only where the project has none.
- **stress_verification_stated**: the checks run (widths, 320px, 200% zoom, RTL mirror, or the static equivalents) and every check not run reported as `Not verified`.
- **report_in_source_format**: the report has severity, location, before, after and why, grouped under the violated principle, with a `Block` or `Approve` verdict, or "No actionable layout findings".

## Sources

- AI intent mapping: better-layout → ui.layout-structure (its principles, recipes and detection table, applied to the code) and ui.layout-review (its verification and `reporting.md`, a report without edits).
- Source: better-layout (jakubkrehel/skills@672ae44a, MIT, Copyright (c) 2026 Jakub Krehel; commit `672ae44ace6aaed65b86cbb1e2fd6fbea0e79578`, pin `head`: the upstream has no release or tag). Opened at run time, by section, from `<package_root>/scripts/better-layout/`: `SKILL.source.md`, `grouping-and-alignment.md`, `spacing-and-adaptivity.md`, `reporting.md`. Selected from `skills/better-layout/` of the repository; the factory packages them without that prefix.
- Provenance: boraoztunc/skills carries an unmodified vendored copy of the family (its `NOTICE-jakubkrehel.md`); the pin is the original upstream. The `agents/` folder of the skill (an adapter file for other hosts) is excluded and was not read.
- Changes for coexistence (ADR-0017):
  - The frontmatter description is not an activation rule: the coordinator classifies by meaning (competing routing); the intent descriptions above replace it.
  - The hand-offs to better-accessibility, better-ui, better-motion, better-typography, better-writing and better-colors name skills this package does not carry (the owner took only better-layout, 2026-11-23): a step no host can run. The step names the concern and, for hit areas and focus, points to the accessibility audit of `design-review`, for animation to `motion-principles`; for the rest it states what it did not apply. No rule of those skills is guessed.
  - "Under `better-interface`, its format governs instead" (`reporting.md`): better-interface is not in this package, so the format of `reporting.md` governs.
  - Added by the package: the review reports and edits nothing, and fixing what it found is the structure intent on request (one owner of `layout_changes`); the pair of output keys with `none` as the value a step does not produce (a step closes only with both keys).
- Runtime dependency: none; a browser is optional. Hooks: the selected files define none.
- Harmonized by: prompts/harmonizer.md (2026-11-23) — a new role. `design-review` holds the accessibility, generic-look, hierarchy-and-rhythm, states and polish passes on a design; this step owns layout structure in code (grouping, mirroring, narrow viewports, translation growth) and a located report in its own format. `design-file` records responsive limits as data and `design-file-apply` implements a recorded file; neither builds or reviews a layout from principles. No conflict: the outputs differ and a pass of one can follow the other.
