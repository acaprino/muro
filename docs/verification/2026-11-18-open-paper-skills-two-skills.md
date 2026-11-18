# Marionette: explain-anything-html absorbed, open-paper-skills narrowed to two skills — 2026-11-18

## Status and authorization

The owner asked: "controlla come viene usata la skill explain anything html".
It was not used (below). Told that, and that taking only that skill from
open-paper-skills would remove six capabilities, the owner answered "lasciamo
anche solo ricerca paper": from that source the package takes
explain-anything-html and paper search, and nothing else.

On the owner's "go" the work was committed on the short branch
`explain-anything-intake` (`88af670`, the factory rule; `675f46d`, the package)
and pushed, then merged into `develop` as `f343b6d`. The release was held, see
"The release does not fit Shinatama's sync", until the owner chose to raise
Shinatama's bound; version 0.4.0 follows in the commit that adds this sentence.
Nothing was installed on the owner's machine.

## What was found

| Fact | Where |
|---|---|
| `skills/explain-anything-html/**` was in `excluded_paths` | `examples/marionette/sources.json`, since commit `7558339` (2026-11-12) |
| Recorded reason: "The need (interactive explainer of a paper) is served by explain-this; the second one derives from a third-party gist." | `2026-11-11-open-paper-skills-intake.md`, which also says the selection was the intake AI's, "not separately approved text" |
| The skill was never read: an excluded file is not exported to the intake workbench | `muro/factory.py`, `prepare_intake` |
| No copy of the skill is installed on the owner's machine | searched `~/.claude` and the Shinatama data folder |

The skill (33 lines, read whole at the pin `f85fd3dc`, which is still the
upstream head) and the capability said to cover it differ on both points that
matter:

| | explain-anything-html | interactive-explainer (explain-this) |
|---|---|---|
| Starts | on any request to explain or understand a paper, post, article, documentation or concept, "even if they don't explicitly ask for HTML" | only on a request for an interactive explainer; its entry ended "Not for an explanation wanted in the chat." |
| Makes | one long HTML page: background, intuition, walkthrough, a quiz of five questions; saved outside the repository under a dated name | an article with three to five canvas figures, after an approved outline, behind a blocking claim check |

## What changed in the package

- `html-explanation` is a new capability from `skills/explain-anything-html/SKILL.md`
  (the whole skill, packaged as `SKILL.source.md`): role
  `explanation-authoring`, intent `explanation.html-page`, output
  `explanation_file`. It conflicts with `interactive-explainer` (one owner per
  explanation) and reads `literature_findings` when a search ran first.
- Removed: `paper-wiki`, `paper-figure`, `research-practice`, `research-pitch`,
  `session-handoff`, with their router rows, the entry `marionette-research`,
  five eval cases, one guide example and six names in `plugin.replaces`. The
  catalog goes from 41 capabilities to 37 and from 16 entries to 15.
- open-paper-skills selects three files (60,559 bytes), where it selected seven
  skills with their scripts and references; its runtime dependencies are down
  to `uv` or Python.
- The entry `marionette-explainer` now starts on a request to explain or
  understand, "even when HTML is not asked for", and no longer says "Not for an
  explanation wanted in the chat".
- The always-on policy has one more line marked `[Marionette]`, under
  i-have-adhd's break-rule 1 (see "Live host").
- Three eval cases and two guide examples were added for the new capability.

Origin of the skill's text: it says it is adapted from `explain-diff-html`,
"based on Geoffrey Litt's original skill", a public gist. The gist's two files
carry no licence statement (read through the GitHub API on 2026-11-18). The
licence the gate verifies is the repository's MIT. This is open for the owner
and is written in the capability's Sources.

## What changed in the factory

`prompts/intake.md`: a skill is read before it is left out as a duplicate; the
comparison goes in its `dropped` decision; only the owner narrows a source
without that reading. ADR-0026 has the amendment. No code enforces it.

## Tests, failing first

| Test file | Red | Green |
|---|---|---|
| `test_open_paper_skills_intake.py`, rewritten | 10 failed | 10 passed after the package change |
| the same, second-pass test | 1 failed, 10 passed | passed, in the run of 49 below |
| `test_source_coverage.py`, prompt rule | 1 failed | 1 passed |
| `test_policy_original_wording.py`, the policy line | 2 failed, 6 passed | passed, in the run of 88 below |

Defects of this change that the targeted tests found, and their correction:

- Seven assertions pinned the old catalog (`41` capabilities in four files,
  `81` router rows in one, `research-pitch` as a fixture, `conflicts == []` for
  the explainer): updated.
- The longer plugin description pushed the built umbrella skill past 1,024
  characters, so its text was cut (`test_absorbed_names.py`): shortened to 886.

