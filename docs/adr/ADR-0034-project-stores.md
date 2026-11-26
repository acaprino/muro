---
adr_id: ADR-0034
version: 1
title: A project's repository is a plugin store built from its project file
status: Proposed
author: Claude Code
scope:
  paths: [.github/workflows/project-store.yml, .github/scripts/project_store.py, muro/project_store.py, muro/project_release.py, docs/project-store.md, tests/test_project_store.py, tests/test_project_release.py, crates/muro-desktop-runtime/src/project_jobs.rs, apps/desktop/src/pages/project/write/ReleaseDialog.tsx]
  modules: []
  domains: [projects, release, repositories]
governs_symbols: []
depends_on: [ADR-0011, ADR-0015, ADR-0028, ADR-0032]
created_from_task: project-store
proposed_on: 2026-11-25
accepted_on: null
---

# ADR-0034: A project's repository is a plugin store built from its project file

Date: 2026-11-25. Status: Proposed. The model is the owner's, in the words quoted
below. The workflow, its rules and this text are implementation choices and are not
separately approved. The workflow and the command ran once for real, on a probe
repository (`docs/verification/2026-11-25-project-store.md`): see "Not run" for what
that run does not show.

## Context

A Muro project is one `.mp` file (ADR-0028). It carries the package, the inputs at
their pins, the records, the history, the changelog and the built plugin. Muro makes
and changes that file (ADR-0032).

The repositories of the packages did not follow from it. A package's repository
held the package unpacked, as a directory, with its own build and release workflows
(ADR-0011, amendment of 2026-11-19). So a project had two forms that could
disagree: the file Muro writes, and a directory in Git that a workflow built. Each
repository also carried its own copy of the release logic.

`project.json` already names a repository (`url`, `branch`, `tag_prefix`), and
`muro marketplace` already writes the root marketplaces of a repository that holds a
build in a folder. Nothing joined the two.

## The owner's words (2026-11-25)

- "sono store plugin claude"
- "ma devono generare e tenere al loro interno la loro vera natura di progetto mp.
  muro project"
- "anzi, è da un muro project che nasce tutto"
- "la build ci deve generare il plugin claude dall'mp"
- "l'mp contiene tutto"
- "un push dell'mp scatena una nuova release"
- "muro deve rilasciare e aggiornare mp"
- "non repository aperte o scompattate"

## Decision

1. **The project is one file, `<slug>.mp`, and it is the only source.** Nothing of
   it lives unpacked in a repository.
2. **A project's repository is a plugin store.** It holds the file and what is
   generated from it: the plugin folder `<slug>/` (with `adapters/<harness>`), the
   root marketplaces of Claude Code and Codex, and `releases/<tag>.md`. Its own
   files are a ten-line caller workflow, optional tests, a README and a license.
3. **A push of the file is a release.** The store is written again from the file
   and the tag `<tag_prefix><version>` is published with the file and the plugin
   zip.
4. **What is published is what the file holds.** `<slug>/` is the file's own
   `release/<slug>/`. The run also builds the package once, as a gate, and throws
   that build away.
5. **Muro owns the repository-side build as one reusable workflow**,
   `.github/workflows/project-store.yml` (`on: workflow_call`). A store calls it
   pinned to a Muro tag or commit, and the Muro that runs is the commit of the
   called workflow. No store repository copies logic.

## Implementation choices (not separately approved)

**Two jobs.** `gate` has a token that only reads and no credentials in its checkout.
It finds, verifies and unpacks the file, checks its identity, asks the version's tag
what to do, then validates the package, checks its sources at their pins, builds it
and runs the repository's own tests on the unpacked file (`MURO_ROOT`,
`MURO_PROJECT`). `publish` has `contents: write`, needs `gate`, and runs neither the
build nor the tests. It checks that the file still has the SHA-256 the gate read.

**The decisions are Python, and each rule lives once.** The shell steps only run
commands. The rules a project file is held to are in the factory,
`muro/project_store.py`: the repository a project names, the identity and the tag,
the refusals, the folder a release replaces, the action for a tag, and the text of
the caller. `.github/scripts/project_store.py` is the workflow's side and imports
them: the file at the root, the top entry of the changelog, the notes and the step's
outputs. The workflow runs it with the Muro checkout on `PYTHONPATH`, so the script
and the rules are of one commit. Reading and checking a project file stays the
factory's: the script takes the identity from `muro.project.summary`, and the
workflow runs `muro project verify`, `muro project unpack` and `muro marketplace`.

