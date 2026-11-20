# Marionette 0.4.1

Marionette has its own public repository,
[acaprino/marionette](https://github.com/acaprino/marionette): this release and
the next ones are published there. The catalog is the one of 0.4.0, 37
capabilities from 17 sources.

## Where releases are

- [Releases](https://github.com/acaprino/marionette/releases), tagged
  `marionette-v<version>`, with `marionette-<version>.zip` (the folder
  `marionette/`) and its `.sha256`, laid out as before. 0.2.0 to 0.4.0 stay
  among [Muro's releases](https://github.com/acaprino/muro/releases).
- The repository's `marionette/` folder is the build of the latest release:
  adapters, guide and notices can be read there without downloading the ZIP.
- Each release arrives as a pull request that Muro builds; merging it publishes
  the release.

Shinatama follows the `marionette-v*` releases of `acaprino/muro`
(`REPOSITORY` in `crates/engine/src/marionette.rs`), so it stays on 0.4.0 until
it follows this repository.

## Changed

- motion-design follows its upstream head `d77a9fc8` (LottieFiles pull request
  #7). Its `reference/export-and-render.md` gives the Creator MCP install as a
  command for Claude Code and for Codex, a configuration entry for Cursor and a
  handoff template; the motion principles capability says so. Its steps,
  outputs and delivery decisions are unchanged.

## Use and upgrade

A host caches an installed plugin by version: install this one from the ZIP,
following the `INSTALL.md` of your adapter. The ZIP is about 188 MB, as for
0.4.0.

## Verification

The records are
[the re-pin](https://github.com/acaprino/muro/blob/develop/docs/verification/2026-11-19-motion-design-repin.md)
and
[the own repository](https://github.com/acaprino/muro/blob/develop/docs/verification/2026-11-19-marionette-own-repository.md).

The `Release Marionette` workflow ran the tests, source validation, source
checks and the build on the release commit before it opened this pull request.
The `Tests` workflow passed on `develop` at `c65b7ea`, the same catalog at
0.4.0: **733 tests**, **16 skipped**, then source validation, source checks and
a fresh build. Locally: `--validate` and `--check-sources` pass at 0.4.1. The 0.4.0 build of the same
catalog was committed to Git, cloned back and zipped as the release is: its
12,060 files came back byte for byte.

Not executed: no live host session with this version; Shinatama with this
repository; Codex, Pi, OpenCode and Hermes; a rendered-file request after the
re-pin.

No previous release is replaced.
