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

0. **Read the original first.** Read `<package_root>/scripts/ponytail/skills/ponytail-debt/SKILL.source.md` whole before working. It is the method in the source's own words, and the steps below are an index into its `## Scan`, `## Output` and `## Boundaries`. Where this body and the original differ, the original wins, except for the changes listed under `## Sources`, "Changes for coexistence".
1. `## Scan`: "Grep the repo for comment markers, skipping `.git` and everything the `.gitignore` files ignore (dependencies, build output, caches, in any stack)". Markers are `shortcut:` and the older `ponytail:`. If the user names their own marker word, "grep for that word instead."
2. The source's command: `git grep --no-index --exclude-standard -nE '(#|//|/[*]) ?(shortcut|ponytail):'` "(add other comment prefixes if your stack uses them)". "Each hit is one ledger row." "Skip hits that are not a deferral, like a note about a keyboard shortcut."
3. `## Output`: "One row per marker, grouped by file", in the source's form: `<file>:<line>, <what was simplified>. ceiling: <the limit named>. upgrade: <the trigger to revisit>.` "pull the ceiling and the trigger straight from the comment."
4. "any marker comment that names no upgrade path or trigger gets a `no-trigger` tag". "Want an owner per row too? add `git blame -L<line>,<line>`."
5. "End with `<N> markers, <M> with no trigger.` Nothing found: `No shortcut debt. Clean ledger.`" `## Boundaries`: "Reads and reports only, changes nothing. To persist it, ask and it writes the ledger to a file (e.g. `PONYTAIL-DEBT.md`)." Report the path of a file written.

## Output handoff

Return `shortcut_ledger` as a JSON string containing the ledger, counts, scan coverage and any requested file path. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- This is not session-handoff's current task narrative, a duplicated task map or TokenEconomizer's cost ledger. Another capability may consume it only when the user requests that next action.
- Git is useful for ignore-aware search/blame, not a new fixed stack constraint. The source supplies no Git installation procedure. If history is unavailable, leave the owner out and disclose the limit.

## Checks

- **ignore_rules_respected**: the scan excludes ignored/generated/cache paths and states any coverage limit.
- **real_deferrals_only**: rows correspond to actual deliberate-deferral comments.
- **ceilings_and_triggers_preserved**: each row faithfully records the comment's limit and revisit condition, including explicit missing values.
- **missing_triggers_flagged**: no-trigger tags and totals match the reported rows.
- **persistence_requested**: no ledger file was written unless persistence was requested.

## Sources

- Source: ponytail (DietrichGebert/ponytail@7801d061243d7b753bad0e0b3c057cd250b11755, release v5.3.3, MIT) — `skills/ponytail-debt/SKILL.md`, Scan, Output and Boundaries, packaged as `<package_root>/scripts/ponytail/skills/ponytail-debt/SKILL.source.md` and read whole at run time.
- AI mapping: ponytail-debt → engineering.shortcut-ledger. The marker search locates evidence; the host AI determines whether a hit records a deferral. This is not a routing keyword rule.
- Changes for coexistence (ADR-0017):
  - The frontmatter's trigger phrases and `/ponytail-debt` are not carried, and the marker word is taken from the user's request instead of the slash argument in "`/ponytail-debt TODO`": the coordinator classifies by meaning and the package registers no source command.
  - The ledger is also handed over as `shortcut_ledger` through the coordinator (factory contract: output handoff). Its rows and closing line stay the source's.
- Original persistent mode flags and upstream plugin UI/telemetry are not adopted. No source hook is selected for this method.


Harmonized by: `prompts/harmonizer.md` (2026-11-12). Re-read against the pinned original under ADR-0017: the body indexes the packaged original skill file, which is the method.
