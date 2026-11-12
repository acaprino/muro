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

0. **Scope by the selected intent, then read its originals whole before working.** Tokens are steps 1 to 3 and `<CD>/skills/design-system-extract.md`; the inventory is steps 4 to 6 and `<CD>/skills/component-extract.md`; record the output not asked for as `not requested`. For both, read in `<CD>/system-prompt.md` these chapters and only these: `# 4. Rooting designs in existing context` and `# 13. System thinking`. These files are the method in the source's own words, and the steps below are an index into them. Where this body and an original differ, the original wins, except for the changes listed under `## Sources` → "Changes for coexistence".
1. **Identify the sources (design-system-extract, Phase 1).** "The user may provide a codebase (read theme files: `theme.ts`, `tokens.css`, `_variables.scss`, `tailwind.config.js`, design system source), a live site or screenshots, a brand guide (PDF, Figma, doc), or an existing UI kit project. If unspecified, ask — invented tokens defeat the point." A recorded `aesthetic_direction` is also a source.
2. **Extract by category (Phase 2).** "Capture concrete values from the source — never guess." The categories and what to capture in each are the sections "Colors", "Typography", "Spacing", "Radii and shadows" and "Other tokens, if present" of the skill file. For each colour: "the hex (or oklch) value, its name in the source, and its documented usage."
3. **Emit the tokens file and document the findings (Phases 3 and 4).** "Write a `tokens.css` — or match the source's format and naming convention (`tokens.ts` with typed exports, `tokens.json`, a Tailwind config extension). Group by category with clear names", as in the skill file's example. Then "Summarize: **sources used**; **categories extracted**; **gaps** — token sets the source doesn't define (these are the user's decisions to make; don't fill them silently); **inconsistencies** — near-duplicate values or off-scale outliers worth consolidating; **recommended next steps** — typically review the file with the user, then use it in subsequent designs."
4. **Identify the surface (component-extract, Phase 1).** "Determine what to walk — a single design file, a multi-page flow, or a whole project. Read all relevant files and build a mental model of the visual vocabulary in use." A recorded `prototype_file` qualifies.
5. **Walk the design and inventory (Phase 2).** "Section by section, for each visual element ask:" "**Does this exact pattern appear more than once?**", "**Could it reasonably appear elsewhere?**", "**Does it have variants?**", "**Does it have states?**" "Yes to any → component candidate." Group the findings into the skill file's categories, with the members it lists for each: "Foundational", "Atoms", "Molecules", "Organisms", "Templates".
6. **Document each component, the gaps, and emit (Phases 3 to 5).**
   - Per component: "**Name**", "**Purpose**", "**Variants** and **sizes**", "**States** — default, hover, active, focus, disabled, loading (whichever apply)", "**Tokens used**", "**Composition**", "**Accessibility notes** — keyboard support, ARIA, contrast", "**Do / Don't** — at least one of each". Chapter 13, "Document patterns", gives the same format.
   - The gaps, "part of the deliverable": "**Inconsistencies** — three slightly-different button styles where one should serve; recommend a canonical version", "**Missing states** — hover without focus, no disabled state", "**Missing variants** — e.g., delete actions in the design but no destructive button", "**Off-scale values** — spacing or sizes outside the established token scale; snap them".
   - "Write the inventory to a file (e.g., `component-inventory.md`), one section per component, structured as above — a doc the user can hand to a developer." Then the summary and the suggested next steps of Phase 5, as outcomes the user can ask for (tokens if not already extracted, the library as real code, a polish pass on the components, live tweak controls on the library).
7. **Record** `design_tokens` (file, categories, gaps, inconsistencies) and `component_inventory` (file, components by category, gaps).

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return both output keys as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **Never guess a value.** "Flag inconsistencies — multiple slightly different blues, neutrals on different tones — as findings for the user. Don't silently merge them; the inconsistency itself is information." A token set the source lacks is one of "the user's decisions to make; don't fill them silently". Chapter 4: "Lift exact hex codes, spacing values, and font stacks."
- **Existing files stay.** Never overwrite a tokens or theme file of the project, or a `design-system/**/MASTER.md` written by `design-guidance`: write a new file or ask.
- "**Pages are arrangements of components.** Extracting them turns a pile of one-offs into something maintainable." (component-extract; chapter 13: "**Design components, not pages.**")
- "Optionally render a "component library" page showing each component with its variants and states": the source's canvas starter for the grid is not packaged, so the page uses a plain grid written here.
- Nothing is installed.

