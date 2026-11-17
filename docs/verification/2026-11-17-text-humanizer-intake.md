# Marionette: text-humanizer intake — 2026-11-17

## Status and authorization

The owner asked for this intake during the zero-slop-design one ("poi fai intake anche di
https://github.com/acaprino/text-humanizer", 2026-11-17). The source was added, read, classified and
harmonized in the working tree on branch `intake/zero-slop-design`. Nothing was committed, released,
installed or version-bumped: `plugin.version` is still 0.2.1.

## Pinned source and rights

| Source | Pin | Commit | Licence |
|---|---|---|---|
| [acaprino/text-humanizer](https://github.com/acaprino/text-humanizer) | `head`: no release and no tag upstream | `c4d8276cd0c7dea91a60c9ba49431785d07aea1c` (2026-11-17T11:23:24Z) | Root MIT, "Copyright (c) 2025 Alfio" |

- The repository is the owner's own, created on 2026-11-17; plugin version 2.0.0 in its manifest.
  A `head` pin moves with every upstream push: `muro baseline` reports it `behind` as soon as one lands.
- `skills/humanize/references/upstream-license.txt` is the MIT license of blader/humanizer
  (Copyright (c) 2025 Siqi Chen), from which `rules.md` says portions derive. It ships with the
  references and is declared in `notice_paths` (ADR-0025); the staged `NOTICE.md` points at it.
- The upstream README states that some ideas come from a CC-BY-SA-4.0 skill
  (hypnosdesign/claude-skill-scrittura-italiana) and were rewritten without taking its text. That
  statement was not verified: the other repository was not read.
- The README also says that none of the cited studies was re-read for version 2.0.0. They were not
  read here either.

## What was read

Read whole: `skills/humanize/SKILL.md`, `agents/text-humanizer.md`, `references/rules.md`,
`references/italiano.md`, `README.md`, both manifests, `upstream-license.txt`.

Read in part: `references/pattern-catalog.md` (every section; specimen lines longer than 420
characters were cut in the reading).

Not read: `evals/**` beyond the file names.

## What each part became

| Source part | Result |
|---|---|
| `humanize` skill, `text-humanizer` agent, `rules.md`, `italiano.md`, `pattern-catalog.md` | `text-humanize` / `writing.humanize-prose`; the originals packaged under `scripts/text-humanizer/` |
| `upstream-license.txt` | Packaged with the references; declared third-party notice |
| `/text-humanizer:humanize`, its argument hint, the TRIGGER lines of skill and agent | Dropped as activation; register, level and score are read from the request |
| `README.md`, `.claude-plugin/plugin.json` | Read as evidence, `intake_only_paths` |
| `evals/**`, `.claude-plugin/marketplace.json` | Outside the selection |

Two decisions with their reasons are in `examples/marionette/delivery.json`. Nothing is session-wide:
as permanent text the 25 patterns and the dash rule would rewrite every reply of the package. The
discovery entry is `marionette-writing`; it absorbs `text-humanizer` and `humanize`.

## Harmonization

- **One capability.** The skill prepares the brief, the agent rewrites, the references hold the rules:
  one procedure. The agent file travels as the instructions of an optional subagent; without one the
  step applies `rules.md` itself, which is the source's own fallback.
- **Paths.** The agent file names `${CLAUDE_PLUGIN_ROOT}/skills/humanize/references/rules.md`, the
  original plugin's root. The step gives the subagent the absolute paths under
  `<package_root>/scripts/text-humanizer/`.
- **Level without a command.** "Running this command with no other verb means `full`" has no command
  here: a request that only asks for the humanizer means `full`; otherwise the level follows the verb
  and is `light` when unsure, as the agent states.
- **Not resumable.** A rewrite of pasted text is one direct step. The write-back question comes after
  the report and only for a file; its check is conditional on a file input.
- **Boundaries.** `explainer-fact-check` checks claims against sources, `research-pitch` checks a
  pitch for overclaiming, the Office capabilities read and write Word, PowerPoint and PDF files. None
  rewrites prose for how it reads. No existing capability was changed.
- **Session policy.** The final text is the user's content: the policy on replies shapes the words
  around the report, never the text inside the fence.

## Commands and results

| Command | Result |
|---|---|
| `python muro_build.py --manifest examples/marionette/sources.json --validate` | `OK: capabilities and ROUTER.md valid` |
| `python muro_build.py --manifest examples/marionette/sources.json --check-sources` | `OK: all sources and plugin identity valid` (the head commit matched the remote HEAD) |
| `python muro_build.py --manifest examples/marionette/sources.json --build --out <scratch>` | Built; skill, agent and four reference files under `scripts/text-humanizer/`; `marionette-writing` among the 16 discovery skills of the Claude Code adapter |
| `muro eval prepare`, classification by a fresh agent, `muro eval score` | 76 of 77; the four cases of this source matched |
| `python -m pytest -q` | See "Test results" |

The eval is described in `2026-11-17-zero-slop-design-intake.md`. The subagent named
`th-proofread-file` as a case where it hesitated between this capability and `no_match`; it chose
this capability, as expected.

### Test results

Run locally on the final tree: `tests/test_text_humanizer_intake.py`, `tests/test_zero_slop_design_intake.py`,
`tests/test_notice_paths_gate.py`, `tests/test_capabilities_read_originals.py` (without its build test) and
`tests/test_lessons.py`: 101 passed, 1 failed. The failure was a row count pinned in `tests/test_lessons.py`
(76, now 81 with the five new router rows); it was corrected and not run again locally.

Earlier local runs, on intermediate states of the tree, found and led to fixing: the plugin description over
the 1024-character bound of the umbrella skill, capability counts pinned at 36 in four tests, and the word
"wins" that `tests/test_capabilities_read_originals.py` asks of every body.

The full suite was not completed locally: it takes about an hour on the owner's machine and was stopped at
the owner's request ("skippa la suite"), after showing two failures in its first third that were not
identified. By the owner's rule of the same day it runs in GitHub Actions, in the `Tests` workflow added
with this change. The result of that run is recorded below once the branch is pushed.

`Tests` workflow: not yet run when this record was first committed.

## Not executed

- No live host session: the capability was not run in any host, so the subagent dispatch, the
  write-back question and the cost per task are not measured.
- The upstream's own evals (`claude plugin eval`) were not run.
- No install of the staged release, no commit, no version bump, no release.
