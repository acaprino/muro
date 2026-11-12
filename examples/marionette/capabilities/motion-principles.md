---
id: motion-principles
role: motion-spec
tools: [{"name":"file-access","purpose":"Read existing UI context and record the motion specification.","required":true},{"name":"browser","purpose":"Measure timing and reduced-motion behavior when implemented UI is available.","required":false}]
hooks: []
conflicts: []
reads: ["palette", "typography", "layout", "constraints", "aesthetic_direction"]
when: —
intents: [{"id":"ui.motion-design","description":"Decide what moves in a UI and how: motion personality, durations, directional easing, choreography and reduced-motion alternatives, as a specification for later implementation or on its own. Needed before scroll or transition code when the request leaves the motion open.","excludes":["A static hero or page does not imply animation.","A motion specification or hover request does not imply scroll implementation.","A request that already states the exact behavior (for example pin this section and scrub this image) needs no separate specification step.","Animation inside an interactive explainer is part of its own canvas figures."]}]
after: []
outputs: ["motion-spec", "reduced-motion"]
checks: ["purpose_per_animation", "durations_in_source_ranges", "easing_directional", "choreography_within_budget", "reduced_motion_respected", "no_orphan_animations"]
---

# Motion Principles

Defines the motion specification for UI elements: why each element moves, how long, with which easing and in what order, and what replaces it under reduced motion. Works from the existing UI or from a recorded visual direction; it does not require a new art direction. `<MD>` below stands for `<package_root>/scripts/motion-design`.

## Behavior

Before working, read these packaged originals whole: `<MD>/SKILL.source.md`, `<MD>/director/decision-framework.md`, `<MD>/director/context-adaptation.md` and `<MD>/reference/quality-checklist.md`. Read each other file listed in the `## File Reference` section of `<MD>/SKILL.source.md` (under `<MD>/director/`, `<MD>/reference/` and `<MD>/patterns/`) whole when the task touches its subject. These files are the method in the source's own words. The steps below are an index into them; where this body and an original differ, the original wins, except for the changes listed in the Sources section below under "Changes for coexistence".

