# Muro desktop: harness manager, plugin sync and updater

The desktop interface is a React app in Imago's shell (`@acaprino/imago`, with the Rust crate `imago-shell` for the
window), its screens made of Sigrid's parts (`@acaprino/sigrid`; [ADR-0031](adr/ADR-0031-desktop-on-sigrid.md)). The React window took the place
of the Imago window and is not complete: it has the Projects page, where a project is read, simulated and now also made and
changed ([Changing a project](#changing-a-project)), and **Sync**, **Activity**, **Settings** and the first run are not in it
yet (the plans R1 to R3, kept outside this repository, are meant to bring them back). Until they are, a person cannot review
or apply a plan, change a setting or add a harness in the window. The tray, the background
worker and the registry are as they were, so automatic sync still runs, and the registry's operations stay available
through `muroctl` and `muro` ([CLI reference](desktop-cli.md)). [Imago migration](imago-migration.md) records what the
old window took from Imago, kept as history.

## The window

One window with four tabs, **Projects**, **Sync**, **Activity** and **Settings**. It opens on Sync, which says it is moving;
only Projects is built. It is Imago's `AppWindow` (title bar, status row, content, inspector, actions, foot) in Muro's accent
(hue 170).

**The frame.**

- The title bar has Muro's mark and name, the four tabs (under 860 px wide they move to a row under the bar), the
  **Commands** button and the window's three buttons. The shell draws them and wires them to the crate: the caption buttons
  and Snap Layouts, the zoom, kept per machine as `muro.zoom`, and, in a release build, the guard of the browser's own keys.
- The status row says the state of the sync in words (*No harness*, *Not checked yet*, *N changes waiting*, *Needs
  attention*, *A harness cannot be read*, *Sources not checked* or *In sync*), the last check and the next one, and how many
  harnesses Muro manages. The foot says whether automatic sync is on, the last sync and the size of the list, and, with room, the
  keys that work. Both read the snapshot and the check the registry recorded, so a window opened after the background worker
  checked says what the worker found.
- `Ctrl+K` opens the command palette: **Check now**, the four pages and the theme choices. `Ctrl+F` says that no page has a
  search yet, and `F6` goes to the next region.
- The theme is **Light theme**, **Dark theme** or **System theme**, chosen in the palette; dark until one is chosen. The choice
  is kept in the WebView's own storage (`muro.theme`) and by the crate, which shows it before the first frame. The surfaces
  are opaque.
- The window reads the registry again when it is shown from the tray, when it gets the focus and every 30 seconds while it
  has the focus, unless a request of the person is waiting.

**Projects.** The list shows each project file with its version, file and counts (or *Cannot be read* and the reason, for a
file that does not open), and keeps the plugins installed as published apart, under **Installed as published**. **New
project…** (the one solid button of the list) makes a project from the plugins and skills you name, and **Open project
file…** adds an existing one through the shell's file dialog (the button is not shown where the shell has none). On every
project but the one Muro ships (*Included with Muro*), **Remove from list** takes it off after asking, leaving its file
alone, and **Delete…** deletes its file as well, after asking. While an AI run goes the list shows its card above the table,
and **New project…** is off with the reason. [Projects](#projects) says what a project file holds.

A project opens on its workspace. Its head says the project's name, version and counts, its file with **Open folder** (the
file manager on the file's folder, `open_folder`; the button is gone for the session where the shell cannot open folders),
and its repository and branch, its author and its creation date, and **Edit details…**. Below the head comes the card of the
project's AI run, while there is one to say, and then three regions side by side:

- a panel at the left with four views: **Inputs** (the plugins and skills the project absorbs, each with its pin, its
  license and what it became, and your custom instructions), **Examples** (the simulator and the documented examples,
  [below](#the-simulator-and-its-engines)), **Records** (the decision records, which you add, edit and delete by hand) and
  **Runs** (one row per harmonization, newest first, with its version, changelog, result, budget and engine);
- the decision graph in the middle: the discovery entries, closed until opened, with their capabilities under them. A closed
  entry shows its name only, an open one also the first sentence of its "Use when". What the plugin declares between two
  capabilities is a line of its own kind, told by its dash and its words: *runs first* solid with an arrowhead, the AI's
  label of the condition dashed (needs, on a condition), *never together* dotted with no arrowhead. The words show while
  one of the two is chosen or on the lit path, and a screen reader hears them always. Choosing a capability opens the
  entries of what it is joined to, so its lines are drawn. A documented example or the AI's answer is a numbered path:
  each step's number in a dot on its capability, the line between two steps in the accent, the rest dimmed. Choosing an
  input marks the capabilities it went to. Either opens the entries that hold what it lights and brings that into the
  view. The view is never drawn smaller than a name can be read (about 11 px); a graph too large for that, such as
  fifteen closed entries, starts at its first entry, and the rest is a pan, the small map or the find field away;
- the details of what is selected (an example, an input or a capability) in the inspector at the right: docked from 1000 px,
  and a panel over the end of the graph under it. Under 620 px the left panel becomes a drawer, opened by a button.

At the foot are **Review decisions…**, **Harmonize again…**, **Install on harnesses…** and **Add input…**, the last one the
solid button. **Harmonize again…** and **Add input…** start an AI run, and are off, with the reason, while another run goes.
**Review decisions…** (*Coming with the review*) and **Install on harnesses…** (*Coming with the Sync page*) are disabled:
the runtime has no operation that reviews a project's decisions yet, and the window installs nothing on a harness until the
Sync page is back. [Changing a project](#changing-a-project) says what each change does. The open project, its view, the
selection and the request being typed survive a reload of the page (session storage, key `muro.project`); a simulation that
was waiting for the AI never comes back as waiting.

**Sync, Activity and Settings** each say that the page is moving to the new window (*Sync is moving to the new window*, and
so on), and the first run is not shown at all. The tray and the background
worker go on meanwhile ([Runtime and storage](#runtime-and-storage)). Where a section below names a button of those pages
(Check now, Review, Apply all, Add harness, Adapt with AI, the Settings sections), it names the operation of the service
that the page drove; the window has no such button now.

Windows-first native portable Tauri application. The Rust registry and desktop runtime live in `crates/`; the UI and native shell live in `apps/desktop/`. The Python factory remains independent and standard-library-only. The GUI communicates with bundled `tools/muroctl.exe` over correlated NDJSON; that backend invokes bundled `tools/mukade.exe` for discovery and executable resolution. Both tools can also be called directly. See [CLI reference](desktop-cli.md).

## Run from source

Requires Node/npm, Rust with the Windows build tools, Git and WebView2. Install dependencies with `npm ci`. Stage the private Python/factory resources and the latest Marionette release into a **new** directory (this needs the network, see below):

```powershell
python scripts/desktop_resources.py --out apps/desktop/src-tauri/resources
npm run desktop
```

The resource command verifies the official embedded Python archive hash and refuses to replace an existing directory; `--archive` takes an already downloaded copy of that archive for an offline build. The staged `factory/` is a copy of `muro/`, `prompts/` and the ADRs, and AI adaptation in the app runs that copy. The command also takes the latest published release of Marionette (`acaprino/marionette`, built with Muro by `release-marionette.yml`): it reads the GitHub release, downloads `marionette-<version>.zip` and its `.sha256`, checks the digest and places both unchanged in `projects/`, and records the tag and the digest in `PROVENANCE.json`. It builds, packs and validates nothing of Marionette, and a release that does not check out (no zip, no `.sha256`, a digest that differs) removes the folder it just staged and leaves nothing half done. **This step needs the network** for the Python archive and the release; `--archive` covers only the Python download, and a token in `GH_TOKEN` or `GITHUB_TOKEN` is sent to the GitHub API only, to lift its rate limit. The zip is the built plugin folder, not a project file: see **The default project** below for what the app does with it. When the factory changes, stage to a new directory and swap it in place of `apps/desktop/src-tauri/resources`; a stale copy runs the old factory. Build the CLI tools with `cargo build -p muro-desktop-runtime --bins` before launching the app. `npm run build` builds the frontend, `cargo build -p muro-desktop --features custom-protocol` embeds it in a native development executable (the one the packaging command below expects; a debug build keeps a console window). `npm run desktop:build` builds the optimized executable without publishing or installing it.

For an optimized production folder in one step, run `build-release.bat` from the repository root. It runs `npm ci` when `node_modules` is missing (or with `--ci`), stages fresh resources (with the latest Marionette release, from the network) and tools under `.scratch\release`, builds release executables, fetches the Mukade license at the revision pinned in `crates/muro-desktop-runtime/Cargo.toml`, writes the portable folder to `release\` (made again on every build), installs it into `D:\Software\Muro` and removes the staging; cargo's `target\` stays as the build cache. The install copies over the folder: `data\` and anything else only the install holds stay, and it waits while Muro runs from there. `--no-install` stops at `release\`, `--target <folder>` installs elsewhere, `--jobs N` limits parallel Rust jobs. It does not publish, sign or zip the folder. Shinatama, Mukade and Xiox have the same script with the same steps and options.

To prepare a complete portable folder by hand, use fresh output paths:

```powershell
python scripts/desktop_tools.py --out .scratch/portable-tools
Copy-Item target/debug/muroctl.exe,target/debug/mukade.exe .scratch/portable-tools/
Invoke-WebRequest -Uri https://raw.githubusercontent.com/acaprino/mukade/02baf4fa1f269380fce8b84ccb5a2dbca8676907/LICENSE -OutFile .scratch/portable-tools/Mukade-LICENSE.txt
python scripts/desktop_package.py --exe target/debug/muro-desktop.exe --resources apps/desktop/src-tauri/resources --tools .scratch/portable-tools --mukade-license .scratch/portable-tools/Mukade-LICENSE.txt --out .scratch/Muro-portable
```

The tools script verifies the official Git and curl archive hashes, retaining licenses and runtime files. The Mukade license command fetches the license from the exact revision pinned in `crates/muro-desktop-runtime/Cargo.toml`; update both together when repinning Mukade. `--mukade-license` is required and the packager copies that file to `LICENSES/Mukade-LICENSE.txt`. The package includes the application, CLI executables, private resources, documentation, examples and SHA-256 manifest. It requires Windows WebView2; managed AI harnesses remain their own installed applications. Move the whole folder, not just `Muro.exe`.

## Registry workflow

The buttons these steps name belonged to the Sync page, which is not in the window yet ([The window](#the-window)); the operations are the service's.

1. Choose the harnesses to manage: in the first run, or with **Add harness** in Sync. Muro finds the executables with Mukade; each instance's configuration root is explicit, and a discovered session store is not a plugin root.
2. **Add plugin**: give its source, tick its harnesses and choose its update policy. **Check now** (or **Check for updates** in the plugin's panel) resolves the source to inspect native distributions and record the upstream revision. For each harness Muro looks where the harness itself looks, and the structures of different harnesses live side by side in one source: `adapters/<harness>` (the layout of a Muro build), else the harness's manifest at the root (`.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `package.json` with a `pi` or `opencode` key, `plugin.yaml`), else the one plugin folder the harness's marketplace at the root lists (`.claude-plugin/marketplace.json`, with `./` paths or bare names under `metadata.pluginRoot`; `.agents/plugins/marketplace.json`, with local paths). A marketplace entry from another repository or a package is not followed, and Muro does not choose among several plugins of one marketplace: the plan names the sources that choose one. When two or more plugins of a marketplace share one folder (`anthropics/skills` lists four with `"source": "./"`), Muro installs none of them, because it cannot install one alone yet; the plan says, for example, "the source's Claude Code marketplace defines 2 plugins in one folder (document-skills, example-skills); Muro cannot install one of them alone yet". A manifest at the root is found before the marketplace is read. Each harness is resolved on its own: files of one harness that cannot be read (a manifest that is not JSON, say) leave that harness without a build, with a reason that starts "the source's Codex files cannot be read: " (or the name of the harness), and the builds found for the others are still recorded. As in Claude Code, a plugin a Claude Code marketplace lists needs no `.claude-plugin/plugin.json` and no version in it: the name and the version come from the manifest, else from the marketplace entry, else the version is the first 12 characters of the commit (of the folder's content for a folder on this computer), and Muro writes them in the marketplace it installs from. A folder with no manifest is a Claude Code plugin only when a marketplace lists it. A source with none of these is looked at one folder down for a Muro build (`<folder>/adapters/<harness>`): `https://github.com/acaprino/marionette`, whose build is in `marionette/`, is enough for every harness, and several such folders are not chosen from. Any other plugin in a folder of its repository is reached with `#folder` after the address. Prepared local distributions can also be entered directly, under Advanced.
3. If a distribution is missing, start an AI adaptation job. A real Claude Code agent performs intake and harmonization; the factory independently validates, checks sources and stages the output. Status and log paths appear in Activity. It does not install the generated package. Two sources are refused before any AI process starts, so nothing is spent and no job folder is made: a folder that is in no Git repository ("AI adaptation needs a Git repository: this source is a folder that is not in one"; the repository is the nearest folder above the source, or the source itself, that holds `.git`), and a repository in which no file named like a license (`LICENSE`, `LICENCE` or `COPYING`, in any letter case, anywhere in it) is the complete MIT or Apache-2.0 text ("This source cannot be adapted: no file in the source is the complete MIT or Apache-2.0 text the factory accepts"). That check (`muro license-check`) is not the factory's license gate, which still decides: it passes when any such file passes. A repository licensed by a file with another name, `MIT.txt` say, is refused here and can be adapted from the command line, which has no such check. One adaptation serves every harness: the factory builds the adapters of all five, and the job registers each one for the harness you asked for, for every harness the plugin has no build for, and for every harness whose build Muro made earlier; a native or hand-entered build for another harness stays as it is. With automatic sync on, a harness of the plugin that was blocked for want of a build then gets its adapter at the worker's next run, with no review. The result is merged into the plugin's record as it is when the run ends, so renaming the plugin or saving a setting meanwhile does not discard it; it is refused only when the plugin's source or upstream revision changed ("The plugin's source changed during adaptation; adapt again") or the plugin is gone ("Plugin not found").
4. **Check now** calculates the plan, **Review** shows it and **Apply all** applies it. Applying verifies registry revision, observed inventory and artifact content again. A second plan after a successful sync has no operations. A plan with blockers (a plugin without a build, a harness that cannot be read) applies what is ready and leaves the blocked items out, when the review sheet's **Apply** or the background worker asks for it; without that request the service refuses the whole plan. On a harness that has a blocker nothing is uninstalled, because a plugin of your list whose build failed must not be removed as if it were outside the list. A plan that holds removals is applied only with their number: the request carries `confirm_removals` equal to it, which the review sheet's main button sends, or `skip_removals: true`, which **Apply without uninstalling** and the background worker send and which leaves the removals out. A request with neither, or with another number, changes nothing and is answered "This plan uninstalls 3 plugins; review it and confirm the removals" ("1 plugin" for one). The response says how many removals were left out (`skipped_removals`).
5. **Uninstall, asking first** (Settings → Sync for every harness, or **Uninstall plugins that are not in my list** in a harness's own panel) includes recognized installed plugins outside your list in the plan as removals, which wait for the confirmation of step 4. This does not authorize deleting sessions or arbitrary configuration files. All replacement artifacts are prepared before operations begin; incomplete inventory blocks application.

Upstream version/revision and each native or Muro-generated distribution version are shown separately. Changing a plugin's source clears every prepared distribution and its resolved upstream metadata; resolve or adapt the new source before syncing. Editing only a name preserves existing provenance. Stable resolution prefers published GitHub releases; explicit pins and HEAD are available. Sources without sufficient release information require an explicit choice instead of a guessed version.

Registry writes are revision-checked and atomic; native operations have a journal and are followed by an inventory scan. Failed or interrupted operations require inspection and a fresh plan, not blind replay. Reinstall is an explicit plan operation that uses the retained verified artifact, not today's source. It is also the way back from an update that failed: on Claude Code an update uninstalls the old copy before it installs the new one, so when the install fails nothing is installed, and **Plan a reinstall** puts the previous version back from its artifact (an install when no copy is there, a reinstall when one is). That needs the receipt of the previous version, the record in `receipts.json` of what Muro installed on a harness, and an install whose check fails keeps it: a first install, which has no earlier receipt, is recorded anyway so the next plan sees the copy as Muro's, while an update that fails its check leaves the receipt of the version that was installed as it was, and its artifact kept. After an update that renamed the plugin and failed its check, the new copy is not Muro's yet and shows as installed and not in your list. A sync enables a disabled plugin only when Muro installed it; one you added with **Add to my list** and disabled yourself stays disabled. On Claude Code a listed plugin Muro installed whose files are gone gets an update with the reason *Files missing*, and its enabled state is read from the user-scope row of `claude plugin list --json`. **Remove from my list** deletes the plugin's receipts: the copy stays installed and shows as not in your list. After a reinstall, the installed files must hash like that artifact on Claude Code, OpenCode and Pi; Hermes installs a Git clone, so there only the version and activation are checked. Codex is read from `codex plugin list --json`, which names no folder: Muro takes the copy Codex keeps in `plugins/cache/<marketplace>/<name>/<version>` of its home (a copy of the plugin's folder as it is, read on codex-cli 0.171.0), and with it a Codex plugin can be added to your list and its files compared like the others; its enabled state is the row's `enabled`. Maintenance verifies stored artifacts and removes artifacts no installation receipt references; plans calculated before a cleanup must be recalculated.

## Projects

**What a `.mp` is.** One zip archive (ADR-0028 decision 12) that carries a package's whole state: `project.json` (the name, the plugin's slug and version, the author, the dates, the Git repository the project follows, if any), the package (`sources.json`, the capabilities, the router, `delivery.json` and the files its parts need), the copy of every input at its pinned commit with its license and notices, the built release of the plugin (its adapter for every harness), the decision records (`records.json`), the history of harmonization runs (`history.json`) and the `CHANGELOG.md`, and the prompts when the package has its own. It carries everything so the project rebuilds and installs without the network. The format and the commands that pack, unpack and read it are in [the CLI reference](cli.md) (`muro project`); the app reads a file only through them (`muro project info`) and never opens the zip itself. Git sees one binary file: the differences between two versions are shown by Muro, in the project's history and changelog.

**Where projects live.** The registry holds the list (`registry.projects`, `{id, path}` for each). A project opened with **Open project file…** stays where it is, so a project in a folder of yours is yours to move or delete: it is not copied. The first time a data directory starts, the default project is copied to `data/projects/marionette.mp` and listed, once; if you remove it or delete the file it does not come back at the next start, and a file already at that path is never replaced. The factory unpacks a file once for each content into `data/project-cache/<digest>/`, and a plugin made from a project installs from that folder. A project file that changes after it was installed makes the plugin's builds stale: a sync plan blocks them (*Project file changed: open the project again*) and leaves the installed copy as it is until the project is installed again.

**The default project.** Muro is meant to ship with Marionette inside (ADR-0028, decision 5), but it builds nothing of it: its release takes the latest published release of `acaprino/marionette` and bundles it, unchanged, as `projects/marionette-<version>.zip` with its `.sha256` (owner decision of 2026-11-22). That release is a zip of the built plugin folder, not a `.mp` project file, and the runtime installs a default project only from `projects/marionette.mp`, which nothing makes any more: today the zip is carried and not read, a new data directory lists no default project (`NotBundled`), and a copy that an earlier Muro installed stays as it is. Reading the release as the default project (or as a plugin to install) is a follow-up of the runtime; `muro project pack` is still how a project file of Marionette is made, and `marionette.yml` still checks that it can be.

**The page.** The workspace of an open project is described under [The window](#the-window): it reads the project's inputs,
decisions, records, runs and graph from `muro project info`, shows the simulator, and changes the project as
[Changing a project](#changing-a-project) says. The Install step of the Imago window (switches that prepared a project's
build for each harness through `install_project`) is not in it yet; the service still answers that action.

## Changing a project

The Projects page makes and changes projects as [ADR-0032](adr/ADR-0032-desktop-projects-write-side.md) describes, in two
kinds of change. The factory commands and the runtime actions behind them are in [the CLI reference](cli.md) ("Writing a
project"); the page only asks and shows what the runtime answers. It never judges what a project means: that stays with the
AI that runs.

**An AI run** changes the package itself: its inputs, how they fit together, its instructions. The runtime runs Claude Code
on this computer, with its own credentials, in a work folder of the job, and the factory commits the result. The page sends
`create_project` for a new project and `project_job` (with an `operation`) for a change of one. [What a run can reach and
what it costs](#what-an-ai-run-can-reach-and-what-it-costs) is said below, and in every dialog that starts one.

- **New project…** (the list): a name, a plugin id (it follows the name until you type one), an author, a folder (the file is
  `<plugin id>.mp` in it; **Choose folder…** opens the shell's folder dialog, `pick_folder`, and is gone for the session where
  the shell has none), the inputs, one per line (an `https://` address, a folder of the repository after `#`, or the full
  path of a folder on this computer), your request in words (optional), a repository (optional) and the budget.
- **Add input…** (the foot of the workspace): one more input, by address or folder.
- **Harmonize again…** (the foot): the AI reads the inputs and the decision records again and fixes what no longer holds.
- **Move pin…** and **Remove…** on each input (Inputs panel). Move pin offers **Check for updates**, which asks
  `project_updates` (read only) how the pin stands against its upstream and fills the field with a newer release it
  reports; the field empty means the newest release. For a frozen (`static`) pin the button is there and off, and says why
  (the input is held at the commit that was reviewed). Removing asks first, with the focus on Cancel, and is not offered for
  the only input.
- **Instructions…** (Inputs panel): the Markdown files of the project's own instructions, added, edited or removed. Only the
  files that changed are sent.

A change of an existing project also takes a request in words (optional) and the version step (patch, minor or major; adding
or removing an input starts on minor, the others on patch). Every run takes a maximum budget in US dollars, 5 by default,
above 0 and at most 100, which Claude Code checks between turns, so a run can end slightly above it. What the page can check
from what was typed (the plugin id, the addresses, the budget, the lengths) it checks before it sends, in the runtime's own
words; what only the runtime knows (that the folder is there, that no file of that name exists, that no other run goes) it
says when the form is sent, before any run is paid for, and the dialog shows that sentence as it comes and keeps what was
typed. When the agent chosen in Settings → AI is not Claude Code the page says so before the run and offers none; the
Settings page that changes it is not in the window yet. Every change of an existing project carries the digest of the file
the page shows: when the file changed since, the runtime refuses it (*The project file changed since it was opened…*).

**The card of the run.** While a run goes its card shows the title, the phase, the time, the most it may cost, when the
runtime stops it (*Stops after 120 min* for a project run, 30 for an adaptation), its log file and **Cancel** (the card says
*Stopping* until the runtime ends the run): above the list for a new project, under the head of the project for a change.
The runs are the runtime's, not the page's. The window reads them (`jobs`) when it opens, after
a start or a cancel, every 2 seconds while one goes and when the registry it reads shows one it did not know, so the card is
there again after leaving the project or the tab, or after a reload. When a run ends the list and the open project are read
again and the outcome is notified in the runtime's words. A run that failed, was cancelled or was interrupted stays on the
card, with its log, until **Dismiss**; a run that succeeded is said once, if this window saw it going. One AI run goes at a
time, adaptations included (the runtime's lock): while one does, no other AI run is offered and the buttons say why. The card
of that run is on the Projects page whatever it is (the run of another project, the adaptation of a plugin: the window has no
Activity page yet), saying whose it is, so it can be stopped from there. A request the runtime refuses because another run
goes (one that `muroctl` or another client started) makes the window read the runs again, and the card shows.

**Cancel, and the saving phase.** A Cancel before the factory builds the project leaves the file as it was: between the steps
of the run the card says *Job cancelled. The project file was not changed*, and during the agent's step *The AI run was cancelled. The project file was not changed*. A run that reaches its limit (120 minutes for
each step of a project run) ends failed and says *The AI run reached its limit of 120 minutes; see output.log*. Once the factory has started to build and save the project (the phase *Building and saving the
project*) the runtime ignores a Cancel, because a build that replaces the file cannot be stopped half way: the card then
shows no Cancel and says *The project is being saved: it cannot be cancelled now*. The run ends as it would have, with the
file replaced or not.


**An edit by hand** changes what no AI judges and runs none (`edit_project`, offline): **Edit details…** (name, author, the
repository the project is published from, which can be taken away, and its changelog) and, in the Records panel, **Add
record…**, **Edit** and **Delete** on a record. The page sends only what changed, with the digest of the file it shows, and
reads the project again once the runtime answers, so the next edit is made on the file as the last one left it. A record
you add is yours, and a record Muro wrote becomes yours when you change its words. While an AI run is changing the project
no edit is offered (the runtime refuses one); a run of another project does not stop it.

**Delete…** (the list) asks first, names the file, says that it cannot be undone and that the project's installed plugin
stays where it is, then sends `delete_project` with the registry revision (once more, with the revision read again, when the
registry moved meanwhile). The project Muro ships has no such button.

**Not in the window yet.** **Install on harnesses…** and **Review decisions…** (above), the Activity page, where ADR-0032
decision 7 has the filter *AI runs*, and the pages of the plans R1 to R3. No change was run with a real Claude Code from this
window, and none on a Windows window: see [the verification record](verification/2026-11-23-project-write-react.md).

### What an AI run can reach, and what it costs

- **It is not confined to its work folder.** The agent works in a folder of the job (the unpacked project, its inputs and
  `custom-instructions/`), and the prompt asks it to work only there, but Claude Code runs with `Bash` allowed under
  `acceptEdits`. It can read and write what you can, run the factory, and reach the network; the prompt is the only guard.
  What a source says is data for the AI, never an order, and a source can still steer the agent (ADR-0032, decision 2).
- **Nothing of the project configures it.** The run starts Claude Code with `--setting-sources user --strict-mcp-config`, so
  the settings, hooks, `.mcp.json` and `CLAUDE.md` that a project file or its inputs carry (a `.mp` from elsewhere is untrusted)
  load nothing. `muro project unpack` also refuses a member that is outside the layout of the format.
- **Your own Claude Code still loads.** The `user` setting source is kept, because it holds the sign-in and the provider: your
  plugins, hooks and global instructions go into every turn. A run therefore costs more per turn than a bare one, and a small
  budget (the default is 5 USD, and the dialogs say so beside the field) can run out before the work is done; the run then ends
  without saving, and the file is as it was. The budget is checked between turns, so a run can end slightly above it.
- **It stops after 120 minutes.** A project run has its own limit, 120 minutes; the adaptation of a plugin keeps 30. A run past
  it ends *failed*, with a message that names the limit, and its work folder stays for the log to be read against.
- **What the factory takes from the AI's folder.** `muro project commit` takes the project's identity, its history and its
  changelog from the project as the desktop holds it, never from the folder the agent wrote in, and refuses a run that changes
  a record of yours or adds a binding record: the AI writes the package and its own records, not the owner's rules.

## The simulator and its engines

The graph shows the discovery entries, closed until opened, and under each its capabilities, with the lines the plugin declares between them (the order, the conditions and the conflicts); a capability opens in the inspector with its role, intents and outputs. The simulator, in the Examples view, shows which branch of the graph a request activates, and in what order, in two ways.

- **A documented example** of the project is chosen from the list, and its own recorded decision is shown. It runs no AI and costs nothing. Each example in the list shows its request, the intents of its steps and what they produce, so the list can be read without a click.
- **A free-text request** is classified by the AI, never by matching words, and the answer is validated with the runtime's own rules before it is shown: a decision (the ordered steps with the reason of each; a prerequisite the plugin adds is marked as one), no match, a question, or an answer that is not a valid decision with what the validator said. The result says who answered, what it cost and how long it took. **Cancel** stops waiting for the answer and asks the runtime to end the process; the request holds nothing else of the window, which goes on meanwhile.

The AI settings of the registry choose the engine for every free-text request (the Settings page that changed them is not in the window yet):

| Engine | What runs | Cost |
| --- | --- | --- |
| **Coding agent on this computer**, Claude Code | `claude -p` with only the two simulator tools of Muro's factory (`muro mcp --tools simulate_prepare,simulate_check`), no other tool, no plugin, hook or skill of yours (`--setting-sources project,local`) | up to **Budget per request** (default 0.5 USD, checked by Claude Code between turns, so a run can end slightly above it), on your own credentials |
| Coding agent, Codex | `codex exec` read-only with the same tools over MCP | Muro sets no budget: Codex has no dollar limit flag, and the result shows no cost |
| **OpenAI-compatible API** | the factory calls the endpoint itself (`muro project simulate`) | what your API provider bills; the key is read from the environment variable named in Settings, never stored, shown or passed as an argument |

A request lasts at most 540 seconds. The first free-text request of a session says which engine will answer and what it may cost; after that the result carries it. A project's documented examples need no engine at all. The API engine needs an endpoint (https, or http on `localhost`), a model and the name of the variable that holds the key: Settings → AI checks each where it is typed and says whether the variable is set for Muro, and never shows a key. Claude Code runs the simulation without the settings of your user (`--setting-sources project,local`), because your own plugins would cost far more than the budget; a provider configured only in user settings is therefore not used for that call.

## Custom instructions from Markdown

The steps below were done in the Sync page, which is not in the window yet; [the CLI workflow](desktop-cli.md) does the same.

Each registry plugin can have its own folder of custom instructions. These files are inputs to AI harmonization, alongside the selected upstream source. Write ordinary UTF-8 Markdown; no frontmatter, special filename or domain taxonomy is required. Nested folders and `.md` files are supported. Names and alphabetical order do not determine rule priority or activation.

1. Open the plugin (a row of the Sync table) and choose **More → Open instructions folder**. Muro creates and opens its managed folder under `data/custom-instructions/<plugin-id>/`. To use an existing folder, enter its absolute path in **Custom instructions folder** under **Advanced**, and save. Leave the field blank to return to the managed folder.
2. Create or edit one or more Markdown files with your editor. For example, put the following in `recap-adhd.md`: `During long operations, agent waits, important changes and autonomous decisions, give a short ADHD progress recap: where we are and what remains.`
3. Click **Reload files** under **Custom instructions** in the plugin's panel to reread the folder. It shows the folder, the Markdown files and the harnesses that need a new adaptation (*Instructions changed. Adapt again for…*). Adding, editing, renaming or removing a file can require regeneration; deleting the final file also requires removing its old contribution from the package.
4. Choose **More → Adapt with AI** for the destination harness. The agent reads a snapshot of the Markdown, decides how it becomes session policy, capability instructions or supported hooks, and records its reasoning and coexistence decisions. The job does not install the generated adapter. Changed files during the job prevent the old result from being accepted as current.
5. Review and apply a new synchronization plan. An artifact that does not match the current instructions is blocked, including a native distribution that has not incorporated them. Repeat adaptation for each destination harness that needs a new distribution.

The original files stay separate from upstream snapshots and survive source updates. Instructions are not automatically made permanent: that is an AI decision. Generated packages retain the original files needed at runtime and record the contribution of files carried entirely into policy. Read [the CLI workflow](desktop-cli.md) to inspect or open these folders and launch the same adaptation without the GUI.

## Runtime and storage

Portable distributions contain `portable.marker` and keep state under `data/` beside `Muro.exe`. Development builds without the marker use the application data directory for `dev.muro.registry`. `MURO_DATA_DIR` or CLI `--data` selects an explicit registry. External harness target roots stay explicit and are not moved with the app. The app always uses its own WebView2 profile, avoiding collisions with a parent application such as Shinatama.

**Sync state.** `data/sync-status.json` records when the registry last compared the installed plugins with your list and when it last brought a harness in line: `last_check`, `last_sync`, the number of operations and blockers of the last full plan with the registry revision that plan was made for, `errors` (the sources the last check could not resolve, `null` before any check), and the same two times for each harness (`checked`, `synced`). A file that cannot be read counts as no record, and the next check writes it again. A plan or a check writes the first part, an apply the second. Every snapshot carries it as `sync`, so the tray reads it, and the page shows its times, without a new inventory scan. Removing a harness removes its times too, so a new harness given the same id starts with none of its own. A change to the list or to a harness makes it stale; a settings save keeps it current, because a setting does not change what a sync would do. The changes in the table cells come from the snapshot, or from a plan, which the page makes when you press **Check now** and again after a change. The counts in the strip come from that plan, or, while the window holds none for the registry as it is, from this record when its revision is the registry's: a window that has just opened shows what the background worker found, in step with the tray, and reads *Not checked yet* only when nothing was recorded for the registry as it is (a change to the list since, or no check yet). The record gives counts and not a breakdown, and it does not say which harness the changes are on, so a column with nothing of its own to show says *Check to see the changes* rather than *In sync*. `data/automation-status.json` holds the last result of the background worker, which Activity shows.

**Start with Windows.** Settings → Background → *Start Muro when Windows starts* writes a per-user Run value, `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, named `Muro`, holding `"<path of Muro.exe>" --background`. It is written with `reg.exe`, needs no administrator rights, and the key itself is the state. Turning it on also turns automatic sync on when it was off, since a start that syncs nothing is no use; turning it off leaves automatic sync as it is. At every start Muro repairs the value only when it names an executable that no longer exists (a portable folder that was moved); a value that names another copy of Muro that is still there is left alone, so a development build never takes over an installed copy's. `MURO_AUTOSTART_NAME` changes the value's name; the tests use it so they never touch `Muro`.

**`--background`.** Muro starts in the notification area and shows no window. Without the flag the window shows once the backend answers.

**Closing.** Closing the window hides it and Muro keeps running in the notification area, unless *Keep running when the window is closed* (`close_to_tray`) is off: then closing quits Muro, and nothing syncs until it is opened again. The tray icon has a state line (*In sync · checked 09:41*, *2 changes waiting · checked 09:41*, *Needs attention* when only blockers or sources that could not be checked are left, or *Not checked yet*), **Open Muro**, **Sync now**, **Pause automatic sync** (or **Resume**) and **Quit Muro**. **Sync now** checks and applies, whether or not automatic sync is on, and like the worker never uninstalls. When **Pause** or **Resume** cannot save the setting (the registry stays busy past the retry, say) the state line reads *Could not pause, try again* (or *Could not resume, try again*) until the next poll writes it, and the error is recorded in Activity as an *Automatic sync* event.

**One Muro for each data directory.** A second launch (the Start menu while Muro waits in the tray, or the Run value after a manual start) asks the running one to show its window and ends at once with exit code 0 and no output; with `--background` it ends without showing anything. The running Muro holds a named Windows object, `Local\MuroShow-<hash of the data directory>`, which belongs to the user's session and disappears with the process. A Muro that is quitting answers no one, so it marks itself with a second object, `Local\MuroQuit-<hash>`; a launch that finds the mark waits up to 5 seconds for that Muro to end and then starts as the first one, or ends without starting when it is still there (it holds none of the running Muro's objects meanwhile, or they would never go). A different data directory (`MURO_DATA_DIR`) is a different Muro with its own backend. Every build without `portable.marker` (a development build, for one) uses the same default data directory, `%APPDATA%\dev.muro.registry`, so those count as one Muro; a portable folder keeps its own `data/` and is another Muro.

**Quit.** **Quit Muro** in the tray, and a close with `close_to_tray` off, start no new sync, wait up to 60 seconds for the one in progress while the state line reads *Finishing the sync…*, and then exit. A sync that lasts longer is cut off at that point. `sync_now` and `apply` wait this way, whoever started them, window or tray; a settings save or another short write started from the window can still be cut by a quit. A close with `close_to_tray` off quits even while a sync holds the registry: the shell reads the setting from the registry's lock-free `status` and keeps the last value it read for when that cannot be read.

**The background worker.** While Muro runs, including in the notification area, a worker does a sync at start and then at every interval (Settings → Background, default 60 minutes; the setting is read again every few seconds, so a change takes effect within seconds). Every pass it resolves every plugin's source, reads every managed harness and records the result for the tray and the Sync page, so they say the truth also when automatic sync is off. A pass that could not resolve a source is recorded as failed, with the names of the plugins (*Sources not checked: …*), and the tray reads *Needs attention*; what could be applied still is.

**The window beside the worker.** The worker and the tray's **Pause** change the registry while the window is open or hidden. The window reads the registry again when it gets the focus (it is shown again from the tray, or clicked back to) and every 30 seconds while it has the focus, and only when no request of yours is waiting; an open dialog and the text being typed are kept, since React does not paint over them. It asks for no plan on the way: the recorded check says what changed. A project taken off the list (`remove_project`) that the registry refuses because it moved (*Registry revision changed*) is sent once more with the revision read again; only a second refusal reaches you. The Settings page of the earlier window retried its save the same way, over what the worker saved; it is not in the React window yet (plan R2).

**Waiting for the registry.** The registry takes its writer lock without waiting and refuses a second request, and a check of sources that answer slowly holds it for as long as they take. The desktop shell does the waiting for every page, in one place: a request of the window waits for the sync in progress (10 minutes at most), then tries a busy registry again every 250 ms for 15 seconds before it returns the error. The tray and the worker read the lock-free `status` instead of a snapshot. A launch while another process holds the registry waits for it too. Inside the window the page sends its requests one after another, except `discover`, `simulate`, `cancel_simulation`, `jobs` and `cancel_job` (`ALONE` in `apps/desktop/src/queue.ts`): a simulation holds no registry lock while the AI works and can last minutes, so nothing else in the window waits for it and **Cancel** reaches the runtime while the run it stops is still going. The same holds for the AI runs of a project: `jobs`, which follows a run, and `cancel_job` do not wait behind a long `project_updates` or `edit_project` that the page sent before them. The shell holds a `simulate` back while a sync is in progress, like any request that reads the registry, and lets `cancel_simulation`, `env_present`, `discover`, `status`, `jobs` and `cancel_job` through (`WITHOUT_THE_LOCK` in `apps/desktop/src-tauri/src/main.rs`: the AI runs live in files of their own and take no registry lock).

- **Automatic sync on:** it then applies the plan without a review step, except its removals. Blockers do not stop it: it applies what is ready and leaves the blocked items out, and the event says what was left out (Activity: *Automatic sync*, failed when blockers remain). The worker never uninstalls, whatever the rule for plugins outside your list says: it applies with `skip_removals`, and the removals stay in the sync state as pending until you confirm them in the review sheet. Its message then ends with how many wait (*31 removals wait for your confirmation*, or *1 removal waits for your confirmation*), after the changes it applied when it applied any; a plan of removals only makes no `apply` call.
- **Automatic sync off:** it only checks. Nothing is installed or removed; the tray says how many changes are waiting (Activity: *Background check*).

One sync runs at a time, whoever asks: the worker, the tray's **Sync now** or a request.

For diagnostics, `Muro.exe --request ACTION '<json>'` runs one request through the bundled `muroctl` and prints the result without opening a window (the windowed release build has no console, so prefer `tools\muroctl.exe` for scripts). The actions are listed in [the CLI reference](desktop-cli.md#request-actions). `autostart` and `set_autostart` are answered by the window's shell only, not by `muroctl`. Moving the portable folder rebases registry, receipt and plan paths inside it at the next start.

Claude Code, Codex, OpenCode, Pi and Hermes have separate installation contracts. DeepSeek is discoverable through Mukade but has no Muro plugin adapter. An unavailable command or failed inventory is shown as incomplete, never as an empty installation. Existing host permissions remain authoritative.

AI adaptation currently requires Claude Code for its budgeted execution. Codex does not expose an equivalent dollar-budget flag, so the app does not pretend to enforce one. Claude's budget is checked by the host between turns, not a strict prepaid ceiling. Adaptation jobs have a 30-minute deadline; the AI runs of a project have their own, 120 minutes. On Windows their subprocess trees are attached to a kill-on-close job object. Cancellation leaves the registry unchanged unless validated output has already been recorded. Native install commands can have host-specific effects; inspect the plan and resulting activity.

## Verification

AI work-directory and read-only-factory instructions are agent rules, not an OS filesystem sandbox. Windows process jobs enforce child-process lifetime only; host permissions remain authoritative. Generated manifests must match the resolved upstream revision before their distributions are recorded.

```powershell
cargo test -p muro-registry -p muro-desktop-runtime
npm test
npx tsc --noEmit
npm run build
node apps/desktop/tests/browser.mjs   # MURO_UI_PORT=<port> when 1422 is taken
node apps/desktop/tests/screenshots.mjs   # the README screenshots, from demo data
cargo build -p muro-desktop-runtime --bins
cargo build -p muro-desktop --features custom-protocol   # embeds the frontend `npm run build` made
node apps/desktop/tests/native.mjs   # MURO_CDP_PORT=<port> when 9227 is taken
node apps/desktop/tests/native-shell.mjs   # MURO_CDP_PORT=<port> when 9228 is taken
python muro_build.py --manifest examples/marionette/sources.json --validate
```

The Python tests that do not name Marionette (`python -m pytest -q -m "not marionette"`) run in the Tests workflow on GitHub, and the ones that do run in the Marionette workflow; the Rust tests, `npm test`, the type check, the frontend build, Sigrid's design check (`sigrid-check`), Imago's (`imago-check`), the browser tests and the photographs of every screen (`shots.mjs`, the artifact `muro-shots`) of the `desktop` job run in Tests.

- **`npm test`** runs Node's test runner over `apps/desktop/tests/*.test.ts`, as plain functions: the model (`model.test.ts`), the request queue, what the page imports (`imago-ownership.test.ts`), the state the project workspace keeps across a reload (`project-state.test.ts`), the graph model and the scene made for Sigrid's canvas (`graph-model.test.ts`, `graph-scene.test.ts`), what the workspace reads of a project and the lines it writes from it, such as the engine note and the runs (`project-data.test.ts`), the write side of a project (`project-write.test.ts`: the shapes of the requests, the checks of what is typed with the runtime's wording, the runs, and the refusals of the fake service's write actions), the fake service (`fake-transport.test.ts`), Imago's zoom with Muro's storage key (`imago-zoom.test.ts`) and the rules for the sources (`imago-ownership.test.ts`: the stylesheet only imports Sigrid, no inline style, SVG or HTML string, and Imago is imported for the window glue only).
- **`browser-shell.mjs`** (the frame, the theme, the palette, the refresh of the registry) and **`browser-workspace.mjs`** (the list of projects and the workspace), and three files for the write side of a project: **`browser-write-ai.mjs`** (the AI dialogs, the job card and the action bar), **`browser-write-edit.mjs`** (the details and the decision records edited by hand) and **`browser-write-new.mjs`** (a new project, and deleting one); `browser.mjs` runs the five one after the other. They start the Vite dev server and headless Edge (Playwright's `msedge` channel) and drive the real window against `fake-transport.js`, a fake of the registry service that keeps its rules: revision conflicts, blockers, `allow_blocked`, removals only on a harness without a blocker and only when confirmed (`confirm_removals` or `skip_removals`), and, for the write side, a stale digest refused, one AI run at a time, a new project never written over an existing file and the shipped project not deletable. Its runs end by themselves or when a test says so: no Claude Code runs behind it. They prove the window, not the service. `screenshots.mjs` draws the Projects list, the workspace (dark and light) and a simulation from the fake's `projects` scenario; CI does not run it, and it has not been run on the React window yet.
- **`native.mjs`** drives the real executable over the WebView2 debugging port, against the real Tauri `request` command, the real registry service and a real OpenCode profile in a temporary folder. It was written for the Imago window: it walks the first run and the Sync page (pick the harness, add a plugin, Check now, Apply all, a second Check), which the React window does not have yet, so it does not pass on it. It uses a Run value of its own name and deletes it.
- **`native-shell.mjs`** drives the same executable but calls the shell's `request` command from the page, not the interface: start with Windows, close to the tray, `--background`, the worker, a second launch and the quit path. It asks the window to close the way Windows does (`WM_CLOSE`) and reads whether the window shows from user32. Its section 8 reads Sync's note and status row of the Imago window, which this window does not have. The tray menu itself is a native menu that no test reaches.
- Neither native test has been run against the React window.

- **The Rust tests of Projects** (`cargo test -p muro-registry -p muro-desktop-runtime`): the list and the AI settings of the registry, and, in the runtime, `projects` (a stand-in factory), `simulate` (the exact command lines of both harnesses, the readers of their output, the API engine through a local endpoint, cancellation) and `real_factory` (a `.mp` packed by the real factory, listed, installed on a temporary OpenCode target, planned, replaced and simulated through a local endpoint).

The two native tests, as they were run on the Imago window, prove the app/configuration boundary; they do not prove that an OpenCode agent loaded and executed a plugin, and none of them is a real sign-in to Windows. See the dated verification records for real host checks and remaining limits: the Projects tab ([2026-11-20](verification/2026-11-20-desktop-projects-read.md)) was not run with a real Claude Code, Codex or API for a free-text simulation, and whether Codex runs an MCP tool in `exec` without an approval prompt is unverified. The write side of a project in the React window ([2026-11-23](verification/2026-11-23-project-write-react.md)) was not run with a real Claude Code either, nor on a Windows window. No personal harness installation is required by these tests.
