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

The packaged original is the method, in the source's own words. Read `<FD>/SKILL.source.md` whole before working, and its "Token reference" "before you create or bind any variable or text style". The steps below are an index into it. Where this body and the original differ, the original wins, except for the changes listed under Sources, "Changes for coexistence (ADR-0017)".

1. **Check integration first.** Before any `use_figma` call, verify that Figma MCP and `figma-use` are available. If unavailable, report that limitation and **do not simulate** Figma changes, screenshots or completed screens. Then, as the source says: "Load `figma-use` before any `use_figma` call." "For full screens and pages, also load `figma-generate-design`. For component libraries and tokens, also load `figma-generate-library`."
2. **Check the file first** ("Workflow" 1). "List local variable collections and text styles, and search the file's libraries (`search_design_system`) for variables, styles and components. Reuse what exists before creating anything." "Don't delete or move the user's existing layers unless asked."
3. **Read the direction.** If `recorded_outputs` (or `<state_dir>/map.md ## Outputs`) holds `palette`, `typography`, `layout`, `constraints`, `offer` and `page_outline` from `visual-direction`, apply them; a recorded `aesthetic_direction` (a look committed for a product with no brand) or `design_tokens` (values extracted from the product) supplies the foundation values the same way. A landing page with no recorded or supplied outline should have reached this step after `visual-direction` (declared in `needs`, judged by the classifying AI); if it did not, do not plan its sections: report that the landing strategy is missing.
4. **Set up foundations if missing** ("Workflow" 2) and record them in `foundations`. "Create everything below before you build any screen": "the `spacing` and `radius` variables", "the two color layers (`Core Colors`, then `Color System` with Light and Dark modes)", "the text styles". "Light and dark are variable modes, never two sets of hardcoded colors." Place the `Foundations` frame, bind its samples and keep its labels in sync as that step says.
5. **Plan components** ("Components and states") in `component_map`: names, variants, component properties, responsive behavior and states. "Interactive components get variants for Default, Hover, Pressed, Focus, Disabled. Inputs also get Error and Filled." Buttons are one component set, "every combination present (25 variants per size)". "Data views get Loading (a skeleton shaped like the real layout), Empty (a composed getting-started view) and Error states."
6. **Build section by section** ("Workflow" 3 to 5) and record the screens in `screen_plan`. "Do the hero first, then one section per step. Never build a whole page in one pass. Screenshot after each section and fix it before moving on." "Every frame with children uses auto layout. Padding and gap are bound to spacing variables, never typed numbers." "Bind designs to `Color System` tokens only, never to `Core Colors` directly."
7. **Self check before finishing** ("Workflow" 6): "Run the checklist at the end of this file, fix every failure, then report what was built and what was skipped." The checklist is "Checklist (run before reporting)"; its numbers are in "Contrast and accessibility" and "Layout": "Body text: at least 4.5:1 against its background", large text and UI parts "at least 3:1", "Touch targets are at least 44 × 44 on mobile frames", "Desktop frames are 1440 wide, with a centered content container of 1200 to 1280", "Add 768 and 390 frames when the screen needs responsive versions."

## Output handoff

Return `foundations`, `component_map` and `screen_plan` as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **A recorded direction is a committed system.** The source fixes token names, structure, spacing and radius values and says "The hex values follow the user's brand": hex values follow the brand or the recorded `palette`, `aesthetic_direction` or `design_tokens`. Where a recorded direction sets what the source also fixes, the recorded value is kept: a type pairing recorded by `visual-direction` counts as the user asking for a pair ("One typeface per file unless the user asks for a pair"); a type scale recorded with the direction replaces "Sizes come from the Tailwind type scale only"; the hero heading gradient ("the one gradient exception") is not used when the recorded direction rules gradients out. Everything the recorded direction does not set follows the original.
- **Landing pages.** The source's "Landing pages" section sends the work to the user's `landing-page-design` skill and says "If that skill isn't available, ask the user for it before planning sections." In this package that skill is the landing strategy of `visual-direction`: its recorded `offer` and `page_outline` are the page structure and copy (step 3). Their facts and proof are used as recorded and none is added. The "mandatory large tagline section" is built only when the recorded or supplied outline has one.
- Everything else (typography, spacing, corner radius, color, contrast, layout, icons, motion, content, file hygiene) is in the original and is not restated here.

## Checks

- **foundations_bound**: token collections, text styles, Foundations samples and light/dark variable modes are bound and synchronized.
- **states_complete**: interactive components expose all relevant variants and properties; no dead controls.
- **contrast_checked**: measured contrast meets the stated thresholds, including the lightest text stop.
- **responsive_checked**: the frames that were built have no overflow, unnamed layers, missing copy or unsupported effects.

## Sources

- AI intent mapping: figma-designer → ui.figma-design, from its workflow, foundations, typography, color, component, layout and evaluation sections.
- Source: ai-design-skills (elayadesign/ai-design-skills@456d9e0d) — `skills/figma-designer/SKILL.md`, packaged as `<package_root>/scripts/ai-design-skills/skills/figma-designer/SKILL.source.md` and read there at run time.
- Changes for coexistence (ADR-0017):
  - The source's frontmatter (name, description with "Use this skill whenever" and "Load it before writing any use_figma code") is not carried: the coordinator classifies by meaning and a packaged original is not a registered skill.
  - Step 1 adds an availability check and "do not simulate": without the host's Figma integration no supported host can run the source's steps, and a step must not report work it did not do.
  - The source's "Landing pages" section is served by `visual-direction` (the `needs` entry) instead of a separate `landing-page-design` skill, and "ask the user for it" becomes a report that the landing strategy is missing: landing-page-design is absorbed into `visual-direction`, and activation belongs to the coordinator.
  - The tagline section with a word-by-word reveal is built only when the outline has one: `visual-direction` owns `page_outline` and does not apply landing-page-design B11.
  - A recorded `typography`, `palette`, `aesthetic_direction` or `design_tokens` keeps its pairing, its scale and its rule on gradients against the source's one typeface, Tailwind scale and hero heading gradient: one owner per output, and later steps do not restyle a committed direction.
  - Facts and proof of a recorded `offer` and `page_outline` are not extended with the source's "believable names, brands and numbers": `visual-direction` owns them under its check `proof_supported`.
  - The source's closing report ("report what was built and what was skipped") is returned through the output handoff: the coordinator is the only writer of the map.
- Runtime dependency: the Figma MCP and figma-use integration of the host (not bundled; it needs the user's account, so it is never installed by this step, ADR-0007).
- Hooks: the selected file defines none; `assets/**`, `scripts/**`, `tests/**` and `.github/**` are excluded and were not inspected for hooks.
- Harmonization 2026-11-12 (claude-design-system-prompt intake): `aesthetic_direction` and `design_tokens` are added to `reads`, so a Figma file follows a direction committed outside Figma or the tokens extracted from the product. Data flow only, no prerequisite.
- Harmonized by: prompts/harmonizer.md (2026-11-10 re-harmonization) — no prerequisite: the source starts from the existing file and sets up foundations only if missing, with its own fixed token system. Its one dependency is landing-page-design for landing pages ("ask the user for it before planning sections"), which is the landing strategy of `visual-direction`: the runtime AI selects it for a new landing page, and step 3 stops section planning without it. The earlier mandatory 768/390 frames are scoped to screens that need responsive versions, as the source says.
