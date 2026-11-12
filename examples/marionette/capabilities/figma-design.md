---
id: figma-design
role: figma-design
tools: [{"name":"figma-mcp","purpose":"Inspect and edit real Figma variables, components and frames; map to the available Figma MCP/figma-use integration.","required":true},{"name":"image-inspection","purpose":"Inspect screenshots of the actual Figma result.","required":true}]
hooks: []
conflicts: []
reads: ["palette", "typography", "layout", "constraints", "offer", "page_outline", "aesthetic_direction", "design_tokens"]
needs: [{"capability": "visual-direction", "label": "only landing without outline", "when": "The Figma work is a new landing page (or its sections) and no page outline and offer are recorded or supplied by the user. Not for components, app screens, design-system work or edits to an existing page.", "reason": "Landing sections are planned from the offer and page outline that visual-direction's landing strategy produces; without them this step would have to stop."}]
when: —
intents: [{"id":"ui.figma-design","description":"Create or update a design inside a Figma file using real variables, text styles, auto layout, reusable components, interaction states and responsive frames, reusing what the file already has. A new landing page in Figma with no recorded or supplied outline has visual-direction as a conditional prerequisite (see `needs`).","excludes":["Mentioning Figma as a reference does not request editing a Figma file.","Do not claim execution without an available Figma integration."]}]
after: []
outputs: ["foundations", "component_map", "screen_plan"]
checks: ["foundations_bound", "states_complete", "contrast_checked", "responsive_checked"]
---

# Figma Design

Builds or updates a design inside Figma with real variables, text styles, auto layout and components. It starts from what the file already has and applies a recorded visual direction when one exists. Does not assume a Figma integration exists. `<FD>` below stands for `<package_root>/scripts/ai-design-skills/skills/figma-designer`.

## Behavior

`<FD>/SKILL.source.md` is the full version of this method. Open the section a step names when the work reaches it. Where this body and the original differ, the original wins, except for the changes listed under Sources.

1. **Check integration first.** Before any `use_figma` call, verify that Figma MCP and `figma-use` are available. If unavailable, report that limitation and **do not simulate** Figma changes, screenshots or completed screens. Load `figma-use` before any `use_figma` call; for full screens and pages also load `figma-generate-design`, for component libraries and tokens also `figma-generate-library`.
2. **Check the file first.** List local variable collections and text styles, and search the file's libraries (`search_design_system`) for variables, styles and components. Reuse what exists before creating anything. Do not delete or move the user's existing layers unless asked.
3. **Read the direction.** If `recorded_outputs` (or `<state_dir>/map.md ## Outputs`) holds `palette`, `typography`, `layout`, `constraints`, `offer` and `page_outline` from `visual-direction`, apply them; a recorded `aesthetic_direction` (a look committed for a product with no brand) or `design_tokens` (values extracted from the product) supplies the foundation values the same way. A landing page with no recorded or supplied outline should have reached this step after `visual-direction` (declared in `needs`, judged by the classifying AI); if it did not, do not plan its sections: report that the landing strategy is missing.
4. **Set up foundations if missing,** before any screen, and record them in `foundations`: the `spacing` and `radius` variables, the two color layers (`Core Colors`, then `Color System` with `Light` and `Dark` modes) and the text styles. Light and dark are variable modes, never two sets of hardcoded colors. Before creating or binding any variable or text style, open "Token reference" (names and values are fixed; only hex values follow the brand) and, for what you create, "Typography", "Spacing", "Corner radius" and "Color". Then place the `Foundations` frame with bound samples and synced labels as "Workflow" step 2 says.
5. **Plan components** in `component_map`: names, variants, component properties, responsive behavior and states. Anything used more than once is a component. Interactive components get Default, Hover, Pressed, Focus and Disabled variants; inputs also Error and Filled. Buttons are one component set with every `Type` and `State` combination (25 variants per size). Data views get Loading (a skeleton shaped like the real layout), Empty (a composed getting-started view) and Error states. Open "Components and states" for property values and token bindings, "Icons" when icons are used.
6. **Build section by section** and record the screens in `screen_plan`: the hero first, then one section per step, never a whole page in one pass; screenshot after each section and fix it before moving on. Every frame with children uses auto layout. Bind every fill, stroke, radius, padding and gap to a variable, never a typed number; every text layer uses a text style; designs bind to `Color System` tokens only, never to `Core Colors`. Desktop frames are 1440 wide with a centered container of 1200 to 1280; add 768 and 390 frames when the screen needs responsive versions. Open "Layout" for the other layout rules, "Content" for copy, "File hygiene" for layer names, pages and placement, and "Motion (prototype only)" for a prototype interaction.
7. **Self check before finishing.** Run "Checklist (run before reporting)", fix every failure, then report what was built and what was skipped. From "Contrast and accessibility": body text at least 4.5:1, large text and UI parts at least 3:1, a gradient heading checked at its lightest end, touch targets at least 44 × 44 on mobile frames.

