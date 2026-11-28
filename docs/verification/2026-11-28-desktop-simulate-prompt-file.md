# The desktop simulation answers again with Claude Code (2026-11-28)

The owner: "perché non riesco a simulare da gui?". A free-text request on a project's graph ended with
"The agent gave no answer" on the engine `harness`, Claude Code.

## The cause, reproduced

Installed Muro 0.11.9 (portable), Claude Code 2.1.332, the registry's engine `harness` / `claude-code`, budget
0.5 USD. All runs on this machine, one at a time; each session folder they left under `~/.claude/projects/` was
deleted.

| Step | Result |
|---|---|
| `muro project simulate-prepare` on both listed projects (no AI) | exit 0; the prompt of the larger one is 107,682 characters |
| every flag of `claude_args` in `claude --help` | all present |
| `muro mcp --tools simulate_prepare,simulate_check`, `initialize` and `tools/list` on stdin | answered |
| `muroctl request simulate` (the window's own action) | "The agent gave no answer" after 15 s |
| the runtime's Claude Code line rebuilt by hand, stream read | `simulate_prepare` ran; Claude Code answered the model "result (112,372 characters across 8 lines) exceeds maximum allowed tokens. Output has been saved to …"; with no tool to read a file (`--tools ""`) the agent ended with prose. 0.045 USD |
| the same with `MAX_MCP_OUTPUT_TOKENS=200000` | the token limit moved, a size limit did not: "Output too large (118.2KB). Full output saved to … Preview (first 2KB)"; the agent answered `needs_clarification` "the prompt was truncated". 0.195 USD |
| the prompt as `--append-system-prompt-file`, default model | the whole prompt reached the model (39,248 tokens written to the cache, Claude Fable 5.2) and the run stopped at its budget: `error_max_budget_usd`, no `result`, `errors: ["Reached maximum budget ($0.5)"]`, 0.67 USD at list price |

Two causes, then. A tool result over about 100 KB reaches the model as a 2 KB preview, and the prompt of a
large catalog is over it. And on an expensive model one such request can cost more than the default budget,
which Claude Code reported with no message the runtime read ("Claude Code stopped: " and nothing).

## The change

- `simulate.rs`: the runtime already runs `simulate-prepare` before the agent starts; it now keeps the `prompt`
  as well (`prepared`), writes it to `classify.md` in the run's folder and gives it to Claude Code as
  `--system-prompt-file`, with no tool and no MCP server. The answer is judged by `simulate-check` against the
  context prepared here, as before.
- `claude_result`: a run Claude Code stopped itself is reported with its `errors`.
- Codex is unchanged: it still reads the prompt through `simulate_prepare`, and whether it hands its model a
  result of 100 KB was not checked (a `shortcut:` comment marks it).

## The new line, run

`claude -p REQUEST --system-prompt-file classify.md --strict-mcp-config --tools "" --permission-mode dontAsk
--setting-sources project,local --disable-slash-commands --max-budget-usd 1 --output-format stream-json --verbose
--no-session-persistence --model claude-haiku-5-5` on the 107,682-character prompt (the model named only to keep
the check cheap; the runtime names none): `success`, one turn, 0.0078 USD; `simulate-check` of the answer
against the prepared context: `valid: true`, one step selected. Sample size: one run.

## The changed runtime, run

Tests run 46162477181 on `claude/simulate-and-mcp-button` (37e8879): `tests` and `program` passed, and in
`desktop` the Rust tests (the new ones of `tests/simulate.rs`, `tests/mcp_server.rs` and the module's own),
the type check, Sigrid's and Imago's rules and the browser tests passed. "Photographs of every screen" failed
on `sync-plugin-dark-1440` and `sync-plugin-light-1440`, as on `develop` before this branch (run 46157072159,
98d98d4); `sync-light-1440` failed once and passed on the rerun.

`muroctl.exe` of that run's `muro-desktop` artifact, on a scratch data folder holding a copy of this machine's
registry (engine `harness` / `claude-code`, budget 0.5, Claude Code's default model):

| Request | Result |
|---|---|
| `simulate`, the larger project, "crea una landing page per un prodotto" | after 37 s: "Claude Code stopped: Reached maximum budget ($0.5)". The whole prompt reaches the model; on the default model it costs more than the default budget, and the runtime now says so |

So the cause of "The agent gave no answer" is gone, and the person's budget decides whether a large catalog
finishes on an expensive model. A run with a higher budget was not made.

## Not executed

- No simulation through the changed runtime that finished on the default model; no Codex run.
