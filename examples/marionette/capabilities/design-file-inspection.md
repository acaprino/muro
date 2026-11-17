---
id: design-file-inspection
role: design-file-inspection
when: —
after: []
outputs: ["design_inspection_report"]
checks: ["defects_have_source_data", "developer_decisions_listed", "differences_have_design_and_measured_values", "defects_have_criterion", "unmeasured_not_shown_correct", "nothing_changed"]
intent_checks: {"design-file.document-review": ["defects_have_source_data", "developer_decisions_listed", "unmeasured_not_shown_correct", "nothing_changed"], "design-file.interface-drift": ["differences_have_design_and_measured_values", "unmeasured_not_shown_correct", "nothing_changed"], "design-file.accessibility-inspection": ["defects_have_criterion", "unmeasured_not_shown_correct"]}
intents: [{"id":"design-file.document-review","description":"Examine a DESIGN.md against its format, its design brief and the developer's instructions, and report its defects: incorrect or unresolved token references, missing paths, components or assets, theme pairs and component states, responsive and accessibility instructions, and different instructions for the same item, each with its location, effect and necessary correction.","excludes":["Changing the design file.","A review of a technical design document, plan or proposal by fresh reviewers.","Auditing and fixing an HTML design's hierarchy, states or generic look."]},{"id":"design-file.interface-drift","description":"Compare an interface with its DESIGN.md and report the measured differences: computed or source values against the resolved design tokens for the stated routes, states, viewports and modes, with approved differences apart from defects and what has no measured data left unresolved.","excludes":["Comparing technical design documents or READMEs with what the code does and how it is structured is the design drift report.","Fixing the interface or the file.","A check of source code against the file in continuous integration is the design code checks."]},{"id":"design-file.accessibility-inspection","description":"Inspect a DESIGN.md's accessibility instructions, source code or an interface in operation against a stated accessibility standard and level, and report each defect with its source data and criterion: contrast, labels and names, keyboard access and focus, target size, reflow, zoom and reduced motion, with measured results apart from what needs manual inspection.","excludes":["Auditing an HTML design for accessibility and fixing what fails is the design review.","Accessibility rules or guidance looked up for a stack before building."]}]
tools: [{"name":"file-access","purpose":"Read DESIGN.md, the design brief, the interface sources and an observations file; write the inspection report when a path is given.","required":true},{"name":"shell","purpose":"Run the packaged zsd.mjs with Node.js 22 or later: lint for a design file review, drift when an observations file exists. The tool needs no network connection.","required":true},{"name":"browser","purpose":"Get computed style values, and examine contrast, keyboard access and focus in an interface in operation, within the routes, states and viewports stated. A request to a remote interface leaves the machine.","required":false}]
hooks: []
conflicts: []
reads: ["design_file", "design_brief", "design_application"]
---

# Design File Inspection (file review, interface drift, accessibility)

Three inspections that report and correct nothing: the design file against its own format and brief, an interface against its design file, and a file or an interface against an accessibility standard. `<ZS>` below stands for `<package_root>/scripts/zero-slop-design`. The packaged originals are the full version: an original wins where this body differs, except for the changes listed in the Sources section: the skill file `<ZS>/skills/<name>/SKILL.source.md` named in each step, `<ZS>/references/procedure.md`, `<ZS>/references/design-format.md` and, for a drift comparison, `<ZS>/references/observations.md`.

## Behavior

