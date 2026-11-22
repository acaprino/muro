# Muro on the canon of Imago v0.2.0: verification record

Branch `imago-canon`, from `develop` at `e76b185`. The package is pinned to the tag `v0.2.0`
(commit `8418ccac391ffb56dc1a997b996e7237b714b606`) in `package.json`, `Cargo.toml` and both lockfiles.

## What was checked, and how

| Commit | Task | Checked before the owner's no-local-tests rule | Checked after |
|---|---|---|---|
| `f42de76` | Pin the canon, replace removed names | `tsc` clean, `npm run build`, `npm test` 375/375, seven browser files pass, `imago-check` 3 findings | |
| `ad5ec88` | `startMuro`, `mountApp`, key caps | `tsc`, `npm test` 374/374, seven browser files pass | |
| `e9b4c57` | Status row, action bar, footer | `tsc`, `npm test` 375/375, seven browser files pass, `imago-check` 2 findings | |
| `7a50e7c` | Inspector on Sync | | not run locally (owner's rule) |
| `10c5b4f` | Inspector on Projects | | not run locally (owner's rule) |
| `bcd2ad9` | Errors and notices | | not run locally (owner's rule) |
| `3958c49` | Agent files, CI, `imago-check` | | `npx imago-check`: no findings (the only static check allowed) |
| `bf454a3` | Window of 500 | | not run locally (owner's rule) |
| `4ac7ec0` | Words of destructive actions | | not run locally (owner's rule) |
| `c42eac0` | Loading and error in the panel | | not run locally (owner's rule) |

`npx imago-check` at the tip: no findings, no accepted exception.

## What waits for CI

The Tests workflow on GitHub: the Rust jobs (the lock line of `imago-shell`, and `set_window_theme`, which
now takes the look and the theme the page draws: written, never compiled), `npm test`, `Design rules`
(`npx imago-check`), type check, build, browser tests. The browser and unit tests of Tasks 4 to 9 were rewritten
by reading the markup; a failure there is a wrong guess about a selector or a timing, not necessarily a defect.

## What only the owner can see

- The real window in Smooth and in ONI, both themes, over a dark and a bright desktop (glass, the 500 minimum
  width, the inspector docked from 1000 and as a drawer under it).
- `apps/desktop/tests/native.mjs` and `native-shell.mjs` (they need the real executable; the second one was edited for the
  status row locators and was not run).
- The screenshots under `docs/assets/screenshots/` were not regenerated (`screenshots.mjs` needs a browser run).
- The Tauri-generated icon leftovers in `src-tauri/icons/` (Square*Logo, icon.icns, android, ios) still show the old logo; nothing references them.

## Notes from the final review

- `trim_context_menu` (the window's context menu cut to the editing commands) and `Recovery::close` (WebView2 failures
  ignored while the application closes), both new in imago-shell 0.2.0, are not adopted: the plan did not ask for them.
  `desktop-shell.md` sections 3.2 and 4 of the package describe them for a release build.
- `develop` moved after the base of this branch (`e203b78`, `d33c457`): merging conflicts only in the binary screenshots of
  `apps/desktop/tests/artifacts/`; take the branch's side or regenerate them after the CI run.
- The README screenshots and the committed test artifacts show the old sheets until a browser run rewrites them.
