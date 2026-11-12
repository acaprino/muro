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

0. **Read the originals whole before working.** They are the method, in the source's own words:
   - `<CD>/skills/frontend-aesthetic-direction.md`, all five phases;
   - `<CD>/skills/discovery-questions.md`, for the question round of step 2;
   - in `<CD>/system-prompt.md`, these chapters only, each from its heading to the next `# ` heading: `# 2. Workflow`, `# 3. Asking questions first`, `# 4. Rooting designs in existing context`, `# 6. Aesthetic principles — purposeful visuals`, `# 7. Visual hierarchy and rhythm`, `# 8. Typography system`, `# 9. Color system`, `# 19. IP and content boundaries`. Chapter 19 sends to `# 5. Content principles — no filler`: read that chapter for that reference. No other part of the prompt is read for this capability.

   The steps below are an index into those files. Where this body and an original differ, the original wins, except for the changes listed in the Sources section under "Changes for coexistence".
1. **Confirm there is nothing to match** (skill Phase 1, chapter 4). Read what the user attached, then search the project. The skill's list: "no brand guide, no existing app or product to match, no reference site the user wants to mimic, no partial design system in the codebase. If any exist, **stop and use them**". When one exists, record where it is in `aesthetic_direction` as the system to match and `direction_sample` as `not requested`. "If the user has a brand and forgot to attach it, ask for it before proceeding."
2. **Discover the intent** (skill Phase 2, discovery-questions, chapter 3). "Ask the user (or confirm if stated): **three adjectives** for the desired feel; **audience**; **industry context**; **reference designs they admire** (and what specifically — the type, spacing, color, tone, density?); **off-limits** aesthetics or tropes." One consolidated round, built and sized as discovery-questions says.
3. **Propose when the user is unsure** (skill Phase 2). "If the user is unsure, propose **4 distinct visual directions**, each specified concretely — background hex / accent hex / display + body typeface, with a one-line rationale tied to the brief — and let them pick. The directions must not share a palette family: four takes on warm-cream is one direction, not four. Make at least one deliberately off-distribution." Verified `design_candidates` from a design-guidance step may supply directions; they stay candidates until the user picks.
4. **Commit to the system** (skill Phase 3, with chapters 6 to 9). "Vague aesthetic statements ("modern and clean") produce generic designs. Commit on each axis": Typography, Color, Density, Border radius and shadow, Component style, Imagery and iconography, Motion, each with the choices, names and numbers the skill gives under that heading. For Motion this step commits the mode only (see Specifics).
5. **Document the direction** (skill Phase 4): "a comment block at the top of the source AND a visible "design system summary" in the rendered output", in the form of the skill's example block.
6. **Apply and test** (skill Phase 5). "Build a small surface (a hero, a card, a button group) with the direction and show it to the user early. Ask: "Does this read as [the three adjectives]?" If not — or the user pushes back on an axis — revise before going broader."
7. **Record** `aesthetic_direction` and `direction_sample` (the file and what the user said, or `not requested`). `aesthetic_direction` holds what the skill's summary asks for: "the three adjectives, the committed choices per axis, any axes the user should review before you go broader, and the first surface built with the direction."

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return both output keys as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **Chosen, never defaulted** (skill Phase 3, chapter 6). "Avoid the overused defaults — Inter, Roboto, Arial, bare system stacks, and the silent serif-display defaults (Fraunces, Playfair Display, Georgia-as-display)." Chapter 6 on the same fonts: "reach for them only when the brand specifically calls for them". On the warm-editorial combination (cream background + serif display + terracotta/amber accent): "Choose it only when the brief is genuinely editorial, hospitality, or portfolio — and say so explicitly in the direction block. If the direction drifts there without a stated reason, pick again."
- Chapter 6: "**Limit the palette.** 3–5 colors maximum across the whole product." The minimum sizes by medium are chapter 8, `## Scale rules per medium`.
- **One owner of the look** (skill Phase 5). "Every subsequent design references the direction's tokens, not new inline values. If a new design needs an undefined value, **add it to the direction first**, then use it." A direction that has matured becomes a tokens file in the `design-system-extract` step: name it to the user, do not start it.
- The motion mode is a constraint for `motion-principles`, which owns durations, easing and choreography.
- Chapter 19: "If asked to recreate a company's distinctive UI patterns, proprietary command structures, or branded visual elements, refuse", unless the user states the product is their own. "Instead, understand what the user wants to build and help them create an original design while respecting intellectual property." Admired references inform the direction.
- Nothing is installed. A web font named here is loaded only by the design file that uses it; say that the page then makes a network request.

