---
id: gsap-scrolltrigger
role: scroll-code
when: stack:gsap
after: ["motion-principles"]
outputs: ["code-patch", "scroll-verified"]
checks: ["scrub_accurate", "pin_stable", "reduced_motion_disables_pin", "no_console_errors"]
---

# GSAP ScrollTrigger Implementation

Generates production-ready GSAP ScrollTrigger code that implements the `motion-spec` from the `motion-principles` step. Requires the target project to have `gsap` (v3+) installed.

## Behavior

1. **Read Motion Spec** — Consume `motion-spec` and `reduced-motion` from `.muro/map.md ## Outputs` (produced by `motion-principles` step).
2. **Generate Code** — For each entry in `motion-spec` with category `scroll-linked` or `pin`:
   - Create a `gsap.to()` or `gsap.fromTo()` with `scrollTrigger: { trigger, start, end, scrub, pin }`.
   - Map easing: `ease-out-expo` → `"expo.out"`, `ease-in-out-cubic` → `"power2.inOut"`, `spring-gentle` → `"elastic.out(1, 0.5)"`.
   - Map duration to `scrub` value (true for pixel-perfect, or numeric for smoothed).
   - For `pin: true`, add `pin: true, pinSpacing: true` on the container.
3. **Reduced Motion** — Wrap the entire ScrollTrigger setup in:
   ```js
   if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
     // ScrollTrigger code here
   }
   ```
4. **Write Patch** — Output a unified diff or file replacement for the target component (e.g., `src/Hero.tsx`).
5. **Record** — Write to `.muro/map.md ## Outputs`:
   - `code-patch`: path to modified file and diff summary
   - `scroll-verified`: checklist (scrub works, pin holds, reduced-motion disables, no console errors)

## GSAP ScrollTrigger Specifics (from gsap-scrolltrigger skill)

- **Pinning**: use `pin: true` on the container, not the animated element; set `pinSpacing: true` unless layout forbids it.
- **Scrub**: `scrub: true` for 1:1 linkage; `scrub: 0.5` for smoothed; avoid `scrub: false` with `toggleActions` unless explicitly specified.
- **Markers**: development only — never ship `markers: true`.
- **Cleanup**: `ScrollTrigger.refresh()` after DOM mutations; `ScrollTrigger.kill()` on component unmount (React: useEffect cleanup).
- **Performance**: batch multiple triggers with `ScrollTrigger.batch()`; avoid nested scroll containers.

## Specifics

- If `motion-principles` specifies CSS-only scroll animation for an element, skip GSAP for that element (handled by `css-scroll` variant).
- The target project must have `gsap@^3` in `package.json` (declared in `sources.json` as `runtime_deps`).
- Generated code uses ESM imports: `import { gsap } from "gsap"; import { ScrollTrigger } from "gsap/ScrollTrigger"; gsap.registerPlugin(ScrollTrigger);`

## Checks

- **scrub_accurate**: element progress matches scroll progress 1:1 (or smoothed ratio) within 2px.
- **pin_stable**: pinned container stays fixed during scroll range; no layout shift on pin/unpin.
- **reduced_motion_disables_pin**: under `prefers-reduced-motion: reduce`, pin/scrub code is not executed.
- **no_console_errors**: zero GSAP/ScrollTrigger warnings or errors in devtools console.

## Sources

- Source: gsap-scrolltrigger (greensock/gsap-skills@aed9cfd3) — `skills/gsap-scrolltrigger/SKILL.md`, `skills/gsap-scrolltrigger/references/**`
- Runtime dependency: gsap v3 (GSAP Standard License — target project dependency, not bundled by Muro)
- Harmonized by: prompts/harmonizer.md — extracted ScrollTrigger patterns into spec-driven code generator; removed framework-specific boilerplate