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

## Behavior

0. **Read the originals first.** They are the method in the source's own words. Read whole, before working, the ones the route needs:
   - always: `<package_root>/scripts/wayfinder/docs/engineering/wayfinder.md` (the guide; it sizes the route);
   - for a map: `<package_root>/scripts/wayfinder/skills/engineering/wayfinder/SKILL.source.md`;
   - for a spec: `<package_root>/scripts/wayfinder/skills/engineering/to-spec/SKILL.source.md`;
   - for slices: `<package_root>/scripts/wayfinder/skills/engineering/to-tickets/SKILL.source.md`;
   - for any step that writes or changes code: `<package_root>/scripts/ponytail/skills/ponytail/SKILL.source.md`.
   The steps below are an index into those files. Where this body and an original differ, the original wins, except for the changes listed under the Sources section below, "Changes for coexistence".
1. **Size the route first**, with the guide's `## When to reach for it`: "The effort must be larger than one agent session can hold, and the route to the destination must be unclear." The split is "Session count, not project size."
   - "A well-scoped feature you can settle in one sitting": no map. Reuse the user's authorization and build directly (step 6) with check evidence; ask how to proceed only if the requested action is still unresolved.
   - "A thread where the deciding is already done": "skip straight past the map" and go to the spec (step 4).
   - "A greenfield project, or a build spanning many sessions, with the route still unclear": chart the map (steps 2 and 3).
2. **Name the destination** with the user: "the spec, decision, or change" the map is finding its way to. "The destination fixes the scope, so it's settled first", before any decision item exists.
3. **Chart and resolve decisions** (wayfinder `## The Map`, `## Ticket Types`, `## Fog of war`, `## Out of scope`, `## Invocation`).
   - Map the frontier: grill "breadth-first". "**If this surfaces no fog** (the way to the destination is already clear, the whole journey small enough for one session), you don't need a map": return to step 1.
   - `task_map` is the map body: Destination, Notes, Decisions so far, Not yet specified, Out of scope. "The map is an **index**, not a store": it gists each decision and points to where it is recorded, never restating it.
   - Each open item is a question "sized to one 100K token agent session", typed research, prototype, grilling or task, and HITL or AFK. Fog or item: "The test is whether you can state the question precisely now, _not_ whether you can answer it now."
   - "**never resolve more than one ticket per session**, with the exception of research tickets". A HITL item resolves only through the live exchange with the user: "the agent never stands in for the human's side of it".
   - After each answer: record it, add one line to Decisions so far, add newly surfaced items, graduate fog that became specifiable (clearing it from Not yet specified) and rule out of scope what sits beyond the destination. "If the decision invalidates other parts of the map, update or delete those tickets."
   - A `task` item "earns its place by unblocking a decision, not by delivering the destination". The guide: "It plans and does not build."
   - "charting is one session's work; it hand-resolves nothing."
4. **Write the spec** (to-spec `## Process` and its `<spec-template>`) once nothing is left to decide. "Do NOT interview the user; just synthesize what you already know." Explore the repository, use its domain glossary vocabulary and respect its ADRs. Sketch the test seams: "Existing seams should be preferred to new ones. Use the highest seam possible." "The fewer seams across the codebase, the better - the ideal number is one." "Check with the user that these seams match their expectations." Template sections: Problem Statement, Solution, User Stories, Implementation Decisions, Testing Decisions, Out of Scope, Further Notes. "Do NOT include specific file paths or code snippets", with the template's one exception for a decision-rich prototype snippet.
5. **Slice it** (to-tickets `## Process`, steps 1 to 5, "Local files" form).
   - Tracer-bullet slices under its `<vertical-slice-rules>`: "a narrow but COMPLETE path through every layer (schema, API, UI, tests)", "demoable or verifiable on its own", "sized to fit in a single fresh context window", "Any prefactoring should be done first".
   - Each slice declares its blocking edges; a wide refactor is the exception and is sequenced "expand–contract" (expand, migrate in batches, contract) as that file describes.
   - Quiz the user: show Title, Blocked by and What it delivers, ask its three questions, and "Iterate until the user approves the breakdown."
   - "write one file per ticket under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order (blockers first)", with its `<local-ticket-template>`: "one ticket per file, never a single combined file".
