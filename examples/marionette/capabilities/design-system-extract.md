---
id: design-system-extract
role: design-system-extraction
when: —
after: []
outputs: ["design_tokens", "component_inventory"]
checks: ["values_traced_to_source", "gaps_not_filled", "inconsistencies_reported", "inventory_complete_per_component", "existing_files_not_overwritten"]
intents: [{"id":"ui.token-extraction","description":"Extract the design tokens that an existing brand, codebase, live site, set of screenshots or UI kit actually uses (colour, typography, spacing, radii, shadows and whatever else it defines) into a structured tokens file in the source's own format, reporting gaps and inconsistencies instead of filling them.","excludes":["Recommending or inventing a design system for a product that has none is design guidance or aesthetic direction.","Creating variables and styles inside a Figma file is Figma work.","Refactoring a codebase to use the tokens is an engineering change."]},{"id":"ui.component-inventory","description":"Walk a finished design, page, flow or project and document the reusable components in it (purpose, variants, sizes, states, tokens used, composition, accessibility notes, do and don't), with the inconsistencies, missing states and off-scale values that stand between it and a real system.","excludes":["Building the component library as production code is an engineering change.","Planning or building components inside a Figma file is Figma work.","A review of how well components are implemented in code."]}]
tools: [{"name":"file-access","purpose":"Read theme, token, style and design files, and write the tokens file and the inventory document in the project.","required":true},{"name":"image-inspection","purpose":"Read colours, type and spacing from screenshots or a brand guide supplied as images.","required":false},{"name":"browser","purpose":"Read computed styles from a live site the user names. The request leaves the machine.","required":false}]
hooks: []
conflicts: []
reads: ["aesthetic_direction", "prototype_file"]
---

# Design System Extract (tokens and component inventory)

Turns what a design already contains into a system others can build on: a tokens file with the real values, and a documented inventory of the components hidden in the pages. It records what is there; it does not design. `<CD>` below stands for `<package_root>/scripts/claude-design-system-prompt/claude`.

## Behavior

0. **Scope by the selected intent.** Tokens are steps 1 to 3, the inventory steps 4 to 6; record the output not asked for as `not requested`.
1. **Identify the sources:** a codebase (theme and token files, style variables, the styling framework's configuration, design-system source), a live site or screenshots, a brand guide, a UI kit, or a recorded `aesthetic_direction`. When none is named, ask; invented tokens defeat the purpose.
2. **Extract by category, with the value, its name in the source and its documented use:**
   - colour: brand primary and accent with their variants, semantic colours, the neutral scale and its tone, surfaces (background, foreground, card, overlay, border);
   - typography: families with full fallback stacks, the sizes actually used, only the weights that are loaded, line heights, letter spacing, named text styles;
   - spacing: the scale in use, and separate inset, inline and block scales where the source has them;
   - radii and the elevation scale with full shadow values;
   - when present: z-index, durations and easings, breakpoints, container widths.
3. **Write the tokens file** in the source's own format and naming (CSS custom properties, typed exports, JSON, a framework configuration extension), grouped by category. Then list the sources used, the categories extracted, the token sets the source does not define, and the near-duplicates or off-scale values found.
4. **Choose the surface** for the inventory (one file, a flow, the project; a recorded `prototype_file` qualifies) and read all of it.
5. **Walk it section by section.** An element is a component candidate when its pattern appears more than once, could reasonably appear elsewhere, has variants or has states. Group candidates as foundations (tokens), atoms, molecules, organisms and templates.
6. **Document each component and the gaps:**
   - name, one-sentence purpose, variants and sizes, states (default, hover, active, focus, disabled, loading as they apply);
   - tokens used, composition from other components, accessibility notes (keyboard, ARIA, contrast), at least one do and one don't;
   - then the gaps: near-identical styles where one should serve, with a recommended canonical one; missing states; missing variants; values off the scale.
   Write one section per component in a document a developer can take over.
7. **Record** `design_tokens` (file, categories, gaps, inconsistencies) and `component_inventory` (file, components by category, gaps).

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return both output keys as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **Never guess a value.** Several slightly different blues, or neutrals on two tones, are findings for the user: do not merge them silently. A token set the source lacks is the user's decision: do not fill it.
- A value read from a screenshot is a measurement from an image: mark it as approximate.
- **Existing files stay.** Never overwrite a tokens or theme file of the project, or a `design-system/**/MASTER.md` written by `design-guidance`: write a new file or ask.
- Pages are arrangements of components: a page changed in place again and again signals a missing component.
- Rendering a visual page of the library is optional and uses a plain grid; the source's canvas starter is not packaged.
- Full methods: `<CD>/skills/design-system-extract.md` and `<CD>/skills/component-extract.md`. Nothing is installed.

## Checks

- **values_traced_to_source**: every token names the file, page or image it was read from; image-derived values are marked approximate.
- **gaps_not_filled**: token sets and component variants the source does not define are listed as open, not invented.
- **inconsistencies_reported**: near-duplicate values and off-scale outliers are listed with their locations.
- **inventory_complete_per_component**: each component has purpose, variants, states, tokens, composition, accessibility notes and a do and a don't; not applicable to a token-only request.
- **existing_files_not_overwritten**: no existing tokens, theme or design-system file was replaced without the user's request.

## Sources

- AI intent mapping: design-system-extract → ui.token-extraction (its four phases); component-extract → ui.component-inventory (its five phases); system prompt chapter 13 ("System thinking": components, tokens, documented patterns) and chapter 4 (read the source, lift exact values) support both.
- Source: claude-design-system-prompt (Trystan-SA/claude-design-system-prompt@3c3ddb07, head; commit `3c3ddb07d7aa3fef051d83608596470c95cfd8fe`, pin `head`) — `claude/skills/design-system-extract.md`, `claude/skills/component-extract.md`, packaged under `<package_root>/scripts/claude-design-system-prompt/`; `claude/system-prompt.md` chapters 4 and 13, read at intake only and not packaged (`intake_only_paths`: its rules are restated in this body).
- Provenance: the upstream README describes the repository as a "Reverse-engineered system prompt of Claude Design from Anthropic" (README.md is excluded from the selection and was not read at intake; the fact comes from the intake brief). The method is restated here, not copied.
- Not adopted: the `design_canvas.jsx` starter; the skills' closing suggestions of which skill to run next, kept only as advice to the user. Adaptation, a Muro choice: the approximate mark on image-derived values and the no-overwrite rule.
- Runtime dependency: none. Hooks: the selected files define none; `codex/**` and `README.md` are excluded and were not inspected.
- Harmonized by: prompts/harmonizer.md (2026-11-12) — the two skills are one role with two intents: component-extract's first category is the tokens of design-system-extract, and chapter 13 treats tokens, components and their documentation as one system. Distinct from `design-guidance` (recommends a system from packaged data) and from `figma-design` (builds foundations inside Figma, and reads `design_tokens` when recorded).
