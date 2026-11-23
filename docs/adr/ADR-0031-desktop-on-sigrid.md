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
of it was built or run when this record was written (see "What was not
verified"); the explanatory text and the implementation choices have not been
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
   `docs/verification/` and appears as the lockfile's `integrity`. Never a
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
   in the release package, so it needs no dependency beyond Sigrid itself. It
   cannot run on `develop` yet, because the package is not installed there.
   Until it is, no CI step checks the design rules. Once the package is
   installed the step is `npx --no sigrid-check apps/desktop/src`, run from the
   folder whose `package.json` lists Sigrid; it needs a decision on whether to
   gate on it (it exits 1 on a finding) and a `sigrid-check.config.json` for
   any accepted exception.

## What is lost

- The ONI look and the Smooth/ONI setting. Settings → Appearance will offer
  the theme (System, Light, Dark), as today, and Sigrid's density.
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
- Muro's colour (hue 170) becomes a Sigrid theme; the accent of the window is
  what that theme computes.
- Dependencies change in `package.json` and its lockfile. The lockfile cannot
  be regenerated on this machine, which installs nothing: the first CI run
  after the change says what is missing.
- The first pages of the new window are the ones the owner asked for first
  (the project workspace); the order of the others is the plans', not this
  record's.

## What was not verified

Nothing was built or run: not the install of the Sigrid tarball, not the build
with Vite and Tailwind, not `sigrid-check`, not the window, not a test. What is
said about Sigrid is read from its repository and its release listing
(`gh release view`, `gh release list`). The SHA-256 of the release has not been
read. That `imago-shell` works with a page that no longer uses
`@acaprino/imago/shell` (the overlay of Snap Layouts, the caption drawn by the
page) is not checked. That `GraphCanvas` is legible for Marionette's graph is
read from its description, not seen.
