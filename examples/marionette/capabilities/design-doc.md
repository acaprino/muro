---
id: design-doc
role: design-doc-authoring
when: "—"
after: []
outputs: ["design_document"]
checks: ["predecessor_context_confirmed", "sections_approved_one_by_one", "architecture_chosen_by_author", "every_file_listed_no_code", "brief_reconciled", "document_saved"]
check_conditions: {"brief_reconciled": "A predecessor brief or discussion summary file was ingested at the start."}
intents: [{"id":"docs.design-draft","description":"Write a technical design document section by section with the author: problem and goals, technical plan, alternatives considered and a detailed implementation plan that lists every file, each section approved before the next, then saved in the project.","excludes":["Implementing the design or changing production code: this step is design only.","A spec written inside an implementation route, which work-map synthesizes without interviewing.","Reviewing an existing document with fresh reviewers.","A Word, PDF or slide file, or an interactive HTML explainer."]}]
tools: [{"name":"file-access","purpose":"Read the predecessor brief and the code the plan refers to; write design_draft.md, the final document under the chosen design directory and its SITEMAP.md entry.","required":true},{"name":"structured-question","purpose":"Present a single-select gate with exactly one question; plain chat is the fallback.","required":false},{"name":"shell","purpose":"Read the author name from git config user.name.","required":false}]
hooks: []
conflicts: []
reads: ["concepts_brief"]
resumable: true
---

# Design Document

Drafts a design document with the user in the session that holds the context, one approved section at a time, and saves it in the project. It produces no production code.

The packaged original is the full version and wins where this body differs, except for the changes listed in the Sources section: `<package_root>/scripts/egm/skills/egm-draft/SKILL.source.md`, with the template `<package_root>/scripts/egm/skills/egm-draft/references/design_doc.md` and the shared rules `<package_root>/scripts/egm/resources/execution_instructions.md`. Open the section a step names when you reach it.

## Behavior

1. **Rules of the step.** Read `execution_instructions.md` whole and apply it: design-only scope (code only in a markdown block or a scratchpad outside the project tree), explicit agreement at each step transition, one question per response, no summary or status block in the final response, and no file change in the turn in which you find a contradiction with earlier goals. Then apply `## Execution Constraints (CRITICAL)` of the original, all thirteen.
2. **Author decides architecture** (constraint 13). For a decision with more than one defensible answer present up to three options, each with its mechanism, trade-offs and failure conditions, in a single-select gate. Do not rank them, mark a default or pick; asked to "just pick one", restate the trade-offs and present the same gate. Decide mechanical choices yourself.
3. **Ingest the predecessor** (`### Step 1`): the named context file, else `concepts_brief.md`, else `discussion_summary.md`, in the locations the original lists, else ask the user for the problem, goals and technical context. Confirm the starting context, get approval to start, resolve the author.
4. **Draft in order**, each section written to `design_draft.md` and closed by `### Section Approval Gate (Steps 2–5)` (chat summary with the path first, then the gate, never an empty message): Overview, Goals and Problem (`### Step 2`), Technical Plan with a text diagram (`### Step 3`), Alternatives Considered with `Rejected by author:` reasons (`### Step 4`), Detailed Implementation (`### Step 5`).
5. **Detailed implementation**: one list; every file changed, created or deleted, each with what changes and why; no implementation code (pseudocode, APIs and schemas are allowed); enough detail that the plan can be implemented without an impactful decision left open.
6. **Finalize** (`### Step 6`). Compare the draft with the predecessor: report every contradiction, quoting both, and each addition that changes the architecture, an external interface or a dependency; the user decides each one and you do not align the draft on your own. Then the target-directory gate (default `docs/designs/`), the `SITEMAP.md` entry when that file exists, and the document written to `<DESIGN_DIR>/<FEATURE>.md` following the template.

## Output handoff

Return `design_document` (the saved path, the predecessor used and the contradictions the user decided) as a JSON string. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- The original ends by recommending a review of the saved document. Here that is a step of fresh-review; ask the coordinator for it when it is not already planned. Do not grade the draft against the zoom-out standard in this session: the session that wrote it agrees with it.
- If the user asks for production implementation while this step is active, say that it produces design documents and illustrative code only and ask whether to continue the design or leave it; implementation is work-map's step.
- The host guides the original opens first are packaged under `<package_root>/scripts/egm/docs/`; their installation, slash-command and plugin-cache parts describe the upstream plugin, not this package. On Claude Code the draft is revised from direct edits, `<!-- -->` comments in `design_draft.md` or notes in chat.
- A line `EGM artifact directory: <path>` in the user's prompt or instruction file moves briefs, drafts and reports there (`docs/claude.md`, "Invocation and resources"); a path outside the working directory is confirmed first.
- Runtime dependencies: none. Git is optional.

## Checks

- **predecessor_context_confirmed**: the starting context (file or the user's answers) was confirmed and drafting was approved before the first section.
- **sections_approved_one_by_one**: each of the four sections was written to the draft file and approved at its gate before the next; chat carried paths, not the text.
- **architecture_chosen_by_author**: every decision with more than one defensible answer was put to the author as unranked options, or the document records that none arose.
- **every_file_listed_no_code**: the implementation plan lists every touched file with its rationale and contains no implementation code.
- **brief_reconciled**: contradictions and architecture-changing additions against the predecessor were reported and decided by the user. Not applicable when no predecessor file was ingested.
- **document_saved**: the document is at the confirmed path, follows the template and, when `SITEMAP.md` exists, is registered in it.

## Sources

- Source: egm (google/elephant-goldfish-model@dea7761de06ce5b51c177ebb9bba0469f24af5a4, release v0.1.1, Apache-2.0) — `skills/egm-draft/SKILL.md`, `skills/egm-draft/references/design_doc.md`, `resources/execution_instructions.md`, `docs/claude.md`, packaged under `<package_root>/scripts/egm/` (the skill as `skills/egm-draft/SKILL.source.md`).
- AI mapping: egm-draft → docs.design-draft. It `reads` a recorded `concepts_brief` but does not require it: the source drafts from notes or from the user's answers too. work-map's `spec` is another document with opposite rules (no file paths, no interview), written inside an implementation route; the two outputs have separate owners and the classifying AI chooses by what the user asked for.
- Changes for coexistence (ADR-0017):
  - `/egm-draft`, the suggestion to start `/egm-brainstorm` and the `/egm:egm-review` handoff are not carried: the coordinator classifies by meaning and each of those is another capability's step.
  - The document is also handed over as `design_document` through the coordinator; its files, template and gates stay the source's.
- The always-on policy of this package governs replies; this capability's gate messages and document follow the capability, as that policy states.
- `hooks: []`: the upstream ships no hook at this release.
