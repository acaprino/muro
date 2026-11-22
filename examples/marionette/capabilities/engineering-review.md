---
id: engineering-review
role: engineering-reviewer
when: "—"
after: []
outputs: ["code_review_findings", "code_review_coverage"]
checks: ["target_and_load_stated", "connected_flows_inspected", "findings_have_concrete_evidence", "limits_respected", "report_only"]
intent_checks: {"engineering.change-review": ["target_and_load_stated", "connected_flows_inspected", "findings_have_concrete_evidence", "limits_respected", "report_only"], "engineering.codebase-audit": ["target_and_load_stated", "connected_flows_inspected", "findings_have_concrete_evidence", "limits_respected", "report_only"]}
intents: [{"id":"engineering.change-review","description":"Review a software change and connected code for correctness, safety, tests, load and complexity risks.","excludes":["Implementing the fixes or editing source code.","A design-only, editorial or factual review unrelated to software behavior.","Running a review just because ordinary implementation guidance applies."]},{"id":"engineering.codebase-audit","description":"Audit a repository or folder for concrete bugs, risks, missing tests, slow paths and needless complexity.","excludes":["Applying the reported fixes.","A change-only review when the user requested that smaller scope.","Collecting deliberate shortcut markers without a wider code audit."]}]
tools: [{"name":"file-access","purpose":"Read the requested code, connected callers, tests, configuration and documentation; produce the requested report without editing source.","required":true},{"name":"shell","purpose":"Inspect Git changes and search actual callers and references; run a relevant authorized check when useful without changing source code.","required":false}]
hooks: []
conflicts: []
---

# Engineering Review

Produces a report the user asked for, given in full, and changes no code. Order of importance: correct, safe, holds under load, tested, fast, lean.

The packaged original of the requested intent is the full version and wins where this body differs, except for the changes listed in the Sources section: `<package_root>/scripts/ponytail/skills/ponytail-review/SKILL.source.md` for a change review, `<package_root>/scripts/ponytail/skills/ponytail-audit/SKILL.source.md` for a repository or folder audit. Open the section a step names when you reach it.

## Behavior

1. **Scope.** Change review: what the user names (uncommitted or staged changes, a branch, a PR link, files); nothing named: the uncommitted changes, or the last commit if there are none. Audit: the folder, package or whole repo the user names; nothing named: the whole repo.
2. **Read before judging.**
   - Review: the diff, then the code it touches: callers of every changed function, the functions it calls, the tests, the README. Trace the real flow (where data comes in, what is stored, what goes out). When a signature, return value or behavior changes, grep every caller.
   - Audit: the README, deploy and build config, dependency list, entry points and tests. Trace the main flows end to end and read those paths fully: user input, money, auth, data writes, background jobs, anything shared between processes. In a big repo go deep where a mistake costs the most, not file by file, and say which parts you did not read.
   - Both: find the expected load (one person running a script, or many users and processes at once), judge scale against it and say which load you assumed.
3. **Look for** six classes, in this order: Bug, Risk, Scale, Missing test, Speed, Lean. Open `## 2. Look for` of the intent's file for what each covers; the lists differ between review and audit. Missing test means one good test that fails when risky logic breaks, not coverage. Big slowdowns are problems, small speed wins are suggestions. Lean is delete, reuse, stdlib / native, yagni, merge, split; split by job, never by line count and never into helpers that only make a function shorter.
4. **Check before you report.** Every finding needs a concrete case (this input or situation leads to this wrong result): no case, no finding. Review: re-read the lines and confirm the caller exists, the value can really be empty, the code really is unused. Audit: before calling code unused, grep the whole tree, including tests, fixtures, config and string or dynamic references. A shortcut marked with a `shortcut:` (or older `ponytail:`) comment that names its limit is a decision, not a finding, unless the expected load already crosses it. No style taste, no "consider", no vague worries.
5. **Fixes.** Propose the smallest fix that works and prefer fixes that delete code. Never add layers, frameworks or config the problem does not need.
6. **Write the report** in very simple English: short sentences, everyday words, a technical term explained at first use; the reader may never have seen this code.
   - Start with `What this change does:` in two or three sentences; an audit starts with `What this repo does:` and adds the load assumed.
   - Three groups, empty ones skipped (audit: most important first). **Must fix:** bug, security, data loss, breaks at the expected load. **Should fix:** risky code without a test, real slowness, duplication, a function that mixes jobs, code that should not exist. **Nice to have:** small speed-ups, shorter forms.
   - Number findings across all groups. Each has a bold title with its location (`path/file.py:L40-52`) and all four parts, one or two short sentences each: **What this is:**, **Problem:**, **Fix:**, **If we skip it:**. The worked example is in `## 4. Output` of either file.
   - Audit only: at most 20 findings; if smaller ones were left out, say how many.
