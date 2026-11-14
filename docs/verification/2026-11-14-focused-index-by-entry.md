# Focused plan indexed by discovery entry — 2026-11-14

## Why

After the EGM intake (`2026-11-14-egm-intake.md`, "Open finding") the focused plan was
22,199 bytes against the 20,000 bound of
`tests/test_audit_host.py::test_compact_plan_fits_inline_and_keeps_what_the_ai_needs`.
The index of capabilities outside the focus had one line per capability, about 540 bytes
each, so every intake moved it closer: 19,920 bytes at 29 capabilities, 22,199 at 34.

The owner agreed to fix it first and to run it once in a real host.

## What changed

- `muro/runtime.py`, `focused_catalog`: with `entries.json`, capabilities outside the focus
  are indexed in one group per discovery entry: `brief`, the entry's `description`, the ids
  of its capabilities outside the focus and the names it `absorbs`. An entry wholly in
  focus leaves no group. A package without entries, and a capability no entry lists, keep
  the earlier line (id, role, intent ids and descriptions).
- A group carries no skill name (second live run, below).
- The instructions returned with the plan and the text in every `SKILL.md` say that the
  index belongs to the same catalog and that the plan covers the whole request.
- `muro/adapters.py`: `entries.json` is copied into every host's skill folder, where the
  packaged runtime reads it. On Claude Code the skill's `allowed-tools` approves the
  launcher both unquoted and quoted, and reads of the plugin's own folder
  (`Read(${CLAUDE_PLUGIN_ROOT}/**)` and the same with a second leading slash).
- Recorded as an amendment to ADR-0015 with INV-007 reworded; AGENTS.md updated.

## Sizes on Marionette (34 capabilities, 13 entries)

