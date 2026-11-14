---
id: aesthetic-direction
role: aesthetic-direction
when: —
after: []
outputs: ["aesthetic_direction", "direction_sample"]
checks: ["no_existing_context_confirmed", "directions_distinct", "direction_committed_per_axis", "default_look_justified", "sample_reviewed_with_user"]
check_conditions: {"directions_distinct": "Directions are proposed: the user did not state the direction."}
intents: [{"id":"ui.aesthetic-direction","description":"Commit an app, product, prototype or HTML deck that has no brand and no design system to one stated look before any hi-fi work: propose distinct directions when the user is unsure, then fix typefaces, colour tone and palette, density, radius and shadow, component style, imagery and motion mode as concrete values written into the design file and tried on one small surface.","excludes":["A company website or landing page gets its palette and type dealt by visual direction, not chosen here.","A product that already has a brand, a design system, a codebase theme or a recorded direction is matched, not given a new look.","Looking up rules or candidate systems without committing to one is design guidance.","Durations, easing and choreography are the motion specification; this step records only the motion mode."]}]
tools: [{"name":"file-access","purpose":"Search the project for an existing brand, theme or tokens, and write the direction block and the sample surface into the design file.","required":true},{"name":"browser","purpose":"Look at the sample surface as rendered.","required":false},{"name":"question-form","purpose":"Show the choices as a structured form when the host has one; otherwise ask once in plain text.","required":false}]
hooks: []
conflicts: ["visual-direction"]
reads: ["design_candidates"]
---

# Aesthetic Direction (no brand, any HTML design)

Fixes the look of a design that starts with nothing to match, so that the hi-fi work after it follows a stated system instead of template defaults. It is the design authority for app screens, prototypes and HTML decks without a brand; a website or landing page has `visual-direction` for that, and the two are never in one plan. `<CD>` below stands for `<package_root>/scripts/claude-design-system-prompt/claude`. The method is `<CD>/skills/frontend-aesthetic-direction.md`; the system prompt is `<CD>/system-prompt.md`. Open a packaged original only at the section a step names, when the step says so. The original is the full version and wins where this body differs, except for the changes listed in the Sources section.

## Behavior

1. **Confirm there is nothing to match.** Read what the user attached and search the project for a brand guide, an existing app or product to match, a reference site the user wants to mimic, or a partial design system in the codebase. If any exists, stop and use it: record where it is in `aesthetic_direction` as the system to match and `direction_sample` as `not requested`. If the user has a brand and forgot to attach it, ask for it before going on.
2. **Discover the intent.** Ask, or confirm when already stated: three adjectives for the desired feel; the audience; the industry context; reference designs they admire and what exactly in them (type, spacing, colour, tone, density); off-limits aesthetics or tropes. One consolidated round holding only questions whose answer changes the design; decide minor choices yourself and list them in the summary; then wait for the answers. When the brief leaves more than this open, open `## Phase 3: Build the question set` of `<CD>/skills/discovery-questions.md`, and `## Phase 4: Format the question round` when the host has a question form.
3. **Propose when the user is unsure.** Offer 4 distinct directions, each concrete: background hex, accent hex, display and body typeface, and a one-line rationale tied to the brief. They must not share a palette family (four takes on warm cream are one direction, not four), and at least one is deliberately off-distribution. The user picks. Verified `design_candidates` from a design-guidance step may supply directions; they stay candidates until the user picks.
4. **Commit on every axis with concrete values**; a vague statement ("modern and clean") produces a generic design. The axes are typography, colour, density, border radius and shadow, component style, imagery and iconography, and motion. Open `## Phase 3: Commit to the system — make it concrete` of the skill and commit what it asks under each heading; the numbers that bind are: 1–2 font families at most, with weights and a type scale; one colour tone, a primary with light and dark variants, at most one accent, semantic colours and a 5–10 step neutral scale, whites and blacks toned and never pure `#FFFFFF`/`#000000`; a spacing scale on a 4px or 8px base; one elevation system; one motion mode, and the mode only (see Specifics). From the system prompt open `# 8. Typography system` when writing the type scale and pairing, `## Color discipline` (in `# 6. Aesthetic principles — purposeful visuals`) and `# 9. Color system` when writing the palette, and `## Rhythm` (in `# 7. Visual hierarchy and rhythm`) for the spacing scale.
5. **Document the direction** in the file: a comment block at the top of the source and a visible "design system summary" in the rendered output. The form is the example block in `## Phase 4: Document the direction` of the skill.
6. **Apply and test.** Build a small surface (a hero, a card, a button group) with the direction, following `## Defaults that avoid AI slop` of chapter 6, and show it early. Ask: "Does this read as [the three adjectives]?" If it does not, or the user pushes back on an axis, revise before going broader. Look at the rendered surface when a browser is available and say what was not looked at.
7. **Record** `aesthetic_direction` (the three adjectives, the committed choices per axis, the axes the user should review before going broader, the first surface built) and `direction_sample` (the file and what the user said, or `not requested`).

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return both output keys as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **Chosen, never defaulted.** Avoid Inter, Roboto, Arial, bare system stacks and the silent serif-display defaults (Fraunces, Playfair Display, Georgia as display); reach for one only when the brand specifically calls for it. The warm-editorial combination (cream background, serif display, terracotta or amber accent) is chosen only when the brief is genuinely editorial, hospitality or portfolio, and the direction block says so explicitly; if the direction drifts there without a stated reason, pick again.
- **Limits.** 3–5 colours at most across the whole product. Minimum sizes: 1920×1080 slides body 24px, ideally 32px or more; print 12pt; mobile body 16px; interactive hit targets 44px × 44px; desktop body 14–16px is standard.
- **One owner of the look.** Every later design references the direction's tokens, not new inline values; a value the direction lacks is added to the direction first, then used. A direction that has matured becomes a tokens file in the `design-system-extract` step: name it to the user, do not start it.
- The motion mode is a constraint for `motion-principles`, which owns durations, easing and choreography.
- Refuse to recreate a company's distinctive UI patterns, proprietary command structures or branded visual elements, unless the user states the product is their own; find out what the user wants to build and help with an original design instead. Admired references inform the direction.
- Ask the user before adding sections, pages, copy or content nobody requested.
- Nothing is installed. A web font named here is loaded only by the design file that uses it; say that the page then makes a network request.

