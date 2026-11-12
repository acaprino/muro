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

Collects the deliberate shortcut comments of a repository into one requested ledger, so a deferral cannot quietly become permanent. It reads and reports only, and creates no background tracker.

The packaged original, `<package_root>/scripts/ponytail/skills/ponytail-debt/SKILL.source.md`, is the full version and wins where this body differs, except for the changes listed in the Sources section. It is short; open it when a case below is unclear.

## Behavior

1. **Scan** the repo for comment markers, skipping `.git` and everything the `.gitignore` files ignore (dependencies, build output, caches, in any stack). The markers are `shortcut:` and the older `ponytail:`:
   `git grep --no-index --exclude-standard -nE '(#|//|/[*]) ?(shortcut|ponytail):'`
   Add other comment prefixes if the stack uses them. If the user names their own marker word, grep for that word instead.
2. Each hit is one ledger row. The comment prefix keeps prose that only mentions the convention out; also skip hits that are not a deferral, like a note about a keyboard shortcut.
3. **Output** one row per marker, grouped by file:
   `<file>:<line>, <what was simplified>. ceiling: <the limit named>. upgrade: <the trigger to revisit>.`
   The convention is `shortcut: <ceiling>, <upgrade path>`, so take the ceiling and the trigger straight from the comment.
4. A marker comment that names no upgrade path or trigger gets a `no-trigger` tag: those are the ones that silently rot. When the user wants an owner per row, add `git blame -L<line>,<line>`.
5. End with `<N> markers, <M> with no trigger.` Nothing found: `No shortcut debt. Clean ledger.`
6. Change nothing. Write the ledger to a file (e.g. `PONYTAIL-DEBT.md`) only when the user asks to persist it, and report the path.

## Output handoff

Return `shortcut_ledger` as a JSON string containing the ledger, counts, scan coverage and any requested file path. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- This is not session-handoff's current task narrative, a duplicated task map or TokenEconomizer's cost ledger. Another capability may consume it only when the user requests that next action.
- Git is useful for ignore-aware search and blame, not a fixed stack constraint; the source gives no Git installation procedure. If history is unavailable, leave the owner out and say so.

## Checks

- **ignore_rules_respected**: the scan excludes ignored/generated/cache paths and states any coverage limit.
- **real_deferrals_only**: rows correspond to actual deliberate-deferral comments.
- **ceilings_and_triggers_preserved**: each row faithfully records the comment's limit and revisit condition, including explicit missing values.
- **missing_triggers_flagged**: no-trigger tags and totals match the reported rows.
- **persistence_requested**: no ledger file was written unless persistence was requested.

## Sources

- Source: ponytail (DietrichGebert/ponytail@7801d061243d7b753bad0e0b3c057cd250b11755, release v5.3.3, MIT) — `skills/ponytail-debt/SKILL.md`, Scan, Output and Boundaries, packaged as `<package_root>/scripts/ponytail/skills/ponytail-debt/SKILL.source.md`.
- AI mapping: ponytail-debt → engineering.shortcut-ledger. The marker search locates evidence; the host AI determines whether a hit records a deferral. This is not a routing keyword rule.
- Changes for coexistence (ADR-0017):
  - The trigger phrases and `/ponytail-debt` are not carried, and the marker word comes from the user's request instead of the slash argument (`/ponytail-debt TODO`): the coordinator classifies by meaning and the package registers no source command.
  - The ledger is also handed over as `shortcut_ledger` through the coordinator (output handoff); its rows and closing line stay the source's.
- Original persistent mode flags and upstream plugin UI/telemetry are not adopted. No source hook is selected for this method.

Harmonized by: `prompts/harmonizer.md` (2026-11-12). Compared with the pinned original under ADR-0017; second pass the same day: an entry prompt in the package's words with a pointer to the packaged original.
