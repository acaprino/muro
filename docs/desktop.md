# Muro desktop registry

Windows-first native portable Tauri application. The Rust registry and desktop runtime live in `crates/`; the UI and native shell live in `apps/desktop/`. The Python factory remains independent and standard-library-only. The GUI communicates with bundled `tools/muroctl.exe` over correlated NDJSON; that backend invokes bundled `tools/mukade.exe` for discovery and executable resolution. Both tools can also be called directly. See [CLI reference](desktop-cli.md).

## Run from source

Requires Node/npm, Rust with the Windows build tools, Git and WebView2. Install dependencies with `npm ci`. Stage the private Python/factory resources into a **new** directory:

```powershell
python scripts/desktop_resources.py --out apps/desktop/src-tauri/resources
npm run desktop
```

The resource command verifies the official embedded Python archive hash and refuses to replace an existing directory; `--archive` takes an already downloaded copy of that archive for an offline build. The staged `factory/` is a copy of `muro/`, `prompts/` and the ADRs, and AI adaptation in the app runs that copy. When the factory changes, stage to a new directory and swap it in place of `apps/desktop/src-tauri/resources`; a stale copy runs the old factory. Build the CLI tools with `cargo build -p muro-desktop-runtime --bins` before launching the app. `npm run build` builds the frontend, `cargo build -p muro-desktop --features custom-protocol` embeds it in a native development executable (the one the packaging command below expects; a debug build keeps a console window). `npm run desktop:build` builds the optimized executable without publishing or installing it.

