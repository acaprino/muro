---
id: motion-principles
role: motion-spec
tools: [{"name":"file-access","purpose":"Read existing UI context and record the motion specification.","required":true},{"name":"browser","purpose":"Measure timing and reduced-motion behavior when implemented UI is available.","required":false}]
hooks: []
conflicts: []
reads: ["palette", "typography", "layout", "constraints"]
when: —
intents: [{"id":"ui.motion-design","description":"Decide what moves in a UI and how: motion personality, durations, directional easing, choreography and reduced-motion alternatives, as a specification for later implementation or on its own. Needed before scroll or transition code when the request leaves the motion open.","excludes":["A static hero or page does not imply animation.","A motion specification or hover request does not imply scroll implementation.","A request that already states the exact behavior (for example pin this section and scrub this image) needs no separate specification step.","Animation inside an interactive explainer is part of its own canvas figures."]}]
after: []
outputs: ["motion-spec", "reduced-motion"]
checks: ["purpose_per_animation", "durations_in_source_ranges", "easing_directional", "choreography_within_budget", "reduced_motion_respected", "no_orphan_animations"]
---

# Motion Principles

Defines the motion specification for UI elements: why each element moves, how long, with which easing and in what order, and what replaces it under reduced motion. Works from the existing UI or from a recorded visual direction; it does not require a new art direction. `<MD>` below stands for `<package_root>/scripts/motion-design`.

## Behavior

1. **Read the context.** If `recorded_outputs` (or `<state_dir>/map.md ## Outputs`) holds `palette`, `typography`, `layout` and `constraints` from a `visual-direction` step, use them; otherwise read the existing UI and brand. Answer purpose, audience and context first: busy layout → simpler motion; other animations active → coordinate or stagger; seen 100 times a day → fast and subtle (`<MD>/director/decision-framework.md`).
2. **Choose one motion personality** for the project: Playful, Premium, Corporate or Energetic, with their duration, easing and overshoot. Default: Corporate for UI. Fix the brand motion identity: one signature easing for about 80% of animations, three durations (quick, standard, slow) and one entrance pattern (`<MD>/SKILL.md` Motion Personality; `<MD>/director/motion-personality.md`).
3. **Map each animated element.** Give its category (revealing, concealing, transitioning, emphasizing, responding, ambient), the minimum properties (one is direct, two is the usual best, three or more risks overwhelming), the trigger (load, hover, press, state change, or a scroll range) and its direction.
4. **Time it** from the duration table: micro-feedback 80–120ms, button press 120–180ms, icon 150–250ms, card 200–350ms, modal 300–400ms, page transition 400–600ms, dramatic reveal 600–1200ms. Hover under 100ms, press under 150ms, settle 200–300ms. Distance scales duration (200px = 1.3×, 400px = 1.6×); entrances run 30–50% longer than exits; mobile 0.8×.
5. **Ease by direction:** entrance ease-out, exit ease-in, on-screen ease-in-out, loops sine. Never linear for spatial movement; linear only for spinners and progress bars. Use the industry curves in `<MD>/SKILL.md` Easing Selection.
6. **Choreograph:** lead with the hero element, keep one entry direction, at most one third of three or more elements moving at once, no travel beyond one third of the screen without a keyframe change, and keep total stagger under 500ms.
7. **Reduced motion** for every animation: slides become opacity fades, bounce and spring become instant or a simple ease-out, parallax becomes static, auto-play is paused and user-started, complex choreography becomes a single fade. In general: remove spatial movement, keep opacity, shorten by 50% or more, never auto-play loops (`<MD>/director/context-adaptation.md`).
8. **Record** for the handoff below:
   - `motion-spec`: one row per element: element, purpose and category, properties, duration, easing, choreography, trigger and, for scroll-linked motion, the scroll range and displacement.
   - `reduced-motion`: the global rule and each element's alternative.

## Output handoff

Return every required output key as a JSON string. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **Layers and an approved direction.** The source asks for three motion layers (primary, secondary, ambient) on every animation. When a recorded visual direction limits motion (for example a hover layer, one hero entrance and one or two moments per page, nothing moving with the scroll outside a moment, or no gradients), that project constraint wins: add secondary detail inside the accent, leave out ambient background motion, and state the deviation in `motion-spec`. Without such a constraint, follow the source.
- **Scroll-linked motion:** keep total displacement under 100px, avoid it on mobile and never parallax text (`<MD>/patterns/ambient-continuous.md`). Whether it is built with GSAP ScrollTrigger or CSS is the scroll-code step's choice, not this one's.
- **Performance:** animate transform and opacity; keep fewer than 20 animated elements per viewport; target 60fps.
- **Accessibility beyond reduced motion:** same interaction, same animation; pause controls for animations longer than 5 seconds; never carry critical information through motion alone; avoid vestibular triggers (large zoom, spinning elements over 100px, parallax over 2 layers).

## Checks

- **purpose_per_animation**: every row of `motion-spec` names its purpose and category; decorative motion without a purpose is removed.
- **durations_in_source_ranges**: each duration lies in the source range for its element type, after distance and platform scaling; when implemented UI exists, measured durations match the spec, otherwise the measurement is recorded as not-tested.
- **easing_directional**: entrances ease out, exits ease in, on-screen changes ease in-out, and the signature easing covers most animations.
- **choreography_within_budget**: total stagger under 500ms; at most one third of the elements in motion at once.
- **reduced_motion_respected**: under `prefers-reduced-motion: reduce` no spatial movement, auto-play or scroll-linked displacement remains; opacity changes may.
- **no_orphan_animations**: every animated element has a declared trigger and reduced-motion alternative.

## Sources

- AI intent mapping: motion-design → ui.motion-design, from its "When to Apply", 8-step checklist, Motion Personality, Duration Table, Easing Selection, Choreography Essentials and Quality Rules sections and the `director/`, `reference/` and `patterns/` files.
- Source: motion-design (LottieFiles/motion-design-skill@f9a8a041) — `skills/motion-design/SKILL.md`, `director/**`, `patterns/**`, `reference/**`, packaged under `<package_root>/scripts/motion-design/`.
- Runtime dependency: none.
- Hooks: the selected files define none; `assets/**`, `examples/**` and `scripts/**` are excluded and were not inspected for hooks.
- Harmonized by: prompts/harmonizer.md (2026-11-10 re-harmonization) — no prerequisite: the source starts from purpose, audience and context and defaults to the Corporate personality (`SKILL.md` Motion Personality, `director/decision-framework.md`), and never asks for a palette, layout or offer. The earlier easing names, duration bands, "never mix ease-out and spring" and 150ms hover rule were not in the source and are replaced by its tables. The three-layer rule is scoped by an approved visual direction (see Specifics).
