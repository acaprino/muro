# Check scope and absorbed names — 2026-11-13

Record for [ADR-0018](../adr/ADR-0018-checks-scoped-to-the-step-intent.md) and
[ADR-0019](../adr/ADR-0019-absorbed-originals-named-at-discovery.md). The owner
pasted a Claude Code session run in Shinatama on the Ethel project
(`D:\Projects\todoist-craft`) and, after the analysis, called the two findings
"errori gravissimi".

## Evidence from the session

- Marionette 0.2.0, loaded by Shinatama from `D:\Software\Shinatama\data\marionette-claude`
  with `--plugin-dir`. The session transcript is not under `~/.claude/projects/`;
  the run state is `D:\Projects\todoist-craft\.marionette\` (`classification.json`,
  `state.json`, `map.md`, `checks-1.json`, `checks-2.json`).
- Classification: `design-options#1` (`ui.design-variations`), then `design-options#2`
  (`ui.tweak-controls`). Completed `map.md`: twelve check lines for two steps,
  including `tweaks_update_and_persist (design-options#1): pass — Stesso file: …`
  and `options_differ_in_one_sentence (design-options#2): pass`.
- Before the owner asked "stai usando marionette?", three design requests went to
  the project's own UI Pro Max copy, as Ethel's `AGENTS.md` line 158 requires.
- User scope (`~/.claude/settings.json`, `~/.claude/skills/`): enabled plugins
  `ui-ux-pro-max@ui-ux-pro-max-skill`, `taste-skill@taste-skill`,
  `i-have-adhd@i-have-adhd`; skills `design-taste-frontend`, `landing-page-design`,
  `figma-designer`, `motion-design`, `gsap-scrolltrigger`. All eight names are in
  Marionette's `plugin.replaces`.
- Generated umbrella description (0.2.0): 1023 characters, AI text cut at
  "or steering what...", ending "Never invoke original absorbed skills." with no
  name anywhere in the twelve entry descriptions.

## Replay of the defect on the previous runtime

`git archive 271bd6f` into the scratchpad, then the session's decision replayed
with `python -I replay_head.py <archive>`:

```
HEAD step #1 checks: [all six]
HEAD not-applicable: status must be pass, fail or not-tested
HEAD step #2 checks: [all six]
HEAD after both steps, mode: checks
HEAD complete: Cannot complete map: missing check results for design-options#1.tweaks_update_and_persist,
  design-options#1.panel_hidden_when_off, design-options#2.options_differ_in_one_sentence,
  design-options#2.both_ends_covered, design-options#2.recommendation_given
HEAD accepted a variations check on the panel step: True
```

## What changed

- `muro/core.py`: `intent_checks`, `check_conditions`, `Capability.checks_for`,
  `validate_check_scope`, `CHECK_STATUSES`, and the `after` rule.
- `muro/runtime.py`: step intent lookup, scoped `checks` and `check_conditions` in
  step, direct and checks results; rejection of a foreign check or an unconditioned
  `not-applicable`; scoped completion; scoped state validation.
- `muro/routing.py`: scope and conditions in the catalog digest when declared.
- `muro/entries.py`, `muro/adapters.py`: `absorbs`, the appended sentence, the
  shorter umbrella suffix, the SKILL.md protocol lines on scoped checks and the
  fourth status.
- `muro/guide.py`, `muro/guide.html`: intents list their checks, checks show their
  condition, an example keeps each step of a repeated capability (it collapsed
  them into one before) and the status counts steps.
- Prompts: `intake.md` (both fields), `harmonizer.md` (rule 6 check scope;
  `absorbs`).
- Marionette: `intent_checks` on the 15 multi-intent capabilities, 14
  `check_conditions`, `absorbs` on all 12 entries, a harmonization record in
  `ROUTER.md`, the guide example "Temi a confronto e pannello per provarli" and
  two eval cases (`named-original-ui-pro-max`, `theme-variations-then-panel`).
- Docs: ADR-0018, ADR-0019, the ADR index notes, FRD-0001 REQ-006/010/011/013
  extended and REQ-022/023 added, `AGENTS.md`, `README.md`.

## Commands and results

| Command | Result |
|---|---|
| `python -m pytest -q tests/test_check_scope.py` | 18 passed (17 plus the guide test) |
| `python -m pytest -q tests/test_absorbed_names.py tests/test_discovery_entries.py tests/test_ponytail_intake.py tests/test_tokeneconomizer_intake.py tests/test_audit_p0.py` | 50 passed |
| `python -m pytest -q tests/test_check_scope.py tests/test_release_guide.py` | 32 passed |
| `python muro_build.py --manifest examples/marionette/sources.json --validate` | `OK: capabilities and ROUTER.md valid` |
| `python muro_build.py --manifest examples/marionette/sources.json --build --out <scratch>/build` | built; umbrella description 999 characters, AI text whole; `marionette-web-design` 563 |
| `python -m pytest -q` (full suite) | see "Full suite" below |

