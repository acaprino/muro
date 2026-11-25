# charles-skills absorbed into Marionette (2026-11-25)

Owner request: "puoi integrare `LemonFace0309/charles-skills/.../charles-color-analysis` in marionette?", then, while
the first was being read, "e anche `.../charles-polish`". Result: one source, `charles-skills`, with those two skills and
no other, and two new capabilities.

## The source and its pin

`LemonFace0309/charles-skills`, root `LICENSE` MIT, Copyright (c) 2026 Charles Liu. It has no release and no tag
(`gh api .../releases` and `.../tags` both empty), so the pin is `head` (ADR-0009):
`83de509dd10b77ebaf83c3f9986b538cdaf19b63`, the head when the intake started and still the head when the manifest entry
was written.

## What was read and selected

Read in full from the intake snapshot: both `SKILL.md` files, `references/principles.md`, and the scripts
`web-frames.mjs`, `frame-diff.mjs`, `sheet.mjs`, `lib.mjs`, `sim.sh`, `ocr.swift`, `package.json`. Read in part:
`color.py` (its usage text, every function that writes a file or starts a program, the Chrome lookup, the argument
parser; the colour maths was not read line by line), `edges.mjs` and `dom_colors.js` (their headers, and a search of
`dom_colors.js` for network and storage calls, which found none), `package-lock.json` (package names, versions and
licences).

`coverage.json`: 15 files selected, 0 referenced outside the selection, 656 left out.

Read outside the snapshot, in a clone at the same commit, as evidence only: the two skills' READMEs, the shelf README,
the repository's `AGENTS.md` and `scripts/copies.json` (the polish scripts are copies of charles-unreasonable-craft's),
and the `evals/` of both skills (their near-miss prompts shaped the excludes and four eval cases). None of these is
selected or packaged.

Not read: every other skill of the repository (charles-unslop, charles-unreasonable-craft, charles-store-screenshots
and the drops, editing and qol shelves). The owner took two skills, so they are not sources and are not described as
duplicates of anything.

## What it became

| Skill | Capability | Intents | Outputs |
|---|---|---|---|
| charles-polish | `interface-polish`, `resumable` | `ui.craft-polish`, `ui.craft-review` | `polish_changes`, `polish_report` |
| charles-color-analysis | `color-critique` | `ui.color-critique` | `color_critique`, `color_previews` |

- A new discovery entry, `marionette-polish`, holds both. No hook, no always-on text, no MCP server, no credential.
- `delivery.json`: two `capability` decisions and one `dropped` decision (the frontmatter descriptions as routing, the
  hand-off to charles-unslop, and the parts of the repository that are not sources).
- Boundaries stated from the neighbours: `design-review` (three intents), `motion-principles` and `aesthetic-direction`
  each gained one exclude and a harmonization line.
- Eight eval cases: three for polish, two for colour, three near misses that keep their owner (a generated look and a
  contrast fix stay design review, motion not designed yet stays the motion specification).
- Package version 0.6.0 → 0.7.0 (0.6.0 has an open release pull request in `acaprino/marionette`); catalog 38 → 40
  capabilities, 17 → 18 sources; README, CHANGELOG and `docs/releases/marionette-v0.7.0.md` updated.

## Harmonization decisions (AI, this session)

1. **interface-polish is a role of its own, not a pass of design-review.** Read against `design-review`'s polish pass
   before deciding: that pass runs four audits and gives a readiness verdict; charles-polish starts on an interface that
   works, scores and climbs it, runs a details table the audits do not have and proves motion on captured frames.
2. **Timing.** Three sources now give different durations (motion-design, the source of design-review, charles-polish).
   The rule of 2026-11-12 is reused: a project design file's confirmed motion values, then a recorded `motion-spec`,
   then the source's own table.
3. **A recorded system is reported, not changed**, as in design-review (rule of 2026-11-17 on the look's authority).
4. **Hit areas.** charles-polish allows 40×40px on desktop. The source of design-review gives 44×44px: "on touch
   surfaces" in `accessibility-audit.md`, and with no medium named in the scale rules of `system-prompt.md` (both read
   in the staged build). Both sources are kept as written; the body says that 44px satisfies both.
5. **"charles-unslop first"** names a skill the package does not carry. The concern has an owner here, the generic-look
   pass of design-review; no rule of the unread skill is guessed.
6. **color-critique edits nothing.** The source itself only measures and previews. Its proposed palettes are candidates:
   `palette`, `aesthetic_direction` and the `DESIGN.md` keep their owners.
7. **Contrast.** The colour skill judges by APCA and reports WCAG beside it where they disagree; design-review fixes
   against WCAG AA. Different requests, no change to either.

Left to the classifier and not tested: which capability a bare "polish this" selects, between design-review's polish
pass and interface-polish. The intent descriptions and excludes separate them by what is asked (an audit before
delivery with a verdict, or raising a working interface and checking its motion).

