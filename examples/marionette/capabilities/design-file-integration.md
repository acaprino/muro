---
id: design-file-integration
role: design-file-integration
resumable: true
when: —
after: []
outputs: ["token_export", "design_code_checks"]
checks: ["exported_references_resolve", "export_report_lists_unsupported", "target_not_overwritten_without_approval", "no_new_code_check_errors", "exceptions_have_cause", "unexamined_items_reported", "ci_changed_with_approval"]
intent_checks: {"design-file.token-export": ["exported_references_resolve", "export_report_lists_unsupported", "target_not_overwritten_without_approval"], "design-file.code-checks": ["no_new_code_check_errors", "exceptions_have_cause", "unexamined_items_reported", "ci_changed_with_approval"]}
check_conditions: {"ci_changed_with_approval": "The step adds or changes a continuous integration file."}
intents: [{"id":"design-file.token-export","description":"Export the tokens of a DESIGN.md as CSS variables, DTCG 2025.10 JSON or Tailwind v4 theme data, to connect the design values to the project's token source, with a mapping report of what the target format does not include.","excludes":["Extracting tokens from an existing brand, codebase or site that has no DESIGN.md.","Creating variables and styles inside a design tool's file (Figma, FigCraft).","Changing token values: that is a change to the design file."]},{"id":"design-file.code-checks","description":"Add design code checks from a DESIGN.md to a project and its continuous integration, so that new source code with colours, sizes, fonts or effects the file does not permit fails the check: a copy of the tool, its configuration, a known defect list, a package script and a continuous integration step.","excludes":["A one-time comparison of an interface with the file is the interface drift inspection.","A code review for correctness, or a repository audit.","A visual or accessibility review: the code check examines neither layout, computed contrast, component states nor visual quality."]}]
tools: [{"name":"shell","purpose":"Run the packaged zsd.mjs with Node.js 22 or later (lint, export, check-code), and the project's package manager to add a script. The tool needs no network connection.","required":true},{"name":"file-access","purpose":"Write the token output and its report; copy the tool, its data and license files into the project; write the check configuration, the known defect list, exception comments, the package script and, with approval, the continuous integration file.","required":true}]
hooks: []
conflicts: []
reads: ["design_file"]
---

# Design File Integration (token export and code checks)

Connects a `DESIGN.md` to the codebase by machine: token files generated from it, and a check that fails when new source code leaves its values. `<ZS>` below stands for `<package_root>/scripts/zero-slop-design`. The packaged originals are the full version: an original wins where this body differs, except for the changes listed in the Sources section: `<ZS>/skills/export-design-tokens/SKILL.source.md`, `<ZS>/skills/enforce-design/SKILL.source.md`, `<ZS>/references/procedure.md`, `<ZS>/references/design-format.md` and `<ZS>/references/code-checks.md` (rules, configuration keys, exception comments and the known defect list).

## Behavior

The export is steps 2 to 4, the code checks steps 5 to 9; record the output that was not asked for as `not requested`.

