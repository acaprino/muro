> Taken over on 2026-11-23 from the side branch `claude/busy-pascal-a74l79`, as it was written there (its number was ADR-0030; it is ADR-0032 here). The runs below are that branch's, on its own base: nothing of this was run again on `develop` yet, and the pages it lists (`write.ts`, the Inputs, Harmonize and project pages) are not in the React window.

# Projects, write side: verification of 2026-11-21 (ADR-0032)

What was built: the factory commands `muro project new`, `edit` and `commit`
(`muro/project_work.py`) and the `instructions` key of `muro project info`; the
runtime actions `create_project`, `project_job` (harmonize, add_input,
remove_input, move_pin, instructions), `edit_project`, `delete_project` and
`project_updates` (`crates/muro-desktop-runtime/src/project_jobs.rs`); the
shell's `pick_folder`; and the pages that use them
(`apps/desktop/src/pages/project/write.ts` and the Inputs, Harmonize and project
pages).

## Run, and where

| What | Where | Result |
| --- | --- | --- |
| `python -m pytest -q tests/test_project_work.py tests/test_project_file.py tests/test_cli.py tests/test_marionette_project.py` | this container | 216 passed |
| `python muro_build.py --manifest examples/marionette/sources.json --validate` | this container | OK |
| `npx tsc --noEmit`, `npm test`, `npm run build` | this container | clean; 371 passed; built |
| `node apps/desktop/tests/browser.mjs` with `MURO_BROWSER_PATH` set to Playwright's Chromium (no Edge here) | this container | 8 browser files passed, among them the new `browser-project-write.mjs` (10 tests) |
| `cargo test -p muro-registry -p muro-desktop-runtime`, the shell tests, the full Python suite, validate, check-sources, build and the pack of Marionette | GitHub Actions, `Tests` on `claude/busy-pascal-a74l79` | first push: everything passed but one new Rust test, whose fixture put the listed project's file in the folder the new one was asked for (the earlier "already exists" refusal answered first); the test was fixed. The result of the push that carries the fix is to be read in that run |

`cargo` was not run in this container (AGENTS.md: Rust is built and tested on
GitHub only); `rustfmt --check` was used only to parse the new files.

## What the tests prove

- Factory (real `build_release`, real `pack`, fixture package and a local Git
  upstream): a new project is committed with its run, pins, changelog and
  release, and `verify` accepts it; a change moves the version by its step,
  records the run, lists the mechanical differences under the AI's summary and
  keeps the old changelog below; a file that changed since the checkout, a
  changed plugin id and a failing build leave the file byte for byte as it was;
  an edit of the details, records and changelog repacks without fetching any
  source and keeps the release; malformed records are refused.
- Runtime (stand-in factory): every refusal before a paid run (agent, id,
  folder, existing file, inputs, budget, repository, id already listed), a
  change on a stale digest, the exact `project edit` command line, the
  repository taken away with `null`, delete (the file goes, the shipped project
  cannot be deleted), the update report read whatever the exit code, and unit
  tests of the prompt and of each operation's wording and checks.
- Interface (fake service that keeps the runtime's rules): New project
  (validation, the id following the name, the folder dialog, the payload, the
  run card, the project listed when the run ends), Codex refused, Edit details,
  Harmonize again (no change offered while the run goes, the project read again
  after), a failed run said on the page, Check for updates and Move pin, Add and
  Remove input, the instructions sheet (only the files that changed are sent),
  records added, edited and deleted on the digest the last edit left, Delete
  project.

## Not run

- No operation was run with a real Claude Code: the quality of an intake or a
  harmonization made from the desktop, its cost and its duration are unknown. A
  fixture does not prove AI reasoning (AGENTS.md).
- The desktop app was not started on Windows; the folder dialog of the shell
  was compiled in CI, never opened.
- `project_updates` was not run against real upstreams from the desktop
  (`muro baseline` itself is tested in the Python suite).
