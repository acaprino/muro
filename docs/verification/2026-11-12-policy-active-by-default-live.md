# Ponytail and i-have-adhd active by default: live host runs — 2026-11-12

Owner requirement, 2026-11-12: "i have adhd e ponytail dovrebbero essere attivi
di default per tutti quanti". Marionette's `delivery.json` carries both as one
`always-on` policy (1,999 characters). Until today no real model conversation
had received it: the native-policy record states the channels were checked with
fixtures. This record is the first set of real sessions, plus the install path.

Release under test: Marionette 0.1.0, 13 sources, 29 capabilities, built fresh
with `--build --out <scratch>`. Sample size: one session per cell. The owner's
host configuration was not changed: each host loaded the adapter for one run,
from a throwaway project, or from a throwaway configuration folder.

## Does the policy reach the model with no further step?

Probe for the first three hosts: the model was asked, with tools forbidden,
whether its instructions contain a sentence starting "Brevity never reduces",
and to quote it and say where it sits. That sentence exists only in
Marionette's policy.

| Host | How the adapter was loaded | Result |
|---|---|---|
| Claude Code 2.1.322, `claude-sonnet-5-5` | `claude -p … --plugin-dir <release>/adapters/claude-code` | Quoted the full sentence; said it sits in the system prompt, not in a hook or context message. 1 turn, 0 denials, 0.238266 USD |
| Pi 1.4.0, `tri-llm-gateway/claude-sonnet-5-5` | `pi install <release>/adapters/pi -l` in the test project, then `pi -p …` | Quoted the full sentence; said it sits in the system prompt inside the `<muro_policy_marionette>` block |
| OpenCode 2.2.5, `tri-llm-gateway/claude-sonnet-5-5` | test project `opencode.json` with `{"plugins": ["file:///<release>/adapters/opencode"]}`, then `opencode run …` | Quoted the full sentence; said "system prompt" |

