---
adr_id: ADR-0026
version: 1
title: Source coverage evidence at intake and the omission gate
status: Proposed
author: Claude Code
scope:
  paths: [muro/coverage.py, muro/factory.py, muro/sources.py, muro/agent.py, muro/release.py, muro/scaffold.py, prompts/intake.md, sources.json]
  modules: []
  domains: [intake, factory, sources]
governs_symbols: []
depends_on: [ADR-0008, ADR-0015, ADR-0016, ADR-0017, ADR-0018]
created_from_task: taste-skill-truncated-intake
proposed_on: 2026-11-17
accepted_on: null
---

# ADR-0026 — Source coverage evidence at intake

Date: 2026-11-17. Status: implements the owner's approval of the same day; this
explanatory text has not been separately approved.

## Context

On 2026-11-17 Marionette 0.3.0 built a showcase website in a real project and
the owner rejected the page. The session's work map records why it was written
by hand: "the kit (assets/) is not packaged, so the page has its own CSS and
JS". The capability said so itself. `visual-direction` told the host that
taste-skill's kit, its hero and moment dealers, its photograph and icon tools,
its five automated checkers and its finish gate were "not packaged", ordered
the page written by hand, and carried a check, `automated_gate_disclosed`, that
passed when the report admitted the checkers had not run.

taste-skill v2.5.1 holds 1,631 files under `skills/taste-skill/`. The manifest
selected 11. That selection dates from the first commit of the factory
(2e0fa68, 2026-11-09), with an intake goal that said "do not download photos,
fonts or other external assets", and it was not revisited after the owner's
rule of 2026-11-11 that a package does whatever its sources do (ADR-0015). The
gap was written down twice, in the capability's `## Sources` ("Open intake
gap") and in `docs/verification/2026-11-12-capabilities-reread.md`, and it
shipped.

Three things in the factory let it through:

1. The intake AI saw only the files in `selected_paths`. `prepare_intake`
   exported nothing else, so the AI that owns the intake could not see what the
   source holds, nor that the selected files name what was left out.
2. A reported gap stopped nothing. The prompt said to name a missing reference
   and leave the conclusion open; no code read that.
3. A check could certify the omission.

The intake prompt also still said to exclude "external downloaders" (commit
77b7a76, 2026-11-10), older than the owner's decision of 2026-11-12 that Muro
adds no limit of its own on what an absorbed tool sends or fetches.

## Owner statements

In the session that rejected the page: "marionette ha tutto!". Then, on reading
the diagnosis: "è l'unico motivo per cui avevamo creato marionette", "e non
viene usato?!?!", "ma è un problema di muro allora". The owner approved this
order of work: evidence at intake, then a gate, then a new intake of
taste-skill and a pass over the other sources.

## Decision

The evidence first; the gate is under "The gate" below.

`prepare_intake` writes `coverage.json` in the workbench, computed by
`muro/coverage.py` from the pinned commit:

- `selected` and `unselected`: file and byte totals on each side.
- `left_out`: every unselected file, with a folder that holds nothing selected
  rolled into one row (`path`, `kind`, `files`, `bytes`).
- `referenced`: the unselected files and folders that a selected file names,
  each with `named_in`, the selected files that name it.

A name is a path-like token of a selected file that resolves to an existing
path of the pinned tree: read from the folder of the file that names it, then
from the folders above it, the nearest one where the path exists. A leading
placeholder, install location or link host is skipped. One word counts only as
a file name with a dot or as a folder written with its slash. The folders a
file lives in are not references.

Python resolves paths and counts. It does not decide what the generated plugin
needs: an entry can be a coincidence, and a loosely named file can be absent
from `referenced`, which is why `left_out` is complete.

`prompts/intake.md` gains "What the selection leaves out". The intake AI opens
the selected file behind each entry and judges what the source does with it. A
file the method uses at run time means the selection is incomplete: the AI adds
the paths to `selected_paths`, the intake is prepared again and the files are
read before a capability is written. Completing the file selection of an
approved source is part of intake, not a new scope. A capability never tells
the host that part of its source's method is "not packaged", and no check
passes because an omission was disclosed. An entry that is not needed is said
so in `## Sources` with the reason. A needed file the license gate refuses is
named as an unresolved gap for the owner.

