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

Produces a report, never silently applies its fixes. Priority is correctness, safety, expected load, meaningful tests, performance, then unnecessary complexity.

## Behavior

1. Establish scope. For a change review use the named uncommitted/staged changes, branch, PR or files; if unnamed, use uncommitted changes, otherwise the last commit. For an audit use the named folder/package/repository, otherwise the whole repository.
2. Read before judging. A change review follows the diff into every changed function's callers and callees, tests and README; inspect all callers of changed signatures, return values or behavior. An audit maps README, build/deploy config, dependencies, entry points and tests, then traces input, storage and output, especially auth, money, data writes, background jobs and state shared between processes. In a large repository, prioritize costly failures and name unread areas.
3. Establish the expected load from project evidence and state the assumption. Check wrong results/crashes/edge cases; injection/secrets/missing trust checks/data loss; races, repeated work, unbounded state, per-item queries and unsuitable complexity; meaningful tests for risky logic; real slowdowns; dead or speculative code, duplicate responsibilities, avoidable dependencies and unrelated jobs coupled in one function.
4. Require a concrete input or situation and its consequence for every finding; re-read to verify it. Before calling code unused, search callers, tests, fixtures, configuration and dynamic/string references. A documented shortcut is a deliberate limit unless actual expected use exceeds it. Do not report taste, vague worries or arbitrary function-length rules.
5. Propose the smallest readable fix that preserves behavior and safeguards. Prefer existing project code (name its path), native/standard features or deletion when justified. Split by independent responsibility only; do not invent layers or configuration.
6. Explain what the change/repository does in two or three sentences, then numbered Must fix / Should fix / Nice to have groups, omitting empty groups. Each finding gives location, what the code does, the concrete problem, the fix and the consequence of leaving it. For an audit, default to 20 displayed findings and state the omitted count; group or append details so no material risk disappears, and provide the full findings when requested.
7. End with a supported verdict, quantified removable lines/dependencies only when measured from actual findings, and coverage/unchecked limits. If nothing was found, state that and what was checked; do not imply proof that no defect exists.

## Output handoff

Return `code_review_findings` (numbered findings and verdict) and `code_review_coverage` (scope, assumed load, evidence checked, checks run and uninspected areas) as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Work-map's per-slice acceptance review remains part of implementation; this report is a separate step only when that report is requested. Design-review retains design-system/accessibility/visual ownership; this capability owns software-behavior findings.
- Follow the user's language and report format; upstream's fixed English wording is illustrative. Apply fixes only when the user also requests implementation, through the authorized implementation step.
- Git/search/test tools are assessed case by case. The selected sources prescribe no runtime installation procedure; do not invent an upstream claim about one. There is no adopted hook or background work.

## Checks

- **target_and_load_stated**: the selected scope and expected-load assumption are explicit.
- **connected_flows_inspected**: relevant callers and end-to-end flows were read or recorded as gaps.
- **findings_have_concrete_evidence**: every finding has a reproducible situation, confirmed location, smallest fix and consequence.
- **limits_respected**: documented shortcuts, requested scope and the audit's 20-finding display default were respected without silently losing material risks or requested full findings; omissions are disclosed.
- **report_only**: source code was not changed.

## Sources

- Source: ponytail (DietrichGebert/ponytail@7801d061243d7b753bad0e0b3c057cd250b11755, release v5.3.3, MIT) — `skills/ponytail-review/SKILL.md` and `skills/ponytail-audit/SKILL.md`, especially Understand/Map first, Look for, Check before you report and Output.
- AI mapping: ponytail-review → engineering.change-review; ponytail-audit → engineering.codebase-audit. One report responsibility preserves two scopes; source names alone did not decide the merge. Outputs are separate from design-review's findings/fixes and TokenEconomizer's measured reports.
- Original lifecycle hooks, native UI modules and mode state are outside this curated selection; `hooks: []` does not claim the upstream has no hooks. Persona, slash routing, fixed English wording and plugin installation were not adopted.


Harmonized by: `prompts/harmonizer.md` (2026-11-12). Original skill files are intake-only; their methods are restated above.