Targeted runs on the working tree, in this order (none is the full suite; a
later change was followed only by the runs listed after it):

| Files | Result |
|---|---|
| 24 files that read the catalog, its examples and its delivery document | 334 passed in 369.99s |
| `test_audit_p1`, `test_lessons`, `test_absorbed_names`, `test_open_paper_skills_intake`, `test_explain_this_intake`, `test_audit_p0`, `test_discovery_entries`, `test_source_coverage` | 81 passed in 35.67s |
| policy, delivery, i-have-adhd, ponytail, custom-instructions and policy-binding tests, after the policy line | 88 passed in 115.81s |
| `test_open_paper_skills_intake`, `test_capabilities_read_originals` without its release tests, after the last body edit | 49 passed in 22.35s |

`--validate`: `OK: capabilities and ROUTER.md valid` on the final tree.
`--check-sources`: `OK: all sources and plugin identity valid` (1 min 20 s),
run before the policy line and the last body edit, which change no source.
`--prepare-intake open-paper-skills`: 3 files selected, 275 left out, one named
entry (`.gitignore`, a coincidence of name, declared). `--build`: twice, 4 min
10 s the first time; release 280 MB.

## Live host: Claude Code

Claude Code 2.1.327, the package alone (`--setting-sources project,local
--strict-mcp-config`), `--plugin-dir` on the staged adapter, `--permission-mode
dontAsk`, `--no-session-persistence`, each session in its own empty folder, one
at a time. Request A: "Spiegami come funziona il consenso Raft, partendo dalle
basi: voglio capirlo davvero." It does not name HTML.

