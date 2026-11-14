# Superpowers planning chain — intake of 2026-11-14

Owner direction (same day): "da usare in simbiosi con egm". The planning chain of
obra/superpowers joins the catalog downstream of EGM: a `design_document` or
`concepts_brief` is the spec `impl-plan` argues from, and `plan-execution` runs the
plan it writes.

## Pin and license

- obra/superpowers, release **v7.0.2** (newest non-draft, non-prerelease; "Latest" on
  the releases page), commit `22f0b463e7a5e579904dd6211a520321035526f7`, cloned at the
  tag and matching. `pin: release`.
- Root `LICENSE`: MIT, "Copyright (c) 2025 Jesse Vincent". No deeper license files in
  the selected paths. `NOTICE.md` and `LICENSES/superpowers.txt` verified in the
  staged build.

## What was absorbed, and the harmonization

- **impl-plan** (writing-plans): the plan as the set of decisions an implementer
  cannot make alone — header with Global Constraints verbatim and Review Focus,
  bite-sized RED-GREEN tasks with exact files and Interfaces, five-point self-review,
  execution handoff to the user. `reads: [design_document, concepts_brief]`.
- **plan-execution** (executing-plans + subagent-driven-development as one role: the
  source presents them as the two methods of one plan, sharing workspace and ledger):
  continuous execution, rulings-not-stalls with the four stops, per-task completion
  contract, fresh whole-branch final review on the most capable model with one
  RED→GREEN fix pass, finishing menu to the user. `reads: [implementation_plan]`,
  `needs: impl-plan` only when no plan document exists. The six method texts the
  executors require (TDD, systematic-debugging, verification-before-completion,
  using-git-worktrees, finishing-a-development-branch, requesting-code-review with
  code-reviewer.md) and using-superpowers' per-platform references travel unchanged
  as the step's packaged files; relative cross-references resolve in the packaged tree.
- **Dropped with the collision recorded** (`delivery.json`): using-superpowers and the
  upstream SessionStart hook (self-activating skill routing competes with the
  coordinator; the trampoline is a batch target Muro rejects), brainstorming
  (concept-brief owns the idea stage; read as boundary evidence), the remaining
  skills, node packaging and release tooling (scope stays the owner's planning-chain
  direction, ADR-0015).
- Boundaries drawn in excludes and ROUTER record: design-doc keeps the design
  document (its implementation section lists files, no code) while impl-plan owns the
  executable task plan; work-map keeps plan-less implementation; engineering-review
  keeps standalone code review; fresh-review reviews a plan as a document.
- The umbrella description hit the 1,024-character host cap with the new clause: the
  plugin description was compressed (same scope, shorter wording) to fit untruncated.

## Mechanical verification

- `python -m pytest -q`: **539 passed, 15 skipped** (counts 34→36 updated in five
  tests; `test_pin_modes` extended; new `tests/test_superpowers_intake.py`, 11 tests).
- `--validate` and `--check-sources` pass (the source check contacted the pinned
  remote). Fresh staged build: layout `scripts/superpowers/skills/<skill>/...`, every
  `SKILL.md` as `SKILL.source.md`, none of the four intake-only files packaged,
  `marionette-implementation` entry skill with the absorbs sentence.
- ROUTER.md stays at 79 text lines (the cap counts blank lines too; the closing
  comment was re-wrapped to keep room for the test that appends a row).
- Guide examples selecting plan-execution carry the `needs` judgment the runtime
  requires; the guide build validates them.

## Routing eval

`--prepare-eval`, then one fresh subagent classified the 62 cases from the prepared
prompt alone (isolation stated in its report; expectations never read).
`--score-eval`: **61 of 62**, catalog digest
`937cfde00b955a6156475c8d7f676742b960354c2145f5361e7b11e899e0d68d`.

- All 8 new superpowers cases matched: the named original (`executing-plans` →
  plan-execution), the subagent-driven phrasing, the negations (design-doc not
  impl-plan; fresh-review on the plan, not execution), the two-step
  `impl-plan → plan-execution`, and the four-step symbiosis chain
  `concept-brief → design-doc → impl-plan → plan-execution` with `needs` judged
  applies=true and satisfied by the preceding step.
- The classifier kept the subtle boundary unprompted: in `egm-design-doc` it did not
  add impl-plan, because the "piano di implementazione file per file" asked there is
  a section of the design-draft intent itself.
- The one miss is `scroll-css-only`, the same pre-existing expectation missed at the
  EGM intake eval; not touched by this intake.
- Sample size: one run of one model.

## Live on Claude Code 2.1.325 (this container, package alone, Sonnet)

Recipe flags as in AGENTS.md; sessions one at a time; no session folder was left
under `~/.claude/projects/`. Test project: a git repository with an approved design
document for a small in-process rate limiter (stdlib only), empty `src/` and
`tests/`.

| # | Request | Result | Cost |
|---|---|---|---|
| 0 | list the package's skills | 15: the umbrella and the 14 entries, `marionette-implementation` included | $0.06 |
| B | write the plan from the approved design, inline chosen for later | `marionette-implementation` → classification `impl-plan` → mapped step. Plan at `docs/superpowers/plans/2026-11-14-rate-limiter.md` with the source's header: ten Global Constraints quoted from the design, Review Focus with five uncovered cases each pinned to a named test (the `now or time.time()` default bug among them), two RED-GREEN tasks with exact files and commits. Self-review run; handoff honored the pre-supplied method. All four checks `pass`, map completed | $0.36, 16 turns |
| C | execute that plan inline, consents given (current branch, keep as-is) | classification `plan-execution`, `needs` judged not applying (the plan exists). Ledger with identity line, pre-flight row and the branch-consent ruling. Both tasks executed in order under TDD with the plan's exact commit messages; `task-brief`/`task-done` run through bash (below). Final review dispatched to a **fresh subagent on the most capable model**: 0 Critical, 3 Important, 8 Minor. The three Important findings fixed in the single pass, each with a test watched RED→GREEN and the suite 17/17; four rulings and five deferred minors ledgered and reported. Integration: kept as pre-authorized. `step` submitted, all seven checks `pass` (both conditioned checks applicable and answered), map completed | $1.34, 20 turns |

After session C the toy project's suite stands at 17 passed; the three commits match
the plan plus one fix commit from the review pass.

## Finding and fix: packaged scripts lost the executable bit

Session C's host first ran `scripts/task-start` by its path and got `Permission
denied` (exit 126): git blobs carry no mode, and the factory wrote helpers with
`write_bytes`. The host recovered exactly as the capability and the originals allow
— `bash <script>` — and ledgered the deviation as a ruling, so the run lost nothing.
Fix in `muro/factory.py`: a helper whose content starts with `#!` is re-marked
executable at packaging. Covered by the release-build test
(`test_capabilities_read_originals`), which now asserts the five superpowers scripts
are executable in a fresh build; not re-run live (the bash route the texts already
prescribe keeps working either way). Per-task cost of the fix: none.

## What was not executed

- The subagent-driven execution method (fresh implementer + reviewer per task): only
  the inline method ran live. Its scripts and templates are packaged and the final
  reviewer dispatch — the same mechanism — ran in session C.
- The worktree path (the live run had explicit consent for the current branch), the
  finishing menu's merge and PR options, resume of an interrupted execution, and the
  other four hosts (unit tests only).
- One session per configuration, one model; requests in Italian. The plan and
  execution quality observed is one sample, not a rate.
