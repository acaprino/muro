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

The files under `<MD>/` are the full version of this method. Open the file and section a step names when the task needs that detail, nothing more. Where this body and an original differ, the original wins, except for the changes listed in the Sources section under "Changes for coexistence".

1. **Read the context.** If `recorded_outputs` (or `<state_dir>/map.md ## Outputs`) holds `palette`, `typography`, `layout` and `constraints` from a `visual-direction` step, use them; a recorded `aesthetic_direction` carries a motion mode (quiet, expressive or playful) that the personality of step 2 must fit; otherwise read the existing UI and brand. Before any technical choice settle purpose, audience and context (`<MD>/director/decision-framework.md`, `## The First Questions`) and the emotional target: joy, calm, urgency, elegance (`<MD>/director/emotion-mapping.md` turns an emotion into path, easing and duration).
2. **Choose the motion personality.** One archetype per project, applied consistently: Playful, Premium, Corporate or Energetic, with the duration, easing, overshoot and keywords of the table in `<MD>/SKILL.source.md`, `## Motion Personality`. Default: Corporate for UI, Playful for illustrations. Fix three constants: one signature easing for 80% of animations, 3 durations (quick, standard, slow) and one consistent entrance pattern; their values per archetype are in `<MD>/director/motion-personality.md`, `## Brand Motion Identity`.
3. **Map each animated element.** Give its category (Revealing, Concealing, Transitioning, Emphasizing, Responding, Ambient) and direction (`<MD>/director/decision-framework.md`, `## 4-Level Decision Hierarchy`), its trigger (load, hover, press, state change, or a scroll range) and the minimum properties needed: one is direct, two is polished, three or more is potentially overwhelming (`<MD>/SKILL.source.md`, `## Property Selection`). When the element is one a recipe file covers, open it: `<MD>/patterns/entrance-exit.md`, `<MD>/patterns/state-feedback.md` (press, hover, success, error, loading, focus) or `<MD>/patterns/multi-element.md`.
4. **Time it** (`<MD>/SKILL.source.md`, `## Duration Table`): Tooltip / micro-feedback 80-120ms, Button press / toggle 120-180ms, Icon transition 150-250ms, Card enter / exit 200-350ms, Modal / dialog 300-400ms, Page transition 400-600ms, Dramatic reveal 600-1200ms. Hover under 100ms, Press under 150ms, Release/settle 200-300ms, Error shake 300-400ms (2-3 oscillations). Distance scales duration: 100px is the base, 200px = 1.3x, 400px = 1.6x. Entrances run 30-50% longer than exits. Off desktop, apply `<MD>/director/context-adaptation.md`, `## Platform Scaling` (Mobile 0.8x and its mobile rules). For a spring or an overshoot open `<MD>/reference/timing-easing-tables.md`.
5. **Ease by direction** (`<MD>/SKILL.source.md`, `## Easing Selection`, with the industry curves and material-based easing): entrance, ease-out family; exit, ease-in family; on-screen, ease-in-out family; looping ambient, sine-based ease-in-out. Never linear for spatial movement: linear only for spinners and progress bars.
6. **Choreograph** (`<MD>/SKILL.source.md`, `## Choreography Essentials`): lead with the hero, which enters first or most prominently; all elements enter from the same direction; counter-motion runs opposite to the hero at 20-30% of its speed. No motion travels more than 1/3 of the screen without a keyframe change; with 3 or more elements, no more than 1/3 are in active motion at once. Stagger delays come from that section's budgets, and total stagger must stay under 500ms. Open `<MD>/director/choreography.md` for a multi-element sequence, and `<MD>/director/disney-principles.md` or `<MD>/director/narrative-structure.md` when an animation needs anticipation, follow-through or phases.
7. **Reduced motion** for every animation (`<MD>/director/context-adaptation.md`, `### prefers-reduced-motion`): slide entrance → opacity fade only; bounce or spring → instant or simple ease-out; parallax → static positioning; auto-playing → paused, user-initiated; complex choreography → single fade; continuous ambient → static or subtle opacity pulse. In general: remove spatial movement, keep opacity, remove spring easing, reduce duration 50% or more, never auto-play loops.
8. **Record** for the handoff below:
   - `motion-spec`: one row per element: element, purpose and category, properties, duration, easing, choreography, trigger and, for scroll-linked motion, the scroll range and displacement.
   - `reduced-motion`: the global rule and each element's alternative.

## Output handoff

