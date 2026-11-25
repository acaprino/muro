# Desktop on Imago

> **Closed on 2026-11-25.** Muro stands on Imago's shell made with Sigrid (npm package and crate 1.0.1): nothing below is in use.

> **Historical since [ADR-0031](adr/ADR-0031-desktop-on-sigrid.md) (2026-11-23).** The desktop window moves to
> React on `@acaprino/sigrid`, and this file describes the window it replaces. What stays true after the move is
> the crate `imago-shell` (the native window, "The window" below and "The pin" for the Rust side). The rest (the
> Imago tokens and look, `im-shell`, the keys, the icons and `npx imago-check`) goes with the Imago window, which
> is gone. The npm package stays for its window glue, `@acaprino/imago/shell`, pinned to the same tag as the crate
> ("The pin" below). The rules for UI work are now in AGENTS.md, "Desktop UI ownership".

Muro's desktop is the canon of Imago (`docs/design-file.md` of the package): one window
frame, `im-shell`, painted from strings by `renderShellFrame` and routed by `data-action`
(`app.ts`). This file records what Muro takes from Imago and where its tests are; the
rules are the package's, and `npx imago-check` (a step of the desktop CI job, "Design
rules") is how they are enforced.

## What Muro takes from Imago

- **Tokens and look**: `styles.css` is the Imago import and nothing else. The look and the
  theme go through `applyLook`; `mountApp` registers the five commands that pick them, and
  Settings calls the same `saveAppearance`.
- **The frame**: title bar (mark and name, four view tabs, Commands with its caps from the
  registry, window buttons), status row (the sync state, last and next check, harness count),
  content, inspector, action bar (`PageModule.bar`: at most one primary), footer (automatic
  sync, last sync, size of the list, the keys of the page from `footerKeys`). No sidebar
  (`data-im-sidebar="off"`). The inspector is wide (360).
- **Surfaces**: the plugin, the harness, a capability and a prompt are shown in the
  inspector (not modal); the review of a plan and Adapt with AI are centred dialogs;
  destructive actions ask with `confirm`; a failed operation is a notice with Reload, and the
  notes of a page (sources not checked, harness detection) stay in the page; loading is
  shown only after `LOADING_DELAY_MS` (`App.loading`, `state.slow`).
- **Keys**: one registry through the package's `mountApp` (Ctrl+K, Ctrl+F, F6, Escape);
  Ctrl+F and `/` search the current view (only Sync has a search box). The steps of a
  project are a `roving` tablist.
- **The graph**: `graphView` and `graph-layout`; `graph-scene.ts` only maps capabilities,
  entries, prerequisites, conflicts and simulation results to the scene.
- **The window**: the crate `imago-shell` (glass and native theme, caption controls and Snap
  Layouts, navigation guard, WebView2 recovery). `set_window_theme` takes the look and the
  theme the page draws. Registry operations, the tray, the background worker and project
  decisions remain Muro's.
- **Icons**: the files of `node_modules/@acaprino/imago/icons/muro/`, listed under
  `"icons"` of the `"imago"` block of `package.json` and compared byte for byte.

Extend Imago whenever a component is missing; do not add local components or CSS.

## The pin

The npm package and the Rust crate are pinned to the same Imago tag (or, while Muro waits for a
release, the same commit of Imago's `develop`); `package-lock.json` and `Cargo.lock` record
the commit. `Cargo.lock` is edited by hand when the pin moves and proved by CI's `--locked`.
The desktop CI uses `npm ci` and Cargo `--locked`. A standalone Muro checkout never depends on
a sibling directory.

## Tests

`apps/desktop/tests`: unit tests (`npm test`: forms, sync, setup, settings and activity,
projects, harmonization, graph) and browser tests (`browser-*.mjs`, headless Edge on a
fake transport, `node apps/desktop/tests/browser.mjs`). `browser-imago.mjs` is the
native-browser contract (menu and focus, validation, rejected saves, the inspector, notices,
commands, teardown). The real window (`native.mjs`, `native-shell.mjs`, both looks and both
themes over a dark and a bright desktop) is checked by hand; see `docs/verification/` for what was seen.
