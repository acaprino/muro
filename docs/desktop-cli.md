# Portable desktop and command-line tools

The Windows desktop calls the bundled native `muroctl.exe` service. The same executable is available for scripts and diagnostics. Harness discovery and executable resolution run through the bundled `mukade.exe`, built against the pinned upstream Mukade revision. Registry changes and native plugin operations share the same implementation in the UI and CLI.

The [request actions](#request-actions) cover the app's four jobs. Harness manager: `discover`, `save_target`, `remove_target` and `scan`. Plugin sync: `plan` and `apply`. Plugin updater: `resolve`, `plan` with `reinstall`, and `maintenance`. Projects: `projects`, `project`, `open_project`, `install_project`, `open_folder` and `save_projects` (the `.mp` files, [Projects and the AI engine](#projects-and-the-ai-engine)), `create_project`, `project_job`, `edit_project`, `delete_project` and `project_updates` (making and changing a project, [ADR-0032](adr/ADR-0032-desktop-projects-write-side.md)), and `simulate`, `cancel_simulation` and `env_present` (the simulator and its engine). `adapt` starts an AI adaptation for a harness without a native build; `jobs` and `cancel_job` follow and stop an AI run, an adaptation or a project's.

## Portable layout

```text
Muro.exe
portable.marker
SHA256.json
README.md
docs/desktop.md, docs/desktop-cli.md
examples/desktop/
LICENSES/Mukade-LICENSE.txt
tools/
  muroctl.exe
  mukade.exe
  git/cmd/git.exe
  git/ucrt64/
  git/usr/
  curl/bin/curl.exe
  PROVENANCE.json
resources/
  PROVENANCE.json
  python/python.exe
  factory/muro_build.py
  projects/marionette-<version>.zip, marionette-<version>.zip.sha256
data/
```

With `portable.marker` present, the default registry lives in `data/` beside `Muro.exe`. `MURO_DATA_DIR` or the CLI's `--data` argument selects a separate directory. Keep the complete folder together when moving the application: Git's supporting executables, DLLs, certificates and license files are required. Private Python runs the existing Muro factory. The Windows UI still uses Microsoft's WebView2 runtime.

The CLI prepends the bundled tool directories to its child-process environment; it does not install tools globally or change the user's system `PATH`. Coding-agent harnesses and their credentials are supplied by the user and discovered through Mukade.

## Read the current state

Run these commands from the portable folder in PowerShell:

```powershell
.\tools\muroctl.exe --help
.\tools\muroctl.exe request snapshot
.\tools\muroctl.exe request registry
.\tools\muroctl.exe request scan
```

`snapshot` returns the registry, observed inventory and activity as JSON. `registry` reads only the desired configuration. `status` returns `{"revision":N,"settings":{...},"sync":{...}}` (the registry revision, its settings and the recorded sync state) from `registry.json` and `sync-status.json` alone: it scans nothing and, unlike every other action, it does not take the writer lock, so it answers while a check or a save holds the registry. The tray and the background worker read it; use it to poll. `scan` refreshes plugin inventories; an incomplete inventory remains an error rather than becoming an empty list.

For an isolated registry:

```powershell
.\tools\muroctl.exe --data .\test-data request snapshot
```

## Mukade discovery

```powershell
.\tools\mukade.exe harnesses
.\tools\mukade.exe muro-discover --cache .\data\mukade-cache
.\tools\mukade.exe muro-resolve codex
```

`harnesses` is the upstream human-readable command. Muro adds two JSON interfaces: `muro-discover` returns discovery records, and `muro-resolve` returns the resolved executable. Other commands are forwarded to the pinned upstream Mukade CLI. The Muro JSON interfaces use canonical harness names: `claude-code`, `codex`, `opencode`, `pi`, `hermes`, `deepseek`.

A discovered session-store path is evidence about sessions, not authorization to manage plugins there. Configure each target's plugin configuration root explicitly.

## Plan and apply

```powershell
.\tools\muroctl.exe request plan
```

Review the returned operations and blockers. Save the exact returned plan ID in `apply.json`:

```json
{"plan_id":"the-id-returned-by-plan"}
```

```powershell
.\tools\muroctl.exe request apply --input .\apply.json
```

Application rechecks the registry revision, inventory and prepared artifacts. If they changed, calculate a new plan. Exclusive targets include removal of plugins outside the configured registry; inspect the plan before applying it. A second unchanged plan should contain no operations.

`plan` also takes `{"target_id":"..."}` to compare only that harness; a plan for one harness records only that harness's `checked` time. An unknown or disabled `target_id` is refused with `Target not found`.

### Check

```powershell
.\tools\muroctl.exe request check
```

`check` is what the app's **Check now** sends: it resolves every plugin's source, saves what it found, calculates the plan, and returns `{"snapshot":{...},"plan":{...},"errors":[...]}`. A plugin whose source could not be resolved is listed in `errors` (`{"plugin_id":"...","message":"Source folder not found: ..."}`, naming the source as it was written) and the plan is still calculated. A local folder may be written with a leading `~`, `~/` or `~\`, which stands for the user's home folder (`USERPROFILE` on Windows, `HOME` elsewhere). A check that found nothing new leaves the registry revision as it was, so plans and open forms stay valid. It takes the same optional `target_id` as `plan`. Every full check or plan records the sync state, which the next `snapshot` returns as `sync`. A full check also records `errors`, the number of sources it could not resolve (`null` before any check); a plan resolves no source and leaves that count as the last check left it.

### Blockers

A plan lists what cannot be done yet in `blockers`: a harness whose folder or inventory cannot be read, a plugin without a build for its harness. `apply` refuses a plan with blockers unless the payload says `"allow_blocked":true`:

```json
{"plan_id":"the-id-returned-by-plan","allow_blocked":true}
```

```powershell
.\tools\muroctl.exe request apply --input .\apply-blocked.json
```

The operations that are ready run, and the result is the snapshot plus `left_out`, the blockers that were not applied. On a harness that has a blocker the plan holds no removal at all: a plugin of the registry whose build failed must not be uninstalled as if it were outside the list. `allow_blocked` must be a boolean.

### Sync now

```powershell
.\tools\muroctl.exe request sync_now --input .\sync.json
```

`sync_now` is the background worker's step: a `check`, then, when the plan has operations other than removals, an `apply` of that plan with `allow_blocked` and `skip_removals`: it never uninstalls. `{"apply":false}` only checks; the default is to apply. It returns `{"applied":N,"pending":N,"blockers":[...],"errors":[...],"removals":N}` (`removals`: the removals that wait for a person's confirmation) and records its outcome in `automation-status.json` for the Activity page: *Automatic sync* when it applied, *Background check* when it only looked; failed, with the blockers as the message, when blockers remain, and failed too when the check could not resolve a source, with the message `Sources not checked: <plugin names>` (a run with both says the sources first, then the blockers, joined by a full stop); what could be applied still is. Called through `muroctl` it has no gate: the registry refuses a second writer while one runs, so wait for it. The desktop app lets one `sync_now` and one `apply` run at a time and makes Quit wait for them. Every other request of the desktop window waits for the sync in progress (10 minutes at most), then tries a busy registry again every 250 ms for 15 seconds before it returns "Registry is busy"; `discover` and `status` do not wait. The app does this in one place, so a client that talks to the shell needs no retry of its own.

Commands accepting structured payloads use `--input` to read a UTF-8 JSON file. For example, save `resolve.json` containing a registry plugin's exact ID:

```json
{"id":"the-plugin-id-in-registry"}
```

```powershell
.\tools\muroctl.exe request resolve --input .\resolve.json
```

The `save_plugin`, `remove_plugin`, `save_target`, `remove_target` and `settings` actions require the current registry `revision` in their payload. Read the current registry before writing; do not retry with a guessed revision.

When changing an existing plugin's source, discard its old `distributions` and resolved upstream metadata, then resolve or adapt the replacement source. A display-name edit alone does not invalidate those artifacts.

## Request actions

Every action works the same through `request ACTION --input PAYLOAD.json` and through `serve`. An omitted `--input` sends `{}`.

| Action | Payload | Effect |
|---|---|---|
| `registry` | `{}` | Desired configuration only. |
| `snapshot` | `{}` | Registry, observed inventory, activity (the last 500 events), jobs, custom-instruction state, `sync` (the recorded sync state: `last_check`, `last_sync`, `pending`, `blockers`, `errors`, the registry `revision` of the last full plan, and `checked` and `synced` for each target) and `data_dir`. A `sync-status.json` that cannot be read is no record: `sync` is then the state before any check, and the next check or sync writes the file again. |
| `status` | `{}` | `{"revision","settings","sync"}`, read without the writer lock. See [Read the current state](#read-the-current-state). |
| `scan` | `{}` | Like `snapshot`, after refreshing every target's inventory. |
| `discover` | `{}` | Mukade harness discovery records. |
| `save_plugin` | `{"revision":N,"plugin":{...}}` or with `"adopt":{"target_id":"...","native_id":"..."}` | Adds or replaces a plugin by `id`. With `adopt`, a plugin that is being added takes over an installation that is already on a harness: the service writes the receipt that binds the plugin to that native installation, with the version and the digest of the copy that is there, as an install by Muro leaves it, so the next plan finds the plugin installed (nothing to do when the copy is the build, an update when it is not) instead of installing a second copy. Refused, and nothing saved, when the harness is not in the registry or cannot be read, when nothing with that `native_id` is installed there, when it already belongs to a plugin of the list, when the plugin is in the list already, or when it does not list the harness. |
| `save_target` | `{"revision":N,"target":{...}}` | Adds or replaces a target instance by `id`. |
| `remove_plugin`, `remove_target` | `{"revision":N,"id":"..."}` | Removes it from the desired registry. Removing a plugin also deletes its receipts, so its installed copies are no longer managed. Uninstalling happens only through a plan. Removing a harness also removes its times from the sync state. |
| `settings` | `{"revision":N,"settings":{"auto_sync":bool,"interval_minutes":N,"close_to_tray":bool,"agent":"...","python":"...","factory_path":"..."}}` | All six fields are required; `interval_minutes` is at least 1. A seventh, `ai`, is the AI engine (see [Projects and the AI engine](#projects-and-the-ai-engine)); a payload without it keeps the stored one, with `agent` standing for `ai.harness`. `close_to_tray` is required since the desktop shell reads it: a payload without it, or with anything but a boolean, is refused with `close_to_tray must be boolean`, so a client written before it existed reads the settings first and sends them back whole. A settings save keeps the recorded sync state current. |
| `resolve` | `{"id":"plugin-id"}` | Resolves the source, records upstream metadata and native distributions. |
| `check` | `{}` or `{"target_id":"..."}` | Resolves every source, then plans: `{snapshot, plan, errors}`. See [Check](#check). |
| `plan` | `{}`, `{"reinstall":"plugin-id"}` or `{"target_id":"..."}` | Calculates a sync plan, a reinstall plan from the retained verified artifact, or a plan for one harness. |
| `apply` | `{"plan_id":"..."}`, with `"allow_blocked":true`, and for a plan with removals `"confirm_removals":N` or `"skip_removals":true` | Applies a saved plan after rechecking its inputs. With `allow_blocked` a plan with blockers applies what is ready and returns `left_out`. A plan with N `remove` operations is refused ("This plan uninstalls N plugins; review it and confirm the removals") unless `confirm_removals` is N; with `skip_removals` the removals are left out. The answer holds `skipped_removals`. See [Blockers](#blockers). |
| `register_distributions` | `{"id":"...","source":"...","upstream_revision":"...","expected_custom_instructions_digest":"...","asked":"codex","version":"...","adapters":[{"harness":"...","path":"..."}]}` | Records the adapters an AI adaptation built, merged into the plugin as it is now, without a `revision`: the harness asked for, and every harness with no distribution or an earlier adaptation. Refused when the plugin's source or revision changed. |
| `sync_now` | `{}` or `{"apply":bool}` | A check, then an apply that leaves blockers and removals out; `apply` false only checks. See [Sync now](#sync-now). |
| `maintenance` | `{"kind":"verify"}` or `{"kind":"cleanup"}` | `verify` rehashes stored artifacts. `cleanup` removes artifacts no receipt references; existing plans must then be recalculated. |
| `custom_instructions` | `{"id":"plugin-id","create":bool}` | Folder path, Markdown files, digest and stale harnesses. |
| `open_custom_instructions` | `{"id":"plugin-id"}` | Creates the folder if needed and opens it in the OS file manager. |
| `adapt` | `{"id":"plugin-id","harness":"...","agent":"claude-code","budget_usd":2}` | Starts an AI adaptation job. `agent` defaults to `settings.ai.harness`. `budget_usd` defaults to 2 and must be above 0 and at most 100. |
| `jobs` | `{}` | Job records, newest first: the adaptations and the runs of a project (`kind: "project"`, with `project_id`, `operation`, `title`, `file`, `phase`). Takes no registry lock. |
| `cancel_job` | `{"id":"job-id"}` | Requests cancellation. A project run that has started to build and save the project (phase `Building and saving the project`) ignores it: the file is replaced, or not, as the run ends. Takes no registry lock. |
| `save_projects` | `{"revision":N,"projects":[{"id":"...","path":"C:\\...\\x.mp"}]}` | Saves the whole list of project files (revision-checked like every registry write). Refused, and nothing saved, for an id that is not valid or is repeated, a path that is not absolute, holds `..` or does not end in `.mp`, and two entries for one file. `open_project` is how the window adds one. |
| `projects` | `{}` | One summary for each listed project, in list order: `{id, path}` and what `muro project info --summary` says of the file (`project`, `plugin: {name, slug, version}`, the counts `inputs`, `capabilities`, `entries`, `examples`, `records`, `runs`, and `digest`), or `{id, path, error}` for a file that is missing or that the factory refuses, so one bad file never hides the others. An empty list runs no factory. See [Projects](#projects-and-the-ai-engine). |
| `project` | `{"id":"..."}` | The full `muro project info` of a listed project, for its page. |
| `open_project` | `{"path":"C:\\...\\x.mp"}` | Reads the file through the factory and lists it under its plugin's slug, where it is (it is not copied). The same file again is the same entry. A file that is not a project is refused with the factory's reason and listed nowhere; another file with the slug of a listed project is refused. Answers the summary of the project, with its `id` and `path`. |
| `install_project` | `{"id":"...","targets":["target-id","..."]}` | Puts the project's built plugin on the targets named (ids of managed harnesses: enabled targets of the registry), in one place: the registry plugin `<slug>` (marked `project: <id>`, its source the file's unpacked release folder in the runtime's cache) gets one distribution for each distinct harness kind of those targets, from the release inside the file as it is now and recording the file's digest, and its targets become exactly those ids, each once, in the order named: a target not named is not made one and is not touched by a later call (a paused target the plugin already holds stays, since the page shows no switch for it). The answer has `targets` and `harnesses` (the kinds). The plugin inside the file is first checked against the package beside it (`muro project verify`). Nothing reaches a harness until a plan is applied. Refused, and nothing saved, for no targets, an unknown or paused target, a build without that adapter, a plugin that does not match its package, a plugin of that name that is not this project's, or a file that now holds another plugin. A copy of the plugin already on a named target under the name the build declares is then taken over (`take_over`). |
| `take_over` | `{"revision":N,"plugin_id":"...","target_id":"...","name":"..."}` | The copy installed on the target under the native name `name` (`plugin_name` of the inventory: the part of a Claude Code or Codex id before `@`, Hermes' name) becomes the plugin's: the service writes an adopted receipt for it, with its version and digest, so the next plan updates it to the plugin's build instead of installing a second copy; a plugin of the list that held it loses that target and its receipt there. Nothing changes when the harness cannot be read (its plan has the blocker; installing the project there again once it reads takes the copy over), when the plugin has its own copy there, or when none of that name is there with its files. Refused when the plugin does not list the target. |
| `remove_project` | `{"id":"...","revision":N}` | Takes a project off the list, never its file; the default project is refused with "The default project stays in the list". The cache folders nothing needs any more are removed. |
| `open_folder` | `{"path":"..."}` | Opens the OS file manager on the folder of a listed project's file; `path` is that file or its folder. Any other path is refused. |
| `simulate` | `{"id":"...","task":"...","stack":["stack:..."],"run":"run-id"}` | Runs one free-text request against a project's decision graph through the engine `settings.ai.engine` names, and answers what the factory's check says (`valid`, then the ordered steps or the errors) with `engine`, `model` or `harness`, `cost_usd` (null when the engine does not report one) and `duration_ms`. An invalid answer is a result (`valid: false`), not an error. At most 540 seconds. `stack` and `run` are optional; `run` names the run so `cancel_simulation` can stop it. |
| `cancel_simulation` | `{"run":"run-id"}` | Ends a running simulation, its process and what it started, within a moment: `simulate` then fails with `... was cancelled`. |
| `create_project` | `{"name","slug","author","folder","inputs":[{"source":"https://…"\|"C:\…"}],"request","repository"?,"budget_usd"?}` | Starts the AI job that makes a new project in `<folder>/<slug>.mp` ([ADR-0032](adr/ADR-0032-desktop-projects-write-side.md)). A new project starts at its own version; there is no `step`. The agent runs with `--setting-sources user --strict-mcp-config` (nothing of its work folder configures it; your own user settings, plugins and hooks still load into every turn) and the run stops after 120 minutes. Refused before any cost: another run in progress, an agent that is not Claude Code, a slug that is not kebab-case, the shipped project's, already listed or a plugin of the list, a folder that is missing or relative, a file that exists, no input or the same one twice, a budget outside 0 to 100. Answers the job record. |
| `project_job` | `{"id","digest","operation":"harmonize"\|"add_input"\|"remove_input"\|"move_pin"\|"instructions", ...}` | Starts the AI job that changes the project `id` while its file still has `digest` (64 hex characters, the file as the page read it): `source` for add_input, `input` for remove_input, `input` and `to` for move_pin (`to` empty is the newest release), `instructions` (the edits) for instructions; optional `request` (words for the AI, read by every operation), `budget_usd` and `step` (`patch`, `minor` or `major`: `none` is refused; the default is `minor` for add_input and remove_input and `patch` for the rest). "The project file changed since it was opened" when the file is another. The file is replaced only when the build succeeds. The agent and the limit are those of `create_project`. |
| `edit_project` | `{"id","digest", "name"?, "author"?, "repository"?: {url, branch, tag_prefix} or null, "records"?, "changelog"?}` | Edits what no AI judges, offline, through `muro project edit`; refused while an AI run changes the project. Answers the project's new digest. |
| `delete_project` | `{"id","revision":N}` | Takes the project off the list and deletes its file. The shipped project cannot be deleted; refused while an AI run changes it. |
| `project_updates` | `{"id"}` | Read-only: how each input's pin stands against its upstream (`current`, `behind` with the newest release or commit, `frozen`, `drifted`, `unknown`, `error`), through `muro baseline --json`. Moving a pin is `project_job` `move_pin`. |
| `pick_folder` | `{}` | The shell's folder dialog: `{"path":"…"}` or `{"path":null}` when closed. Answered by the window's shell only, like `pick_file`. |
| `env_present` | `{"name":"MURO_API_KEY"}` | `{"set":bool}`: whether that environment variable is set and not empty for Muro. The value is never read into the answer. A name that is not a variable name is refused. |

`recover_jobs` and `automation_record` remain for compatibility; the desktop app uses neither (its worker calls `sync_now`). In `serve`, each request `id` must be an unsigned integer, and each request is served on its own worker, so a long one does not hold the others up: answers come back in the order they finish, matched by `id`. `simulate` can last minutes and holds no registry lock while the AI works (it reads the registry for a moment at its start), so a client sends it beside other requests and sends `cancel_simulation` with the same `run` while it is going. The desktop window does exactly that (`ALONE` in `apps/desktop/src/queue.ts` lists `discover`, `simulate`, `cancel_simulation`, `jobs` and `cancel_job`), and its shell holds a `simulate` back while a sync is in progress and lets `cancel_simulation`, `env_present`, `discover`, `status`, `jobs` and `cancel_job` through (`WITHOUT_THE_LOCK` in `apps/desktop/src-tauri/src/main.rs`).

`autostart` (`{}`: whether Muro starts with Windows), `set_autostart` (`{"enabled":bool}`) and `pick_file` (`{"filter":"Muro project (*.mp)"}`: the native open-file dialog over the main window, answering `{"path":"..."}` or `{"path":null}` when it is closed without a file) belong to the desktop shell: only it knows its own executable and can show a dialog, so only the window's `request` command answers them. `muroctl` and `Muro.exe --request` answer `Unknown registry action: autostart`. The shell reads and writes the per-user Run value described in [Runtime and storage](desktop.md#runtime-and-storage). `filter` is a name and the extensions of its `*.ext` patterns in parentheses; any other text is refused. The dialog comes from `tauri-plugin-dialog`, whose commands the page is not granted: only the shell's Rust code opens it.

## Projects and the AI engine

A project is a `.mp` file (ADR-0028). The registry holds the list, `registry.projects`: `{id, path}` for each, saved whole with `{"action":"save_projects","revision":N,"projects":[...]}` (the id is a valid ID and unique, the path absolute, without `..`, ending in `.mp`, and no two projects name the same file, Windows spelling aside; an older registry reads with an empty list). The factory owns the format: the runtime reads a file only through `muro project info`, which unpacks it once per file content into `<data>/project-cache/<digest>`. A plugin made from a project carries `project: <id>` and its distributions record `project_digest`, the file's SHA-256; a plan finds a build stale, as a blocker `<target> / <plugin>: Project file changed: open the project again`, when the file in the list is not the one it was built from (changed, no longer in the list, unreadable, or a build that records no digest). The plugin's installed copy stays; installing the project again takes the file as it is.

The default project, Marionette, is installed from `<resources>/projects/marionette.mp`. Muro's build no longer makes that file (2026-11-22): it bundles the latest release of `acaprino/marionette` as `<resources>/projects/marionette-<version>.zip` (the built plugin folder, with its `.sha256`), which the runtime does not read, so a Muro built so has no default project (`NotBundled`) and a copy an earlier Muro installed stays as it is. When a file `marionette.mp` is shipped, at the first start of a data directory it is copied to `<data>/projects/marionette.mp` and listed, once: a file already there is never replaced (it is the person's own), a project of the list with that id is left alone, and one the person removed or deleted does not come back at every start. The mark `<data>/projects/.default-installed` holds the SHA-256 of the file Muro copied: at a later start a newer shipped project replaces the copy, written beside and then put in place, only while the copy still has that digest; a file with any other digest is the person's and is never replaced. Moving a portable folder rebases the paths of project files kept inside it. The cache `<data>/project-cache` keeps the unpack of each listed file and of each installed build only: it is tidied at start and after `open_project`, `install_project` and `remove_project`, a file the factory refuses leaves no unpack, and staging folders (`.muro-unpack-*`) and `simulations/<run>` folders older than a day are removed at start. A project is *Included with Muro* when the runtime says so (`included`: its id and the copy in `<data>/projects`), never by what the file's `project.json` claims.

`settings.ai`: `{engine: "harness"|"api", harness: "claude-code"|"codex", budget_usd, api_base, model, api_key_env}`, defaults `harness`, `claude-code`, `0.5`, `https://api.openai.com/v1`, empty, `MURO_API_KEY`. `budget_usd` is above 0 and at most 100; `api_base` is https, or http only on `localhost`, `127.0.0.1` or `::1`, with no user name or password (checked again by `simulate`); a partial `ai` changes only the keys it names; `agent` always ends equal to `ai.harness`. `api_key_env` names the environment variable the key is read from and is validated as a variable name in capitals (`^[A-Z_][A-Z0-9_]{0,63}$`, the same rule in the registry, the factory and the settings page): anything else is refused with "The key setting must name an environment variable, not hold a key", without repeating it. The key is never stored, an argument or logged: the factory reads it from Muro's own environment.

`simulate` reaches the AI two ways. Engine `api`: `muro project simulate FILE --task=... [--stack=...] --model=... --api-base=... --api-key-env=NAME --cache DIR` (the `--name=value` form, so a request that begins with a dash is still its value). Engine `harness`: the person's coding agent, headless, with the factory's `muro mcp --tools simulate_prepare,simulate_check` as an MCP server for that call only (the project's unpacked `sources.json` as its manifest), so no other tool of the factory is there to call, which classifies the request itself with `simulate_prepare` and `simulate_check` and ends with its answer, the JSON object it classified with. The runtime never shows what the harness reports: it prepares the request's context itself (`muro project simulate-prepare`, before the harness starts), takes the harness's last message as the answer ("The agent gave no answer" when it holds none), and shows `muro project simulate-check` of the two. The harness runs without the variable the key is read from:

- Claude Code (`claude --help`, 2.1.327): `-p PROMPT --mcp-config mcp.json --strict-mcp-config --allowedTools mcp__muro__simulate_prepare,mcp__muro__simulate_check --tools "" --permission-mode dontAsk --setting-sources project,local --disable-slash-commands --max-budget-usd N --output-format stream-json --verbose --no-session-persistence`. Nothing but the two tools is allowed, nothing asks, no plugin, hook or skill of the person loads, and the dollar budget is enforced by Claude Code. The answer is the last message of the stream's closing `result` line; the cost is its `total_cost_usd`.
- Codex (`codex exec --help`, 0.169.0): `exec --ephemeral --skip-git-repo-check -s read-only -C WORKDIR -o LAST.txt -c mcp_servers.muro.command=... -c mcp_servers.muro.args=[...] -c mcp_servers.muro.enabled_tools=["simulate_prepare","simulate_check"] PROMPT` (the `mcp_servers` keys are those `codex mcp add` writes; `enabled_tools` is the per-server allow-list, not named by `codex exec --help` or `codex mcp --help` but printed by `codex mcp get muro --json -c mcp_servers.muro.enabled_tools=[...]` on 0.169.0). Codex has no dollar budget flag, so none is claimed: the budget applies to Claude Code only, and the answer has `cost_usd: null`. Its answer is the last message's first JSON object.

Both run through the one process helper the adaptation jobs use (no console window, the whole process tree ended on cancel or time-out). Neither harness was run for real (owner instruction): the command lines are checked against each tool's own help, and the output readers are tested on streams written to Claude Code's documented stream-json shape (`tool_use`, `tool_result`, `result` with `total_cost_usd`), not captured from a live run. A live run is the first thing to do before relying on either engine.

At startup, `serve` and `request` point `settings.python` and `settings.factory_path` at the bundled private Python and factory when both are present and the folder is portable (or the registry is new), so a moved portable folder keeps working. Moving the folder also rebases registry, receipt and plan paths that lived inside the old folder; external target roots are left as they are.

## Custom instructions in Markdown

Each registry plugin has a persistent instruction folder. By default it is `data/custom-instructions/<plugin-id>/`, separate from replaceable upstream checkouts and job packages. The optional `custom_instructions_dir` field on the plugin selects an absolute directory instead, including an existing package's `custom-instructions/` directory. A blank or absent field selects the managed folder. Saving or resolving another upstream source preserves that field and the instruction files.

1. Save `instructions.json` using the exact plugin ID returned by `registry`:

   ```json
   {"id":"marionette","create":true}
   ```

2. Create or inspect the folder with the native CLI:

   ```powershell
   .\tools\muroctl.exe request custom_instructions --input .\instructions.json
   ```

   The response includes `path`, Markdown `files`, the current `digest` and `stale_harnesses`. Omit `create` for inspection without creating a folder. `request open_custom_instructions --input .\instructions.json` creates the folder if needed and opens it in the OS file manager.

3. Write UTF-8 Markdown files in that directory, with optional subfolders. For example, `recap-adhd.md` can contain:

   ```markdown
   During work, report a brief ADHD-friendly recap when waiting for agents or
   long operations, making important changes, or deciding autonomously.
   Say where we have arrived and what remains.
   ```

4. Start an adaptation using `job.json`:

   ```json
   {"id":"marionette","harness":"codex","agent":"claude-code","budget_usd":2}
   ```

   ```powershell
   .\tools\muroctl.exe request adapt --input .\job.json
   ```

5. Read the completed job, calculate a new sync plan and inspect its operations before applying it as described above. A successful adaptation records a prepared distribution; installation is a separate sync action.

The AI reads all supplied Markdown as package requirements and decides how they become permanent instructions, capabilities, scoped rules or supported hooks. Filenames, folder order and keywords never choose activation or priority. The factory validates the AI-authored decisions and their file digest. Preparation alone does not perform semantic harmonization.

Jobs preserve an input snapshot under their `inputs/custom-instructions/` directory and give an exact copy to the AI in the package work directory. Rewriting those originals or editing the owner's folder while a job runs prevents the old result from being recorded. The registry also checks its revision before accepting a result.

Adding, changing, renaming or deleting Markdown makes older distributions stale, including deleting the last file. A native artifact without the requested customization cannot satisfy a sync plan. `snapshot` includes a `custom_instructions` array for the UI; reopening or refreshing it observes external editor changes. Plan application rechecks instruction digests even when the registry revision did not change. A retained artifact used for reinstall must match the current instructions too. These checks do not prove that an AI or host follows the instructions semantically.

Markdown content and Unicode relative filenames are hashed exactly; line endings are not normalized. Linked directories, symlinks/junctions, nonregular Markdown, invalid UTF-8 and names containing a backslash, colon or line break are rejected. Files with other extensions are not included. Renaming a file changes provenance and requires another harmonization. No instruction content is stored as a second editable text field in the registry.

## Persistent service

```powershell
.\tools\muroctl.exe --data .\data serve
```

Send one JSON object per input line:

```json
{"id":1,"action":"snapshot","payload":{}}
{"id":2,"action":"plan","payload":{}}
```

The service returns correlated JSON lines. A success has `id`, `ok: true` and `result`; an error has `id`, `ok: false` and `error`. Requests may finish out of order, so correlate by `id`. Keep stdin open while using the service. Only one persistent server owns a given data directory; use a separate `--data` directory for isolated tests.

AI adaptation runs in the configured host agent and has real inference costs. The one-shot `request adapt --input job.json` waits for the job's terminal status; a persistent server keeps background jobs alive. Preparation alone is never reported as a completed adaptation. Use `jobs` to inspect job records and `cancel_job` with `{"id":"job-id"}` to request cancellation.

## Reproduce bundled tooling

From the source checkout, stage a fresh directory:

```powershell
python scripts/desktop_tools.py --out .scratch/tools-new
```

This stages Git and curl only. For the complete portable folder, follow the [packaging commands](desktop.md#run-from-source), including the required `--mukade-license` argument pointing to the pinned Mukade source's `LICENSE`.

For an offline repeat build, provide the two already downloaded official archives with `--git-archive` and `--curl-archive`. Both are checked against pinned SHA-256 digests before extraction. Existing output is refused. The script runs both executables with `--version` and writes the source URLs, checksums and observed versions into `PROVENANCE.json`.

The reviewed Git pin is [Git for Windows v2.56.1.windows.1](https://github.com/git-for-windows/git/releases/tag/v2.56.1.windows.1), using `MinGit-2.56.1-64-bit.zip`. Its SHA-256 is `4a92850b6e917da4fd010669b614b55dccf5b0ec333a534cc4be4700dfefdafd`, verified against the official GitHub release asset digest. MinGit contains libcurl but no `curl.exe`, so the bundle also contains the [official curl Windows build 8.23.0_9](https://curl.se/windows/dl-8.23.0_9/curl-8.23.0_9-win64-mingw.zip), SHA-256 `89cb71930f4242d884e8e349463455932ab1d089b20f4f99318261a3cbff9167`, from its [published checksum](https://curl.se/windows/dl-8.23.0_9/curl-8.23.0_9-win64-mingw.zip.txt).

Full upstream license and notice trees remain in `tools/git` and `tools/curl`. Verification on 2026-11-15 returned `git version 2.56.1.windows.1` and `curl 8.23.0`. These checks verify bundled binaries and archive integrity; they do not install or run an AI harness or modify its plugins.