6. **Build and review** (Muro extension, with Ponytail's method). Build direct work when authorized; for sliced work, "Work the **frontier**: any ticket whose blockers are all done", one slice at a time in a session separate from planning.
   - The code method is `<package_root>/scripts/ponytail/skills/ponytail/SKILL.source.md`, `## Before you write` and `## The smallest complete change`, whole: its scope list, its six-step ladder, its rules and its "Never cut:" line.
   - The approved spec, the agreed test seams, the slices, another capability's design authority and a required engine stay authoritative; Ponytail's ladder chooses among the options they leave open.
   - Its `## Levels` table (lite, full, ultra) applies when the user states that preference for the task; with none stated, "full": "The rules above. Default."
   - Run the required project checks at the agreed seam and verify each acceptance criterion.
   - Record actual checks, unchecked work and material risks, then review against the spec before the next slice. A separately requested report can use engineering-review; this does not add it as a prerequisite.

## Output handoff

Return `task_map` (the route chosen and, for a charted map, its index), `spec` (the spec text or its local path, or why the route needed none) and `step_sequence` (the approved slices with blocking edges, acceptance criteria and per-slice evidence) as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. The wayfinder map is this capability's own output, not the coordinator's run map: do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Muro's plan confirmation authorizes running this step; it does not replace meaningful user decisions inside it (destination, test seams, slice breakdown, HITL decisions). Reuse decisions and authorization already given; ask only for an unresolved choice, not a repeated confirmation.
- The parts of the originals that are not applied here (tracker, labels, assignment, pushed branches, calls to unselected skills, slash commands, session mode) are listed under the Sources section below, "Changes for coexistence". Do the work of the unselected grilling, domain-modeling, research, prototype and implement skills inline.
- The guide warns that local markdown "puts the artifacts in your repo, which is not recommended, because material stored in the repo tends to persist by accident": tell the user which `.scratch/` files were written.
- The guide's most-reported failure is production code written in the middle of a map. Its advice applies: "read the Notes on any map you did not chart yourself, keep implementation in separate sessions, and treat any `wayfinder:task` that looks like a slice of the build as mis-typed."
- The method has no fixed runtime dependency; assess and install dependencies needed by the authorized implementation under the package's runtime rule, preserving any required engine.

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
- Source: ponytail (DietrichGebert/ponytail@7801d061243d7b753bad0e0b3c057cd250b11755, release v5.3.3, MIT) - `skills/ponytail/SKILL.md`, packaged as `<package_root>/scripts/ponytail/skills/ponytail/SKILL.source.md` and read in step 6. Its `## Before you write` and `## The smallest complete change` are also carried, in the same words, in the package's permanent policy.
- AI harmonization (2026-11-12): Ponytail enriches the existing implementation owner without another writer, output or prerequisite. Wayfinder keeps destination/spec/slices and meaningful user gates; source mode controls, slash routing and optional UI/telemetry are excluded. A requested engineering-review report remains independent of per-slice acceptance review.
- Changes for coexistence (ADR-0017):
  - Wayfinder's issue tracker is not used. No tracker is provided to this package (the setup skill that configures one, `/setup-matt-pocock-skills`, is not selected), so the source's own rule applies: "If no tracker has been provided, default to the local-markdown tracker." The intake goal also keeps the work local ("without remote trackers"). The map is the `task_map` output and is handed over through the coordinator (factory contract: output handoff). Not applied, because they exist only on a tracker: the `wayfinder:map` and `wayfinder:<type>` labels (an item states its type in words), child issues, assigning a ticket as the claim, native blocking links, the resolution comment and closing an issue (the answer is recorded with the item, which is then marked closed), a map given as URL or number.
  - "tell the user to run `/setup-matt-pocock-skills`" (wayfinder, to-spec, to-tickets) is not followed: that skill is not selected and is the source's own setup.
  - Research findings are not captured "on a throwaway `research/<name>` branch" and no branch is pushed: recorded in `delivery.json` under the intake goal "without remote trackers". Findings stay local, with a pointer from the item.
  - to-spec's "publish it to the project issue tracker. Apply the `ready-for-agent` triage label" and to-tickets' "A real issue tracker" form, its `<issue-template>` and "Do NOT close or modify any parent issue" are not applied: same collision as the tracker. The "Local files" form and its `<local-ticket-template>` are followed as written.
  - "Call the Skill tool" for "grilling", "domain-modeling", "research" and "prototype", and the guide's hand-offs to grill-me, grill-with-docs, implement, handoff and ask-matt, are not carried: those skills are not selected, and routing between a source's own skills competes with the coordinator. This capability does that work inline.
  - `disable-model-invocation: true`, "You invoke this by typing `/wayfinder`" and every slash form are not carried: the coordinator classifies by meaning.
  - "Stop and ask the user how they'd like to proceed" (no fog) is asked only when the request has not already answered it. The source asks because the next step is another of its skills; here the coordinator's confirmed plan and a request for the change itself already say how to proceed, and Ponytail, absorbed into this same owner, solves a direct change without a planning stop.
  - The source "hands off and does not continue into code"; step 6 continues to the build, by the intake goal, always as a step separate from the map.
  - Ponytail's frontmatter (trigger phrases, `argument-hint`) and "Active for the whole session until the user says "stop ponytail" or "normal mode". Switch level: `/ponytail lite|full|ultra`" are not applied: activation by phrase or slash command competes with the coordinator, and the package keeps no mode state (the source's mode hooks are not selected). The same rules are already active by default through the permanent policy, for tasks that write or change code. A level is a preference the user states for the task.
  - Ponytail's "End your reply with one or two lines: what you skipped or did not check, and any risk the user must know" is followed in the permanent policy's wording (the lines close a code-change reply and the one next action of i-have-adhd rule 3 comes after them), because both sources claim the end of the reply.
  - Ponytail's ladder ("Standard library or a platform feature? Use it", "An installed dependency? Use it") does not replace an approved spec, a design authority or an engine another capability requires: it would bend that capability's work.
- Gap: the source's local-markdown tracker layout lives in `/setup-matt-pocock-skills`, which is not selected; only the to-tickets local file layout is used.
- Hooks: the selected Wayfinder files define none; its `skills/**/scripts/**` and `skills/**/agents/**` are excluded and uninspected. Ponytail's original lifecycle/state/UI hooks were inspected and explicitly excluded from the curated integration; none is adopted here.
- Harmonized by: prompts/harmonizer.md (2026-11-10 re-harmonization) — the earlier body described Muro runtime internals and checked Muro's own map; it is replaced by the source's method and checks of the engineering work. `spec` is added as an output because the source's spec is a distinct handoff between decisions and slices.
