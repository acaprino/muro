---
id: css-scroll
role: scroll-code
tools: [{"name":"file-access","purpose":"Inspect and patch the target CSS/components.","required":true},{"name":"browser","purpose":"Verify browser support, timelines, sticky behavior and reduced motion.","required":true}]
hooks: []
conflicts: ["gsap-scrolltrigger"]
reads: ["motion-spec", "reduced-motion"]
when: stack:css-only
intents: [{"id":"ui.scroll-animation","description":"Implement scroll-linked animation, scrub, pinning, parallax or horizontal scroll sections in code, from a behavior the user states or a recorded motion specification.","excludes":["Motion-only specifications and ordinary hover transitions do not require scroll code.","An empty package manifest is not a CSS-only requirement.","Animation inside an interactive explainer is part of its own canvas figures."]}]
after: []
outputs: ["code-patch", "scroll-verified"]
checks: ["scroll_timeline_accurate", "pin_stable_css", "unsupported_browsers_static", "reduced_motion_disables_animation", "no_js_required"]
---

# CSS Scroll Animation (No-JS Variant)

Implements scroll-driven animation in pure CSS with scroll and view timelines, for projects that require no JavaScript animation library. It builds the behavior the user stated, or the scroll rows of a recorded `motion-spec`.

## Behavior

The CSS method below is Muro-authored and has no packaged original. Only the motion limits come from a source: before working, read whole `<package_root>/scripts/motion-design/patterns/ambient-continuous.md` (section `## Parallax`), `<package_root>/scripts/motion-design/director/context-adaptation.md` (sections `## Platform Scaling` and `## Accessibility`) and the section `## Quality Rules` of `<package_root>/scripts/motion-design/SKILL.source.md`. For those limits the originals are the source's own words; where this body and an original differ, the original wins, except for the changes listed in the Sources section below under "Changes for coexistence".

1. **Read the behavior.** If `recorded_outputs` (or `<state_dir>/map.md ## Outputs`) holds `motion-spec` and `reduced-motion`, implement their scroll-linked rows. Otherwise implement the behavior the user stated. Do not invent a choreography the user did not ask for.
2. **Check support** for `animation-timeline` in the project's target browsers against current MDN or caniuse data; do not rely on remembered version numbers.
3. **Write the CSS.**
   - A `@keyframes` rule for each scroll-linked element.
   - `animation-timeline: scroll(...)` for progress through a scroll container, or `view()` for an element crossing the viewport; `animation-range` limits the active part of the scroll.
   - Timing function from the motion specification; linear only where the progress must track the scroll position one to one.
   - Pin-like behavior with `position: sticky` on a wrapper whose height sets the scroll range. True pinning with spacing needs JavaScript and is outside this variant.
4. **Fallback.** Put the scroll-driven rules inside `@supports (animation-timeline: scroll())`, so unsupported browsers show the static, finished state.
5. **Reduced motion.** Under `@media (prefers-reduced-motion: reduce)` remove the scroll-driven animations (`animation: none`) and apply the recorded `reduced-motion` alternative.
6. **Verify** in a supporting browser and one without support, then with reduced motion on.
7. **Record** for the handoff below:
   - `code-patch`: the CSS and component files changed and a short diff summary.
   - `scroll-verified`: what was checked in which browsers, or not-tested with the reason.

## Output handoff

Return every required output key as a JSON string. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- The host AI selects this variant only for an explicit CSS-only constraint (`stack:css-only`), even when GSAP is installed; Python never substitutes another variant.
- The result is CSS only: no runtime dependency and no bundle-size change.
- Limits from motion-design, also without a recorded specification: "**Scroll-driven**: total displacement <100px; avoid on mobile; never parallax text" (`patterns/ambient-continuous.md`); mobile rules "avoid parallax" and, under `prefers-reduced-motion`, "Parallax" becomes "Static positioning" (`director/context-adaptation.md`); "**Never linear for spatial movement** — always use easing curves (linear only for spinners, progress bars)" (`SKILL.source.md`, Quality Rules), applied here as in step 3.

## Checks

- **scroll_timeline_accurate**: in a supporting browser the animation progress follows the declared scroll or view range.
- **pin_stable_css**: sticky elements stay in place through their range with no layout jump.
- **unsupported_browsers_static**: in a browser without `animation-timeline` support the page shows a usable static state.
- **reduced_motion_disables_animation**: under `prefers-reduced-motion: reduce` no scroll-driven animation runs.
- **no_js_required**: no JavaScript is added for the animated elements.

## Sources

- No selected upstream source covers CSS scroll-driven animation. This variant is Muro-authored, kept from the original architecture (ADR-0002, the CSS-only alternative to GSAP), and its CSS method is general platform knowledge, not extracted from a pinned skill.
- Source: motion-design (LottieFiles/motion-design-skill@f9a8a041) — only the limits in Specifics: `patterns/ambient-continuous.md` (scroll-driven displacement, mobile, text parallax), `director/context-adaptation.md` (parallax on mobile and under reduced motion) and `SKILL.md` Quality Rules (linear only for spinners and progress bars), packaged under `<package_root>/scripts/motion-design/` and read at run time. It does not describe `animation-timeline` or any CSS method.
- Changes for coexistence (ADR-0017):
  - The source allows linear "only for spinners, progress bars". Step 3 also allows linear timing where the progress must track the scroll position one to one: motion-design does not address timing functions on a scroll timeline, and the source of the other `scroll-code` variant (gsap-scrolltrigger) requires `ease: "none"` on a horizontal-scroll tween because any other ease "breaks the 1:1 scroll-to-position mapping". The two rules contradict each other for that case; this Muro-authored method follows the one-to-one mapping there and the motion-design rule everywhere else.
  - Only the named sections of motion-design are applied in this step. The rest of that source (personality, durations, choreography, the three motion layers) belongs to `motion-principles`, the one owner of `motion-spec`; a recorded `motion-spec` and `reduced-motion` are implemented as recorded.
- Runtime dependency: none.
- Hooks: none.
- Open gap: a maintained upstream source for CSS scroll-driven animation would replace this Muro-authored method; choosing one is the owner's decision.
- Harmonized by: prompts/harmonizer.md (2026-11-10 re-harmonization) — no prerequisite, as for the GSAP variant. The earlier browser version list and easing curves were not source-grounded and are replaced by a live support check and the motion specification.
