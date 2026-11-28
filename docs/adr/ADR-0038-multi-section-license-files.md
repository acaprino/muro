# ADR-0038: Multi-section LICENSE files (`license_section`)

- **Status:** Implemented (2026-11-28)
- **Context:** Some upstream repositories carry a single `LICENSE` file with multiple sections — for example, an exact MIT section covering the skill, patterns and scripts, followed by a proprietary "All rights reserved" section covering a non-redistributable subfolder — and no separate `LICENSE` file inside the MIT-licensed folder for `license_path` (ADR-0006).
- **Problem:** `_license_matches()` hashes the entire `LICENSE` file from the license marker to EOF against the approved MIT or Apache-2.0 template. It therefore rejects multi-section files even when only the MIT-licensed paths are selected and the proprietary paths are excluded.

## Decision

Add an optional `license_section` object on a source entry in `sources.json`:

```json
"license_section": {
  "start": "MIT License",
  "end": "SOFTWARE.",
  "reason": "<human/AI-reviewed reason why this section covers selected_paths>"
}
```

### Rules (fail-closed)
1. Without `license_section`, whole-file verification is unchanged.
2. When declared, `license_section` must have exact keys `{"start", "end", "reason"}`, all non-empty strings.
3. `start` must appear uniquely in `LICENSE`, and `end` must appear uniquely after `start`. Any missing or ambiguous marker fails closed.
4. The extracted slice `[start..end]` is verified with the exact same `_license_matches()` header check and SHA-256 template hash (`_MIT_BODY_SHA` or `_APACHE_SHA`). No modified or partial license text is accepted.
5. `copyright_notices()` extracts notices from the verified section so notices from other sections are not mixed into `NOTICE.md`, while `LICENSES/<id>.txt` preserves the full verbatim upstream `LICENSE` file.
6. `license_section` is included in the project cache stamp (`muro/project.py`, `_STAMPED`).
7. Python verifies the exact approved license text of the declared slice; the intake AI and owner remain responsible for verifying that `selected_paths` fall under that section and that any non-redistributable paths are excluded.
