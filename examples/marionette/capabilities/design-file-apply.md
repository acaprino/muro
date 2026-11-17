---
id: design-file-apply
role: design-file-implementation
resumable: true
when: —
after: []
outputs: ["design_application"]
checks: ["tokens_and_components_identified", "inspection_area_given", "no_unmeasured_behavior_claimed", "other_selections_kept", "design_file_not_rewritten"]
intents: [{"id":"design-file.apply","description":"Change an interface in the project's code from its DESIGN.md: build or modify components, layouts or styles with the recorded tokens, the project's own token source and component system, the applicable interaction states and the responsive, keyboard and reduced-motion behaviour, and report how each change maps to the file.","excludes":["Designing and building a new company website or landing page, with its sections and copy planned, is visual direction; it follows a project DESIGN.md where one exists.","A clickable HTML prototype made to try a flow before it is engineered.","A software change that touches no interface, or interface work the user wants done without a design file.","Changing the design file itself, or only reporting where the interface differs from it."]}]
tools: [{"name":"file-access","purpose":"Read DESIGN.md, the project instructions, components, assets and style sources, and change the target interface files.","required":true},{"name":"shell","purpose":"Run the project's own commands for an interface check the developer approved.","required":false},{"name":"browser","purpose":"Look at the changed interface for an interface check the developer approved.","required":false}]
hooks: []
conflicts: []
reads: ["design_file"]
---

# Design File Apply (interface changes from DESIGN.md)

Makes the interface changes a developer specified, from the selections their `DESIGN.md` records, and says which tokens and components each change used. `<ZS>` below stands for `<package_root>/scripts/zero-slop-design`. The packaged originals are the full version: an original wins where this body differs, except for the changes listed in the Sources section: `<ZS>/skills/apply-design/SKILL.source.md`, with `<ZS>/references/procedure.md` and `<ZS>/references/design-format.md`.

## Behavior

1. **Before the task** (`procedure.md`): read the project instructions, find the target repository and paths, read the design file (the recorded `design_file`, or the project's `DESIGN.md`) and any design brief, record the task area and the developer's selections, keep project components and assets when applicable. With no design file, stop: report it and name the `design-file` step that writes one.
2. Find the applicable tokens, components and assets.
3. Compare the specified task with the unresolved design items. Get a developer decision for an unresolved item that prevents the task, and if different instructions prevent the same task. A starter file holds example data: its values are not the developer's selections, and a value with the status `proposed` is not one either.
4. Use the project token source and component system, and make the specified interface changes. Keep the other design selections.
5. Include the applicable interaction states and responsive behavior, keyboard operation and reduced-motion behavior.
6. Do only the interface checks with developer approval.
7. Show the changed paths, the design mappings and the remaining checks, and record them as `design_application` with the inspection area.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `design_application` as a JSON string. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **Interface checks** (`procedure.md`): do not add or do tests unless the developer tells you to do tests; record the remaining checks and the cause of a missing inspection area; do not show measured data that is not available as correct results. This governs checks and tests of the interface. When a change adds non-trivial logic, the session policy's one small test or assert-based self-check for that logic still holds.
- **The file is not rewritten here.** A value the task needs and the file lacks, or a request that contradicts a recorded selection, is a developer decision: ask, and the change to `DESIGN.md` belongs to `design-file` in its own step. Where the project runs design code checks (`design-check.config.json`), source code in the checked paths with a colour value, a colour function such as `rgb()` or `oklch()`, a utility palette class, a font family or a `must-avoid` effect the file does not permit fails them: use the project's tokens there, or say that the check will fail.
- A change planned and built through `work-map` or `plan-execution` stays their step and follows their method; this step is the interface change itself, made from the file.
- Runtime dependency: none of its own; the project's own tooling for an approved check.

## Checks

- **tokens_and_components_identified**: the report identifies the tokens and components used, with the design mapping of each change.
- **inspection_area_given**: the report gives the inspection area and the remaining checks.
- **no_unmeasured_behavior_claimed**: no behavior is shown as correct without measured data.
- **other_selections_kept**: only the specified interface changes were made; other design selections stand.
- **design_file_not_rewritten**: `DESIGN.md` was not changed by this step; open values were asked of the developer.

## Sources

- Source: zero-slop-design (zero-slop-design/zero-slop-design-plugin@c5cdc7ce499846c23d90732e4958b44f92823756, release v0.2.1, MIT) — `skills/apply-design/SKILL.md`, `references/procedure.md` and `references/design-format.md`, packaged under `<package_root>/scripts/zero-slop-design/` (the skill as `SKILL.source.md`).
- AI intent mapping: apply-design → design-file.apply, from its eleven steps and its completed-task lines.
- Changes for coexistence (ADR-0017):
  - "Use when a developer must have components, layouts, or styles from the recorded design data" is not carried as activation: the coordinator classifies by meaning (competing routing).
  - "Read [Technical terms] for skill language" is not followed: those files govern the upstream's own skill text and are not packaged (`intake_only_paths`).
  - "Do not add or do tests unless the developer tells you to do tests" keeps its place under "Interface checks" and governs checks and tests of the interface. The session policy (Ponytail) asks one small test or an assert-based self-check for new non-trivial logic, and `plan-execution` works test-first inside its own step: the two rules are scoped by what is tested, so neither is dropped (contradictory rules of two sources; owner decision of 2026-11-17).
  - Added by the package: this step never rewrites `DESIGN.md` (one owner per output: `design-file`); the note on design code checks; the boundary with `work-map` and `plan-execution` (one capability per step).
- No prerequisite is declared: the source gives every skill the design file as an input and chains none; whether a missing file is created from a brief or extracted from the interface is the developer's choice.
- Runtime dependency: none of its own. Hooks: the selected files define none.
- Harmonized by: prompts/harmonizer.md (2026-11-17) — a new role beside `visual-direction` (plans and builds a website by taste-skill's method, and takes a project `DESIGN.md` as the user's explicit instruction), `ui-prototype` (an HTML prototype) and `work-map` (a software change through spec and tickets): this one changes the product's interface code to the recorded selections and reports the mapping.
