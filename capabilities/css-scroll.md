---
id: css-scroll
role: scroll-code
tools: [{"name":"file-access","purpose":"Inspect and patch the target CSS/components.","required":true},{"name":"browser","purpose":"Verify browser support, timelines, sticky behavior and reduced motion.","required":true}]
hooks: []
conflicts: ["gsap-scrolltrigger"]
when: stack:css-only
intents: [{"id":"ui.scroll-animation","description":"Implement scroll-linked animation, scrub or pin behavior from a motion specification.","excludes":["Motion-only specifications and ordinary hover transitions do not require scroll code.","An empty package manifest is not a CSS-only requirement."]}]
after: ["motion-principles"]
outputs: ["code-patch", "scroll-verified"]
checks: ["scroll_timeline_accurate", "pin_stable_css", "reduced_motion_disables_animation", "no_js_required"]
---

# CSS Scroll Animation (No-JS Variant)

Generates pure-CSS scroll-driven animations using `animation-timeline: scroll()` and `@keyframes`. For projects that forbid external JS animation libraries or prefer zero-JS solutions.

## Behavior

1. **Read Motion Spec** — Consume `motion-spec` and `reduced-motion` from `.muro/map.md ## Outputs` (produced by `motion-principles` step).
2. **Generate CSS** — For each entry in `motion-spec` with category `scroll-linked` or `pin`:
   - Create a `@keyframes` rule mapping the animation progress (0% → 100%).
   - Apply `animation: <name> auto linear` on the target element.
   - Set `animation-timeline: scroll(<container>)` for container-relative scroll or `animation-timeline: view()` for viewport-relative.
   - For pin-like behavior: use `position: sticky` + `animation-timeline` on a wrapper, or CSS `position: fixed` with scroll-driven transform.
3. **Reduced Motion** — Wrap the entire animation block in:
   ```css
   @media (prefers-reduced-motion: reduce) {
     .animated-element { animation: none !important; }
   }
   ```
4. **Write Patch** — Output a unified diff or file replacement for the target CSS/component file (e.g., `src/Hero.css`).
5. **Record** — Prepare these output keys for the handoff below:
   - `code-patch`: path to modified CSS file and diff summary
   - `scroll-verified`: checklist (timeline matches scroll, sticky holds, reduced-motion disables, no JS required)

## Output handoff

Return every required output key as a JSON string. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from `.muro/map.md` only. Do not edit `.muro/map.md` or `.muro/state.json`; the coordinator is their only writer.

## CSS Scroll-Driven Animation Specifics

- **Browser support**: Requires Chromium 115+, Firefox 113+, Safari 16.4+ (check `caniuse.com` for `animation-timeline`).
- **Scroll container**: Use `scroll(root)` for viewport, `scroll(nearest)` for nearest scrollable ancestor, or named `scroll(<id>)`.
- **Progress range**: `animation-range: entry 0% exit 100%` for full viewport; `entry 0% entry 100%` for element entering viewport.
- **Pin emulation**: True pin requires JS; CSS approximation uses `position: sticky` with calculated heights or `transform: translateY()` driven by scroll timeline.
- **Easing**: Map `ease-out-expo` → `cubic-bezier(0.19, 1, 0.22, 1)`, `ease-in-out-cubic` → `cubic-bezier(0.65, 0.05, 0.36, 1)`.

## Specifics

- The host AI selects this variant only when CSS-only implementation fits the request and project constraints; Python never substitutes another variant.
- This variant requires explicit `stack:css-only` context, even when a project happens to have GSAP installed.
- Generated code is pure CSS — no runtime dependencies, no bundle size impact.

## Checks

- **scroll_timeline_accurate**: element animation progress matches scroll progress within 2% (measured via devtools).
- **pin_stable_css**: sticky/fixed elements remain visually pinned during scroll range; no layout shift.
- **reduced_motion_disables_animation**: under `prefers-reduced-motion: reduce`, all scroll-driven animations are disabled.
- **no_js_required**: zero JavaScript imports or execution for the animated elements.

## Sources

- Source: motion-design principles (lottiefiles/motion-design-skill@f9a8a041) — adapted for CSS-only implementation
- Harmonized by: prompts/harmonizer.md — extracted CSS ScrollTimeline patterns as a zero-JS variant of scroll-code role
