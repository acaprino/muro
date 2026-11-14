---
id: design-drift
role: design-drift-report
when: "—"
after: []
outputs: ["drift_report"]
checks: ["every_document_analyzed", "code_read_not_recalled", "only_differences_reported", "report_in_source_format"]
intents: [{"id":"docs.design-drift","description":"Compare every design document or README in a directory with the current code and report only where the code diverged from, or never implemented, what the documents describe.","excludes":["Fixing the code or the documents: this step only reports.","A code review or repository audit for bugs, risks and missing tests.","Reviewing a design document's quality with fresh reviewers.","A ledger of deliberate shortcut comments."]}]
tools: [{"name":"file-access","purpose":"List and read the documents, read the current source files they refer to, append the dated drift report file.","required":true},{"name":"shell","purpose":"Search the source tree for the classes, functions and endpoints a document mentions.","required":false}]
hooks: []
conflicts: []
reads: ["contract_files", "design_document"]
---

# Design Drift Report

Reads each document in a directory, finds the code it describes and writes down the differences. Nothing is fixed.

The packaged original is the full version and wins where this body differs, except for the changes listed in the Sources section: `<package_root>/scripts/egm/skills/egm-drift-report/SKILL.source.md`.

## Behavior

1. **Input.** A directory of design documents or READMEs is required; ask for it when none is given. After a codebase-contracts step, the target is the contracts that step modified.
2. **List** every file in that directory and process them one after another, not together.
3. **For each document:** read it and note its intent, proposed changes and the file names and symbols it mentions. Locate the code: when the document gives no path, search for the classes, functions or endpoints it names, and prompt the user to add the missing links to the document so the next run is cheaper. Read the current source files; do not rely on memory.
4. **Detect drift.** Look for the four kinds the original names: missing features, incomplete models (classes, structs or protos lacking specified fields), logic shortcuts (hardcoded values where dynamic logic was planned) and architectural divergence. A specific object, field or file name in the document that the code lacks is drift. Logic that no design or README refers to is drift too.
5. **Filter.** Report only the differences; say nothing about what matches. A document that matches the code gets `No drift detected`.
6. **Report.** Append each document's analysis to `{YYYY-MM-DD}_DRIFT_REPORT.md` in the format of the original: a `## <DESIGN_DOC_NAME>` heading, then the bulleted divergences or the no-drift line.

## Output handoff

Return `drift_report` (the report path, the documents analyzed and, for each, the number of divergences or the no-drift result) as a JSON string. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- On generated contracts the original's variant applies: verify every documented method, route, enum, table and invariant against the local source, and record both missing code coverage and documented things the code does not have.
- engineering-review owns bugs, risks and tests in code; this report owns the gap between documents and code and proposes no fix.
- Runtime dependencies: none.

## Checks

- **every_document_analyzed**: each file of the directory has a section in the report; none was skipped.
- **code_read_not_recalled**: the current source files were read for each document, and searches are recorded where the document gave no path.
- **only_differences_reported**: sections list divergences only, or `No drift detected`.
- **report_in_source_format**: the dated report file exists with one heading per document.

## Sources

- Source: egm (google/elephant-goldfish-model@dea7761de06ce5b51c177ebb9bba0469f24af5a4, release v0.1.1, Apache-2.0) — `skills/egm-drift-report/SKILL.md` (whole) and `skills/egm-bootstrap/SKILL.md` Step 5.5 for the contracts variant, packaged as `<package_root>/scripts/egm/skills/egm-drift-report/SKILL.source.md`.
- AI mapping: egm-drift-report → docs.design-drift. It `reads` recorded `contract_files` and `design_document` to find its target, and requires neither: the source starts from any directory of documents.
- Changes for coexistence (ADR-0017):
  - `/egm-drift-report` is not carried: the coordinator classifies by meaning.
  - The report is also handed over as `drift_report` through the coordinator; its file and format stay the source's.
- `hooks: []`: the upstream ships no hook at this release.