1. **Before the task** (`procedure.md`): read the project instructions, find the target repository and paths, read the design file (the recorded `design_file`, or the project's `DESIGN.md`) and any design brief, and record the task area. The drift inspection and the file review need a design file: without one, report it and name the `design-file` step that writes one.
2. **File review** (`review-design-md`): read the target file and its source data; do the document checks (`node <ZS>/tools/zsd.mjs lint <absolute path to DESIGN.md> --json`; the lint result includes selected document checks and does not show interface accessibility); compare the file with the design brief; find references to paths, tokens, components and assets that are missing; examine theme pairs and component states, responsive behavior and accessibility instructions; compare instructions for the same item; record each defect with its location, effect and necessary correction; divide document defects from items for which interface measured data is necessary; show the inspection area and unresolved items.
3. **Interface drift** (`review-design-drift`): record the inspection routes, states, viewports and modes; get computed style values or source values for applicable items and compare them with the resolved design tokens; record each difference with the design path and the interface location; divide approved differences from defects. When an observations file is available, compare with `node <ZS>/tools/zsd.mjs drift <DESIGN.md> <observations.json> --json`: open `observations.md` for the JSON format (design path, measured value, location, viewport, mode and state, the same units as the token, estimates kept out). Examine layout, text hierarchy, assets and interaction behavior in a different inspection. Record missing states and missing measured data as `unresolved`, and show the defects, the source data and the inspection area.
4. **Accessibility** (`review-accessibility`): record whether the inspection includes the document, source code or an interface in operation, and read the applicable accessibility standard before the measured data. Examine text and nontext contrast against backgrounds in operation; labels, names, headings and status messages; keyboard access, focus visibility and focus sequence; target size, reflow, zoom and reduced-motion behavior. Use available software tools only for approved checks. Record each defect with source data and its standard criterion, divide measured results from items for which manual inspection is necessary, and show the inspection area, the defects and the missing measured data.
5. **Record** `design_inspection_report`: which inspection ran, its inspection area, the defects or differences with their source data, the unresolved items and what was not measured.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `design_inspection_report` as a JSON string. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **Nothing is corrected.** Do not change the design file unless the developer tells you to correct it, and do not change the interface unless the developer tells you to correct it. A correction of the file is the `design-file` step; a correction of the interface is `design-file-apply`. The accessibility inspection ends with its report.
- **What a result proves.** `drift` compares only the supplied observations after token resolution: a result with no differences does not show full interface conformance. The report does not show items without measured data as correct, and does not show interface conformance through document checks.
- **Source data and interface checks** (`procedure.md`): record source paths or URLs and source dates, and the viewport, mode, route and state of measured data; keep measured values apart from estimates; a screenshot does not supply keyboard behavior or all component states; open external sources only with developer approval for access. Do not add or do tests unless the developer tells you to do tests, and do only the interface checks with developer approval.
- `design-review` audits an HTML design and fixes what fails; `design-drift` compares technical documents with code. This capability measures against the design file or a stated standard and reports.
- Runtime dependency: Node.js 22 or later (`node --version`) for the lint and drift commands; the tool needs no npm installation and no service connection, and the source gives no install method for Node.js.

## Checks

- **defects_have_source_data**: each defect of the file has its location, its effect, the necessary correction and source data.
- **developer_decisions_listed**: the report gives the items for which developer decisions are necessary.
- **differences_have_design_and_measured_values**: each difference has a design value and a measured value, with the design path and the interface location.
- **defects_have_criterion**: each accessibility defect has source data and an applicable criterion of the stated standard.
- **unmeasured_not_shown_correct**: items without measured data are not shown as correct, and no interface conformance is claimed from document checks.
- **nothing_changed**: neither the design file nor the interface was changed by the inspection.

## Sources

- Source: zero-slop-design (zero-slop-design/zero-slop-design-plugin@c5cdc7ce499846c23d90732e4958b44f92823756, release v0.2.1, MIT; the bundled tool also carries third-party code listed in `THIRD_PARTY_NOTICES.md`) — `skills/{review-design-md,review-design-drift,review-accessibility}/SKILL.md`, `references/procedure.md`, `references/design-format.md`, `references/observations.md` and `tools/{zsd.mjs,spec-config.yaml}`, packaged under `<package_root>/scripts/zero-slop-design/` (each skill as `SKILL.source.md`).
- AI intent mapping: review-design-md → design-file.document-review; review-design-drift → design-file.interface-drift; review-accessibility → design-file.accessibility-inspection. Three skills, one role: each reads, measures and reports with the same rules on source data and unmeasured items, and none corrects.
- Changes for coexistence (ADR-0017):
  - The skill descriptions' "Use before interface implementation or after changes", "Use to find differences…" and "Use for contrast…" are not carried as activation: the coordinator classifies by meaning (competing routing).
  - "Read [Technical terms] for skill language" is not followed: those files govern the upstream's own skill text and are not packaged (`intake_only_paths`).
  - The drift report is handed over as `design_inspection_report`, not `drift_report`: that key belongs to `design-drift`, which compares technical documents with code (one owner per output).
  - Added by the package: the names of the steps that correct the file and the interface (one capability per step).
- `nothing_changed` is not asked of the accessibility inspection: its skill states no such line and has no correction step.
- No prerequisite is declared: the source chains none of its skills.
- Runtime dependency: Node.js 22 or later; the source states no install method. The bundle was read and hashed at intake, not run. Hooks: the selected files define none.
- Harmonized by: prompts/harmonizer.md (2026-11-17) — kept apart from `design-review` (its accessibility audit fixes an HTML design against the WCAG AA minimums; this one reports against the standard and level the task states, also for a document) and from `design-drift` (same word, another object: design documents and READMEs against code).
