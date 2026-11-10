# Muro AI routing catalog

The intake AI derives intents from source skills; the harmonizer AI normalizes
them. The host AI interprets the task using the descriptions and exclusions in
capability frontmatter. IDs below are catalog data, not a closed Python taxonomy.
`when` expresses stack constraints only; `—` does not mean automatic activation.
Tools and adopted hooks are catalog metadata in capability frontmatter. The host
AI checks tool availability and hook permissions; Python never auto-runs hooks.
The LLM unifies by purpose and functional responsibility, not names or source
order. Merges, alternatives and prerequisite edges require source-grounded reasons;
the table records those decisions and cannot replace semantic analysis.

| id | role | when | after | outputs | intents |
|---|---|---|---|---|---|
| work-map | coordinator | — | — | task_map, step_sequence | engineering.work-coordination |
| visual-direction | art-direction | — | — | design_candidates, stack_guidance, offer, page_outline, palette, typography, layout, constraints | ui.visual-direction, ui.landing-strategy, ui.design-guidance |
| figma-design | figma-design | — | visual-direction | foundations, component_map, screen_plan | ui.figma-design |
| motion-principles | motion-spec | — | visual-direction | motion-spec, reduced-motion | ui.motion-design |
| gsap-scrolltrigger | scroll-code | stack:gsap | motion-principles | code-patch, scroll-verified | ui.scroll-animation |
| css-scroll | scroll-code | stack:css-only | motion-principles | code-patch, scroll-verified | ui.scroll-animation |
| office-deck | deck-authoring | — | — | deck_outline, deck_file, deck_review | office.presentation-creation |
| office-authoring | document-authoring | — | — | office_file, office_review | office.document-creation, office.spreadsheet-creation |
| office-files | office-file-operations | — | — | file_reading, file_result | office.file-editing, office.format-conversion, office.content-extraction, office.editor-handoff |
| interactive-explainer | explainer-authoring | — | — | explainer_outline, explainer_file, explainer_claims | explainer.source-walkthrough, explainer.topic-research, explainer.codebase-walkthrough |
| explainer-fact-check | claim-verification | — | — | verification_report, verification_verdict | explainer.fact-check |

## Runtime contract

1. `plan` returns `classification-required`, the compact catalog and
   `prompts/classify.md`. The host AI supplies a reasoned classification.
2. The AI selects capability/intent pairs, or returns `no_match` or
   `needs_clarification`; Python never infers intent or falls back to a skill.
3. Python validates the decision against the task, catalog digest and stack,
   rejects incompatible/conflicting variants and orders explicit prerequisites.
4. Run one capability per step, skip prerequisites only when all their outputs
   are recorded, and execute the used capabilities' checks with real evidence.
5. Outputs and check results are submitted with the step's `map_id` and
   `capability`; Python rejects evidence for a replaced map or another step.
   Only the coordinator writes the map; helpers resolve under `<package_root>`.

## Harmonization record

- taste-skill supplies visual direction; landing-page-design from ai-design-skills
  supplies landing strategy; ui-ux-pro-max supplies local design guidance.
  All three outcomes are retained in visual-direction.
  Visual direction owns palette/type/layout; landing strategy supplies offer/proof
  and local guidance supplies candidates. Figma consumes the approved direction
  without an independent font rule; source order grants no authority.
- figma-designer from ai-design-skills supplies Figma design; motion-design
  supplies motion specifications; gsap-scrolltrigger supplies scroll implementation.
- css-scroll is the internal CSS-only scroll implementation variant. It shares
  the outcome intent with GSAP, not its technology constraint.
- wayfinder supplies work coordination. It must be selected intentionally.
- genoffice supplies Office files through the user's installed `genoffice`
  command line: a new deck (its own staged pipeline), a new document, workbook
  or PDF, and work on existing files (edit, convert, extract, editor handoff).
  The three roles have no prerequisites, no stack constraint and no overlap with
  the UI capabilities: a deck or document is not a web page or app screen.
  Creating a file and then editing it is a sequential handoff, not a conflict.
  Its provider-backed search, image and media commands send data off the machine
  and give no standalone intent.
- explain-this supplies interactive explainers. creating-explainers and
  explaining-codebases share one output format and are merged into
  interactive-explainer (documents, topic research, codebase). Its blocking
  claim gate runs inside that step; fact-checking-explainers is also kept as
  explainer-fact-check for an article that already exists. No prerequisite and
  no conflict: an explainer is not a landing page, app screen or Office file.
