# Desktop: three tabs, Sync, settings on change, first run, tray shell (2026-11-19)

What was built and checked for ADR-0028 (`docs/adr/ADR-0028-desktop-projects-and-sync.md`, the part about
sync and the shell; the `.mp` project file is not part of this work): the registry records a sync state and
takes `check`, `sync_now`, `apply` with `allow_blocked` and `plan` with `target_id`; the shell lives in the
notification area, starts with Windows and syncs from the background; the window is three tabs (Sync,
Activity, Settings) with a first run in place of them; settings are saved on change.

The work ran as eleven tasks on `develop` (the plan's ten and a later Task 11), was pushed (`fc559fb..84bf4a3`),
went through one whole-branch review (verdict: with fixes, no Critical) and then through one fix wave, the last
section of this record. Every command below was run on this machine (Windows 11, debug build of the
executable, Microsoft Edge for the browser tests) unless it says otherwise.

## Real and simulated, apart

| Kind | What | Proves | Does not prove |
|---|---|---|---|
| Real | `cargo test -p muro-registry -p muro-desktop-runtime` | the registry service and the runtime crate, against real folders and a real Windows Run key (a test value name, deleted after) | the interface |
| Real | `node apps/desktop/tests/native.mjs` | the new interface in the real WebView2 window, through the real Tauri `request` command, the real registry service and a real OpenCode profile in a temporary folder | an OpenCode agent loading the plugin; any other harness |
| Real | `node apps/desktop/tests/native-shell.mjs` | the shell: Start with Windows (Run value of the test's own name), close to the tray, `--background`, the worker, one running Muro per data directory | the tray menu; a real sign-in |
| Real | `muroctl request ...` on a temporary data directory (the request reference in `docs/desktop-cli.md`) | every command written in that document | |
| Simulated | `npm test` (126 tests) | the model, forms, sheets, pages and the request queue, as strings and functions in Node | any DOM |
| Simulated | `node apps/desktop/tests/browser.mjs` (4 files) | the interface in headless Edge, driven by Playwright, against `apps/desktop/tests/fake-transport.js`, a fake of the service that keeps its revision conflicts, blockers, `allow_blocked` and removal rules | the service: the fake had no registry lock and let Stop managing detach plugins silently; defects 1 and 2 below were found only on the real service |
| Simulated | `node apps/desktop/tests/screenshots.mjs` | the pictures of the README, from the fake's demo scenarios in headless Edge | how the window looks with WebView2's acrylic |

## Commands of every task and their results

Results of the tasks are the figures their reports gave at the time; the closing run below repeats the
ones that still matter on the final tree.

| Task | Commits | Commands and results |
|---|---|---|
| 1. Registry records the sync state; `check`, `plan` with `target_id`, `close_to_tray` | e5bd2d1, 11fc731 (ADR text 3fee654) | `cargo test -p muro-registry`: 22 service tests, 7 new. Reviewed: spec compliant, no Critical or Important. |
| 10. A plan with blockers applies what is ready | 979f5a9 | 30 service tests, 6 new; two of them reproduced the removal of a listed plugin's installed copy before the fix. Reviewed clean. |
| CI job `desktop` | abfb5ec | `Tests` workflow run 44598662957: jobs `tests` and `desktop` green (both crates on windows-latest, `npm test`). |
| 2. Start with Windows, `sync_now`; `apply` locks only the harnesses its plan changes | 80a581b, 795854a | `runtime.rs` 16 pass (10 new), `service.rs` 31 pass; no test value left in the Run key. |
| 4. The Sync page's state as functions | ceb9d15 | `npm test` 40 pass (24 new); `tsc` 7 errors in `app.ts` and `views.ts`, intended until Task 5. |
| 3. The shell: tray, close, background start | 666ef77, ebcd4db | runtime 29, registry 45 pass; `native-shell.mjs` passed 3 runs, failed on the baseline and under three deliberate breaks. |
| 5. Three tabs and the Sync page | 2f0c6a1 | `npm test` 53 pass, `tsc` clean, 17 browser tests, three full runs. |
| 11. One Muro, a Quit that waits, a careful repair | bf516d9 | runtime 41 pass; `native-shell.mjs` 4 runs; a second launch without the guard crashed with exit code 101; six deliberate mutations all caught. |
| 7. Settings saved on change, Activity | 59c376e, c1fb9ac | registry 49 pass; `browser-settings.mjs` passes; `npm test` 119 pass. |
| 8. The first run | 27d0f2e, e46203e, 23427cb, 638defb | `npm test` 120 pass; `browser-setup.mjs` 17 pass. |
| 6. Harness sheet, plugin dialog, plugins outside the list | fc559fb | `npm test` 121 pass; `browser-harness.mjs` 17, `browser-sync.mjs` 18. |
| 9. The real interface, documents, CI | 6eef201, 579bd3a, f4fc717, bca93d7, 5993b97, dc6857e, f92998d, 7f55d6e and this record | below. |

## Task 9: the new interface meets the real service

### Closing runs on the final tree

```
npx tsc --noEmit                                    exit 0
npm test                                            126 tests, 126 pass, 0 fail
npm run build                                       built, apps/desktop/dist (ignored by Git)
cargo test -p muro-registry -p muro-desktop-runtime registry 10 + 4 + 35 = 49 pass (1 + 3 ignored);
                                                    runtime 4 + 41 = 45 pass
cargo build -p muro-desktop-runtime --bins          ok
cargo build -p muro-desktop --features custom-protocol   ok (embeds the build above)
node apps/desktop/tests/browser.mjs                 PASS: 4 browser file(s)   (about 17 minutes on this machine)
node apps/desktop/tests/native.mjs                  status pass, 7 checks
node apps/desktop/tests/native-shell.mjs            status pass, 10 checks
node apps/desktop/tests/screenshots.mjs             11 pictures written to docs/assets/screenshots
python muro_build.py --manifest examples/marionette/sources.json --validate   OK: capabilities and ROUTER.md valid
```

`--validate` read the working tree, in which another session had uncommitted changes under
`examples/marionette/` and `tests/`; it says nothing about those changes and nothing in this work touches
them. The Python suite was not run (see below).

The seven checks of `native.mjs`, on the real executable with one sample: the closing run, which passed. Before it the flow
failed on defect 1 and passed once without step 7:

1. The first run picks OpenCode (Mukade found it in a temporary `XDG_CONFIG_HOME`), imports nothing, saves
   automatic sync off and the Run value of the test's own name.
2. A plugin with a prepared OpenCode build is added and is still there after a reload.
3. Check now shows "1 change ready to apply"; the profile is unchanged.
4. Apply all installs the plugin into `opencode.json`, which keeps its own setting; the table shows 1.0.0.
5. A second Check shows "Everything is in sync", Last check and the harness's checked time have moved, and
   Last sync has not.
6. A setting saved on change reaches the registry, the page agrees, and the recorded sync state stays
   current.
7. Stop managing takes the harness off its plugin and removes it; the profile keeps the installed plugin.

### Defects found by running the real service, and what was done

1. **Registry is busy.** `adopt` plans in the background after a save while the step that saved goes on:
   in the first run `save_target` ended at 20559 ms, `plan` started at 20561 and `scan` at 20563, and the
   service refused `scan` ("Registry is busy; wait for the running operation"). A fake transport has no
   lock. Fixed in `apps/desktop/src/queue.ts`: the page's requests go one at a time, in order; `discover`
   (Mukade, no registry lock) goes alone. Test first: `apps/desktop/tests/queue.test.ts` (5 tests). Cost:
   a request made during a long `check` now waits for it instead of failing, and so do `autostart` and
   `set_autostart`, which the shell answers without the registry lock.
2. **Stop managing always failed for a harness a plugin listed.** The service answers "Remove this target
   from its plugins first"; the page sent `remove_target` at once, and the fake detached the plugins itself.
   Found with `muroctl` while documenting. Fixed in `apps/desktop/src/pages/sync.ts` (`stopManaging`: save
   each plugin without the harness, then remove it); the fake now refuses like the service; test in
   `browser-sync.mjs` (a refusal keeps the harness and says how far it got) and step 7 of `native.mjs`.
3. **`adopt` replanned on the first settings save of a session.** With nothing checked, the null plan
   counted as another revision. `adopt(snapshot, {replan:false})` (Task 7's ruling); test first in
   `browser-settings.mjs`: a fresh session, one switch, no `plan` call.

Found and not fixed (larger than a small fix, reported):

4. **A window that has just opened says "Not checked yet" next to the times of the last check.** The
   strip's counts and the cells' changes come from a plan held in memory; `sync.pending` and
   `sync.revision` are recorded but the page does not read them (it uses `sync` for times only), so a
   reload after a sync showed `Not checked yet · checked today 00:15` in the app bar and the strip while
   the tray line, which reads the record, would say "In sync". ADR-0028 says the sync state is recorded,
   not recomputed; the page does not yet use it that way. Options: the page plans once when it opens and
   the record is current (one inventory scan per open), or the summary reads the record. Not changed here:
   it touches `model.ts`, the strip and the tests of Tasks 4 and 5.
5. On this machine the real discovery (Mukade) takes about 15 s and an `autostart` read about 2 s; the
   first run shows its busy line for that long.

Isolation note: with `USERPROFILE` or `HOME` moved to a temporary folder the real executable never opened
its WebView, so `native.mjs` puts the OpenCode profile under a temporary `XDG_CONFIG_HOME`, which Mukade
honours; the other harnesses of this computer are listed in the first run and left unticked.

### Commands run for the request reference (`docs/desktop-cli.md`)

All with `muroctl request <action> [--input <file>]` on a temporary data directory and a temporary
OpenCode folder. Results:

- `check`: `{snapshot, plan, errors}`; with a source folder that does not exist the plan was still made and
  `errors` held `{"plugin_id":"bad-source","message":"Source folder not found: ..."}`.
- `plan` with `{"target_id":"opencode-main"}`: one harness's operations; an unknown id: `Target not found`
  (exit 1).
- `sync_now` with `{"apply":false}`: `{"applied":0,"pending":1,"blockers":[],"errors":[]}` and
  `automation-status.json` said `Background check`, `complete`, `1 change waiting`; the profile unchanged.
- `apply` without `allow_blocked` on a plan with a blocker: `Plan has blockers; resolve them before
  applying` (exit 1); with `{"allow_blocked":true}`: the ready install ran and the result carried
  `left_out` with the blocker, and `sync.targets` showed the blocked harness unsynced.
- `sync_now` with `{"apply":true}` while a blocker remained: `applied 0`, `automation-status.json` said
  `Automatic sync`, `failed`, with the blocker as its message.
- `apply` with `"allow_blocked":"yes"`: `allow_blocked must be a boolean`.
- `autostart`: `Unknown registry action: autostart`: the shell answers it, not `muroctl`.
- `remove_target` while a plugin lists the harness: `Remove this target from its plugins first`.

### Documents

`docs/desktop.md` (pages, workflow, first run, runtime and storage, Theme, tests), `docs/desktop-cli.md`
(`check`, `sync_now`, `plan` with `target_id`, `apply` with `allow_blocked`, `autostart`, `set_autostart`,
`settings` with `close_to_tray`, `snapshot` with `sync`; the stale line about `recover_jobs` and
`automation_record`), `docs/adr/README.md` (a manual note for ADR-0028 outside the generated block),
ADR-0028 (five implementation choices made during execution), the README and its screenshots. The
screenshots were looked at one by one: Sync with changes (dark, light), Sync in sync, the review sheet,
the harness sheet, Adapt with AI, Settings (all five sections), Activity (running adaptation, a failed
check, an automatic sync) and the three steps of the first run. Old pictures that nothing references
(`classic`, `first-use`, `harnesses`, `plugins-dark`, `plugins-light`, `sync`) are deleted.
`marionette-guide.png` is Marionette's offline guide, not part of this interface, and was not regenerated
(it needs `MURO_GUIDE`).

### CI

`.github/workflows/tests.yml`, job `desktop`: after the unit tests, `npx tsc --noEmit`, `npm run build`
and `node apps/desktop/tests/browser.mjs` (Edge through Playwright's `msedge` channel). The plan was pushed
(`fc559fb..84bf4a3`) and the `Tests` workflow run 44696011567 on `84bf4a3` is green with every desktop step
(Rust tests, unit tests, type check, frontend build, browser tests); the browser tests took 3 min 18 s on the
runner against about 17 minutes in one run on this machine. The fix wave adds a step, *Shell check*
(`cargo check -p muro-desktop`), because nothing compiled the shell in CI.

## What was not run, and why

- **The full Python suite locally.** It takes about an hour here and runs on every push in the `Tests`
  workflow. Nothing in this work changes Python.
- **The new CI step on a runner.** The `Tests` workflow ran on `84bf4a3`, with the runner's Edge answering
  Playwright's `msedge` channel; the fix wave's own commits and its *Shell check* step were not pushed by it.
- **A real sign-in to Windows with the Run key set.** The native tests write a Run value of the test's own
  name, read it back and start the executable with `--background` themselves; Windows never started it.
- **The tray menu, clicked by hand** (Open Muro, Sync now, Pause automatic sync, Quit Muro), and the state
  line it shows on a real tray. The pure text is unit-tested in `tray.rs`; the native menu is not reachable.
- **The tray's Quit click, and the 60-second cut-off.** The gate is unit-tested with a fake sync. A close with
  `close_to_tray` off during a real sync, which takes the same quit path, is run by `native-shell.mjs` (fix wave).
- **Keyboard focus of the window raised by a second launch**, and a Muro started while another is quitting
  (it is swallowed without a sign).
- **Any harness other than the OpenCode fixture.** Claude Code, Codex, Pi and Hermes Agent installations
  were not read, written or synchronized; `native.mjs` shows them in the first run and leaves them unticked.
  Native `scan` of Codex and Hermes (through their command lines) was not seen live.
- **A source that is not a folder.** The native flow adds a local folder with a prepared build; no GitHub
  repository, no marketplace entry and no update policy `pinned` or `head` was resolved by the real window.
- **Adapt with AI on the real service**, a real adaptation job, its cancellation, and Reinstall.
- **A non-Windows build.** The off-Windows branches of `autostart.rs` and `single_instance.rs` were never
  compiled; CI builds the desktop crates on Windows only.
- **The release build and the portable package** (`build-release.bat`), the installer, and the windowed
  executable without a console. The native tests drove the debug build with the `custom-protocol` feature.
  `apps/desktop/src-tauri/resources/` was used as it was and not regenerated.
- **How the window looks with the real acrylic and title bar, and a screen reader.** The pictures come from
  headless Edge; keyboard behaviour was tested with Playwright.
- **A data directory shared by a development build and an installed copy** (they count as one Muro).

## Deferred minors of the ledger (`.superpowers/sdd/2026-11-19-desktop-shell-and-sync/progress.md`)

Not fixed, by ruling; each names where it lives.

- Task 1: a removed target keeps its times in `sync-status.json` (`sync_status.rs:63`, `service.rs`
  `remove_target`); a corrupt `sync-status.json` makes every action fail although it is derived state
  (`sync_status.rs:20`; fixed in the fix wave, F8: it reads as no record); a source starting with `~` is never expanded and reports "Source folder not found"
  (`sources.rs:131`); no test for `check` with an unknown or disabled `target_id` (`tests/service.rs:427`);
  `planned_targets` runs up to three times in one check (`service.rs:131,524,538`).
- Task 10: the two exclusive-sync tests apply a plan with zero operations (`tests/service.rs:686,709`); a
  plan file written before 979f5a9 can hold the removal of a blocked plugin and would run with
  `allow_blocked`.
- Task 2: the off-Windows branch of `autostart.rs` was never compiled.
- Task 3: two other messages in `service.rs` still quote JSON values.
- Task 5: apply progress is one spinner for all operations; the browser file takes about 100 s under a
  light load.
- Task 6: the no-harness state of the Sync strip may be unreachable now that the first run shows instead.
- Task 7: the activity log has no cap (fixed in the fix wave, F6: the last 500 events) and Activity draws every event at each render; a kept plan keeps its
  old id (safe only while every apply plans again); the running job card has no progress bar.
- Task 8: a failed `scan` is unit-tested only; a reload at step 2 is not tested in the browser; step 2 has
  no sticky footer.
- Task 11: a Muro launched while another is quitting is swallowed without a sign; with `close_to_tray` off,
  a close during a sync only hides the window and the process stays until the tray's Quit (fixed in the fix
  wave, F3); only `sync_now` is gated, so an apply (gated in the fix wave, F2), adapt or settings write started
  from the window can still be cut by Quit; the Run
  key is read two ways (registry API in `repair`, `reg.exe` elsewhere) and an unquoted Run value is never
  repaired.
- Task 9 (new): `autostart` and `set_autostart` wait behind a running `check` in the page's queue; the
  window's strip says "Not checked yet" after opening although a background check was recorded (defect 4;
  fixed in the fix wave, F1).

## The fix wave after the final review (2026-11-20)

One fixer, on `develop`, from `84bf4a3`, for the findings F1 to F8 of
`.superpowers/sdd/2026-11-19-desktop-shell-and-sync/fix-wave.md` (the final review's Important 1 to 6 and
minors, and the strip defect ruled before it). Commits: `5f95674` registry, `42a76fa` runtime and tray,
`c78394b` shell, `240b2b1` and `c29c62f` frontend, `22d0932` the shell's shown event, then the tests and
native checks, and the documents, CI and this record.

**The final local run was skipped on the owner's instruction, and CI is the evidence.** After the fix wave's
code and tests were written the owner asked for no further local test runs and no local builds (no
`browser.mjs`, `native.mjs`, `native-shell.mjs`, no full `cargo test` or `npm test`, no `npm run build`, no
shell build); only `npx tsc --noEmit` was kept, and it passes on the final tree. What follows separates what ran
before that instruction from what did not.

| Finding | Tests | Failed on `84bf4a3` | Green |
|---|---|---|---|
| F1 recorded check on open | `model.test.ts` (summary falls back to the record, another revision or none is not a check, a current plan wins, strip text, columns `unseen`); `browser-background.mjs` (recorded, recorded-ok, recorded-unseen) | 13 unit failures in all; browser: the strip stayed "Not checked yet" | `npm test` 135 pass; browser-background pass |
| F2 waiting, `status`, apply gated | registry `status_*` (2); runtime `a_request_waits_for_the_sync_in_progress_up_to_its_limit`, `a_request_that_finds_the_registry_busy_tries_again_until_it_is_free`, `a_request_during_a_held_registry_lock_succeeds_once_the_lock_is_released`; tray tests moved to `status`; `native-shell.mjs` 8a, 8c, 8d | registry: "Unknown registry action: status"; runtime: `wait_idle` and `retry_while_busy` did not exist (compile errors) | registry and runtime pass; `native-shell.mjs` section 8 written, never run to the end |
| F3 close with the setting off | `native-shell.mjs` 8e | not run | not run |
| F4 refresh and retry | `browser-background.mjs` (focus, 30 s with Playwright's clock, nothing under way, retry once and only once, the shell's shown event); `native-shell.mjs` 5a | all failed on the `84bf4a3` sources; `native-shell.mjs` 5a failed on the first real run (a window shown from the tray gives the page no focus event), so the shell now emits `muro-shown` | browser-background pass before the shown-event test was added; that test and 5a on the fixed shell were not run |
| F5 unresolved sources | registry `check_records_the_sources_it_could_not_resolve...`; runtime `sync_now_records_the_sources_it_could_not_check_as_a_failure` and the tray test; model tests; browser recorded-errors; `native-shell.mjs` 8b | registry: `null` instead of `1`; runtime: `complete` instead of `failed`; tray: "Not checked yet" | registry, runtime, unit, browser pass; 8b not run |
| F6 activity log | registry `the_activity_log_keeps_the_last_500_events`; `settings-activity.test.ts` Sync filter | registry: 601 events instead of 500; unit failed | pass |
| F7 adopt | registry `a_plugin_added_from_what_is_installed...`, `an_adopted_installation_that_differs...`, `an_adoption_the_installation_does_not_support...`, `installed_digest`; `setup.test.ts` Finish sends `adopt`; `model.test.ts` `listing`; browser Add to my list; `native.mjs` step 5b | registry: the plan held an install and a removal, and an unknown `adopt` was accepted; unit and browser failed | registry, unit, browser pass; `native.mjs` passed once on the real executable, step 5b included |
| F8 smaller ones | registry `a_corrupt_sync_status_reads_as_no_record...`; CI step *Shell check*; `docs/desktop-cli.md`; repair on a thread (the native test now waits for the repaired value) | registry: "Invalid JSON: ...sync-status.json" | registry pass; the CI step and the thread were not run |

Commands that ran before the instruction, with their results:

- `cargo test -p muro-registry`: 11 + 4 + 43 pass, 3 ignored (the native round trips). RED run on the
  `84bf4a3` sources: 9 of the 10 targeted tests failed.
- `cargo test -p muro-desktop-runtime`: 4 + 46 pass. RED run: 6 of the 16 targeted tests failed, and the three
  gate and retry tests did not compile.
- `npm test`: 135 pass (13 of the new or changed tests failed before the code).
- `npx tsc --noEmit`: clean, also after the last source edit.
- `node apps/desktop/tests/browser-background.mjs`: 9 tests, all failed on the `84bf4a3` sources and all passed
  on the fixed ones; `node apps/desktop/tests/browser.mjs`: 5 files pass with the fake transport changes.
- `npm run build` and `cargo build -p muro-desktop --features custom-protocol` built the executable of the
  native runs, before the shown event; `node apps/desktop/tests/native.mjs` passed on it (the new check
  included); `node apps/desktop/tests/native-shell.mjs` failed at 5a on that build, the shown event was added
  and the rebuilt run was stopped on the owner's instruction.

Not run, because of the instruction: any build after the shown event (the shell, the frontend, the runtime
tools); `cargo check -p muro-desktop` as the new CI step, whose empty `resources` folder was reasoned from
`tauri-build`, which refuses a missing one, and not tried on a clean checkout; `native-shell.mjs` sections 5a (on
the shown event) and 8a to 8e (a launch and a request while the registry is held, the worker's failed run for a
source that never answers, a request that waits past 15 s for a sync, a close with the setting off in the middle
of a sync); the shown-event test of `browser-background.mjs`; the final full run of every command of the fix
wave. Section 8 uses a local server that hangs up after a few seconds as the slow source; it was never seen
to run, and its timings (6 s and 18 s) are guesses about `git clone` against such a server. The tray's menu,
the 60-second quit cut-off and a real sign-in are still not run.

Real and simulated, apart: the registry and runtime tests, `native.mjs` and the first `native-shell.mjs` run are
real (real folders, the real service, the real executable); `npm test`, `browser-background.mjs` and
`browser.mjs` are simulated (a fake transport with no lock, whose `behind` helper stands in for the worker).
