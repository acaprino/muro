# Delivery form and self-registering releases — 2026-11-12

Record for [ADR-0016](../adr/ADR-0016-delivery-form-and-self-registering-releases.md).
Owner requests of 2026-11-12: Muro may generate its own session text from the
absorbed skills when needed; the choice between splitting a source and injecting
it is an LLM analysis with its own prompt; installing a generated plugin lets it
activate "tutto ciò che serve"; a broad package does not let one source's system
prompt "fagocitare tutto".

## Scope of this record

This record describes the first implementation as it stood at about 12:05 on
2026-11-12, and the one live run made against it. A parallel session reviewed
that implementation the same day and found defects in it
(`2026-11-12-ponytail-delivery-probe.md`):

- The owner asked for a system prompt. A Claude Code `SessionStart` hook adds
  context, which the host documents as distinct from the system prompt. The live
  run below proves that the text reached the model, not that it has system
  authority.
- The matcher leaves out `resume`, and nothing carries the text into subagents.
- Only the Claude Code adapter registered anything; four hosts got a manual note.
- A package made only of session text, with no capability, failed validation.
- The session text was outside `catalog_digest` and was not given to routing
  evals, so a changed policy did not invalidate a saved decision.

Those are being corrected in that session. Where this record and the current
code or ADR-0016 disagree, this record is the older one.

## What was built

- `prompts/delivery.md`: the judgment (breadth, timing, authority, cost,
  function, fit), appended to both `--prepare-intake` and `--harmonize`.
- `delivery.json` in a package: decisions with reasons, optional session text
  (2000 characters at most) and hook wirings. `muro/delivery.py` validates shape
  and references and emits only what the document declares.
- Claude Code adapter: `hooks/hooks.json` at the plugin root when the document
  declares session text or a wiring. New runtime command `session-context`.
- Hook policy `active` in capability frontmatter, valid only with a `hook`
  decision and a wiring.
- The guide lists every decision, the session text with its size and the
  registered hooks under the release's sources.

## Tests (fixtures: they prove mechanics, not AI judgment)

Written first; the first run failed on the missing module, then on the missing
guide rendering and on a fixture hook that named an undeclared tool.

| Command | Result |
|---|---|
| `python -m pytest -q tests/test_delivery.py` | 33 passed |
| `python -m pytest -q` with the Marionette-file test deselected, before the intake | 330 passed, 1 deselected in 268.44s |
| `python -m pytest -q tests/test_delivery.py tests/test_factory.py tests/test_release_guide.py tests/test_audit_p2.py tests/test_muro_build.py tests/test_runtime.py`, after the prompt and document edits | 76 passed, 1 deselected in 64.46s |

The final full run, after the intake of `claude-design-system-prompt`, is in
`2026-11-12-claude-design-intake.md`.

## Live run on Claude Code (real host, sample size 1)

Purpose: prove that a release registers session text and an active hook by
itself, with a package whose slug is not `muro`.

- Host: Claude Code 2.1.322, model `claude-sonnet-5-5`, Windows 11.
- Package: a throwaway fixture, slug `pulcinella`, one capability with an
  `active` `UserPromptSubmit` hook. Its `delivery.json` declared the session text
  "Pulcinella is installed in this session. Fact recorded by its release: the
  session code word for Pulcinella is MANDORLA." and one wiring,
  `["python", "<package_root>/scripts/demo/mark.py"]`; the script prints
  "Pulcinella prompt note: the prompt counter word is GIRASOLE."
- Release staged with `build_release` into a scratch folder; the session ran in
  an empty Git project:

  `claude -p "<two questions: the session code word and the prompt counter word; answer UNKNOWN for anything not told; no tools>" --plugin-dir <scratch>/pulcinella/adapters/claude-code --model claude-sonnet-5-5 --permission-mode dontAsk --allowedTools "Skill" --output-format stream-json --verbose --max-budget-usd 2 --no-session-persistence`

| Observation | Value |
|---|---|
| Exit code | 0 |
| Init event | plugin `pulcinella`, skill `pulcinella:pulcinella`, no plugin errors |
| `SessionStart:startup` hook response | stdout was the session text, exit code 0 |
| Model answer | `session: MANDORLA` / `prompt: GIRASOLE` |
| Turns, permission denials | 1, 0 |
| Cost | 0.226128 USD (56,476 cache-creation input tokens, 22 output tokens) |

Both words exist only in the fixture, so the answer shows that the session text
and the per-prompt hook output reached the model with no opt-in step. The
session folder the run left under `~/.claude/projects/` was removed.

## Not executed

- Matchers `clear` and `compact`, and a resumed session: only `startup` ran.
- The `UserPromptSubmit` hook was not seen as a separate stream event; the
  evidence is the model's answer.
- An isolated configuration: the owner's own plugins were loaded in the same
  session.
- Any host other than Claude Code. On Codex, OpenCode, Pi and Hermes the adapter
  registers nothing and says so in `INSTALL.md`; the channels listed in ADR-0016
  were read from documentation through a summarizing fetcher and never run.
- A second sample, another model, macOS or Linux.
- Automatic activation of TokenEconomizer's hooks: still registered on request.

## Per-task cost of the new safeguard

No call and no token for a package without session text or wirings. With session
text: its characters once per session start, clear and compaction, plus one
`python` process start. With an active hook: one process per event.
