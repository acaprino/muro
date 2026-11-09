---
id: visual-direction
role: art-direction
when: intent:ui
after: []
outputs: ["palette", "typography", "layout", "constraints"]
checks: ["palette_applied", "typography_consistent", "layout_matches_direction", "no_gradient_or_ornament"]
---

# Visual Direction (Art Direction)

Establishes the visual direction for web pages and UI screens: layout composition, type system, color palette, and hard constraints derived from the subject's own material.

## Behavior

1. **Inventory** — Extract what only this client has: name, meaning, street, numbers, constraint, materials, hours, photographs.
2. **Deal Directions** — Run `scripts/taste-skill/start.mjs` (from taste-skill) to deal 3 of 20 researched directions. Each direction includes: hero composition, section compositions, type system, palette, photographs, motion hints, and studied references.
3. **Select Direction** — Pick the one direction that carries something from the inventory. The script then deals the rest: type system, palette, hero/section blueprints.
4. **Record** — Write outputs to `.muro/map.md ## Outputs`:
   - `palette`: hex colors (background, foreground, accent)
   - `typography`: font families, weights, scale
   - `layout`: hero composition, section grid, edge alignment
   - `constraints`: anti-slop rules (no gradients, max 2-line headlines, no thin rules, no orphan labels, equal left/right edges)

## Anti-Slop House Rules (from taste-skill)

- Headlines ≤ 2 lines, no eyebrow labels, no monospace for body
- No 01/02/03 numbering, no thin rules, no gradients, no resting shadows
- No cream-and-terracotta, no violet as primary accent
- Equal left/right edges; one motion accent per view
- Real photographs of the subject's world (or honest code drawings)
- Focal point on every screen; no empty screens; no text covered/cut

## Specifics

- If the project already has a design system, use its tokens as constraints rather than generating new ones.
- For app screens (dashboards, settings, inboxes): apply the same principles — type scale, real data density, no orphan labels.

## Checks

- **palette_applied**: accent color appears on primary CTA and motion trigger elements.
- **typography_consistent**: all headlines use the chosen font/scale; no fallback monospace.
- **layout_matches_direction**: hero and section composition follow the chosen blueprint.
- **no_gradient_or_ornament**: grep for banned patterns returns zero hits.

## Sources

- Source: taste-skill (taste-skill@f6b76575) — `skills/taste-skill/SKILL.md`, `references/system.md`, `references/sections.md`, `references/layout-v4.md`, `references/copy.md`, `library/type.json`, `library/palettes.json`
- Scripts adapted: `scripts/taste-skill/start.mjs` (deals directions), `scripts/taste-skill/shoot.mjs` (captures screenshots)
- Harmonized by: prompts/harmonizer.md — extracted anti-slop rules into explicit constraints; removed asset downloaders (photos.mjs) per license gate