# Marionette AI routing catalog

Intake AI derives intents from source skills; the harmonizer AI normalizes them.
The host AI interprets the task with the descriptions and exclusions in capability
frontmatter. IDs are catalog data, not a closed Python taxonomy. `when` holds stack
constraints only; `—` is not automatic activation. Tools and hooks are metadata:
the host AI checks availability and permissions; Python never auto-runs hooks.
Merges, alternatives and prerequisites need source-grounded reasons, recorded below.
`GUIDE.html` illustrates the graph and example paths; it never classifies work.

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
| paper-search | literature-search | — | — | literature_findings | research.literature-search, research.paper-reading |
| paper-wiki | paper-knowledge-base | — | — | wiki_changes, wiki_validation | research.paper-notes, research.wiki-upkeep |
| paper-figure | academic-figure | — | — | figure_plan, figure_file, figure_review | research.paper-diagram, research.paper-plot |
| research-practice | research-guidance | — | — | research_guidance | research.planning, research.experiment-debugging |
| research-pitch | research-communication | — | — | value_verdict, value_deliverable, claim_ledger | research.value-communication |
| session-handoff | session-handoff | — | — | handoff_state | engineering.session-handoff, engineering.session-resume |
| token-economy | session-cost-control | — | — | economy_report, economy_changes | cost.economy-report, cost.tool-pruning, cost.economy-settings |

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
- open-paper-skills (2026-11-11): six roles, none merged with an earlier one.
  The two figure skills are one method (paper-figure). paper-wiki runs the
  paper-search script inside its step and only `reads` its findings. Its
  explainer skills and map-then-territory are not absorbed: explain-this and
  wayfinder serve those needs. session-handoff links work maps, never copies.

- tokeneconomizer (2026-11-11, release v0.1.0): one role, token-economy. Its six
  default hooks are passive `host-approved` entries; registering them is an
  explicit user-requested step of the capability, never done at build or install.

<!-- Dependencies are judged at runtime (ADR-0007). Open gaps: taste-skill run
files not selected; no maintained source for CSS scroll-driven animation. -->
