# The project store, run for real (2026-11-25)

ADR-0034: a Muro project is one file, `<slug>.mp`; its repository is a plugin store built from it; a push of the
file is a release. This record is the first real run of the two pieces that make it so: the reusable workflow
`.github/workflows/project-store.yml` and the command `muro project release`. Factory at commit `c9b8a72` of the
branch `project-store`.

## The probe

A throwaway private repository, `acaprino/store-probe`, and a small real project made for it: one capability from
one pinned public source (MIT, pin `head`), cut from an existing project, with the plugin id `store-probe`, version
0.1.0, the repository `https://github.com/acaprino/store-probe`, branch `main`, tag prefix `store-probe-v`.

- `muro project new`, then the package files, then `muro project commit --create --step none`: the file is
  2,793,615 bytes. `muro project verify`: verified.
- The repository was created with a README and the ten-line caller of `docs/project-store.md`, pinned to the
  commit `c9b8a72` of this repository (no Muro tag holds the workflow yet).

## `muro project release`

- Before the repository existed, `--dry-run` failed with "The repository cannot be reached" and Git's own
  "Repository not found".
- First release: `pushed: true`, commit `fdaaf18`, message `Store Probe 0.1.0`, the file at the root as
  `store-probe.mp`, tag named `store-probe-v0.1.0`. The person's own Git credentials were used; none was asked for.
- The same file again: `pushed: false`, "This file is already released under this version: nothing to do."
- The same version from another file (the author changed with `muro project edit`): refused with
  "store-probe-v0.1.0: the same version was already released from another file: change the version".

## The store workflow

Run 45705805405 of the probe repository, started by that push: `gate` and `publish` both succeeded at the first
run.

- The checkout of Muro at the called workflow's own commit worked without `with: muro_ref`: the notes say the store
  was written by Muro at `c9b8a72`.
- The repository now holds `store-probe.mp`, `store-probe/` (the release the file carries), the root marketplaces
  (`.claude-plugin/marketplace.json` names the plugin at `./store-probe/adapters/claude-code`, version 0.1.0),
  `.agents/` and `releases/store-probe-v0.1.0.md`.
- One commit by `github-actions[bot]`, "release store-probe-v0.1.0", after the person's commit; the tag
  `store-probe-v0.1.0` exists.
- The GitHub release has four assets: `store-probe.mp` (2,793,615 bytes), `store-probe-0.1.0.zip` (2,786,470 bytes)
  and the `.sha256` of each. Its notes are the changelog's top entry and one provenance line with the file's
  SHA-256, the commit it was pushed in and Muro's commit.
- The commit that the workflow pushed started no second run.

## Tests

`tests/test_project_store.py` (82) and `tests/test_project_release.py` (47) pass locally and in the Tests run of the
branch.

## Not run

- `--init` of `muro project release`: it pins `muro-v<version>` of this Muro, and no released tag holds the
  workflow yet. The caller was written by hand for the probe.
- The repository's own tests: the probe has no `tests/` folder, so that step was skipped.
- The `finish` outcome (a tag made from the file whose release lacks the file), a branch that moved during a run,
  a protected branch, a file of tens of megabytes, a public repository.
- The plugin of the probe was not installed on a host from the repository's address.
- No existing project repository was moved to this model, and the app has no release action yet.
- The probe repository is still there; it can be deleted.
