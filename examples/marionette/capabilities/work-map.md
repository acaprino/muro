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

Coordinates an engineering change with the wayfinder method: agree the destination, resolve the open decisions, write one spec, slice it into vertical tickets, then build and review slice by slice. Everything stays local: no issue tracker, branch push or pull request.

The packaged originals are the full version: where this body differs, the original wins, except for the changes listed in the Sources section. Open only the section a step names, when the task reaches it.

## Behavior

1. **Size the route first.** A map needs both: the effort is larger than one agent session can hold, and the route to the destination is unclear. Judge by session count, not project size; legacy and half-built codebases qualify as much as greenfield.
   - A well-scoped change that can be settled in one sitting: no map. Reuse the user's authorization and build directly (step 6) with check evidence; ask how to proceed only if the requested action is still unresolved.
   - The deciding is already done: skip the map and write the spec (step 4).
   - Many sessions and the route still unclear: chart the map (steps 2 and 3).
   - Unsure where the task sits: open `<package_root>/scripts/wayfinder/docs/engineering/wayfinder.md`, `## When to reach for it` and `## Common questions`.
2. **Name the destination** with the user: the spec, decision or change the whole map (not this session) is finding its way to. It fixes the scope, so it is agreed before any decision item exists.
3. **Chart and resolve decisions.** The map plans and does not build: every item is a question whose answer is a decision.
   - Map the frontier breadth-first: fan out over the whole space for the open decisions and the steps takeable now. If that surfaces no fog (the way is clear and the journey fits one session), no map is needed: return to step 1.
   - `task_map` is the map body: Destination, Notes, Decisions so far, Not yet specified, Out of scope. Open `<package_root>/scripts/wayfinder/skills/engineering/wayfinder/SKILL.source.md`, `### The map body`, when you write it. The map is an index, not a store: a decision is recorded in one place and the map only gists it and points there. Refer to items by title, never by a bare number.
   - Each open item is one question sized to one 100K token agent session. It is typed research (AFK), prototype (HITL), grilling (HITL, the default) or task (HITL or AFK), and may declare the items that block it. Open `## Ticket Types` of the same file when the type is not obvious.
   - Fog or item: the test is whether the question can be stated precisely now, not whether it can be answered now. A sharp question is an item even when blocked; the rest stays, unsliced, in Not yet specified (`## Fog of war`).
   - Never resolve more than one item per session, research items excepted. A HITL item resolves only through the live exchange with the user; the agent never answers for the human.
   - A `task` item does manual work that unblocks a decision; it never delivers part of the destination. One that looks like a slice of the build is mis-typed. Read the Notes of any map you did not chart, and keep implementation in separate sessions.
   - After each answer: record it with its item and close the item, add one line to Decisions so far, add newly surfaced items, and move fog that became specifiable out of Not yet specified into items. Work found to sit beyond the destination is closed with one line (gist and why) under Out of scope, not under Decisions so far; it never graduates (`## Out of scope`). If the decision invalidates other parts of the map, update or delete those items.
   - Charting is one session's work and hand-resolves nothing. When the map looks off, open the guide's `## It's working if`.
