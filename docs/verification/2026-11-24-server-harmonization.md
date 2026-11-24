# Server harmonization: the step, its record, its checks (2026-11-24)

ADR-0033, amendment of 2026-11-24. The owner asked that MCP servers be harmonized like plugins, with a written
reason for every choice, and that his answer (`server_choice`) be asked only for the tools that write or send. This
record says what ran, what was found, and what did not run. Nothing here proves that a model harmonizes servers
well: three paper runs, one run each, one model.

## What changed

- `prompts/harmonizer.md` "Servers and tools" is a step with an output: the roster, the effect and fate of each tool,
  a judgment with a reason for every pair that overlaps, one question to the owner only about what writes or sends,
  and the list of what the AI decided alone shown to the owner. `prompts/delivery.md` holds the record's shape, "The
  server review", and the one rule for an effect, "Effects of a tool". `prompts/intake.md` and `prompts/review.md`
  follow.
- `delivery.json` gains `server_review` (`muro/server_review.py`): shape, closure and references are checked by
  `validate`, `build` refuses a package that declares servers without it (and one judged on another commit), and the
  owner's answer is required only for the gated tools a package server serves or leaves out. The unattended
  harmonization (`muro agent harmonize`, `muro absorb`) validates with the same checks that need no owner.
- The build's gate counts the tools by their ids in the record and no longer asks for every declared tool. A package
  server of commands only is reviewed and gated like any other.

## What ran

Targeted tests only, on Windows, with Python 3.13 (no full suite: it runs on GitHub Actions).

