# Ponytail automation evidence for curated Marionette intake

This is read-only evidence for the host AI's source-selection decision. The parent selected canonical working/review methods and explicitly excluded Ponytail's separate telemetry and host-control product. The exclusions below are deliberate scope choices, not a claim that upstream lacks those outcomes. No upstream code, host session, installation or production mutation was executed.

Source examined: DietrichGebert/ponytail, v5.3.3, commit `7801d061243d7b753bad0e0b3c057cd250b11755`. Release selection is owned by the parent intake. The repository tree contains root `LICENSE` and no additional LICENSE/NOTICE files. Thirty fetched files are preserved in `source-evidence-complete.json`; every UTF-8 file reproduced its Git blob SHA in `verified-blobs.json`.

## Source outcomes and explicit selection boundary

| Upstream outcome | Evidence | Curated treatment |
|---|---|---|
| Apply smallest-complete-change method at lite/full/ultra intensity | README; shared instruction builder; canonical skill | Preserve method and user-selected intensity, with honest task/conversation scope. Parent owns synthesis and overlap decisions. |
| Enable/off/status and persistent default configuration | mode-tracker; config; OpenCode/Pi/Hermes adapters | Preserve method preferences where the coordinator can honor them. Exclude original state/control implementation. Do not advertise persistent defaults or actual removal of permanent context unless a real Marionette facility implements it. |
| Review, audit, debt, benchmark display and help | README and adapter command registration | Preserve canonical skill outcomes; parent owns capability mapping. Remap help to generated discovery and supported operations. |
| Approximate existing-code index injected at startup | ponytail-map.js; activate.js | Exclude automatic startup scan. Any retained reuse-search method remains task-driven evidence, never semantic routing by regex. |
| Status badge setup, repair and mode display | activate.js; statusline .sh/.ps1 | Explicitly unselected original-host UI/configuration product. No settings edits or nudge files in generated behavior. |
| Live task band: cost/tokens/turns/agent time/reuse/tests/open callers; compact/details UI; review/audit/mode buttons; Markdown task copy | hooks/band/register.tsx, metrics.ts | Explicitly unselected telemetry product. Do not present a static report as equivalent to live instrumentation. |
| Local cross-project board, project/period/search filters, activity chart, theme, PNG/SVG sharing card | hooks/band/board.ts; register.tsx | Explicitly unselected dashboard/export product. It is a genuine upstream outcome, not merely packaging. |
| Import earlier Claude sessions into metrics history | ponytail-band-import.js | Explicitly unselected history-reading and metrics-writing operation. |
| Per-turn webhook delivery, optional bearer token and task names | plugin.json userConfig; metrics.ts; register.tsx | Explicitly unselected external-reporting feature. No copied credentials, endpoints or sends. |
| Install/remove original host plugin adapters and clean original state | INSTALL.md; scripts/cursor-hooks.js; scripts/uninstall.js | Replace packaging/discovery with Muro's native adapters; exclude original installers/cleanup. Do not operate on unrelated standalone Ponytail installation state. |

The selected help text must not advertise band/import/webhook/statusline commands as Marionette commands. It can explicitly identify them as unselected features of the original Ponytail plugin if useful. Canonical methods are retained; original competing host wiring is not activated.

## Original defaults, events and effects

### Classic lifecycle hooks

`hooks/claude-codex-hooks.json` registers:
- SessionStart, matcher startup/resume/clear/compact, one Node activation command, 15-second external timeout.
- SubagentStart, one Node injection command, 15-second external timeout.
- UserPromptSubmit, one Node mode-tracking command, 15-second external timeout.

Default intensity is `full`. Resolution is environment `PONYTAIL_DEFAULT_MODE`, then Ponytail `config.json`, then full. Config directory is XDG_CONFIG_HOME/ponytail when set, otherwise %APPDATA%/ponytail on Windows or ~/.config/ponytail. Explicit default commands write config; ordinary switches do not write the default.

