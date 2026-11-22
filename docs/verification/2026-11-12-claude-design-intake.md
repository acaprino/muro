# Intake of `claude-design-system-prompt` into Marionette — 2026-11-12

Owner request: absorb `Trystan-SA/claude-design-system-prompt` into Marionette and
keep its `system-prompt.md`. Owner direction, same day: Marionette is "multi
theme, context e intent", so the prompt "non deve fagocitare tutto"; it becomes
capabilities found from context, "da armonizzare e coordinare con le altre".

## Source and pin

- Repository: https://github.com/Trystan-SA/claude-design-system-prompt
- No release and no tag were published (GitHub API, 2026-11-12), so `pin: head`.
- Commit `3c3ddb07d7aa3fef051d83608596470c95cfd8fe`; MIT, "Copyright (c) 2026
  Trystan Sarrade". First pin: there is no earlier commit to diff against.
- Selected: `claude/system-prompt.md` (647 lines, 35,565 bytes, 20 chapters) and
  `claude/skills/**` (14 skills). Excluded: `codex/**`, `README.md`.
- Provenance, read from the upstream README on 2026-11-12: "Reverse-engineered
  system prompt of Claude Design from Anthropic." The MIT license is the
  repository author's; it says nothing about the text the repository was
  derived from. The owner was told this before deciding to absorb it.

## What the host AI decided

The intake and harmonization were done by a host LLM (a delegated agent) with
`prompts/intake.md`, `prompts/delivery.md` and `prompts/harmonizer.md`. Python
prepared the files and validated the result.

- Delivery: 25 decisions for this source in `examples/marionette/delivery.json`,
  19 `capability` and 6 `dropped`; none `always-on`, none `hook`. The package's
  document has no `always_on` text and no hook wiring.
- Dropped: the prompt as session text; the designer persona and the "final
  principle"; the rule not to disclose tools or skill names; conduct rules for the
  whole conversation; chapter 20 (the source's own list of skills and when to
  invoke which); the host tools and starter files the skills call, which are not
  in the selected snapshot.
- Seven new capabilities: `aesthetic-direction`, `wireframe`, `ui-prototype`,
  `design-options` (variations and tweak panel), `html-deck`,
  `design-system-extract` (tokens and component inventory), `design-review`
  (accessibility, generic look, hierarchy and rhythm, interaction states, polish).
  The question round of `discovery-questions` is the brief step of each
  production capability, not an intent of its own.
- Harmonization with the existing catalog: `aesthetic-direction` and
  `visual-direction` are declared conflicting (two owners of palette and type);
  `ui-prototype` and `html-deck` need `aesthetic-direction` only when nothing
  gives the design a look; `html-deck` and `office-deck` are alternatives by
  wanted format; a recorded `motion-spec` overrides the source's 0.2 to 0.3
  second transitions; `design-guidance` is not merged (it recommends, these
  commit and fix). Changed existing files: `visual-direction`, `design-guidance`,
  `figma-design`, `motion-principles`, `office-deck`.
- Catalog: 26 capabilities; entries `marionette-product-design` and
  `marionette-design-review` added; 3 guide examples and 8 eval cases added;
  `plugin.replaces` lists the 14 upstream skill names.
- At run time the new capabilities read only the packaged skill files they name.
  None tells the host to read the packaged `system-prompt.md`.

## Commands and results

| Command | Result |
|---|---|
| `python muro_build.py --manifest examples/marionette/sources.json --validate` | `OK: capabilities and ROUTER.md valid` |
| same with `--check-sources` (contacts the pinned remotes) | `OK: all sources and plugin identity valid` |
| same with `--build --out <scratch>` | first attempt failed: `fatal: unable to access 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/': Empty reply from server`; the retry built the release |
| `python -m pytest -q`, on the tree as it stood at 12:40 with the parallel session's factory changes in it | `394 passed, 8 skipped in 439.08s`. The skips are host-dependent checks in the parallel session's policy tests (Node, an installed Hermes or Pi, the other shell family), not tests of this intake |
| `python -m pytest -q tests/test_claude_design_intake.py`, by the delegated agent after scoping the file to this source | `15 passed in 106.30s` |

Checked in the staged release:

- All five adapters ship 11 skill folders (the coordinator and 10 entries). No
  adapter has a `hooks/` folder, a policy file or an extension that adds text.
- `delivery.json` is at the release root; the guide lists the decisions for the
  source.
- In this first staged release `scripts/claude-design-system-prompt/claude/`
  held `system-prompt.md` and the 14 skill files (the prompt was removed later
  the same day, see "Correction"); `LICENSES/claude-design-system-prompt.txt` and a `NOTICE.md`
  entry are present.