- `tests/test_server_review.py`: 294 tests of the checks, from a spec written before the code. The agent that wrote
  its first 276 broke the module 45 ways and injected 7 crashes, and the tests caught all of them (the 18 added since
  were not mutation-tested). Two checks were added after reading the module (a forwarded tool's entry is a server tool;
  a served entry carries the tool's source) and two were changed after the run on real records, below.
- `tests/test_server_review_wiring.py`, `tests/test_package_server_delivery.py`, `tests/test_mcp_servers.py`,
  `tests/test_delivery.py`: the wiring, the new gate and its old tests rewritten for the new contract (the gate covers
  the tools that write or send, and `shown` holds ids), and the fixtures of every test that builds a release with a
  server. The phrase tests that pin the prompts, the ADR and `AGENTS.md` follow the new text.
- Merged with the keys delivery of the same day (`docs/verification/2026-11-24-keys-in-the-guide.md`) in a scratch
  worktree: the two branches conflicted in three files (`muro/delivery.py`, `prompts/delivery.md`,
  `tests/test_delivery.py`: each added its own key, section or line at the same place), resolved by keeping both.
  Run on the merged tree with `-m "not marionette"` (as the `Tests` workflow does) over the files that touch servers,
  delivery, releases, the guide, the prompts, projects and the runtime: **851 passed**, 299 deselected, 10 minutes
  38 seconds, before the changes of the section "The real checks on the records" and the text fixes that followed
  (the unattended contract for a file that already holds a package server; the pointer of `prompts/review.md`;
  the re-pin paragraph of `AGENTS.md`). The run after them is recorded at the end of this file. This is not the full
  suite.

## The paper runs (not tests of the product)

A draft of the step was run on three inputs by fresh agents on the default model (Claude Sonnet), none of which saw
the author's tables, and the records they wrote were checked by a throwaway script of the same rules, outside the
repository.

| Input | Result |
| --- | --- |
| Supads (22 tools of a server, 5 command-line programs, a script; pinned sources read) | 62 roster entries, 14 pairs (13 `keep-both`, 1 `discard`). The checks found 1 inconsistency in 14 pairs (a `discard` between two tools both left out). About 750,000 tokens of agent, 105 tool calls, 22 minutes, a 80 KB record and a 20 KB question: hence the bound on each text field and the cap of 6000 characters on the question. |
| A made-up package with two servers that overlap on purpose | A closed record at the first try: 8 entries, 2 pairs, 0 violations. A name two servers share forced a rule (C5 skips a name that two entries share). About 250,000 tokens. |
| A blind reading of the 22 server tools from their descriptions alone | Agreed with the author's first table on 22 of 22. Both were wrong on `job_status`, which the agent that read the code found gated: it sends the vendor key to the address written in the handle. The rule now says the code wins over a description, and a descriptor-only reader is a consistency check, not a proof. About 200,000 tokens. |

## The real checks on the records the paper runs wrote

After the code existed, `server_review_errors` and `release_errors` were run (a throwaway script, outside the
repository) on the Supads record, with the 78 real capabilities of the Supads package and, for the build's gate, a
`package_server` derived from the record itself (37 tools served, 15 forwarded and 22 commands, and 7 left out; the 16
whose effect is not `none` shown as the owner's answer), and on the two-server record.
They found three things the throwaway checker of the same rules had not, and one that it had:

| Finding | What was done |
| --- | --- |
| 41 of 62 entries had `"overlaps": []` beside `alone`, the other 21 only `overlaps`. The module read `[]` beside `alone` as a contradiction: 82 messages for one habit, enough to bury the real ones in the feedback of a round. | An empty `overlaps` beside `alone` is read as `alone` (module, docstring, test, prompt, ADR). `[]` without `alone`, and `alone` beside a nonempty or malformed `overlaps`, stay refused. |
| C5 matched a left-out tool's name as a whole word anywhere in a body. `transcribe` is an ordinary verb: two bodies say "Do not transcribe what the label says". The message would have told the model to rewrite the source's text or to serve a tool that sends files off the machine. Every real reference to a server tool in the 78 bodies is both in `tools` and in backticks. | A body names a tool only inside code (an inline span on one line or a fenced block). Prose names nothing. `tools[].name` is unchanged. |
| 20 of 62 `basis` fields (32%), 2 of 62 `reason` and 2 of 14 pair reasons were over their limits (median `basis` 442 characters, p90 991, max 1458; the record was written with no limit). | Limits kept (600, 400, 300, 600): provisional, and a record told the limit was not measured. If a real run mostly overshoots, move the constant and the prompt together. |
| A `discard` between two tools that are both left out (C4). | Refused as the checker had found; nothing to change in the module. |

With the two changes the Supads record gives 25 messages (24 of them the text limits, which the record predates, and
the one C4 inconsistency), no message from C3, C5, C6 or C7, and `release_errors` gives none when the 16 gated tools
are shown at the pinned commits. This is the module on data a model wrote, not a model writing the record under the
final prompts, which has not been run.

The run on Supads also found, in the sources and not in Muro: `job_status` sends the vendor key to an address that comes
from the handle and writes media into the folder the handle names; `transcribe` uploads any readable local file with no
check that it is media; `video_stitch`, `caption_video`, `video_overlay` and `narrate` replace files with fixed default
names; four of the five advertising programs read the word after `--dry-run` as its value, so a flag placed before the
command word makes them answer "Unknown command" (relevant to Delivery 2 of ADR-0033: put it after the command words);
the calendar tools import `fcntl` and probably do not load on Windows (an inference).

## The run after the last changes

`python -m pytest -q -m "not marionette"` over 70 of the 83 test files: every one that imports the changed modules
(`agent`, `cli`, `delivery`, `guide`, `server_review`, `credentials`) and every one that reads the prompts, the ADRs or
`AGENTS.md`. **1038 passed, 6 skipped, 705 deselected, 2 failed**, 14 minutes 39 seconds. This is not the full suite.

- `test_the_harmonizer_prompt_asks_the_owner_about_servers` pinned the sentence that the unattended contract replaced
  on purpose (a file that already holds a `package_server` keeps it). Its phrases were updated and the 99 tests of
  that file pass.
- `test_apache_release_carries_license_notice_and_modification` fails only in the scratch worktree: it was checked out
  with `core.autocrlf=true`, so the fixture has CRLF and the test's own `git add` converts it before the build reads
  it. It passes on `develop` (an LF checkout) and, on the merged tree, with `core.autocrlf` off for its git calls. It
  does not touch what changed here; a Linux runner is an LF checkout.
- After the last edit of the ADR, the files that read the ADR, `AGENTS.md` and the prompts (`test_package_server_delivery`,
  `test_server_review`, `test_server_review_wiring`, `test_audit_p1`, `test_audit_p2`, `test_audit_host`,
  `test_absorbed_names`) ran again: 423 passed.
- 13 test files were not run here: the ones that need no changed module and read no prompt or document.

## What did not run

- The final prompts were not run by any model: the paper runs used a draft. Supads was not harmonized again, no
  `package_server` was declared or built, and the question was not put to the owner in the form the prompt gives.
- One run, one model for each paper run; the blind reading and the author of the table are the same family of model with
  the same rule in hand.
- The server evals (`choose` and `effect` cases, `muro eval --servers`) are designed and not built.
- No host ran a package server. A package that declares a `package_server` is still not to be released before the live
  Claude Code run of ADR-0033 "Not run".
- The text limits (600, 400, 300, 600 characters) come from one measured run and may need to move.
- Python 3.10 was not available; the module was exercised on 3.13 and (by the agent that wrote it) 3.11. CI runs the
  full suite.
