---
id: impl-plan
role: implementation-plan-authoring
when: "—"
after: []
outputs: ["implementation_plan"]
checks: ["plan_saved_with_header", "tasks_bite_sized_and_exact", "self_review_run", "execution_handoff_presented"]
intents: [{"id":"plans.impl-plan-writing","description":"Turn an approved spec, design document or set of requirements into an executable implementation plan: bite-sized tasks with exact files, signatures, failing-test-first steps and commit points, written for an engineer who has not seen the codebase, self-reviewed against the spec and handed to the user with a choice of execution method.","excludes":["Writing the design document or RFC itself: that is design-doc.","Stress-testing an idea into a brief: that is concept-brief.","Executing the plan: that is plan-execution.","A spec synthesized inside an implementation route, which work-map owns without a standalone plan document.","Reviewing an existing plan or document with fresh reviewers."]}]
tools: [{"name":"file-access","purpose":"Read the spec or design document the plan argues from and the code it touches; write the plan to docs/superpowers/plans/ or the user's preferred location.","required":true},{"name":"structured-question","purpose":"Present the execution-method choice at the handoff; plain chat is the fallback.","required":false}]
hooks: []
conflicts: []
reads: ["design_document", "concepts_brief"]
resumable: true
---

# Implementation Plan

Writes the set of decisions an implementer cannot make alone: which files, which names and signatures, which values from the spec, which test proves each task. It writes no production code and executes nothing.

The packaged original is the full version and wins where this body differs, except for the changes listed in the Sources section: `<package_root>/scripts/superpowers/skills/writing-plans/SKILL.source.md`. Open the section a step names when you reach it.

## Behavior

1. **The spec travels with the plan.** Start from the spec, design document or requirements the user names; a recorded `design_document` or `concepts_brief` of this package is such a spec. With none, ask for one. Apply `## Scope Check`: a spec covering several independent subsystems gets a plan per subsystem, each producing working, testable software on its own.
2. **File structure first** (`## File Structure`): map which files are created or modified and each one's single responsibility before defining tasks; follow the codebase's established patterns.
3. **Tasks and steps** (`## Task Right-Sizing`, `## Step Granularity`, `## Task Structure`, `## What a Step Contains`): a task is the smallest unit carrying its own test cycle and worth a reviewer's gate; each step is one action with a checkable result in RED-GREEN order (failing test, watch it fail, minimal code, watch it pass, commit), with exact paths, an Interfaces block (consumes/produces with exact signatures), the spec's values verbatim, and `- [ ]` checkboxes. A step is done when the implementer can write exactly one reasonable thing from it. A plan longer than the code it describes has written the code instead.
4. **Header** (`## Plan Document Header`): every plan starts with the original's header block — the agentic-workers line, Goal, Architecture, Tech Stack, the Spec path, `## Global Constraints` copied verbatim from the spec, and `## Review Focus` with the uncovered failure modes most likely to bite, each pinned to a test in its owning task.
5. **Self-review** (`## Self-Review`): run all five points yourself — spec coverage, step scan, type consistency across tasks, Review Focus coverage, proportion — and fix findings inline, without a subagent and without a re-review.
6. **Save and hand off** (`## Execution Handoff`): save to `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` (the user's preferred location overrides), link the plan, ask the user to review it and choose the execution method with the original's wording — subagent-driven or native/inline, with the recommendation sentence — unless they already supplied one; wait for that review before any implementation. In this package both methods are plan-execution's step.

## Output handoff

Return `implementation_plan` (the plan file path, the spec path it argues from, the number of tasks and the execution method chosen or `not chosen`) as a JSON string. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- design-doc owns the design document, whose implementation section lists every file with no code; this step owns the standalone executable plan that argues from such a document. work-map keeps its own spec and step sequence for routes that never produce a plan document.
- The plan header's agentic-workers line names the source's executor skills; in this package their work is plan-execution's, and the packaged originals live under `<package_root>/scripts/superpowers/`.
- The source's upstream brainstorming stage is concept-brief's work in this package.
- Runtime dependencies: none beyond file access. The source prescribes no installation.

## Checks

- **plan_saved_with_header**: the plan file exists at the stated path and starts with the original's header — agentic-workers line, Goal, Architecture, Tech Stack, Spec path, Global Constraints verbatim, Review Focus.
- **tasks_bite_sized_and_exact**: every task has exact file paths, an Interfaces block and RED-GREEN steps with checkboxes; no step decides nothing and no body appears that the signature and tests determine.
- **self_review_run**: all five self-review points were run and their findings fixed inline, stated one by one.
- **execution_handoff_presented**: the user was asked to review the plan and the execution method was chosen by them or carried from their earlier explicit choice; no implementation started.

## Sources

- Source: superpowers (obra/superpowers@22f0b463e7a5e579904dd6211a520321035526f7, release v7.0.2, MIT) — `skills/writing-plans/SKILL.md` (whole), packaged as `<package_root>/scripts/superpowers/skills/writing-plans/SKILL.source.md`.
- AI mapping: writing-plans → plans.impl-plan-writing. It `reads` recorded `design_document` and `concepts_brief` as the spec it argues from, and requires neither: the source starts from any spec or requirements.
- Changes for coexistence (ADR-0017):
  - The source's announcement line and skill-name handoffs ("Use superpowers:X", the brainstorming reference in Scope Check) are not carried as routing: the coordinator classifies by meaning, and the named originals are packaged files whose work belongs to this package's steps (collision: routing and activation that competes with the coordinator).
  - The plan header the source prescribes is written unchanged into generated plans, executor names included.
- `hooks: []`: the upstream ships one SessionStart hook that injects its skill-routing text; it is not adopted (same collision) and is recorded in delivery.json.
