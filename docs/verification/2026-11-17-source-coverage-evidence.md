# Factory: source coverage evidence, the omission gate and declared media — 2026-11-17

## Status and authorization

The owner reported a real Marionette session that built a showcase website by
hand and rejected the result ("marionette ha tutto!", "ma è un problema di muro
allora"), then approved this order of work: evidence at intake, a gate, a new
intake of taste-skill ("ok"). Told that the gate refused the source's images by
extension, the owner asked "ma come può averle taste skill allora se non si
potrebbero usare?" and then said "fai in modo che non accada mai più questa
perdita di tempo". This record covers the factory: the evidence (ADR-0026), the
gate (ADR-0026), declared media (ADR-0027), the batched read, the helper check
and the hook timeout (ADR-0016 amendment). The package work is in
`2026-11-17-taste-skill-whole-intake.md`.

Everything is in the working tree on `develop`. Nothing was committed, pushed,
released, installed or version-bumped.

## What was found (before any change)

Read in the consumer project's state folder, `.marionette/archive/7f58…/`:

- First run, classification: one capability, `visual-direction`.
- Its recorded `constraints`: "the kit (assets/) is not packaged, so the page
  has its own CSS and JS written to the references".
- Its check `automated_gate_disclosed`: `pass`, evidence "copy-lint,
  consistency, layout check, perf and the finish gate are not packaged and were
  not run; the checklist was read by eye".

Read in the package: `examples/marionette/capabilities/visual-direction.md`
orders exactly that (step 5, "Not packaged from the source", the check's
definition, "Open intake gap"). `sources.json` selects 11 paths of taste-skill;
the selection is unchanged since commit `2e0fa68` (2026-11-09).

Read upstream at the pin (Leonxlnx/taste-skill `f6b76575`, v2.5.1, GitHub tree
API): 1,631 files under `skills/taste-skill/`, 22 references, 12 scripts.

## Tests, failing first

`tests/test_source_coverage.py`, 14 tests.

| Step | Command | Result |
|---|---|---|
| Before `muro/coverage.py` existed | `python -m pytest tests/test_source_coverage.py -q` | collection error, `ModuleNotFoundError: No module named 'muro.coverage'` |
| Module written, not wired | same | 9 passed, 3 failed: no `coverage.json` in the workbench, none inlined for an API model |
| Wired into `prepare_intake`, `agent._inline_evidence`, the prompt | same | 12 passed |
| Two tests added from the first real measurement (below) | `-k "nearest or lives_in"` | 2 failed: a root `assets/` matched, and the skill's own folder was reported |
| Nearest existing path wins; a file's own folders are not references | whole file | 14 passed in 21.33s |

## Measurement on Marionette's sources (before the gate and the new intake)

A scratch script outside the repository called `tree_entries`, `_selected` and
`source_coverage` for each source at its pin. It read the remotes and wrote
nothing in the repository.

| Source | Selected files | Unselected files | Unselected MB | Referenced entries (files, folders) |
|---|---:|---:|---:|---:|
| taste-skill | 11 | 1,652 | 37.0 | 52 (37, 15) |
| motion-design | 17 | 3 | 0.0 | 0 |
| gsap-scrolltrigger | 1 | 43 | 0.1 | 0 |
| wayfinder | 4 | 171 | 0.7 | 3 (2, 1) |
| ai-design-skills | 2 | 7 | 0.2 | 0 |
| ui-ux-pro-max | 46 | 616 | 18.3 | 4 (3, 1) |
| genoffice | 1 | 6,309 | 88.9 | 0 |
| explain-this | 13 | 16 | 0.3 | 0 |
| open-paper-skills | 25 | 253 | 7.3 | 22 (21, 1) |
| tokeneconomizer | 63 | 134 | 4.9 | 17 (12, 5) |
| claude-design-system-prompt | 15 | 18 | 0.1 | 0 |
| ponytail | 8 | 206 | 12.0 | 3 (3, 0) |
| i-have-adhd | 2 | 72 | 0.6 | 13 (13, 0) |
| egm | 46 | 252 | 3.1 | 33 (23, 10) |
| superpowers | 43 | 193 | 1.4 | 14 (13, 1) |
| zero-slop-design | 34 | 41 | 0.2 | 27 (11, 16) |
| text-humanizer | 8 | 13 | 0.0 | 2 (1, 1) |

"Unselected" counts the whole repository at the pin, not only the skill folder:
taste-skill's 1,652 are the 1,620 of its folder plus the repository's own files.

motion-design is pinned `head` and its upstream HEAD has moved
(`f9a8a041` pinned, `2e1f3c05` upstream), so the ordinary source check refuses
it. It was measured at the pinned commit with the HEAD comparison switched off
in the scratch script only.

### taste-skill: what the 52 entries are

- Scripts named by `SKILL.md` and by the packaged `start.mjs`: `gate.mjs`,
  `copy-lint.mjs`, `consistency.mjs`, `perf.mjs`, `moments.mjs`, `photos.mjs`,
  `icons.mjs`, and `assets/layout/deal.mjs`, `assets/layout/check.mjs`.
- Stylesheets the packaged `start.mjs` names: `assets/system.css`,
  `assets/layout/layout.css`, `assets/motion/motion.css`,
  `assets/backgrounds/backgrounds.css`, `assets/icons/icon.css`,
  `assets/ui/cards.css`. The packaged `fx.js` names `assets/scenes/lib.js`.
- Sixteen of the seventeen unselected references, each named by a selected
  reference (`copy-voice.md` by `copy.md`, `moments.md` by three files).
- The kit folders named by `SKILL.md`: components, layout, moments, effects,
  scenes, objects, icons, ui, backgrounds, diagrams, motion.

`references/perf.md`, `scripts/effects.mjs`, `assets/system.js` and the photos
folder are in `left_out` and not in `referenced`: no selected file names them
by a path that resolves. The prompt tells the AI to read `left_out` too.

By type, the folder holds 151 binary images (66 `.webp`, 46 `.png`, 39 `.jpg`;
26.5 MB) that the license gate refuses today, and about 1,480 text files
(9.2 MB): 958 `.svg`, 133 `.js`, 130 `.json`, 127 `.html`, 84 `.css`, 28 `.md`,
20 `.mjs`.

### The other sources

Their entries were listed, not judged. On reading the paths, most name
repository housekeeping (`README` translations, `.gitignore`, `AGENTS.md`,
plugin manifests, the source's tests) or the unbundled sources of a prebuilt
file. Some may be real omissions: open-paper-skills' `paper-wiki-manager/
scripts/vendor/` (five JavaScript files, 708 KB, named by its `SKILL.md`) and
superpowers' `brainstorming/visual-companion.md`. Deciding each is the intake
AI's work in the pass over the sources.

ui-ux-pro-max shows the limit of path matching: `SKILL.md` names
`.claude/skills/ui-ux-pro-max/scripts/search.py`, a second copy of a script
that is selected under `src/`. The entry is a coincidence the AI dismisses.

## Package and source checks

| Command | Result |
|---|---|
| `python muro_build.py --manifest examples/marionette/sources.json --validate` | `OK: capabilities and ROUTER.md valid` |
| `python muro_build.py --manifest examples/marionette/sources.json --check-sources` | exit 1, one error: `[motion-design] pinned commit f9a8a041… does not match remote HEAD 2e1f3c05…`. The other sixteen sources pass. |

The motion-design error is the upstream moving under a `head` pin. It is raised
in `source_repository`, which this change did not touch, before the tree is
listed. Re-pinning that source is its own procedure and was not done here.

Targeted tests after the change, all local:

| Files | Result |
|---|---|
| `test_source_coverage.py`, `test_factory.py`, `test_agentic.py`, `test_custom_instructions.py`, `test_notice_paths_gate.py`, `test_cli.py` | 89 passed in 225.73s |
| `test_delivery.py`, `test_regressions.py`, `test_final_review.py` | 68 passed in 103.67s |
| `test_intake_only_paths.py`, `test_lessons.py`, `test_license_path_gate.py` (run with the first wiring, before the two resolution rules) | passed, within a run of 68 passed and 1 failed; the failure was `test_factory.py`'s list of workbench files, updated to include `coverage.json` and green in the run above |

## The gate, declared media and the rest, failing first

Each row is one red-to-green step, run locally.

| Test file | Red | Green |
|---|---|---|
| `test_coverage_gate.py` (20) | 16 failed, 4 passed: no refusal, no `omissions` field | 19 passed, 1 failed: a folder named at the end of a sentence (`kit/.`) was not read as a folder; fixed in `coverage._targets`, 35 passed with `test_source_coverage.py` |
| `test_media_paths_gate.py` (15) | 15 failed: no `media_paths` field | 14 passed, 1 failed on a mistake in the test itself (it selected a second binary file); corrected, then passed |
| `test_blob_batch.py` (4) | collection error, `cannot import name 'read_blobs'` | 4 passed in 12.7 s |
| `test_delivery.py`, hook timeout (7 cases) | 7 failed | 43 passed in 37.5 s (whole file) |
| `test_final_review.py`, helper check (7 cases) | 2 failed: the false refusal, and a minified `from'./x'` that the old pattern never caught | passed |

One test was wrong when first written: the sentence-end case passed at once
because `assets/kit/.` already resolved. It was rewritten to the case that
fails (`assets/.`), seen red, then fixed.

## Reading a source absorbed whole

- One `git show` took 197 ms on this machine (20 calls). The first preparation
  of taste-skill with 1,480 text files, read one process per file, was stopped
  after more than twenty minutes without finishing.
- With `read_blobs`: `--prepare-intake taste-skill` took 28 s for the same
  1,480 files.
- `--check-sources` on the seventeen sources: 2 min 0 s. `--build`: 2 min 59 s
  to 3 min 24 s, release 283 MB.

Cost that grew: a release of Marionette is now 283 MB, since each of the five
host skill folders and the release root hold a copy of every packaged file.
Four tests build that release (`test_capabilities_read_originals.py`,
`test_claude_design_intake.py`, `test_live_host_fixes.py`,
`test_tokeneconomizer_intake.py`), so one local run of the suite writes over a
gigabyte of temporary files.

## Fixtures after the first active hook

`test_final_review.py::test_new_task_does_not_reuse_old_outputs_and_archives_previous_map`
failed with `Invalid delivery: capability visual-direction declares an active
hook but the package has no delivery.json`: eight fixtures copied Marionette's
capabilities and router alone. `routing_helpers.copy_delivery` now copies the
document, the owner Markdown and the source ids (six more fixtures needed it
later: fourteen in all); the four files run right after
gave 37 passed, 1 failed (`test_live_host_fixes.py`: the capability's
provenance line must name `skills/taste-skill/SKILL.md`), fixed in the
capability.

## Targeted tests on the final factory code

Three local runs, none of them the full suite.

**Run 1**, 43 test files, complete: `7 failed, 545 passed, 71 errors in 1505.09s
(0:25:05)`. The 71 errors were coordinator fixtures of five more files
(`test_ai_routing.py`, `test_explain_this_intake.py`, `test_genoffice_intake.py`,
`test_open_paper_skills_intake.py`, `test_claude_design_intake.py`) that copied
the catalog without its delivery document. The names of the 7 failures were cut
from the saved output; they are taken from run 2.

**Run 2**, 47 files, 645 tests, after those fixtures were given the document:
stopped by the host at test 507 because the machine was low on memory (4.8 GB
free of 31.5 GB, used by other sessions; no process of this run was left). It
was not started again. Up to that point: 498 passed, 8 failed, 1 error. Each
was identified by matching the progress marks to the collected order.

| Test | Cause | Correction |
|---|---|---|
| `test_reharmonization.py::test_taste_stop_hook_is_recorded_and_not_adopted` | pinned the decision of 2026-11-10 that this work supersedes | rewritten as `…_is_adopted_since_the_source_travels_whole` |
| `test_delivery_registers_nothing_and_accounts_for_every_part` in the superpowers, egm, zero-slop-design and text-humanizer intake tests; `test_delivery_separates_…` in the ponytail one | each validated one source's decisions against the whole catalog, which now holds another source's active hook | validated against the source's own capabilities, as `test_claude_design_intake.py` already did |
| `test_tokeneconomizer_intake.py::test_token_economy_is_one_direct_step_…` | a sixth fixture, written inline, without the delivery document | `copy_delivery` |
| `test_pin_modes.py::test_release_pin_accepts_the_tagged_commit_although_head_moved[v1.0.0-True]` | not established; the other three variants passed in the same run | none; passed when rerun |
| `test_capabilities_read_originals.py::test_every_packaged_original_a_body_names_is_in_the_release` (error in its build fixture) | not established; the output was lost with the run | none; passed when rerun |

Two more defects of the package, found by `test_ai_routing.py` before run 2 and
corrected: the router's text had reached 80 lines, the cap, so a test that
appends a row failed (two record lines merged, back to 78); and the capability
wrote its commands as `node <TS>/…`, while a helper command must name its path
from `<package_root>` (16 commands respelled).

**Run 3**, in the foreground, the tests of run 2 that failed:

| Files | Result |
|---|---|
| the five delivery tests' files, `test_reharmonization.py`, `test_pin_modes.py`, the token-economy test | 114 passed in 123.66s |
| `test_capabilities_read_originals.py`, which builds the real release from the final tree | 43 passed in 227.83s |
| `test_ai_routing.py`, `test_taste_skill_intake.py`, `test_motion_design_intake.py`, `test_claude_design_intake.py` without its two release tests | 76 passed in 123.22s |
| `test_factory.py`, `test_source_coverage.py` after the last prompt edit | 25 passed in 80.48s |

Not rerun on the final tree: the 138 tests run 2 never reached
(`test_claude_design_intake.py`'s two release tests, `test_intake_only_paths.py`,
`test_notice_paths_gate.py`, `test_license_path_gate.py`, `test_regressions.py`,
`test_agentic.py`, `test_cli.py`, `test_custom_instructions.py`, `test_muro.py`,
`test_muro_build.py`). Run 1 executed all but the last two with no failure
beyond those listed, on the same factory code; the package's router text and
command spelling changed after it.

`python muro_build.py --manifest examples/marionette/sources.json --validate`
and `--check-sources` both pass on the final tree (the second with the gate, on
all seventeen sources).

## Not executed

- The full suite. By the owner's rule it runs in the `Tests` workflow on a
  pushed branch; nothing was pushed.
- No host AI has read a `coverage.json` through the prepared prompt. The intake
  of taste-skill was done in this session with the evidence, by the model that
  wrote the prompt text; an independent intake has not exercised it.
- `muro agent` against a real endpoint: only `_inline_evidence` was tested.
- `muro mcp`, `muro init` and `muro absorb` end to end with the gate. `init` is
  covered by one unit test.
- The gate was not tried on a package other than Marionette.
