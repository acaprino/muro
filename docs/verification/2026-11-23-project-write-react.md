# Projects, write side, in the React window: verification record of 2026-11-23 (ADR-0032)

The factory commands (`muro project new`, `edit`, `commit`) and the runtime actions (`create_project`, `project_job`,
`edit_project`, `delete_project`, `project_updates`, `jobs`, `cancel_job`, and the shell's `pick_folder`) came to `develop` in
`5c4a6bf`, as [2026-11-21-projects-write-side.md](2026-11-21-projects-write-side.md) records them, and were green in CI. The
screens of that record (`write.ts` and the Imago pages) were not part of it: the move to React on Sigrid (ADR-0031) replaced
them. This record is about the screens written again in the React window (plan W), on top of `5c4a6bf`.

Nothing in `muro/`, `crates/` or `apps/desktop/src-tauri/` was changed: every commit below touches `apps/desktop/` only
(the documents of this task come after them). Nothing was compiled, linted or run on this machine (AGENTS.md, "Nothing is compiled on this machine"); the
first run of everything below is the CI run named under "CI run".

## What was built

`git log --oneline 5c4a6bf..HEAD` (at `114178a`):

| Commit | What |
| --- | --- |
| `ba5929a` | The write layer and the job hook (task 1): `write/jobs.ts` (the shapes of the requests, the checks of what is typed that the runtime makes again, the wording of its refusals and of the operations), `write/useJobs.tsx` (the runtime's jobs for the whole window, mounted in `App.tsx`), the write types in `types.ts`, the write actions of the fake service in `tests/fake-transport.js` (each with the runtime's refusals), `tests/project-write.test.ts` |
| `d57377c` | The list of projects and the open project are read again when a job ends (`settled`); `jobs` and `cancel_job` go beside the page's queue (`ALONE` in `src/queue.ts`, so a long `project_updates` or `edit_project` does not hold up the poll or a Cancel) |
| `926338c` | The details and the decision records edited by hand (task 3): `write/DetailsDialog.tsx`, `write/RecordsEditor.tsx`, `RecordsPanel.tsx`, `tests/browser-write-edit.mjs` |
| `fb23cb8` | New project and delete project in the list (task 4): `write/NewProjectDialog.tsx`, `write/DeleteDialog.tsx`, `pages/Projects.tsx`, `tests/browser-write-new.mjs` |
| `cd1ceea` | The AI dialogs, the job card and the action bar (task 2): `write/HarmonizeDialog.tsx` (with what every dialog of a change shares), `write/AddInputDialog.tsx`, `write/PinDialog.tsx` (move a pin and remove an input), `write/InstructionsDialog.tsx`, `write/JobCard.tsx`, `Workspace.tsx`, `InputsPanel.tsx`, `tests/browser-write-ai.mjs` |
| `114178a` | The workspace test follows the live buttons; the three write-side browser files are registered in `tests/browser.mjs` |

What the window can do after them: make a project (New project…), add an input, harmonize again, move a pin (with Check for
updates), remove an input, edit the custom instructions, edit the details (name, author, repository, changelog) and the
decision records by hand, delete a project, and follow, cancel and dismiss an AI run on its card. **Install on harnesses…**
and **Review decisions…** stay disabled (*Coming with the Sync page*, *Coming with the review*; the runtime has no operation
that reviews a project's decisions). [docs/desktop.md](../desktop.md#changing-a-project) describes the page.

## What the tests are, and what they cannot prove

- `tests/project-write.test.ts` (Node, 31 tests as written): the request builders, the checks of the plugin id, the sources,
  the budget, the repository, the instructions and the records, the wording of the refusals, and the refusals of the fake
  service's write actions.
- `tests/browser-write-ai.mjs` (8 tests), `browser-write-edit.mjs` (6) and `browser-write-new.mjs` (11), written from the old
  Imago file's list (`git show 8f70786:apps/desktop/tests/browser-project-write.mjs`) and the plan: the dialogs against the
  fake service in headless Edge.
- The fake service (`tests/fake-transport.js`) repeats the runtime's rules by its own code (read from
  `crates/muro-desktop-runtime/src/project_jobs.rs` and `muro/project_work.py`), not by calling them. A difference between
  the fake and the real runtime is therefore not caught by any of these tests. A run in the fake ends by itself or when a test
  says so: no Claude Code runs behind it, and a fixture does not prove what an AI writes (AGENTS.md).

## What CI runs for it

`.github/workflows/tests.yml`, job `desktop` (Windows), on the push to `develop`. The steps that read this work:

| Step | Command | What it reads of this work |
| --- | --- | --- |
| Frontend unit tests | `npm ci`, then `npm test` | `project-write.test.ts` among the Node tests |
| Type check | `npx tsc --noEmit` | every new `.ts` and `.tsx` file |
| Frontend build | `npm run build` | the window builds with the new pages |
| Design rules (Sigrid) | `npx --no sigrid-check apps/desktop/src` | `continue-on-error`: it reports and does not block |
| Browser tests | `node apps/desktop/tests/browser.mjs` | five files, three of them new |
| Screenshots of the browser tests | `actions/upload-artifact` | the pixels the browser tests drew |

The steps Rust tests (`cargo test --locked -p muro-registry -p muro-desktop-runtime`) and Shell tests (`cargo test --locked
-p muro-desktop`) run too, over Rust this work did not change. The job `tests` (Python, `-m "not marionette"`) runs no
desktop code.

CI run: <to be filled by the controller>

## Not run

- No `cargo`, `npm`, `npx`, `node`, `tsc`, `vite`, test runner, `sigrid-check` or `imago-check` on this machine (owner's rule):
  the unit tests, the type check, the build and the browser tests of the six commits have not run at the time of writing, and
  no CI run had been read yet. The test files were written from the Sigrid sources (tag `v3.3.9`) and the plan, not from a run:
  a red there is first a wrong guess about a selector, a focus or a timing, and not necessarily a defect.
- No operation was run with a real Claude Code: the cost, the duration and the quality of a harmonization, an input added, a
  pin moved or a project made from this window are unknown. The runtime and the factory they call were tested on their own
  ([2026-11-21-projects-write-side.md](2026-11-21-projects-write-side.md)), never driven from this window.
- No Windows window: the page was not opened in the shell, the folder dialog (`pick_folder`) was never opened, and no
  screenshot of the new screens was looked at.
- `project_updates` was not run against real upstreams from this window.
- `sigrid-check` did not run: the new files were read by eye for literal colours and sizes, a `div` with `onClick` and
  `dangerouslySetInnerHTML`, and none was found.

## What CI will test first

Doubts the authors of the tasks left, to read first in a red run:

- Initial focus in Sigrid's drawer and dialog: the details drawer expects focus on the Name field without `autoFocus`; the new
  project drawer relies on `autoFocus` winning over the drawer's own focus; Remove expects focus on Cancel; the folder button
  and the New project button rely on `restoreFocusTo` and on a press that keeps focus in the field.
- Enter submitting through a footer button tied to its form with `form=`.
- A centred dialog opened from inside the left panel's sheet at 500 px (the Records test of that width).
- The selectors `[data-slot="sheet-content"]` and `getByRole('checkbox')`, written from the sources.
- The toast of the Add input test (it lasts 6 seconds) and the poll timing of the card.
- `tests/browser-workspace.mjs` was changed to follow the live buttons; its other assertions were not touched.

## The owner's first live checks, by hand

None of these has been done. Record each with the sample size, the cost, the duration and what it showed.

1. **A harmonization from the window, at a small budget.** The agent of the registry's settings must be Claude Code (the
   default; the Settings page that changes it is not in the window yet). On a copy of a small project (the project Muro ships
   may not be in the list: **Open project file…** adds one), open it, choose **Harmonize again…**, put a request in a few
   words, a budget of 1 USD or less and the default step, and start it. Look at the card (phase, time, log path), then at the
   end: the outcome notice, the version moved by the step, a new row in Runs, a changelog entry, the list read again. Do it a
   second time and press **Cancel** during the run: the card says it stopped and the file must be as it was.
2. **A new project from a small public repository.** **New project…**, a name and a folder (use **Choose folder…**, which has
   never been opened on a real window), one input that is an `https://` address of a small public repository whose license
   the factory accepts, a budget of 1 USD or less. The card shows above the list; when the run ends the project is listed;
   open it and look at its Inputs (the pin, the license, what it became). Installing it is not in the window: use the
   service's `install_project` from `muroctl` if the plugin is wanted on a harness.
3. **An edit by hand and a delete, on a copy of a project.** **Edit details…** (change the name, take the repository away),
   add, edit and delete a record, then **Delete…** on the copy. These call the factory offline and cost nothing: they show
   whether the window and the real `muro project edit` agree on the digest and on the file.
