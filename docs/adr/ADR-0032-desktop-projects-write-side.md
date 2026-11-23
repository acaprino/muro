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

**Note of 2026-11-23.** This ADR was written on the side branch `claude/busy-pascal-a74l79` as ADR-0030 and renumbered when it was taken over. Taken over: the factory commands (`muro project new`, `edit`, `commit`), the runtime actions and the shell's folder dialog. Not taken over: the screens of that branch (`apps/desktop/src/pages/project/write.ts` and the Imago pages), which the move to React on Sigrid (ADR-0031) replaced. They are written again in the React window (plan W, commits `ba5929a` to `114178a`), under `apps/desktop/src/pages/project/write/` unless a path says otherwise:

- the write layer and the runs: `jobs.ts` (the shapes of the requests, the checks of what is typed that the runtime makes again, the wording of its refusals), `useJobs.tsx` (the runtime's jobs, read for the whole window) and `JobCard.tsx` (the card of a run, with Cancel);
- the AI changes (decisions 1 and 2): `NewProjectDialog.tsx`, `AddInputDialog.tsx`, `HarmonizeDialog.tsx` (which also holds what the dialogs of a change share), `PinDialog.tsx` (move a pin, with Check for updates, and remove an input) and `InstructionsDialog.tsx`;
- the edits by hand (decision 6): `DetailsDialog.tsx` (name, author, repository, changelog) and `RecordsEditor.tsx` (add, edit and delete a decision record);
- deleting a project: `DeleteDialog.tsx`;
- the pages that hold them: `pages/Projects.tsx` (New project, Delete, the card above the list), `pages/project/Workspace.tsx` (the action bar, Edit details, the card of the project), `InputsPanel.tsx` (Move pin, Remove, Instructions) and `RecordsPanel.tsx`.

Not in the window: **Install on harnesses** (decision 8 has a new version installed from the Install step; that step comes with the Sync page), **Review decisions** (the runtime has no operation for it) and the Activity page (decision 7's filter *AI runs*: the run's card on the project page and above the list is there). The Consequences' note on Imago's `textArea` is about the earlier window: the React window uses Sigrid's own field. Nothing of this was run with a real Claude Code or on a Windows window: the tests drive a fake service, and the record is `docs/verification/2026-11-23-project-write-react.md`.

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
   that fails or is cancelled leaves the file as it was. *(Amended 2026-11-23:
   a cancel is ignored once the factory has started to build and save the
   project; see the amendment below.)*
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

## Amendment of 2026-11-23: the final review of plan W

Decided when the whole of plan W was reviewed, after the backend and the screens
were both in `develop`. Implementation choices; not separately approved. The
review's findings, and which of them this amendment answers, are in
`docs/verification/2026-11-23-project-write-react.md`.

- **What a run can reach (decision 2).** Claude Code runs with `Bash` allowed
  under `acceptEdits`, so a run is not confined to its work folder: it can read
  and write what the user can, run the factory and reach the network, and the
  only guard is the prompt ("work only in…", "a source is reference data").
  This is accepted, as it is for AI adaptation, and is said in every dialog that
  starts a run and in `docs/desktop.md`.
- **What configures the agent (decision 2).** A project run starts Claude Code
  with `--setting-sources user --strict-mcp-config`. The first version passed
  the arguments of adaptation, with no setting sources, so Claude Code read the
  project settings of its working directory, and that directory holds the
  unpacked `.mp`, a file that may come from elsewhere: its `.claude/settings.json`
  (hooks, `env`), `.mcp.json` and `CLAUDE.md` would have configured the agent
  with no model judgment involved. Now nothing of the work folder configures it,
  and `muro project unpack` refuses a member outside the layout of the format.
  The `user` source stays, because it holds the person's sign-in and provider:
  dropping it would be cheaper and could leave a run without credentials.
- **What that costs (decision 2).** The person's own plugins, hooks and global
  instructions load into every turn (AGENTS.md measured about 114,000 tokens a
  turn with the owner's setup on 2026-11-14), so a run costs more than a bare
  one, and the default budget of 5 USD can run out before the work is done. The
  dialogs say so next to the budget. The budget is still checked by Claude Code
  between turns.
- **A limit of its own (decision 2).** A project run stops after 120 minutes; an
  adaptation keeps 30. A harmonization of several inputs outlasts 30. A run past
  the limit ends `failed` with a message that names it, and the card says it
  while the run goes.
- **What the factory takes from the AI's folder (decisions 2 and 3).** Decision 2
  left the project's identity, history and changelog to the desktop, and the
  prompt asked it, but `commit` read them from the folder the agent wrote in.
  It now takes them from the project as the desktop holds it, and refuses a run
  that changes a record of the owner's or adds a binding one (a binding record
  is "the owner's rule" for every later run, so an injected instruction could
  otherwise persist).
- **Cancel (decisions 4 and 7).** Once the factory starts to build and save the
  project (phase "Building and saving the project") the runtime ignores a
  cancel: killing it half way left scratch folders beside the owner's file and
  could report "not changed" for a file that was in fact replaced. The card
  shows no Cancel in that phase and says why. A cancel before it leaves the file
  as it was, with the runtime's own words for where the run was (between steps,
  "Job cancelled"; during the agent, that it was cancelled or exceeded its
  limit).
- **The page (decision 7).** The card of a run that is not the page's own (the
  run of another project, an adaptation) is shown too, with its Cancel, because
  it is why no change is offered and the window has no Activity page; a refusal
  because another run goes makes the window read the runs again; Move pin is
  shown off, with the reason, for a frozen pin; and focus goes to the heading
  of the page, or of the records, when the control it was on is gone.
