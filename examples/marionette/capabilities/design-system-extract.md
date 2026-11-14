---
id: design-system-extract
role: design-system-extraction
when: —
after: []
outputs: ["design_tokens", "component_inventory"]
checks: ["values_traced_to_source", "gaps_not_filled", "inconsistencies_reported", "inventory_complete_per_component", "existing_files_not_overwritten"]
intent_checks: {"ui.token-extraction": ["values_traced_to_source", "gaps_not_filled", "inconsistencies_reported", "existing_files_not_overwritten"], "ui.component-inventory": ["gaps_not_filled", "inconsistencies_reported", "inventory_complete_per_component", "existing_files_not_overwritten"]}
intents: [{"id":"ui.token-extraction","description":"Extract the design tokens that an existing brand, codebase, live site, set of screenshots or UI kit actually uses (colour, typography, spacing, radii, shadows and whatever else it defines) into a structured tokens file in the source's own format, reporting gaps and inconsistencies instead of filling them.","excludes":["Recommending or inventing a design system for a product that has none is design guidance or aesthetic direction.","Creating variables and styles inside a Figma file is Figma work.","Refactoring a codebase to use the tokens is an engineering change."]},{"id":"ui.component-inventory","description":"Walk a finished design, page, flow or project and document the reusable components in it (purpose, variants, sizes, states, tokens used, composition, accessibility notes, do and don't), with the inconsistencies, missing states and off-scale values that stand between it and a real system.","excludes":["Building the component library as production code is an engineering change.","Planning or building components inside a Figma file is Figma work.","A review of how well components are implemented in code."]}]
tools: [{"name":"file-access","purpose":"Read theme, token, style and design files, and write the tokens file and the inventory document in the project.","required":true},{"name":"image-inspection","purpose":"Read colours, type and spacing from screenshots or a brand guide supplied as images.","required":false},{"name":"browser","purpose":"Read computed styles from a live site the user names. The request leaves the machine.","required":false}]
hooks: []
conflicts: []
reads: ["aesthetic_direction", "prototype_file"]
---

# Design System Extract (tokens and component inventory)

Turns what a design already contains into a system others can build on: a tokens file with the real values, and a documented inventory of the components hidden in the pages. It records what is there; it does not design. `<CD>` below stands for `<package_root>/scripts/claude-design-system-prompt/claude`. The full versions are `<CD>/skills/design-system-extract.md` (tokens) and `<CD>/skills/component-extract.md` (inventory): open the section a step names when its detail is needed. The file wins where this body differs, except for the changes listed in the Sources section.

## Behavior

Tokens are steps 1 to 3, the inventory steps 4 to 6; record the output not asked for as `not requested`.

1. **Identify the sources.** A codebase (read its theme files: `theme.ts`, `tokens.css`, `_variables.scss`, `tailwind.config.js`, the design system source), a live site or screenshots, a brand guide (PDF, Figma, doc), an existing UI kit project, or a recorded `aesthetic_direction`. If none is specified, ask: invented tokens defeat the point.
2. **Extract by category.** Capture concrete values from the source and never guess: read the files, not memory, and lift exact hex codes, spacing values and font stacks.
   - Colors: brand primary and accent, semantic, the neutral scale, surfaces. For each: the hex (or oklch) value, its name in the source and its documented usage.
   - Typography: families with full fallback stacks, the sizes actually in use (not a generic scale), only the weights actually loaded, line heights, letter spacing, and named text styles if the source defines them.
   - Spacing: the actual scale in use; separate scales (inset, inline, block, between components) are all captured.
   - Radii and shadows: the corner-radius values and the elevation scale with full CSS values (offset, blur, spread, color, opacity).
   - Other tokens, if present: z-index scale, animation durations and easings, breakpoints, container widths.
   Open `## Phase 2: Extract by category` of the tokens file for the variants and the typical ranges to look for in each category.
3. **Emit the tokens file and report.** Write a `tokens.css`, or match the source's format and naming convention (`tokens.ts` with typed exports, `tokens.json`, a Tailwind config extension), grouped by category with clear names; the layout to follow for a new `tokens.css` is the example under `## Phase 3: Emit the tokens file`. Summarize: sources used; categories extracted; gaps (token sets the source does not define: the user's decisions, never filled silently); inconsistencies (near-duplicate values, off-scale outliers worth consolidating); recommended next steps (typically review the file with the user, then use it in later designs).
4. **Identify the surface.** Decide what to walk: a single design file, a multi-page flow or a whole project (a recorded `prototype_file` qualifies). Read all relevant files and build a picture of the visual vocabulary in use.
5. **Walk the design and inventory.** Section by section, ask of each visual element: does this exact pattern appear more than once? Could it reasonably appear elsewhere? Does it have variants? Does it have states? Yes to any makes it a component candidate. Group the candidates as Foundational (tokens), Atoms, Molecules, Organisms and Templates; the members of each group are listed in `## Phase 2: Walk the design and inventory` of the inventory file.
6. **Document, flag the gaps, emit.**
   - Per component: **Name** (short, conventional, like `Button`, `FormField`); **Purpose** (one sentence on when to use it); **Variants** and **sizes**; **States** (default, hover, active, focus, disabled, loading, whichever apply); **Tokens used**; **Composition** (the components it is built from); **Accessibility notes** (keyboard support, ARIA, contrast); **Do / Don't**, at least one of each.
   - The gaps are part of the deliverable: **inconsistencies** (three slightly different button styles where one should serve: recommend a canonical version); **missing states** (hover without focus, no disabled state); **missing variants** (delete actions in the design but no destructive button); **off-scale values** (spacing or sizes outside the established token scale: snap them).
   - Write the inventory to a file (for example `component-inventory.md`), one section per component in that structure: a document the user can hand to a developer. Optionally render a component library page showing each component with its variants and states. Summarize: components inventoried by category, inconsistencies and gaps flagged, the output file path, the recommended next step; suggest as next steps the tokens if not yet extracted, the library as real code, a polish pass on the components, live tweak controls on the library.
