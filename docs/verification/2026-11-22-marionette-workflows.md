# Marionette apart from Muro in the workflows (2026-11-22)

Owner rules of 2026-11-22: "Muro non deve avere test su Marionette", and, for what the installer carries, "Muro non
deve costruire niente di default. Muro prende dalla repository, punto. La repository di Marionette. È Marionette a essere
costruita con Muro. Muro mette in bundle l'ultima release di Marionette, punto." Muro's own CI and release run no test,
source check, validation, build or pack of Marionette, so a problem of the package (the upstream pin of
`claude-design-system-prompt` moving) can never stop a release of Muro again.

## What broke it

`Tests` (run 45013089110) and `Release` (run 45013089182) failed on `main` for one cause. Muro's `Tests` workflow ran
Marionette's Python tests, `--validate`, `--check-sources`, the build and the pack of its project file; Muro's
`Release` runs `build-release.bat`, whose `scripts/desktop_resources.py` built a fresh Marionette release
(`python -m muro build --manifest examples/marionette/sources.json`) and packed it as `projects/marionette.mp` for the
installer. A source whose pin no longer matched its upstream failed both.

## Where each part runs now

| Workflow / job / step | Now |
|---|---|
| `tests.yml` `tests` / Test (pytest) | Stays in Muro for the test modules that do not name Marionette (`-m "not marionette"`); the 49 that do move |
| `tests.yml` `tests` / Validate, check sources and build | Moved to `marionette.yml` |
| `tests.yml` `tests` / Pack the default project | Moved to `marionette.yml` (as "Pack the project file") |
| `tests.yml` `desktop` / Rust tests, Frontend unit tests, Design rules, Type check, Frontend build, Shell tests, Browser tests | Stay in Muro, unchanged: none builds or reads Marionette |
| `marionette.yml` `marionette` / Test (`-m marionette`), Validate + check sources + build, Pack the project file | New: Marionette's own checks, the same commands as before, when its paths change or by hand |
| `release.yml` `plan`, and `release` / Next version, Inno Setup, Package, Commit/tag/publish, develop follows main | Stay in Muro, unchanged (`release.yml` is not edited) |
| `release.yml` `release` / Prepare and build (`build-release.bat` -> `scripts/desktop_resources.py`) | Stays in Muro; it no longer builds, packs or validates Marionette: it takes its latest published release (below) |
| `release-marionette.yml` (every job) | Marionette's own release gate, not changed |

How the Python split is made: `tests/conftest.py` marks every test module whose text names Marionette (`marionette`,
case-insensitive) with the marker `marionette`; `Tests` runs `-m "not marionette"` and `marionette.yml` runs
`-m marionette`. Nothing is deleted or deselected anywhere else. `marionette.yml` triggers on push and pull request when
`examples/marionette/**`, `muro/**`, `prompts/**`, `muro_build.py`, `pyproject.toml`, `tests/**`, `docs/adr/**`,
`docs/releases/**` or its own and the Marionette release files change, and by hand.

## What the release takes, and where it lands

`scripts/desktop_resources.py` asks `https://api.github.com/repos/acaprino/marionette/releases/latest` (the latest
published, non-draft, non-prerelease release; a token from `GH_TOKEN`, which `release.yml` sets for the job, or
`GITHUB_TOKEN` goes to this call only), requires exactly one asset `marionette-<version>.zip` and its
`marionette-<version>.zip.sha256`, downloads both, requires the `.sha256` to be a SHA-256 record of that name and to equal
the digest of the zip, requires the zip to be a zip, and writes both files unchanged to
`<resources>/projects/marionette-<version>.zip` and `.zip.sha256`. The tag, the asset and the digest are added to the
bundle's `PROVENANCE.json` (`default_project`). Anything that does not check out removes the folder just staged and fails
the build: this is Muro's input like its Python archive, not a Marionette check. At the time of writing the latest release
is `marionette-v0.5.1` (2026-11-21): `marionette-0.5.1.zip`, 14,773,566 bytes, SHA-256 `f4a0e443bbfe701ca231b1c4b3b2eff01128d7833048bf8fe0b4eb3dfb0b3f97`.