## Checks

- **no_existing_context_confirmed**: the project and the user's material were searched for a brand guide, an existing app or product, a reference site and a partial design system before any direction was proposed, and the result is stated.
- **directions_distinct**: proposed directions do not share a palette family, each has its own background, accent and display and body typeface, and at least one is deliberately off-distribution; not applicable when the user stated the direction.
- **direction_committed_per_axis**: typography, colour, density, radius and shadow, component style, imagery and motion mode each carry concrete values in the block.
- **default_look_justified**: the direction avoids the overused default fonts the skill lists, and holds the warm-editorial combination only when the brief is genuinely editorial, hospitality or portfolio and the direction block says so.
- **sample_reviewed_with_user**: a small surface was built with the direction and the user's reaction is recorded, or the sample was not requested.

## Sources

- AI intent mapping: frontend-aesthetic-direction → ui.aesthetic-direction, from its five phases; discovery-questions supplies the question round of step 2; system prompt chapters 2 (order of work), 3 (questions), 4 (stop when context exists), 6 to 9 (defaults, colour discipline, imagery, hierarchy and rhythm, type system and sizes by medium, palette structure) and 19 (limits) are applied as the delivery decisions assign them.
- Source: claude-design-system-prompt (Trystan-SA/claude-design-system-prompt@3c3ddb07, head; commit `3c3ddb07d7aa3fef051d83608596470c95cfd8fe`, pin `head`) — `claude/skills/frontend-aesthetic-direction.md`, `claude/skills/discovery-questions.md` and `claude/system-prompt.md` (chapters 2, 3, 4, 6, 7, 8, 9 and 19, with chapter 5 where chapter 19 refers to it), all packaged under `<package_root>/scripts/claude-design-system-prompt/` and read at run time (step 0).
- Provenance: the upstream README describes the repository as a "Reverse-engineered system prompt of Claude Design from Anthropic" (README.md is excluded from the selection and was not read at intake; the fact comes from the intake brief).
- Changes for coexistence (ADR-0017):
  - The skill's opening "Use this **before** hi-fi work in a greenfield context" and chapter 4's "invoke the Frontend Design skill" are not activation rules here: the coordinator classifies by meaning and selects this capability, alone or as a declared prerequisite of another.
  - The form tool `questions_v2` of discovery-questions Phases 4 and 5 belongs to the source's host and is not in the selected snapshot: the round uses the optional logical `question-form` tool when the host has one, otherwise one plain-text message, and the step waits for the answers either way.
  - Skill names in the originals are not invoked from this step (one capability per step, run by the coordinator). discovery-questions Phase 5 "Proceed to the appropriate building skill" means continuing with the steps of this body; the skill's "extract it into a tokens file (`design-system-extract`)" is named to the user as a next step.
  - The `200ms ease` of the skill's quiet motion mode and of its example block is not committed as a duration: `motion-principles` owns durations, easing and choreography (one owner per output). The mode itself is committed.
  - Chapter 19's test "unless the user's email domain indicates they work at that company" cannot be run by any supported host: it is replaced by the user's own statement that the product is theirs.
  - Chapter 2, closing paragraphs ("You are encouraged to call file-exploration tools concurrently", "Default to silence between tool calls ...") are not applied: conduct for the whole conversation belongs to the host and would change how other capabilities report. The "verifier subagent" of its step 5 is a tool of the source's host: the sample is looked at with the optional `browser` tool, and what was not looked at is said.
  - Added by the package: the `not requested` value and the record of the existing system when step 1 stops (the coordinator closes a step only with both output keys); `design_candidates` as a possible supply of directions (handoff from `design-guidance`); the line on web fonts and network requests (the package states what a deliverable loads and from where); the scope, which leaves websites and landing pages to `visual-direction` (two owners of palette and type cannot share a plan).
  - Not read and not applied (dropped in `delivery.json`): the prompt's opening lines, chapter 1 (persona, "the user is your manager", the rule not to divulge the environment), chapter 20 (the source's own routing and trigger phrases) and the "Final principle".
- Runtime dependency: none. Hooks: the selected files define none; `codex/**` and `README.md` are excluded and were not inspected.
- Harmonized by: prompts/harmonizer.md (2026-11-12) — a new role beside `visual-direction`, not merged: taste-skill deals palette and type for a website by trade ("Deal, never choose by taste"), this source proposes and commits a look for any artifact with the user. Both would own palette and type, so they are declared conflicting. `design-guidance` only recommends; its candidates are read here.
