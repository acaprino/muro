---
id: series-concept
role: series-direction
when: —
after: []
outputs: ["series_concept", "series_sample"]
checks: ["episodes_distinct", "sample_reviewed_with_user"]
intents: [{"id": "story.series-concept", "description": "Plan a series of several stories under one recurring frame: its premise, the episodes and what each one adds, with one sample opening to review.", "excludes": ["One standalone story is planned by the story brief.", "Scheduling the publication dates is not planning the series."]}]
tools: []
hooks: []
conflicts: ["story-brief"]
---

# Series concept

Plans a series as one premise and a list of episodes, and tries the frame on one opening.

## Behavior

1. **State the premise** of the series in two sentences.
2. **List the episodes.** Each with the one thing it adds; drop an episode that repeats another.
3. **Write one sample opening** and review it with the user before the list is fixed.
4. **Record** `series_concept` and `series_sample` for the handoff below.

## Output handoff

Return every required output key as a JSON string. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`; for a direct step, run the `record --direct` line the step carries. Read earlier outputs from the step's `recorded_outputs`.

## Checks

- **episodes_distinct**: no two episodes answer the same question.
- **sample_reviewed_with_user**: the user saw the sample opening and accepted or changed the frame.

## Sources

Source: editorial-desk
