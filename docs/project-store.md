# A project's repository is a plugin store

Design record: [ADR-0034](adr/ADR-0034-project-stores.md). The workflow:
[`.github/workflows/project-store.yml`](../.github/workflows/project-store.yml).

## The model

1. A Muro project is one file, `<slug>.mp`. It carries everything: the package, the inputs at their pins, the
   records, the history, the changelog and the built plugin.
2. A project's repository is a plugin store. It holds the file and what is generated from it.
3. A push of the file is a release: the store is written again from the file and the version is tagged.
4. Nothing of the project lives unpacked in the repository. To change the plugin, change the file in Muro.
5. Muro owns the build as one reusable workflow, so no store repository copies any logic.

## What a store repository holds

```text
<slug>.mp                           the project file: the only source
<slug>/                             generated: the plugin, as the file carries it (its release/<slug>/)
  adapters/<harness>/
.claude-plugin/marketplace.json     generated: the Claude Code marketplace of the repository
.agents/plugins/marketplace.json    generated: the Codex marketplace of the repository
releases/<tag>.md                   generated: the notes of each release
.github/workflows/release.yml       the caller below
tests/                              optional: the repository's own tests
README.md, LICENSE                  the repository's own
```

Never edit a generated path by hand: the next release replaces `<slug>/` whole and writes the others again.
Anyone installs the plugin from the repository's address, for example
`claude plugin marketplace add <owner>/<repository>`.

## The caller

Copy this as `.github/workflows/release.yml`, or let `muro project release --init` write it. Put your branch in
`branches`, and in place of `<ref>` a Muro tag (`muro-v<version>`) or a full commit that holds the workflow. That
ref is the Muro that runs: the factory is checked out at the commit of the workflow you call.

```yaml
name: Release
on:
  push:
    branches: [main]
    paths: ['*.mp']
  workflow_dispatch:
permissions: { contents: write }
jobs:
  store:
    uses: acaprino/muro/.github/workflows/project-store.yml@<ref>
```

`permissions: contents: write` is needed: a called workflow can lower what the token may do, never raise it. No
secret is used. Do not give the caller a `concurrency` group of its own with the same name as the called
workflow's (`project-store-` and the pushed ref).

Inputs, all optional, under `with:`:

| Input | Default | What it is |
| --- | --- | --- |
| `project` | the only `.mp` at the root | The file's name, when the root holds several |
| `tests` | `tests` | The folder of the repository's own tests; skipped when it is absent |
| `muro_ref` | none | The commit or tag of Muro to run, only if a run fails with "The runner did not say which commit of Muro this workflow is from" |

## Releasing from your computer

`muro project release <slug>.mp` puts the file into the repository its `project.json` names, with your own Git:

```sh
muro project edit <slug>.mp --expect-digest <sha256> --repository https://github.com/<owner>/<repository> --tag-prefix <slug>-v
muro project release <slug>.mp --init
```

It checks the file as the workflow will (`muro project verify`, the version, the tag, the built plugin), fetches the tip
of the branch, and commits the file as `<slug>.mp` on top of it with the message `<name> <version>`. Then it pushes,
and the push is the release. `--init` adds the caller above for the project's branch, pinned to the tag of the Muro
that runs the command (`muro-v<version>`), when the repository has no workflow that calls the store workflow; without
it the command warns that nothing will build the store. `--dry-run` pushes nothing and says what it would push.

