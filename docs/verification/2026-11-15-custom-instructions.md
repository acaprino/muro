# Custom instructions and Marionette 0.2.1 — 2026-11-15

The owner requested package-local Markdown interpreted by the LLM, chose a
`custom-instructions/` folder, approved implementation, and requested complete
documentation plus a Marionette release. The owner subsequently explicitly
requested commit, push and merge to main.

## Implemented and reviewed

The factory snapshots UTF-8 Markdown byte-for-byte, supplies its evidence and
digest to intake/harmonization/review, and checks AI-authored delivery decisions
against current inputs. No filename or keyword chooses a form. Runtime-only
retention is declared by the AI; original files remain in the source tree and
workbench. Build receipts permit declared pruning only in packaged runtimes.
The agent endpoint checks inputs before calling the provider and before writing
returned artifacts, so external edits do not overwrite reviewed output.

Desktop folder support, exact cross-language digests and job snapshots are
implemented, with stale checks for native distributions, external edits,
renames, removal of the final file, old plans and reinstalls. Previously prepared
desktop source files are included so this interface is a complete buildable
feature; this release does not publish a desktop binary.

A fresh independent reviewer found three Important issues: endpoint writes
before freshness validation, historical provenance mistaken for a runtime read,
and missing custom provenance in guide validation. All were reproduced in three
failing regressions, fixed and independently rechecked. Final reviewer verdict:
ready to merge within the reviewed scope. The reviewer did not certify model
behavior or native installation, and did not repeat the earlier whole-desktop
baseline review.

## Mechanical verification

- Initial six custom-input regressions failed against the old implementation;
  the new custom suite passed **15 tests**, and the agentic suite passed **24**
  in the reviewer's independent rerun. A broader targeted run passed **70 tests**.
- Two full-suite checks caught a router text-budget boundary and absent ADR
  frontmatter. Both were corrected and the two regressions passed. Copied
  Marionette fixtures now include its version-bound Markdown input.
- Desktop: **36 Rust tests passed**, with **4 pre-existing real-host tests
  ignored**; **11 UI tests passed**, TypeScript/Vite production build and
  headless Edge smoke passed; **12 Python desktop tests passed**. Native CLI
  folder/snapshot behavior passed in an isolated temporary registry.
- `python muro_build.py --manifest examples/marionette/sources.json --validate`:
  passed. `--check-sources`: all source pins and identity valid. Fresh builds
  under `.scratch/custom-instructions-20261115/` succeeded without replacing an
  existing release.
- All **five** staged standalone launchers, executed outside the checkout,
  returned exactly the 10,486-character policy. Codex SessionStart JSON carried
  that same text. The custom Markdown original was omitted as declared; its
  digest and delivery provenance remained present.

The complete Python suite is also a mandatory step in the Release workflow,
before validation, source checks, build and publication, on the merged commit.
The workflow result is the authoritative full-suite publication gate; targeted
results above are not represented as a completed full-suite pass.

## Host-AI routing and live policy delivery

A fresh host-LLM worker read the prepared evaluation prompt and contexts without
the expected selections. It authored **62 decisions**. Scoring returned
**62/62 passed**, no failures, catalog digest
`8301bfc068e3696d98a9d866f6991c163e09c4741abd1508da19e7517723c7d2`.
These judgments were authored by the LLM; Python only serialized and scored them.

One actual isolated Claude Code **2.1.325** session loaded the staged adapter
with `--setting-sources project,local --strict-mcp-config --model sonnet`,
`--permission-mode dontAsk --allowedTools Skill --max-budget-usd 2`, stream JSON
and no session persistence. The selected model was **claude-sonnet-5-5**.
It named all **15** package skills (coordinator plus 14 entries) and reproduced
the new recap rule and coexistence line verbatim. **1 turn, 0 tool calls,
0 permission denials, $0.0699733** reported cost. This proves native policy
visibility in one session, not spontaneous compliance during every long task.

## Policy decision, cost and boundaries

The owner file `custom-instructions/recap-adhd.md` has SHA-256
`3a64a4fc09a4e92867b31407999a0ead3b94f0c5f29150b656dc02cb268ec680`.
Its 288 characters are carried verbatim in permanent policy because it concerns
all work. Together with the marked coexistence line, it adds **488 characters**
to the previous policy (roughly **122 tokens** at four characters per token;
an estimate, not tokenizer measurement). The complete policy is **10,486
characters**, within the three-contributor **18,000-character** allowance.
No fixed recap interval, new approval requirement, extra mandatory LLM call or
timer hook was invented. Existing ADHD mode controls and final-recap rules remain.

No personal harness installation, native Explorer launch, paid desktop
adaptation job or desktop binary packaging was performed in this change.
Other native adapters were checked mechanically; this session did not run their
models. User files were preserved, including upstream changes integrated from
main before final verification. Publication is Marionette 0.2.1 only; the
factory's separately tagged version is unchanged.
