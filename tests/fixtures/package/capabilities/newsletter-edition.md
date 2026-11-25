---
id: newsletter-edition
role: newsletter
when: —
after: []
outputs: ["edition_draft", "subject_lines"]
checks: ["one_story_leads", "subject_lines_varied", "preview_checked"]
intents: [{"id": "story.newsletter-edition", "description": "Write one edition of a newsletter around a story: the lead, the supporting items, the sign-off and a few subject lines, checked as a subscriber sees it. An edition about a new story with no recorded or supplied angle has story-brief as a conditional prerequisite (see `needs`).", "excludes": ["Mentioning a newsletter as a place a story may later appear does not request an edition.", "Do not claim the preview was checked without a tool that renders it."]}]
tools: [{"name": "mail-preview", "purpose": "Render the edition as a subscriber's mail client shows it.", "required": true}]
hooks: []
conflicts: []
reads: ["audience", "angle", "voice"]
needs: [{"capability": "story-brief", "label": "only without an angle", "when": "The edition is about a new story and no audience and angle are recorded or supplied by the user. Not for a digest of stories that are already published.", "reason": "The lead of an edition is written from the reader and the angle that story-brief records; without them this step would have to stop."}]
---

# Newsletter edition

Writes one edition of a newsletter and checks it in a rendered preview.

## Behavior

1. **Read the story.** Use `audience`, `angle` and `voice` from `recorded_outputs` when they are recorded; otherwise what the user supplied.
2. **Write the lead** on one story, then at most four supporting items and the sign-off.
3. **Offer subject lines:** three, each under 60 characters, that differ in approach.
4. **Preview** the edition with the mail preview tool and fix what breaks.
5. **Record** `edition_draft` and `subject_lines` for the handoff below.

## Output handoff

Return every required output key as a JSON string. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`; for a direct step, run the `record --direct` line the step carries. Read earlier outputs from the step's `recorded_outputs`.

## Checks

- **one_story_leads**: exactly one story opens the edition.
- **subject_lines_varied**: the subject lines differ in approach, not only in wording.
- **preview_checked**: the rendered preview was looked at, or the check is not-tested with the reason.

## Sources

Source: editorial-desk