The same file pushed twice does nothing. Another file under a version whose tag exists is refused before it leaves,
with the sentence of the table below. A branch that moved is reported as Git says it, and nothing is forced. The
command is in [the command reference](cli.md#muro-project-release-filemp---expect-digest-sha256---init---dry-run---cache-dir).

Muro handles no token: the push uses the credentials your Git already has. A credential that adds a file under
`.github/workflows/` may need the right to change workflows (on GitHub, the `workflow` scope of a token).

The desktop app does the same from the workspace of an open project: **Release…**, which runs this command through the
runtime's `release_project` and has one switch for `--init`. It is described in
[the desktop guide](desktop.md#changing-a-project).

## What a push does

The job `gate` reads only:

1. It checks out the repository into `store/` and Muro into `factory/`, at the commit of the called workflow.
2. It finds the project file: the input `project`, or the only `.mp` at the root. None or several is an error.
3. It runs `muro project verify` and `muro project unpack`.
4. It reads the identity and applies the rules below.
5. Only for a version that has no tag yet: `--validate`, `--check-sources` (network: the pinned sources),
   a `--build` that must succeed, and `python -m pytest -q <tests>`.

The job `publish` writes, and runs only for a release:

6. It replaces `<slug>/` with the release the file carries, writes the root marketplaces
   (`muro marketplace . <slug>`) and writes `releases/<tag>.md`: the top entry of the file's `CHANGELOG.md` and
   one line that names the repository, the pushed commit, the SHA-256 of the file and Muro's commit.
7. It commits those paths only, as `github-actions[bot]`, pushes the commit and the tag together, and creates
   the GitHub release with `<slug>.mp`, `<slug>-<version>.zip` (the folder `<slug>/`) and the `.sha256` of each.

What is published is what the file holds. The build of step 5 is a check, not what ships.

The generated commit does not start the caller again: a push made with the workflow's own token starts no
workflow, and the commit touches no `*.mp` file.

One release runs at a time for a branch. A run that waits is replaced by a newer one that waits.

## The rules

Each one stops the run, red, with one sentence.

- The file is named `<slug>.mp`, where the slug is the plugin's id, and it is at the root of the repository.
- When `project.json` names a repository, it is the calling one. Only `owner/name` is compared, in any case,
  with or without `.git` and a trailing slash. The branch it names is the pushed one.
- The tag is `<tag_prefix><version>`: the prefix of `project.json`, or `<slug>-v` for a project that names no
  repository. The version and the tag hold only letters, digits, dots, underscores and hyphens.
- The file carries a built plugin (`release/<slug>/`). `muro project verify` passes a file without one; a store
  cannot publish it.
- `<slug>/` in the repository is absent or an earlier build of the same plugin. A plugin cannot be named
  `releases`.

The tag decides what the run does:

| The tag `<tag_prefix><version>` | The run |
| --- | --- |
| does not exist | releases |
| exists, and the `.mp` of its GitHub release has the SHA-256 of the pushed file | does nothing and ends green, with a line in the summary |
| exists, with another file | fails: "the same version was already released from another file: change the version" |
| exists, was made from this file, and its release lacks the `.mp` | finishes the release an earlier run left half way |

`publish` stops, red, when the branch moved after the push: run the workflow by hand to release the file the
branch holds now.

## The repository's own tests

They run on the unpacked file, before anything is written, with a token that only reads. Two environment
variables say where things are:

- `MURO_ROOT`: the Muro checkout. It is also on `PYTHONPATH`, so `import muro` works.
- `MURO_PROJECT`: the unpacked project (`sources.json`, `capabilities/`, `inputs/`, `release/<slug>/`, ...).

Only `pytest` is installed for them.

## Not done yet

- Taking a newer file from the repository: neither a command nor an action of the app does it.
- No release has been made from the app. Its action (**Release…**, `release_project`) is written and tested against
  stand-ins only: see "Not run" in the ADR.
- A project file written on Windows carries no executable permission: the scripts of the plugin it holds reach
  macOS and Linux unable to start by name. Until it is fixed, write on Linux a file whose sources ship such
  scripts (`docs/verification/2026-11-26-project-store-real-repositories.md`).
- A second release of a store that this workflow wrote: no real repository has made one.
- Git LFS. The file is committed as it is. GitHub refuses a file over 100 MB, and the run reads the file of a
  tagged commit through an interface with the same limit.
- A protected branch. The workflow pushes with its own token, which a rule that asks for a pull request refuses.
- The workflow has run on a probe repository (`docs/verification/2026-11-25-project-store.md`) and released two real
  projects at their first run (`docs/verification/2026-11-26-project-store-real-repositories.md`). See "Not run" in
  the ADR and in the second record for what those runs do not show.
