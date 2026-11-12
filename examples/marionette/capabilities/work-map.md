---
id: work-map
role: coordinator
tools: [{"name":"file-access","purpose":"Read the repository, its glossary and ADRs, implement authorized source and test changes, and write local spec and ticket files.","required":true},{"name":"shell","purpose":"Run the project's tests and checks for each built slice.","required":false}]
hooks: []
conflicts: []
intents: [{"id":"engineering.work-coordination","description":"Implement clear software changes directly; otherwise agree scope, resolve decisions, write a spec and build reviewed vertical slices with evidence.","excludes":["Not a fallback for unknown, ambiguous or non-engineering requests.","Do not add planning ceremony to a task that fits one direct step.","Designing a page, a Figma file, motion, Office files or an explainer is the work of those capabilities, not engineering coordination."]}]
when: "—"
after: []
outputs: ["task_map", "spec", "step_sequence"]
checks: ["route_sized_by_sessions", "destination_scope_agreed", "decisions_resolved_by_owner", "spec_template_complete", "slices_vertical_gated", "slice_evidence_recorded"]
---

# Work Map Coordinator

Coordinates an engineering change with the wayfinder method: agree the destination, resolve the open decisions, write one spec, slice it into vertical tickets, then build and review slice by slice. Everything stays local: no issue tracker, branch push or pull request. `<WF>` below stands for `<package_root>/scripts/wayfinder`.

## Behavior

1. **Size the route first.** Grill the request breadth-first for open decisions.
   - No fog, and the work fits one session: no map. Reuse the user's authorization and build directly (step 6) with check evidence; ask how to proceed only if the requested action is still unresolved.
   - Decisions already made in the conversation: skip the map and go to the spec (step 4).
   - Larger than one session and the route unclear: chart the map (steps 2 and 3).
   Size by session count, not project size (`<WF>/docs/engineering/wayfinder.md`).
2. **Name the destination** with the user: the spec, decision or change the work leads to, and what is out of scope. It is agreed before any decision item exists.
3. **Chart and resolve decisions.**
   - `task_map` is an index with Destination, Notes, Decisions so far, Not yet specified and Out of scope; it gists each decision and points to where it is recorded, never restating it.
   - Each open item is a question sized to one session, typed research, prototype, grilling or task, and marked HITL or AFK. Fog becomes an item only when its question can be stated precisely.
   - Resolve one item per session (research items may run in parallel). A HITL item is resolved only with the user; never answer the user's side.
   - After each answer, add one line to Decisions so far, graduate fog that became specifiable, and rule out items beyond the destination.
   - A `task` item only unblocks a decision; it never builds part of the destination. The map plans and does not build.
4. **Write the spec** once nothing is left to decide. Explore the repository in its own vocabulary and respect its ADRs. Agree the test seams with the user: existing and as high as possible, ideally one. Use the template in `<WF>/skills/engineering/to-spec/SKILL.source.md`: Problem Statement, Solution, User Stories, Implementation Decisions, Testing Decisions, Out of Scope, Further Notes. No file paths or code snippets, except a decision-rich prototype snippet.
5. **Slice it** with `<WF>/skills/engineering/to-tickets/SKILL.source.md`.
   - Tracer-bullet vertical slices, each through every layer, verifiable on its own and sized to one fresh context window, prefactoring first.
   - Each slice lists its blocking slices; a wide refactor is sequenced expand, migrate, contract.
   - Show the breakdown (title, blocked by, what it delivers) and iterate until the user approves it.
   - Local ticket files go under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, one per slice with acceptance criteria.
6. **Build and review** (Muro extension, enriched with Ponytail). Build direct work when authorized; for sliced work, take the frontier one slice at a time in a session separate from planning.
   - Establish the complete impact before minimizing: read affected callers, callees, tests, fixtures, configuration and exports; include compatibility, data loss and exposure in scope. Fix a shared root cause once and finish every consequential caller/test change.
   - Prefer existing project patterns/components, then standard-library or platform features where the project has no established choice, then installed dependencies, then the least new readable code. Preserve approved architecture, design authority and required engines; do not add speculative abstractions, wrappers, conversions, configuration or future features. Deletion helps only when required behavior survives.
   - Keep requested functionality, validation, security, accessibility, hardware calibration and data-loss error handling, including when moving or merging code. Between equally small options choose correct edge-case behavior; a cryptic one-liner is not simpler.
   - Run required project checks at the agreed seam and verify each acceptance criterion. Non-trivial new logic needs a focused test or executable self-check that can detect failure; trivial edits need no ceremonial test. Comments explain hidden reasons; record a deliberate shortcut's limit and revisit trigger as `shortcut: <limit>, <upgrade trigger>`, unless the user/project chooses another convention.
   - Record actual checks, unchecked work and material risks, then review against the spec before the next slice. A separately requested report can use engineering-review; this does not add it as a prerequisite.

