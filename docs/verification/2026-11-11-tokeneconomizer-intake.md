# tokeneconomizer intake into Marionette — 2026-11-11

Owner request: verify the TokenEconomizer integration, destination "In marionette".
Finding first: **no integration existed**. The repository, its branches, the
package's sources and the installed plugins held no trace of it. It was built in
this session; intake and harmonization were done by the session's host LLM.

## Source

| Fact | Value | How it was checked |
|---|---|---|
| Repository | `microsoft/TokenEconomizer`, not a fork, not archived | GitHub API |
| Licence | Apache-2.0, root `LICENSE`; its appendix placeholder is unfilled, so the file carries no copyright line | `--check-sources`; read |
| Release | `v0.1.0`, published 2026-10-26, commit `ec8ff5ec7ed5924520ee71b705a920ee64fe2918` | GitHub API, `git ls-remote` (peeled tag) |
| Pin | `release` `v0.1.0`, as the pin rule requires (ADR-0009) | |
| Head | `81e32e5`, pushed 2026-11-10, ahead of the release | `git ls-remote` |

The source is a hook-driven host plugin, not a set of skills: a Python engine
(51 files, standard library), a dispatcher called by six host events, and a
`te` command line.

## What was absorbed

One capability, `token-economy`, three intents: `cost.economy-report`,
`cost.tool-pruning`, `cost.economy-settings`. The engine, the Python bootstrap,
the three upstream hook manifests and two documents are packaged unchanged under
`scripts/tokeneconomizer/` (63 files). The commands run from the package through
`te_bootstrap.py cli`.

The six default hooks are catalog entries with policy `host-approved`. The
release ships nothing a host registers by itself. Registering or removing them is
a step of the capability, only on the user's explicit request and after
disclosure (ADR-0007 amendment).

Left out: the upstream plugin manifests and marketplace file, the slash commands
and Codex skills as files (their behaviour is in the capability), the Pi
extension, the POSIX `te` and `te-hook` launchers, experiments, tests, assets.

## Checks run

- `--validate`: OK. `--check-sources`: OK, ten remotes; the Apache-2.0 template and the release commit matched.
- `--build --out <scratch>`: built; nine skill folders per host; no `hooks/` folder at any plugin or skill root.
- `tests/test_tokeneconomizer_intake.py`: 7 passed. It builds a real release and runs the packaged engine with an isolated state folder.
- Full suite, temporary files on drive C:: **291 passed in 184.75s**.

## The engine, run for real

All runs used an isolated `TOKENECONOMIZER_HOME`; the owner's `~/.tokeneconomizer` was not touched. Machine: Windows 11, Python 3.13, Claude Code 2.1.322.

| Run | Result |
|---|---|
| `cli doctor`, `status`, `config`, `toolprune show` from the packaged folder | answered; state root writable; `0 folded` on a fresh repository |
| `hook` with a SessionStart payload, a UserPromptSubmit payload, and invalid input | `{}` each time, exit 0; the invalid input left a traceback in `errors.log` (fails open) |
| One real Claude Code session (`claude-haiku-5-5`, add a function and run pytest) with the six hooks registered for that session only through `--settings` | hooks fired; after the session: `1 folded, 193.0k effective tokens`, a priced ledger record, a turn event (2 edits, ended green), tool evidence for pruning; `errors.log` empty; cost $0.03 |

## Live runs through Marionette

Claude Code 2.1.322, `claude-fable-5-2`, the owner's configuration unchanged,
one sample each.

| Request | Entry chosen | What happened | Cost / time |
|---|---|---|---|
| Show what TokenEconomizer learned here and what the sessions cost | `marionette-token-economy` | `plan --compact --focus token-economy`, classification, `direct`; ran `status` and `microskills`; output shown verbatim; 0 denials | $1.32 / 46 s |
| Turn on TokenEconomizer's automatic mode for this project | `marionette-token-economy` | disclosed the six events, the state folder, the automatic deny list, the judge's model calls, the Windows and version limits, and asked for confirmation; **wrote no settings file** | $1.14 / 37 s |

## Routing eval

25 cases, one headless session, `--score-eval`: **25 of 25**, $1.66, 105 s. The
three new cases agreed, including the pricing question refused as `no_match`.
The two small-code-change cases that disagreed two hours earlier agreed this
time: that boundary flips between runs and is still an open harmonization item.

## Limits that are facts of the pinned release

- Its authors verified it on Claude Code 2.1.300 to 2.1.310; this machine runs 2.1.322. It worked in one session here; that is one observation, not support.
- It lists Windows as a limitation (its launcher is POSIX `sh`). The package calls the Python bootstrap directly, which ran here. Later upstream commits mention Windows fixes; they are not in the release.
- The hook entries hold an absolute path to the plugin folder and must be re-registered after the plugin moves or updates.

## Not executed

- The activation step carried through to writing the hooks (it needs the user's confirmation in an interactive session).
- Deactivation.
- `toolprune apply` and `restore`, the automatic deny list after 60 idle minutes.
- The loop guard on a stuck turn, its judge call, micro-skills switched on and its proposer.
- Codex, Copilot CLI, Pi; the upstream Codex and Copilot hook manifests are packaged but unverified here.
- More than one session of learning.

Cost of this intake's live runs: $4.15.
