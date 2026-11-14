---
id: fresh-review
role: fresh-context-review
when: "—"
after: []
outputs: ["document_review_reports", "document_review_outcome"]
checks: ["reviewers_fresh_context", "failed_reviewers_not_counted", "reports_written_to_files", "stages_in_order", "reaudit_cap_respected", "convergence_rule_applied", "findings_categorized_with_evidence", "edits_only_approved"]
intent_checks: {"docs.staged-review": ["reviewers_fresh_context", "failed_reviewers_not_counted", "reports_written_to_files", "stages_in_order", "reaudit_cap_respected", "findings_categorized_with_evidence", "edits_only_approved"], "docs.review-loop": ["reviewers_fresh_context", "failed_reviewers_not_counted", "reports_written_to_files", "convergence_rule_applied", "findings_categorized_with_evidence", "edits_only_approved"], "docs.finding-resolution": ["reports_written_to_files", "findings_categorized_with_evidence", "edits_only_approved"]}
check_conditions: {"findings_categorized_with_evidence": "The step resolved findings: a review loop, a resolution, or a staged review in which the user chose to resolve findings with the agent.", "edits_only_approved": "Edits were applied to the target document in this step.", "reaudit_cap_respected": "A stage was re-run after the document was updated."}
intents: [{"id":"docs.staged-review","description":"Review a design document, plan or proposal with reviewers that never saw the conversation, through the five ordered stages (zoom out, comprehension, critique, second zoom out, implementation readiness) or one of their presets, with a report file per stage.","excludes":["Reviewing code changes or auditing a repository for bugs: that is engineering-review.","Checking an interface for accessibility, hierarchy or polish, or fact-checking an explainer.","Writing or rewriting the document itself."]},{"id":"docs.review-loop","description":"Run chosen fresh-context reviewers against chosen standards on a document or one of its sections, resolve the findings with the author and repeat until two consecutive clean rounds, the cap or the user's stop.","excludes":["The full five-stage protocol when the user did not choose reviewers or a section.","Code review, design-system review or factual verification of an explainer."]},{"id":"docs.finding-resolution","description":"Work through an existing list of reviewer findings on a document in the session that wrote it: contest, escalate, propose a fix or decline each one, report, and apply only the edits the user approves.","excludes":["Producing new findings: no reviewer runs in this intent.","Applying fixes to code from a code review."]}]
tools: [{"name":"file-access","purpose":"Read the target document and its linked files; write the stage, consolidated and resolution report files; save approved URLs as local files; apply approved edits to the target document.","required":true},{"name":"subagent","purpose":"Spawn reviewers and the synthesizer in a fresh context with no conversation history; reviewers only read, the synthesizer also writes the report file it is asked for.","required":true},{"name":"structured-question","purpose":"Present a single-select gate with exactly one question; plain chat is the fallback.","required":false},{"name":"web-fetch","purpose":"Save the raw page of a URL the user approved as review context, because reviewers cannot open URLs.","required":false}]
hooks: []
conflicts: []
reads: ["design_document"]
resumable: true
---

# Fresh-Context Review

