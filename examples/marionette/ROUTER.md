# Marionette AI routing catalog

Intake and harmonization AI derive and normalize intents from sources; the host AI
interprets requests using capability descriptions and exclusions. IDs are data,
not a Python taxonomy. `when` holds stack constraints; `-` is not activation.
Tool/hook metadata grants no permissions; native registration is declared in delivery.json.
Merges and edges need source-grounded reasons. GUIDE.html illustrates, never classifies.

| id | role | when | after | outputs | intents |
|---|---|---|---|---|---|
| work-map | coordinator | — | — | task_map, spec, step_sequence | engineering.work-coordination |
| visual-direction | art-direction | — | — | offer, page_outline, palette, typography, layout, constraints, page | ui.visual-direction, ui.landing-strategy |
| design-guidance | design-guidance | — | — | design_candidates, stack_guidance | ui.design-guidance |
| figma-design | figma-design | — | — | foundations, component_map, screen_plan | ui.figma-design |
| aesthetic-direction | aesthetic-direction | — | — | aesthetic_direction, direction_sample | ui.aesthetic-direction |
| wireframe | lofi-exploration | — | — | wireframe_file, wireframe_decision | ui.wireframe-exploration |
| ui-prototype | prototype-authoring | — | — | prototype_plan, prototype_file, prototype_verification | ui.interactive-prototype |
| design-options | design-options | — | — | options_file, options_summary | ui.design-variations, ui.tweak-controls |
| html-deck | html-deck-authoring | — | — | html_deck_plan, html_deck_file, html_deck_review | ui.html-deck |
| design-system-extract | design-system-extraction | — | — | design_tokens, component_inventory | ui.token-extraction, ui.component-inventory |
| design-review | design-review | — | — | review_findings, review_fixes | ui.accessibility-audit, ui.generic-look-check, ui.hierarchy-rhythm-review, ui.interaction-states, ui.polish-pass |
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

| engineering-review | engineering-reviewer | — | — | code_review_findings, code_review_coverage | engineering.change-review, engineering.codebase-audit |
| engineering-debt | engineering-debt-reporter | — | — | shortcut_ledger | engineering.shortcut-ledger |
| engineering-guidance | engineering-method-guide | — | — | engineering_guidance | engineering.working-guidance, engineering.benchmark-evidence |

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

- No row has a mandatory prerequisite. Consumers start from existing work or stated
  behavior, reading earlier outputs when recorded; the AI orders selected producers
  and consumers. Forced edges had made hover timing run a website direction.
- visual-direction merges taste-skill v2.5.1 (plan, copy, dealt palette/type,
  build, screenshot review) and landing-page-design (offer, proof, FAQ, outline):
  both build the page; taste's brief/copy step is the landing strategy and owns the
  look. Landing's font list, hero gradient and Tailwind scale are scoped out;
  a client's brand wins over source bans and is recorded.
- design-guidance (ui-ux-pro-max) is split out: guidance for any interface,
  app screens included; beside a dealt palette its results are candidates.
- figma-design keeps a recorded pairing and palette as the user's choice. Its
  one conditional prerequisite is declared in `needs`: visual-direction, only
  for a new landing page with no outline; the runtime AI judges it per task.
- motion-principles follows the source tables; a recorded motion budget overrides
  its three-layer rule. GSAP and CSS scroll are variants of one outcome; only the
  stack differs. css-scroll has no upstream source (Muro-authored).
- work-map follows wayfinder/to-spec/to-tickets locally, plus build/review; never a fallback.
- visual-direction is `resumable`: a site build with screenshot rounds gets a map
  even as the only step (2026-11-11, ADR-0015).
- Office/explainer roles stay separate from UI; converting to PDF belongs to office-files.
- open-paper-skills (2026-11-11): six new roles. Both figure skills form paper-figure.
  paper-wiki runs paper-search's script inside its step and only `reads` its findings.
  Explainers and map-then-territory are excluded: explain-this and wayfinder cover
  them. session-handoff links work maps, never copies.
- tokeneconomizer (2026-11-11, release v0.1.0): one role, token-economy. Its six
  default hooks are passive `host-approved` entries; registering them is an
  explicit user-requested step of the capability, never done at build or install.
- claude-design-system-prompt (2026-11-12, head 3c3ddb07): a system prompt of
  twenty chapters and fourteen skills become seven roles loaded on demand. No text
  or hook from this source is session-wide (`delivery.json`): its persona,
  non-disclosure and chat-conduct lines and its own skill routing are dropped,
  its domain rules live in the bodies and the prompt file is not shipped. Merged: the five review skills into
  design-review (polish runs the other four on one file); variations/tweak panel
  into design-options; both extracts into design-system-extract; questions into briefs.
  aesthetic-direction conflicts with visual-direction (two owners of palette and
  type) and is a `needs` of ui-prototype and html-deck only when nothing gives a
  look. html-deck and office-deck differ by wanted format; unspecified stays office-deck.
  A motion-spec overrides the transition band; design-guidance stays lookup/report. Eval:
  32 of 33 historically; db-migration was later corrected as in scope.

- ponytail v5.3.3 and i-have-adhd v0.4.1 (2026-11-12): one permanent policy that
  carries both in their own words; three marked lines let them coexist with the catalog.
  Ponytail enriches work-map; review/audit share engineering-review; shortcut ledgers
  use engineering-debt; method/benchmark explanations use engineering-guidance.
  No forced prerequisite or duplicate output owner. i-have-adhd adds no procedure.
  delivery.json explains exclusions of source mode controls, UI and telemetry.
  Originals carried as text are intake-only; the benchmark travels. Native policy needs the
  complete adapter, acts before classification and creates no step for style alone.
- 2026-11-13: multi-intent roles declare `intent_checks`, 14 checks `check_conditions` (from their
  bodies, ADR-0018); entries declare `absorbs`, i-have-adhd being policy only (ADR-0019).
<!-- Dependencies are judged at runtime (ADR-0007). Open gaps: taste-skill run
files not selected; no maintained source for CSS scroll-driven animation; the
host starters and tools named by claude-design-system-prompt are not packaged. -->
