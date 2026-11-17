# Marionette: zero-slop-design intake — 2026-11-17

## Status and authorization

The owner asked whether absorbing <https://github.com/zero-slop-design/zero-slop-design-plugin> made
sense, then confirmed three decisions and the intake ("ok", 2026-11-17). The source was added, read,
classified and harmonized in the working tree on branch `intake/zero-slop-design`. Nothing was
committed, released, installed or version-bumped: `plugin.version` is still 0.2.1, and a release that
ships this catalog needs a new version.

The same session then absorbed `text-humanizer` (its own record,
`2026-11-17-text-humanizer-intake.md`). The checks below ran on the tree that holds both.

## Owner decisions carried

1. A project `DESIGN.md` that is not a starter or a reference counts, minus its `unresolved` and
   `proposed` entries, as the user's explicit instruction for `visual-direction`. A step that builds
   never rewrites the file: it asks, and the change belongs to the capability that owns it.
2. The source's ban on adding or doing tests the developer did not ask for stays in every one of its
   steps, for checks and tests of the interface, where `references/procedure.md` places it. Ponytail's
   small test or self-check for new non-trivial logic holds, and TDD stays inside `plan-execution`.
3. Pin the tag `v0.2.1`; ship `LICENSE` and `THIRD_PARTY_NOTICES.md` beside the bundle; support the
   notices in the factory as a field the source declares (ADR-0025).

The order of looks to match, proposed in review and adopted by the harmonization: the user's request
in the turn; a project `DESIGN.md` that is not a starter or a reference; tokens or a Master already
in the repository; a direction recorded in the same plan; candidates and starter files as proposals.

## Pinned source and rights