| View | Before | After |
|---|---|---|
| Index alone (`--brief`) | 18,306 bytes for the index, without the task context and instructions around it | 8,348 with them |
| Focused on the web-design entry (the test's case) | 22,199 | 12,150 |
| Focused, smallest and largest of the 13 entries | not measured | 9,098 (`marionette-working-method`) to 15,972 (`marionette-product-design`) |

Except where noted, sizes are of the whole result the command prints (context, instructions and catalog).

## Live runs (Claude Code 2.1.325)

Empty test project, release staged with `--build --out <scratch>`, one session at a time,
`--plugin-dir <scratch>/marionette/adapters/claude-code --permission-mode dontAsk
--allowedTools "Skill" --output-format stream-json --verbose --no-session-persistence`.
Sample size: one session per row. No session folder was left under `~/.claude/projects/`.

Request of sessions 2 to 6: "Scrivi con me il design document della migrazione a code di
messaggi, e quando è pronto prepara una presentazione PowerPoint di 5 slide che lo
riassume." It needs `design-doc` (entry `marionette-design-docs`) and `office-deck`
(another entry).

| # | Build | Model, context | Result | Cost |
|---|---|---|---|---|
| 1 | first build of this change | default (Fable 5.2), owner's plugins and MCP loaded | Asked only to list the package's skills: 14 listed, the umbrella and the 13 entries of `entries.json`, `marionette-design-docs` included | $1.95, 1 turn |
| 2 | same | same | Cut by the budget after the first `plan` call, before its result. No evidence | $4.03, 3 turns |
| 3 | same | Sonnet 5.5, package alone | Host invoked `marionette-design-docs`; its `plan` call was **denied**: it had quoted the launcher path and the rule was unquoted | $0.24 |
| 4 | quoted form approved; groups carried the entry's skill name | Sonnet 5.5, package alone | `plan` result 15,236 bytes, read inline. Classification selected **`design-doc` alone**: "The PowerPoint summary is a later stage … and belongs to marionette-office, outside this entry's catalog focus." No refocus | $0.16 |
| 5 | baseline: the build of the EGM intake, per-capability index; `"Bash(python *)"` added to `--allowedTools` because that build lacks the quoted rule | Sonnet 5.5, package alone | `plan` result 24,308 bytes, read inline. Host refocused on `office-deck` and planned **`design-doc`, `office-deck`** | $0.18 |
| 6 | final: groups without a skill name, new instructions | Sonnet 5.5, package alone | `plan` result 14,936 bytes, read inline. Host refocused on `office-deck` (11,120 bytes) and planned **`design-doc`, `office-deck`** | $0.18 |
| 7 | plus reads of the plugin folder approved; request shortened to the design document alone | Sonnet 5.5, package alone | The step read `scripts/egm/resources/execution_instructions.md` and `skills/egm-draft/SKILL.source.md` with `Read`, **no denial** | $0.22 |

"Package alone" is `--setting-sources project,local --strict-mcp-config --model sonnet`:
27 tools and about 48,000 tokens of context, against 83 to 109 tools and about 114,000
tokens with the owner's configuration.

## What the runs show, and what they do not

- A focused plan of 14.9 to 15.2 KB is read inline by this host version. So was the
  24.3 KB plan of the baseline: the host's own threshold is above that, and below the
  29.4 KB it persisted on 2026-11-11. The 20,000 bound stays as the test's margin.
- The shape of the index changes what the classifier plans. With the entry's skill name in
  the group the host left a requested step out of the plan; without it, and with the
  instructions reworded, it planned both. One session each: this shows the failure can
  happen and that the final form did not reproduce it once. It is not a rate.
- A model on a smaller context than the owner's sessions did the classifying. The default
  model with the owner's plugins loaded was not observed past the first call.
- In sessions 5 and 6 the host first tried to pipe the plan through `python -c` to read one
  entry; that call was denied and it reran the plain command. One denial each, no loss.
- Not checked: the other four hosts. Their skill text changed the same way and their skill
  folders now carry `entries.json`; only the unit tests cover them.

## Found on the way

- **Reading the packaged originals was not pre-approved.** In sessions 4 to 6 the first
  step tried to open `scripts/egm/resources/execution_instructions.md` and
  `skills/egm-draft/SKILL.source.md` under the plugin folder; `Read` was denied in
  `dontAsk` mode (in a normal session the user would be prompted). Every capability that
  sends the host to a packaged original (ADR-0017) met this. The owner agreed to
  pre-approve reads of the plugin's own folder; session 7 shows the reads allowed on
  Windows. Which of the two rule forms matched was not determined, and the form meant
  for a POSIX root was not run. The step's first attempt, a `cat` through Bash, is still
  denied; it then uses `Read`.
- **Live runs cost about 2 dollars per turn** with the owner's configuration on the default
  model, and no turn read the prompt cache. The recipe in AGENTS.md now says how to run the
  package alone.
- **`--max-budget-usd 2` did not stop session 2 at 2 dollars**: the budget is checked
  between turns and the session ended at $4.03.

Total spent on the seven sessions: about $6.96.

## Tests

- `tests/test_audit_host.py`: the inline test now describes the index by entry and passes
  (it failed at 22,199 bytes); a new unit test covers a package without entries and a
  capability no entry lists; the skill test asserts both `allowed-tools` forms and the
  "whole request" sentence. Each was seen failing before its change.
- `tests/test_discovery_entries.py`: every host's skill folder carries `entries.json`
  (fails without the adapter change).
- `tests/routing_helpers.py`: the fixture helper skips index groups, which have no id.
- Full suite, run to the end for the first time since the EGM intake: 532 passed, 1 failed,
  8 skipped in 10 min 49 s. The failure was
  `tests/test_pin_modes.py::test_manifest_declares_a_mode_for_every_source`, which lists every
  source with its pin and did not have `egm`: a miss of the intake, already on `main`, that
  the interrupted run of that day had hidden. `egm` (`release`, `v0.1.1`) is added and the
  test passes. The run started before the read pre-approval was added; the files that change
  touches (`tests/test_audit_host.py`, `tests/test_discovery_entries.py`) were rerun after it
  and pass. The full suite was not run again after these last two edits.