Three earlier tests recorded every check of a capability on every step and one
asserted `palette_applied: pass` on a landing-strategy step: they now record the
step's own list (`tests/test_audit_p0.py`, `tests/test_audit_p1.py`). One fixture
chained `motion-principles` after `visual-direction`, now invalid under the `after`
rule; it chains `aesthetic-direction` instead (`tests/test_runtime.py`).

### Full suite

First full run after the changes: `2 failed, 502 passed, 8 skipped`. Both
failures were this change's own: Marionette's `ROUTER.md` reached exactly 80 text
lines, and `tests/test_ai_routing.py` appends a blank line with a fixture row
(the record now takes 2 lines, 79 in all); the eval fixture in
`tests/test_lessons.py` gave a capability expected twice no `step_id` (it now
numbers repeated steps and gives each its own intent). Both files then passed
(80 tests with `tests/test_check_scope.py`). Final full run: `504 passed, 8 skipped` (exit 0, 7 min 4 s).

## Live host runs (Claude Code 2.1.323, owner's real user scope)

Recipe from `AGENTS.md`, in an empty project holding only a small `settings.html`,
one session at a time, with the owner's installed plugins and skills left as they
are (the eight absorbed originals among them):

`claude -p "<request>" --plugin-dir <adapter> --permission-mode dontAsk --allowedTools "Skill" --output-format stream-json --verbose --max-budget-usd 2 --no-session-persistence`

A = Marionette 0.2.0 (the Shinatama copy), B = this build. Named request: "usa ui
pro max per rivedere la pagina settings.html e renderla più ordinata, fluente e
completa". Plain request: "rivedi la pagina settings.html e rendila più ordinata,
fluente e completa". Loaded plugins in every init event: marionette, superpowers,
ui-ux-pro-max, frontend-design, playwright, i-have-adhd, codebase-map,
senior-review and four `cc-plugin-*`; the skill `design-taste-frontend` was listed.

| Run | Adapter | Request | Skill invoked | Marionette classification | Cost (USD) |
|---|---|---|---|---|---:|
| A1 | 0.2.0 | named | `ui-ux-pro-max:ui-ux-pro-max` (original) | not reached | 1.77 |
| A2 | 0.2.0 | named | `ui-ux-pro-max:ui-ux-pro-max` (original) | not reached | 1.36 |
| B1 | this build | named | `marionette:marionette-web-design` | design-guidance, then design-review (`ui.polish-pass`) | 1.32 |
| B2 | this build | named | `marionette:marionette-web-design` | design-guidance, then design-review (`ui.polish-pass`) | 1.19 |
| A3 | 0.2.0 | plain | `marionette:marionette-design-review` | design-review (`ui.polish-pass`) | 1.22 |
| B3 | this build | plain | `marionette:marionette-design-review` | design-review (`ui.polish-pass`) | 1.46 |

B differs from A by every change in this record, and 0.2.0 is the released package, not this commit without the change; before a skill is chosen the host reads only the skill descriptions, where the two differ by the `absorbs` sentences and the umbrella's suffix.

Total 8.33 USD. Sample: two sessions per version for the named request, one per
version for the plain one. What it shows: with the original installed, a request
that names it went to the original every time on 0.2.0 and to Marionette every
time on this build; an unnamed request went to Marionette on both. So in the Ethel
session the unnamed requests were decided by the project rule (`AGENTS.md` line
158), which this test project does not have, and the named one by the missing
name. Not shown: behaviour inside a project with such a rule, other models,
larger samples.

Every session was denied `Write` on `settings.html` and `Bash` outside the
launcher's pre-approved calls (the recipe allows only `Skill`), so no page was
changed: the runs measure the choice of skill and the start of the coordinator.
The six runs shared one test project, so later runs met earlier `.marionette/`
state: B3 found A3's map, got "Saved state ... has an outdated catalog_digest",
and continued with a new map, the documented second-version path. The skill
choice comes before any state is read. No session folder was left under
`~/.claude/projects/` (`--no-session-persistence`).

## Not executed

- The routing eval was not run against a model for the two new cases.
- No package version bump, release, commit or push.
- `--check-sources` was not run: no source pin or selected path changed.
- Codex, Pi, OpenCode and Hermes were not run live; their SKILL.md files carry the
  same generated text.
- Ethel's `AGENTS.md` rule, the user-scope originals and Shinatama's launch
  arguments were not changed: they are the owner's configuration.

## After this record

At the owner's request the three absorbed plugins in user scope were uninstalled
with `claude plugin uninstall <id> -s user`: `ui-ux-pro-max@ui-ux-pro-max-skill`,
`taste-skill@taste-skill`, `i-have-adhd@i-have-adhd` (all three reported
"Successfully uninstalled"; `claude plugin list` no longer shows them). The five
standalone skills in `~/.claude/skills/` stay. musashi-terminal's checkup
(`D:\Projects\horness-launcher\src\checkup\claude.cpp:102`, `installAdhdClaude`)
installs the native i-have-adhd plugin again whenever it finds it missing; the same
day horness-launcher was changed (uncommitted) to leave an uninstalled plugin out
when its default marker shows it set the configuration up before, effective once
`musashi-terminal.exe` is rebuilt. Later live runs see a different user scope from
the six above.
