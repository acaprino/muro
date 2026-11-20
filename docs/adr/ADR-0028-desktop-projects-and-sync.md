---
adr_id: ADR-0028
version: 1
title: The desktop app manages projects and sync
status: Proposed
author: Claude Code
scope:
  paths: [apps/desktop, crates/muro-registry, crates/muro-desktop-runtime, docs/mockups/muro-redesign.html]
  modules: []
  domains: [desktop, projects, sync]
governs_symbols: []
depends_on: [ADR-0008, ADR-0011, ADR-0016, ADR-0017, ADR-0023, ADR-0024]
created_from_task: desktop-redesign
proposed_on: 2026-11-19
accepted_on: null
---

# ADR-0028 — The desktop app manages projects and sync

Date: 2026-11-19. Status: records the owner's decisions of the same day, taken
while reviewing `docs/mockups/muro-redesign.html`; this explanatory text and
the section "Implementation choices" have not been separately approved.

## Context

The desktop app (ADR-0023) was built as a plugin registry: one plugin is one
source, "Adapt with AI" rebuilds it for one harness, and five pages (Plugins,
Harnesses, Sync, Activity, Settings) sit behind a sidebar. Each adaptation
writes a new folder, `data/jobs/<id>/` (`prompt.txt`, `output.log`, `package/`,
`release/`), and the app shows of it only a status line and the log path.

A package such as Marionette is richer than that on disk: `sources.json`
(identity, 17 inputs with their pins), `delivery.json` (85 decisions with
their reasons), `capabilities/` (37), `entries.json` (15), `guide-examples.json`
(25), a dated "Harmonization record" in `ROUTER.md`. None of it is visible in
the app, and a package with more than one input can only be made from the
command line.

The owner, on the first redesign that kept the registry model: "il flusso di
lavoro è dispersivo, non si capisce, i menu sono troppo ampi", "non si capisce
dove fare cosa", "manca tutta questa parte di gestione progetti".

## Decision (owner)

1. **Two jobs, two places.** Projects is where a plugin is made; Sync is where
   plugins reach the harnesses. Activity and Settings are the only other
   destinations. The look is not the subject: "non è tanto il look", "è più la
   disposizione e wireframe e layout proprio".
2. **A project is the main object.** It shows "plugin di ingresso, scelte
   fatte, output degli ultimi harmonization e dei prompt, versioning", "il
   grafo decisionale, il simulatore di decisioni ed esempi di intent e prompt",
   "con rami di attivazione".
3. **A project is one file, `.mp`.** It holds "tutti i metadati, nome finale
   del plugin unico, la sua cronologia, i plugin che lo compongono, le scelte
   fatte", "anche metadati su repository git di riferimento", "autore, data,
   changelog, anche generato automaticamente da muro". It carries everything,
   the copies of the inputs and the built plugin included: "secondo me si porta
   dietro tutto".
4. **Decision records.** The AI keeps, per project, "una sorta di ADR interne,
   autogenerabili ed editabili", "o linee guida o storico delle scelte prese e
   del perché". A record the author edits or adds is binding on the next
   harmonization: "deve vincolare chiaramente".
5. **Marionette is the default project.** "muro arriva sempre con dentro il
   progetto di default chiamato marionette".
6. **Sync state is always visible.** "un stato di sync per vedere as is con
   timestamp di ultimo check", the state "per harness nel sistema, versioni e
   aggiornamenti plugin, e sync harness<->plugins", and "un tasto per applicare
   tutti i cambiamenti".
7. **Plugins outside the list.** One visible setting says whether they "debbano
   sempre essere disinstallati".
8. **Background.** "muro deve avere autostart all'avvio di windows per tenere
   sync" and "chiusura a system tray icon".

9. **Running in the background, Muro watches and enforces.** "muro in
   background se avviato deve fare monitor dei plugin delle harness e
   assicurarsi che siano aggiornati e sync con configurazione in muro del
   catalogo".

The mockup is the reference for layout, flows and wording. Its numbers for
Marionette are read from `examples/marionette`.

