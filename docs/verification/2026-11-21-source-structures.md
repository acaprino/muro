# Each harness finds its plugin in a source the way it does itself (2026-11-21)

## What the owner saw

The portable app in `D:\Software\Muro` had Marionette in its list as
`https://github.com/acaprino/marionette`, on "Latest commit". Sync read
**HEAD** as its version, **No version** on Claude Code, "1 plugin without a
version" under the column, and the strip: `Claude Code / Marionette:
"Marionette": no native distribution for claude-code; run AI adaptation`.
The owner, on why Muro looks for `adapters/<harness>`: "un plugin per codex o
claude code hanno le loro strutture", "poi muro applica la sua struttura nei
suoi adattamenti", "ma possono esistere tutte", "io posso aggiungere in muro
un plugin che è solo per claude code".

## Cause

- `sources::resolve` looked in two places only: `adapters/<harness>` (the
  layout of a Muro build) and the source's root. `acaprino/marionette` holds
  the build in `marionette/`, and nothing at its root said where: no Claude
  Code or Codex marketplace. Neither Muro nor `claude plugin marketplace add
  acaprino/marionette` could find it; its README has the zip downloaded.
- "No version" was the label of a harness with no build of the plugin.
- "HEAD" is what resolution records as the version of a plugin on its latest
  commit; the row showed it as it was.
- Also seen, and left as it is: Claude Code was on **Always uninstall**
  (`exclusive: true`, default off), so 31 installed plugins read "Removed at
  the next sync". No sync had run. Reported to the owner.

## Change

- `sources::find` (Rust): for each harness, `adapters/<harness>`, else the
  harness's manifest at the root, else the one plugin folder the harness's
  marketplace at the root lists (`.claude-plugin/marketplace.json`: `./` paths,
  bare names under `metadata.pluginRoot`; `.agents/plugins/marketplace.json`:
  `{"source":"local","path":...}`). Entries from another repository, a package
  or outside the source are not followed; a marketplace with several plugins is
  not chosen from. Claude Code's rules were read in its documentation
  (marketplace reference, 2026-11-21). The structures of different harnesses
  live side by side. `native::manifest`, `native::marketplace` and
  `native::harness_name` hold what each harness reads, used by resolution, the
  native install and the message.
- `sources::missing`: the plan's reason for a missing build names where Muro
  looked and what to do, or, for a marketplace with several plugins, the
  sources that choose each.
- `muro marketplace <repository> <folder>` (Python): writes the root
  marketplaces of a repository that publishes a release in a subfolder, from
  the adapters' own marketplaces (`MARKETPLACE_FILES` in `muro/adapters.py`,
  now also used by the build and `muro install`). `Release Marionette` runs it
  in `acaprino/marionette` and commits `.claude-plugin/` and `.agents/`.
- Desktop: **Needs a build** (cell, column, Installed as published) instead of
  "No version"; on the latest commit the row shows the versions the builds
  declare and `@<commit>`; Check for updates reports a new commit; the Source
  field says `#folder` reaches a plugin in a folder of its repository.

## Verification

Run locally (no cargo on this machine):

- `python -m pytest -q tests/test_repository_marketplaces.py tests/test_native_install.py tests/test_agentic.py`:
  red first (`ImportError: MARKETPLACE_FILES`), then 38 passed.
- `npm test`: the new tests red first (`does not provide an export named
  'versionOf'`, the Source hint), then 355 passed. `npx tsc --noEmit`: clean.
- `python muro_build.py --manifest examples/marionette/sources.json --validate`: OK.
  A fresh `--build --out <scratch>`, copied into an empty folder as
  `marionette/`, then `python -m muro marketplace <folder> marionette`:
  `claude plugin validate` passed, and with `CLAUDE_CONFIG_DIR` set to an
  empty scratch folder `claude plugin marketplace add <folder>` and `claude
  plugin install marionette@marionette` installed it, read from
  `marionette/adapters/claude-code`, enabled. The owner's `~/.claude` was not
  written by it.
- Marionette 0.5.1's published adapter manifests through `muro marketplace`:
  `claude plugin validate` passed.

GitHub Actions, branch `fix/source-structures`:

- Run 44896604267, the Rust tests alone (commit 36c1957): desktop job red as
  intended. Failed: the Claude Code marketplace, Codex marketplace,
  side-by-side, package repository, bare name and `./` with plugin root cases;
  passed: entries outside or from elsewhere, several plugins, Muro layout
  before a root manifest.
- The run with the implementation: see the commit that adds this record.

## Not executed

- The desktop app itself on this change (it is built by CI only); the Sync
  page was checked through its unit tests.
- `codex plugin marketplace add` on a repository root: Codex's marketplace
  format is the one the adapters already write; no live Codex run.
- No Marionette release: the root marketplaces arrive in `acaprino/marionette`
  with the next one. Until then Muro reaches it with
  `https://github.com/acaprino/marionette#marionette`.
- Claude Code plugins without `.claude-plugin/plugin.json` or without a
  `version` in it (both allowed by Claude Code) are still refused by Muro, as
  before.