## Output handoff

Return `task_map` (the route chosen and, for a charted map, its index), `spec` (the spec text or its local path, or why the route needed none) and `step_sequence` (the approved slices with blocking edges, acceptance criteria and per-slice evidence) as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. The wayfinder map is this capability's own output, not the coordinator's run map: do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Muro's plan confirmation authorizes running this step; it does not replace meaningful user decisions inside it (destination, test seams, slice breakdown, HITL decisions). Reuse decisions and authorization already given; ask only for an unresolved choice, not a repeated confirmation.
- Not adopted: the issue tracker as the map store, assigning and labels, research branches pushed to the remote, and publishing the spec or tickets with the `ready-for-agent` label. The source calls grilling, domain-modeling, research, prototype and implement skills that are not selected; do their work inline.
- The source warns that local markdown in the repository tends to persist by accident: tell the user which `.scratch/` files were written.
- The source's most-reported failure is planning that slides into building inside the map. Keep decisions and builds in separate steps; a map's Notes never authorize execution by themselves.
- The method has no fixed runtime dependency; assess and install dependencies needed by the authorized implementation under the package's runtime rule, preserving any required engine.

## Checks

- **route_sized_by_sessions**: the route (direct, spec only, or map) follows the session count and the presence of fog; a direct route reused authorization and asked only if the requested action was unresolved.
- **destination_scope_agreed**: the destination and the out-of-scope list were agreed with the user before any decision item.
- **decisions_resolved_by_owner**: every open item reads as a question; HITL items carry the user's own answer; nothing is left in Not yet specified before the spec.
- **spec_template_complete**: every template section is present, test seams were confirmed with the user, and the spec has no file paths.
- **slices_vertical_gated**: every slice is end to end and verifiable alone, has acceptance criteria and acyclic blocking edges, and the user approved the breakdown.
- **slice_evidence_recorded**: each built slice has actual test or check output against its acceptance criteria, affected callers and preserved safeguards; unchecked work and material risk are explicit, and an unbuilt slice stays open.

## Sources

- AI intent mapping: wayfinder, to-spec and to-tickets → engineering.work-coordination, from the wayfinder SKILL.md (map, tickets, charting, working the map), the wayfinder guide (trigger, FAQ, "It's working if"), the to-spec process and template and the to-tickets slicing, quiz and local-ticket sections.
- Source: wayfinder (mattpocock/skills@d1478fcb, release v1.3.2) — `skills/engineering/wayfinder/SKILL.md`, `docs/engineering/wayfinder.md`, `skills/engineering/to-spec/SKILL.md`, `skills/engineering/to-tickets/SKILL.md`, packaged under `<package_root>/scripts/wayfinder/`.
- Muro extension: step 6 (build and review) comes from this source's intake goal ("extend it through build and review without remote trackers"); the source itself plans and hands off.
- Source: ponytail (DietrichGebert/ponytail@7801d061243d7b753bad0e0b3c057cd250b11755, release v5.3.3, MIT) - `skills/ponytail/SKILL.md` and `.agents/rules/ponytail.md`, Before you write / The smallest complete change. These originals are intake-only provenance; the retained implementation method is stated in step 6 and the neutral core contributes once to permanent package guidance.
- AI harmonization (2026-11-12): Ponytail enriches the existing implementation owner without another writer, output or prerequisite. Wayfinder keeps destination/spec/slices and meaningful user gates; source mode controls, persona, slash routing and optional UI/telemetry are excluded. A requested engineering-review report remains independent of per-slice acceptance review.
- Gap: the source's local-markdown tracker layout lives in `/setup-matt-pocock-skills`, which is not selected; only the to-tickets local file layout is used.
- Hooks: the selected Wayfinder files define none; its `skills/**/scripts/**` and `skills/**/agents/**` are excluded and uninspected. Ponytail's original lifecycle/state/UI hooks were inspected and explicitly excluded from the curated integration; none is adopted here.
- Harmonized by: prompts/harmonizer.md (2026-11-10 re-harmonization) — the earlier body described Muro runtime internals and checked Muro's own map; it is replaced by the source's method and checks of the engineering work. `spec` is added as an output because the source's spec is a distinct handoff between decisions and slices.
