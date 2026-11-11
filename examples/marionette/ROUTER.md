# Marionette AI routing catalog

The intake AI derives intents from source skills; the harmonizer AI normalizes
them. The host AI interprets the task using the descriptions and exclusions in
capability frontmatter. IDs below are catalog data, not a closed Python taxonomy.
`when` expresses stack constraints only; `—` does not mean automatic activation.
Tools and adopted hooks are catalog metadata in capability frontmatter. The host
AI checks tool availability and hook permissions; Python never auto-runs hooks.
The LLM unifies by purpose and functional responsibility, not names or source
order. Merges, alternatives and prerequisite edges require source-grounded reasons;
the table records those decisions and cannot replace semantic analysis.
Each release's offline `GUIDE.html` presents a compact navigable graph, brief
intents and authored example paths from `guide-examples.json`; full details and
commands open on demand. Declared relationships and validated example decisions
are illustrations: selecting a node or example never classifies or activates work.

| id | role | when | after | outputs | intents |
|---|---|---|---|---|---|
| work-map | coordinator | — | — | task_map, spec, step_sequence | engineering.work-coordination |
| visual-direction | art-direction | — | — | offer, page_outline, palette, typography, layout, constraints, page | ui.visual-direction, ui.landing-strategy |
| design-guidance | design-guidance | — | — | design_candidates, stack_guidance | ui.design-guidance |
| figma-design | figma-design | — | — | foundations, component_map, screen_plan | ui.figma-design |
| motion-principles | motion-spec | — | — | motion-spec, reduced-motion | ui.motion-design |
| gsap-scrolltrigger | scroll-code | stack:gsap | — | code-patch, scroll-verified | ui.scroll-animation |
| css-scroll | scroll-code | stack:css-only | — | code-patch, scroll-verified | ui.scroll-animation |
| office-deck | deck-authoring | — | — | deck_outline, deck_file, deck_review | office.presentation-creation |
| office-authoring | document-authoring | — | — | office_file, office_review | office.document-creation, office.spreadsheet-creation |
| office-files | office-file-operations | — | — | file_reading, file_result | office.file-editing, office.format-conversion, office.content-extraction, office.editor-handoff |
| interactive-explainer | explainer-authoring | — | — | explainer_outline, explainer_file, explainer_claims | explainer.source-walkthrough, explainer.topic-research, explainer.codebase-walkthrough |
| explainer-fact-check | claim-verification | — | — | verification_report, verification_verdict | explainer.fact-check |

## Runtime contract

1. `plan` returns `classification-required`, the compact catalog and
   `prompts/classify.md`. The host AI supplies a reasoned classification.
2. The AI selects capability/intent pairs in execution order, or returns
   `no_match` or `needs_clarification`; Python never infers intent or falls back.
3. Python validates the decision against the task, catalog digest and stack,
   rejects incompatible/conflicting variants and orders explicit prerequisites.
4. Run one capability per step, skip prerequisites only when all their outputs
   are recorded, and execute the used capabilities' checks with real evidence.
5. Outputs and check results are submitted with the step's `map_id` and
   `capability`; Python rejects evidence for a replaced map or another step.
   Only the coordinator writes the map; helpers resolve under `<package_root>`.

## Harmonization record (re-harmonized 2026-11-10 against the pinned sources)

- No row has a mandatory prerequisite. Each consumer can start from existing work
  or a stated behavior: motion-design from purpose and context, gsap-scrolltrigger
  from a direct request, figma-designer from the file's own system. Consumers
  read earlier outputs when recorded; the AI selects producer and consumer
  together, in order. Forced edges had made hover timing run a website direction.
- visual-direction merges taste-skill (plan, copy, dealt palette and type, build,
  screenshot review) and landing-page-design (offer, proof, FAQ, outline): both
  build the page, and taste's brief and copy step is the landing strategy. Rules
  now come from pinned v2.5.1, not an unpinned local copy. It owns the look:
  landing-page-design's font list, hero gradient and fixed Tailwind scale are
  scoped out; a client's brand wins over source bans and is recorded.
- design-guidance (ui-ux-pro-max) is split out: guidance for any interface,
  app screens included; beside a dealt palette its results are candidates.
- figma-design keeps a recorded pairing and palette as the user's choice. Its
  one conditional prerequisite is declared in `needs`: visual-direction, only
  for a new landing page with no outline; the runtime AI judges it per task.
- motion-principles follows the source tables; a recorded motion budget overrides
  its three-layer rule. GSAP and CSS scroll are variants of one outcome; only the
  stack differs. css-scroll has no upstream source (Muro-authored).
- work-map follows wayfinder, to-spec and to-tickets locally, plus the build and
  review its intake goal adds; never a fallback.
- visual-direction is `resumable`: a site build with screenshot rounds gets a map
  even as the only step (2026-11-11, ADR-0015).
- Office and explainer roles are unchanged and separate from UI. A PDF of an
  existing file is office-files' conversion, not office-authoring's.

<!-- Dependencies are judged at runtime, case by case (ADR-0007); GSAP is
installed when a task needs it. Open gaps: taste-skill
run files not selected (dealers, kit, checkers, gate, Stop hook); no maintained
source for CSS scroll-driven animation. -->
