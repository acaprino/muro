---
adr_id: ADR-0020
version: 1
title: Every package ships official documentation in a standard form, started from its sources' own documentation
status: Proposed
author: Alfio Caprino
scope:
  paths:
    - muro/documentation.py
    - muro/sources.py
    - muro/factory.py
    - muro/release.py
    - muro/adapters.py
    - muro/cli.py
    - prompts/documentation.md
    - prompts/intake.md
    - prompts/harmonizer.md
    - examples/marionette/sources.json
    - examples/marionette/documentation/
    - AGENTS.md
    - README.md
  modules: []
  domains:
    - factory
    - documentation
    - intake
    - release
governs_symbols: []
depends_on:
  - ADR-0005
  - ADR-0009
  - ADR-0010
  - ADR-0011
  - ADR-0014
  - ADR-0015
  - ADR-0016
  - ADR-0017
  - ADR-0019
created_from_task: official-package-documentation
proposed_on: 2026-11-14
proposed_at_sha: 271bd6f
accepted_on: null
accepted_at_sha: null
last_verified_sha: null
retired_on: null
retired_reason: null
supersedes: []
superseded_by: null
changes: []
---

# ADR-0020: Every package ships official documentation in a standard form, started from its sources' own documentation

The owner approved this design on 2026-11-14 and asked that it not be implemented yet
("approvo, ma non implementarlo ancora").

This is a design, written before any code. Nothing below is implemented. Lines marked
**Owner** are what the owner said on 2026-11-14; lines marked **Call** are choices made
while writing this up and are open to correction.

## Context

A package Muro generates is a plugin of its own (ADR-0011), yet a release carries no
documentation that says so. What a release holds today:

- `GUIDE.html`: a navigable map of intents, capabilities, sources and delivery decisions
  (ADR-0010). It shows the catalog; it does not explain the plugin.
- `adapters/<host>/INSTALL.md`: the install command and what is active after it.
- No `README.md`. The only prose about Marionette is a hand-written section of Muro's
  own README, and `docs/releases/<tag>.md`, also written by hand.

The facts such documentation must state already exist as data: source identity, pins and
licences in `sources.json`; the always-on text and hook wirings in `delivery.json`; the
discovery entries and absorbed names in `entries.json`; intents, outputs, tools and
checks in the capabilities; documented requests and their routes in `guide-examples.json`.
What is missing is the telling, and a rule that keeps it true at the next intake. The EGM
trial intake of the same day showed the cost: five capabilities were added and no prose
about Marionette mentions them.

**Owner**, 2026-11-14:

- "una cosa importante che non abbiamo fatto è pensare a come Muro debba creare la
  documentazione 'ufficiale' di ogni skill, comando, plugin", for example "la
  documentazione ufficiale di Marionette", "che ne spiega la natura, la struttura, l'uso,
  gli hook, il system prompt", "proprio come se fosse un plugin a sé stante vero e
  proprio".
- On the approach: "ok c ma io partirei anche dalla doc ufficiale della skill originale".
- On where that comes from: "la documentazione la prendiamo da github, della skill
  plugin, e dobbiamo darla a muro. cioè muro deve avere o la repo github o il link del
  sorgente + link della doc".
- On the form: "il readme inoltre deve avere una forma standard, nome, cosa è e cosa fa,
  grafico della struttura, magari riportare esempi di uso, installazione, intenti, casi
  d'uso, albero della struttura".
- On the language: "in inglese".

Who reads the documentation was asked and not answered. **Call:** a person who finds the
plugin's folder or release page and decides whether to install it, and the same person
after installing, who wants to know what it does by itself.

## Principle

A package's documentation is written by the host AI from the official documentation of
the sources it absorbed, in a form Muro fixes, with every fact filled in from the
package's own data. The AI owns the meaning and the words; Python owns the form, the
facts and the refusal to build documentation that no longer matches the package.

## Goals, non-goals, anti-goals

Goals:

- Every release has a `README.md` and one page per discovery entry, the same in every
  package: same sections, same order, same headings.
- The prose starts from what each source's own documentation says, adapted to what this
  package actually carries.
- No fact is typed twice: versions, licences, links, hooks, the session text, install
  commands, intents and the structure come from the data at build time.
- An intake that adds or removes a source or an entry cannot be released until the
  documentation was looked at again.

Non-goals:

- A website, a search index or hosted pages.
- Changing `GUIDE.html` or `INSTALL.md`; both stay, and the README links to them.
- Documentation of Muro itself.
- A capability that answers "what can you do" from these pages at run time.
- Reading documentation from a website that is not a Git repository.

Anti-goals (a result that works and is still a failure):

- A page that promises something the package dropped: an original's slash command, a
  mode, a hook it does not register.
- Python writing or choosing meaning: summarizing a capability, picking which examples
  matter, deciding what a source "is".