7. **End.**
   - Review: `Verdict: Ship.` or `Verdict: fix 1 and 3 first.`; `Lean: -<N> lines possible.` when lean findings exist; `Not checked:` one line, if something mattered and you could not check it. Nothing found: `What this change does:`, then `Looks good. Ship.` and one line on what you checked.
   - Audit: `Verdict:` one line, healthy or what to fix first; `Lean: -<N> lines, -<M> dependencies possible.` when lean findings exist; `Not checked:` the parts you did not read or could not run. Nothing found: `What this repo does:`, then `Healthy. Nothing to fix.` and one line on what you checked.

## Output handoff

Return `code_review_findings` (numbered findings and verdict) and `code_review_coverage` (scope, assumed load, evidence checked, checks run and uninspected areas) as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Work-map's per-slice acceptance review remains part of implementation; this report is a separate step only when it is requested. Design-review keeps design-system, accessibility and visual ownership; this capability owns software-behavior findings.
- Apply fixes only when the user also requests implementation, through the authorized implementation step.
- Git, search and test tools are assessed case by case; the source prescribes no installation procedure. There is no adopted hook or background work.

## Checks

- **target_and_load_stated**: the selected scope and expected-load assumption are explicit.
- **connected_flows_inspected**: relevant callers and end-to-end flows were read or recorded as gaps.
- **findings_have_concrete_evidence**: every finding has a concrete case, re-read and confirmed lines, the smallest fix that works and all four parts.
- **limits_respected**: documented shortcuts and the requested scope were respected; an audit shows at most 20 findings and says how many smaller ones were left out.
- **report_only**: source code was not changed.

## Sources

- Source: ponytail (DietrichGebert/ponytail@7801d061243d7b753bad0e0b3c057cd250b11755, release v5.3.3, MIT) — `skills/ponytail-review/SKILL.md` and `skills/ponytail-audit/SKILL.md`, packaged as `<package_root>/scripts/ponytail/skills/ponytail-review/SKILL.source.md` and `<package_root>/scripts/ponytail/skills/ponytail-audit/SKILL.source.md`.
- AI mapping: ponytail-review → engineering.change-review; ponytail-audit → engineering.codebase-audit. One report responsibility preserves two scopes; source names alone did not decide the merge. Outputs are separate from design-review's findings/fixes and TokenEconomizer's measured reports.
- Changes for coexistence (ADR-0017):
  - The trigger phrases, `/ponytail-review` and `/ponytail-audit` are not carried: the coordinator classifies by meaning.
  - The numbering "so the user can say "fix 2 and 5"" is kept, but a fix request is a separate implementation step (one capability per step).
  - The report is also handed over as `code_review_findings` and `code_review_coverage` through the coordinator (output handoff); its wording and format stay the source's.
- Original lifecycle hooks, native UI modules and mode state are outside this curated selection; `hooks: []` does not claim the upstream has no hooks. Slash routing and plugin installation were not adopted.

Harmonized by: `prompts/harmonizer.md` (2026-11-12). Compared with the pinned originals under ADR-0017; second pass the same day: an entry prompt in the package's words with pointers to the packaged originals.
