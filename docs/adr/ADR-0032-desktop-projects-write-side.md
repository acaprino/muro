---
adr_id: ADR-0032
version: 1
title: Projects are made and changed in the desktop app
status: Proposed
author: Claude Code
scope:
  paths: [apps/desktop, crates/muro-desktop-runtime, muro/project.py, muro/project_work.py, muro/cli.py, docs/desktop.md, docs/cli.md]
  modules: []
  domains: [desktop, projects, harmonization]
governs_symbols: []
depends_on: [ADR-0003, ADR-0008, ADR-0015, ADR-0017, ADR-0026, ADR-0028]
created_from_task: projects-write-side
proposed_on: 2026-11-21
accepted_on: null
---

# ADR-0032 — Projects are made and changed in the desktop app

Date: 2026-11-21. Status: records an owner requirement of that day and the
implementation that answers it ("plan 3" of ADR-0028). The decisions below are
implementation choices; neither they nor this text have been separately
approved. Rust was compiled and tested in GitHub Actions only; no run was made
against a real Claude Code (see the verification record).

**Note of 2026-11-23.** This ADR was written on the side branch `claude/busy-pascal-a74l79` as ADR-0030 and renumbered when it was taken over. Taken over: the factory commands (`muro project new`, `edit`, `commit`), the runtime actions and the shell's folder dialog. Not taken over: the screens (`apps/desktop/src/pages/project/write.ts` and the Imago pages), which the move to React on Sigrid (ADR-0031) replaced; they are written again in the React window. Where the text below says the desktop does something, it describes the intended behaviour of those screens, not code that is in the window today.

## Context

Muro 0.5.7 read projects and installed their plugin, but could not make or
change one: ADR-0028 had left the write side ("new project, harmonize, add an
input, move a pin, edit a record") to a third plan, and `docs/desktop.md` said
so. The owner, on 2026-11-21: "dalla gui non è possibile creare nuovi
progetti?!?!", then, told it was by design: "è fondamentale poterli creare
gestire aggiornare editare ecc ecc".

The product contract decides how: what a package means (intake, harmonization,
conflict resolution, placement in the decision graph) is the host LLM's, never
Python's or Rust's (ADR-0003, ADR-0008); a package's scope is set by its sources
(ADR-0015); absorbed content is not altered (ADR-0017); a source travels with
every file its method uses (ADR-0026).

## Decision

1. **Two kinds of change.** A change of the package (a new project, harmonizing
   again, adding, removing or re-pinning an input, the custom instructions) is
   an **AI run**. A change no AI judges (the project's name, author and
   repository, the decision records, the changelog) is an **edit** a person
   makes by hand. Deleting a project takes it off the list and deletes its file.
2. **An AI run is a job of the runtime** (`create_project`, `project_job` with
   `operation` one of `harmonize`, `add_input`, `remove_input`, `move_pin`,
   `instructions`). It runs Claude Code with the same arguments and budget rule
   as AI adaptation (`jobs::agent_args`: a dollar budget, Codex refused) in a
   work folder of the job, which the factory prepares (`muro project new` for a
   new project, `muro project unpack` for a change). The prompt states the
   change in words and the factory's contract (read README, AGENTS.md and the
   intake, harmonizer and delivery prompts; own intake and harmonization; pin
   releases first; select by coverage; record each shaping decision in
   `records.json` with author `muro`; obey binding records or stop; keep the
   owner's instruction files byte for byte; leave `project.json`,
   `history.json`, `CHANGELOG.md`, the plugin id and the version to the
   desktop; write a changelog summary). One AI run at a time, adaptations
   included (the same lock).
3. **The factory commits the run** (`muro project commit`): it builds the
   package (every gate of `build_release`), appends the run to the history with
   its pins, moves the version by the step the person chose, writes the
   changelog entry (the AI's summary, then the differences Python counts:
   inputs added, removed or moved, capabilities added or removed, instruction
   files changed), packs the file with that release and replaces it. Python
   counts and checks; what a change means stays the AI's text.
4. **A file is replaced only while it is the file the change was asked on.**
   Every change and every edit carries the digest of the file the page shows;
   the runtime and the factory refuse another ("The project file changed since
   it was opened"). A new project is never written over an existing file. A run
   that fails or is cancelled leaves the file as it was.
5. **The runtime checks what it can before a run is paid for**: the agent, the
   plugin id (kebab-case, not the shipped project's, not already listed or a
   plugin of the list), the folder, that the file does not exist, the inputs
   (an `https://` address or the full path of a folder), the budget, the
   repository address, the input a removal or a pin names, and that the only
   input is not removed. After the run it refuses an agent that changed the
   owner's instruction files.
6. **Edits are offline** (`muro project edit`): the file is repacked from its
   own copies of the inputs (which fill a sources cache of the edit's own,
   stamped per source) and with its own release, which the unchanged package
   still matches.
7. **The page follows the run.** A run's card (phase, time, log, Cancel) is on
   the project page, above the list for a new project, and in Activity, whose
   filter "AI adaptation" becomes "AI runs". While a run changes a project, its
   page offers no other change. When a run ends the list and the page are read
   again and the outcome is notified. `muro project info` gains `instructions`
   (the owner's files and their text) so the page can edit them.
8. **Nothing is installed by a change.** A new version is installed from the
   Install step, where a build older than the file already reads "install
   again".

## Consequences

- The write side of ADR-0028 exists; "Adapt with AI" stays where it is, for
  plugins that are no project's.
- A project's version moves with every AI run (patch by default, minor for an
  input added or removed): hosts update an installed plugin by its version.
- `muro project edit` and `commit` are new factory commands; `docs/cli.md`
  documents them.
- Imago has no multi-line field helper yet: `textArea` in `forms.ts` writes it
  once with Imago's own classes and moves to Imago with its next release
  (`docs/imago-migration.md`).
- Not run: a real Claude Code run of any operation; the quality of what the AI
  writes is not proved by any fixture (AGENTS.md, "Changes and verification").