## Implementation choices (not separately approved)

- **Three plans, each leaving a working app.** (1) Shell and Sync: tabs, the
  Sync page, settings saved on change, start with Windows, the notification
  area. (2) Projects, read side: the project model, the `.mp` file, the views
  over real data. (3) Projects, write side: harmonization per project, binding
  records, the changelog, moving a pin, adding an input.
- **Tabs under the system title bar**, not inside it: the window keeps its
  native frame, resize borders and snap layouts.
- **One look.** The Classic look and its switch are removed; the theme stays
  System, Light or Dark.
- **Sync state is recorded, not recomputed.** `data/sync-status.json` holds the
  last check, the last sync, the pending count of the last plan with its
  registry revision, and the same two times per harness. A snapshot carries it.
  A plan is a fresh inventory scan and is not run on every refresh.
- **Start with Windows** is the per-user `Run` key, written with `reg.exe`,
  value `"<exe>" --background`; the key itself is the state, so a moved portable
  folder is repaired at the next start. No new dependency.
- **Closing the window** hides it unless the new setting `close_to_tray` is
  false, then it quits.
- **The background worker always checks, and applies when automatic sync is
  on.** At start and then at every interval it resolves the sources, reads
  every harness and records the state, so the tray and the Sync page say the
  truth also with automatic sync off. Switching "Start with Windows" on
  switches automatic sync on with it.
- **A blocked item no longer stops the rest.** Until now `apply` refused a
  plan with any blocker, so one plugin without a build, or one harness that
  cannot be read, left every other harness out of date for as long as it
  lasted. A plan with blockers applies what is ready when the caller says so
  (the background worker, and the review sheet after showing what is left
  out). On a harness with a blocker nothing is uninstalled: a plugin of the
  list whose build failed must not be removed as if it were outside the list.
- **One running Muro for each data directory.** With Start with Windows a second
  launch is an everyday event, and the backend's own lock on the data directory
  made it crash. The running Muro holds a named Windows event,
  `Local\MuroShow-<hash of the data directory>`; a later launch raises it, so
  the running one shows its window, and ends with exit code 0 and no output (with
  `--background` it raises nothing). The name is a hash, so no path can bring a
  character Windows refuses. Another data directory is another Muro.
- **Quit waits for a running sync, for 60 seconds at most.** A background apply
  can be running at any Quit, and a process killed halfway leaves a harness
  half-installed. Quit in the tray, and a close with `close_to_tray` off, start
  no new sync, show *Finishing the sync…* and exit when the sync ends or after
  60 seconds. Only `sync_now` was gated; an apply started from the window could
  still be cut by a Quit (changed in the amendment of 2026-11-20 below).
- **The Run value is repaired only when its executable is gone.** Repairing at
  every start would point the owner's value at whatever copy of Muro is
  launched, a development build included. A value that names another existing
  executable is left alone, and so is one Muro cannot read as its own command.
- **A settings save keeps the recorded sync state current.** Settings do not
  change what a sync would do, and without this every switch in Settings would
  cost a full inventory scan and the tray would read *Not checked yet* until the
  next interval. The registry carries the recorded revision forward, and the
  Settings page tells `adopt` not to replan. Any other registry change makes the
  recorded state stale.
- **The page's requests wait for each other.** The service takes its registry
  lock without waiting and refuses a second request meanwhile; the page sent
  such a pair itself, a background `plan` after a save and the next step of the
  first run, found on the real executable and invisible to a fake transport that
  has no lock. All requests but `discover` (which runs Mukade and takes no
  registry lock) go through one queue (`apps/desktop/src/queue.ts`). A request
  from the background worker could still meet a busy registry and was reported
  as such (changed in the amendment of 2026-11-20 below).
- **The shell is tested through its command.** The tray menu is a native menu
  and no test reaches it. `native-shell.mjs` calls the shell's `request`
  command from the page and closes the window with `WM_CLOSE`, as Windows does;
  `native.mjs` drives the interface on the real service. The first is not a
  proof of the second, and neither is a real sign-in to Windows.