For an optimized production folder in one step, run `build-release.bat` from the repository root. It runs `npm ci` when `node_modules` is missing (or with `--ci`), stages fresh resources and tools under `.scratch\release`, builds release executables, fetches the Mukade license at the revision pinned in `crates/muro-desktop-runtime/Cargo.toml`, writes the portable folder to `release\` (made again on every build), installs it into `D:\Software\Muro` and removes the staging; cargo's `target\` stays as the build cache. The install copies over the folder: `data\` and anything else only the install holds stay, and it waits while Muro runs from there. `--no-install` stops at `release\`, `--target <folder>` installs elsewhere, `--jobs N` limits parallel Rust jobs. It does not publish, sign or zip the folder. Shinatama, Mukade and Xiox have the same script with the same steps and options.

To prepare a complete portable folder by hand, use fresh output paths:

```powershell
python scripts/desktop_tools.py --out .scratch/portable-tools
Copy-Item target/debug/muroctl.exe,target/debug/mukade.exe .scratch/portable-tools/
Invoke-WebRequest -Uri https://raw.githubusercontent.com/acaprino/mukade/8bd16369a47465417cee62521d03d65a0c5867e8/LICENSE -OutFile .scratch/portable-tools/Mukade-LICENSE.txt
python scripts/desktop_package.py --exe target/debug/muro-desktop.exe --resources apps/desktop/src-tauri/resources --tools .scratch/portable-tools --mukade-license .scratch/portable-tools/Mukade-LICENSE.txt --out .scratch/Muro-portable
```

The tools script verifies the official Git and curl archive hashes, retaining licenses and runtime files. The Mukade license command fetches the license from the exact revision pinned in `crates/muro-desktop-runtime/Cargo.toml`; update both together when repinning Mukade. `--mukade-license` is required and the packager copies that file to `LICENSES/Mukade-MIT.txt`. The package includes the application, CLI executables, private resources, documentation, examples and SHA-256 manifest. It requires Windows WebView2; managed AI harnesses remain their own installed applications. Move the whole folder, not just `Muro.exe`.

## Registry workflow

1. Discover harness executables with Mukade and add the instances you intend to manage. Specify each instance's configuration root explicitly; a discovered session store is not a plugin root.
2. Add a plugin source, select its target instances and update policy. Resolve the source to inspect native distributions and record the upstream revision. Prepared local distributions can also be entered directly.
3. If a distribution is missing, start an AI adaptation job. A real Claude Code agent performs intake and harmonization; the factory independently validates, checks sources and stages the output. Status and log paths appear in Activity. It does not install the generated package.
4. Calculate and review a sync plan. Applying it verifies registry revision, observed inventory and artifact content again. A second plan after a successful sync should have no operations.
5. Enable exclusive mode per instance to include recognized installed plugins outside the desired registry in removals. This does not authorize deleting sessions or arbitrary configuration files. All replacement artifacts are prepared before operations begin; incomplete inventory blocks application.

Upstream version/revision and each native or Muro-generated distribution version are shown separately. Changing a plugin's source clears every prepared distribution and its resolved upstream metadata; resolve or adapt the new source before syncing. Editing only a name preserves existing provenance. Stable resolution prefers published GitHub releases; explicit pins and HEAD are available. Sources without sufficient release information require an explicit choice instead of a guessed version.

Registry writes are revision-checked and atomic; native operations have a journal and are followed by an inventory scan. Failed or interrupted operations require inspection and a fresh plan, not blind replay. Reinstall is an explicit plan operation that uses the retained verified artifact, not today's source. After it, the installed files must hash like that artifact on Claude Code, OpenCode and Pi; Codex reports no install folder and Hermes installs a Git clone, so there only the version and activation are checked. Maintenance verifies stored artifacts and removes artifacts no installation receipt references; plans calculated before a cleanup must be recalculated.

## Custom instructions from Markdown

Each registry plugin can have its own folder of custom instructions. These files are inputs to AI harmonization, alongside the selected upstream source. Write ordinary UTF-8 Markdown; no frontmatter, special filename or domain taxonomy is required. Nested folders and `.md` files are supported. Names and alphabetical order do not determine rule priority or activation.

1. Select the plugin and open **Custom instructions** in its details and click **Open folder**. Muro creates and opens its managed folder under `data/custom-instructions/<plugin-id>/`. To use an existing folder, choose **Edit**, enter its absolute path in **Custom instructions folder**, and save. Leave the field blank to return to the managed folder.
2. Create or edit one or more Markdown files with your editor. For example, put the following in `recap-adhd.md`: `During long operations, agent waits, important changes and autonomous decisions, give a short ADHD progress recap: where we are and what remains.`
3. Click **Reload files** to reread the folder. The plugin details show the folder, Markdown files and the harnesses that need a new adaptation (**Adapt again**). Adding, editing, renaming or removing a file can require regeneration; deleting the final file also requires removing its old contribution from the package.
4. Choose **Adapt with AI** for the destination harness. The agent reads a snapshot of the Markdown, decides how it becomes session policy, capability instructions or supported hooks, and records its reasoning and coexistence decisions. The job does not install the generated adapter. Changed files during the job prevent the old result from being accepted as current.
5. Review and apply a new synchronization plan. An artifact that does not match the current instructions is blocked, including a native distribution that has not incorporated them. Repeat adaptation for each destination harness that needs a new distribution.

The original files stay separate from upstream snapshots and survive source updates. Instructions are not automatically made permanent: that is an AI decision. Generated packages retain the original files needed at runtime and record the contribution of files carried entirely into policy. Read [the CLI workflow](desktop-cli.md) to inspect or open these folders and launch the same adaptation without the GUI.

## Runtime and storage

Portable distributions contain `portable.marker` and keep state under `data/` beside `Muro.exe`. Development builds without the marker use the application data directory for `dev.muro.registry`. `MURO_DATA_DIR` or CLI `--data` selects an explicit registry. External harness target roots stay explicit and are not moved with the app. The app always uses its own WebView2 profile, avoiding collisions with a parent application such as Shinatama. Closing the window leaves Muro in the notification area; **Quit** quits it. Automatic synchronization is opt-in and runs only while the application is running, including in the notification area. Each interval it resolves every plugin, calculates a plan and applies it without a review step, stopping only on blockers. On an exclusive target that includes removing plugins outside the registry. Its latest result appears in Activity.

For diagnostics, `Muro.exe --request ACTION '<json>'` runs one request through the bundled `muroctl` and prints the result without opening a window (the windowed release build has no console, so prefer `tools\muroctl.exe` for scripts). The actions are listed in [the CLI reference](desktop-cli.md#request-actions). Moving the portable folder rebases registry, receipt and plan paths inside it at the next start.

Claude Code, Codex, OpenCode, Pi and Hermes have separate installation contracts. DeepSeek is discoverable through Mukade but has no Muro plugin adapter. An unavailable command or failed inventory is shown as incomplete, never as an empty installation. Existing host permissions remain authoritative.

AI adaptation currently requires Claude Code for its budgeted execution. Codex does not expose an equivalent dollar-budget flag, so the app does not pretend to enforce one. Claude's budget is checked by the host between turns, not a strict prepaid ceiling. Jobs also have a 30-minute deadline. On Windows their subprocess trees are attached to a kill-on-close job object. Cancellation leaves the registry unchanged unless validated output has already been recorded. Native install commands can have host-specific effects; inspect the plan and resulting activity.

## Looks

The interface has two looks, chosen in **Settings → Appearance** and remembered in the WebView's own storage (`muro.look`, `muro.theme`). **Smooth** is the default: `apps/desktop/src/smooth.css`, every rule scoped to `:root[data-look="smooth"]`, with a dark and a light theme that follow the system unless one is chosen. **Classic** is the original look, `styles.css` as it was, always dark. `src/look.ts` sets `data-look` and the resolved `data-theme` on the root. The window is acrylic (`transparent` and `windowEffects` in `tauri.conf.json`): Smooth lets it show through translucent bars and sheets, Classic paints over it. Maintenance (verify, reinstall, clean up) is a section of Settings.

## Verification

AI work-directory and read-only-factory instructions are agent rules, not an OS filesystem sandbox. Windows process jobs enforce child-process lifetime only; host permissions remain authoritative. Generated manifests must match the resolved upstream revision before their distributions are recorded.

```powershell
cargo test -p muro-registry -p muro-desktop-runtime
npm test
node apps/desktop/tests/browser.mjs   # MURO_UI_PORT=<port> when 1422 is taken
node apps/desktop/tests/native.mjs
python -m pytest -q
python muro_build.py --manifest examples/marionette/sources.json --validate
```

The native smoke test launches the actual executable with isolated data and WebView profiles. It exercises IPC, persistence and an OpenCode configuration sync twice. That proves the app/configuration boundary; it does not prove that an OpenCode agent loaded and executed a plugin. See the dated verification record for real host checks and remaining limits. No personal harness installation is required by these tests.