7. **Record** `design_tokens` (file, categories, gaps, inconsistencies) and `component_inventory` (file, components by category, gaps).

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return both output keys as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **Never guess a value, never merge silently.** Multiple slightly different blues, or neutrals on different tones, are findings for the user: the inconsistency itself is information.
- **Existing files stay.** Never overwrite a tokens or theme file of the project, or a `design-system/**/MASTER.md` written by `design-guidance`: write a new file or ask.
- The optional library page uses a plain grid written here; the source's canvas starter for it is not packaged.
- Nothing is installed.

## Checks

- **values_traced_to_source**: every token names the file, page or image it was read from; image-derived values are marked approximate.
- **gaps_not_filled**: token sets and component variants the source does not define are listed as open, not invented.
- **inconsistencies_reported**: near-duplicate values and off-scale outliers are listed with their locations.
- **inventory_complete_per_component**: each component has purpose, variants, states, tokens, composition, accessibility notes and a do and a don't; not applicable to a token-only request.
- **existing_files_not_overwritten**: no existing tokens, theme or design-system file was replaced without the user's request.

## Sources

- AI intent mapping: design-system-extract → ui.token-extraction (its four phases); component-extract → ui.component-inventory (its five phases); system prompt chapter 13 ("System thinking": components, tokens, documented patterns) and chapter 4 (read the source, lift exact values) support both.
- Source: claude-design-system-prompt (Trystan-SA/claude-design-system-prompt@3c3ddb07, head; commit `3c3ddb07d7aa3fef051d83608596470c95cfd8fe`, pin `head`) — `claude/skills/design-system-extract.md` and `claude/skills/component-extract.md`, packaged under `<package_root>/scripts/claude-design-system-prompt/` and opened at run time by section. `claude/system-prompt.md` is not opened by this capability: what it uses of chapter 4 (read the source, lift exact values) and chapter 13 ("Design components, not pages"; its "Document patterns" format is contained in component-extract's Phase 3) is stated in the body.
- Provenance: the upstream README describes the repository as a "Reverse-engineered system prompt of Claude Design from Anthropic" (README.md is excluded from the selection and was not read at intake; the fact comes from the intake brief).
- Changes for coexistence (ADR-0017):
  - The skills' "Use this when ..." lines and trigger phrases ("make it a system", "build a component library") are not followed: the coordinator classifies by meaning.
  - "Write a `tokens.css`" and "Write the inventory to a file": an existing tokens or theme file of the project, or a `design-system/**/MASTER.md` of `design-guidance`, is never overwritten (one owner per output). A new file is written, or the user is asked.
  - "(the `design_canvas.jsx` starter works for the grid)": the starter is a tool of the source's host and is not in the snapshot; the optional library page uses a plain grid.
  - "(see `design-system-extract` for token-level detail)" and the next steps of component-extract Phase 5 name the source's skills (`polish-pass`, `make-tweakable`): the token detail is the other intent of this capability, and the next steps are told to the user as outcomes that `design-review` and `design-options` deliver in their own steps. This step does not invoke them.
  - Chapter 4, "and then invoke the Frontend Design skill": not followed. This capability records what exists and designs nothing; a new look is the `aesthetic-direction` capability.
  - A recorded `aesthetic_direction` and a recorded `prototype_file` are accepted as source and surface: outputs of other capabilities reach this step through the coordinator.
  - Not required by a collision, kept as this package's evidence check and open for the owner: `values_traced_to_source` asks that a value read from an image be marked approximate. The source lists screenshots as a source and says "never guess"; it has no such mark.
- Not adopted: the `design_canvas.jsx` starter; the skills' closing suggestions of which skill to run next, kept only as advice to the user.
- Runtime dependency: none. Hooks: the selected files define none; `codex/**` and `README.md` are excluded and were not inspected.
- Harmonized by: prompts/harmonizer.md (2026-11-12) — the two skills are one role with two intents: component-extract's first category is the tokens of design-system-extract, and chapter 13 treats tokens, components and their documentation as one system. Distinct from `design-guidance` (recommends a system from packaged data) and from `figma-design` (builds foundations inside Figma, and reads `design_tokens` when recorded). Second pass of 2026-11-12: the body is a working procedure that points at the packaged skill files only where a step needs their detail.
