---
id: pacing-spec
role: pacing
when: —
after: []
outputs: ["pacing-plan", "reduced-motion"]
checks: ["purpose_per_movement", "reduced_motion_stated"]
intents: [{"id": "story.pacing", "description": "Decide what moves while a reader scrolls a story and why: which sections reveal, pin or advance, how long each takes, and what a reader who asked for reduced motion gets instead.", "excludes": ["A still story does not imply movement.", "A request that already states the exact scroll behaviour needs no separate pacing step."]}]
tools: []
hooks: []
conflicts: []
reads: ["angle", "outline"]
---

# Pacing specification

Writes the scroll pacing of a story as a specification for a later build, or on its own.

## Behavior

1. **Read the story.** Use `angle` and `outline` from `recorded_outputs` when they are recorded; otherwise the material the user supplied.
2. **Give each movement a purpose.** One line per section that moves: what it shows and why it moves.
3. **Bound the time.** A reveal lasts at most 600 ms and at most three sections pin in one story (`## Limits` of `<package_root>/scripts/scroll-stories/skills/scroll-stories/SKILL.source.md`).
4. **State the reduced-motion alternative** for every movement.
5. **Record** `pacing-plan` and `reduced-motion` for the handoff below.

## Output handoff

Return every required output key as a JSON string. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`; for a direct step, run the `record --direct` line the step carries. Read earlier outputs from the step's `recorded_outputs`.

## Checks

- **purpose_per_movement**: every movement in the plan names what it shows.
- **reduced_motion_stated**: every movement has a static alternative.

## Sources

Source: scroll-stories
