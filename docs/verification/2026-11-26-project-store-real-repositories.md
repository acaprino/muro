# Two real repositories moved to the project store (2026-11-26)

ADR-0034. The owner asked for the last step of the model: the repositories of two real projects, one public and
one private, become plugin stores. Muro at the tag `muro-v0.10.0` (commit `5871ee2`), the first tag that holds
`.github/workflows/project-store.yml`. Each repository keeps its own record with its names; this one says what
the two runs show about the factory.

## What the repositories held before

- The public one: the package unpacked in a folder, its tests, a build of the last version, and three workflows
  of its own that built and released from the folder.
- The private one: the package unpacked at the root, its tests, a project file of the version already released,
  one adapter of the built plugin and no workflow.

Both had already published the version their package named, as a zip, so each needed a new version: a tag that
exists without the project file is refused ("the same version was already released from another file").

## A defect found before anything was pushed: a file written on Windows loses the executable permission

`muro/project.py` reads whether a file is executable from the file system (`_executable`: `st_mode & 0o111`).
Windows keeps no such bit. Measured on two project files packed on Windows on 2026-11-25: under `release/` the
first carried 2,620 members, none executable, where the same plugin built on Linux and committed in its
repository has 126 executable files (scripts of the absorbed sources, some with no extension and started by
name); the second carried 5,550 members, none executable. The store publishes what the file holds, so a store
written from such a file gives macOS and Linux users scripts they cannot start by name.

It is not fixed (fixed later the same day: `2026-11-26-project-files-on-windows.md`). It touches every command that writes a project file on Windows from files on the disk: `pack`,
`commit`, `edit`, and the app's actions over them. `inputs/` taken from Git keep the bit (it is read from the
tree), until an unpack and a pack on Windows drop it.

For this move both files were written on Linux: a one-off workflow, on a branch of each repository that was
deleted afterwards, ran `muro project pack` on the unpacked package and `muro project commit --step patch
--summary` on its unpack, and gave the file as an artifact. Result: 126 executable members of 2,632 in the first
file, the same count as the repository's build; 467 of 5,562 in the second.

## The rehearsal, on a runner

The store workflow cannot be tried on a branch: the branch a project names must be the pushed one. So the same
one-off job ran, on the new file, what the gate runs: `--validate`, `--check-sources`, `--build`, the script's
`find`, `identity` and `notes`, and the repository's tests with `MURO_PROJECT`.

- First file (18,653,876 bytes, 43 capabilities from 18 inputs): all passed but one test of the repository, which
  held that the runs of `history.json` are stored newest first. `commit` appends a run, and the app orders them
  by time: the test was the repository's own rule, and it was changed there. Second run: 309 passed.
- Second file (35,258,259 bytes, 78 capabilities from 4 inputs): all passed, 23 tests.
- The plugin the first file carries, beside the build of the earlier version in its repository: the absorbed
  files and the capabilities are the same; what differs is the factory's own runtime (`muro/`, with two modules
  more), the version in the manifests, `NOTICE.md` and `GUIDE.html`. The second repository held no whole build
  to compare with.

The repositories' tests read the package from `MURO_PROJECT` since this move; before, from the folder.

## The move

1. One commit on the branch: the unpacked package and the old workflows removed, the tests pointed at
   `MURO_PROJECT`, the README rewritten. In the public repository the caller was written by hand in that commit,
   from `caller_workflow()`, because `--init` refuses a `release.yml` that is not a caller. The commit touches no
   `*.mp`, so it released nothing. In the private one the partial plugin folder was removed too: it has no
   `sources.json`, so the store's rule for `<slug>/` would have refused it.
2. `muro project release FILE.mp --expect-digest SHA256`, from the developer machine (Windows, the person's own
   Git credential, which may change workflows), after a `--dry-run`. In the private repository with `--init`.

## What the runs show

- `muro project release` pushed to two repositories on GitHub: `pushed: true`, the commit `<name> <version>`,
  the file byte for byte (the SHA-256 of the release's asset is the one given to `--expect-digest`).
- A push of the file alone started the caller, as on the probe. A push of the file and its caller in one commit
  (`--init`) also started it: that one was listed as unproven in the ADR.
- The shallow fetch of a store that holds a file of 35 MB worked within the time limit.
- The store workflow released at the first run in both: `gate` and `publish` green. The step of the repository's
  own tests ran for real for the first time (309 and 23 passed).
- The generated commit, by `github-actions[bot]`, holds only the generated paths. In the public repository it
  changed versions, guide, notice and the runtime, and no file mode: 126 executable files before and after. In
  the private one it wrote the whole plugin (5,562 files, six adapter folders, 467 executable files) and the
  Codex marketplace the repository did not have.
- Each release has four assets: the project file, `<slug>-<version>.zip` and the `.sha256` of each. The notes are
  the top entry of the file's changelog, which `commit` wrote from `--summary`, and the line of provenance.

## Not run

- A second release of either repository: the next version, pushed over a store that this workflow wrote.
- A release from the app. A release of a file written on Windows (see the defect above).
- An installation from either repository's address after the move, and any host session on the two plugins.
- A protected branch, a missing credential, and the path that finishes a release left half way, on a real
  repository.
