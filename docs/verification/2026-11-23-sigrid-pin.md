# Sigrid pin and the React and Tailwind toolchain (2026-11-23)

The pin is now Sigrid **4.3.1** ([below](#moved-to-sigrid-431-later-the-same-day)). The sections before that one record
the first pin, 3.3.9, as it was made.

Task 2 of the desktop move to React on Sigrid (ADR-0031). The dependencies are written into
`package.json`; the lockfile is not (nothing is installed or built on this machine), see "Lockfile".
Nothing was installed, compiled or run to produce this record: it was written from files and from
`gh release` metadata only.

## The Sigrid release

| | |
| --- | --- |
| Repository | `acaprino/sigrid` (public, MIT) |
| Tag | `v3.3.9`, published 2026-11-23T11:27:26Z, not a draft, not a prerelease; commit `d07b8c7` ("release v3.3.9") |
| Package | `@acaprino/sigrid` 3.3.9 |
| Tarball URL | `https://github.com/acaprino/sigrid/releases/download/v3.3.9/acaprino-sigrid-3.3.9.tgz` |
| SHA-256 of the tarball | `60bb8d7c773a9c4529c6f363e5a928b756d877b85b680911686e45fbb712a0e6` |

The SHA-256 is the one in the release's `manifest.json` (`{"version":"3.3.9","packages":[{"name":"@acaprino/sigrid","file":"acaprino-sigrid-3.3.9.tgz","sha256":"60bb8d7c..."}]}`),
fetched with `gh release download v3.3.9 --repo acaprino/sigrid --pattern manifest.json` into an empty folder
and read there. GitHub's own digest of the `acaprino-sigrid-3.3.9.tgz` asset
(`gh release view v3.3.9 --repo acaprino/sigrid --json assets`) is the same value. The tarball itself was not
downloaded here, so the hash was not recomputed on a downloaded file. `npm install` records its own integrity
(sha512) of the tarball it fetches in the lockfile, and `npm ci` checks against that; nothing compares the
manifest's SHA-256 with the lockfile, so the SHA-256 above is the record to check a download against by hand
(`Get-FileHash -Algorithm SHA256`).

## Versions chosen

Exact versions (no range), as `@tauri-apps/api` already is in `package.json`. Each is the version Sigrid's own
`package-lock.json` resolves at `v3.3.9` (`D:\Projects\sigrid\package-lock.json`, key `node_modules/<name>`); Sigrid's
`package.json` gives only ranges for them, as `devDependencies`.

| Package | Where | Version | Sigrid's range | Why an app has it |
| --- | --- | --- | --- | --- |
| `react` | dependencies | 19.3.1 | `^19.2.0` | Sigrid's peer (`^18` or `^19`); `react-dom` 19.3.1 itself needs `react ^19.3.1` |
| `react-dom` | dependencies | 19.3.1 | `^19.2.0` | Sigrid's peer |
| `@acaprino/sigrid` | dependencies | 3.3.9 (tarball URL) | | the design system |
| `@types/react` | devDependencies | 19.3.0 | `^19.1.0` | types; `@types/react-dom` 19.3.0 needs `^19.3.0` |
| `@types/react-dom` | devDependencies | 19.3.0 | `^19.1.0` | types |
| `@vitejs/plugin-react` | devDependencies | 6.2.1 | `^6.2.1` | the Vite plugin for React; peer `vite ^8.0.0` (Muro: 8.3.5); its other peers are optional |
| `tailwindcss` | devDependencies | 4.3.5 | `^4.3.5` | Sigrid's classes and theme are Tailwind v4 |
| `@tailwindcss/vite` | devDependencies | 4.3.5 | `^4.3.5` | Tailwind's Vite plugin; peer `vite` 5.2 to 8 |

- Sigrid's `peerDependencies` are `react` and `react-dom` only, so nothing else is owed. Everything else it needs
  (Ark UI, Base UI, TanStack, TipTap, dnd-kit, `@xyflow/react` 13.0.2, dagre, motion, icons) is in its own
  `dependencies` and comes with the tarball; the README does not ask an app to add any of it.
- Muro keeps its own `vite` 8.3.5 and `typescript` 7.0.2; Sigrid builds with vite 8.3.6 and typescript 5.9.3. The
  vite range of both plugins admits 8.3.5. TypeScript 7 against these `@types` was not exercised: the CI type check
  is the first run.
- `@acaprino/imago` and its `imago` block stay in `package.json` until the old window code that imports them is
  deleted (a later task of the plan); this commit only adds.

## Files

- `apps/desktop/vite.config.ts`: `plugins: [react(), tailwindcss()]`; `root`, `clearScreen`, `server`, `build` unchanged.
- `tsconfig.json`: `"jsx": "react-jsx"`; `include` is `apps/desktop/src/**/*.ts` and `apps/desktop/src/**/*.tsx`.
- `apps/desktop/index.html`: the entry is `/src/main.tsx` (the file is written by the next task).
- `apps/desktop/src/styles.css`: the Tailwind entry. `@import "tailwindcss" source(none)`, Sigrid's `fonts.css` and
  `theme.css`, `@source` on the app's own `src` and on Sigrid's `src` in `node_modules`, and
  `@source not` on `src/internal/motion-impl.tsx`, as Sigrid's README ("Use it", "What it exports") and its showcase
  CSS give them. `source(none)` is the showcase's way to keep Tailwind from scanning the rest of the folder (the
  tests); it is the one difference from the bare `@import "tailwindcss"` of the app CSS that the showcase's editor generates
  (`showcase/editor/codegen.ts`). The old file held one line, `@import "@acaprino/imago/css/imago.css";`.
- Not in the entry yet: `@import "@acaprino/sigrid/graph.css"` (after `theme.css`), which the graph canvas needs
  (README, "What it exports": "In the app's CSS, after theme.css").

## Lockfile

`package-lock.json` is not changed by this commit and no longer matches `package.json`, so `npm ci` fails until it
does. `.github/workflows/lockfile.yml` (temporary) runs `npm install --package-lock-only --ignore-scripts` on a
runner and uploads the result as the artifact `package-lock` (no repository write, no script of any dependency
runs). It runs on a push to `develop` that touches the workflow file, or by hand
(`gh workflow run lockfile.yml --ref develop`). The result is taken with `gh run download` and committed in place of
the old lockfile, and the workflow is deleted in that commit.

## Not run

Nothing: no install, no type check, no Vite build, no Tailwind compile, no CI run. Whether the Sigrid tarball
resolves, the lockfile is accepted by `npm ci`, TypeScript 7 accepts `jsx: react-jsx` with these `@types`, and
Tailwind finds Sigrid's classes through the `@source` in `node_modules` waits for the first CI run after the
lockfile is committed.

## Moved to Sigrid 4.3.1 (later the same day)

Sigrid released 3.3.10 to 4.3.1 on 2026-11-23, among them the graph features Muro had asked for (4.1.0: kinds of
line, a numbered path, a readable fitted view; 4.2.0: the app's places, sizes, routes and `layoutKey`; 4.3.0: one
screen that fits, controls that never move; 4.3.1: IME guards in the palette and the graph search). `package.json`
names the 4.3.1 tarball (commit `1c7d46a`); the lockfile was regenerated by the temporary Lockfile workflow on a runner
and committed as `7fe963d`, not made here. Its `integrity` for Sigrid, `sha512-tnHH7cBF…TsDteqQ==`, is the sha512 of the
tarball downloaded below (recomputed with `openssl dgst -sha512 -binary | base64`).

| | |
| --- | --- |
| Tag | `v4.3.1`, published 2026-11-23T17:48:36Z, not a draft, not a prerelease; commit `26d2eff` ("release v4.3.1") |
| Package | `@acaprino/sigrid` 4.3.1 |
| Tarball URL | `https://github.com/acaprino/sigrid/releases/download/v4.3.1/acaprino-sigrid-4.3.1.tgz` |
| SHA-256 of the tarball | `aa7a0ed7f1b5d23c15fc62c3bc378dd6418a562aa2b98ae45db6ea2c524189c3` |

- The SHA-256 is the one in the release's `manifest.json`
  (`{"version":"4.3.1","packages":[{"name":"@acaprino/sigrid","file":"acaprino-sigrid-4.3.1.tgz","sha256":"aa7a0ed7…"}]}`),
  fetched with `gh release download v4.3.1 --repo acaprino/sigrid --pattern manifest.json` into an empty folder of the
  session's scratchpad. GitHub's digest of the asset (`gh release view v4.3.1 --json assets`) is the same value. This
  time the tarball was downloaded too (`--pattern acaprino-sigrid-4.3.1.tgz`), into the same empty folder, and its
  SHA-256 recomputed (`sha256sum`): the same.
  It was unpacked there to read `dist/*.d.ts` (what the type check resolves) and `dist/graph.js`; nothing in it was run.
- `dist/graph.js` holds no `require(`: it imports `react`, `react-dom`, `react/jsx-runtime`, `react/compiler-runtime` and
  shared chunks of `dist/chunks/`, which `dist/index.js` imports too. So the Vite alias to `src/graph.ts` is gone
  (`apps/desktop/vite.config.ts`), and the graph shares the main entry's contexts (its tooltips' portal, the words).
  The graph entry needs React 19 for `react/compiler-runtime`: Muro has 19.3.1.
- Peers: `react` and `react-dom` (`^18 || ^19`) as before, and `@tauri-apps/api` `^2.0.0`, new and optional (for the
  `./tauri` entry); Muro's `@tauri-apps/api` 2.12.4 meets it. Sigrid's `dependencies` are the same as at 3.3.9, so no
  other dependency of Muro changes.
- Not run here: the install, the type check, the build, the tests. They wait for the CI run on the commit that moves
  the window to 4.3.1.
