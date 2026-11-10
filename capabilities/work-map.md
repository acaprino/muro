---
id: work-map
role: coordinator
tools: [{"name":"file-access","purpose":"Inspect the engineering task and preserve decisions and evidence.","required":true},{"name":"shell","purpose":"Run project-specific checks when the authorized work requires them.","required":false}]
hooks: []
conflicts: []
intents: [{"id":"engineering.work-coordination","description":"Coordinate a software change through requirements, decisions, implementation and evidence-backed review; handle a small engineering task directly when no specialist is needed.","excludes":["Not a fallback for unknown, ambiguous or non-engineering requests.","Do not add planning ceremony to a task that fits one direct step."]}]
when: "—"
after: []
outputs: ["task_map", "step_sequence"]
checks: ["map_structure_valid", "steps_have_capabilities", "no_orphan_steps"]
---

# Work Map Coordinator

Coordinates engineering work; the Python runtime owns the managed work map and state.

## Behavior

1. **Read** the host AI's validated classification and the user's engineering objective. This capability is explicitly selected, never a fallback for unclassified requests.
2. **Coordinate** the authorized engineering work. Domain routing is owned by `prompts/classify.md`; Python's `resolve_selection` expands only selected capabilities and prerequisites. Do not recursively invoke a second routing policy.
3. **Describe** the authorized work in `task_map` and `step_sequence`; these are output artifacts, not permission to edit Python-managed state.
4. **Honor** existing authorization. A mapped plan is already confirmed by the runtime; do not ask for approval again without a new decision.
5. **Execute** the active task within its scope. Do not load or dispatch unrelated capabilities.
6. **Record** outputs through `muro.py record` for a mapped step, passing the step's `map_id` and `capability`. Never write `state.json` or the managed map directly; only Python updates them under its writer lock.
7. **Final evaluation** — run the `## Checks` of all executed capabilities and report results.

## Constraints

- Single-step tasks (EX-002) skip map creation entirely and execute directly.
- Only one capability file is loaded per step (no parallel MoE).
- Prerequisite steps in `after` are skipped if their `outputs` keys already exist in `## Outputs`.
- The coordinator never loads two capabilities with the same `role` in the same step (INV-002).

## Checks

- **map_structure_valid**: a mapped task contains `## Plan` and `## Outputs`; a direct task correctly has no required map.
- **steps_have_capabilities**: every mapped step (or the single direct step) names an existing capability.
- **no_orphan_steps**: mapped prerequisites exist and are ordered; direct work has no hidden unfulfilled prerequisites.

## Sources

- Source: wayfinder (mattpocock@d1478fcb, release v1.3.2) — `skills/engineering/wayfinder/SKILL.md`, `docs/engineering/wayfinder.md`, `skills/engineering/to-spec/SKILL.md`, `skills/engineering/to-tickets/SKILL.md`; requirements, specification and task handoffs map to `engineering.work-coordination`, without remote ticket creation.
- Harmonized by: prompts/harmonizer.md — merged wayfinder protocol with Muro's 4-rule router
