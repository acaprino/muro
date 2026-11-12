---
id: engineering-review
role: engineering-reviewer
when: "—"
after: []
outputs: ["code_review_findings", "code_review_coverage"]
checks: ["target_and_load_stated", "connected_flows_inspected", "findings_have_concrete_evidence", "limits_respected", "report_only"]
intents: [{"id":"engineering.change-review","description":"Review a software change and connected code for correctness, safety, tests, load and complexity risks.","excludes":["Implementing the fixes or editing source code.","A design-only, editorial or factual review unrelated to software behavior.","Running a review just because ordinary implementation guidance applies."]},{"id":"engineering.codebase-audit","description":"Audit a repository or folder for concrete bugs, risks, missing tests, slow paths and needless complexity.","excludes":["Applying the reported fixes.","A change-only review when the user requested that smaller scope.","Collecting deliberate shortcut markers without a wider code audit."]}]
tools: [{"name":"file-access","purpose":"Read the requested code, connected callers, tests, configuration and documentation; produce the requested report without editing source.","required":true},{"name":"shell","purpose":"Inspect Git changes and search actual callers and references; run a relevant authorized check when useful without changing source code.","required":false}]
hooks: []
conflicts: []
---

# Engineering Review

Produces a report: "Lists findings, changes no code." The source's order of importance: "correct, safe, holds under load, tested, fast, lean."

## Behavior

0. **Read the original first.** Read whole, before working, the packaged original of the requested intent. It is the method in the source's own words:
   - a change review: `<package_root>/scripts/ponytail/skills/ponytail-review/SKILL.source.md`;
   - a repository or folder audit: `<package_root>/scripts/ponytail/skills/ponytail-audit/SKILL.source.md`.
   The steps below are an index into its four sections. Where this body and the original differ, the original wins, except for the changes listed under the Sources section below, "Changes for coexistence".
1. Establish scope. Change review: "Review what the user names: uncommitted or staged changes, a branch, a PR link, or files. Nothing named: the uncommitted changes, or the last commit if there are none." Audit: "Audit what the user names: a folder, a package, or the whole repo. Nothing named: the whole repo."
2. Read before judging: `## 1. Understand first` (review) or `## 1. Map first` (audit), every bullet. Both end the same way: find the expected load, "Judge scale against that, and say which load you assumed." Audit of a big repository: "go deep where a mistake costs the most, not file by file. Say which parts you did not read."
3. Look for the six classes of `## 2. Look for`, in its order and with its lists: Bug, Risk, Scale, Missing test, Speed, Lean.
4. Apply `## 3. Check before you report` to every finding: "Every finding needs a concrete case: "this input or situation leads to this wrong result". No case, no finding." "A shortcut marked with a `shortcut:` (or older `ponytail:`) comment that names its limit is a decision, not a finding, unless the expected load already crosses it." "No style taste, no "consider", no vague worries."
5. Fix proposals, same section: "Propose the smallest fix that works. Prefer fixes that delete code. Never add layers, frameworks or config the problem does not need."
6. Write the report as `## 4. Output` has it: its opening line, the three groups (Must fix, Should fix, Nice to have; "skip empty groups"), findings numbered across all groups, "Every finding has all four parts, each one or two short sentences" (What this is, Problem, Fix, If we skip it). Audit only: "At most 20 findings; if you left smaller ones out, say how many."
7. End as `## 4. Output` has it: the `Verdict:` line, the `Lean:` line "when lean findings exist", the `Not checked:` line, and its "Nothing found:" form.

## Output handoff

Return `code_review_findings` (numbered findings and verdict) and `code_review_coverage` (scope, assumed load, evidence checked, checks run and uninspected areas) as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Work-map's per-slice acceptance review remains part of implementation; this report is a separate step only when that report is requested. Design-review retains design-system/accessibility/visual ownership; this capability owns software-behavior findings.
- Apply fixes only when the user also requests implementation, through the authorized implementation step.
- Git/search/test tools are assessed case by case. The selected sources prescribe no runtime installation procedure; do not invent an upstream claim about one. There is no adopted hook or background work.

## Checks

- **target_and_load_stated**: the selected scope and expected-load assumption are explicit.
- **connected_flows_inspected**: relevant callers and end-to-end flows were read or recorded as gaps.
- **findings_have_concrete_evidence**: every finding has a concrete case, re-read and confirmed lines, the smallest fix that works and all four parts.
- **limits_respected**: documented shortcuts and the requested scope were respected; an audit shows at most 20 findings and says how many smaller ones were left out.
- **report_only**: source code was not changed.

## Sources

- Source: ponytail (DietrichGebert/ponytail@7801d061243d7b753bad0e0b3c057cd250b11755, release v5.3.3, MIT) — `skills/ponytail-review/SKILL.md` and `skills/ponytail-audit/SKILL.md`, packaged as `<package_root>/scripts/ponytail/skills/ponytail-review/SKILL.source.md` and `<package_root>/scripts/ponytail/skills/ponytail-audit/SKILL.source.md` and read whole at run time.
- AI mapping: ponytail-review → engineering.change-review; ponytail-audit → engineering.codebase-audit. One report responsibility preserves two scopes; source names alone did not decide the merge. Outputs are separate from design-review's findings/fixes and TokenEconomizer's measured reports.
- Changes for coexistence (ADR-0017):
  - The frontmatter of both files (their trigger phrases, `/ponytail-review`, `/ponytail-audit`) is not carried: the coordinator classifies by meaning.
  - "so the user can say "fix 2 and 5"": the numbering is kept, but this step fixes nothing (the source says the same: "changes no code"). A fix request is a separate implementation step (factory contract: one capability per step).
  - The report is also handed over as `code_review_findings` and `code_review_coverage` through the coordinator (factory contract: output handoff). Its wording and format stay the source's.
- Original lifecycle hooks, native UI modules and mode state are outside this curated selection; `hooks: []` does not claim the upstream has no hooks. Slash routing and plugin installation were not adopted.


Harmonized by: `prompts/harmonizer.md` (2026-11-12). Re-read against the pinned originals under ADR-0017: the body indexes the packaged original skill files, which are the method.
