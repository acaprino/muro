---
id: scroll-build-gsap
role: scroll-build
when: stack:gsap
after: []
outputs: ["scroll-patch", "scroll-verified"]
checks: ["triggers_top_level", "pin_stable", "reduced_motion_disables_pin"]
intents: [{"id": "story.scroll-build", "description": "Implement the scroll-linked movement of a story in code (reveal, pin, scrub or horizontal sections), from a behaviour the user states or a recorded pacing plan.", "excludes": ["A pacing specification alone does not require code.", "The presence of GSAP in a project is not by itself a request for movement."]}]
tools: []
hooks: []
conflicts: ["scroll-build-css"]
reads: ["pacing-plan", "reduced-motion"]
---

# Scroll build with GSAP

Builds the scroll movement of a story with GSAP ScrollTrigger in a project that uses GSAP.

## Behavior

1. **Read the behaviour.** Build the rows of `pacing-plan` when it is recorded, otherwise the behaviour the user stated.
2. **Create the triggers** at the top level of the timeline, one per section that moves.
3. **Clean up** every trigger when its section leaves the page.
4. **Reduced motion.** Apply the recorded `reduced-motion` alternative and create no pin.
5. **Record** `scroll-patch` (the files changed) and `scroll-verified` (what was checked, or not-tested with the reason) for the handoff below.

## Output handoff

Return every required output key as a JSON string. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`; for a direct step, run the `record --direct` line the step carries. Read earlier outputs from the step's `recorded_outputs`.

## Checks

- **triggers_top_level**: no trigger is created inside another timeline's callback.
- **pin_stable**: a pinned section holds its place through its range with no layout jump.
- **reduced_motion_disables_pin**: with reduced motion on, nothing pins.

## Sources

Source: scroll-stories
