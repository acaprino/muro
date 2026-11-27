# Live contextual activation checks and follow-up fixes (2026-11-27)

Follow-up to `docs/verification/2026-11-27-natural-use.md` (commit `0146af7`, ADR-0037), executed on Windows with Claude Code 2.1.332 (`--model opus`, serving `claude-opus-5-5`), one session at a time, against a scratch build of Marionette 0.7.1 (`head` pins frozen as `static` in the scratch copy only because `charles-skills` moved upstream).

Command shape: `claude -p <prompt> --plugin-dir <scratch-adapter> --setting-sources project,local --strict-mcp-config --permission-mode dontAsk --allowedTools Skill Read Write Edit Glob Grep --model opus --output-format stream-json --verbose --max-budget-usd <2|3>` (`--no-session-persistence` on single-turn runs; `--resume <session_id>` on the two-turn run; temporary session folders under `~/.claude/projects/` removed afterward).

## Baseline runs on `0146af7`

| Case | Prompt / Context | Skill invoked | Executed | Permission denials (launcher) | Turns / Cost (USD) | Verdict |
|---|---|---|---|---|---|---|
| Plain-code silence control (`plain-code`: `app.py`, `test_app.py`) | Fix `ZeroDivisionError` in `average_price` returning `0.0` + add test | `marionette:marionette-engineering` | `work-map` (3 launcher calls, 2 JSON files) | none | 14 / $0.45 | **Sbagliato** (over-triggered on trivial 2-line fix) |
| Static/icons 1-turn (`ethel-mockup`: `design-system.md`, `mockups/dictation.html`) | Rectangular Dictate/Tidy up buttons -> less static, icons, within design system | `marionette:marionette-product-design` (`--focus marionette-product-design,marionette-motion`) | `ui-prototype` (4 launcher calls) | 1 (`PowerShell` tool calling `muro.py step`, then retried via `Bash`) | 15 / $0.74 | **Sbagliato** (catalog exclusion in `interaction-motion` ceded prototype motion to `ui-prototype`; Windows `PowerShell` launcher denial discovered) |
| Two-turn follow-up (`two-turn`: same mockup, real resumed session) | Turn 1: UX laws review & fix. Turn 2 (resumed): too static/rigid/square, icons? | T1: `marionette:marionette-ux`; T2: `marionette:marionette-ux` (`--focus marionette-ux,marionette-motion,marionette-polish`) | T1: `ux-laws`; T2: `interaction-motion` then `interface-polish` | none on Turn 2 | T1: 17 / $0.81; T2: 23 / $2.04 | **Perfetto** on both turns |

## Fixes applied in Muro

1. `muro/system_section.py`: added a package-neutral exception in rule 1 so trivial, self-contained edits whose exact change the user already specified and that need none of a skill's method, craft or coordination skip skill invocation.
2. `muro/adapters.py`: added `PowerShell(python ${CLAUDE_PLUGIN_ROOT}/skills/<cmd>/muro.py *)` (unquoted and quoted) alongside `Bash(...)` in Claude Code `SKILL.md` `allowed-tools`.
3. `muro/guide.py` and `muro/project.py`: `guide_data` and `muro project info` now compute and return the full composed `system_prompt` (`injected_text`: `# Muro system` + declared `always_on`), and `GUIDE.html` renders it.
4. `apps/desktop/src/`: `graph-model.ts` and `Details.tsx` now read and display array-typed intent `excludes` as well as legacy strings; `InputsPanel.tsx` and `Workspace.tsx` display a read-only `System prompt` section and dialog.

## Post-fix live runs (rebuilt scratch Marionette on updated Muro)

| Case | Skill invoked | Executed | Permission denials (launcher) | Turns / Cost (USD) | Verdict |
|---|---|---|---|---|---|
| Plain-code silence control (post-fix) | none | — (direct edit, 0 launcher calls) | none | 7 / $0.20 | **Perfetto** (silence preserved; cost cut by >50%) |
| Skill inventory check (`List every marionette skill name...`) | — | — | none | 1 / $0.08 | 18/18 skills loaded cleanly with `PowerShell(...)` in `allowed-tools` |
| Static/icons 1-turn sanity check (post-fix) | `marionette:marionette-polish` (`--focus marionette-polish,marionette-motion`) | `interaction-motion` (4 launcher calls) | none | 14 / $0.64 | Activation preserved (not suppressed by trivial-edit exception); 0 launcher denials |

Total live run spend across all 6 sessions: $4.96 USD (n = 1 per variant after the fix; shows behavior on this host/model, not statistical rates).

## Targeted automated checks

- `python -m pytest -q tests/test_project_file.py tests/test_natural_use.py tests/test_audit_host.py`: 174 passed, 1 skipped.
- `python muro_build.py --manifest tests/fixtures/package/sources.json --validate --check-sources --offline-pins`: OK.
- `node --experimental-strip-types --test apps/desktop/tests/graph-model.test.ts apps/desktop/tests/project-data.test.ts apps/desktop/tests/imago-ownership.test.ts apps/desktop/tests/graph-scene.test.ts`: 58 passed, 0 failed.

## Not executed locally

- Full Python test suite (`pytest`), Rust build/tests (`cargo`), TypeScript/Vite build (`tsc`, `vite build`), `sigrid-check` and `imago-check` (packages not installed locally): deferred to GitHub Actions `Tests` workflow per repository rules.
- Codex, OpenCode, Pi and Hermes live runs: not executed.
- Live confirmation of a `PowerShell` launcher call succeeding directly (Claude Code used `Bash` in the post-fix craft run, so `PowerShell(...)` frontmatter acceptance was verified via 18/18 skill loading, not via a direct `PowerShell` tool call).
- Marionette package catalog edits (`interaction-motion` exclusion, Ponytail boundary line, `charles-skills` pin update): out of Muro repository scope.
