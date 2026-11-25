---
id: manuscript-files
role: manuscript-operations
when: —
after: []
outputs: ["file_reading", "file_result"]
checks: ["structure_read_before_edit", "edit_verified", "original_preserved", "conversion_loss_reported"]
intent_checks: {"files.editing": ["structure_read_before_edit", "edit_verified", "original_preserved"], "files.conversion": ["original_preserved", "conversion_loss_reported"], "files.extraction": ["original_preserved", "conversion_loss_reported"]}
check_conditions: {"structure_read_before_edit": "The step changes the content of the file. A change of its name or place alone reads no structure.", "conversion_loss_reported": "The target format cannot hold everything the source file holds."}
intents: [{"id": "files.editing", "description": "Apply changes to a manuscript file that already exists: text, headings, notes or tracked changes.", "excludes": ["Writing a whole new manuscript is not editing.", "A file supplied only as reference material must not be modified."]}, {"id": "files.conversion", "description": "Turn an existing manuscript file into another format without changing its content.", "excludes": ["Content changes are an edit made before the conversion."]}, {"id": "files.extraction", "description": "Read the structure or the text of an existing manuscript file, to use it as source material, without changing it.", "excludes": ["Summarising text that is already in the conversation needs no file to be read."]}]
tools: []
hooks: []
conflicts: []
---

# Manuscript files

Reads, edits or converts an existing manuscript file, one operation per step.

## Behavior

1. **Read the file's structure** before any change to its content.
2. **Do the one operation** the step was selected for: an edit, a conversion or an extraction. A request for two operations has two steps.
3. **Keep the original:** write the result beside it unless the user asked to change it in place.
4. **Say what a conversion lost**, when the target format cannot hold it.
5. **Record** `file_reading` (what was read) and `file_result` (the path written, or the extracted text) for the handoff below.

## Output handoff

Return every required output key as a JSON string. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`; for a direct step, run the `record --direct` line the step carries. Read earlier outputs from the step's `recorded_outputs`.

## Checks

- **structure_read_before_edit**: the structure was read before the first change.
- **edit_verified**: the file was opened again after the edit and holds the change.
- **original_preserved**: the original file is unchanged, or the user asked for the change in place.
- **conversion_loss_reported**: what the target format could not hold is listed.

## Sources

Source: editorial-desk