Codex 0.167.2 (owner's default model). Codex's model declined to quote its
instructions, so the probe was behavioural: "write the one-line comment that
marks a deliberate shortcut; use the format your guidance prescribes, if any".
The policy prescribes `shortcut: <limit>, <upgrade trigger>`.

| Run | Answer |
|---|---|
| With the adapter's session hook (`muro.py session-context --hook-event SessionStart`) | `// shortcut: in-memory cache has no eviction, add eviction before caching unbounded key sets` and `FORMAT-FROM-GUIDANCE` |
| Control, no hook | `// Deliberate shortcut: this in-memory cache has no eviction.` and `NO-PRESCRIBED-FORMAT` |

So on Codex the hook output reaches the model as guidance and changes the
answer. That run passed the hook as a one-run configuration override with
`--dangerously-bypass-hook-trust`: it shows the channel, not an installed plugin.

**Codex is not active by default, and no package can make it so.** Codex's
documentation states that a plugin's hooks are skipped until the user reviews
and trusts them in `/hooks`, and again when a release changes them. The original
Ponytail has the same step in its README ("open `/hooks` in Codex, trust its two
lifecycle hooks, and start a new thread"). After that one review the policy is
delivered on every session and subagent start.

Hermes is not installed on this machine: not run.

## Can the adapter be installed with the host's own command?

It could not on two hosts: the Claude Code and Codex adapters were plugin folders
without a marketplace manifest, so `claude plugin marketplace add` and
`codex plugin marketplace add` had nothing to read, and `INSTALL.md` named no
command for any host. Fixed in the factory, tests first
(`tests/test_native_install.py`: 4 failed, 1 passed, then 5 passed):

- `adapters/claude-code/.claude-plugin/marketplace.json` and
  `adapters/codex/.agents/plugins/marketplace.json`: the adapter folder is its
  own single-plugin marketplace.
- `INSTALL.md` of Claude Code, Codex, Pi and OpenCode ends with `## Install`:
  the host command and what is active after it. Codex's says the policy is not
  active until the `/hooks` review. Hermes gets no command: none was run.

Real commands, against a throwaway configuration folder (`CLAUDE_CONFIG_DIR`,
`CODEX_HOME`), on the factory-generated adapters:

| Command | Result |
|---|---|
| `claude plugin validate <adapter>` | marketplace manifest: `Validation passed`; hooks: `./policy.mjs hooks: prompt.compose` |
| `claude plugin marketplace add <adapter>` then `claude plugin install marionette@marionette` | `Successfully installed plugin: marionette@marionette`; `plugin list`: version 0.1.0, enabled |
| `codex plugin marketplace add <adapter>` then `codex plugin add marionette@marionette` | `Added plugin`; `plugin list`: `installed, enabled 0.1.0`; the installed copy holds `hooks`, `policy.md` and `skills` |
| the `SessionStart` hook command from Codex's installed copy, with `PLUGIN_ROOT` set to it | printed the `additionalContext` JSON with the policy |

The validator also lists what Anthropic's public plugin directory would refuse
(no README, no LICENSE file, no icon in the plugin folder). That concerns
publishing there, not installing from a folder.

## Test runs

| Command | Result |
|---|---|
| `python -m pytest -q tests/test_native_install.py`, before the code | `4 failed, 1 passed` |
| same, after | `5 passed in 10.99s` |
| description test, native install, delivery, Codex/Claude/native policy and policy-only tests | `65 passed, 1 skipped in 58.20s` |
| `--validate` on Marionette | `OK: capabilities and ROUTER.md valid` |
| `python -m pytest -q`, started 14:33, before `plugin.description` got the word "Office" back | `2 failed, 429 passed, 8 skipped, 2 errors in 449.14s`: not green |

Of those four, `test_audit_p0.py::test_skill_md_synthesizes_domain_rich_bounded_discovery_description`
passes since the description fix (it is in the 65).
`test_ui_ux_pro_max_intake.py::test_live_ui_ux_pro_max_source_passes_license_gate`
asserts that `check_sources` reports nothing for that one source and contacts its
remote; it failed in both full runs of the day and passed alone in 3.93 s. The
two `test_tokeneconomizer_intake.py` errors come from a module fixture that
builds the whole release; they also passed alone earlier. Both full runs piped
their output through `tail`, so no traceback was kept and the cause is not
established.

## Not executed

- A session in a Claude Code or Codex where the plugin was installed through the
  marketplace commands: the installs above ran without credentials. Delivery was
  observed with `--plugin-dir` (Claude Code) and with the hook override (Codex).
- Codex's `/hooks` review itself, and that an untrusted hook is skipped: taken
  from Codex's documentation, read through a summarizing fetcher.
- A control without the adapter on Claude Code, Pi and OpenCode. The quoted
  sentence is Marionette's own text, but no run showed its absence.
- Whether the model follows the policy over a real task; resume, clear,
  compaction and subagents; macOS and Linux; a second sample; Hermes.
- A first Codex attempt with a project-level `.codex/hooks.json` ran no hook at
  all (a marker hook wrote nothing) and proves nothing either way.

## What "active" means here

(History: superseded the same day, see "the policy carries the originals".)

The policy is the host AI's merge of both sources under the 2,000-character
limit: 1,999 characters. The originals load 7,201 bytes (i-have-adhd
`SKILL.md`) and 2,623 to 3,496 bytes (Ponytail rules file or central skill).
Fixed rules of i-have-adhd, such as the five-item cap and a next action at the
end of every reply, are recorded as dropped in `delivery.json`. This run checks
that the policy is delivered, not that it equals the originals.

## Correction, same day: the limit is proportional

Told that the fixed 2,000-character limit was one cause of the shortened policy,
the owner answered: "mhh no, deve essere proporzionale al numero di intake che
ci vanno dentro". Changed in the factory, tests first (ADR-0016 amendment "the
always-on budget is proportional"): 2,000 characters for each source with an
`always-on` decision, one shared budget. Marionette has two such sources, so its
limit is now 4,000. **Its policy text was not changed by this correction**: it
is still the 1,999-character merge described above.

| Command | Result |
|---|---|
| `python -m pytest -q tests/test_delivery.py`, before the code | collection error: `cannot import name 'ALWAYS_ON_PER_SOURCE'` |
| delivery, Hermes, Codex, policy-only, i-have-adhd, native and Claude policy tests, after | `1 failed, 74 passed, 3 skipped` (the failure was a wrong source list in my new test), then `49 passed, 2 skipped in 11.00s` on the three files touched |
| `--validate` on Marionette | `OK: capabilities and ROUTER.md valid` |
| fresh `--build --out <scratch>` | built; the Hermes registration reads `max_chars=len(policy)` instead of a fixed 2000; `muro.py session-context` from the Codex adapter prints the policy |

Not executed for this correction: a live session with a policy longer than
2,000 characters on any host. Codex's hook-context limit and Hermes's section
limit are host ceilings the factory does not check.

## Correction, same day: the policy carries the originals

Owner rule, confirmed with "confermo": "non deve mai alterare il contenuto Muro",
"se non per garantire armonizzazione e coesistenza in base ai suoi principi",
"solo in quel caso può riscriverne il contenuto delle skills ecc" (ADR-0017).
Everything above this section describes the 1,999-character synthesis; the
section "What 'active' means here" is now history.

- Policy: 9,998 characters. The i-have-adhd `SKILL.md` body (blob `6c42757f`,
  commit `1ecea199`, v0.4.1) and Ponytail's `.agents/rules/ponytail.md` (blob
  `b314fa6e`, commit `7801d061`, v5.3.3), unchanged, plus a two-line header and
  three lines marked `[Marionette]` (reply versus artifact, code scope, the end
  of the reply). Composed by a script that refuses any input that is not the
  pinned blob; the previous text is kept in the session scratch folder.
- `delivery.json`: 58 decisions. The two `always-on` decisions name each change
  and its collision; the i-have-adhd decision that had dropped the opening, the
  every-turn rules and the numeric limits is gone.
- Per-source allowance raised from 2,000 to 6,000 so the originals fit unchanged.
- Rule written into `AGENTS.md`, the three factory prompts, ADR-0017 and FRD
  REQ-021; both sources' `intake.goal` and the router record follow it.

| Command | Result |
|---|---|
| `python -m pytest -q tests/test_policy_original_wording.py`, before | `7 failed` |
| wording, delivery, both source intakes, Hermes and policy-binding tests, after | `73 passed, 2 skipped in 22.88s` |
| `--validate` on Marionette | `OK: capabilities and ROUTER.md valid` |
| fresh `--build --out <scratch>` | built; `policy.md` is 9,998 bytes in all five adapters |
| `python -m pytest -q` (before this correction, with the proportional limit) | `436 passed, 8 skipped in 341.27s` |
| `python -m pytest -q` (after it) | `1 failed, 439 passed, 8 skipped, 3 errors in 421.55s` |
| `python -m pytest -q tests/test_live_host_fixes.py` (the file with those four) | `7 passed in 74.49s` |

The four non-passing tests of the last full run failed with `OSError: [WinError
112] Spazio su disco insufficiente` and `fatal: write error: No space left on
device`: drive D: ran out of space during the run. Free space on C: and D: moved
between a few hundred megabytes and several gigabytes during the day for reasons
outside this work, and that is the likely cause of the unexplained failures in
the earlier full runs, whose tracebacks were not kept. A full run that is green
on the final tree has not been obtained.

Real sessions with the 9,998-character policy, one each, release built after the
correction. Probe for the first three: quote the `[Marionette]` sentence about
closing a code-change reply (middle of the text) and the sentence starting
"Never cut:" (its last line), and say where they sit.

| Host | Result |
|---|---|
| Claude Code 2.1.322, `claude-sonnet-5-5`, `--plugin-dir` | both quoted in full; "in the system prompt, under Marionette session policy". 1 turn, 0 denials, 0.253874 USD. The owner's installed i-have-adhd was loaded too and the model reported its hook message separately |
| Pi 1.4.0, `tri-llm-gateway/claude-sonnet-5-5` | both quoted in full; "inside the `<muro_policy_marionette>` block" |
| OpenCode 2.2.5, `tri-llm-gateway/claude-sonnet-5-5` | both quoted in full; "System prompt, in the Marionette session policy section" |
| Codex 0.167.2, session hook passed as a one-run override | asked for the shortcut comment format and for what follows the skipped-or-unchecked lines: `// shortcut: cache has no eviction, add eviction before caching an unbounded set of keys.` and `3`. Control without the hook: `// Intentional shortcut: [...]` and `NONE` |

So the middle and the end of the longer text reach the model on all four; on
Codex the hook context was not cut at this size. Still not executed: a session
on an installed plugin, Codex's `/hooks` review, Hermes (its section-size limit
is unknown), whether a model follows the rules over a real task, a second sample.

## Leftovers

Sessions were ephemeral where the host allows it. OpenCode has no such switch:
up to three short sessions remain in the owner's OpenCode history (one answered,
one stopped on "Insufficient credits" with the default model, one timed out). Throwaway projects
and configuration folders are in the session scratch directory. While reading
OpenCode's configuration folder a command printed the content of its
`service.json`, which holds a local service password; it was not used or copied.