4. **Write the spec** once nothing is left to decide. Do not interview the user: synthesize what is already known. Explore the repository if not yet done, use its domain glossary vocabulary and respect its ADRs. Sketch the test seams: prefer existing seams to new ones, use the highest seam possible, propose any new one at the highest point; the fewer the better, ideally one. Check the seams with the user. Then open `<package_root>/scripts/wayfinder/skills/engineering/to-spec/SKILL.source.md`, `<spec-template>`, and fill every section: Problem Statement, Solution, User Stories, Implementation Decisions, Testing Decisions, Out of Scope, Further Notes. No specific file paths or code snippets, except a decision-rich snippet from a prototype, trimmed and marked as such.
5. **Slice it** into tracer-bullet tickets (`<package_root>/scripts/wayfinder/skills/engineering/to-tickets/SKILL.source.md`, `## Process`).
   - Work from the context already present; read a referenced spec in full. Use the glossary vocabulary, respect ADRs, and look for prefactoring that makes the change easy.
   - Each slice is a narrow but complete path through every layer (schema, API, UI, tests), never a horizontal slice of one layer; demoable or verifiable on its own; sized for a single fresh context window; prefactoring first. Each declares its blocking edges.
   - A wide refactor (one mechanical change that breaks call sites everywhere) is the exception: sequence it expand–contract. Open `### 3. Draft vertical slices` for the batching and integration-branch rules when one appears.
   - Quiz the user: a numbered list with Title, Blocked by and What it delivers; ask whether the granularity is right, whether each blocking edge is genuine, and whether any ticket should be merged or split. Iterate until the user approves.
   - Write one file per ticket under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order (blockers first), with that file's `<local-ticket-template>`; never a single combined file. Tickets also avoid file paths and code snippets, with the same prototype exception.
6. **Build and review** (Muro extension). Build direct work when authorized. For sliced work take the frontier, any ticket whose blockers are all done, one slice at a time, in a session separate from planning.
   - Code follows `<package_root>/scripts/ponytail/SKILL.source.md`: `## Before you write` for scope, then `## The smallest complete change` (its six-step ladder, its rules and its "Never cut:" line). Open it when writing code if the permanent policy is not already in context.
   - The approved spec, the agreed test seams, the slices, another capability's design authority and a required engine stay authoritative; the ladder chooses only among the options they leave open.
   - Its `## Levels` (lite, full, ultra) apply when the user states that preference for the task; otherwise full, the default.
   - Run the required project checks at the agreed seam and verify each acceptance criterion.
   - Record actual checks, unchecked work and material risks, then review against the spec before the next slice. A separately requested report can use engineering-review; it is not a prerequisite.

## Output handoff

Return `task_map` (the route chosen and, for a charted map, its index), `spec` (the spec text or its local path, or why the route needed none) and `step_sequence` (the approved slices with blocking edges, acceptance criteria and per-slice evidence) as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. The wayfinder map is this capability's own output, not the coordinator's run map: do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Muro's plan confirmation authorizes running this step; it does not replace the user's decisions inside it (destination, test seams, slice breakdown, HITL items). Reuse decisions and authorization already given; ask only for an unresolved choice.
- Do the work the source gives to its grilling, domain-modeling, research, prototype and implement skills inline; they are not in this package.
- The source does not recommend local markdown, because material stored in the repo tends to persist by accident: tell the user which `.scratch/` files were written.
- The method has no fixed runtime dependency; assess and install what the authorized implementation needs under the package's runtime rule, preserving any required engine.

## Checks

- **route_sized_by_sessions**: the route (direct, spec only, or map) follows the session count and the presence of fog; a direct route reused authorization and asked only if the requested action was unresolved.
- **destination_scope_agreed**: the destination was agreed with the user before any decision item existed, and work ruled beyond it is listed under Out of scope.
- **decisions_resolved_by_owner**: every open item reads as a question; HITL items carry the user's own answer; nothing is left in Not yet specified before the spec.
- **spec_template_complete**: every template section is present, test seams were confirmed with the user, and the spec has no file paths or code snippets beyond the template's prototype exception.
- **slices_vertical_gated**: every slice is end to end and verifiable alone, has acceptance criteria and acyclic blocking edges, and the user approved the breakdown.
- **slice_evidence_recorded**: each built slice has actual test or check output against its acceptance criteria, affected callers and preserved safeguards; unchecked work and material risk are explicit, and an unbuilt slice stays open.

## Sources