What the zip is (read over HTTP from its central directory, nothing downloaded whole): 3,292 entries under one folder
`marionette/`: `.claude-plugin/`, `adapters/` (claude-code, codex, hermes, opencode, pi), `capabilities/`, `muro/`,
`prompts/`, `LICENSES/`, `GUIDE.html`, `NOTICE.md`, `ROUTER.md`, `delivery.json`, `entries.json`, `guide-examples.json`,
`sources.json`, `muro.py`. It is the built plugin, not a project file: it has no `project.json`, `records.json`,
`history.json` or inputs, which `muro project pack` adds from `examples/marionette/` and the pinned sources.

## What the desktop does with it

Nothing, today; the Rust runtime is unchanged. `install_default` (`crates/muro-desktop-runtime/src/projects.rs`) looks only
for `<resources>/projects/marionette.mp`; with no such file it returns `DefaultProject::NotBundled` before it reads any
mark. So a new data directory lists no default project, the zip is carried in the installation and not read, and a copy
that an earlier Muro put in `<data>/projects/marionette.mp` stays as it is (it is no longer refreshed). The Projects tab
therefore no longer shows Marionette for a new install. A follow-up needs the owner to choose what the app does with a
release: read it as the default project (the runtime and the factory would need a project view of a built plugin folder,
which lacks the project files and the inputs) or offer it as a plugin to install to the harnesses (the desktop already
reads the latest release of a plugin repository for Sync). No conversion of a release into a `.mp` was invented.

## Checks made

Read-only; no test, build or pack was run (the owner's rule).

- The release API as the script calls it (unauthenticated, from this machine): `tag_name` `marionette-v0.5.1`, not draft,
  not prerelease, two assets with `browser_download_url`s; the `.sha256` is `<64 hex>  marionette-0.5.1.zip\n` (87 bytes).
- Every workflow parses as YAML (PyYAML); every `uses:` is pinned by a 40-character SHA, all reused from the repository.
  `release.yml` is not edited; its job-level `GH_TOKEN` reaches the build step.
- `scripts/desktop_resources.py`, `tests/test_desktop_resources.py`, `tests/test_marionette_project.py` and
  `tests/conftest.py` parse. `tests/test_desktop_resources.py` does not name Marionette in its text, so it stays in Muro's
  `Tests` and guards the release's fetch (stand-in network, no build); the staging tests that lived in
  `test_marionette_project.py` and the optional-default-project fallback are removed as obsolete.
- `installer.iss` copies the release folder as it is and names no project file.

## Consequences for the owner

- A Muro release now carries the latest published Marionette release, whatever `develop` holds: what Marionette is in a
  Muro installer is decided by publishing in `acaprino/marionette`, not by this repository's commit.
- The default project is gone from new installs until the follow-up above; decision 5 of ADR-0028 is not met in the app.
- 49 of the 73 Python test modules, among them `test_runtime`, `test_ai_routing`, `test_delivery`, `test_cli` and
  `test_pin_modes`, use Marionette as example data and now run only in `marionette.yml`: a factory regression that only
  those catch passes `Tests`, and the installer bundles the factory.
- If the fetch fails (no network, no release, a digest that differs) the Muro release fails; that is a failure of an input
  of Muro, not of Marionette's content.

## Not executed

`Tests` with `-m "not marionette"`, `marionette.yml`, the `marionette` marker hook (written for pytest 7 or later:
`item.path`), the new tests of the fetch, `scripts/desktop_resources.py` against the real release, `build-release.bat` and
the Release workflow. Not checked: that a bundle built this way starts and lists no default project (the Rust test for
`NotBundled` covers the runtime side). There is no scheduled run of `marionette.yml`, so an upstream that moves is seen at
the next change to a Marionette path, at a release of Marionette (`release-marionette.yml` still checks the sources) or by
hand. The first run is on `develop`; the controller can dispatch `release.yml` there with publish unticked (build only).
