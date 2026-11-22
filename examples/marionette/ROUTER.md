# Marionette AI routing catalog

Intake and harmonization AI derive and normalize intents from sources; the host AI interprets requests using capability descriptions and exclusions. IDs are data, not a Python taxonomy. `when` holds stack constraints; `-` is not activation.
Tool/hook metadata grants no permissions; native registration is declared in delivery.json.
Merges and edges need source-grounded reasons. GUIDE.html illustrates, never classifies.

| id | role | when | after | outputs | intents |
|---|---|---|---|---|---|
| work-map | coordinator | — | — | task_map, spec, step_sequence | engineering.work-coordination |
| visual-direction | art-direction | — | — | offer, page_outline, palette, typography, layout, constraints, page | ui.visual-direction, ui.landing-strategy |
| design-guidance | design-guidance | — | — | design_candidates, stack_guidance | ui.design-guidance |
| canvas-design | canvas-design | — | — | foundations, component_map, screen_plan | ui.canvas-design |
| motion-principles | motion-spec | — | — | motion-spec, reduced-motion | ui.motion-design |
| gsap-scrolltrigger | scroll-code | stack:gsap | — | code-patch, scroll-verified | ui.scroll-animation |
| css-scroll | scroll-code | stack:css-only | — | code-patch, scroll-verified | ui.scroll-animation |
| office-deck | deck-authoring | — | — | deck_outline, deck_file, deck_review | office.presentation-creation |
| office-authoring | document-authoring | — | — | office_file, office_review | office.document-creation, office.spreadsheet-creation |
| office-files | office-file-operations | — | — | file_reading, file_result | office.file-editing, office.format-conversion, office.content-extraction, office.editor-handoff |
| interactive-explainer | explainer-authoring | — | — | explainer_outline, explainer_file, explainer_claims | explainer.source-walkthrough, explainer.topic-research, explainer.codebase-walkthrough |
| explainer-fact-check | claim-verification | — | — | verification_report, verification_verdict | explainer.fact-check |
| html-explanation | explanation-authoring | — | — | explanation_file | explanation.html-page |
| paper-search | literature-search | — | — | literature_findings | research.literature-search, research.paper-reading |
| token-economy | session-cost-control | — | — | economy_report, economy_changes | cost.economy-report, cost.tool-pruning, cost.economy-settings |
| engineering-review | engineering-reviewer | — | — | code_review_findings, code_review_coverage | engineering.change-review, engineering.codebase-audit |
| engineering-debt | engineering-debt-reporter | — | — | shortcut_ledger | engineering.shortcut-ledger |
| engineering-guidance | engineering-method-guide | — | — | engineering_guidance | engineering.working-guidance, engineering.benchmark-evidence |
| concept-brief | concept-ideation | — | — | concepts_brief | docs.idea-brainstorm |
| design-doc | design-doc-authoring | — | — | design_document | docs.design-draft |
| fresh-review | fresh-context-review | — | — | document_review_reports, document_review_outcome | docs.staged-review, docs.review-loop, docs.finding-resolution |
| codebase-contracts | codebase-contract-docs | — | — | contract_files | docs.codebase-contracts |
| design-drift | design-drift-report | — | — | drift_report | docs.design-drift |
| impl-plan | implementation-plan-authoring | — | — | implementation_plan | plans.impl-plan-writing |
| plan-execution | plan-execution | — | — | plan_execution_report | plans.plan-execution |
| design-file | design-file-authoring | — | — | design_brief, design_file | design-file.brief, design-file.create, design-file.extract, design-file.update |
| design-file-apply | design-file-implementation | — | — | design_application | design-file.apply |
| design-file-inspection | design-file-inspection | — | — | design_inspection_report | design-file.document-review, design-file.interface-drift, design-file.accessibility-inspection |
| design-file-integration | design-file-integration | — | — | token_export, design_code_checks | design-file.token-export, design-file.code-checks |
| text-humanize | prose-humanization | — | — | humanize_report | writing.humanize-prose |

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

- No row has a mandatory prerequisite. Consumers start from existing work or stated behavior, reading earlier outputs when recorded; the AI orders selected producers and consumers. Forced edges had made hover timing run a website direction.
- 2026-11-19, owner decision: taste-skill is removed ("troppo prescrittiva e costrittiva"). visual-direction, which had merged it with landing-page-design and let it own the look, now follows landing-page-design alone:
  Part A is the strategy and copy, Part B the visual system. Its font list, hero gradient, Tailwind scale and tagline reveal had been scoped out
  only because the two sources contradicted each other; with no collision left they apply as written (ADR-0017). The user's explicit prompt wins over a rule and is recorded.
  Gone with it: the kit, the dealers, the browser checks, the finish gate and its Stop hook, the package's only active hook. Id, intents and outputs are kept.
