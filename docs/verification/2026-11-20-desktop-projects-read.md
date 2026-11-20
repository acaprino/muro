# Desktop: Projects, the `.mp` file, the simulator and the AI engine (2026-11-20)

What was built and checked for ADR-0028 (`docs/adr/ADR-0028-desktop-projects-and-sync.md`), decisions 1 to 5 and 10 to 12, the read side: a project is one `.mp` zip
that the factory packs, unpacks and reads (`muro project pack`, `unpack`, `info`); the desktop has a Projects tab (the list, the project page with its four steps:
Inputs, Harmonize, Graph & simulator, Install); Marionette ships as the default project; the simulator classifies a free-text request through a coding agent over MCP
(Claude Code or Codex) or an OpenAI-compatible API, as Settings → AI says. Writing a project (new project, harmonize, add an input, move a pin, edit a record) is plan 3.

The work ran as ten tasks on `develop` (the plan's nine, then this one) plus six fixes found by the implementers and the first CI runs. The reviews are the controller's and
are not recorded here. Local runs were the type check, `npm test` and single targeted tests: by the owner's rule (2026-11-20) the full suites, the browser files, the builds
and the shell run in CI, and the browser runs below are the exception the controller allowed for the last fix (R6): two files, run once before and once after. The machine
is Windows 11 with Microsoft Edge.

## Real and simulated, apart

| Kind | What | Proves | Does not prove |
|---|---|---|---|
| Real (CI, `windows-latest`) | `cargo test -p muro-registry -p muro-desktop-runtime`, run 44735186099: registry 14 + 4 + 14 + 46 passed, runtime 5 (lib) + 25 (`projects`) + 18 (`simulate`) + 1 (`real_factory`) + 51 passed | the list and the AI settings of the registry; the runtime's `projects`, `install_project`, `simulate`, `cancel_simulation`, `env_present` and the default project against real folders; **`real_factory`: a real `.mp` packed by the real Python factory, listed, summarized with the file's SHA-256, read in full, installed on an OpenCode target in a temporary folder and planned with no blocker, the file replaced (a blocker), installed again (clear), and a simulation through a local HTTP endpoint (the key reached it as an `Authorization` header from the environment)** | a harness or a real model; an apply to a real harness |
| Real (CI) | `cargo check -p muro-desktop` (the "Shell check" step), same run | the shell compiles with `tauri-plugin-dialog` 2.8 and its `pick_file` answer | that the dialog opens, that Explorer opens a folder |
| Real (CI, `ubuntu-latest`) | `python -m pytest -q` (860 passed, 16 skipped), `muro_build.py --validate`, `--check-sources` (against the real pinned remotes: "all sources and plugin identity valid") and `--build`, same run | the factory: the `.mp` container, `project info` and its guide data model, the simulator's two halves, the key setting as a variable name, the Marionette project files; Marionette still validates, its sources check and it builds | the Marionette project packed with its 16 sources (see below) |
| Real, local (Task 2) | the Marionette `GUIDE.html` built before and after the extraction of `guide_data`, compared | the extraction changed no byte of the guide | |
| Simulated | `npm test` (329 passed in CI at 331b617; 336 at the end of the fixes, locally) | the model, forms, sheets, Settings, the Projects list and page, the Harmonize views, the graph and the simulator as strings and functions in Node, against `fake-transport.js` | any DOM, the service |
| Simulated | `node apps/desktop/tests/browser.mjs` (6 files), headless Edge against `fake-transport.js`, a fake of the service | the interface: the page's markup, focus, keyboard, no sideways scroll at 760 px, the light theme, what survives a reload | the service; the real shell |
| Simulated | the runtime's `projects` tests use a stand-in factory; the `simulate` tests use stand-in processes and streams written to Claude Code's documented stream-json shape | the arguments given to each harness, the readers of their output, cancellation by run name (a 60-second sleep ended in under 10) | the harnesses' real output |
| Simulated | the API engine against a local HTTP endpoint (the `simulate` tests and `real_factory`) | the request, the key's route (environment only, never argument, setting or file), the answer's reading | any real provider |

## The tasks, their commits and their figures

Figures are those the implementers reported when they finished; the CI section below says what ran on the pushed tree.

| Task | Commits | What | Figures |
|---|---|---|---|
| 1 | `d881035` | `muro/project.py`: pack, unpack (hostile input refused before anything is written), `info`, the sources cache | `tests/test_project_file.py` 48 passed, 1 skipped (exec bit, Windows) |
| 2 | `68efea2` | `muro project info`: everything the project page shows, from the guide's one data model (`guide_data`); license and notice files of every input travel | `test_project_file.py` 71 passed, 1 skipped; Marionette `GUIDE.html` byte-identical before and after |
| 3 | `b5bcab7` | `muro project simulate`, `simulate-prepare`, `simulate-check`; MCP tools `simulate_prepare` and `simulate_check` | `tests/test_simulate.py` 23 passed |
| 4 | `dbd2ce4`, `967ecbb`, `6def39d` | Marionette as the default project (`project.json`, `records.json`, `history.json`, `CHANGELOG.md`), staged by `scripts/desktop_resources.py`; `pack` writes the version of `sources.json` | `test_marionette_project.py` 14 passed, `test_project_file.py` 75; `--validate` OK; 20 records = 20 bullets of `ROUTER.md`, checked once by hand |
| 5 | `02d1073`, `c9f30e4`, `36e9cb6`, `4cf5707`, `0ff36c0`, `331b617` | `project info --summary`; `settings.ai` and `registry.projects` in the registry; the runtime's project, simulation and engine actions; the shell's `pick_file` | Python: summary 4, `test_agent_key.py` 22; Rust (local, targeted): registry `projects` 14, `service` 46; runtime `projects` 25, `simulate` 18, `real_factory` 1, lib 5 |
| 6 | `aaf33d8` | the Projects tab, the list, the project page, steps Inputs and Install | `projects.test.ts` 59; `npm test` 200; `browser-projects.mjs` 15 written |
| 7 | `524b7aa` | step Harmonize: the state strip and four read-only views | `project-harmonize.test.ts` 38; `npm test` 216 of 217 at the time (the one failure was Task 9's work in progress) |
| 8 | `02f4c0b`, `2b24186` | step Graph & simulator: the decision graph as inline SVG, documented examples, free-text requests with a run name and Cancel | `project-graph.test.ts` 71; `npm test` 329; 13 browser tests written |
| 9 | `70ab405` | Settings, section AI: the engine, its fields checked where they are typed, the variable that holds the key | `settings-activity.test.ts` 42; `npm test` 326 |
| 10 | `80eac98` (R1, R2), `0245533` (R3, R4, R5), `f0bb333` (R6), then the documents and this record | fixes R1 to R6, the documents, this record | `npm test` 336, `npx tsc --noEmit` clean, the two browser files green locally |

## The fixes before the review (R1 to R6)

Each was written test first; RED is the failure of the new test on the tree before the fix.

- **R1, a simulation freezes the window.** `app.ts` queued every request but `discover`, so while a free-text simulation ran (tens of seconds with a harness) nothing
  else of the window started and `cancel_simulation` waited behind the run it should stop. The one list is now `ALONE = ['discover', 'simulate', 'cancel_simulation']` in
  `apps/desktop/src/queue.ts`. Tests (`queue.test.ts`): with a `simulate` pending a `snapshot` is answered, and `cancel_simulation` is answered before the simulation; a
  request that takes the registry lock still waits for the one before it. RED: `actual: ['simulate']`, expected the three requests on their way. Checked in the Rust: the
  runtime serves each request on its own worker (`cli.rs`, `serve`); `simulate` reads the registry for a moment and holds no lock while the AI works; the shell lets
  `cancel_simulation` past its sync gate (`WITHOUT_THE_LOCK`) and holds a `simulate` back only while a sync runs.
- **R2, text typed in the request box is not routed.** `route()` handed only inputs and selects to the page modules, so the text area never reached its step and the
  simulator read it from the box when the person acted (and from a `keydown` timer). `textBoxOf` (`apps/desktop/src/context.ts`) is now the one place that says which
  controls the modules hear (inputs, selects, text areas), `TextBox` the one type of their hooks, the caret is restored for a text area too, and `graph.ts` lost its
  workaround (`keep` and `keydown`). Tests (`project-graph.test.ts`, with stand-in classes for the three globals in Node): a text area is heard, a button is not; a paste
  reaches the step, survives a change of step and back, and is the request sent. RED: `textBoxOf` answered null for the text area and the step still had a `keydown`.
  Browser (`browser-projects.mjs`): `fill` (an `input` event, no key, as a paste) then Install and back keeps the text, and it is the request sent.
- **R3, "Adapt with AI" ignores the AI settings.** The dialog read the old `agent` setting, offered its own budget (2) and named Claude Code whatever Settings said.
  `engineOf(settings)` (`apps/desktop/src/model.ts`, with the readers `obj`, `text` and `amount` it needs, moved there from `graph-model.ts`) is now the one reading of
  `registry.settings.ai`, used by the simulator and by the dialog, which takes the harness and the starting budget from it and, when the engine is the API, says
  "Adapting a plugin needs a coding agent on this computer: <harness>". The request carries that harness as `agent`. Tests (`forms.test.ts`): each engine, a service with
  no `ai` yet (its agent, a budget of 2), a budget of 0 not offered. RED: the dialog still said Claude Code under Codex settings.
- **R4, one copy of "Harmonized".** The word was a private constant in `pages/projects.ts` and another in `pages/project/harmonize.ts`; `STATE` (label and tone) now lives
  in `pages/project/state.ts`. Test (`project-harmonize.test.ts`): change `STATE` and the page's head, its tab and the strip all say the new word. RED: the head did not.
- **R5, the page's fallback for a project's targets.** `install_project` sets the distributions and the plugin's targets (Task 5), so the Install step no longer saves the
  targets itself; a snapshot that shows the harness is not among them is an error in the banner, not a second request. Tests (`projects.test.ts`): one `install_project`
  and one `snapshot`; a runtime that leaves the target out (`installLeavesTargets` in the fake) is an error and no `save_plugin`. RED: `save_plugin` was sent. The fake now
  models the real runtime (it assigns the targets by default); its old `installAssigns` flag is gone.
- **R6, CI red on `develop` at 331b617** (run 44735186099, job `desktop`, step "Browser tests"; the other three browser files passed). Two causes, both in the tests, not in
  the page:
  1. `browser-projects.mjs`: a test still waited for `getByText('Coming in this version')`, the placeholder Tasks 7 and 8 replaced. It now asserts the step's real content:
     the heading "Simulate a request", the graph, the request box, and no placeholder.
  2. `browser-settings.mjs`: `useEngine` clicked the label's text, `getByText('OpenAI-compatible API')`. The segmented control lays its radio over its label
     (`.seg input{position:absolute;inset:0;opacity:0}`), so Playwright reports the radio as intercepting the click on the span and waits until the timeout. The page is
     right: a person's click on the label lands on the radio, which is what the new test does (a real mouse click at the radio's centre, `force` only skipping Playwright's
     check that nothing covers the target), and the keyboard moves the group in the section's other test. Every other file clicks or checks the radio with `force`. It now
     clicks the radio.
  Both failures were reproduced locally first (the same messages as in CI), then the fixed files were run: see "Browser runs for R6".

## Documents

`docs/desktop.md` (four tabs; Projects: what a `.mp` is, where projects live, the default project, the page and its steps; the simulator and its engines with what each
costs; the queue and the shell's gate; the verification list), `docs/desktop-cli.md` (the four jobs; `save_projects`; what runs beside what), `docs/cli.md` (a how-to for a
project file), `README.md` (four tabs, one paragraph on Projects, Settings → AI), `docs/adr/ADR-0028-desktop-projects-and-sync.md` (a labelled amendment for plan 2, which
replaces two sentences of the implementation choices), `apps/desktop/tests/screenshots.mjs` (it now also captures the Projects list, Inputs, the graph with an example lit
and a free-text answer: `projects.png`, `project-inputs.png`, `project-graph.png`, `project-simulation.png`).
`.github/workflows/tests.yml` needed nothing: `pytest` takes every `tests/*.py`, `npm test` every `apps/desktop/tests/*.test.ts`, `browser.mjs` every `browser-*.mjs`, and
the Rust step runs the runtime's tests, `real_factory` included.

**Screenshots.** Not regenerated: no browser was run for them (owner instruction), and the images in the README are those of the previous plan. They predate the Projects tab:
the README shows no image of a project page yet, and the Settings picture still shows the section as "AI adaptation" (its alt text says so, as it describes that picture).
`node apps/desktop/tests/screenshots.mjs` makes the new ones; adding a picture of a project page to the README is the step after it has been run and looked at.

## CI

`gh run list --repo acaprino/muro --branch develop`, the runs of this plan's commits:

| Run | Commit | Result |
|---|---|---|
| 44718724402 | Task 1 | success |
| 44721684675 | Task 3 | cancelled (a later push) |
| 44722254641 | Task 2 | failure: `tests` job passed; `desktop` job passed Rust, frontend, type check, build and shell check, then failed `browser-setup.mjs` (`#setup-title` "Which coding agents does Muro manage?" not visible). The same file passed in every later run; not investigated further (another session's work was in the tree at that time) |
| 44725953183 | Task 4 (`6def39d`) | cancelled (a later push) |
| 44726550822 | Task 6 | success (all steps, `browser-projects.mjs` included) |
| 44730887247 | Task 9 | cancelled (a later push) |
| 44731977535 | Task 8 | failure: `browser-projects.mjs` ("Coming in this version") and `browser-settings.mjs` (the engine radio); everything before the browser step passed |
| 44735186099 | `331b617` | failure: the same two files, the rest green (Rust tests, `npm test` 329, type check, frontend build, shell check, and the Python job with `--validate`, `--check-sources` and `--build`) |

The runs of the commits of Task 10 are not read here: the controller pushes `develop` and reads them. R6 is the fix for the last two failures; its local runs are below.

## Browser runs for R6 (local, the controller's exception)

`node apps/desktop/tests/browser-projects.mjs` and `browser-settings.mjs`, each with its own `MURO_UI_PORT`, headless Edge, against the fake transport.

| File | Before the fix | After the fix |
|---|---|---|
| `browser-projects.mjs` | `locator.waitFor: Timeout` on `getByText('Coming in this version')`, as in CI | PASS, exit 0: all 39 tests, among them the new ones for a paste into the request box and for a runtime that leaves the target out |
| `browser-settings.mjs` | `locator.click: Timeout 30000ms exceeded` on `getByRole('radiogroup', { name: 'Use' }).getByText('OpenAI-compatible API')`, `<input value="api" type="radio" name="ai_engine"> intercepts pointer events`, as in CI | PASS, exit 0: all 29 tests, among them the seven AI ones |

A file stops at its first uncaught failure, so the tests after it had not run since the tree changed under them, and some had never run at all: in `browser-projects.mjs` the
failing test is the fifth of 39, so the 34 after it did not run in CI at 331b617, and the Harmonize section (Task 7) and the graph and simulator section (Task 8) had never run
anywhere; in `browser-settings.mjs` the five AI tests after the failing one (Task 9) had never run. They all pass now, with no change to the page: the first complete run of
the browser tests of Tasks 7, 8 and 9 found nothing to fix in the page. The runs
wrote screenshots to `apps/desktop/tests/artifacts/` (tracked, old files from the previous plan): they were restored and the new ones removed, nothing of them is committed.
The other four files (`browser-background`, `browser-harness`, `browser-setup`, `browser-sync`) were not run here: they passed in CI at 331b617, and `browser-harness.mjs`
changed after it for R3 (the Adapt dialog now starts from the budget of Settings, 0.5 in the fake, not 2), which no browser has seen yet.

## What was not run

- **A free-text simulation through a real Claude Code, a real Codex or a real API.** No real model, harness or provider answered anything. The command lines were checked
  against each tool's own help (`claude --help` 2.1.327, `codex exec --help` and `codex mcp add --help` 0.169.0), not run. The readers of the output were written to the
  documented stream-json shape (`tool_use`, `tool_result`, `result` with `total_cost_usd`), not to a captured transcript: if the real stream differs, the reader falls
  back to the model's relay (marked `relayed: true`) only when the tool was called, and otherwise reports an error. A live run of each engine is the first thing to do.
- **Whether Codex runs an MCP tool in `exec` without an approval prompt** is unverified. `-s read-only` is given; if Codex asks for approval of the tool call, the
  simulation will not complete.
- **Claude Code with `--setting-sources project,local`** is a decision (the owner's own plugins load about 114,000 tokens a turn and cost far more than the 0.5 USD
  budget): a provider configured only in user settings is lost for that call. Never run live.
- **The default project packed with the 16 real sources** by `scripts/desktop_resources.py` (it builds a fresh release of `examples/marionette` and runs `muro project
  pack`, which fetches every input at its pin: the network, twice for an https source on a cache miss). The Marionette project's own files and the packing are tested with
  fixtures and a hand-made cache; `--check-sources` fetches the sources in CI but `pack` was not run on them. So the real size of `marionette.mp`, the time of `projects`
  with it and the Inputs, History and Prompts pages over its real content were not seen.
- **The shell with `tauri-plugin-dialog` run.** Only `cargo check -p muro-desktop` ran (CI, passed). The native open-file dialog was never opened; a project opened from
  another folder through it, `open_project` from that path, **Open folder** (Explorer) and the filter `Muro project (*.mp)` are untested live. `native.mjs` and
  `native-shell.mjs` were not run for this plan.
- **The browser files of Tasks 6 to 9 in CI after the fixes.** They were written and checked with `node --check`, ran in CI only as far as their first failure, and ran in
  full only in the two local runs above (`browser-projects.mjs` and `browser-settings.mjs`). Their run in CI after R6 is the controller's to read. They run against the
  fake, not the service. `browser-harness.mjs` was edited for R3 and not run (see above). `screenshots.mjs` was not run, so its new block has not been seen working; its
  selectors are those of the browser tests that passed.
- **The Projects tab over the real service.** `native.mjs` (the interface on the real WebView2 window, the real `request` command and registry) has no step for Projects,
  so no click of the project page ever reached the real runtime. The two meet only in the runtime's own tests (`real_factory`) and in the contract the fake copies.
- **Installing a project's plugin on a real harness.** `real_factory` installs on an OpenCode target in a temporary folder and plans; it does not apply. The runtime tests
  use `pi` and `opencode` targets only, because a Claude Code or Codex inventory runs those harnesses' own commands (slow, environment-dependent: they collided when run in
  parallel). `install_project` assigns every enabled target of a harness kind, while the page's switch is per target: with two targets of one kind, one switch turns both on.
- **Adapt with AI with Codex chosen in Settings → AI.** The dialog then names Codex, and the runtime refuses ("Budgeted AI adaptation currently requires Claude Code").
  Not run.
- **Cancellation of a real harness's process tree.** Tested with a sleeping stand-in process and a local endpoint, not with `claude` or `codex`.
- **`cfg(not(windows))` branches** of `exec.rs` and `open_in_file_manager` were not compiled.
- **The Python suite, the Rust tests and the shell build on the developer machine.** By the owner's rule they run in CI; the results above are CI's.
- **The first-run, background, sync and harness browser files after the fixes of this task** passed in CI at 331b617, before them (R2 changes which events every page hears,
  R3 changes the Adapt dialog); none ran again.

## Deferred minors of the ledger (`.superpowers/sdd/2026-11-20-desktop-projects-read/progress.md`)

- A poisoned sources cache would poison `inputs/` (the cache is the user's own data folder); an https source is fetched twice on a cache miss, as `build` does (Task 1).
- A sources cache filled before `68efea2` lacks the Apache `NOTICE` and is trusted: delete it to fetch again (Task 2, documented in `docs/cli.md`).
- The History view stops at the last recorded run while the plugin version is newer, until a release adds its run (Task 4).
- The Harmonize mockup's *Files of the run* column is left out; a record by Muro that binds reads *By Muro · binding* (Task 7).
- A key made only of letters, digits and underscores passes the key-name rule (real provider keys carry hyphens); the key's status is kept in module state of `settings.ts` (Task 9).
- A missing project file stays listed with its error and has no remove action in this plan (Task 6).
- Each `projects` call costs one factory run per listed project (0.3 to 0.5 s each) until a cache of summaries by digest is added (Task 5).
- `install_project` is per harness kind and the page's switch per target (see above).

## Fix wave after the final review (2026-11-20, from 34eaeb4)

One fixer, the findings of the final review; the lines above that this wave made false (the per-kind `install_project`, no remove action, the key rule, the Codex
dialog, the relayed result, an unstamped sources cache) describe the state at 34eaeb4. Commits: `5d6c54d` (factory), `38d31fb` (registry), `09a9c6d` and `716da46` (runtime),
`51d7a88` (frontend), `153a8e3` (CI), then the documents.

What changed, finding by finding (each has a test that failed on 34eaeb4: the Python and the frontend ones ran against the unfixed sources and failed, the Rust ones
do not compile there because the functions they call did not exist):
- **C1.** `muro mcp --tools a,b` serves, lists and runs only the named tools and refuses an unknown name at start (`tests/test_simulate.py`). The runtime starts the
  server with `--tools simulate_prepare,simulate_check` for both harnesses, and Codex also gets `-c mcp_servers.muro.enabled_tools=[...]`: the key is not in `codex exec
  --help` or `codex mcp --help`, it is the field `codex mcp get muro --json -c mcp_servers.muro.enabled_tools=[...]` printed on 0.169.0 (`crates/muro-desktop-runtime/tests/simulate.rs`).
  The two simulate tools still take a `manifest` or `project` argument from the agent: they read a package folder and print its catalog, nothing else.
- **I1.** The key variable is `^[A-Z_][A-Z0-9_]{0,63}$` in `muro/agent.py`, `ai.rs` and `settings.ts`, tested with `gsk_abc123`, `hf_xyz` and a 40-character alphanumeric.
- **I2.** The runtime prepares the context (`simulate-prepare`), takes the answer the harness ends with and shows `simulate-check` of the two; `relayed` is gone and no
  answer is "The agent gave no answer". The Rust tests also run the real factory through `prepared_context` and `judge` (`real_factory`).
- **I3.** A sources-cache entry carries a stamp (`<id>/<commit>.stamp`) and is fetched again when it differs or is missing; the stamp also covers `license`.
- **I4.** `info` refuses a member over 16 MiB and 256 MiB in all; a refused file leaves no unpack; the cache keeps only listed files' and installed builds' unpacks; staging
  and simulation folders older than a day go at start.
- **I5.** `muro project verify` and `pack` refuse a release whose plugin slug, version or capability ids are not the package's; `install_project` runs it.
- **I6.** The `tests` job packs the real Marionette with the release it built and prints the size and the time of `info --summary`. **Not yet measured:** CI has not run it.
- **I7.** `remove_project`, the update of the shipped project while the copy is still the one Muro made (the mark holds its digest), and `included` from the runtime.
- **Ruling 1.** `install_project {id, targets}`; **Ruling 2.** Adapt with AI with Codex says what it needs and cannot start, and the AI section line says so.
- **Minors.** Windows device names and forbidden or control characters in `.mp` member names; a stack token that is not text is an invalid context; the harness runs without the
  key's variable; the API scheme is compared in any case (the Rust side already did, through the `url` crate: its test passes on 34eaeb4 too); a stale build is shown on
  the Install step; `tests/test_marionette_project.py` no longer fails on a removed id or an edited note.

Ran locally: the Python tests of `test_project_file`, `test_simulate`, `test_agent_key`, `test_agentic`, `test_cli` and `test_marionette_project`; `cargo test` of
`muro-registry` and of `muro-desktop-runtime` (`projects`, `simulate`, `real_factory`, the library tests); `npx tsc --noEmit` and `npm test` (349 passing) before the owner
asked for no more local test runs.

Not run: any harness (no `claude` or `codex` was started), the browser files (`browser-projects.mjs`, `browser-harness.mjs`, `browser-settings.mjs` were edited, three new browser
tests written, none run), `screenshots.mjs`, the shell build, the full Python suite, a live Muro with the project cache sweeping at start, and the CI pack step. Concerns: a stored
`api_key_env` in lowercase (saved before this wave) is refused by every later save of the settings until it is renamed; the default project of a data directory that already holds
the empty mark of 34eaeb4 is never updated (an empty mark records nothing).
