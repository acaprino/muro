---
id: change-review
role: change-reviewer
when: —
after: []
outputs: ["review_report"]
checks: ["scope_traced", "findings_grounded", "no_code_changed"]
intents: [{"id":"code.change-review","description":"Review a proposed or existing software change and its connected code for correctness, safety, expected load, risky untested logic, performance and unnecessary complexity, producing an evidence-based report.","excludes":["Implementing the requested fixes or silently editing code.","Applying the working policy does not require a review report.","A general writing, design or document review unrelated to software changes."]}]
tools: [{"name":"file-access","purpose":"Read the requested change, connected callers, tests and project documentation without changing code.","required":true},{"name":"shell","purpose":"Inspect Git diffs and search callers; run an authorized relevant check when useful, without changing source.","required":false}]
hooks: []
conflicts: []
---

# Review a software change

## Behavior

1. Establish the user's target: named diff, files, branch or pull request; without one, use uncommitted changes, or the last commit if clean. Read the diff, connected callers and callees, tests and relevant documentation. Trace data entering, stored and leaving. State the expected load from project evidence and any assumption.
2. Assess in this order: correctness, security and data-loss risk, behavior at the expected load, meaningful missing tests, material performance, then unnecessary complexity. Check edge cases and every caller affected by changed signatures or behavior. Do not broaden the requested task into an unrelated repository audit.
3. Each finding needs a concrete input or situation and a reachable consequence. Re-read the implicated lines and confirm the caller and conditions exist. A documented shortcut is not itself a defect unless real use exceeds its limit. Exclude taste, speculation and invented risks.
4. Recommend the smallest complete fix. Prefer existing project components, standard features and removal of unnecessary code while retaining security, validation and error handling. Separate responsibilities only when their jobs differ, never to meet line counts.
5. Report in the user's language. Start with what the change does, then numbered must-fix, should-fix and optional findings, omitting empty groups. Each finding identifies a location, what the code does, the concrete problem, proposed fix and consequence if deferred. End with the release verdict and material unchecked work. If nothing is found, say what was checked and the remaining limits. Change no code.

## Output handoff

Return `review_report` as a JSON string containing the scope, grounded findings, verdict and limitations. For a mapped step use the returned `submit` arguments with its `map_id` and `capability`. Never edit `<state_dir>/map.md` or `<state_dir>/state.json`; only the coordinator writes them.

## Checks

- **scope_traced**: requested diff and connected callers, tests and data flow are inspected; missing access is named.
- **findings_grounded**: every reported defect or improvement has a source location and concrete consequence; no claim of general correctness from a small check.
- **no_code_changed**: this review produces a report only.

## Sources

- Source: ponytail (DietrichGebert/ponytail@7801d061243d7b753bad0e0b3c057cd250b11755, release v5.3.3), `skills/ponytail-review/SKILL.md` sections 1-4. Its whole review outcome maps to `code.change-review`. Adapted into the package protocol and user language; it remains report-only.
- `.agents/rules/ponytail.md` supplies the session working policy in `delivery.json`, not a prerequisite or competing review step. Both selected entry points are accounted for.
- Source helper reference: `<package_root>/scripts/ponytail/skills/ponytail-review/SKILL.source.md`. No executable helper or native upstream hook is selected, installed or run. No runtime dependency beyond the host's available file access is required for the report.
- Probe boundary: upstream mode controls, startup/subagent hooks, maps, band/ledger, installers and the audit/debt/gain/help skills are unselected. Inspected separately for scope, they are not claimed to be integrated. A full intake must preserve their outcomes or explicitly change the source selection.
