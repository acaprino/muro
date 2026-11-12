---
id: engineering-debt
role: engineering-debt-reporter
when: "—"
after: []
outputs: ["shortcut_ledger"]
checks: ["ignore_rules_respected", "real_deferrals_only", "ceilings_and_triggers_preserved", "missing_triggers_flagged", "persistence_requested"]
intents: [{"id":"engineering.shortcut-ledger","description":"List deliberate shortcut comments, limits and revisit triggers; accept custom markers and optional author evidence.","excludes":["A general software audit or review of a change.","Applying refactors or fixing the deferred work.","Inventing debt where no relevant comment or source evidence exists."]}]
tools: [{"name":"file-access","purpose":"Read actual source comments and, only if requested, write the resulting ledger to a user-chosen file.","required":true},{"name":"shell","purpose":"Search tracked and untracked nonignored source comments and optionally inspect Git blame for a requested owner.","required":false}]
hooks: []
conflicts: []
---

# Engineering Shortcut Ledger

Turns recorded deliberate limits into a requested report; it does not create a new background tracker.

## Behavior

1. Use the repository or area the user names. Search real comment markers `shortcut:` and legacy `ponytail:`; if the user names a custom marker, use that marker instead. Respect `.gitignore` files and skip `.git`, dependencies, build outputs and caches.
2. The source suggests `git grep --no-index --exclude-standard -nE '(#|//|/[*]) ?(shortcut|ponytail):'`; adjust comment syntax for the actual language. A text match is evidence to read, not proof of a deliberate deferral: skip prose and unrelated keyboard-shortcut comments.
3. Produce one row per actual marker, grouped by file: file and line, what was simplified, the limit stated and the condition or upgrade path stated for revisiting it. Preserve the source meaning; do not invent a missing owner, ceiling or trigger.
4. Tag a comment with no upgrade trigger `no-trigger`. If the user wants ownership and Git history exists, inspect the specific line with blame and distinguish its author from any explicitly assigned owner.
5. End with the counted marker total and the number without a trigger. If none were found, state that within the scanned scope. Read/report only by default; persist a file only when the user requested it, reporting its path.

## Output handoff

Return `shortcut_ledger` as a JSON string containing the ledger, counts, scan coverage and any requested file path. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- This is not session-handoff's current task narrative, a duplicated task map or TokenEconomizer's cost ledger. Another capability may consume it only when the user requests that next action.
- Git is useful for ignore-aware search/blame, not a new fixed stack constraint. The source supplies no Git installation procedure. If history is unavailable, omit ownership inference and disclose the limit.

## Checks

- **ignore_rules_respected**: the scan excludes ignored/generated/cache paths and states any coverage limit.
- **real_deferrals_only**: rows correspond to actual deliberate-deferral comments.
- **ceilings_and_triggers_preserved**: each row faithfully records the comment's limit and revisit condition, including explicit missing values.
- **missing_triggers_flagged**: no-trigger tags and totals match the reported rows.
- **persistence_requested**: no ledger file was written unless persistence was requested.

## Sources

- Source: ponytail (DietrichGebert/ponytail@7801d061243d7b753bad0e0b3c057cd250b11755, release v5.3.3, MIT) — `skills/ponytail-debt/SKILL.md`, Scan, Output and Boundaries.
- AI mapping: ponytail-debt → engineering.shortcut-ledger. The marker search locates evidence; the host AI determines whether a hit records a deferral. This is not a routing keyword rule.
- Original slash commands, persistent mode flags and upstream plugin UI/telemetry are not adopted. No source hook is selected for this method.


Harmonized by: `prompts/harmonizer.md` (2026-11-12). Original skill files are intake-only; their methods are restated above.
