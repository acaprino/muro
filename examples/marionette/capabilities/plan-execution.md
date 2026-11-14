---
id: plan-execution
role: plan-execution
when: "—"
after: []
outputs: ["plan_execution_report"]
checks: ["workspace_isolation_settled", "ledger_kept", "tdd_followed_with_evidence", "completion_contract_met", "final_review_fresh", "fixes_red_green", "rulings_and_minors_reported"]
check_conditions: {"fixes_red_green": "The final review produced Critical or Important findings.", "final_review_fresh": "At least one task was completed: a run stopped before any task has no branch to review."}
intents: [{"id":"plans.plan-execution","description":"Execute a written implementation plan task by task without pausing between tasks — inline in this session or with a fresh implementer subagent and reviewer per task — under test-driven development, with a progress ledger, a fresh whole-branch review at the end, one fix pass, and the integration choice presented to the user.","excludes":["Writing the plan: that is impl-plan.","A standalone code review of a branch or diff: that is engineering-review.","Reviewing a plan or design document with fresh reviewers: that is fresh-review.","Implementation work that follows no plan document, which work-map coordinates.","Debugging an issue outside a plan's execution."]}]
tools: [{"name":"file-access","purpose":"Read the plan, its spec and the packaged method texts; keep the ledger, briefs, reports and review packages in the plan's workspace.","required":true},{"name":"shell","purpose":"Run the packaged workspace and task scripts with bash, git, and the project's test commands; required by every step of the flow.","required":true},{"name":"subagent","purpose":"Dispatch fresh implementers and reviewers per task (subagent-driven), and the final whole-branch reviewer on the most capable model; inline execution runs without it and the final review falls back to a declared self-review.","required":false},{"name":"structured-question","purpose":"Present the integration options at the finish; plain chat is the fallback.","required":false}]
hooks: []
conflicts: []
reads: ["implementation_plan"]
needs: [{"capability": "impl-plan", "label": "no plan document", "when": "No implementation plan document exists for this work and the request names none. Not when the user points at a plan file or one is recorded.", "reason": "Both packaged executors start from a written plan; the plan carries the decisions the implementer cannot make alone (writing-plans, Overview)."}]
resumable: true
---

# Plan Execution

Executes an implementation plan to a reviewed branch: the plan already did the thinking, the executor proves each step with a test it watched fail and then pass, and leaves a ledger that survives its own forgetting. The user's integration decision ends it.

The packaged originals are the full version: the original of the chosen method wins where this body differs, except for the changes listed in the Sources section. Under `<package_root>/scripts/superpowers/`: `skills/executing-plans/SKILL.source.md` (inline) with its `scripts/task-start` and `scripts/task-done`; `skills/subagent-driven-development/SKILL.source.md` (subagent-driven) with its three prompt templates, `references/` and `scripts/`; the method texts `skills/test-driven-development/`, `skills/systematic-debugging/`, `skills/verification-before-completion/`, `skills/using-git-worktrees/`, `skills/finishing-a-development-branch/` and `skills/requesting-code-review/` (with `code-reviewer.md`), each a `SKILL.source.md` with its reference files. Relative paths inside the originals (`../subagent-driven-development/scripts/...`, `../using-superpowers/references/`) resolve within that packaged tree. Open the section a step names when you reach it.

## Behavior