- Prose taken from a text Muro could not pin or whose licence it did not check.
- A README that reads as a catalog dump.

## Approaches considered

**A. Python renders everything from the data.** A generator like `muro/guide.py` writes
the README from the manifests and the capabilities. It never drifts and costs nothing per
intake. It produces a list: the nature of the plugin is in no data file, and Python
writing what a capability means breaks the product contract (ADR-0003, ADR-0008).

**B. The host AI writes all of it at harmonization.** Real prose in the package's voice.
Every fact it retypes (hook lists, the session text, versions, licences) drifts at the
next change and nothing checks it.

**C. The AI tells, Python fills in the facts and checks.** The AI writes the prose
sections; the build puts the data blocks beside them and rejects documentation whose
declared scope differs from the package's. This is the pattern of `entries.json` and
`guide-examples.json`.

**Chosen: C** (Owner: "ok c"), with the sources' official documentation as the starting
material.

## Decision

### 1. Where a source's official documentation is

**Owner:** Muro is given either the source's GitHub repository, or the source link plus a
link to its documentation.

Each source in `sources.json` gains:

- `doc_paths`: paths or globs, inside the source's pinned repository, of the files that
  are its official documentation (its README, its `docs/`, a skill's own guide). The
  intake AI chooses them by reading the repository; a person may write them. They are
  read at the source's pinned commit, pass the same checks as `selected_paths` (regular
  UTF-8 text, licence headers, nested licences; ADR-0005, ADR-0006) and are evidence:
  they are exported for the AI and never packaged. A file may also be in
  `selected_paths` when a capability opens it at run time; the two lists are independent.
- `docs`: optional, when the documentation lives in another repository:
  `{repo_url, commit, pin, release, license, license_path, copyright, paths}`, with the
  meaning those fields have for a source (ADR-0009). **Call:** a documentation location
  is always a Git repository pinned by commit. A site that exists only on the web is not
  read; if it is built from files in a repository, those files are the documentation.
- `homepage`: optional `https://` address of the project's site, shown as a link and
  never fetched.
- `doc_gap`: required, a sentence, when a source declares neither `doc_paths` nor
  `docs`: why it has no documentation to start from (for example, the upstream ships
  none). **Call:** a silent absence is not allowed once a package has documentation,
  following "declare, do not infer" (ADR-0015).

Licences. Documentation is read under the gate that already exists (ADR-0005): an exact
MIT or Apache-2.0 licence, no nested licence, and only paths the verified licence file
covers. **Call:** no new licence is accepted for documentation. Files under another
licence or under none (a `docs/` folder under CC-BY, a README outside the folder a
`license_path` covers) are not read; when nothing readable is left the source declares
`doc_gap` and says so. A separate `docs` repository is verified like a source, and its
licence and copyright are added to `LICENSES/` and `NOTICE.md`, because the package's
prose derives from it (as `prompts/delivery.md` already says of a source whose files do
not travel).

A capability that no source's delivery decision targets has no official documentation;
its page text comes from its body.

### 2. What the AI writes

A new protocol `prompts/documentation.md`, the Documentation AI, run by the host LLM
after harmonization, when catalog, delivery and entries are final. Preparation is a new
command that calls no LLM:

    python muro_build.py --manifest <package>/sources.json --prepare-docs

It writes `<package>/.muro/factory/docs/`: `PROMPT.md` (the protocol, the standard form,
the catalog with the capability bodies, `delivery.json`, `entries.json`,
`guide-examples.json` and the current documentation files), `sources/<source-id>/...`
with each source's documentation files at their pins, and `scope.json` (section 3). It is
rerunnable and replaces only what it generated.

The AI writes, in the package directory:

- `documentation/README.md`
- `documentation/<entry name>.md`, one for each entry of `entries.json`. A package
  without entries has the README only.

Rules of the protocol:

- **Start from the originals.** For each entry, read the official documentation of the
  sources its capabilities come from, then the capability bodies and the delivery
  decisions. Say what the original says the thing is for, in this package's words.
- **The substance is the source's** (ADR-0017): no rule, number, condition, exception or
  limit is dropped, weakened, strengthened or invented.
- **Describe this package, not the original.** Leave out what delivery dropped. Where a
  reader who knows the original would expect something that is not here (its command
  names, a mode, a hook, its own installation), say so in the section for differences,
  taken from each capability's "Changes for coexistence" and from the `dropped`
  decisions.
- **One voice, in English.** The package is presented as a plugin of its own.
  **Owner:** the documentation is in English. **Call:** for every package, whatever
  `plugin.language` is; that field keeps governing the guide only.
- **No facts in prose** that a data block shows: no version numbers, licences, hook
  commands, install commands or counts. Refer to the block.
