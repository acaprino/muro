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

Builds or updates a design inside Figma with real variables, text styles, auto layout and components. It starts from what the file already has and applies a recorded visual direction when one exists. Does not assume a Figma integration exists.

## Behavior

1. **Check integration first.** Before any `use_figma` call, verify that Figma MCP and `figma-use` are available. If unavailable, report that limitation and **do not simulate** Figma changes, screenshots or completed screens.
2. **Check the file.** List local variable collections and text styles and search the file's libraries for variables, styles and components. Reuse what exists before creating anything. Do not move or delete existing user layers without approval.
3. **Read the direction.** If `recorded_outputs` (or `<state_dir>/map.md ## Outputs`) holds `palette`, `typography`, `layout`, `constraints`, `offer` and `page_outline` from `visual-direction`, apply them; a recorded `aesthetic_direction` (a look committed for a product with no brand) or `design_tokens` (values extracted from the product) supplies the foundation values the same way. A landing page with no recorded or supplied outline should have reached this step after `visual-direction` (declared in `needs`, judged by the classifying AI); if it did not, do not plan its sections: report that the landing strategy is missing.
4. **Set up foundations if missing** and record them in `foundations`: color variables with light and dark modes (semantic tokens over raw palette values), text styles, spacing and radius variables, and a Foundations frame whose samples are bound to the variables.
5. **Plan components** in `component_map`: names, variants, component properties, responsive behavior and states (Default, Hover, Pressed, Focus, Disabled; Error and Filled where relevant).
6. **Build screens section by section** and record them in `screen_plan`: hero first, then one section at a time, every frame in auto layout with bound padding and gaps. Take and inspect a screenshot after each section before the next.
7. **Evaluate:** body text contrast at least 4.5:1, large text and UI at least 3:1, touch targets at least 44px, a 1440px desktop frame, 768px and 390px frames when the screen needs responsive versions, meaningful layer names and real copy.

## Output handoff

Return `foundations`, `component_map` and `screen_plan` as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **Typography:** use the font the user or brand names, after checking it with `figma.listAvailableFontsAsync()`. One typeface per file unless a pair is asked for; a pairing recorded by `visual-direction` counts as that request and is kept. Sizes follow the source's Tailwind type scale unless a recorded direction sets its own scale.
- **Color:** token names and structure follow the source's fixed set; hex values follow the brand or the recorded palette. No background gradients. The source's one exception, a gradient on the hero heading text, is not used when a recorded direction rules gradients out.
- No eyebrow tag above a heading unless the user asks or an uploaded inspiration shows one.
- Use real SVG icons at one stroke weight and components for repeated elements. Never invent facts, proof, reviews or client branding.

## Checks

- **foundations_bound**: token collections, text styles, Foundations samples and light/dark variable modes are bound and synchronized.
- **states_complete**: interactive components expose all relevant variants and properties; no dead controls.
- **contrast_checked**: measured contrast meets the stated thresholds, including the lightest text stop.
- **responsive_checked**: the frames that were built have no overflow, unnamed layers, missing copy or unsupported effects.

## Sources

- AI intent mapping: figma-designer → ui.figma-design, from its workflow, foundations, typography, color, component, layout and evaluation sections.
- Source: ai-design-skills (elayadesign/ai-design-skills@456d9e0d) — `skills/figma-designer/SKILL.md`, packaged under `<package_root>/scripts/ai-design-skills/skills/figma-designer/`.
- Runtime dependency: the Figma MCP and figma-use integration of the host (not bundled; it needs the user's account, so it is never installed by this step, ADR-0007).
- Hooks: the selected file defines none; `assets/**`, `scripts/**`, `tests/**` and `.github/**` are excluded and were not inspected for hooks.
- Harmonization 2026-11-12 (claude-design-system-prompt intake): `aesthetic_direction` and `design_tokens` are added to `reads`, so a Figma file follows a direction committed outside Figma or the tokens extracted from the product. Data flow only, no prerequisite.
- Harmonized by: prompts/harmonizer.md (2026-11-10 re-harmonization) — no prerequisite: the source starts from the existing file and sets up foundations only if missing, with its own fixed token system. Its one dependency is landing-page-design for landing pages ("ask the user for it before planning sections"), which is the landing strategy of `visual-direction`: the runtime AI selects it for a new landing page, and step 3 stops section planning without it. The earlier mandatory 768/390 frames are scoped to screens that need responsive versions, as the source says.