Activation writes the shared `.ponytail-active` plus project-hashed `ponytail-modes/<sha256(project-dir)>` where CLAUDE_PROJECT_DIR is present. Mode paths vary with host: CLAUDE_CONFIG_DIR/~/.claude, PLUGIN_DATA for Codex, COPILOT_PLUGIN_DATA or Claude fallback, QODER_CONFIG_DIR/~/.qoder, CODEBUDDY_CONFIG_DIR/~/.codebuddy, ~/.cursor. Same-project sessions still share a mode; the badge reads the shared last-write flag. Compaction preserves current mode/off; other startup sources reset to configured default.

The activation helper optionally launches `ponytail-map.js` (enabled unless PONYTAIL_MAP=0), with a three-second timeout and 64 KiB output cap. The map uses git ls-files or directory traversal and approximate language regexes. Default display budget is 2,000 characters, up to 4,000 source files and 64 KiB read per file. It skips many test/generated/vendor paths. It is an approximate inventory, not task classification.

For native Claude, activation reads settings.json. It can atomically copy/refresh ponytail-statusline.sh/.ps1 in the config directory and write `.ponytail-statusline-nudged`. It adds a setup/repair offer to model context but does not itself edit settings.json. Statusline scripts read the shared mode flag and print a badge.

Subagent injection occurs for every active subagent by default. PONYTAIL_SUBAGENT_MATCHER is an optional regex over explicit host agent_type; invalid patterns, unparseable type or timeouts fail open to injection. It is not a semantic task classifier.

Prompt tracking writes/deletes flags on explicit mode commands. Standalone “stop ponytail”/“normal mode” deactivates. `/ponytail band on|off` removes/writes `.ponytail-band`; import spawns a detached Node process. Qoder lacks SessionStart, so prompt submission also initializes and injects the active rules each turn.

### Native module and telemetry

The Claude manifest registers `hooks/claude-band.json`, which loads `band/register.tsx`, and declares `ledger: true`, `webhookUrl: ""`, `sendNames: true`; optional webhookToken is marked sensitive for host keychain storage.

The band subscribes to session.start, command.run(clear/resume/branch), session.end, prompt.submit, tool.call, turn.complete and ui.render(AbovePrompt). It stores host atom state (plugin ponytail/key band), a details setting and the first human prompt or sidebar title. It reads Claude session usage and transcripts, invoking grep for title/model and git grep for definitions/removed callers. Tool edits and test-command outputs feed approximate reuse/test-status metrics.

After each main turn, default ledger operation performs a read/modify/write of a project-basename CSV in XDG_CONFIG_HOME/ponytail/band or ~/.config/ponytail/band, then regenerates board.html from all CSVs there. The band records even when hidden or mode is off; hiding the UI does not turn telemetry off. `ledger:false` disables local file writes but does not disable a configured webhook.

A nonempty configured webhook sends one asynchronous JSON POST per main turn. HTTPS is required except localhost HTTP. The optional bearer token is sent in Authorization. Names are sent by default; disabling names still sends session/project/metric fields. No outbound traffic occurs from this mechanism with the default empty URL.

The local board embeds task data and application script; there are no external resource fetches in the inspected renderer. It writes browser localStorage only for theme. User actions export SVG/PNG files. The band copies Markdown through host clipboard API and opens the board through cmd/start on Windows or open/xdg-open on Unix.

The README claims native band availability in Claude Code 2.1.290+ terminal/desktop, not VS Code chat, cloud sessions or claude -p. This is upstream documentation, not a live test here.

### Historical import

`node <source>/hooks/ponytail-band-import.js` is a standalone CommonJS CLI. It uses Node builtins, `ponytail-config.js` and optional git grouping. It reads all .jsonl sessions under CLAUDE_CONFIG_DIR/projects (or ~/.claude/projects), plus subagent transcripts; skips automated/no-human and temporary-project sessions; merges unseen session-prefix rows into CSV ledgers. It does NOT create board.html.