- **Limits come from the package's own records.** The `limits` section is written from
  the gaps the capability bodies record under their sources and from the open doubts in
  the delivery reasons, both of which are in the workbench. It claims no test, live run
  or verification that those records do not state. **Call:** no new verification input
  is added to a package for this.

### 3. The standard form

**Owner:** the README has a standard form: name, what it is and what it does, a diagram
of the structure, examples of use, installation, intents, use cases, a tree of the
structure.

An authored file is a front matter followed by sections. Each section starts with a
marker line and holds only the AI's prose:

    ---
    written_for: <the file's scope record, copied from scope.json>
    ---
    <!-- muro:section what-it-is -->
    <prose>
    <!-- muro:section structure -->
    <prose>

The scope record says what the text was written about. Python computes it from the
package and `--prepare-docs` writes one per file into `scope.json`; the AI copies it into
the front matter after re-reading that file against the current package, the way a
classification copies `catalog_digest`. **Call:** its contents:

- README: every source id with its commit (and the commit of its `docs` repository),
  every entry name, and a digest of what the release registers by itself (the
  `always_on` text and the hook wirings).
- Entry page: the entry's capabilities and the names it absorbs; the sources those
  capabilities come from, each with its commit; and a digest of those sources' delivery
  decisions.

So a page goes stale when its own sources, capabilities, absorbed names or delivery
decisions change, and the README when any source, entry or self-registered behaviour
changes. An intake that touches one entry forces a pass over that page and the README,
not over every page.

Which sources a capability comes from is read from `delivery.json`: the sources whose
`capability` or `hook` decisions target it. **Call:** a package with documentation must
have `delivery.json`; the fixtures that build a release gain a minimal one.

The build emits, for each section in the fixed order: the standard heading (the English
text in the tables below), the prose, then the section's data block.
The AI cannot rename, reorder, add or drop a section. A section marked "prose required"
must have text; a "data only" section may be left empty.

README sections:

| id | Heading | Prose | Data block |
|---|---|---|---|
| `title` | plugin name | one-line statement, required | version |
| `what-it-is` | What it is and what it does | required | — |
| `use-cases` | What you can ask | required: one short paragraph per entry | entries, each linked to its page, with the names it absorbs |
| `examples` | Examples | optional | the documented requests of `guide-examples.json` with their routes |
| `structure` | Structure | required: how the parts work together | a Mermaid diagram: entries as groups, capabilities as nodes, declared `after`, `needs` (with its label), `reads` and `conflicts` as edges |
| `intents` | Intents | optional | every intent with its description and capability, folded |
| `by-itself` | What it does by itself | required | the session text with its length and the hosts that deliver it; the hook wirings, or the statement that the release registers none |
| `install` | Installation | optional | per host, the steps `INSTALL.md` gives |
| `requirements` | Requirements | required | logical tools by capability; `runtime_deps` |
| `tree` | Files | optional | the release's file tree, two levels, one fixed line per top-level item |
| `origins` | Origins and licences | optional | per source: name, repository link, homepage, release or pin, commit, licence, copyright, and what each part became |
| `limits` | Limits | required: what was not run or verified | — |

Entry page sections:

| id | Heading | Prose | Data block |
|---|---|---|---|
| `title` | entry name | one-line statement, required | — |
| `what-it-does` | What it does | required, from the originals' documentation | — |
| `how-to-ask` | How to ask | required, with example requests | documented examples that select one of its capabilities |
| `capabilities` | Capabilities | optional | per capability: role, intents with descriptions and exclusions, outputs, checks, declared relations |
| `requirements` | Requirements | required | tools of its capabilities; `runtime_deps` of its sources |
| `origins` | Origins | optional | its sources with links, release or pin and licence; the names it absorbs |
| `differences` | Differences from the original | required when the entry absorbs a name | — |

**Call:** Mermaid, because GitHub and most hosts' viewers render it and it stays text;
an image would need a renderer and a binary in the release. The diagram draws declared
edges only and never lays out or infers a relation (as ADR-0010 requires of the guide).

**Call:** the tree's one-line descriptions are factory text, because the release layout
is the factory's, not the package's.

### 4. What Python checks

`muro/documentation.py` validates before a release is built and refuses it otherwise:

- `documentation/README.md` exists; there is one page per entry and no other page.
- Every file has all its section markers, once each, in order, and no unknown marker.
- Required prose is present. For `use-cases`, every entry name appears in the prose.
- Each file's `written_for` equals the scope record Python computes for it now. A
  difference means the package changed after the text was written: the AI re-reads the
  file and copies the new record. No command rewrites `written_for` by itself.
- Every source has `doc_paths`, `docs` or `doc_gap`.
- The emitted Markdown contains no marker and no placeholder.

