# Marionette apart from Muro in the workflows (2026-11-22)

Owner rule of 2026-11-22: "Muro non deve avere test su Marionette". Muro's own CI and release must not run
Marionette's tests, source checks or builds, so that a problem of the package (the upstream pin of
`claude-design-system-prompt` moving) can never stop a release of Muro again.

## What broke it

`Tests` (run 45013089110) and `Release` (run 45013089182) failed on `main` for one cause. Muro's `Tests` workflow ran
Marionette's Python tests, `--validate`, `--check-sources`, the build and the pack of its default project; Muro's
`Release` runs `build-release.bat`, whose `scripts/desktop_resources.py` builds a fresh Marionette release
(`python -m muro build --manifest examples/marionette/sources.json`) and packs it as the default project that the
installer ships. A source whose pin no longer matched its upstream failed both.

## Where each part runs now

| Workflow / job / step | Now |
|---|---|
| `tests.yml` `tests` / Test (pytest) | Stays in Muro for the 24 test modules that do not name Marionette (`-m "not marionette"`). The 49 that do move |
| `tests.yml` `tests` / Validate, check sources and build | Moved to `marionette.yml` |
| `tests.yml` `tests` / Pack the default project | Moved to `marionette.yml` |
| `tests.yml` `desktop` / Rust tests, Frontend unit tests, Design rules, Type check, Frontend build, Shell tests, Browser tests | Stay in Muro, unchanged: none builds or reads Marionette (their projects are fixtures; the shell build uses an empty resources folder) |
| `marionette.yml` `marionette` / Test (`-m marionette`), Validate + check sources + build, Pack the default project | New: Marionette's checks, the same commands as before, when its paths change or by hand |
| `release.yml` `plan`, and `release` / Next version, Inno Setup, Package, Commit/tag/publish, develop follows main | Stay in Muro, unchanged |
| `release.yml` `release` / Prepare and build (`build-release.bat`) | Stays in Muro. Its one Marionette touchpoint, the default project, is optional in CI |
| `release-marionette.yml` (every job) | Marionette's own release gate, not changed |

How the split is made: `tests/conftest.py` marks every test module whose text names Marionette (`marionette`,
case-insensitive) with the marker `marionette`; `Tests` runs `-m "not marionette"` and `marionette.yml` runs
`-m marionette`. Nothing is deleted or deselected anywhere else: every test still runs in one of the two.
`marionette.yml` triggers on push and pull request when `examples/marionette/**`, `muro/**`, `prompts/**`,
`muro_build.py`, `pyproject.toml`, `tests/**`, `scripts/desktop_resources.py`, `docs/adr/**`, `docs/releases/**` or its
own and the Marionette release files change, and by hand.

## The default project in the release

The desktop installer ships Marionette as the default project, `projects/marionette.mp` (ADR-0028, decision 5), and
the only way this repository makes that file is a fresh `muro build` of the package followed by `muro project pack`,
both fetching the pinned sources. So the release still touches Marionette there, and a `muro build` that fails was
what stopped it. Now `build-release.bat` passes `--optional-default-project` to `desktop_resources.py` when `CI` is
set (GitHub Actions sets it): if building or packing the default project fails, a `::warning title=No default
project::` annotation is printed, the folder `projects/` is removed and the resources are staged without it. A Muro
without a default project is a supported state (`DefaultProject::NotBundled` in the runtime, covered by its Rust
tests). On a machine of its own the same failure is still an error. Nothing is checked or tested in this step beyond
what building the package does by itself.

## Checks made

Read-only; no test, build or pack was run (the owner's rule).

- Every workflow parses as YAML (PyYAML): triggers, jobs and step names as in the table; every `uses:` is pinned by a
  40-character SHA, and `marionette.yml` reuses the SHAs of `actions/checkout` and `actions/setup-python` that
  `tests.yml` and `release-marionette.yml` already had.
- The test split: 73 test modules, 49 name Marionette, 24 do not; none of the 24 reads `examples/marionette` (the
  two that read `examples/` read `examples/supads`, another package, from local files only).
- `tests/conftest.py`, `scripts/desktop_resources.py` and `tests/test_marionette_project.py` parse.

## Not executed

The `Tests` workflow with `-m "not marionette"`, `marionette.yml`, the `marionette` marker hook (written for pytest 7
or later: `item.path`), the new test of the optional default project (it belongs to the Marionette tests: its file
names Marionette), `build-release.bat` with `CI` set, and the Release workflow. The first run is on `develop`.
There is no scheduled run of `marionette.yml`, so an upstream that moves is seen at the next change to a
Marionette path, at a release of Marionette (`release-marionette.yml` still checks the sources) or by hand.