The existing eval cases and guide examples that expect design-review or motion-principles were read again against the
new intents. One wording was sharpened for it: `hover-timing` ("tell me the right durations and easing for the hover,
no code") is a specification of motion that already exists, so the exclude of interface-polish now says "as a
specification, with no code to correct" instead of "an interface that has no motion yet". No expectation changed.

## Facts read from the code that matter on Windows

- `color.py` looks for Chrome in two macOS folders and for `google-chrome`, `chromium`, `chromium-browser` or `chrome`
  on the PATH. Where it finds none it says to screenshot the page with the browser tool. Text in an image is read only
  where `swift` exists (macOS).
- `lib.mjs` takes `CHROME_PATH`, then macOS and `/usr/bin` paths. On Windows `CHROME_PATH` must be set.
- `sim.sh` needs `xcrun` (macOS). `sheet.mjs` needs ffmpeg.
- `npm install --prefix <scripts folder>` writes `node_modules` inside the installed package.
- The colour skill's commands start `python3`, a name that often does not start Python 3 on Windows. The body says to
  use the name the host has for it.

## Commands and results (this machine, Python only)

| Command | Result |
|---|---|
| `python -m muro intake charles-skills --manifest examples/marionette/sources.json` | Workbench staged |
| `python muro_build.py --manifest examples/marionette/sources.json --validate` | `OK: capabilities and ROUTER.md valid` |
| `python muro_build.py --manifest examples/marionette/sources.json --check-sources` | `OK: all sources and plugin identity valid` |
| `python -m pytest -q` on `test_charles_skills_intake`, `test_better_layout_intake`, `test_lessons`, `test_absorbed_names`, `test_audit_p0`, `test_audit_p1`, `test_audit_host`, `test_pin_modes`, `test_claude_design_intake`, `test_ai_routing` | First run: 1 failed (`test_absorbed_names`: the plugin description, at 889 characters, was cut in the umbrella skill). The description was shortened to 886 with no topic dropped. Second run: 147 passed |
| `python -m pytest -q` on 17 more modules that name Marionette (the other intakes, eval, release guide, simulate, factory, CLI, policy) | 249 passed |
| `python muro_build.py --manifest examples/marionette/sources.json --build --out <scratch>` | Built `marionette/` |
| `python -m pytest -q` on `test_capabilities_read_originals`, `test_project_file`, `test_project_layout`, `test_project_work` | 1 failed, 279 passed, 1 skipped. The failure was this change's: the colour body said the originals "win" where the test requires the word "wins" (the rule that the original wins). Fixed in the body |
| After the review fixes below: `--validate`, then `python -m pytest -q` on the 26 Marionette modules not run before, plus `test_pin_modes`, `test_audit_p1`, `test_audit_host`, `test_ai_routing` | `OK`; 421 passed, 3 skipped |
| Second `--build --out <scratch>` on the final content | Built `marionette/` |
| Rerun on the final content of the 27 modules that had run before the review fixes | 588 passed, 1 skipped |

Every test module marked `marionette` (51, from `pytest -m marionette --collect-only`) was run at least once on this
machine, in groups, never as one suite. The desktop and Rust jobs were not run: nothing of theirs changed.

Review fixes, after a second read of the finished work: the 44px wording (decision 4), the boundary with the motion
specification, the note in `design-review` that the hand-off to charles-unslop is the source's and its mapping to the
generic-look pass is the package's, and the `python3` line. The uncommitted work was also moved from the stale local
`develop` (3ba6fc9) onto the remote `develop` (4a05afd), which differs from it in the desktop app, its workflows, AGENTS.md and one ADR, and in no file of this change.

The staged build carries both capabilities in all five adapters, the skill `marionette-polish` in all five (hidden from
the slash menu on Claude Code, with the sentence that names `charles-polish` and `charles-color-analysis`), the 14
selected files under `scripts/charles-skills/skills/design/` with each `SKILL.md` stored as `SKILL.source.md`,
`LICENSES/charles-skills.txt` and a `NOTICE.md` entry (MIT, Copyright (c) 2026 Charles Liu) with the three runtime
dependencies.

## Not executed

- The full suite in GitHub Actions had not run when this record was written. Added after the owner asked for the commit and the push the same day: the change is commit `fac9458` on `develop`, and both workflows passed on it, `Marionette` (run 45635591015) and `Tests` (run 45635590494). The three skills absorbed later that day are in `2026-11-25-charles-drops-intake.md`.
- The routing evaluation (`--prepare-eval` and `--score-eval`) with a host AI: the eight new cases are authored, not
  scored. `muro eval prepare` refused to stage it because the eval workbench still holds a `decisions.json` of
  2026-11-19, which was left where it is. The new test selects the capabilities through explicit decision fixtures, which prove mechanics only.
- A live run on any host. Nothing was installed. Neither capability's behaviour on a real task is tested.
- The scripts themselves: `color.py` and the Node scripts were read, not run. That `npm install --prefix` can write into
  an installed package on each host is untested.
- The AI-owned intake and harmonization were done by the host model in this session; no second review pass.