- 2026-11-17, same pass: work-map follows wayfinder's own `research` skill for a research item (selected; the other sibling skills stay inline). motion-design re-pinned to head 2e1f3c05: a request for a rendered animation file is handed to Creator MCP by the source's rules, inside motion-principles; no new role, output or edge.
- 2026-11-19: motion-design re-pinned to head d77a9fc8; `reference/export-and-render.md` now gives install commands per client and a per-client handoff. No role, output, edge or delivery decision changes.
- design-guidance (ui-ux-pro-max) is split out: guidance for any interface,
  app screens included; beside a recorded visual system its results are candidates.
- canvas-design (figma-design until 2026-11-19, owner decision: generic, not bound to Figma) serves Figma, FigCraft or another canvas editor through the host's integration; the source's
  design rules are unchanged. It keeps a recorded pairing and palette as the user's choice. One conditional prerequisite in `needs`: visual-direction, only
  for a new landing page with no outline; the runtime AI judges it per task.
- motion-principles follows the source tables; a recorded motion budget overrides
  its three-layer rule. GSAP and CSS scroll are variants of one outcome; only the
  stack differs. css-scroll has no upstream source (Muro-authored).
- work-map handles an engineering request through Wayfinder's local map, spec, tickets, implementation and review. Its grilling, domain-modeling, prototype and implementation procedures are packaged originals. The coordinator never selects work-map as a fallback.
- visual-direction is `resumable`: a site built section by section gets a map
  even as the only step (2026-11-11, ADR-0015).
- Office/explainer roles stay separate from UI; converting to PDF belongs to office-files.
- open-paper-skills (2026-11-18, owner decision): only paper-search and html-explanation
  (explain-anything-html, left out unread on 2026-11-11 as covered by explain-this) stay;
  the wiki, figure, research and handoff roles are removed. html-explanation conflicts
  with interactive-explainer, one owner per explanation, and `reads` the search findings. Literature source switches apply to scholarly retrieval across capabilities and delegated researchers (delivery.json).
- tokeneconomizer (2026-11-11, release v0.1.0): one role, token-economy. Its six
  default hooks are passive `host-approved` entries; registering them is an
  explicit user-requested step of the capability, never done at build or install.
- 2026-11-22, owner decision: claude-design-system-prompt is removed (its upstream had replaced the design prompt, so the pinned head no longer matched).
  Gone with it: aesthetic-direction, wireframe, ui-prototype, design-options, html-deck, design-system-extract and design-review, which held nothing else,
  and the discovery entries marionette-product-design and marionette-design-review. visual-direction no longer conflicts with another capability.
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
- egm v0.1.1 (2026-11-14, trial intake): five on-demand `docs.*` roles, nothing session-wide. Review, loop and resolution are one role
  (one thread in the source); bootstrap's drift offer is design-drift's step; design-doc and work-map's spec keep separate owners.
- superpowers v7.0.2 (2026-11-14): the planning chain in symbiosis with EGM — a design-doc or brief is the spec impl-plan argues from; the two executors are one role (plan-execution; the source shares their workspace and ledger) with the required method texts packaged as the step's files. using-superpowers, its SessionStart hook and brainstorming are dropped or evidence-only: self-activating routing competes with the coordinator and concept-brief owns the idea stage (`delivery.json`). work-map keeps plan-less implementation; engineering-review keeps standalone code review; fresh-review reviews the plan as a document.
- zero-slop-design v0.2.1 (2026-11-17): fourteen skills, four on-demand roles, nothing session-wide. design-file is the only writer of the brief and `DESIGN.md`; apply, inspection (report-only; its drift output is not `drift_report`) and integration (token export, code checks in CI) read it; no forced chain. Look authority, owner decision: the user's request in the turn, then a project `DESIGN.md` that is not a starter or a reference (minus `unresolved` and `proposed`), then tokens or a Master in the repository, then a direction recorded in the plan; candidates stay proposals. For visual-direction such a file is the user's explicit instruction; no building or reviewing step rewrites it. Its ban on unrequested tests governs interface checks in its steps; Ponytail's self-check for new logic and plan-execution's TDD stand.
- text-humanizer 2.0.0 (2026-11-17, head c4d8276c: no release upstream): one on-demand role, text-humanize; nothing session-wide, since as policy its rules would rewrite every reply. The skill, its editor agent and three references are one procedure; the editor is an optional subagent with the packaged agent file, or inline by the source's own fallback. The command and trigger lines are dropped as routing; a file is written only on the user's choice.
- 2026-11-15: owner `custom-instructions/recap-adhd.md` adds permanent progress guidance, coexists with ADHD rule 10 and adds no procedure; provenance is in delivery.json.
<!-- Dependencies are judged at runtime (ADR-0007). Open gaps: no maintained source for CSS scroll-driven animation;
EGM's Claude reviewer adapters (omitClaudeMd, read-only tools) are not carried. -->