The same prompt no longer excludes downloaders: a tool of the source that
downloads when a task runs it travels like any other helper, with the source's
own statement of what it fetches. Intake and build still download nothing.

`muro agent` inlines `coverage.json` beside `source.json` for an API model.

The tree listing lives once, in `sources.tree_entries`, used by the license
gate, the intake snapshot and the coverage.

## The gate

Added the same day, after the measurement below: evidence that nothing reads
would repeat the failure, since the gap had already been written down twice.

A source may declare `omissions`, a list of `{paths, reason}`: patterns of
unselected files and the reason the generated plugin does not need them,
written by the intake AI. `check-sources` and `build` (`inspect_source` with
`coverage=True`) refuse a source when:

- a selected file names an unselected file that no omission pattern covers. A
  named folder stands for every unselected file under it;
- an omission pattern matches nothing that was left out, or matches a selected
  file;
- an entry is malformed or has no reason.

The message counts the unexplained files, lists the first eight with the files
that name them, and says to select what the method uses or declare the rest.

`muro intake` and `muro init` do not apply the gate. The workbench is where the
AI learns what is missing, and a scaffold exists before any intake.

Python checks that a declaration exists and matches. It does not read the
reason and cannot tell a true one from an excuse: that stays with the AI that
writes it and the owner who reads `sources.json`. `excluded_paths` keeps its
meaning, a pattern that must never be selected, and explains nothing.

## Reading a source absorbed whole

Selecting a whole skill folder showed two limits of the factory, fixed with it.

One Git process per selected file (`git show`, about 0.2 s each on the owner's
Windows machine) read every file twice at an intake preparation and twice at a
build: over twenty minutes for taste-skill's 1,631 files. `sources.read_blobs`
reads all of them through one `git cat-file --batch`; the same preparation
took 28 seconds.

The build's helper check treated any `from './x'` and any `new URL('./x', …)`
in a script as a file the package must hold. In taste-skill one is an import
quoted inside a string of documentation and the other a URL on a base known
only at run time, and each stopped the build. The check now reads an import or
re-export statement, a dynamic import or require, and a URL on
`import.meta.url`; a real dependency that is not packaged still stops the build
(`tests/test_final_review.py`).

## What this does not do

- A capability can still be written around an omission that carries a reason,
  and a check can still be written to pass on a disclosure. The prompt forbids
  both; no code detects them.
- A file the method needs and no selected file names by a resolvable path is
  not caught by the gate. It is in `left_out`, which the prompt says to read.
- Existing intakes are unchanged by this record. Each source of an existing
  package needs its `omissions` written, or its selection completed, before the
  package passes the source check again.
- Binary media and its rights are ADR-0027.
- `muro agent` cannot write `sources.json`, so an API model reports the paths
  to add and a person or host adds them.
- Path matching is mechanical. It was measured on Marionette's sources, not
  proved complete; the numbers are in the verification record.

## Cost

One extra `git ls-tree` read and one JSON file per preparation. On taste-skill
the file is about 20 KB. The gate reuses the tree and the file contents the
license gate already reads, so the source check makes no extra Git call.
Nothing is added to a runtime task. At intake the AI writes one omission entry
per reason: on Marionette's seventeen sources the measurement found 190 named
entries to select or explain.

## Verification

`tests/test_blob_batch.py` covers the batched read and bounds the number of Git
processes of a source check and of an intake preparation.
`tests/test_source_coverage.py` covers the resolution rules, the roll-up, the
workbench file, a second preparation after the selection grows and the inline
copy for an API model. `tests/test_coverage_gate.py` covers the refusal, the
two ways to satisfy it, a named folder, malformed and contradictory
declarations, the cut of a long message, intake preparation and scaffolding
left ungated, and a build that is refused and then succeeds. The measurement on Marionette's seventeen sources is in
`docs/verification/2026-11-17-source-coverage-evidence.md`.
