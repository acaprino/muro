---
id: story-brief
role: story-direction
when: —
after: []
outputs: ["audience", "angle", "outline", "voice"]
checks: ["audience_named", "outline_ordered", "angle_single"]
intent_checks: {"story.brief": ["audience_named", "outline_ordered"], "story.angle": ["audience_named", "angle_single"]}
check_conditions: {"outline_ordered": "An outline is written: the request did not stop at the angle."}
intents: [{"id": "story.brief", "description": "Plan a new story before it is written: who reads it, the one angle it takes, the ordered outline of its sections and the voice it is written in.", "excludes": ["A request to check facts or to edit an existing manuscript does not ask for a new brief.", "A series of several stories is planned by the series concept, not here."]}, {"id": "story.angle", "description": "Choose only the angle of a story for a named reader, with no outline, when the user asks which way into a subject is worth taking.", "excludes": ["A full plan with sections is the story brief."]}]
tools: []
hooks: []
conflicts: ["series-concept"]
resumable: true
---

# Story brief

Fixes the reader, the angle, the outline and the voice of one story before any drafting.

## Behavior

1. **Name the reader.** One sentence on who reads the story and what they already know.
2. **Choose one angle.** Offer at most three and commit to one with the user. Open `<package_root>/scripts/editorial-desk/checklists/brief.md`, `## Angle test`, when two angles seem equally good.
3. **Order the outline** when one is asked: each section with the question it answers.
4. **Set the voice** in three adjectives and one sentence written in it.
5. **Record** `audience`, `angle`, `outline` and `voice` for the handoff below. For a request that stops at the angle, `outline` says that none was asked.

## Output handoff

Return every required output key as a JSON string. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`; for a direct step, run the `record --direct` line the step carries. Read earlier outputs from the step's `recorded_outputs`.

## Checks

- **audience_named**: the reader is one named group, not everyone.
- **outline_ordered**: every section states the question it answers, in reading order.
- **angle_single**: one angle is committed to, and the rejected ones are listed with the reason.

## Sources

Source: editorial-desk