| # | Build | Model | Allowed tools | Request | Result | Turns | Cost |
|---:|---|---|---|---|---|---:|---:|
| 1 | without the policy line | `claude-haiku-5-5` | Skill, Read, Write | A | no skill invoked; a long explanation in the chat, with headers | 1 | $0.0120 |
| 2 | the same | `claude-haiku-5-5` | Skill | list the Marionette skills | 16 listed, the umbrella and the 15 entries of `entries.json`; `marionette-explainer` with the new description | 1 | $0.0041 |
| 3 | the same | `claude-fable-5-2` (the account's default) | Skill, Read, Write | A | `marionette-explainer` invoked; the coordinator was never run; the explanation was written in the chat | 3 | $1.0733 |
| 4 | with the policy line | `claude-haiku-5-5` | Skill, Read, Write, Edit, Bash(python *) | A | skill, `plan`, classification `html-explanation`, the page written to the system temp folder under `2026-11-18-explanation-…`, outputs recorded; 0 denials | 11 | $0.0244 |
| 5 | the same | `claude-haiku-5-5` | the same | "Spiegami in due righe cos'e' un mutex." | no skill; two lines in the chat | 1 | $0.0024 |
| 6 | the same | `claude-haiku-5-5` | the same | "Fammi capire bene come funziona l'attention nei transformer." | skill, coordinator, page written under the user's Documents folder; 0 denials | 12 | $0.0205 |
| 7 | the same | `claude-fable-5-2` | the same | A | skill, `plan`, classification `html-explanation`, a page of 28,987 characters sent to the file tool; **not saved** (below) | 11 | $1.6205 |

Seven sessions, $2.76 in all, $2.69 of it in the two on the default model.

What sessions 1 and 3 showed: absorbing the skill was not enough. The always-on
policy carries i-have-adhd's first break-rule in its own words, "User asks to
'explain' or 'walk me through.' Explain fully […] Add headers", and both hosts
answered as that rule says. Two sources owned the answer to "explain this". The
added line names one owner for an explanation of a paper, post, article,
documentation or hard concept: the page, through `marionette-explainer`; the
rule keeps the reply and any explanation wanted in the chat.

The page of session 4 was read as a file: four `h2` sections (Background,
Intuizione, Percorso guidato, Quiz), a table of contents, one `style` and one
`script` block, no external resource, two `pre` blocks, five callouts. It was
not opened in a browser.

Session 7 saved nothing. Its file name was the one session 4 had already
written, the host's Write refused to replace a file it had not read, and the
session's budget (`--max-budget-usd 2`) did not allow a second attempt; the
model said so and gave a short version in the chat. Two more denials were this
test's own permissions (PowerShell, Grep). The capability now says what to do
when the dated name already exists. That text was not run live.

Limits of this evidence:

- Sessions 1 and 4 differ in two things, the policy line and the allowed tools.
  Session 1 never tried a tool, so the tools are an unlikely cause, but it is
  one sample each.
- On the default model the page was generated and never saved: the complete
  path to a saved file is shown on Haiku only (two of two).
- Three files are left on the owner's machine by these sessions: the two pages
  (`%TEMP%\2026-11-18-explanation-raft-consenso.html`,
  `Documents\2026-11-18-explanation-attention-transformer.html`) and nothing
  under `~/.claude/projects/` (110 folders before and after).

## The full suite and the routing evaluation

`Tests` workflow, run 44277975289 on `675f46d`: `733 passed, 16 skipped in
192.16s`, then `OK: capabilities and ROUTER.md valid`, `OK: all sources and
plugin identity valid` and the build. No fetch timeout.

Routing evaluation, 75 cases: `--prepare-eval`, then a separate model session
that was given only the prepared `PROMPT.md` and `contexts.json` wrote the
decisions; `--score-eval` gave **74 of 75**. The miss is `scroll-css-only`
(expected `motion-principles` then `css-scroll`, got `css-scroll` alone), a
case older than this change. The three new cases matched
(`explain-paper-no-html-word`, `explain-concept-as-html`,
`find-paper-then-explain`), and so did `summary-in-chat` (no match) and
`paper-explainer-not-wiki` (`interactive-explainer`).

Limit of that run, reported by the classifier itself: several case ids name the
intended route (`…-stays-review`, `…-stays-explainer`, `…-not-doc-drift`) and
are visible in both input files, so it is not fully blind. It also named five
cases it found ambiguous: `scroll-css-only`, `ponytail-visual-only`,
`th-proofread-file`, `db-migration`, `ponytail-implement-no-review`.

## The release does not fit Shinatama's sync

The owner's sessions get Marionette from Shinatama, which follows the highest
`marionette-v*` release of this repository at every start (Shinatama ADR-0052;
its log on this machine: `marionette: UpToDate("marionette-v0.3.0")`,
2026-11-18). Its sync refuses a release asset over `MAX_ASSET_BYTES`, 128 MiB
(134,217,728 bytes, `crates/engine/src/marionette.rs` in Shinatama), and then
keeps the copy it has.

A fresh staged build of this tree, zipped as the `Release Marionette` workflow
zips it:

| | Measured | Shinatama's bound |
|---|---:|---:|
| Zip asset | 197,039,241 bytes (187.9 MiB) | 134,217,728 bytes (128 MiB) |
| Files | 12,060 | 16,384 |
| Tree | 269,446,410 bytes (257.0 MiB) | 512 MiB |
| Largest file | 1,644,144 bytes | 32 MiB |
| Deepest path | 12 components | 24 |

The size comes from the intake of 2026-11-17, not from this change: each of
the five adapters holds about 2,014 files and 43 MiB, and the release root
another 1,897 files under `scripts/`, because taste-skill travels whole with
its images in every one of them. A 0.4.0 published as it is would be refused,
and the owner's sessions would stay on 0.3.0. So nothing was published: the
choice (raise Shinatama's bound, or make the release smaller) is the owner's.
Yesterday's record noted the 283 MB release as a cost and did not check it
against Shinatama.

## After the bounds were raised in Shinatama

The owner chose to raise the bound. Shinatama `develop`, `5e48ab6`: zip 512 MiB,
tree 2 GiB, 65,536 files, lock 16 MiB, each four times what it was. The zip of
this tree (197,039,241 bytes) was installed through Shinatama's own sync code,
its manual test `real_zip_installs_through_system_tar`, twice; the published
0.3.0 zip once, for comparison. One machine, a store under the user's temp
folder.

| | 0.3.0 zip | This build |
|---|---:|---:|
| Install and verification of the four adapters | 46.6 s | 191.5 s, 203.2 s |
| Files, and the lock Shinatama writes | 2,484; 553,933 bytes | 12,061; 2,732,682 bytes |
| Files of the Claude Code adapter | 418 | 2,014 |
| A Claude Code launch: lock read, verification, private copy | 0.30 to 0.32 s | 2.9 s |
| The launch that first reads a copy the launch before wrote | 5.9 s | 28.4 s |

The longest path in the release is 143 characters. The cause of the one slow
launch was not established; Shinatama gives the preparation of a Claude Code
launch 60 s.

## Not executed

- The installation: Shinatama on the owner's machine is 0.1.0 and has the old
  bound. It follows 0.4.0 once it runs a build of its `develop` or a release
  after 0.1.1, which is the owner's pull request there.
- A session from Shinatama's desktop app with the new package, and Shinatama's
  `Verify` workflow beyond its `plan` check, which fails on its `develop` before
  the Rust checks.
- Codex, Pi, OpenCode and Hermes. On Hermes the policy is over the section cap
  and goes through `pre_llm_call`; the new line was not checked there.
- A request that should go to `interactive-explainer` (an interactive explainer
  asked for as such) and a search followed by an explanation: fixtures only.
- A paper or an article given as a file or a link: both live subjects were
  concepts explained from the model's own knowledge.
- The second-pass text of step 8, and a final build after it.
