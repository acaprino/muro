# First live host test: Marionette in Claude Code — 2026-11-11

## Setup

- Host: Claude Code 2.1.322, headless (`claude -p`), model `claude-opus-5-5`, the
  owner's real user configuration (77 skills listed, 10 plugins loaded including
  `superpowers`, `ui-ux-pro-max` and `frontend-design`).
- Marionette loaded for the session only with `--plugin-dir` from a fresh staged
  release (`adapters/claude-code`); nothing was installed into the owner's config.
  The `init` event listed `marionette:marionette`.
- Each request ran in its own empty test project in the session scratchpad, with
  `--permission-mode dontAsk`, `--allowedTools "Skill,Read,Glob,Grep,Edit,Write,Bash(python *)"`,
  `--max-budget-usd 2` and `--no-session-persistence`. No network, node or npm.
- These are real host runs with real model decisions, not fixtures. One run per
  request: a single sample, not a measured rate.

## Results

| Run | Request (Italian, natural) | What the host did | Marionette | Cost / time |
|---|---|---|---|---|
| p1 | Palette, font e accessibilità per la dashboard di un'app fintech, senza codice | Invoked the installed `ui-ux-pro-max:ui-ux-pro-max` plugin (2.15.0, the same release Marionette pins) and ran its own `search.py`; sound recommendations | not invoked | $0.93 / 89 s |
| p2 | Disegna in Figma la landing page di Lumo, senza struttura dei contenuti | Invoked `superpowers:brainstorming` first, read the README, said no Figma connector is active, asked one question | not invoked | $0.71 / 21 s |
| p3 | Rinomina `calcTotal` in `computeTotal` in `app.js` | Tried `abracadabra-refactoring` (its MCP server was down), renamed by hand, all 3 references correct; no `.marionette/` created | not invoked (correct) | $1.12 / 23 s |
| p4 | p2's request with explicit `/marionette:marionette` | Ran `muro.py plan`; output 29.4 KB, which Claude Code persisted to a file and the host read back; classified correctly (landing strategy before Figma), saw that Figma MCP needs the owner's account; its second `plan` with the classification (13-line heredoc to stdin) was denied; reported both blocks and offered two paths | invoked; first call only | $0.68 / 53 s |

Total cost: $3.44.

## Findings

1. **Discovery.** In the owner's real environment Marionette was chosen 0 of 3
   times; it was relevant in p1 and p2. It lost to the still-installed original
   (`ui-ux-pro-max`) and to a process skill that must run before any creative
   work (`superpowers:brainstorming`). p3 shows that it does not capture generic
   coding.
2. **Semantic routing works when invoked.** p4's host read the catalog,
   selected the conditional prerequisite correctly and stopped on an integration
   that cannot be installed, as `prompts/classify.md` asks.
3. **Payload size.** The `classification-required` output (29.4 KB) exceeds the
   host's inline tool-output limit, so every new task costs an extra file read.
4. **Permission friction.** A multi-line heredoc command does not match the
   `Bash(python *)` rule that the single-line first call matched. In an
   interactive session that is a permission prompt per call; no `allowed-tools`
   is declared in the generated `SKILL.md`.

## Fixes and live rerun (same day)

Changes (ADR-0013 amendment): `plan --compact`, classification rules embedded in
`SKILL.md`, one-line calls with JSON written by the host into `.<slug>/`,
Claude Code `allowed-tools`, `.<slug>/.gitignore`. TDD: `tests/test_audit_host.py`
failed first (3 of 4: no `--compact`, no `.gitignore`, no embedded rules), then
passed; the full suite is **247 passed in 67.49s** and `--validate` is OK. The
compact output's first measure was 16,874 bytes against a guessed 16,000-byte
bound; the bound was set to 20,000 with the live run below as the real check.

Rerun p4b: same request with explicit `/marionette:marionette`, a fresh staged
release, and `--allowedTools "Skill"` only, so every other call had to be
approved by the skill's own `allowed-tools`:

| Step | Result |
|---|---|
| `plan --compact` | 16,890 characters, shown inline (no persisted file) |
| Write `.marionette/classification.json` | allowed by `Edit(./.marionette/**)` |
| `plan --classification <file>`, one line | allowed by `Bash(python ${CLAUDE_PLUGIN_ROOT}/skills/marionette/muro.py *)`; the substituted path used forward slashes on Windows and matched |
| Outcome | `needs_clarification`: two-step plan (landing strategy, then Figma) explained in plain words, Figma integration missing, two options offered |
| Project files | `README.md`, `.marionette/.gitignore` (`*`), `.marionette/classification.json` |
| Permission denials | 0 |
| Cost / turns / time | $0.44 / 6 / 42 s (p4: $0.68 / 7 / 53 s, with 2 denials) |

## Discovery rerun with the absorbed originals switched off (same day)

The originals were switched off for the session only, with a settings file passed
by `--settings`: `enabledPlugins` false for `ui-ux-pro-max@ui-ux-pro-max-skill`,
`taste-skill@taste-skill` and `mattpocock-skills@mattpocock`, and `skillOverrides`
`"off"` for the personal skills `design-taste-frontend`, `figma-designer`,
`gsap-scrolltrigger`, `landing-page-design` and `motion-design`. The owner's
`~/.claude` was not changed. Other design-related skills stayed on (`superpowers`,
`frontend-design`, `impeccable`, `office@mukade`, Claude Code's bundled skills).
The `init` event confirmed it: 65 skills listed instead of 77, none of the
originals, `marionette:marionette` listed. Same requests, projects and tool limits
as p1 and p2; one sample each.

| Run | Skills invoked, in order | Marionette | Cost / time |
|---|---|---|---|
| p1 (dashboard palette, fonts, accessibility) | `dataviz` (bundled with Claude Code; its description names dashboards) | not invoked | $0.81 / 72 s |
| p2 (Lumo landing in Figma) | `superpowers:brainstorming`, then `marionette:marionette` | loaded, but no `plan` call: the host asked one brief question first (brainstorming's rule), explained how to connect Figma and stopped | $0.72 / 32 s |

Finding: removing the absorbed originals is necessary but not sufficient. With
description-based discovery, the umbrella skill also loses to any skill whose
description is closer to the request (p1), and a process skill that must run
before creative work takes the first turn (p2).

## Discovery entries rerun (ADR-0014, same day)

Fresh staged release with Marionette's four `entries.json` entries. The init
listing showed only `marionette:marionette` among user-invocable commands (the
entries are `user-invocable: false`), yet the model invoked an entry: hidden
from the slash menu, visible to the model. Same requests, projects and tool
limits as before; `a` with the owner's configuration unchanged (77 skills), `b`
with the absorbed originals off for the session (65 skills); one sample each.

| Run | Skills invoked | Marionette protocol | Denials | Cost / time |
|---|---|---|---|---|
| p1a (originals on) | `marionette:marionette-web-design` | `plan --compact`, `plan --classification`, design-guidance step running the packaged `search.py` three times and a contrast calculation | 0 | $0.80 / 78 s |
| p1b (originals off) | `marionette:marionette-web-design` | same, `search.py` five times | 0 | $0.83 / 85 s |
| p2a (originals on) | `figma-designer`, `landing-page-design` (both absorbed originals, personal skills) | none; the originals wrote `lumo-landing-struttura.md` | 0 | $0.78 / 87 s |
| p2b (originals off) | `superpowers:brainstorming`, `marionette:marionette-web-design` | `plan --compact`, `plan --classification`; stopped on the missing Figma integration | 0 | $0.64 / 39 s |

Before entries the same four cells gave Marionette 0 invocations with a running
protocol. With entries it is chosen in 3 of 4; the loss is to the two absorbed
originals whose descriptions claim any Figma or landing-page work. Entries win
against bundled and unrelated skills; the duplicated originals still compete.
Total cost of this rerun: $3.05.

## First routing eval (ADR-0015, same day)

`--prepare-eval` on Marionette (14 cases, 23 KB prompt without expectations), then
one headless Claude Code session (`claude-fable-5-2`, tools limited to Read and
Write) wrote `decisions.json`; `--score-eval` validated and compared. Cost $2.49,
3 turns, 57 s, 0 denials. One run, so a first reading and not a rate.

Result: **12 of 14**. All 14 decisions passed runtime validation. The two differences:

| Case | Expected | Model | Reading |
|---|---|---|---|
| `scroll-css-only` (animate cards on scroll, CSS only) | css-scroll | motion-principles, css-scroll | The expectation was wrong: the request leaves the motion open, and the motion intent says it is needed before scroll code in that case. Expectation corrected. |
| `db-migration` (write an SQL migration) | no_match | work-map | The expectation was wrong: a source that coordinates software work was absorbed, so software work is in the package's scope and the model was right. Scope follows intake (ADR-0015, rule 0). Expectation corrected. |

With the two expectations corrected the same decisions score 14 of 14; that is a
re-score of one run, not a second measurement. The 12 agreeing cases include the
near-misses (summary in chat refused, hover timing without scroll code, static
site without motion, Figma component without landing strategy, conditional
prerequisite applied for a new landing).

## Engineering entry, live (same day)

Fresh `--build --out` release with five entries, including `marionette-engineering`
(work-map). Small Express project per run; tools limited to Skill, Read, Glob,
Grep (plus Edit for the rename); one sample per row.

| Run | Request | Skills invoked | Marionette | Cost / time |
|---|---|---|---|---|
| small (originals on) | Rename `calcTotal` to `computeTotal` | `abracadabra-refactoring`, then a manual rename, correct | not invoked, as its description intends | $0.90 / 14 s |
| big-a (originals on) | Accounts with login and saved carts, sessions and storage undecided, several days of work: organise it | `superpowers:brainstorming` | not invoked | $1.03 / 37 s |
| big-b (originals off) | same | `superpowers:brainstorming` | not invoked | $0.93 / 31 s |
| big-c turn 1 (originals on, session kept) | same | `superpowers:brainstorming` | not invoked | $0.92 / 25 s |
| big-c turn 2 | "Your recommendations are fine. No more questions: organise the work and start." | none; the host went straight to writing files (denied by the test's tool limits) | not invoked | $1.89 / 134 s |

Finding: for multi-day software work the engineering entry was chosen 0 of 4
times. It did not lose to an absorbed original (the installed wayfinder skill was
not chosen either, and switching originals off changed nothing): it lost to a
process skill whose description claims every creative task first, and after that
to the host's own habit of building directly. A sharper description is not
enough against a skill that declares itself mandatory. Total cost $5.67.

### Correction after the owner's challenge and resumed inspection

The paragraph above records the original interpretation, not an isolated cause.
The owner challenged it ("sei proprio sicuro'") and the response withdrew the
proposed always-on discovery hook. That correction was missing from this record.

The table contains **three independent first-turn engineering sessions**, plus
one continuation of the third session. "0 of 4" counts four request turns, not
four independent trials. All three first turns used the same request. No run in
this table disabled Superpowers. Observing its brainstorming skill first does
not establish that it caused Marionette's absence; the second-turn write denials
also prevent judging completion of the engineering task.

Nor does asking an initial design question establish equivalence to the full
work-map capability (specification, vertical slices, build and review evidence).
Discovery, routing after invocation and delivery quality are separate outcomes.
The web-design observations do not demonstrate that no competing skill exists.

The next diagnostic is a session-only Superpowers ablation with a contemporary
control: the same model, request, initial project, release and tool permissions,
changing only `enabledPlugins["superpowers@claude-plugins-official"]`. Verify the
effective plugin/skill loading in both transcripts before comparing behavior.
Even a positive result from one pair is evidence consistent with interference,
not proof of a general cause or a measured success rate.

No hook or intake change follows from these observations. A discovery reminder
does not itself redefine intake scope, so equating it with the removed
`unrouted` mechanism was also too strong; it is a separate, unvalidated host
mechanism with its own cost. Adding a source to intake would instead change
package content and is not a diagnostic control for the current package.

See [the resumed verification](2026-11-11-engineering-discovery-followup.md)
for the attempted ablation's preparation and its execution boundary.

**Correction, same day.** Every engineering row in the table above is void as a
discovery observation: `marionette-engineering` was not loaded in any of those
sessions. Its description contained `decisions: agreeing`, written as a plain
YAML scalar, so the frontmatter was invalid and Claude Code dropped the skill
without an error. The "0 of 4" measured a generator bug, not a competing skill
and not the host's habits. The fix and the executed ablation are in the
follow-up record.

## Not executed

Interactive sessions, the multi-step `step` flow in a live host, Codex, Pi,
OpenCode and Hermes, any capability body execution beyond the design-guidance
step in p1a/p1b, and repeated runs to measure rates.