1. **Read the context.** If `recorded_outputs` (or `<state_dir>/map.md ## Outputs`) holds `palette`, `typography`, `layout` and `constraints` from a `visual-direction` step, use them; a recorded `aesthetic_direction` carries a motion mode (quiet, expressive or playful) that the personality of step 2 must fit; otherwise read the existing UI and brand. Answer the source's first questions, Purpose, Audience and Context (`<MD>/director/decision-framework.md`, `## The First Questions`), and the first item of its 8-step checklist, "**Emotional target?** — joy, calm, urgency, elegance" (`<MD>/SKILL.source.md`, `## Quick Reference: 8-Step Checklist` and `## Three Pillars (CRITICAL)`).
2. **Choose the motion personality.** "Select ONE archetype per project. Apply consistently." The four archetypes (Playful, Premium, Corporate, Energetic) with their duration, easing and overshoot are in the table of `<MD>/SKILL.source.md`, `## Motion Personality`. Default: Corporate for UI, Playful for illustrations. Fix the Brand Motion Identity, "define three constants": "**Signature easing**: One curve for 80% of animations", "**Duration palette**: 3 durations (quick / standard / slow)", "**Entrance pattern**: One consistent entry style" (values per archetype in `<MD>/director/motion-personality.md`).
3. **Map each animated element.** Give its category (Revealing, Concealing, Transitioning, Emphasizing, Responding, Ambient) and direction from `<MD>/director/decision-framework.md`, `## 4-Level Decision Hierarchy`; its properties from `<MD>/SKILL.source.md`, `## Property Selection` ("**Simplicity threshold**: Use the minimum properties needed. One = direct. Two = polished. Three+ = potentially overwhelming."); and its trigger (load, hover, press, state change, or a scroll range).
4. **Time it** from `<MD>/SKILL.source.md`, `## Duration Table`: Tooltip / micro-feedback 80-120ms, Button press / toggle 120-180ms, Icon transition 150-250ms, Card enter / exit 200-350ms, Modal / dialog 300-400ms, Page transition 400-600ms, Dramatic reveal 600-1200ms. Interactive feedback: Hover under 100ms, Press under 150ms, Release/settle 200-300ms, Error shake 300-400ms (2-3 oscillations). "**Distance scales duration**: 100px = base. 200px = 1.3x. 400px = 1.6x." "**Enter > Exit**: Entrances 30-50% longer than exits." Platform duration modifiers (Mobile 0.8x and the others) are in `<MD>/director/context-adaptation.md`, `## Platform Scaling`.
5. **Ease by direction** (`<MD>/SKILL.source.md`, `## Easing Selection`): Entrance, ease-out family; Exit, ease-in family; On-screen, ease-in-out family; Looping ambient, sine-based ease-in-out. "**Never linear for spatial movement** — always use easing curves (linear only for spinners, progress bars)". Use the industry curves and material-based easing of the same section.
6. **Choreograph** (`<MD>/SKILL.source.md`, `## Choreography Essentials`; `<MD>/director/choreography.md`): "Lead with the hero — primary element enters first or most prominently"; "Spatial consistency — all elements enter from same direction"; "Counter-motion — hero moves right → ambient moves left at 20-30% speed"; "**1/3 Rule (distance)**: No motion travels more than 1/3 of screen without a keyframe change."; "**1/3 Rule (elements)**: With 3+ elements, no more than 1/3 in active motion simultaneously."; the stagger budgets of that section; "**Critical**: Total stagger must stay under 500ms."
7. **Reduced motion** for every animation, from the table in `<MD>/director/context-adaptation.md`, `### prefers-reduced-motion`: Slide entrance → Opacity fade only; Bounce/spring → Instant or simple ease-out; Parallax → Static positioning; Auto-playing → Paused, user-initiated; Complex choreography → Single fade; Continuous ambient → Static or subtle opacity pulse. "Reduced motion means: remove spatial movement, keep opacity, remove spring easing, reduce duration 50%+, never auto-play loops."
8. **Record** for the handoff below:
   - `motion-spec`: one row per element: element, purpose and category, properties, duration, easing, choreography, trigger and, for scroll-linked motion, the scroll range and displacement.
   - `reduced-motion`: the global rule and each element's alternative.

## Output handoff

Return every required output key as a JSON string. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **Quality rules.** `<MD>/SKILL.source.md`, `## Quality Rules`, "CRITICAL — never break": "**Never linear for spatial movement**", "**Never opacity-only** for important state changes — combine with position or scale", "**Never exceed 1/3 screen** without intermediate keyframe", "**Always three motion layers** — primary + secondary + ambient". Its "HIGH — strongly follow" list and `<MD>/reference/quality-checklist.md` apply as written.
- **Layers and an approved direction.** The source asks for three motion layers (primary, secondary, ambient) on every animation. When a recorded visual direction limits motion (for example a hover layer, one hero entrance and one or two moments per page, nothing moving with the scroll outside a moment, or no gradients), that project constraint wins: add secondary detail inside the accent, leave out ambient background motion, and state the deviation in `motion-spec`. Without such a constraint, follow the source.
- **Scroll-linked motion:** "**Scroll-driven**: total displacement <100px; avoid on mobile; never parallax text" (`<MD>/patterns/ambient-continuous.md`, `## Parallax`). Whether it is built with GSAP ScrollTrigger or CSS is the scroll-code step's choice, not this one's.
- **Performance** (`<MD>/director/context-adaptation.md`, `## Performance Budgets`; `<MD>/reference/property-selection.md`, `## Performance`): "**Rule**: Prefer transform + opacity for all motion."; "Target 60fps (16.67ms/frame); animation logic <10ms/frame"; "will-change sparingly; keep animated elements <20 per viewport".
- **Accessibility beyond reduced motion** (`<MD>/director/context-adaptation.md`, `## Accessibility`): "Vestibular Triggers (avoid or provide alternatives)": "Large-scale zoom, full-screen position transitions", "Spinning elements >100px, parallax >2 layers, rapid direction changes". Cognitive accessibility: "Same interaction = same animation every time", "Pause controls for animations >5 seconds", "Don't convey critical info through motion alone".

