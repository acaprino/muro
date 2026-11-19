# Portable desktop and command-line tools

The Windows desktop calls the bundled native `muroctl.exe` service. The same executable is available for scripts and diagnostics. Harness discovery and executable resolution run through the bundled `mukade.exe`, built against the pinned upstream Mukade revision. Registry changes and native plugin operations share the same implementation in the UI and CLI.

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

`snapshot` returns the registry, observed inventory and activity as JSON. `registry` reads only the desired configuration. `scan` refreshes plugin inventories; an incomplete inventory remains an error rather than becoming an empty list.

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
| `snapshot` | `{}` | Registry, observed inventory, activity, jobs, custom-instruction state and `data_dir`. |
| `scan` | `{}` | Like `snapshot`, after refreshing every target's inventory. |
| `discover` | `{}` | Mukade harness discovery records. |
| `save_plugin` | `{"revision":N,"plugin":{...}}` | Adds or replaces a plugin by `id`. |
| `save_target` | `{"revision":N,"target":{...}}` | Adds or replaces a target instance by `id`. |
| `remove_plugin`, `remove_target` | `{"revision":N,"id":"..."}` | Removes it from the desired registry. Uninstalling happens only through a plan. |
| `settings` | `{"revision":N,"settings":{"auto_sync":bool,"interval_minutes":N,"agent":"...","python":"...","factory_path":"..."}}` | All five fields are required; `interval_minutes` is at least 1. |
| `resolve` | `{"id":"plugin-id"}` | Resolves the source, records upstream metadata and native distributions. |
| `plan` | `{}` or `{"reinstall":"plugin-id"}` | Calculates a sync plan, or a reinstall plan from the retained verified artifact. |
| `apply` | `{"plan_id":"..."}` | Applies a saved plan after rechecking its inputs. |
| `maintenance` | `{"kind":"verify"}` or `{"kind":"cleanup"}` | `verify` rehashes stored artifacts. `cleanup` removes artifacts no receipt references; existing plans must then be recalculated. |
| `custom_instructions` | `{"id":"plugin-id","create":bool}` | Folder path, Markdown files, digest and stale harnesses. |
| `open_custom_instructions` | `{"id":"plugin-id"}` | Creates the folder if needed and opens it in the OS file manager. |
| `adapt` | `{"id":"plugin-id","harness":"...","agent":"claude-code","budget_usd":2}` | Starts an AI adaptation job. `budget_usd` defaults to 2 and must be above 0 and at most 100. |
| `jobs` | `{}` | Job records. |
| `cancel_job` | `{"id":"job-id"}` | Requests cancellation. |

`recover_jobs` and `automation_record` are used internally by the desktop app. In `serve`, each request `id` must be an unsigned integer.

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