Return every required output key as a JSON string. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **Quality rules** (`<MD>/SKILL.source.md`, `## Quality Rules`, which also lists four HIGH rules). Four are critical, never break: the linear rule of step 5, the 1/3-screen rule of step 6, never opacity-only for an important state change (combine it with position or scale), and always three motion layers: primary, secondary and ambient (`<MD>/director/core-philosophy.md`, `## Three Motion Layers`). Before recording, run the spec against `<MD>/reference/quality-checklist.md`.
- **Layers and an approved direction.** When a recorded visual direction limits motion (for example a hover layer, one hero entrance and one or two moments per page, nothing moving with the scroll outside a moment, or no gradients), that constraint wins over the three-layer rule: add secondary detail inside the accent, leave out ambient background motion, and state the deviation in `motion-spec`. Without such a constraint, follow the source.
- **Scroll-linked motion:** total displacement under 100px, avoid it on mobile, never parallax text (`<MD>/patterns/ambient-continuous.md`, `## Parallax`, with the layer speed ratios). Whether it is built with GSAP ScrollTrigger or CSS is the scroll-code step's choice, not this one's.
- **Performance:** prefer transform and opacity for all motion; target 60fps with animation logic under 10ms per frame; will-change sparingly; under 20 animated elements per viewport. For any other property open `<MD>/director/context-adaptation.md`, `## Performance Budgets`, and `<MD>/reference/property-selection.md`, `## Performance`.
- **Accessibility beyond reduced motion** (`<MD>/director/context-adaptation.md`, `## Accessibility`). Avoid, or give an alternative for, vestibular triggers: large-scale zoom, full-screen position transitions, spinning elements over 100px, parallax over 2 layers, rapid direction changes. Same interaction, same animation every time; pause controls for animations longer than 5 seconds; no critical information through motion alone.

## Checks

- **purpose_per_animation**: every row of `motion-spec` names its purpose and category; decorative motion without a purpose is removed.
- **durations_in_source_ranges**: each duration lies in the source range for its element type, after distance and platform scaling; when implemented UI exists, measured durations match the spec, otherwise the measurement is recorded as not-tested.
- **easing_directional**: entrances ease out, exits ease in, on-screen changes ease in-out, and the signature easing is the one curve for 80% of animations.
- **choreography_within_budget**: total stagger under 500ms; with three or more elements, at most one third in active motion at once.
- **reduced_motion_respected**: under `prefers-reduced-motion: reduce` no spatial movement, auto-play or scroll-linked displacement remains; opacity changes may.
- **no_orphan_animations**: every animated element has a declared trigger and reduced-motion alternative.

## Sources

- AI intent mapping: motion-design → ui.motion-design, from its "When to Apply", 8-step checklist, Motion Personality, Duration Table, Easing Selection, Choreography Essentials and Quality Rules sections and the `director/`, `reference/` and `patterns/` files.
- Source: motion-design (LottieFiles/motion-design-skill@f9a8a041) — `skills/motion-design/SKILL.md`, `director/**`, `patterns/**`, `reference/**`, packaged under `<package_root>/scripts/motion-design/` (the skill file as `SKILL.source.md`). The body states the method in this package's words and points at the section a task needs.
- Changes for coexistence (ADR-0017):
  - The source's frontmatter and `## When to Apply` list and decision tree activate nothing: the coordinator owns routing and classifies by meaning.
  - The source creates the animation; this step delivers only the specification (`motion-spec`, `reduced-motion`), because scroll code belongs to the `scroll-code` capabilities, one capability per step. For that handoff each row also carries a trigger and, for scroll-linked motion, the scroll range and displacement, which the source does not ask for.
  - "Always three motion layers" (Quality Rules, CRITICAL 4, and the layer items of the decision framework and quality checklist) yields to a recorded visual direction that limits motion: `visual-direction` owns `constraints`.
  - The archetype must also fit the motion mode of a recorded `aesthetic_direction`: `aesthetic-direction` owns that output.
  - The checks `purpose_per_animation` and `no_orphan_animations` and the not-tested record of `durations_in_source_ranges` are this package's evidence contract, not rules of the source.
- Runtime dependency: none.
- Hooks: the selected files define none; `assets/**`, `examples/**` and `scripts/**` are excluded and were not inspected for hooks.
- Harmonization 2026-11-12 (claude-design-system-prompt intake): that source gives 0.2 to 0.3 seconds for every state transition and calls anything under 0.15 jarring, against this source's 80 to 180ms feedback durations. This step stays the owner of timing: `design-review` and `ui-prototype` use the other band only when no `motion-spec` is recorded. `aesthetic_direction` is read for its motion mode.
- Harmonized by: prompts/harmonizer.md (2026-11-10 re-harmonization) — no prerequisite: the source starts from purpose, audience and context and defaults to the Corporate personality (`SKILL.md` Motion Personality, `director/decision-framework.md`), and never asks for a palette, layout or offer. The earlier easing names, duration bands, "never mix ease-out and spring" and 150ms hover rule were not in the source and are replaced by its tables. The three-layer rule is scoped by an approved visual direction (see Specifics).