- AI intent mapping: wayfinder, to-spec and to-tickets → engineering.work-coordination, from the wayfinder SKILL.md (map, tickets, charting, working the map), the wayfinder guide (trigger, FAQ, "It's working if"), the to-spec process and template and the to-tickets slicing, quiz and local-ticket sections.
- Source: wayfinder (mattpocock/skills@d1478fcb, release v1.3.2) — `skills/engineering/wayfinder/SKILL.md`, `docs/engineering/wayfinder.md`, `skills/engineering/to-spec/SKILL.md`, `skills/engineering/to-tickets/SKILL.md`, packaged under `<package_root>/scripts/wayfinder/` (each `SKILL.md` as `SKILL.source.md`).
- Muro extension: step 6 (build and review) comes from this source's intake goal ("extend it through build and review without remote trackers"); the source itself plans and hands off.
- Source: ponytail (DietrichGebert/ponytail@7801d061243d7b753bad0e0b3c057cd250b11755, release v5.3.3, MIT) - `skills/ponytail/SKILL.md`, packaged as `<package_root>/scripts/ponytail/SKILL.source.md`. Its `## Before you write` and `## The smallest complete change` are also carried, in the same words, in the package's permanent policy.
- AI harmonization (2026-11-12): Ponytail enriches the existing implementation owner without another writer, output or prerequisite. Wayfinder keeps destination/spec/slices and meaningful user gates. A requested engineering-review report remains independent of per-slice acceptance review. Second pass the same day: the body is an entry prompt in the package's words with pointers to the sections a step needs.
- Changes for coexistence (ADR-0017):
  - The issue tracker is replaced by local records: none is provided here, the source then defaults to local markdown, and the intake goal says "without remote trackers". The map is the `task_map` output handed over through the coordinator; `wayfinder:` labels, child issues, claiming by assignee, native blocking links, resolution comments and a map given as URL or number have nothing to run on. An item states its type in words and its answer is recorded with it.
  - "tell the user to run `/setup-matt-pocock-skills`" is not followed: that setup skill is not selected.
  - Research findings are not put on a pushed `research/<name>` branch: the intake goal keeps the work local, so they stay local with a pointer from the item.
  - to-spec's publishing to the tracker with the `ready-for-agent` label and to-tickets' real-tracker form are not applied (same collision); the "Local files" form is followed as written.
  - "Call the Skill tool" for grilling, domain-modeling, research and prototype, and the guide's hand-offs to other skills of the source, are done inline: those skills are not selected and routing between a source's own skills competes with the coordinator.
  - `disable-model-invocation: true` and every slash form are not carried: the coordinator classifies by meaning.
  - "Stop and ask the user how they'd like to proceed" (no fog) is asked only when the request has not already answered it: the confirmed plan and a request for the change itself say how to proceed.
  - The source "hands off and does not continue into code"; step 6 continues to the build, by the intake goal, always in a step separate from the map.
  - Ponytail's phrase and slash activation, its session mode and `/ponytail lite|full|ultra` are not applied: activation competes with the coordinator and the package keeps no mode state. The rules are active through the permanent policy for code work; a level is a preference stated for the task.
  - Ponytail's closing lines ("what you skipped or did not check, and any risk") follow the permanent policy's ordering with i-have-adhd's one next action, because both sources claim the end of the reply.
  - Ponytail's ladder does not override an approved spec, a design authority or an engine another capability requires: it would bend that capability's work.
- Gap: the source's local-markdown tracker layout lives in `/setup-matt-pocock-skills`, which is not selected; only the to-tickets local file layout is used.
- Hooks: the selected Wayfinder files define none; its `skills/**/scripts/**` and `skills/**/agents/**` are excluded and uninspected. Ponytail's original lifecycle/state/UI hooks were inspected and explicitly excluded from the curated integration; none is adopted here.
- Harmonized by: prompts/harmonizer.md (2026-11-10 re-harmonization) — the earlier body described Muro runtime internals and checked Muro's own map; it is replaced by the source's method and checks of the engineering work. `spec` is added as an output because the source's spec is a distinct handoff between decisions and slices.