## Checks

- **no_existing_context_confirmed**: the project and the user's material were searched for a brand guide, an existing app or product, a reference site and a partial design system before any direction was proposed, and the result is stated.
- **directions_distinct**: proposed directions do not share a palette family, each has its own background, accent and display and body typeface, and at least one is deliberately off-distribution; not applicable when the user stated the direction.
- **direction_committed_per_axis**: typography, colour, density, radius and shadow, component style, imagery and motion mode each carry concrete values in the block.
- **default_look_justified**: the direction avoids the overused default fonts the skill lists, and holds the warm-editorial combination only when the brief is genuinely editorial, hospitality or portfolio and the direction block says so.
- **sample_reviewed_with_user**: a small surface was built with the direction and the user's reaction is recorded, or the sample was not requested.

## Sources

- AI intent mapping: frontend-aesthetic-direction → ui.aesthetic-direction, from its five phases; discovery-questions supplies the round of step 2; system prompt chapters 6 to 9 are the commit rules of step 4; chapters 3, 4 and 19 are stated in the body.
- Source: claude-design-system-prompt (Trystan-SA/claude-design-system-prompt@3c3ddb07, head; commit `3c3ddb07d7aa3fef051d83608596470c95cfd8fe`, pin `head`). Opened at run time, by section, from `<package_root>/scripts/claude-design-system-prompt/`: `claude/skills/frontend-aesthetic-direction.md`, `claude/skills/discovery-questions.md` and, of `claude/system-prompt.md`, chapters 6, 8 and 9 and the section "Rhythm" of chapter 7.
- Provenance: the upstream README describes the repository as a "Reverse-engineered system prompt of Claude Design from Anthropic" (from the intake brief; README.md is excluded and was not read).
- Changes for coexistence (ADR-0017):
  - "Use this **before** hi-fi work in a greenfield context" and chapter 4's "invoke the Frontend Design skill" are not activation rules: the coordinator classifies by meaning (competing routing).
  - `questions_v2` (discovery-questions) is a tool of the source's host: the optional `question-form` tool or one plain-text message replaces it.
  - "extract it into a tokens file (`design-system-extract`)" is named to the user, not run: one capability per step, run by the coordinator.
  - The `200ms ease` of the quiet motion mode is not committed as a duration: `motion-principles` owns durations and easing (one owner per output).
  - Chapter 19's "unless the user's email domain indicates they work at that company" cannot be checked by any host: the user's own statement replaces it.
  - Added by the package: `not requested` and the record of the existing system when step 1 stops (a step closes only with both output keys); `design_candidates` as a supply of directions (handoff from `design-guidance`); the lines on what was looked at and on web fonts (honest reporting); websites left to `visual-direction` (two owners of palette and type).
- Runtime dependency: none. Hooks: the selected files define none; `codex/**` and `README.md` are excluded and were not inspected.
- Harmonized by: prompts/harmonizer.md (2026-11-12) — a new role beside `visual-direction`, not merged: taste-skill deals palette and type for a website by trade, this source proposes and commits a look for any artifact with the user. Both would own palette and type, so they are declared conflicting. `design-guidance` only recommends; its candidates are read here.
