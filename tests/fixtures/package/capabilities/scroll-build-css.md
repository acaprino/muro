---
id: scroll-build-css
role: scroll-build
when: stack:css-only
after: []
outputs: ["scroll-patch", "scroll-verified"]
checks: ["timeline_accurate", "pin_stable_css", "unsupported_browsers_static"]
check_conditions: {"pin_stable_css": "The requested behaviour uses a sticky element. A reveal with no pinned element has no pin to test."}
intents: [{"id": "story.scroll-build", "description": "Implement the scroll-linked movement of a story in code (reveal, pin, scrub or horizontal sections), from a behaviour the user states or a recorded pacing plan.", "excludes": ["A pacing specification alone does not require code.", "An empty package manifest is not a CSS-only requirement."]}]
tools: []
hooks: []
conflicts: ["scroll-build-gsap"]
reads: ["pacing-plan", "reduced-motion"]
---

# Scroll build in CSS only

Builds the scroll movement of a story with CSS scroll timelines, with no script.

## Behavior

1. **Read the behaviour.** Build the rows of `pacing-plan` when it is recorded, otherwise the behaviour the user stated.
2. **Write the timelines** with `animation-timeline`, and a sticky wrapper where a section holds.
3. **Fallback.** Browsers without scroll timelines show the finished, still state.
4. **Reduced motion.** Remove the scroll-driven rules and apply the recorded `reduced-motion` alternative.
5. **Record** `scroll-patch` and `scroll-verified` for the handoff below.

## Output handoff

Return every required output key as a JSON string. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`; for a direct step, run the `record --direct` line the step carries. Read earlier outputs from the step's `recorded_outputs`.

## Checks

- **timeline_accurate**: the movement follows the declared scroll range.
- **pin_stable_css**: a sticky section holds its place through its range.
- **unsupported_browsers_static**: a browser without scroll timelines shows a usable still page.

## Sources

Source: scroll-stories
