---
id: aesthetic-direction
role: aesthetic-direction
when: —
after: []
outputs: ["aesthetic_direction", "direction_sample"]
checks: ["no_existing_context_confirmed", "directions_distinct", "direction_committed_per_axis", "default_look_justified", "sample_reviewed_with_user"]
intents: [{"id":"ui.aesthetic-direction","description":"Commit an app, product, prototype or HTML deck that has no brand and no design system to one stated look before any hi-fi work: propose distinct directions when the user is unsure, then fix typefaces, colour tone and palette, density, radius and shadow, component style, imagery and motion mode as concrete values written into the design file and tried on one small surface.","excludes":["A company website or landing page gets its palette and type dealt by visual direction, not chosen here.","A product that already has a brand, a design system, a codebase theme or a recorded direction is matched, not given a new look.","Looking up rules or candidate systems without committing to one is design guidance.","Durations, easing and choreography are the motion specification; this step records only the motion mode."]}]
tools: [{"name":"file-access","purpose":"Search the project for an existing brand, theme or tokens, and write the direction block and the sample surface into the design file.","required":true},{"name":"browser","purpose":"Look at the sample surface as rendered.","required":false},{"name":"question-form","purpose":"Show the choices as a structured form when the host has one; otherwise ask once in plain text.","required":false}]
hooks: []
conflicts: ["visual-direction"]
reads: ["design_candidates"]
---

# Aesthetic Direction (no brand, any HTML design)

Fixes the look of a design that starts with nothing to match, so that the hi-fi work after it follows a stated system instead of template defaults. It is the design authority for app screens, prototypes and HTML decks without a brand; a website or landing page has `visual-direction` for that, and the two are never in one plan. `<CD>` below stands for `<package_root>/scripts/claude-design-system-prompt/claude`.

## Behavior

1. **Confirm there is nothing to match.** Read what the user attached, then search the project for a brand guide, a theme or tokens file, an existing product UI and named reference sites. If anything exists, stop: record where it is in `aesthetic_direction` as the system to match and `direction_sample` as `not requested`. If the user has a brand and did not supply it, ask for it.
2. **Read the intent.** Three adjectives for the feel, the audience, the industry, designs they admire and what exactly in them, and what is off limits. Ask only what the brief leaves open, in one round.
3. **Propose when the user is unsure.** Four directions, each as a background hex, an accent hex, a display and a body typeface and one line tying it to the brief. No two share a palette family, and at least one is deliberately far from the usual. Verified `design_candidates` from a design-guidance step may supply directions; they stay candidates until the user picks.
4. **Commit every axis with values** (full method: `<CD>/skills/frontend-aesthetic-direction.md`):
   - type: named faces for headline, body and mono, their weights and one size scale; one or two families; the closest free alternative beside a paid face;
   - colour: one tone (warm, cool or neutral), a primary with light and dark variants, at most one accent, semantic colours, a neutral scale of 5 to 10 steps on that tone, whites and blacks toned to it; `oklch()` at one lightness and chroma when the palette is built from scratch;
   - density and a 4px or 8px spacing scale; one radius family and one elevation system; the default component style (filled, ghost, outlined or elevated) with a secondary one for hierarchy;
   - imagery: real photography, professional illustration, one established icon set, or honest labelled placeholders;
   - motion mode: quiet, expressive or playful, one only.
5. **Write it down twice:** a comment block at the top of the design source and a visible design-system summary in the rendered file.
6. **Try it small.** Build one surface (a hero, a card, a button group), show it and ask whether it reads as the three adjectives. Revise before anything broader is built.
7. **Record** `aesthetic_direction` (adjectives, every committed value, open axes) and `direction_sample` (the file and what the user said, or `not requested`).

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return both output keys as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **Chosen, never defaulted.** Inter, Roboto, Arial, bare system stacks and a serif display face used out of habit need a stated reason. A cream background with a serif display face and a terracotta or amber accent fits editorial, hospitality and portfolio briefs; elsewhere, pick again or write the reason in the block.
- Three to five colours for the whole product. Minimum sizes by medium: 24px body on a 1920×1080 slide, 16px body on mobile, 14 to 16px on desktop, 12pt in print, 44px hit targets.
- **One owner of the look.** Later steps take values from the block; a value it lacks is added to the block first, then used. `design-system-extract` can turn a settled direction into a tokens file.
- The motion mode is a constraint for `motion-principles`, which still owns durations, easing and choreography.
- Admired references inform the direction. A company's distinctive interface or branded elements are not reproduced unless the user states the product is their own.
- Nothing is installed. A web font named here is loaded only by the design file that uses it; say that the page then makes a network request.

## Checks

- **no_existing_context_confirmed**: the project and the user's material were searched for a brand, theme or design system before any direction was proposed, and the result is stated.
- **directions_distinct**: proposed directions differ in palette family and type pairing, with one outside the usual range; not applicable when the user stated the direction.
- **direction_committed_per_axis**: type, colour, density, radius and shadow, component style, imagery and motion mode each carry concrete values in the block.
- **default_look_justified**: any overused font or the warm editorial combination in the direction has a reason tied to the brief.
- **sample_reviewed_with_user**: a small surface was built with the direction and the user's reaction is recorded, or the sample was not requested.

## Sources

- AI intent mapping: frontend-aesthetic-direction → ui.aesthetic-direction, from its five phases; system prompt chapter 4 (stop when context exists), 6 (defaults, colour discipline, imagery), 8 (type system, sizes by medium) and 9 (palette structure) supply the commit rules.
- Source: claude-design-system-prompt (Trystan-SA/claude-design-system-prompt@3c3ddb07, head; commit `3c3ddb07d7aa3fef051d83608596470c95cfd8fe`, pin `head`) — `claude/skills/frontend-aesthetic-direction.md`, `claude/skills/discovery-questions.md` (the brand questions of step 2), packaged under `<package_root>/scripts/claude-design-system-prompt/`; `claude/system-prompt.md` chapters 4, 6, 8, 9 and 19, read at intake only and not packaged (`intake_only_paths`: its rules are restated in this body).
- Provenance: the upstream README describes the repository as a "Reverse-engineered system prompt of Claude Design from Anthropic" (README.md is excluded from the selection and was not read at intake; the fact comes from the intake brief). The method is restated here, not copied.
- Not adopted: the `questions_v2` form tool of the source's host (a logical, optional `question-form`); the chapter 19 test of the user's email domain, which no host here can verify, replaced by the user's own statement.
- Runtime dependency: none. Hooks: the selected files define none; `codex/**` and `README.md` are excluded and were not inspected.
- Harmonized by: prompts/harmonizer.md (2026-11-12) — a new role beside `visual-direction`, not merged: taste-skill deals palette and type for a website by trade ("Deal, never choose by taste"), this source proposes and commits a look for any artifact with the user. Both would own palette and type, so they are declared conflicting. `design-guidance` only recommends; its candidates are read here.
