---
id: motion-principles
role: motion-spec
when: intent:animation
after: ["visual-direction"]
outputs: ["motion-spec", "reduced-motion"]
checks: ["easing_consistent", "timing_matches_spec", "reduced_motion_respected", "no_orphan_animations"]
---

# Motion Principles

Defines the motion specification for animated elements: what moves, how it moves (easing, duration, choreography), and the reduced-motion fallback. Builds on `visual-direction` outputs (layout, constrained elements).

## Behavior

1. **Read Visual Direction** — Consume `palette`, `typography`, `layout`, `constraints` from `.muro/map.md ## Outputs` (produced by `visual-direction` step).
2. **Map Elements to Motion** — For each animated element in the layout:
   - Assign a motion category: `entrance`, `scroll-linked`, `hover`, `focus`, `state-change`.
   - Define easing curve (from motion-design principles: `ease-out-expo`, `ease-in-out-cubic`, `spring-gentle`).
   - Define duration range (150–500ms for micro, 500–1200ms for macro).
   - Define choreography: stagger, sequence, or parallel.
3. **Reduced Motion** — For every motion, specify the `prefers-reduced-motion: reduce` fallback (disable scrub/pin, instant state change, fade only).
4. **Record** — Write to `.muro/map.md ## Outputs`:
   - `motion-spec`: per-element table (element, category, easing, duration, choreography, trigger)
   - `reduced-motion`: global toggle + per-element fallbacks

## Motion-Design Principles (from motion-design skill)

- **Easing as brand**: one easing family per project; never mix `ease-out` and `spring` on the same screen.
- **Duration hierarchy**: micro ≤ 200ms, macro ≤ 800ms, cinematic ≤ 1500ms.
- **Choreography over complexity**: stagger > parallel > sequence; avoid competing motions.
- **Respect reduced motion**: it's not optional — every animated element must declare its fallback.
- **Motion serves content**: animation reveals, guides, or delights; never decorates empty space.

## Specifics

- If `visual-direction` constraints forbid certain motion types (e.g., "no scroll-linked pin"), honor that in `motion-spec`.
- For scroll-driven animations: prefer `ScrollTrigger`-style scrub (when GSAP is the stack) or CSS `animation-timeline: scroll()` (when CSS-only).
- For hover/focus micro-interactions: max 150ms, `ease-out-expo`, no layout shift.

## Checks

- **easing_consistent**: all easing values belong to the declared family.
- **timing_matches_spec**: measured durations (via devtools) within ±20% of spec.
- **reduced_motion_respected**: under `prefers-reduced-motion: reduce`, no scrub/pin runs, all transitions become instant or fade.
- **no_orphan_animations**: every animated element has a declared trigger and fallback.

## Sources

- Source: motion-design (lottiefiles/motion-design-skill@f9a8a041) — `SKILL.md`, `references/**`
- Harmonized by: prompts/harmonizer.md — extracted principles into explicit spec format; removed Lottie-specific asset references per license gate