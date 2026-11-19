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
- **`.mp` container, history and records** are specified with plans 2 and 3.
  Until then a project folder is laid out as a package folder is today.

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