- Verbatim overlap between each new capability body and the upstream files, as
  runs of 8 or more identical words: 0 to 2 runs per capability, the longest 10
  words. The methods are restated, not copied.

Routing eval, reported by the delegated agent and not rerun here: one blind run
by a second agent that did not see the expectations, 32 of 33 cases. The miss is
an older case (`db-migration`: expected `work-map`, got `no_match`).

Tests changed because a catalog fact changed: `test_audit_host.py`,
`test_audit_p1.py` and `test_lessons.py` (19 to 26 capabilities, 59 to 66 rows),
`test_reharmonization.py` (two `reads` lists), `test_pin_modes.py` (the new
source's mode). New: `tests/test_claude_design_intake.py`.

## Correction, same day: the raw prompt is no longer shipped

The first staged release carried `claude/system-prompt.md` unchanged under
`scripts/`, with nothing reading it, and the owner was asked whether to keep it.
The owner's answer pointed at the real defect: a system prompt that was turned
into capabilities should not also travel as a raw file, and that decision is the
delivery judgment's, not a question for the owner.

- Factory: a source may declare `intake_only_paths` (ADR-0016 amendment,
  `prompts/delivery.md` "Originals in the release"). Tests written first:
  `tests/test_intake_only_paths.py`.
- Marionette: the source declares `intake_only_paths: ["claude/system-prompt.md"]`.
  The seven `## Sources` lines now say the prompt was read at intake only, and
  the whole-prompt delivery decision says the file is not shipped.
- The 14 skill files stay packaged: the capabilities read them at run time as
  the full method behind each short body.

| Command | Result |
|---|---|
| `python -m pytest -q tests/test_intake_only_paths.py`, first run before the code | collection error (missing function), then `10 passed in 50.09s` |
| `python -m pytest -q tests/test_intake_only_paths.py tests/test_claude_design_intake.py tests/test_delivery.py` | `64 passed in 119.93s` |
| `--validate` on Marionette | `OK: capabilities and ROUTER.md valid` |
| `--build --out <scratch>` and `find <release> -name system-prompt.md` | built; 0 copies; 14 files in `scripts/claude-design-system-prompt/claude/skills` |
| `python -m pytest -q`, started about 13:06 on a tree the parallel session was still editing | `3 failed, 423 passed, 8 skipped, 2 errors in 384.00s`: not green |
| the three failures and one of the two erroring tests, rerun alone at about 13:17 | `1 failed, 3 passed in 139.35s` |
| `python -m pytest -q tests/test_tokeneconomizer_intake.py` (both erroring tests share its module fixture) | `7 passed in 71.53s` |

The failure that remains is
`tests/test_audit_p0.py::test_skill_md_synthesizes_domain_rich_bounded_discovery_description`
(`AssertionError: Office`). `plugin.description` in `examples/marionette/sources.json`
was rewritten at 12:57, when `ponytail` and `i-have-adhd` were added: it now says
"Word, Excel, PowerPoint and PDF files" and no longer contains the word the test
requires. It is not repaired here, because that file belongs to the parallel
session's ongoing change. The 12:40 full run, before that rewrite, passed it.

The other four (`test_live_host_fixes.py::test_release_never_ships_a_file_named_skill_md_below_a_skill_folder`,
`test_ui_ux_pro_max_intake.py::test_live_ui_ux_pro_max_source_passes_license_gate`
and the two `test_tokeneconomizer_intake.py` errors) passed when rerun. Their
first tracebacks were not captured, so the cause is not established. All four
build a real release or contact a pinned remote, and the tree was changing
during the run; neither explanation was confirmed. No full run on a quiet tree
has been made since.

By the time of this correction a parallel session had added `ponytail` and
`i-have-adhd` to Marionette (13 sources, 29 capabilities, an `always_on` policy
of 1,986 characters delivered through each host's system channel). The section
"What the host AI decided" above describes the package before that; statements
there that the package has no `always_on` text hold for this source only.

## Not executed

- No live host session with the new capabilities: no wireframe, prototype, deck
  or review was produced by a real model. The release proves packaging.
- The upstream `codex/**` variant was not read. The deck shell and device frames
  the upstream skills call are not in the snapshot; the capabilities write their
  own and that was not tried.
- The release was staged in a scratch folder. Nothing was installed and no
  existing `dist` was replaced.

## Open points for the owner

1. Resolved the same day (see "Correction"): the raw `system-prompt.md` is no
   longer shipped. The 14 skill files still travel unchanged under `scripts/`;
   their upstream describes itself as reverse-engineered.
2. A deck request that names no format goes to `office-deck`.
3. The source checks the user's email domain before recreating a company's
   interface; no host here can do that, so the user's own statement is used.
4. The tweak panel persists values in `localStorage`, not through the source's
   host protocol.
5. The `db-migration` eval expectation predates this intake.
