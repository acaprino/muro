---
id: figma-design
role: figma-design
tools: [{"name":"figma-mcp","purpose":"Inspect and edit real Figma variables, components and frames; map to the available Figma MCP/figma-use integration.","required":true},{"name":"image-view","purpose":"Inspect screenshots of the actual Figma result.","required":true}]
hooks: []
conflicts: []
when: —
intents: [{"id":"ui.figma-design","description":"Create or update a Figma design using real variables, text styles, auto layout, reusable components, interaction states and responsive frames.","excludes":["Mentioning Figma as a reference does not request editing a Figma file.","Do not claim execution without an available Figma integration."]}]
after: ["visual-direction"]
outputs: ["foundations", "component_map", "screen_plan"]
checks: ["foundations_bound", "states_complete", "contrast_checked", "responsive_checked"]
---

# Figma Design

Builds a Figma design from the approved visual direction and landing strategy, using real variables, text styles, auto layout and components. Does not assume a Figma integration exists.

## Behavior

1. **Check integration first.** Before any `use_figma` call, verify that Figma MCP and `figma-use` are available. If unavailable, report that limitation and **do not simulate** Figma changes, screenshots or completed screens.
2. **Inspect the file.** Reuse existing local variable collections, text styles and library components before creating anything. Do not move or delete existing user layers without approval.
3. **Create or update foundations.** Record in `foundations`: color variables and modes, text styles, spacing/radius variables, and a bound Foundations frame whose samples update with their variables. Design binds semantic tokens, not raw palette values.
4. **Plan components.** Record in `component_map`: component names, variants, component properties, responsive behavior and state coverage (Default, Hover, Pressed, Focus, Disabled; Error/Filled where relevant).
5. **Plan screens section by section.** Record in `screen_plan`: hero first, then one section at a time. Every frame uses auto layout and bound padding/gaps. Capture and inspect a screenshot after each section before advancing.
6. **Evaluate.** Verify body contrast at least 4.5:1, large text/UI at least 3:1, 44px touch targets, 1440px desktop and 768px/390px responsive frames, meaningful layer names, and real copy.

## Output handoff

Return `foundations`, `component_map` and `screen_plan` as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from `.muro/map.md` only. Do not edit `.muro/map.md` or `.muro/state.json`; the coordinator is their only writer.

## Specifics

- Reuse the visual direction's `offer`, `page_outline`, palette, typography, layout and constraints; do not restyle them independently.
- Apply Figma-specific token/state mechanics to the approved visual-direction outputs and constraints. Preserve its palette and typography; no source gains precedence from its position in the manifest.
- Text uses named styles with the approved families, weights and scale. Do not impose an independent one-typeface rule or replace an approved type pairing.
- Use real SVG icons at one stroke weight and components for repeated elements. Never invent facts, proof, reviews or client branding.
- Do not require a landing-page companion skill: the approved `page_outline` already carries the landing strategy.

## Checks

- **foundations_bound**: token collections, text styles, Foundations samples and light/dark variable modes are bound and synchronized.
- **states_complete**: interactive components expose all relevant variants and properties; no dead controls.
- **contrast_checked**: measured contrast meets the stated thresholds, including the lightest text stop.
- **responsive_checked**: desktop and responsive frames have no overflow, unnamed layers, missing copy or unsupported effects.

## Sources

- Source: ai-design-skills (ai-design-skills@456d9e0d) — `skills/figma-designer/SKILL.md`; token, component, accessibility and responsive methods implement the approved direction; independent font mandates are removed to prevent conflicting typography ownership
