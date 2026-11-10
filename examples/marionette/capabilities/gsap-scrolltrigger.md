---
id: gsap-scrolltrigger
role: scroll-code
tools: [{"name":"file-access","purpose":"Inspect and patch the target components and dependencies.","required":true},{"name":"browser","purpose":"Verify scrub, pin, reduced motion and console output in the target UI.","required":true}]
hooks: []
conflicts: ["css-scroll"]
reads: ["motion-spec", "reduced-motion"]
when: stack:gsap
intents: [{"id":"ui.scroll-animation","description":"Implement scroll-linked animation, scrub, pinning, parallax or horizontal scroll sections in code, from a behavior the user states or a recorded motion specification.","excludes":["Motion-only specifications and ordinary hover transitions do not require scroll code.","The presence of GSAP alone is not a request for animation.","Animation inside an interactive explainer is part of its own canvas figures, which use no libraries."]}]
after: []
outputs: ["code-patch", "scroll-verified"]
checks: ["top_level_triggers_only", "scrub_or_toggle_not_both", "pin_stable", "refresh_and_cleanup", "reduced_motion_disables_pin", "no_console_errors"]
---

# GSAP ScrollTrigger Implementation

Implements scroll-driven animation with GSAP ScrollTrigger in a project that uses GSAP 3. It builds the behavior the user stated, or the scroll rows of a recorded `motion-spec`.

## Behavior

1. **Read the behavior.** If `.muro/map.md ## Outputs` holds `motion-spec` and `reduced-motion`, implement their scroll-linked rows with their durations and eases. Otherwise implement the behavior the user stated (what is pinned, what is scrubbed, over which range). Do not invent a choreography the user did not ask for.
2. **Register once.** `gsap.registerPlugin(ScrollTrigger)` before any ScrollTrigger use.
3. **Build the triggers.**
   - Put `scrollTrigger` on a timeline or a top-level tween only, never on a child tween inside a timeline and never nested in a parent timeline.
   - Choose `scrub` (`true` = direct, a number = seconds the playhead takes to catch up) for scroll-linked progress, or `toggleActions` for discrete play/reverse; never both on one trigger.
   - `pin: true` pins the trigger: animate its children, not the pinned element. `pinSpacing` is `true` by default; set `false` only when the layout is handled separately. A pinned trigger starts at `"top top"` by default.
   - Fake horizontal scroll: pin the panel, move an inner wrapper on `x`/`xPercent` with `ease: "none"`, and point nested triggers at it with `containerAnimation`. Pinning and snapping are not available on those nested triggers.
   - A scrollable container other than the viewport goes in `scroller`.
   - Use `ScrollTrigger.batch()` only for callback-driven reveals of many similar elements; it takes no `scrub`, `snap` or `toggleActions`.
4. **Order and refresh.** Create triggers top to bottom in page order, or set `refreshPriority` when they are created out of order. Call `ScrollTrigger.refresh()` after DOM or layout changes that move triggers (new content, images, fonts); viewport resize is handled automatically.
5. **Clean up.** Kill the instances when their elements go away: `ScrollTrigger.getById(id)?.kill()` or each instance from `ScrollTrigger.getAll()`. In React use `useGSAP()` when the project already has `@gsap/react`; otherwise revert a `gsap.context()` in the `useEffect`/`useLayoutEffect` cleanup.
6. **Reduced motion.** Create the pin and scrub triggers only when `window.matchMedia("(prefers-reduced-motion: reduce)")` does not match, and apply the recorded `reduced-motion` alternative (static positions, opacity only).
7. **Verify** in a browser: scroll the range, check pins, toggle reduced motion and read the console. Remove `markers: true` before handing over.
8. **Record** for the handoff below:
   - `code-patch`: the files changed and a short diff summary.
   - `scroll-verified`: what was checked in the browser and the result, or not-tested with the reason.

## Output handoff

Return every required output key as a JSON string. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from `.muro/map.md` only. Do not edit `.muro/map.md` or `.muro/state.json`; the coordinator is their only writer.

## Specifics

- **GSAP in the project.** This variant runs with `stack:gsap`: the project already uses GSAP, or GSAP is adopted for this task because the request names no other library and nothing rules a JavaScript library out. If `gsap` is missing, install it before step 2 (`npm install gsap`, or the same add command of the package manager whose lockfile the project has): say in one line what is installed, from npm into the project's dependencies, then check `node_modules/gsap/package.json` reports 3.x. Add `@gsap/react` only in a React project that adopts `useGSAP()`. Never install it against a CSS-only constraint; a failed install stops only this step.
- Elements that the motion specification assigns to CSS-only animation are left to the `css-scroll` variant in another plan; both variants are never selected together.
- Use the project's existing module style for imports; the source shows only the registration call.
- Eases come from the motion specification; scrubbed tweens follow the scroll, and a `containerAnimation` tween must use `ease: "none"`.

## Checks

- **top_level_triggers_only**: no `scrollTrigger` sits on a child tween of a timeline or inside a parent timeline.
- **scrub_or_toggle_not_both**: each trigger uses either `scrub` or `toggleActions`.
- **pin_stable**: pinned sections hold through their range with no layout jump on pin or unpin; pinned elements themselves are not animated.
- **refresh_and_cleanup**: triggers are created in page order or carry `refreshPriority`; `refresh()` follows layout changes; instances are killed or reverted on unmount.
- **reduced_motion_disables_pin**: under `prefers-reduced-motion: reduce`, no pin or scrub trigger is created.
- **no_console_errors**: no GSAP or ScrollTrigger warning or error in the console, and no `markers: true` left in the code.

## Sources

- AI intent mapping: gsap-scrolltrigger → ui.scroll-animation, from its "When to Use This Skill", key config options, batch, horizontal scroll, refresh and cleanup, best practices and "Do Not" sections.
- Source: gsap-scrolltrigger (greensock/gsap-skills@aed9cfd3) — `skills/gsap-scrolltrigger/SKILL.md`, the only selected file, packaged under `<package_root>/scripts/gsap-scrolltrigger/`.
- Runtime dependencies: gsap 3, required (GSAP Standard License — target project dependency, not bundled by Muro), and `@gsap/react`, optional for `useGSAP()`. The source gives no install command; `npm install gsap` and `npm install @gsap/react` come from GSAP's official installation and React pages.
- Adopted with the 2026-11-10 owner decision: the source's advice to use GSAP and ScrollTrigger when the user asks for scroll animation without naming a library. The related gsap-core, gsap-timeline, gsap-react and gsap-plugins skills are not selected.
- Reduced motion: the source does not mention it. The matchMedia guard comes from this source's intake goal ("respecting reduced motion") and the motion-design reduced-motion rules; it is a Muro implementation choice.
- Hooks: the selected SKILL.md defines none; `scripts/**`, `assets/**` and `examples/**` are excluded and were not inspected for hooks.
- Owner decision 2026-11-10 ("se serve, va installato!"): when the task needs GSAP and the project lacks it, this step installs it (ADR-0007).
- Harmonized by: prompts/harmonizer.md (2026-11-10 re-harmonization) — no prerequisite: the source works from a direct implementation request (`SKILL.md` "When to Use This Skill"). The earlier easing map, static `ScrollTrigger.kill()`, "avoid nested scroll containers", 2px threshold and `references/**` citation were not in the selected source and are removed.