1. **Before the task** (`procedure.md`): read the project instructions and the design file (the recorded `design_file`, or the project's `DESIGN.md`), find the target repository and paths. Without a design file, stop: report it and name the `design-file` step that writes one.
2. **Export, prepare** (`export-design-tokens`): read the design file and the target tool data; do the document checks (`node <ZS>/tools/zsd.mjs lint <absolute path to DESIGN.md> --json`); get the output format and mode from the developer or the project instructions.
3. **Export, run:** `node <ZS>/tools/zsd.mjs export <DESIGN.md> --format css|dtcg|tailwind --out <target path>`, with `--report <path>` to write the mapping report and `--mode <name>` only for a mode the design file contains. Read the export report for unsupported data and stop if the export cannot include a necessary token. The export requires a clean document, resolves references and reports every unsupported value; an unsupported export produces no token output. `export` refuses to overwrite a file unless `--force` is supplied and cannot replace its source design file: do not overwrite a target file without developer approval.
4. **Export, close:** keep the source file as the primary token source; compare output values with resolved source values; record the token mapping and the target format version; show the output path and the data the target format does not include.
5. **Code checks, prepare** (`enforce-design`): do the lint command for the design file and correct its defects before the next step, in the approved task area; a correction of the file's selections is the `design-file` step. Find the source paths, the style method and the package manager.
6. **Install the tool copy:** put a copy of `<ZS>/tools/zsd.mjs` and `<ZS>/tools/spec-config.yaml` in `tools/zero-slop-design/` in the project, and a copy of `<ZS>/LICENSE` and `<ZS>/THIRD_PARTY_NOTICES.md` in the same directory. Continuous integration then runs the command without the plugin or an npm package.
7. **Configure and run:** write `design-check.config.json` in the project root with the source root and the paths to ignore, adding generated token files, third-party files and the tool copy; do not ignore a path to hide a defect. Run `node tools/zero-slop-design/zsd.mjs check-code DESIGN.md --config design-check.config.json` and read each finding. Correct the findings in the approved task area; get a developer decision for each finding that remains; add an exception comment with a cause for each approved exception (`design-check-ignore` on the same line, or `design-check-ignore-next-line` on the line before, then the rule and the cause); write the known defect list with `--update-known` for the findings that remain.
8. **Wire it:** add a package script that does the `check-code` command. Get developer approval before you change continuous integration files; then add the lint command and the `check-code` command to the continuous integration file, with `<ZS>/templates/ci/github-actions.yml` as the template when the project has no continuous integration. Record the configuration path in `x-zsd.implementation.checks` of the design file.
9. **Close:** do the `check-code` command again and record the result. Show the changed paths, the checked rules and the items that the code check does not examine.
10. **Record** `token_export` (format, target format version, output and report paths, mode, what the format does not include) and `design_code_checks` (tool copy and its version, configuration, known defect list, package script, continuous integration step or the missing approval, last result).

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return both output keys as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **Export formats.** The DTCG output targets 2025.10: its typography composites require an explicit `letterSpacing`, and font fallback lists become arrays. The Tailwind output targets v4, includes CSS variables and adds an `@theme inline` mapping; it leaves the project theme defaults in place. Raw CSS shadows have no DTCG mapping: their export fails with the source path instead of inventing a conversion.
- **What the code check is.** It compares source code with the resolved values in the design file and reads the file on each run, so continuous integration follows design changes. It finds literal values and prohibited patterns: hexadecimal colors that are not token values, color functions, utility palette classes, dimensions outside their token group, font families outside the design typography, and the `must-avoid` patterns gradients, background blur, emoji and shadows. It examines arbitrary utility values such as `p-[13px]`, not utility scale classes such as `p-4`. It does not examine layout, computed contrast, component states or visual quality, and its report lists each `must-avoid` item the rules do not examine: record a manual inspection for these. Exit code 0 is success, 1 findings or an unsupported export (a new warning too with `--strict`), 2 invalid input or an operation error. Do not claim that a code check result proves design quality or accessibility.
- **Known defect list.** It records the findings the project accepts at a specified time: they are reported and do not fail; a new finding fails. Write the list again after each correction so that it becomes shorter.
- **Tool copy.** Replace the copy when the plugin version changes and record the version: it is in `<ZS>/tools/build-info.json`.
- **Interface checks** (`procedure.md`): do not add or do tests unless the developer tells you to do tests, and do only the interface checks with developer approval. The code check added here is the task itself, not such a test.
- This step writes the mechanical artifacts and the one metadata path `x-zsd.implementation.checks`; every other change to `DESIGN.md` belongs to `design-file`. It never overwrites a tokens or theme file of the project, or a `design-system/**/MASTER.md`, without the developer's approval.
- Runtime dependency: Node.js 22 or later (`node --version`), also in continuous integration (the template sets it up). The tool needs no npm installation and no service connection; the source gives no install method for Node.js.

## Checks

- **exported_references_resolve**: all exported references resolve, and output values equal the resolved source values.
- **export_report_lists_unsupported**: the report identifies metadata and unsupported values, with the token mapping and the target format version.
- **target_not_overwritten_without_approval**: no existing target file was overwritten without developer approval, and the design file stayed the primary token source.
- **no_new_code_check_errors**: the last `check-code` run shows 0 errors for new source code.
- **exceptions_have_cause**: each exception comment has a cause, and each remaining finding has a developer decision.
- **unexamined_items_reported**: the report shows the items the code check does not examine and claims neither design quality nor accessibility from its result.
- **ci_changed_with_approval**: continuous integration files were changed only after the developer approved.

## Sources

- Source: zero-slop-design (zero-slop-design/zero-slop-design-plugin@c5cdc7ce499846c23d90732e4958b44f92823756, release v0.2.1, MIT; the bundled tool also carries third-party code under MIT, ISC and Apache-2.0, listed in `THIRD_PARTY_NOTICES.md`) — `skills/export-design-tokens/SKILL.md`, `skills/enforce-design/SKILL.md`, `references/procedure.md`, `references/design-format.md`, `references/code-checks.md`, `templates/ci/github-actions.yml`, `tools/{zsd.mjs,spec-config.yaml,build-info.json}`, `LICENSE` and `THIRD_PARTY_NOTICES.md`, packaged under `<package_root>/scripts/zero-slop-design/` (each skill as `SKILL.source.md`). The export facts and exit codes come from `README.md`, "Local tools", which is read at intake and not packaged.
- AI intent mapping: export-design-tokens → design-file.token-export; enforce-design → design-file.code-checks. One role: both turn the file into artifacts of the codebase with the same tool, and the code check ignores the token files the export generates (enforce-design, step 8).
- Changes for coexistence (ADR-0017):
  - "Use to connect design values to a project token source" and "Use to stop changes…" are not carried as activation: the coordinator classifies by meaning (competing routing).
  - "Read [Technical terms] for skill language" is not followed: those files govern the upstream's own skill text and are not packaged (`intake_only_paths`).
  - enforce-design step 3, "Correct the design file defects": format defects are corrected here in the approved task area, as `procedure.md` says; a change to the developer's selections is `design-file`'s step (one owner of the file). Step 18's metadata path is written here.
  - Added by the package: the tool version taken from `tools/build-info.json`; no existing tokens, theme or Master file overwritten without approval (one owner per output, as in `design-system-extract`).
- No prerequisite is declared: the source chains none of its skills.
- Runtime dependency: Node.js 22 or later; the source states no install method. The bundle was read and hashed at intake (SHA-256 equal to `tools/build-info.json`), not run. Hooks: the selected files define none; the continuous integration step is a file of the user's project, written on approval, not a hook of this package.
- Harmonized by: prompts/harmonizer.md (2026-11-17) — a new role. `design-system-extract` reads tokens out of an existing system into a file; this export generates them from the design file, which stays the primary source. No capability checked source code against a recorded design before.
