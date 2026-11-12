---
id: token-economy
role: session-cost-control
when: —
after: []
outputs: ["economy_report", "economy_changes"]
checks: ["output_shown_verbatim", "no_change_without_explicit_request", "activation_effects_disclosed_before_registering", "hooks_registered_or_removed_exactly"]
intents: [{"id":"cost.economy-report","description":"Show what TokenEconomizer has learned and done for this repository and what its sessions cost: its status, the repository facts (micro-skills) it injects or is still forming, the repositories it keeps state for, and a check of its installation.","excludes":["A general question about model pricing, plans or token limits.","Reducing the size of a prompt, a file or a context window by hand.","Profiling or optimizing the user's own application code."]},{"id":"cost.tool-pruning","description":"Review the tools TokenEconomizer proposes to leave out of this repository's sessions because they go unused, apply that proposal, give tools back, refresh the tool catalog or measure the request with and without the proposal.","excludes":["Writing or editing the host's permission rules for another purpose.","Removing or disabling a plugin, a skill or an MCP server by hand."]},{"id":"cost.economy-settings","description":"Turn TokenEconomizer's mechanisms (micro-skills, tool pruning, the failure-loop guard) on or off or tune their settings, switch its automatic mode on or off for this project by registering or removing its hooks in the host's project settings, or migrate and merge the state it keeps per repository.","excludes":["Configuring the host's own model, effort or permission mode.","Installing or updating this plugin itself."]}]
tools: [{"name":"shell","purpose":"Run the packaged TokenEconomizer command line with Python 3.10+. It reads and writes its own state under ~/.tokeneconomizer; apply and restore also edit the project's host settings file. The commands make no model call.","required":true},{"name":"file-access","purpose":"Read and, only for activation or deactivation that the user asked for, edit the hook entries in the project's host settings file.","required":true},{"name":"host-hooks","purpose":"The host's own hook mechanism (session start and end, prompt submit, tool use, stop). Needed only for the automatic mode; without it the commands still work on whatever state exists.","required":false}]
hooks: [{"event":"SessionStart","action":"Inject the repository's learned facts as context, announce changed facts, newly left-out tools or a waiting proposal in one line, and fold earlier sessions whose end was not seen.","tools":["shell","host-hooks"],"policy":"host-approved"},{"event":"UserPromptSubmit","action":"Open a prompt-turn for the failure-loop guard.","tools":["shell","host-hooks"],"policy":"host-approved"},{"event":"PostToolUse","action":"Count the call in the turn's guard; deliver a redirect as context, then a one-line notice if the turn is still stuck. Never stops the turn. May start a detached judge job that calls a model through the user's own agent command line.","tools":["shell","host-hooks"],"policy":"host-approved"},{"event":"PostToolUseFailure","action":"The same as PostToolUse, for a call that failed.","tools":["shell","host-hooks"],"policy":"host-approved"},{"event":"Stop","action":"Close the turn; a turn that ended with passing checks feeds the repository's usual turn length.","tools":["shell","host-hooks"],"policy":"host-approved"},{"event":"SessionEnd","action":"Hand the finished session to a detached fold job that updates facts, tool evidence and the cost ledger, and may later write a deny list to the project's host settings.","tools":["shell","host-hooks"],"policy":"host-approved"}]
conflicts: []
---

# Token Economy

