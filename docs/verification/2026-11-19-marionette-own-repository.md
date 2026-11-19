# Marionette released from its own repository (2026-11-19)

Owner request: "dobbiamo portare marionette in una repository pubblica a sé,
cambiando anche il flow di rilascio in muro quando compila marionette, creando
PR verso branch marionette". Decision record: ADR-0011, amendment of the same
day.

## Starting point

- `acaprino/marionette` existed, public (anonymous HTTP 200 on the page and the
  API), created 2026-11-12: `README.md`, `NOTICE.md`, `LICENSES/` of the first
  build and the release `v0.1.0`. Its NOTICE still listed sources that are no
  longer in the package (wayfinder, explain-this).
- `marionette-v0.2.0` to `marionette-v0.4.0` are releases of `acaprino/muro`.
  Shinatama follows them there (`crates/engine/src/marionette.rs`,
  `REPOSITORY = "acaprino/muro"`, tag prefix `marionette-v`).
- `examples/marionette/sources.json` is at 0.4.0, and the package changed
  after that release (`0bb74ea`, motion-design re-pinned): the next release
  needs a new version.

## The flow

1. `Release Marionette` (`.github/workflows/release-marionette.yml`, on the
   owner's request) refuses `marionette-v<version>` when it exists in
   `acaprino/muro` or `acaprino/marionette`, runs the tests, `--validate`,
   `--check-sources` and the build, then pushes `marionette/` and
   `releases/<tag>.md` to `release/<tag>` of `acaprino/marionette` with the
   deploy key in `MARIONETTE_DEPLOY_KEY`.
2. `acaprino/marionette`, `.github/workflows/pull-request.yml`: a push to
   `release/**` opens the pull request into `main`, or refreshes its body.
3. `acaprino/marionette`, `.github/workflows/release.yml`: a push to `main`
   with a build whose version is not tagged publishes `marionette-v<version>`
   with `marionette-<version>.zip` (the folder `marionette/`, as before) and its
   SHA-256.

## Local checks

- Build of the 0.4.0 package on Windows, `--build --out <scratch>`: 4 min 33 s,
  `marionette/` of 280 MiB in 12,060 files, no empty directory, no symlink, no
  file over 5 MiB (GitHub refuses files over 100 MiB).
- The version the release workflow reads, `marionette/sources.json`
  `plugin.version`, is in the build: `0.4.0`.
- `release-marionette.yml` parses as YAML (PyYAML 6.0.3).
- Git round trip of that build: committed in a clone of `acaprino/marionette`
  with `.gitattributes` `* -text` on Windows (`core.autocrlf=true`,
  `core.longpaths=true`: some paths exceed Windows' default limit), cloned back,
  zipped with the call `release.yml` runs (`shutil.make_archive(...,
  "marionette")`) and compared by SHA-256: 12,060 files, 0 missing, 0 extra,
  0 changed, zip 187.9 MiB. File modes were not compared on Windows.

## Setup on GitHub (owner approval of 2026-11-19)

- Deploy key "Muro: Release Marionette workflow", ed25519, read-write, on
  `acaprino/marionette` only. Its write access was proved by pushing the setup
  branch with it, host key checked against `gh api meta`. The private key went
  into the secret `MARIONETTE_DEPLOY_KEY` of `acaprino/muro` and was deleted
  from the machine.
- `acaprino/marionette`, Actions: "Allow GitHub Actions to create and approve
  pull requests" on (`can_approve_pull_request_reviews: true`), default token
  permissions left at read.
- Setup pull request acaprino/marionette#1 (README, the two workflows,
  `.gitattributes`, the first build's NOTICE and LICENSES removed), opened and
  refreshed with the same `gh pr list/create/edit --repo` calls
  `pull-request.yml` makes, run from a directory outside any Git checkout,
  then merged (`b945151`) and its branch deleted. The merge ran `release.yml`
  on `main`: "No build on main: nothing to publish", success.

## Live runs

| Run | Result |
| --- | --- |
| `Release Marionette` 44543455110, dispatched before the push reached `develop` | ran the previous workflow at `bb53f02`; failed at its own tag check, as that version does |
| `Release Marionette` 44543595616 on `c65b7ea`, version 0.4.0 | failed in 1 s at "Refuse a tag that already exists": `marionette-v0.4.0 already exists in acaprino/muro; bump the version instead` |
| `Tests` 44543554542 on `c65b7ea` | 733 passed, 16 skipped (2 min 43 s); `--validate`, `--check-sources` and the build pass |
| local, 0.4.1 | `--validate`: `OK: capabilities and ROUTER.md valid`; `--check-sources`: `OK: all sources and plugin identity valid` (2 min) |
| `Release Marionette` 44544434518 on `9f45425`, version 0.4.1 | success: tag check, tests, validation, source checks, build, checkout of `acaprino/marionette` with the deploy key, push of `release/marionette-v0.4.1` (`83279ea`, "Marionette 0.4.1") |
| `acaprino/marionette`, `Release pull request` on that push | success: opened acaprino/marionette#2 "Marionette 0.4.1" by `github-actions`, `release/marionette-v0.4.1` into `main`, 12,061 files (the build and its notes), mergeable, body = `docs/releases/marionette-v0.4.1.md` plus the Muro commit; `marionette/sources.json` in the branch at 0.4.1 |

Not executed: the merge of #2 and so `release.yml` publishing a build (the
owner's step); a second build of the same version refreshing an open pull
request; Shinatama following `acaprino/marionette`.

The push of `develop` from this machine needed `gh` as Git's credential
helper: the harness home path breaks the credential manager.