## Checks

- **values_traced_to_source**: every token names the file, page or image it was read from; image-derived values are marked approximate.
- **gaps_not_filled**: token sets and component variants the source does not define are listed as open, not invented.
- **inconsistencies_reported**: near-duplicate values and off-scale outliers are listed with their locations.
- **inventory_complete_per_component**: each component has purpose, variants, states, tokens, composition, accessibility notes and a do and a don't; not applicable to a token-only request.
- **existing_files_not_overwritten**: no existing tokens, theme or design-system file was replaced without the user's request.

## Sources

- AI intent mapping: design-system-extract → ui.token-extraction (its four phases); component-extract → ui.component-inventory (its five phases); system prompt chapter 13 ("System thinking": components, tokens, documented patterns) and chapter 4 (read the source, lift exact values) support both.
- Source: claude-design-system-prompt (Trystan-SA/claude-design-system-prompt@3c3ddb07, head; commit `3c3ddb07d7aa3fef051d83608596470c95cfd8fe`, pin `head`) — `claude/skills/design-system-extract.md`, `claude/skills/component-extract.md` and `claude/system-prompt.md` (chapters 4 and 13), packaged under `<package_root>/scripts/claude-design-system-prompt/` and read at run time (step 0).
- Provenance: the upstream README describes the repository as a "Reverse-engineered system prompt of Claude Design from Anthropic" (README.md is excluded from the selection and was not read at intake; the fact comes from the intake brief).
- Changes for coexistence (ADR-0017):
  - The skills' "Use this when ..." lines and trigger phrases ("make it a system", "build a component library") are not followed: the coordinator classifies by meaning.
  - "Write a `tokens.css`" and "Write the inventory to a file": an existing tokens or theme file of the project, or a `design-system/**/MASTER.md` of `design-guidance`, is never overwritten (shared file with another writer; one owner per output). A new file is written, or the user is asked.
  - "(the `design_canvas.jsx` starter works for the grid)": the starter is a tool of the source's host and is not in the selected snapshot; the optional library page uses a plain grid.
  - "(see `design-system-extract` for token-level detail)" and the next steps of component-extract Phase 5 ("`design-system-extract` for tokens if not already done, ... `polish-pass` on the components, or `make-tweakable` on the library") name the source's skills: here the token detail is the other intent of this same capability, and the next steps are told to the user as outcomes (`design-review`, `design-options` are the capabilities that deliver them, each selected by the coordinator in its own step). This step does not invoke them.
  - Chapter 4, "and then invoke the Frontend Design skill for guidance on committing to a bold aesthetic": not followed here. This capability records what exists and designs nothing; a new look is the `aesthetic-direction` capability.
  - A recorded `aesthetic_direction` and a recorded `prototype_file` are accepted as source and surface: outputs of other capabilities reach this step through the coordinator.
  - Not required by a collision, kept as this package's evidence check and open for the owner: `values_traced_to_source` asks that a value read from an image be marked approximate. The source lists screenshots as a source and says "never guess"; it has no such mark.
  - Not read and not applied (dropped in `delivery.json`): every chapter of the prompt other than 4 and 13, including the designer persona (the lines before chapter 1, chapter 1, the `# Final principle`), the confidentiality paragraph of chapter 1, the conversation conduct at the end of chapter 2 and chapter 20, the source's own routing of its skills.
- Not adopted: the `design_canvas.jsx` starter; the skills' closing suggestions of which skill to run next, kept only as advice to the user.
- Runtime dependency: none. Hooks: the selected files define none; `codex/**` and `README.md` are excluded and were not inspected.
- Harmonized by: prompts/harmonizer.md (2026-11-12) — the two skills are one role with two intents: component-extract's first category is the tokens of design-system-extract, and chapter 13 treats tokens, components and their documentation as one system. Distinct from `design-guidance` (recommends a system from packaged data) and from `figma-design` (builds foundations inside Figma, and reads `design_tokens` when recorded). Re-read against the originals on 2026-11-12 (ADR-0017): the restated method was replaced by the source's own words and pointers to the packaged files.
