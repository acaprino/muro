---
adr_id: ADR-0031
version: 1
title: The desktop window moves from Imago to React on Sigrid
status: Proposed
author: Claude Code
scope:
  paths: [apps/desktop, package.json, .github/workflows/tests.yml, AGENTS.md, CLAUDE.md, docs/desktop.md, docs/imago-migration.md]
  modules: []
  domains: [desktop, design-system]
governs_symbols: []
depends_on: [ADR-0023, ADR-0028]
created_from_task: desktop-react-sigrid
proposed_on: 2026-11-23
accepted_on: null
---

# ADR-0031 — The desktop window moves from Imago to React on Sigrid

Date: 2026-11-23. Status: records the owner's decision of the same day. Nothing
of it was built or run when this record was written (see "What was verified and
what was not"); the explanatory text and the implementation choices have not been
separately approved.

## Context

The web side of the desktop app (`apps/desktop/src`) is TypeScript that writes
HTML strings with the classes and tokens of `@acaprino/imago`, pinned to the
tag `v0.4.1` in `package.json`, and the native window is the Rust crate
`imago-shell` at the same tag. AGENTS.md ("Desktop UI ownership") says every
component, layout, style and behaviour comes from Imago, CLAUDE.md imports
Imago's design file, `docs/imago-migration.md` records what Muro takes from it,
and the desktop job of the `Tests` workflow runs `npx imago-check` as "Design
rules".

Sigrid (`acaprino/sigrid`, public, MIT) is the design system for React apps
that the owner's apps share. Read on 2026-11-23, in its README, its
`package.json` and `docs/patterns.md`, and in its release listing:

- Version 3.3.9 is its latest release, published the same day, not a draft and
  not a prerelease. It is not on npm: the GitHub Release holds
  `acaprino-sigrid-3.3.9.tgz`, `manifest.json` (the SHA-256 of the package) and
  `SHA256SUMS`.
- It is React 18 or 19 with Tailwind 4. `AppShell` has seven regions, after Imago's
  frame, and the package has the inspector, the command palette, dialogs,
  tables, themes and density. `GraphCanvas`, in `@acaprino/sigrid/graph` (React Flow and
  dagre), lets things open and close and say how many they hide, finds a thing
  and opens what hides it, keeps the chosen thing and what joins it while the
  rest dims, and has a small map. The decision graph of a project with 37
  capabilities in 15 entries is the case that motivated it.
- It has one look, with themes and density. It has no second look like ONI.
- Its title bar is plain web, and for a Tauri window on Windows its own guide
  sends the app to Imago's `imago-shell` crate (`docs/patterns.md`).
- It ships its own design check, `sigrid-check`, inside the package.

## Owner statements

"passare Muro a React e Sigrid", "shinatama e muro passano a react". Asked
whether the new window should grow beside the old one or take its place, the
owner chose "sostituzione sul posto".

## Decision

1. **The window is a React app on `@acaprino/sigrid`.** It replaces the Imago
   window in place: there is no second window and no switch between them.
   Shinatama moves too, in its own repository.

2. **The package is the release tarball.** `package.json` names
   `https://github.com/acaprino/sigrid/releases/download/v<version>/acaprino-sigrid-<version>.tgz`
   (first `v3.3.9`), and the SHA-256 of `manifest.json` is recorded in
   `docs/verification/`; the lockfile's `integrity` is npm's sha512 of the same
   tarball. Never a
   `file:` path to a checkout, and never a git dependency that runs `prepare`
   (AGENTS.md, "Nothing is compiled on this machine").

3. **Ownership.** The components, layout, style and behaviour of the desktop UI
   come from Sigrid, the graph canvas included. Muro owns domain data,
   operations and screen composition. Muro keeps no design system of its own:
   no components that restyle or repeat Sigrid's, no colour or size written by
   hand, no CSS beyond the Tailwind entry. What Sigrid lacks is asked of Sigrid.
   The rest of the rule of the Imago ownership section (read the design rules
   before UI work, keep the shell body stable while a modal is open, report
   conflicts) stays.

4. **`imago-shell` stays.** The Rust crate keeps the native window: glass and
   native theme, caption controls and Snap Layouts, the navigation guard and
   the recovery of WebView2. Its pin stays in `apps/desktop/src-tauri/Cargo.toml`
   and `Cargo.lock` until the owner moves the window to something else. *Amended
   on 2026-11-23 (plan R0, Task 6): the npm package `@acaprino/imago` stays, for
   its window glue only (`@acaprino/imago/shell` and its Tauri adapter: caption
   buttons, zoom, the guard of the browser's own keys), because Sigrid has no
   Tauri side. Its tag stays equal to the Rust pin, by hand, since `imago-check`
   is gone.*

5. **The rule files follow.** AGENTS.md and CLAUDE.md name Sigrid and no longer
   import Imago's design file or ask for `imago-check`. `docs/desktop.md` no
   longer says the interface uses Imago. `docs/imago-migration.md` and
   `docs/imago-verification.md` stay as history, the first with a note at its
   top. Every rule that is not about the UI toolkit is unchanged, the two
   absolute rules about never compiling or building on this machine first.

6. **The design gate.** The CI step "Design rules" (`npx imago-check`) is
   removed with this record: it needs the Imago package the window no longer
   uses. Sigrid's `sigrid-check` reads files and builds nothing; its launcher
   and the bundled tool it starts import only Node's own modules, and both ship
   in the release package, so it needs no dependency beyond Sigrid itself.
   *Amended on 2026-11-23 (the final review of plan R0): CI installs the
   package (`npm ci`), so the desktop job of the Tests workflow runs it, in the
   step "Design rules (Sigrid)" after the frontend build: `npx --no
   sigrid-check apps/desktop/src`, from the repository root, whose
   `package.json` lists Sigrid. The step does not block (`continue-on-error`)
   until its first output has been read; then the owner decides whether it
   gates (it exits 1 on a finding) and which exceptions, if any, go in a
   `sigrid-check.config.json`.*

## What is lost

- The ONI look and the Smooth/ONI setting. Settings → Appearance will offer
  the theme (System, Light, Dark), as today, and Sigrid's density.
- The translucent ground over the acrylic: the page paints Sigrid's opaque
  ground, so the Windows 11 material of `imago-shell` no longer shows through.
- Imago's design file as the reference for the window, and `imago-check`
  together with what it compared: the Imago rules, the equality of the npm and
  Rust pins, the app icons against the package.
- The tests whose subject is Imago's markup. The tests of the model modules
  stay.

## What stays

- `imago-shell` and everything native: the tray, the background worker, the
  registry, and the Tauri commands `request` and `set_window_theme` with the
  contracts they have.
- The modules that are not markup: `api.ts`, `queue.ts`, `model.ts`,
  `types.ts` and the graph model.
- The Python factory, and the ownership rules of the product: the page never
  matches the words of a request to capabilities, and a documented example and
  the validated answer of the AI are the only things that light a branch
  (ADR-0003, ADR-0008).

## Consequences

- From the commit that mounts the React window until the follow-up plans port
  Sync, Activity and Settings, and the first run (R1, R2 and R3, kept outside
  this repository), `develop` has no Sync page: that page shows that it is
  moving. The tray, the background worker and the registry keep working, so
  automatic sync still runs; a person cannot review or apply a plan by hand in
  the window in that time.
- **`develop` is not merged into `main` meanwhile**: every merge into `main` is
  a release (AGENTS.md, "Git"), and it would ship a window without Sync.
- Muro's colour (hue 170) becomes a Sigrid theme; the accent is Muro's own
  (oklch 0.82/0.47, C 0.12/0.13, h 170), put over `colorTheme`'s
  (`apps/desktop/src/sigridTheme.ts`).
- The graph entry, `@acaprino/sigrid/graph`, is read from Sigrid's source, not
  its bundle: an alias in `apps/desktop/vite.config.ts` points it at
  `src/graph.ts` of the package, because the 3.3.9 `dist/graph.js` inlines
  the React Compiler runtime with a CommonJS `__require("react")` that the
  dev server cannot run in a browser. Its types still come from
  `dist/graph.d.ts`. The source brings copies of its own: the build has two
  `motion-impl` chunks, and the graph's tooltips read the source's own
  `PortalContainer` and mount on `<body>`, not in the overlay layer of
  `AppShell` under the title bar (a `WordsProvider` above the window would not
  reach the canvas either). The alias needs `src/graph.ts` and the `src` folder
  in the package (the `@source` lines of `styles.css` need that folder too). It
  goes when Sigrid's graph bundle no longer requires `react` that way.
- Dependencies change in `package.json` and its lockfile. The lockfile cannot
  be regenerated on this machine, which installs nothing: the first CI run
  after the change says what is missing.
- The first pages of the new window are the ones the owner asked for first
  (the project workspace); the order of the others is the plans', not this
  record's.

## What was verified and what was not

Verified on CI (the Tests workflow, run on commit c531936): the install of the Sigrid tarball with the lockfile on Windows, the
type check, the build with Vite and Tailwind, the unit tests, and the browser tests of the React window (the shell and the project
workspace, against the fake service, including a graph of 37 capabilities in 15 entries). Nothing of this was run on this machine.

Not verified: the window in Tauri with the real registry (the first run of the desktop with this front-end has not happened); that
`imago-shell` works with a page that mounts Imago's window glue on Sigrid's title bar (the overlay of Snap Layouts, the caption
buttons); the project file of the owner opened in this window; `sigrid-check` (a non-blocking CI step runs it since the final review
of plan R0, and its first output has not been read yet). Seen on the CI screenshots: with 15 closed entries the graph is a narrow
column whose names are drawn at about 8 px (scale 0.59), and with two entries the canvas leaves a node cut at its right edge; both
are asked of Sigrid, which also cannot draw an edge's kind or number several marked things (see the plan R0 report). Since the
final review a closed entry has no second line, which makes that column shorter; the scale it is drawn at now is in the CI log,
and the browser test only holds it at 0.5 or more.

## Note of 2026-11-23: Sigrid 4.3.1

Written by Claude Code from the Sigrid sources at the tag `v4.3.1` and its release tarball; nothing was built or run here,
and the CI run on the commit that makes the move is the first check of it. The record of the pin is
`docs/verification/2026-11-23-sigrid-pin.md`.

- **The pin.** `package.json` names the 4.3.1 tarball (SHA-256 `aa7a0ed7…89c3`, the manifest's, recomputed on the
  download). Sigrid 4.0.0 to 4.3.1 grew the graph canvas for this window (its release notes: kinds of line, a numbered
  path, a readable fitted view; the app's places, sizes, routes and `layoutKey`; one screen that fits; IME guards).
- **What broke, and how it was fixed.** Of what Muro imports, one thing: `GraphEdge` now has a `kind` of its own
  (`'child' | 'link'`), which made Muro's `kind` (`member`, `after`, `needs`, `conflicts`) a contradiction for the type
  check, and an edge whose `kind` is not `link` hangs, so every relation would have been drawn as a branch of the tree.
  Muro's field is now `relation`, and Sigrid's `kind` says how the line is read. The other changes are additions
  (`CommandPalette`'s `open` and `onOpenChange` are now both or neither, as Muro passes them; F6 is the frame's round and
  the notices' own key is Alt+T; tabs and segments keep one width), and `AppShell` is as tall as the window by itself
  (`--app-height`), so the `h-dvh` the window set on it is gone.
- **The alias is gone.** Every entry of `dist` is an ES module that takes `react` and `react/compiler-runtime` from the
  app (since 4.1.0), so `@acaprino/sigrid/graph` is read from the bundle, as the main entry is, and shares its chunks
  and contexts: the consequence above about the alias, the two `motion-impl` chunks and the tooltips on `<body>` no
  longer holds. The `@source` lines of `styles.css` still read Sigrid's `src` folder, for its classes.
- **What the graph draws now** (`apps/desktop/src/pages/project/graphScene.ts`, `Workspace.tsx`):
  - an entry's capabilities hang from it (the tree: it opens, closes and says how many it hides);
  - what the plugin declares between two capabilities is a line that hangs nothing, told by its dash and its words:
    «runs first» solid with an arrowhead (`after`), the AI's own label of the condition dashed (`needs`), «never
    together» dotted with no arrowhead (`conflicts`); the words show while one end is chosen or has the focus, or on
    the path, and screen readers hear them always. The inspector no longer writes these out in words, and choosing a
    capability opens the entries of what it is joined to and brings them into the view, so its lines are drawn;
  - a documented example or the validated answer is the canvas's numbered path (`steps`): the step in dots and in the
    name screen readers hear, the line between two steps in the accent, the rest dimmed; the "step N" second line and
    the inspector's "Step N of the decision" are gone;
  - an input marks the capabilities its decisions went to as chosen together (several `selected`), as well as opening
    their entries;
  - the view is never fitted smaller than names can be read (`minFitZoom` 0.8: a 14px name at about 11px); a graph too
    large for that, as fifteen closed entries are, starts at its first entry and the rest is a pan, the map or the
    find field away. A new light asks the canvas to bring what it lights into the view (its handle's `focus`), which
    replaces the remount (`key={fit}`) of plan R0. The app's places, sizes and routes are not used: they would be a
    layout of Muro's own.
  The ADR-0003 rule holds: only a documented example or the validated answer numbers a path, and an input marks what its
  decisions target.
- **Still missing.** A view of the whole of a fifteen-entry graph at a readable size at once (Sigrid now keeps names
  readable and the rest is a pan away; several columns of roots is not asked for yet); the link lines of a capability are
  drawn only while both ends are in sight, which is why choosing it opens the entries of its partners. A relation to a
  capability the graph lacks has no line and is no longer said in the inspector (the factory's validation refuses such a
  reference). The first Tauri run of this window is still to come.
- **The window glue.** Sigrid 4.x has a Tauri entry, `@acaprino/sigrid/tauri` (`useWindowControls`, `useSnapLayouts`,
  `useZoom`, with `useDesktopGuard` in the main entry), whose command (`window_caption_maximize`), event
  (`caption-maximize`), payloads, zoom storage and permissions match `imago-shell` and `capabilities/main.json` on
  reading. It is not used yet, so decision 4's amendment stands, without its reason that Sigrid has no Tauri side:
  nothing of it has run against the crate, and its `useWindowTheme` sends only when the scheme changes, while
  `set_window_theme` is told the choice too (System and Dark draw the same scheme), so that call stays Muro's whatever
  happens. Moving the controls, Snap Layouts, the zoom and the guard to it would let `@acaprino/imago` leave
  `package.json` and its lockfile; it waits for a run of the window in Tauri.