Has a document read by reviewers that start without the conversation (the source's Goldfish), and resolves their findings in the session that knows why the document says what it says (the Elephant). The author decides every change.

The packaged originals are the full version: the original of the requested intent wins where this body differs, except for the changes listed in the Sources section. Under `<package_root>/scripts/egm/`: `skills/egm-review/SKILL.source.md` (staged review), `skills/egm-review-loop/SKILL.source.md` (loop), `skills/egm-resolve/SKILL.source.md` (resolution), the personas in `agents/` and the standards in `resources/document_standards/`. Open the section a step names when you reach it.

## Behavior

1. **Reviewers are fresh** (`## Delegation`, all intents that review). Spawn a new general-purpose subagent for each independent review and tell it to read its persona file first; never fork the conversation or resume a reviewer. Give it only the task, the target and range, absolute paths of persona and standard, and the explicit review context; nothing of your deliberation. Reviewer names map to `agents/zoom_out.md`, `inventive_catalyst.md`, `comprehension.md`, `design_critic.md`, `structural.md`, `style.md`, `implementation_readiness.md`, `codebase_details.md`; the synthesizer is `agents/synthesizer.md`. When the host cannot nest subagents, dispatch reviewers directly instead of the synthesizer. No subagent tool: stop and tell the user that a review in the same context is not a fresh review.
2. **Failed reviewers.** A reviewer that times out, fails or returns no report is retried once, then recorded as `not run`, never as zero findings.
3. **Staged review** (`docs.staged-review`, the review original).
   - `## Execution Constraints (CRITICAL)`, all eleven, apply.
   - `### Step 1`: the target path and optional context are asked in plain chat; the linked-files rule of Step 1.3 runs once, right before the first stage that takes context: links inside the working directory are added, links outside it and URLs need the user's approval, approved URLs are saved as local files.
   - `### Step 2`: the four presets (interactive with all rubrics, consolidated report, feature spec only, implementation plan only), chosen at a single-select gate unless the request already names one.
   - `### Step 3`: find the line where the implementation plan starts; it splits the feature range from the detailed range.
   - Stages 5 to 9 run in this order and never in parallel; only the reviewers inside one stage are parallel. Reviewers, ranges, standards and report file of each stage are in `### Subflow: Uninterrupted Full Flow` and the four stage subflows. The comprehension stage spawns its reviewer directly, with no standard, and its report keeps the paraphrase.
   - Each interactive stage ends with its checkpoint gate (`### Subflow Checkpoint Gates & Pause/Resume Protocol`). A stage is re-run at most once after the document is updated; then the remaining findings are recorded as accepted trade-offs.
   - Critique and implementation readiness run the loop of point 4 in this same step; "resolve findings with agent" runs point 5.
4. **Review loop** (`docs.review-loop`, the loop original). Ask only for the missing inputs, one at a time, and confirm the configuration (`### Step 1`). Each round: re-read the target and recompute the line range, run the reviewers, give every finding the id `<reviewer>-<round>-<n>`, resolve with point 5, then apply `#### 2.4 Iteration Check & Turn Boundary`: settled findings are not re-opened, a clean round has no unsettled Blocker or Major and no reviewer `not run`, converged is two consecutive clean rounds, the cap is 5 rounds, churn is a new finding at the scope of an applied fix. At cap or churn ask one question. Start another round only when the user confirms.
5. **Resolution** (`docs.finding-resolution`, the resolve original, `### Step 2` to `### Step 5`). Give each finding exactly one category: CONTEST (with evidence the reviewer could read), ESCALATE (the evidence is outside what the reviewer could read: give it to the user, no fix), PROPOSE FIX, DECLINE (a Nit, recorded). Do not change a severity, do not contest a comprehension gap, do not add context only to satisfy a reviewer. Write `goldfish_review_report.md`, list escalated findings first, present the choices of Step 4 and stop with no tool call. Apply only what the user approves, in one batch or after the item-by-item breakdown, then mark the report resolved.

## Output handoff

Return `document_review_reports` (the report file paths, the preset or reviewers used and each reviewer's status, `completed` or `not run`) and `document_review_outcome` (rounds run, how the review ended, counts of accepted, contested, escalated, declined and open findings, and whether the target was edited) as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Reports go to the working directory, or to the folder named by a line `EGM artifact directory: <path>`; never only to a per-session scratchpad, because they must outlive the session (`<package_root>/scripts/egm/docs/claude.md`, "Invocation and resources"). The other parts of the packaged host guides that describe installing the upstream plugin, its commands, its cache and its registered reviewer types do not apply here.
- Resolution belongs in the session that wrote the document. In another session say so: its contests carry less evidence.
- design-review, engineering-review and explainer-fact-check keep their own targets (interfaces, code, factual claims); this capability reviews documents against the packaged standards.
- Runtime dependencies: a host subagent tool. The source prescribes no installation.

## Checks

- **reviewers_fresh_context**: every review ran in a new subagent that received the persona, target, standard and explicit context only, and the isolation actually obtained is stated.
- **failed_reviewers_not_counted**: a reviewer without a report was retried once and is recorded as `not run`.
- **reports_written_to_files**: every report is a file whose path was given in chat; no report was dumped in chat.
- **stages_in_order**: the stages of the chosen preset ran in order, each report written before the next stage started.
- **reaudit_cap_respected**: no stage was re-run more than once. Not applicable when no stage was re-run.
- **convergence_rule_applied**: the loop ended on two consecutive clean rounds, the 5-round cap, churn or the user's stop, and says which.
- **findings_categorized_with_evidence**: each finding has exactly one category, contests cite evidence the reviewer could read, severities are unchanged. Not applicable when the step resolved no findings.
- **edits_only_approved**: every edit to the target was approved by the user. Not applicable when no edit was applied.

## Sources

- Source: egm (google/elephant-goldfish-model@dea7761de06ce5b51c177ebb9bba0469f24af5a4, release v0.1.1, Apache-2.0) — `skills/egm-review/SKILL.md`, `skills/egm-review-loop/SKILL.md`, `skills/egm-resolve/SKILL.md`, `agents/*.md`, `resources/document_standards/*.md`, `docs/claude.md`, `docs/codex.md`, `docs/harnesses.md`, packaged under `<package_root>/scripts/egm/` (each skill as `SKILL.source.md` in its folder).
- AI mapping: egm-review → docs.staged-review; egm-review-loop → docs.review-loop; egm-resolve → docs.finding-resolution. One capability because the source runs them inside each other in one thread and one session: stages 7 and 9 of the review invoke the loop, and the loop hands every round to the resolution. Three separate steps would break that thread; three intents keep each entry point the source offers.
- Changes for coexistence (ADR-0017):
  - `/egm-review`, `/egm-review-loop` and `/egm-resolve` are not carried: the coordinator classifies by meaning.
  - The registered reviewer types (`egm:egm-zoom-out` and the others) and their Claude adapters are not carried, because this package registers no host subagent: the source's own alternative is used, a general-purpose subagent told to read the persona file.
  - Reports and outcome are also handed over as `document_review_reports` and `document_review_outcome` through the coordinator; the files, formats, gates and limits stay the source's.
- Gap: the upstream Claude adapters give reviewers `tools: [Read, Grep, Glob]` and `omitClaudeMd: true`. Here read-only is an instruction and a reviewer may receive the project's instruction files; the source's Claude guide says a Claude Code without `omitClaudeMd` support "must not be treated as verified Goldfish isolation environments", and the same limit holds here. The first check asks for the isolation actually obtained. Not run live.
- `hooks: []`: the upstream ships no hook at this release (`docs/privacy.md`).