1. **Choose the method** with the originals' own rule: the user's explicit choice (often made at impl-plan's handoff) wins; otherwise subagent-driven when a subagent tool exists and tasks are mostly independent, inline when the user chose it or no subagent tool exists. Never fabricate a dispatch. Read the chosen original whole before Task 1.
2. **Setup** (both originals, `## Setup`): ensure an isolated workspace via the packaged using-git-worktrees text — detect existing isolation first, prefer the host's native worktree tool, ask consent before creating one; never start on a main/master branch without the user's explicit consent. Run `scripts/sdd-workspace PLAN_FILE` with bash by its absolute path for the plan's workspace, create or resume the ledger by its first identity line (a ledger naming another plan is not yours), read the plan and its Spec — the spec is the binding authority — and run the pre-flight interface scan into the ledger. Inline loads the packaged test-driven-development text now; it governs every step.
3. **Continuous execution, rulings not stalls** (both originals): never pause between tasks to check in. Decide conflicts, ambiguities and plan defects against the spec and ledger each as `Ruling: <decision> — <why> — <cost if wrong>`. Only the originals' four stops stop you: an irreversible or destructive operation, a security-sensitive action, a side effect outside the worktree that norms say you ask about first, a plan so broken every path is a guess.
4. **Inline loop** (`executing-plans`, `## The Task Loop`): `scripts/task-start PLAN_FILE N` prints the brief and BASE; read the brief every time. Work the steps in RED-GREEN order, compare every `Expected:` line against real output; a wrong result is debugged to root cause with the packaged systematic-debugging text, a wrong plan gets a ledgered ruling. Meet the completion contract — every named test ran and was read, every Expected compared, every deviation ruled — under the packaged verification-before-completion text, then `scripts/task-done PLAN_FILE N BASE -- <test command>`: a failing run records nothing.
5. **Subagent-driven loop** (`subagent-driven-development`, `## The Task Loop`): record BASE, extract the brief with `scripts/task-brief`, dispatch one fresh implementer per task from `implementer-prompt.md` with the brief as the single source of requirements — never the whole plan, never parallel implementers, never a worker that spawns its own reviewer. Pick each subagent's model by the original's `## Model Selection` and always name it explicitly. On DONE, build the diff with `scripts/review-package PLAN_FILE BASE HEAD` (never `HEAD~1`) and dispatch the task reviewer from `task-reviewer-prompt.md`; any other status follows `references/handling-reports.md`. Spec compliance and task quality are both required; the fix loop follows `references/fix-loop.md`, read again before every round. Ledger each completion line as the original writes it.
6. **Final review** (both originals): build the whole-branch package from the merge base, dispatch the fresh reviewer on the most capable available model with the packaged `code-reviewer.md`, the plan's Review Focus verbatim and a pointer to the ledger's rulings; with no subagent tool, perform that review yourself and declare `Final review: self-review (no subagent tool)`. Re-grade findings by effect, then one fix pass for Critical and Important, each fix RED→GREEN plus a green suite; Minor is deferred to the ledger, never fixed in the pass. A finding not fixed is a ruling.
7. **Finish** (`finishing-a-development-branch`): with the suite green, detect the environment, confirm the base branch, present the original's integration options exactly and wait for the user's choice; execute it, clean up the worktree as the original says, and delete the plan's workspace only when the final review is clean. The merge, push or discard is the user's call — one of the four stops.

## Output handoff

Return `plan_execution_report` (the plan path, method used, tasks completed with their commit ranges, every `Ruling:` line, deferred minors, the final review's verdict and fix results, and the integration choice) as a JSON string. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- engineering-review owns standalone review requests on code; the whole-branch review here is the flow's own closing gate, run with the packaged reviewer template. fresh-review owns reviewing the plan or design document as a document.
- The ledger and workspace are shared between the two methods — an execution can change method mid-flight and resume from the same ledger; the coordinator's map stays the record of the step itself.
- Runtime dependencies, judged per task at runtime (ADR-0007): git, bash for the packaged scripts, the project's own test runner, and a host subagent tool for the subagent-driven method and the final fresh reviewer. The source prescribes no installation.

## Checks

- **workspace_isolation_settled**: the work ran in an isolated workspace, or the user's explicit consent to work on the current branch is recorded.
- **ledger_kept**: the plan's workspace ledger exists with its identity line, one completion line per finished task and every ruling; resumed runs trusted the ledger over memory.
- **tdd_followed_with_evidence**: for each task, tests were watched failing before implementation and passing after, with the output read, not inferred.
- **completion_contract_met**: every task marked complete met the contract — named tests ran, every Expected line compared against real output, deviations ruled — and `task-done` (or the ledgered equivalent) recorded a passing run.
- **final_review_fresh**: the whole-branch review ran in a fresh context on the most capable available model, or is declared in the ledger and final message as a self-review for lack of a subagent tool. Not applicable when execution stopped before any task completed.
- **fixes_red_green**: every Critical or Important finding was fixed in the single pass with a test that failed first and a green suite after, or parked as a ruling. Not applicable when the review found none.
- **rulings_and_minors_reported**: the final message lists every `Ruling:` line and every deferred minor from the ledger, exhaustively.

## Sources

- Source: superpowers (obra/superpowers@22f0b463e7a5e579904dd6211a520321035526f7, release v7.0.2, MIT) — `skills/executing-plans/SKILL.md` and `skills/subagent-driven-development/SKILL.md` (whole, with their scripts, prompt templates and references), and the method texts they require: `skills/test-driven-development/SKILL.md`, `skills/systematic-debugging/SKILL.md`, `skills/verification-before-completion/SKILL.md`, `skills/using-git-worktrees/SKILL.md`, `skills/finishing-a-development-branch/SKILL.md`, `skills/requesting-code-review/SKILL.md` with `code-reviewer.md`, and `skills/using-superpowers/references/` (per-platform subagent notes the executors point at). Packaged under `<package_root>/scripts/superpowers/skills/`.
- AI mapping: executing-plans and subagent-driven-development → plans.plan-execution (one role: the source itself presents them as the two execution methods of one plan, sharing workspace and ledger). It `reads` a recorded `implementation_plan` and `needs` impl-plan only when no plan document exists.
- Changes for coexistence (ADR-0017):
  - "REQUIRED SUB-SKILL: superpowers:X" and the other skill-name handoffs are not carried as routing: the coordinator classifies by meaning and the named texts are packaged files this step opens (collision: routing and activation that competes with the coordinator). What each text prescribes is unchanged.
  - The report is also handed over as `plan_execution_report` through the coordinator; the ledger, files and formats stay the source's.
- `hooks: []`: the upstream ships one SessionStart hook that injects its skill-routing text; it is not adopted (same collision) and is recorded in delivery.json.