Python does not judge whether the prose is true, complete or faithful to a source. That
is the Documentation AI's work and, like a capability body, it is reviewed against the
originals and recorded in `docs/verification/`.

**Call:** documentation is required for `--build`, as `guide-examples.json` is. A
package cannot be released without it.

### 5. Where the result goes

**Owner:** the finished documentation is also kept in the package directory, in the
repository, so that GitHub shows the package as a plugin of its own (chosen over "only
in the release" and "only on the release page").

- **In the package directory:** `README.md` and `docs/<entry name>.md`, rendered and
  committed. A new command writes them and nothing else:

      python muro_build.py --manifest <package>/sources.json --render-docs

  `--validate` and `--build` render the documentation again in memory and refuse when
  the committed copy differs: a stale or hand-edited copy cannot be released. This is
  the one generated output Muro commits; `dist/` and the guide stay uncommitted. The
  files carry a first-line comment saying they are generated from `documentation/` and
  must not be edited.
- **In the release:** the same `README.md` and `docs/` at the release root and in every
  adapter's plugin folder, beside `INSTALL.md`.
- The README links to each entry page and to `NOTICE.md`; in a release also to
  `GUIDE.html`, which the package directory does not hold.
- `sources.json` keeps the new fields; the guide shows `homepage` beside the repository
  link.
- The documentation is not part of `catalog_digest`: it changes nothing at run time.

**Call:** the committed copy and the release copy have the same text except for the
blocks that depend on where the file sits (the link to the guide, the file tree, which
describes a release). The builder decides how the two renderings differ, as long as the
committed one never links to a file the package directory lacks.

## Algorithm

1. Intake of a source: the AI lists its documentation in `doc_paths` (or the manifest
   names `docs`), or writes `doc_gap`. `--prepare-intake` exports those files with the
   selected ones.
2. Harmonization ends with catalog, `delivery.json` and `entries.json` final.
3. `--prepare-docs` exports the workbench.
4. The host AI writes or revises `documentation/` under `prompts/documentation.md` and
   sets `written_for`.
5. `--render-docs` writes the finished copy into the package directory.
6. `--validate` and `--build` check the documentation and the committed copy; `--build`
   renders it into the release and the adapters.

On a later intake, step 6 fails until steps 4 and 5 were done again for the changed scope.

## Example

After the EGM intake, the page of the entry `marionette-design-docs` would read:

    # Design docs
    <one line>
    ## What it does
    <from EGM's README and getting-started: ideas developed with context, documents
     read by reviewers that never saw the conversation>
    ## How to ask
    <prose>  + the two documented examples that route to its capabilities
    ## Capabilities
    concept-brief, design-doc, fresh-review, codebase-contracts, design-drift, each
    with intents, outputs and checks
    ## Requirements
    <prose: a host that can spawn subagents>  + tools
    ## Origins
    egm · google/elephant-goldfish-model · v0.1.1 · Apache-2.0 · egm.dev
    Absorbs: egm, egm-brainstorm, egm-draft, egm-review, egm-review-loop, egm-resolve,
    egm-bootstrap, egm-drift-report
    ## Differences from the original
    <no /egm: commands; reviewers are not registered subagent types, so read-only is an
     instruction; the review, the loop and the resolution are one skill>

## Consequences

- Every existing source needs `doc_paths`, `docs` or `doc_gap`. Today three of
  Marionette's fourteen sources select documentation files (wayfinder, tokeneconomizer,
  i-have-adhd) and EGM selects eight; the others were absorbed from their skill files
  alone, so their documentation has to be found and read.
- Per intake: one more preparation command and one more AI pass over the entries the
  intake touched and the README. No cost at run time and none per task.
- The fixtures that build a release need a minimal `documentation/` and `delivery.json`.
- A re-pin now also means re-reading the pages of that source's entries and the README.
- Muro's README stops describing Marionette by hand and links to
  `examples/marionette/README.md`.
- The package directory gains generated, committed files; a reviewer of a pull request
  sees the documentation change with the catalog change that caused it.
- A person can still write the prose; the form and the checks do not care who wrote it.

## Left to the builder

- The exact Markdown of each data block.
- How `--prepare-docs` lays out its workbench beyond the two things named above.
- Whether the checks live in `--validate`, `--build` or both, as long as a release
  cannot be built without passing them.
- File names for entries whose name is not a good file name.

## Verification

Planned, none run:

- Unit tests for each refusal in section 4, with a fixture package, and for the data
  blocks rendering exactly what the manifests declare.
- A package with a slug other than `muro` (ADR-0015).
- A second pass: add a source to the fixture and see the build refuse the old
  documentation, then accept the revised one.
- Marionette: documentation authored, a staged build, and the README and one entry page
  read in GitHub's Markdown view. Record in `docs/verification/` which sources'
  documentation was read whole, in part or not at all.