| Source | Tag | Tag target | Licence |
|---|---|---|---|
| [zero-slop-design/zero-slop-design-plugin](https://github.com/zero-slop-design/zero-slop-design-plugin/tree/v0.2.1) | `v0.2.1`, annotated tag | `c5cdc7ce499846c23d90732e4958b44f92823756` | Root MIT |

- GitHub lists one published Release, `v0.1.0` (13 skills, no `enforce-design`). `v0.2.0` and
  `v0.2.1` are annotated tags without a Release page. The factory verifies `pin: release` against the
  Git tag (`git ls-remote`, `muro/sources.py`), and the rule is the newest non-prerelease tag, so
  `v0.2.1` is pinned. It was also the upstream HEAD on 2026-11-17.
- The upstream was created on 2026-10-05 and last pushed the same day; 12 stars. Its specification
  calls itself "Version: 0.1 (draft). Breaking changes can occur before 1.0", on a Google format still
  `alpha`. A later re-pin may need a new intake.
- `tools/zsd.mjs` (994,159 bytes) is a prebuilt bundle of the project's code with ninety-three
  third-party packages. `THIRD_PARTY_NOTICES.md` lists them: all MIT or ISC except
  `@google/design.md` 0.4.0, whose block is the Apache-2.0 text (its heading says "(undefined)"). The
  bundle carries no SPDX header and no `@license` marker, so the license gate accepts it as MIT; the
  source declares `notice_paths: ["THIRD_PARTY_NOTICES.md"]`.
- Whether `@google/design.md` ships a `NOTICE` file of its own was not checked: the upstream build
  collects license files only.

## Bundle: read and hashed, not run

- SHA-256 of `tools/zsd.mjs` at the tag: `d4082d0bf1d6158cfabae5912eb03c9101554061770354fdb25e3a7c6143546c`,
  equal to `runtime` in `tools/build-info.json`. `tools/spec-config.yaml`:
  `6244e829849e63b55316258f32e1110833d193b79943ec79f245b33ebeec2ef8`, equal to `validatorData`. The
  packaged copy in the staged release has the same hash.
- The upstream workflow rebuilds the bundle and fails on a difference
  (`git diff --exit-code -- tools THIRD_PARTY_NOTICES.md`); its run on `v0.2.1` succeeded.
- The factory's static scan for relative imports found none in the bundle; it resolves
  `./spec-config.yaml` beside itself, and both files are packaged.
- The bundle was never executed in this intake: no `lint`, `export`, `drift` or `check-code` run.

## What was read

Read whole: the fourteen skills, `references/procedure.md`, `design-format.md`, `code-checks.md`,
`observations.md`, `authoring.md`, `technical-terms.md`, `spec/zsd-design-md.md`,
`templates/DESIGN.md`, `templates/ci/github-actions.yml`, `docs/template-guide.md`,
`docs/design-md-standard.md`, `README.md`, `catalog.json`, `AGENTS.md`, `tools/build-info.json`,
`scripts/build.mjs`, `package.json`, `.github/workflows/validate.yml`, both plugin manifests.

Read in part: `references/technical-terms.json` (its shape and first entries), `THIRD_PARTY_NOTICES.md`
(the headings of all ninety-three entries and the block of `@google/design.md`), `src/check.mjs` (the
rule table and the colour patterns only), `tools/zsd.mjs` (scanned as text for markers and imports).

Not read: `src/cli.mjs`, `src/design.mjs`, `src/export.mjs`, `src/language.mjs`,
`packages/zsd-lint/**`, `scripts/validate.mjs`, `scripts/package.mjs`, `examples/**`,
`docs/language-review.md`, `skills/*/agents/openai.yaml` beyond one sample.

## What each part became

| Source part | Result |
|---|---|
| `define-design`, `create-design-md`, `extract-design`, `update-design-md`, `define-typography`, `define-color-system`, `define-responsive-layout`, `define-interaction-states` | `design-file` / `design-file.brief`, `.create`, `.extract`, `.update` |
| `apply-design` | `design-file-apply` / `design-file.apply` |
| `review-design-md`, `review-design-drift`, `review-accessibility` | `design-file-inspection` / `design-file.document-review`, `.interface-drift`, `.accessibility-inspection` |
| `export-design-tokens`, `enforce-design` | `design-file-integration` / `design-file.token-export`, `.code-checks` |
| References, specification, template, CI template, template guide, bundle, its data and hashes, `LICENSE`, `THIRD_PARTY_NOTICES.md` | Packaged unchanged under `scripts/zero-slop-design/`, opened by the steps |
| `references/technical-terms.md`, `technical-terms.json`, `authoring.md`; "Read Technical terms for skill language" | Dropped: they govern the upstream's own skill text; `intake_only_paths` |
| `README.md`, `catalog.json`, `docs/design-md-standard.md`, `.claude-plugin/plugin.json` | Read as evidence, `intake_only_paths` |
| Manifests, `agents/openai.yaml`, tool sources, build scripts, example exports, language review | Outside the selection |

Six decisions with their reasons are in `examples/marionette/delivery.json`. Nothing is session-wide
and no hook is registered: the source ships none. The discovery entry is `marionette-design-file`; it
absorbs `zero-slop-design` and the fourteen skill names, which are also in `plugin.replaces`.

## Harmonization

- **One owner of the file.** `design-file` is the only writer of the brief and of `DESIGN.md`. The
  apply, inspection and integration capabilities read it; integration writes one metadata path
  (`x-zsd.implementation.checks`), as `enforce-design` step 18 says.
- **No forced chain.** The source gives every skill the design file as an input and chains none; the
  README's order is advice. A step that finds no file reports it and names `design-file`.
- **Output keys.** The interface drift report is `design_inspection_report`; `drift_report` stays with
  `design-drift` (EGM: documents against code).
- **Existing capabilities changed** (each change is recorded under "Changes for coexistence" in its
  file): `visual-direction` (the file as explicit instruction; its colour tokens used as recorded and
  not through `start.mjs brand`, which derives surface, muted and inverse colours the file does not
  hold; the two checks extended), `design-review` (a finding against the file is reported, not fixed),
  `ui-prototype`, `html-deck`, `design-options`, `figma-design` (the file comes first; never rewritten),
  `aesthetic-direction` (a starter or reference file is not a system to match), `motion-principles`
  (confirmed `x-zsd.motion` values win over the source's tables). The two `needs` conditions on
  `aesthetic-direction` now say that a starter or reference file does not count as a design system.
- **Code checks named where code is written.** The steps that write source code state what
  `check-code` rejects in the checked paths, in the words of `references/code-checks.md`. The rule in
  `src/check.mjs` matches `rgb()`, `hsl()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()` and
  `color()`, exempts a match that contains `var(`, and does not match `color-mix()` by itself.
- **Router record.** The line "a client's brand wins over source bans" said more than the body of
  `visual-direction`; it now says what the body says (the user's explicit instruction wins, a brand
  alone does not).

## Factory change (ADR-0025)

`notice_paths`, optional per source: selected files that list third-party notices. Each must be a
selected file that ships; the aggregated `NOTICE.md` adds one line per file that says where it is.
Nothing is inferred from a file name. The gate still verifies one license per source and does not
parse the declared file.

## Review by a second session

A second session reviewed the working tree in read-only mode and reported five points. Two were
already fixed when the report arrived (the plugin description over its character budget, the notice
field). Three were applied: the colours of a design file not passing through `start.mjs brand` and the
typography check; the file named in the behaviour steps and `needs` conditions of the consumers, in
`aesthetic-direction` and in `motion-principles`; the code-check rules named in the steps that write
code. Its claim that `color-mix()` fails the `color-function` rule does not hold at this tag (see
above) and was not written into any body.

## Commands and results

| Command | Result |
|---|---|
| `python muro_build.py --manifest examples/marionette/sources.json --validate` | `OK: capabilities and ROUTER.md valid` |
| `python muro_build.py --manifest examples/marionette/sources.json --check-sources` | `OK: all sources and plugin identity valid` (17 sources, remotes contacted) |
| `python muro_build.py --manifest examples/marionette/sources.json --build --out <scratch>` | Built; `NOTICE.md` points at `scripts/zero-slop-design/THIRD_PARTY_NOTICES.md`; 14 packaged skills as `SKILL.source.md`; 16 discovery skills in the Claude Code adapter, `marionette-design-file` among them |
| `python -m pytest -q tests/test_zero_slop_design_intake.py` and the tests of the edited capabilities | See "Test results" |
| `python -m pytest -q tests/test_notice_paths_gate.py tests/test_license_path_gate.py tests/test_intake_only_paths.py tests/test_apache_notice_gate.py` | 65 passed |
| `muro eval prepare`, classification by a fresh agent that read only the staged prompt and contexts, `muro eval score` | 76 of 77 |

### Routing eval

77 cases, eleven written for this source and four for `text-humanizer`. A subagent with no access to
`eval-cases.json` classified them from `PROMPT.md` and `contexts.json`; all fifteen new cases matched,
the near-misses included (document drift stays `design-drift`, an accessibility audit that fixes stays
`design-review`, tokens without a design file stay `design-system-extract`, choosing a look stays
`aesthetic-direction`). The one miss is `scroll-css-only`, the pre-existing expectation already
missed at the EGM and superpowers intakes. Sample size: one model run per case. The subagent named
`ponytail-visual-only` as a case where it hesitated between `design-review` and the new accessibility
inspection; it chose `design-review`, as expected.

### Test results

Run locally on the final tree: `tests/test_text_humanizer_intake.py`, `tests/test_zero_slop_design_intake.py`,
`tests/test_notice_paths_gate.py`, `tests/test_capabilities_read_originals.py` (without its build test) and
`tests/test_lessons.py`: 101 passed, 1 failed. The failure was a row count pinned in `tests/test_lessons.py`
(76, now 81 with the five new router rows); it was corrected and not run again locally.

Earlier local runs, on intermediate states of the tree, found and led to fixing: the plugin description over
the 1024-character bound of the umbrella skill, capability counts pinned at 36 in four tests, and the word
"wins" that `tests/test_capabilities_read_originals.py` asks of every body.

The full suite was not completed locally: it takes about an hour on the owner's machine and was stopped at
the owner's request ("skippa la suite"), after showing two failures in its first third that were not
identified. By the owner's rule of the same day it runs in GitHub Actions, in the `Tests` workflow added
with this change. The result of that run is recorded below once the branch is pushed.

`Tests` workflow on `develop` (GitHub Actions, Ubuntu, Python 3.13). The first run, on commit `5844a0d`,
reported 653 passed, 3 failed, 16 skipped in 113 seconds: the router at exactly 80 text lines left no room for
the row `tests/test_ai_routing.py` appends, `tests/test_pin_modes.py` did not name the two new sources, and
`tests/test_audit_p0.py` built the umbrella description without the package's entries. The third run, on
commit `e96f8df` (run 44087423614), passed: 656 passed, 16 skipped in 179 seconds, then `--validate`,
`--check-sources` and a fresh build on the runner.

Found by that test and left as it is: a package with no `entries.json` and a long `plugin.replaces` list gets an
umbrella description that is only the list of names, because the list alone passes 1024 characters
(`muro/adapters.py`, `_skill_description`). Marionette has entries, so its release is not affected.

## After the intake

On the owner's request of the same day the work was merged into `develop` and `plugin.version` went
from 0.2.1 to 0.3.0 (`docs/releases/marionette-v0.3.0.md`). The statements above about the version
describe the tree at the end of the intake.

## Not executed

- The bundle `tools/zsd.mjs`: no command of it was run, at intake or in a host.
- No live host session: the four capabilities were not run in Claude Code, Codex or any other host,
  so skill discovery, runtime calls, permission prompts and cost per task are not measured.
- No project was put under `check-code`: that a page built by `visual-direction` with its own palette
  fails the check is a deduction from the rules of the two sources.
- No install of the staged release, no commit, no version bump, no release.