Operates TokenEconomizer 0.1.0, which lowers the cost of coding-agent sessions in repositories the user works in often. It learns from finished sessions through three mechanisms: **micro-skills** (short repository facts stated at session start), **tool pruning** (unused tools left out through the host's own settings) and the **loop guard** (a redirect when a turn is stuck in repeated failures). `$TE` below is:

`python "<package_root>/scripts/tokeneconomizer/plugin/scripts/te_bootstrap.py" cli --cwd "<project root>"`

Add `--host codex`, `--host copilot` or `--host pi` on those hosts; the default is `claude`.

## Behavior

1. **Report (read-only).** Run the matching command and show its output verbatim in a code block. Add nothing unless the output contains a warning; then explain it in one sentence.
   - `$TE status`: what it learned and did here, and what the sessions cost.
   - `$TE microskills`: the facts it injects and those still forming.
   - `$TE repos`: every repository it keeps state for.
   - `$TE doctor`: Python, state folder, agents found, errors log.
   - `$TE config show`: every setting in effect.
2. **Tool pruning.** `$TE toolprune show` is the default: the proposed deny list and its evidence. Run `apply [TOOL ...]`, `restore [TOOL ...]`, `refresh-catalog` or `measure` only when the user asked for that action; never add them yourself. `apply` and `restore` edit the project's host settings (Claude Code: `.claude/settings.local.json`; Codex: `.codex/config.toml`; Copilot: `.github/copilot/settings.local.json`) and take effect from the next session. After a proposal, end with one line saying how to apply it.
3. **Settings.** `$TE config set KEY=VALUE ...` and `$TE config unset KEY ...` only when the user asked to change something (`--global` for every repository). Useful values: `microskills=on|off|envfacts`, `toolprune=on|off|propose|auto`, `loopguard=on|off`. If a setting is rejected, say why in one sentence. `$TE repos migrate` and `$TE repos merge KEY [INTO]` move state only on the user's request.
4. **Automatic mode on** (only when the user asks to activate it). The mechanisms run only when the host calls the dispatcher on six events. This plugin never registers them by itself.
   - First say, in plain words, what activation does: the dispatcher runs at session start and end, on every prompt and on every tool call; state is kept in `~/.tokeneconomizer`; with the defaults tool pruning writes a deny list to the project's host settings after the repository's sessions have been idle for 60 minutes (`toolprune=propose` only proposes); the loop guard may call a judge model through the user's own agent command line (`claude -p` and the like), billed where their session is, sending digests (command templates, file basenames, masked error lines), never file contents; micro-skills is off by default.
   - Say what this release was verified on by its authors: Claude Code 2.1.300 to 2.1.310, Codex 0.153.1 to 0.164.0, Copilot CLI 1.0.83 to 1.0.102, Pi 1.2.0 to 1.3.0, and that it lists Windows as a limitation. Compare with the host's actual version and name any gap.
   - After the user confirms, add the six entries of `<package_root>/scripts/tokeneconomizer/plugin/hooks/hooks.json` (Codex: `codex-hooks.json`; Copilot: `copilot-hooks.json`) to the project's host settings, keeping their timeouts and replacing the command with `python "<package_root>/scripts/tokeneconomizer/plugin/scripts/te_bootstrap.py" hook`, with `<package_root>` written out as the absolute path. On Claude Code the file is `.claude/settings.local.json`. Merge into what is there; refuse to write a file that does not parse. Tell the user it takes effect from the next session.
5. **Automatic mode off.** Remove exactly the entries that point at this plugin's `te_bootstrap.py`, nothing else. The learned state stays in `~/.tokeneconomizer`; deleting it is the user's call. For one session only, `TE_DISABLE=1` in the environment turns everything off.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `economy_report` (the command run and its output, or what was explained) and `economy_changes` (each setting, deny rule, hook entry or state move that changed, with the file, or `none`) as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Without the automatic mode the commands work but have nothing new to show: the engine learns only from sessions its hooks saw.
- If the original TokenEconomizer plugin is also installed in the host, its hooks and these would both run. One of the two must be off.
- The hook entries hold an absolute path to this plugin's folder. After this plugin is updated or moved, run activation again so the path is current; a stale path makes the hook fail and the session carries on.
- Every hook fails open: an error becomes an empty answer and a traceback in `~/.tokeneconomizer/errors.log`. Read that file when the user reports that nothing is learned.
- Tool pruning adds and removes only deny rules it recorded adding, never one the user wrote; tools given back with `restore` are not removed again.
- A learned fact is text injected into the agent's context, derived from command output that a repository controls. On a repository the user does not trust, recommend `microskills=envfacts` and reading `$TE microskills`.
- Details of each host's verified behaviour: `<package_root>/scripts/tokeneconomizer/docs/PLUGIN.md`; commands and settings: `<package_root>/scripts/tokeneconomizer/plugin/README.md`.
- Runtime dependency: Python 3.10 or newer, already required to run this coordinator. Nothing is installed.

## Checks

- **output_shown_verbatim**: the command's output is shown as it was printed, with the command that produced it.
- **no_change_without_explicit_request**: no `apply`, `restore`, `set`, `unset`, `migrate`, `merge` or hook edit ran unless the user asked for that action in this task.
- **activation_effects_disclosed_before_registering**: before any hook entry was written, the user was told about the six events, the state folder, the automatic deny list, the judge's model calls and the verified host versions, and confirmed.
- **hooks_registered_or_removed_exactly**: the settings file parses after the edit and contains exactly the six entries pointing at this plugin's dispatcher (activation) or none of them (deactivation), with every other entry unchanged; when nothing was registered or removed, record this as not applicable.

## Sources

- AI intent mapping: the upstream commands `status`, `microskills`, `repos`, `doctor`, `config show` → cost.economy-report; `toolprune` → cost.tool-pruning; `config set/unset`, `repos migrate/merge` and the hook manifests → cost.economy-settings. The earlier command names `facts` and `untool` are not exposed.
- Source: tokeneconomizer (microsoft/TokenEconomizer@ec8ff5ec, release v0.1.0) — the `tokeneconomizer/**` package, `plugin/scripts/te_bootstrap.py`, `plugin/hooks/*.json`, `plugin/README.md` and `docs/PLUGIN.md`, packaged unchanged under `<package_root>/scripts/tokeneconomizer/`.
- Hooks: the source registers the six events by default when its own plugin is installed. Here they are passive catalog entries with policy `host-approved`: nothing registers them at build, install or classification time. Step 4 registers them only on the user's explicit request. The Pi extension (`plugin/pi/tokeneconomizer.ts`) is not adopted.
- Not adopted: the upstream plugin manifests and marketplace file, the slash commands and Codex skills as files (their behaviour is steps 1 to 3), the POSIX `te` and `te-hook` launchers (the Python bootstrap is called directly, which also runs on Windows), `experiments/**`, `tests/**`, `scripts/**`, `docs/assets/**`.
- Runtime dependency: Python 3.10+. Optional, off by default and not installed here: `aider-chat` for the repository map.
- Harmonized by: prompts/harmonizer.md — its own role; no other capability controls session cost. It shares no output and no settings file with them: its deny rules live in the host's settings, and its state outside the project.