**Releasing from a computer** (amendment of 2026-11-25, on the owner's "muro deve
rilasciare e aggiornare mp"). `muro project release FILE.mp` (`muro/project_release.py`)
puts a project's file into the repository its `project.json` names, with the
person's own Git: Muro handles no token and forces nothing. It holds the file to the
same rules before it leaves (`identity_refusals`, `release_problem`,
`folder_problem`, `tag_action`), after `muro project verify`'s check. The choices:

- It reads a copy of the file, so the bytes it checks are the bytes it commits.
- The tip of the branch is fetched one commit deep, with no checkout: a store's tree
  is not written to the disk, only `<slug>/sources.json` for the folder rule. The
  file enters the commit byte for byte (`git hash-object --no-filters`), on top of
  the tip, with the message `<name> <version>`.
- Only Git is asked, never GitHub: the tip that already holds this very file is
  nothing to do; a version whose tag exists, with another file on the branch, is
  refused with the workflow's sentence. The file of the tagged commit and of the
  GitHub release are not read, so a file that was released and later replaced on
  the branch is refused too, with that sentence.
- The address is `https://`, or `file:///` for a folder of this computer (never
  another host, which Windows would sign in to), and the branch a plain name,
  because both come from a file and become arguments of Git. A user name or a
  password in the address is never printed.
- A repository with no branch is allowed and gets its first commit; one that has
  branches but not the project's is refused.
- `--init` writes the caller, pinned to `muro-v<version>` of the Muro that runs,
  when no workflow of the repository contains `project-store.yml`. It never
  replaces a file. Muro's own repository and tag prefix are constants of
  `muro/project_store.py`; a test holds the page's caller, the workflow's fallback
  and `.github/release.json` to them.
- A push that Git refuses (a branch that moved) is reported with Git's text.

**Releasing from the app** (amendment of 2026-11-25, on the same words of the owner). The workspace of an open project
has **Release…**, and the runtime has the action `release_project {id, digest, init?, dry_run?}`
(`crates/muro-desktop-runtime/src/project_jobs.rs`, `release`), which runs `muro project release FILE --expect-digest
DIGEST --cache <data>/project-cache [--init] [--dry-run]` and answers what the command printed. The choices:

- The app adds no rule and no word of its own to the release. The runtime checks only what it checks for an edit (the
  project is in the list, the digest has the shape of one, no AI run is changing the project) and that the two switches
  are true or false. Everything else is the command's, and a refusal is the command's sentence without its prefix.
- No credential is asked for, read or stored, by the page or by the runtime. Git runs as the factory runs it, without a
  prompt.
- It is not an AI run and not a job: it holds no AI lock, has no card and no Cancel, and the dialog waits for it. The
  runtime stops it after 540 seconds, under the 600 the boundary between the window and the runtime waits for one
  request, so the person reads the runtime's sentence. A release stopped there may have pushed: the sentence says so,
  and that releasing again is safe. The command's own limit, 15 minutes for each network step, is not reached from the
  app; a file that needs longer is released from the command line.
- The dialog says what the file says (`project.json`'s repository and branch, `<slug>.mp`, the plugin's version and
  `<tag_prefix><version>`) and asks nothing of the network before the person agrees. It uses no dry run: the action
  takes `dry_run` for a script, and the page does not send it.
- One switch, off when the dialog opens, is `--init`. Off is the command's own default, and a push that adds a workflow
  may need a right the person's credential lacks.
- **Release…** is off, saying why, for a project that names no repository and while an AI run changes that project.
  It is not hidden: the buttons of the action bar keep their places.
- The dialog is Sigrid's `Dialog`, as the other dialogs of the page are. Sigrid's guide names `ConfirmDialog` for a
  question before an action that is not taken back; no dialog of Muro uses it yet, and this one follows the page.

**The rules**, each a red failure with one sentence:

- the file is named `<slug>.mp` and is at the root of the repository;
- when `project.json` names a repository, it is the calling one (`owner/name`, in any
  case, with or without `.git` and a trailing slash), and its branch is the pushed
  one;
- the version and the tag hold only letters, digits, dots, underscores and hyphens,
  and the plugin's name is one line: these values become a file name, a Git ref and
  shell arguments, and the file is a stranger's until it is checked;
- the file carries a built plugin, which `muro project verify` does not ask for;
- `<slug>/` in the repository is absent or an earlier build of the same plugin,
  because the release replaces it whole, and a plugin cannot be named `releases`.

**The tag.** No tag: release. A tag whose GitHub release holds a `.mp` with the
SHA-256 of the pushed file: nothing to do, green, with a line in the step summary.
A tag with another file: failure, "the same version was already released from
another file: change the version". A tag made from this file whose release lacks the
`.mp`: an earlier run stopped between the tag and the release, and this run finishes
it from the tagged commit, with no new commit and no new tag.

**The commit.** Only the generated paths are staged. The commit and the tag are
pushed together or not at all. A branch that moved after the push stops the run
before anything is written to it. The generated commit cannot start the caller
again: a push with the workflow's own token starts no workflow, and the commit
touches no `*.mp` file.

**One at a time.** `concurrency` per branch, never cancelling a run in progress. A
run that waits is replaced by a newer one that waits: the newest file wins.

**No secret.** The token is the workflow's own. The caller grants
`contents: write`, because a called workflow cannot raise its permissions.

## Consequences

- A store repository has no build logic and no package directory. Its history is
  the file and the generated store.
- A change of the plugin is made in Muro, on the file. A change made by hand in
  `<slug>/` is lost at the next release.
- A release needs no version bump in the repository: the version is the file's.
- The gates a package ran in its own repository (validation, source check, build,
  tests) run in Muro's workflow, at the Muro the caller pins.
- A change of this workflow reaches a store only when its caller moves its pin.

## Risks

- **Size in Git.** The file is committed whole at every release, and the store
  holds its release a second time, unpacked. One real project file is 35 MB, of
  which 29.5 MB is the built release. GitHub refuses a file over 100 MB. If a
  project nears that, the choices are Git LFS or a file without `release/` that the
  workflow builds. That is a later decision, and the second choice would end
  decision 4.
- **Review.** Git sees one binary file. A pull request shows nothing of what
  changed between two versions: that is read in the file's own changelog and
  history, as ADR-0028 says.
- **Trust.** A pushed file is released as it is. `verify` proves that the plugin
  matches the package inside the file, not that the package is what its owner meant,
  and nothing compares the carried release with the gate's build beyond the plugin's
  id, its version and its capability ids. The repository's tests, run on the unpacked
  file, are the gate for meaning. Whoever can push to the branch can release.
- **The second time.** The same file pushed twice does nothing. Another file under
  a released version fails. A release left half way is finished. Two pushes do not
  release at once. A file whose `project.json` names another repository, another
  branch or another slug than the one it was pushed to is refused. Not covered: a
  protected branch that refuses the workflow's push, and a run whose branch moved,
  which the owner starts again by hand.
- **A context value.** The commit of a called workflow is read from
  `job.workflow_sha`, then `github.job_workflow_sha`. This was written from
  memory of GitHub's documentation, without the network. Where both are empty the
  run fails with a sentence, and the input `muro_ref` gives the commit.

## Not in this record

- The command and the action that take a newer file from a repository.
- A Cancel for a release that is on its way, and a release that lasts longer than one request of the window (a job,
  as an AI run is).
- Moving any existing repository to this model.
- `AGENTS.md`. It still describes a package as a directory in its own repository,
  released by a workflow of its own. It was left as it is, to be changed with the
  owner.

## Not run

- Update of 2026-11-26: two real projects' repositories were moved to this model and released at their first
  run, with Muro at `muro-v0.10.0` (`docs/verification/2026-11-26-project-store-real-repositories.md`). That
  record proves, of the items below, the push to GitHub by `muro project release`, the push that adds the
  caller and starts it, the fetch of a store of tens of megabytes and the step of the repository's own tests.
  It also records a defect: a project file written on Windows carries no executable permission (fixed the same
  day: `docs/verification/2026-11-26-project-files-on-windows.md`). The items below are kept as they were
  written on 2026-11-25.
- The workflow ran once on GitHub, on a private probe repository, and released at the
  first run (`docs/verification/2026-11-25-project-store.md`). No real project's
  repository calls it yet.
- Shown by that one run, for a small file in a private repository, and by nothing
  else: that `job.workflow_sha` names the commit of the called
  workflow; that a caller's token checks out Muro; that the `concurrency` of a
  called workflow holds a second run back; the three `gh` calls that read the tag,
  the asset of its release and the file of the tagged commit; the push to a
  repository on GitHub; the creation of the release; and the path that finishes a
  release.
- Run on the developer machine, 2026-11-25: `python -m pytest -q
  tests/test_project_store.py -p no:cacheprovider`, 82 passed. They prove the
  functions of the script on small project files packed by the factory, and what the
  workflow's text promises. The workflow file was parsed as YAML once. Run again
  after the rules moved to `muro/project_store.py`: 82 passed.
- `muro project release`, run on the developer machine (Windows, Git 2.55),
  2026-11-25: `python -m pytest -q tests/test_project_release.py -p
  no:cacheprovider`, 47 passed. Every remote is a bare repository on the disk, named
  by a `file://` address, and the person's Git is a configuration of the test's own.
  They prove what the command reads, decides, commits and pushes, and what it refuses.
- `muro project release` pushed to GitHub once, to the probe repository, with the
  person's stored credential. Still unproven, because that run did not meet it: the person's
  credential helper and a credential that is missing (Git does not prompt in the
  terminal; a helper's own window is not Muro's to close, and the time limit ends
  it); a push that adds `.github/workflows/release.yml`, which a token without the
  right to change workflows is refused; that the push of the file and its caller in
  one commit starts the caller; a protected branch; and the shallow fetch of a real
  store with its file of tens of megabytes.
- The caller that `--init` writes names `muro-v<version>` of the Muro that runs. A
  released Muro names its own tag. A checkout between two releases names the last
  one, which may not hold the workflow: `muro-v0.9.1` does not (`git cat-file -e
  muro-v0.9.1:.github/workflows/project-store.yml` fails), so the first Muro whose
  `--init` writes a caller that works is the release that carries this workflow.
- Run once by hand on the developer machine, on the fixture project with a release
  built by the factory, in a Git repository with a local bare remote. The shell of
  these steps was taken from the workflow file and run with Bash: "Which Muro" (with
  and without a commit), "The project file", "The package validates", "The
  repository's own tests" (with and without a tests folder), "The file the gate
  read", "The store, from the file" and "Commit and tag". The remote got one commit
  by `github-actions[bot]` with only the generated paths, and the tag on it. The same
  step run again stopped with "main moved after this push". That run is not kept as a
  test: it needs a built release and Bash.
- Run once, on the probe only: the step that asks whether the version was released (the three
  `gh` calls), `--check-sources` and `--build` on an unpacked project, the zip, the
  `.sha256` files and `gh release create` or `upload`.
- The action of the app (`release_project` and **Release…**), written on 2026-11-25. Nothing of it was compiled on
  the developer machine: no Rust and no TypeScript build, and no window. The Rust tests (`tests/project_jobs.rs`, the
  unit tests of `project_jobs.rs`, two assertions in `tests/simulate.rs`), the type check, `sigrid-check`,
  `imago-check` and the browser tests (`browser-write-edit.mjs`, `browser-write-ai.mjs`, `browser-workspace.mjs`,
  `shots.mjs`) wait for GitHub Actions. Run there, they prove the action against a stand-in factory and the page against
  a fake service; neither reaches a repository.
- Run on the developer machine for the action, 2026-11-25: `node --experimental-strip-types --test` on
  `apps/desktop/tests/project-write.test.ts`, `project-data.test.ts`, `imago-ownership.test.ts` and
  `fake-transport.test.ts` (54 passed: plain functions, the fake service and the rules for the sources, no build),
  `node --check` on the browser test files that changed, and the `project release` branch of the stand-in factory, by
  hand, with Python.
- No release was made from the app. Proven only by one: which Git the app runs (the runtime puts the bundled Git of a
  portable folder first on `PATH`) and whether that Git finds the person's name, email and credential helper; what the
  dialog shows when a helper opens a window of its own; a push that lasts longer than 540 seconds; and the notice with a
  real repository's answer.
- The whole test suite waits for GitHub Actions.