## Checks

- **purpose_per_animation**: every row of `motion-spec` names its purpose and category; decorative motion without a purpose is removed.
- **durations_in_source_ranges**: each duration lies in the source range for its element type, after distance and platform scaling; when implemented UI exists, measured durations match the spec, otherwise the measurement is recorded as not-tested.
- **easing_directional**: entrances ease out, exits ease in, on-screen changes ease in-out, and the signature easing is the one curve for 80% of animations.
- **choreography_within_budget**: total stagger under 500ms; with three or more elements, at most one third in active motion at once.
- **reduced_motion_respected**: under `prefers-reduced-motion: reduce` no spatial movement, auto-play or scroll-linked displacement remains; opacity changes may.
- **no_orphan_animations**: every animated element has a declared trigger and reduced-motion alternative.

## Sources

- AI intent mapping: motion-design → ui.motion-design, from its "When to Apply", 8-step checklist, Motion Personality, Duration Table, Easing Selection, Choreography Essentials and Quality Rules sections and the `director/`, `reference/` and `patterns/` files.
- Source: motion-design (LottieFiles/motion-design-skill@f9a8a041) — `skills/motion-design/SKILL.md`, `director/**`, `patterns/**`, `reference/**`, packaged whole under `<package_root>/scripts/motion-design/` (the skill file as `SKILL.source.md`) and read at run time as the method.
- Changes for coexistence (ADR-0017):
  - The source's frontmatter (`name`, `description` with its "Use when" list) and its `## When to Apply` list and decision tree are not used to activate anything: the coordinator classifies the task by meaning, and the file is packaged as `SKILL.source.md` so no host registers it as a skill.
  - The source creates the animation itself ("Before creating any animation"). This step delivers the specification (`motion-spec`, `reduced-motion`) through the coordinator and builds nothing: scroll code belongs to the `scroll-code` capabilities, one capability per step. For that handoff each row also carries a trigger and, for scroll-linked motion, the scroll range and displacement, which the source does not ask for.
  - "**Always three motion layers** — primary + secondary + ambient" (Quality Rules, CRITICAL 4; also "Layers" in `director/decision-framework.md` and the layer items of `reference/quality-checklist.md`) yields to a recorded visual direction that limits motion: `visual-direction` owns `constraints`, and this rule would otherwise bend an approved direction. Without such a constraint the rule applies as written (Specifics).
  - The archetype is chosen by the source's keywords and default, but must fit the motion mode of a recorded `aesthetic_direction`: `aesthetic-direction` owns that output.
  - The checks `purpose_per_animation` and `no_orphan_animations` and the not-tested record of `durations_in_source_ranges` are this package's evidence contract, not rules of the source.
- Runtime dependency: none.
- Hooks: the selected files define none; `assets/**`, `examples/**` and `scripts/**` are excluded and were not inspected for hooks.
- Harmonization 2026-11-12 (claude-design-system-prompt intake): that source gives 0.2 to 0.3 seconds for every state transition and calls anything under 0.15 jarring, against this source's 80 to 180ms feedback durations. This step stays the owner of timing: `design-review` and `ui-prototype` use the other band only when no `motion-spec` is recorded. `aesthetic_direction` is read for its motion mode.
- Harmonized by: prompts/harmonizer.md (2026-11-10 re-harmonization) — no prerequisite: the source starts from purpose, audience and context and defaults to the Corporate personality (`SKILL.md` Motion Personality, `director/decision-framework.md`), and never asks for a palette, layout or offer. The earlier easing names, duration bands, "never mix ease-out and spring" and 150ms hover rule were not in the source and are replaced by its tables. The three-layer rule is scoped by an approved visual direction (see Specifics).