- **`.mp` container, history and records** are specified with plans 2 and 3.
  Until then a project folder is laid out as a package folder is today.

### Amendment of 2026-11-20, after the final review of the plan

The review found the window and the background worker did not yet get along.
What follows replaces the sentences marked above and adds to the list.

- **A window that holds no plan shows the recorded check.** The strip, the
  app-bar button and the tab badge read the plan of the registry's revision when
  the window has one, and otherwise `sync-status.json` when its `revision` is the
  registry's: the counts, with no breakdown by kind, and the time of that check.
  A window opened after a background check says what the worker found, as the tray
  does, and says *Not checked yet* only when nothing was recorded for the registry
  as it is. Review and Apply all are offered; both plan again before they act. The
  cells stay derived from the snapshot, and a column with nothing of its own to
  show says *Check to see the changes*, because the record does not say on which
  harness the changes are.
- **A source that could not be resolved is not a success.** `sync-status.json`
  gets `errors`, the number of sources the last full check could not resolve.
  `sync_now` records such a run as failed (*Sources not checked: …*), the tray
  reads *Needs attention*, and the strip says how many sources could not be
  checked and offers Check now. Counting them as blockers would mislabel them:
  nothing is blocked, something was not looked at.
- **The shell waits for the registry, in one place.** The registry refuses a
  second request while a writer holds its lock, and a check of slow sources holds
  it for minutes. `Backend::request` makes every request of the window wait for
  the sync in progress (10 minutes at most; `discover` and `status` do not take
  the lock and do not wait), then tries a busy registry again every 250 ms for 15
  seconds. `apply` goes through the same gate as `sync_now`, so Quit waits for it.
  The tray and the worker read a new action, `status` (revision, settings, sync
  state), which takes no lock and scans nothing.
- **A close with `close_to_tray` off quits while the registry is busy.** The
  shell reads the setting from `status` and keeps the last value it read, used
  when that cannot be read. Answering "stay" on any error made a close during a
  sync only hide the window.
- **The window follows the registry.** It reads the snapshot again when it gets
  the focus and every 30 seconds while it has the focus, when nothing is under
  way (no request, no dialog, no text being typed), and asks for no plan. A
  settings save refused with *Registry revision changed* reads the registry again
  and sends the same change once more. WebView2 keeps `visibilityState` visible
  for a hidden window, so the focus is what says the window is looked at.
- **A plugin added from what is installed adopts the installation.** The
  `save_plugin` payload may carry `adopt: {target_id, native_id}`; for a new
  plugin that lists the harness the service writes the receipt that binds the
  plugin to that installation, with the version and digest of the copy that is
  there, and refuses a harness it cannot read, an installation that is not there
  or already belongs to another plugin. The next plan then finds the plugin
  installed (an update when the copy differs from the build) and does not install
  a second copy beside the person's own; on an exclusive harness it would also
  have removed the original. The worker, on by default after the first run, would
  have done it without anyone looking.
- **The activity log keeps the last 500 events**, and a `sync-status.json` that
  cannot be read is no record (it is derived state; the next check writes it).

## Consequences

- The Harnesses and Plugins pages disappear: a harness is a column of the Sync
  table and opens its own sheet; a plugin is a row.
- "Adapt with AI" stays reachable from a plugin's dialog until plan 3 replaces
  it with harmonization per project.
- Changing what a project file carries (input copies) makes a shared `.mp`
  redistribute third-party content: the license and notice files travel inside
  it, as they do in a release (ADR-0005, ADR-0025).
- The AI-ownership rules are unchanged: Python and Rust validate, count and
  record; the changelog entry Muro writes by itself lists mechanical
  differences, and what a decision means stays an AI text (ADR-0003, ADR-0008).

## Not decided

- Whether a simulation of a free-text request, which needs the AI and costs a
  call, is offered beside the documented examples.
- How the app proves that a binding record was followed: a factory check, or an
  AI judgment recorded with its reason.
