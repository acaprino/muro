---
id: visual-direction
role: art-direction
tools: [{"name":"shell","purpose":"Run approved local design-search and direction helpers.","required":true},{"name":"file-access","purpose":"Inspect project design tokens, artifacts and existing decisions.","required":true},{"name":"browser","purpose":"Inspect rendered output when visual verification is in scope.","required":false}]
hooks: []
conflicts: []
when: —
intents: [{"id":"ui.visual-direction","description":"Define or improve visual composition, typography, palette and layout for web pages or app screens.","excludes":["A motion request does not by itself require redesign.","A static hero does not imply animation."]},{"id":"ui.landing-strategy","description":"Define a landing page offer, audience, primary action, supported proof and conversion-oriented content outline.","excludes":["App screens do not require a sales funnel."]},{"id":"ui.design-guidance","description":"Research local design-system candidates and stack-specific UX and accessibility guidance for the actual product.","excludes":["Search recommendations do not override approved design decisions.","Do not fabricate database matches or infer an implementation stack."]}]
after: []
outputs: ["design_candidates", "stack_guidance", "offer", "page_outline", "palette", "typography", "layout", "constraints"]
checks: ["palette_applied", "typography_consistent", "layout_matches_direction", "no_gradient_or_ornament", "single_primary_action", "proof_supported", "search_domain_fit", "search_stack_fit", "search_empty_disclosed"]
---

# Visual Direction (Art Direction)

Establishes the visual direction for web pages and UI screens: layout composition, type system, color palette, and hard constraints derived from the subject's own material.

## Behavior

0. **Search local design guidance** — Run `<package_root>/scripts/ui-ux-pro-max/scripts/search.py "<product type> <style keywords>" --design-system -p "<project>"`, using no private data in the query. Record `design_candidates` with the returned pattern, style, colors, typography and anti-patterns, and `stack_guidance` only for the detected stack. Use a targeted domain or stack query for focused concerns; retry once with a narrower query when needed. If no match is found, disclose that fallback instead of fabricating a match. Read an existing design-system Master first; never use `--force` or overwrite prior decisions by default.
0.1. **Clarify the requested outcome** — For landing pages, record one `offer` and one primary action, target audience, proof, objections, traffic source and available assets; write `page_outline` with hero copy, benefits, how it works, proof, FAQ and an index/noindex recommendation. For app screens, `offer` records the user goal and `page_outline` the screen regions and states; do not force a sales funnel. Ask only for missing essentials in one batch; otherwise state an assumption and continue. Never invent proof, prices, statistics or testimonials.
1. **Inventory** — Extract what only this client has: name, meaning, street, numbers, constraint, materials, hours, photographs.
2. **Deal Directions** — Run `<package_root>/scripts/taste-skill/scripts/start.mjs` (from taste-skill) to deal 3 of 20 researched directions. Each direction includes: hero composition, section compositions, type system, palette, photographs, motion hints, and studied references.
3. **Select Direction** — Pick the one direction that carries something from the inventory. The script then deals the rest: type system, palette, hero/section blueprints.
4. **Record** — Prepare the remaining output keys for the handoff below:
   - `palette`: hex colors (background, foreground, accent)
   - `typography`: font families, weights, scale
   - `layout`: hero composition, section grid, edge alignment
   - `constraints`: anti-slop rules (no gradients, max 2-line headlines, no thin rules, no orphan labels, equal left/right edges)

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return every required output key as a JSON string. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `.muro/map.md` or `.muro/state.json`; the coordinator is their only writer.

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
- **Landing-specific additions from ai-design-skills:** include proof beside claims, risk reversal, a meaningful tagline section, mobile and interaction states, semantic HTML and a final CTA. Use Tailwind's named text and spacing scales only when the target project uses them.
- **Functional ownership:** this step owns palette, typography and layout; landing strategy contributes offer, proof and CTA, and local search supplies candidates. Retain the adopted visual constraints (no gradients, no fixed font ban, no universal Tailwind scale, no forced one-font rule) as a coherent direction. Source order grants no authority; downstream stages consume the approved outputs rather than independently restyling them.

## Checks

- **palette_applied**: accent color appears on primary CTA and motion trigger elements.
- **typography_consistent**: all headlines use the chosen font/scale; no fallback monospace.
- **layout_matches_direction**: hero and section composition follow the chosen blueprint.
- **no_gradient_or_ornament**: grep for banned patterns returns zero hits.
- **single_primary_action**: one offer and one primary CTA are explicit, with no competing primary actions above the fold.
- **proof_supported**: every factual claim, price, statistic and testimonial has user evidence or is omitted; no invented proof.
- **search_domain_fit**: the returned search domain, top result and product fit were checked before applying recommendations.
- **search_stack_fit**: stack-specific guidance is used only for a detected or explicitly confirmed stack.
- **search_empty_disclosed**: an empty or off-topic search result is disclosed and never represented as a database match.

## Sources

- AI intent mapping: taste-skill → ui.visual-direction; landing-page-design → ui.landing-strategy; ui-ux-pro-max → ui.design-guidance. No native hook is adopted; tool requirements reflect the bounded extracted workflow.

- Source: taste-skill (taste-skill@f6b76575, release v2.5.1) — `skills/taste-skill/SKILL.md`, `references/system.md`, `references/sections.md`, `references/layout-v4.md`, `references/copy.md`, `library/type.json`, `library/palettes.json`
- Scripts adapted: `<package_root>/scripts/taste-skill/scripts/start.mjs` (deals directions), `<package_root>/scripts/taste-skill/scripts/shoot.mjs` (captures screenshots)
- Source: ai-design-skills (ai-design-skills@456d9e0d) — `skills/landing-page-design/SKILL.md`; conversion intake, proof, content states and responsive requirements serve landing strategy; source-wide font, gradient and spacing mandates are scoped out to preserve one owner of the visual direction
- Source: ui-ux-pro-max (ui-ux-pro-max@a38d04c3, release v2.15.0) — `.claude/skills/ui-ux-pro-max/SKILL.md` and `references/`; local design-system search and stack-specific UX guidance added without premium assets
- Harmonized by: prompts/harmonizer.md — extracted anti-slop rules into explicit constraints; removed asset downloaders (photos.mjs) per license gate
