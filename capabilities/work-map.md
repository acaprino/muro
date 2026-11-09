---
id: work-map
role: coordinator
when: "—"
after: []
outputs: ["task_map", "step_sequence"]
checks: ["map_structure_valid", "steps_have_capabilities", "no_orphan_steps"]
---

# Work Map Coordinator

Generates and manages the local `.muro/map.md` work map for multi-step tasks.

## Behavior

1. **Analyze** the user's request and infer required roles (from ROUTER.md).
2. **Build** an ordered step sequence using `resolve_plan` (variant filter + after expansion + output-satisfaction skip).
3. **Write** `.muro/map.md` with:
   - `## Plan` — numbered steps with capability IDs and status checkboxes
   - `## Outputs` — per-step bullet decisions and artifact paths
4. **Ask** for one-line confirmation before executing the first step.
5. **Execute** steps one at a time, loading only the current capability's Markdown file.
6. **Update** `.muro/map.md ## Outputs` after each step completes.
7. **Final evaluation** — run the `## Checks` of all executed capabilities and report results.

## Constraints

- Single-step tasks (EX-002) skip map creation entirely and execute directly.
- Only one capability file is loaded per step (no parallel MoE).
- Prerequisite steps in `after` are skipped if their `outputs` keys already exist in `## Outputs`.
- The coordinator never loads two capabilities with the same `role` in the same step (INV-002).

## Checks

- **map_structure_valid**: `.muro/map.md` contains `## Plan` and `## Outputs` sections.
- **steps_have_capabilities**: every step in `## Plan` maps to an existing `capabilities/<id>.md`.
- **no_orphan_steps**: no step references a missing prerequisite `after` capability.

## Sources

- Source: wayfinder (mattpocock@4ae2317d) — `skills/engineering/wayfinder/SKILL.md`, `docs/engineering/wayfinder.md`
- Harmonized by: prompts/harmonizer.md — merged wayfinder protocol with Muro's 4-rule router