## Output handoff

Return `foundations`, `component_map` and `screen_plan` as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **A recorded direction is a committed system.** The source fixes token names, structure and the spacing, radius and type values, and lets hex values follow the brand: they follow the recorded `palette`, `aesthetic_direction` or `design_tokens`. Where a recorded direction sets what the source also fixes, the recorded value is kept: a recorded type pairing counts as the user asking for a pair (the source allows one typeface per file unless the user asks for a pair); a recorded type scale replaces the Tailwind-only sizes; the hero heading gradient, the source's one gradient exception, is not used when the direction rules gradients out. Everything the direction does not set follows the original.
- **Landing pages.** The source sends landing work to the user's `landing-page-design` skill. In this package that is the landing strategy of `visual-direction`: its recorded `offer` and `page_outline` are the page structure and copy (step 3), used as recorded with no fact or proof added. The source's mandatory large tagline section is built only when the recorded or supplied outline has one.

## Checks

- **foundations_bound**: token collections, text styles, Foundations samples and light/dark variable modes are bound and synchronized.
- **states_complete**: interactive components expose all relevant variants and properties; no dead controls.
- **contrast_checked**: measured contrast meets the stated thresholds, including the lightest text stop.
- **responsive_checked**: the frames that were built have no overflow, unnamed layers, missing copy or unsupported effects.

## Sources

- AI intent mapping: figma-designer → ui.figma-design, from its workflow, foundations, typography, color, component, layout and evaluation sections.
- Source: ai-design-skills (elayadesign/ai-design-skills@456d9e0d) — `skills/figma-designer/SKILL.md`, packaged as `<package_root>/scripts/ai-design-skills/skills/figma-designer/SKILL.source.md`.
- Changes for coexistence (ADR-0017):
  - The source's frontmatter ("Use this skill whenever", "Load it before writing any use_figma code") is not carried as activation: the coordinator classifies by meaning.
  - Step 1 adds an availability check and "do not simulate": without the host's Figma integration no host can run the source's steps, and a step must not report work it did not do.
  - "Landing pages" is served by `visual-direction` (the `needs` entry) instead of a separate `landing-page-design` skill, and "ask the user for it" becomes a report that the landing strategy is missing: that skill is absorbed into `visual-direction`, and activation belongs to the coordinator.
  - The tagline section with a word-by-word reveal is built only when the outline has one: `visual-direction` owns `page_outline` and does not apply landing-page-design B11.
  - A recorded `typography`, `palette`, `aesthetic_direction` or `design_tokens` keeps its pairing, its scale and its rule on gradients against the source's one typeface, Tailwind scale and hero heading gradient: one owner per output.
  - Facts and proof of a recorded `offer` and `page_outline` are not extended with the source's "believable names, brands and numbers": `visual-direction` owns them under its check `proof_supported`.
  - The closing report ("report what was built and what was skipped") is returned through the output handoff: the coordinator is the only writer of the map.
- Runtime dependency: the Figma MCP and figma-use integration of the host (not bundled; it needs the user's account, so it is never installed by this step, ADR-0007).
- Hooks: the selected file defines none; `assets/**`, `scripts/**`, `tests/**` and `.github/**` are excluded and were not inspected for hooks.
- Harmonization 2026-11-12 (claude-design-system-prompt intake): `aesthetic_direction` and `design_tokens` are added to `reads`, so a Figma file follows a direction committed outside Figma or the tokens extracted from the product. Data flow only, no prerequisite.
- Harmonized by: prompts/harmonizer.md (2026-11-10 re-harmonization) — no prerequisite: the source starts from the existing file and sets up foundations only if missing, with its own fixed token system. Its one dependency is landing-page-design for landing pages ("ask the user for it before planning sections"), which is the landing strategy of `visual-direction`: the runtime AI selects it for a new landing page, and step 3 stops section planning without it. The earlier mandatory 768/390 frames are scoped to screens that need responsive versions, as the source says.