The import can be isolated with CLAUDE_CONFIG_DIR pointing to a specifically selected transcript tree and XDG_CONFIG_HOME pointing to a selected output root. It has no project/session command-line filter. Exported readRecords/sessionStats/csvRow helpers permit a reviewed adapter to operate on explicitly selected sessions without running the whole scan.

Costs use pinned hardcoded model prices dated 2026-10-17 plus transcript totals. Unknown/fast model prices may remain empty; estimates omit some internal calls. Imported records have no live reuse/test evidence. Idle intervals over thirty minutes are omitted, which also omits sufficiently long tool runs. These are measurement limits, not measured savings caused by Ponytail.

### Other native adapters

OpenCode injects the active rules each context/compaction turn, registers original six skills/commands, and persists a shared mode under XDG_CONFIG_HOME/opencode/.ponytail-active (or ~/.config). Explicit default commands also write Ponytail config. Its V1 path modifies the last system string; V2 appends an owned system part.

Pi appends ponytail-mode entries to host session history, restores from branch/session entries and exposes mode/default/status plus six command aliases. It adds a named system section, with legacy prompt-replacement fallback; off clears the section. UI status and startup toast can be hidden independently. No standalone mode flag is used.

Hermes registers original skills, pre_llm_call and pre_gateway_dispatch hooks and commands. Its runtime mode is process-global, not session-local; shared gateways need host command access control. Context replay is inspected to avoid duplicate injection. Command aliases can enqueue host agent prompts. This code does not itself call a provider, but an explicit alias can initiate the requested normal model turn.

## Dependencies and integration cautions

- Lifecycle helpers and import require Node on the noninteractive PATH; source docs explain the need but do not provide a complete platform-specific official install recipe. Do not substitute another engine.
- Code inventory/import grouping use Git; band uses Git, grep and host APIs. Title reading falls back to host file reads, limited to 4 MiB; model-name reading lacks that fallback. Bash status badge uses head/tr; Windows counterpart uses PowerShell.
- Board/metrics rendering is TypeScript; live band is TSX importing `claude-code`. They rely on native host compilation/API support, not a standalone Node CLI. Current literal-argv delivery wiring cannot represent this module.
- The instruction builder hardcodes `../skills/ponytail/SKILL.md`; Muro's absorbed-source rename breaks that path unless adapted. Native modules also hardcode original plugin names, commands and state keys. Do not register them verbatim beside Muro's own coordinator.
- CSV updates have no interprocess writer lock and use project basenames; concurrent sessions and same-named projects can collide. Source comments also acknowledge same-repository mode sharing and regex approximations.
- The uninstall script performs top-level writes/deletes when loaded, removes global original Ponytail state and edits source-owned statusline segments; it is not a safe importable helper. It leaves historical board data intact. Keep it inert and unselected.
- No inspected lifecycle, mapping, import, metrics or board function makes direct provider/model calls. Extra prompts add context tokens; UI review/audit aliases cause normal explicitly requested agent work.

Original recurring cost: one Node process per lifecycle event, an extra Node plus Git inventory at startup when enabled, in-process band work plus Git/grep/file I/O, all-project CSV board regeneration each main turn, and an optional HTTP POST. The curated exclusion removes these original automatic costs; any permanent Muro policy has its own disclosed context cost.

## Delivery recommendation

Record a `dropped` decision for the unselected original host adapters, telemetry/board/import/webhook/statusline and installation/cleanup infrastructure, with the precise selection rationale above. Do not emit their hooks or ship their auto-discovery manifests. This is a source-selection boundary, not an assertion of equivalent generated functionality.

Retain canonical method outcomes in capabilities or the parent's narrowly scoped permanent synthesis. Keep review/audit/debt/gain/help discoverable through the coordinator. Treat lite/full/ultra as explicit working preferences; preserve the difference between building the requested task, suggesting a smaller option and questioning unjustified scope. Do not carry over sardonic identity, compulsory English output or implementation of global state behind those preferences.

Evidence scope: 30 files statically inspected, no upstream execution, no live host validation, no benchmark reproduction, no external webhook or transcript access.

