---
adr_id: ADR-0034
version: 1
title: A project's repository is a plugin store built from its project file
status: Proposed
author: Claude Code
scope:
  paths: [.github/workflows/project-store.yml, .github/scripts/project_store.py, docs/project-store.md, tests/test_project_store.py]
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
separately approved. The workflow has not run on GitHub: see "Not run".

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

**The decisions are one script.** `.github/scripts/project_store.py` holds what
reads a value of the file or decides: the file at the root, the repository a project
names, the identity and the tag, the refusals, the action for a tag, the top entry of
the changelog and the notes. The shell steps only run commands. Reading and checking
a project file stays the factory's: the script takes the identity from
`muro.project.summary`, and the workflow runs `muro project verify`, `muro project
unpack` and `muro marketplace`. No factory command was added.

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

- The command and the action of the app that put a project's file into its
  repository, and the ones that take a newer file from it. Until they exist, the
  file is pushed with Git by hand.
- Moving any existing repository to this model.
- `AGENTS.md`. It still describes a package as a directory in its own repository,
  released by a workflow of its own. It was left as it is, to be changed with the
  owner.

## Not run

- The workflow has never run on GitHub. No store repository calls it.
- Proven only by such a run: that `job.workflow_sha` names the commit of the called
  workflow; that a caller's token checks out Muro; that the `concurrency` of a
  called workflow holds a second run back; the three `gh` calls that read the tag,
  the asset of its release and the file of the tagged commit; the push to a
  repository on GitHub; the creation of the release; and the path that finishes a
  release.
- Run on the developer machine, 2026-11-25: `python -m pytest -q
  tests/test_project_store.py -p no:cacheprovider`, 82 passed. They prove the
  functions of the script on small project files packed by the factory, and what the
  workflow's text promises. The workflow file was parsed as YAML once.
- Run once by hand on the developer machine, on the fixture project with a release
  built by the factory, in a Git repository with a local bare remote. The shell of
  these steps was taken from the workflow file and run with Bash: "Which Muro" (with
  and without a commit), "The project file", "The package validates", "The
  repository's own tests" (with and without a tests folder), "The file the gate
  read", "The store, from the file" and "Commit and tag". The remote got one commit
  by `github-actions[bot]` with only the generated paths, and the tag on it. The same
  step run again stopped with "main moved after this push". That run is not kept as a
  test: it needs a built release and Bash.
- Never run anywhere: the step that asks whether the version was released (the three
  `gh` calls), `--check-sources` and `--build` on an unpacked project, the zip, the
  `.sha256` files and `gh release create` or `upload`.
- The whole test suite waits for GitHub Actions.
