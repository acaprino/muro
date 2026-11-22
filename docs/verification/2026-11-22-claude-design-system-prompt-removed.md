# Marionette: claude-design-system-prompt removed (2026-11-22)

## Why

Owner decision of 2026-11-22: Muro stops depending on `Trystan-SA/claude-design-system-prompt`. The scope of a
package is changed the way ADR-0015 gives, by removing the source; no pin is moved.

What forced the question. After the pull request of the Imago 0.3.0 pins (#27) the `Tests` workflow (run
45013089110) and the `Release` workflow (run 45013089182) on `main` failed, not because of Imago:
`ValueError: pinned commit 3c3ddb07d7aa3fef051d83608596470c95cfd8fe does not match remote HEAD
e0a46359dcd497e73f1f8a6e953b2e56fb59bef2` (`muro/sources.py`, `source_repository`, from `build_release`), because
the source was pinned in `head` mode (ADR-0009) and its upstream had moved. Nothing was published.

Read-only look at the upstream on 2026-11-22 (`gh api`, `git ls-remote`):

- `e0a46359` ("Pivot to product-engineer-skills: 12 portable skills for Claude Code and Codex", 2026-11-22T10:08Z)
  removes `claude/system-prompt.md`, every file of `claude/skills/` (the two selected paths of the source) and
  `codex/`, and adds a `skills/` folder of other skills, a plugin manifest and a README. The MIT license is not
  among the changed files.
- `5e0534c9` (2026-11-22T10:37Z) is the HEAD now: three more skills. The gate would have failed again on it.
- The old content is kept upstream at the annotated tag `v1-design-prompt`, which peels to `3c3ddb07`. There is no
  GitHub release. A pin in `release` mode on that tag would have kept every byte; the owner chose to remove the
  source instead, so it was not done.

## What was removed

All seven capabilities that source produced. Each body was a procedure for packaged files of that source, and
each intent came from one of its skills, so none holds anything of Muro's own to keep:

| Capability | Intents | Outputs |
|---|---|---|
| `aesthetic-direction` | `ui.aesthetic-direction` | `aesthetic_direction`, `direction_sample` |
| `wireframe` | `ui.wireframe-exploration` | `wireframe_file`, `wireframe_decision` |
| `ui-prototype` | `ui.interactive-prototype` | `prototype_plan`, `prototype_file`, `prototype_verification` |
| `design-options` | `ui.design-variations`, `ui.tweak-controls` | `options_file`, `options_summary` |
| `html-deck` | `ui.html-deck` | `html_deck_plan`, `html_deck_file`, `html_deck_review` |
| `design-system-extract` | `ui.token-extraction`, `ui.component-inventory` | `design_tokens`, `component_inventory` |
| `design-review` | `ui.accessibility-audit`, `ui.generic-look-check`, `ui.hierarchy-rhythm-review`, `ui.interaction-states`, `ui.polish-pass` | `review_findings`, `review_fixes` |

Catalog: 37 capabilities become 30, 16 sources become 15.

- `sources.json`: the source entry (repository, pin, license, selected paths, intake goal); its 14 names leave
  `plugin.replaces` (`discovery-questions`, `frontend-aesthetic-direction`, `wireframe`, `make-a-deck`,
  `make-a-prototype`, `make-tweakable`, `generate-variations`, `design-system-extract`, `component-extract`,
  `accessibility-audit`, `ai-slop-check`, `hierarchy-rhythm-review`, `interaction-states-pass`, `polish-pass`);
  the plugin description drops "wireframing or prototyping app screens, choosing a product look, design
  variations, tweak panels or HTML decks, extracting tokens, auditing and polishing web designs" (887 characters
  become 720). The version is not changed.
- `entries.json`: `marionette-product-design` and `marionette-design-review`, which held nothing else (13 entries
  remain, every capability in exactly one).
- `ROUTER.md`: the seven rows and the harmonization bullet of the source, replaced by a bullet that records the
  removal (70 text lines of 80). `records.json`: a new record, `harmonization-21`; the earlier record of the
  source's harmonization (`harmonization-13`) stays, as history.
- `delivery.json`: the source's 25 decisions (19 `capability`, 6 `dropped`); 59 decisions remain. Five reasons of
  other sources that named a removed capability were reworded by deleting the clause (ai-design-skills'
  routing decision; ponytail's engineering-review; zero-slop-design's design-file, design-file-apply and
  design-file-inspection). The `always_on` text named none.
- `eval-cases.json`: the 13 cases whose every expected capability was removed (94 become 81).
  `guide-examples.json`: the 4 examples that selected a removed capability, one of them together with
  `canvas-design` (26 become 22).
- Eleven capabilities that stay: `reads` lost `aesthetic_direction`, `design_tokens` and `component_inventory`
  (`canvas-design`, `design-file`, `motion-principles`); `visual-direction` no longer conflicts with another
  capability; the body or the `## Sources` notes that named a removed capability or its harmonization lost that
  clause or line (`canvas-design`, `design-file`, `design-file-apply`, `design-file-inspection`,
  `design-file-integration`, `design-guidance`, `engineering-review`, `fresh-review`, `motion-principles`,
  `office-deck`, `visual-direction`); three intent exclusions that pointed at a removed capability by name
  (`design-file.brief`, `ui.design-guidance`, `ui.visual-direction`) lost the pointer. Exclusions that only say
  what a capability does not do, with no name in them, are kept: a request for a prototype, a wireframe or an
  HTML deck now matches no capability.
- `docs/verification/2026-11-12-claude-design-intake.md` (the intake record of this source) and the evidence kept
  only for it in `docs/verification/marionette-ponytail-adhd/prior-11-source-check/`: the file
  `pins/claude-design-system-prompt.json` and its entry in `mirror-index.json`. The archive's `manifest.json` and
  `README.md` are brought into line (47 payload files, 376,293 bytes, the new hash of the manifest); the recorded
  hash of `mirror-index.json` is that of its CRLF form, as the earlier one was. Both records stay in the Git
  history (the intake record at `bd2883b`).
- Tests: `tests/test_claude_design_intake.py` is deleted. `test_pin_modes` (the manifest row),
  `test_capabilities_read_originals` (30 capabilities; the packaged `system-prompt.md`), `test_audit_host`,
  `test_audit_p1`, `test_lessons` (the counts), `test_reharmonization` (two `reads` lists), `test_runtime` (the
  fixture prerequisite is `design-guidance`), `test_ponytail_intake` and `test_zero_slop_design_intake` (the
  fixtures and assertions that named a removed capability), `test_egm_intake` (two output names),
  `test_eval_intents` (the need and conflict fixtures use `impl-plan`, `plan-execution`, `html-explanation` and
  `interactive-explainer`) and `test_check_scope` (the two-step replay uses `visual-direction` twice and the
  guide example "Fai fallire la CI sui colori fuori dal design") follow.
- `README.md` and `docs/desktop.md`: 15 sources, 30 capabilities, 47 absorbed skills, 22 reviewed examples, and
  the example row of the README that used the removed capabilities.

From the next release, `scripts/claude-design-system-prompt/**` (the prompt and its 14 skills) and the aggregated
license and notice entry of that source are no longer in the package: the build derives both from `sources.json`.

## Left as history

`examples/marionette/history.json` (the pins of the published runs), `examples/marionette/CHANGELOG.md`,
`records.json` (`harmonization-13`), `docs/releases/marionette-v0.2.0.md`, the ADRs that tell how the source was
absorbed (ADR-0016, ADR-0018, ADR-0019), the other verification records that mention it among other things,
`docs/verification/ponytail-native/logs/` and `docs/mockups/muro-redesign.html` (a mock-up of 0.4.1). The generic
example of `prompts/intake.md` still names the intents `ui.design-variations` and `ui.tweak-controls`: it is a
format example in a factory prompt, not a dependency, and it was left as it is.

## Checks made

Read-only; no test, no build, no `--validate` and no `--check-sources` was run (the owner's rule).

- `gh api repos/Trystan-SA/claude-design-system-prompt/commits/e0a46359...`, the compare with `3c3ddb07`, the tags
  and the releases, and `git ls-remote` of HEAD and tags: the facts above.
- `git ls-remote` of the other fifteen sources: every pin equals its remote HEAD (`head` sources) or its tag
  (`release` sources), so this was the only mismatch.
- A stdlib script that only reads files: router rows against the capability files (id, role, `after`, outputs,
  intents); every `after`, `conflicts`, `needs` and entry name exists; every `reads` key has a producer; the check
  scope and conditions of each capability are consistent; every delivery target exists and every source has a
  decision; every entry covers each capability once and `absorbs` equals `replaces` but for `i-have-adhd`; every
  eval case and guide example selects an existing capability and intent; the description is within 888
  characters; no removed id, intent, output, role, skill name or the author's name remains outside the history
  files listed above (the only hits are the removal note in `ROUTER.md` and the format example of
  `prompts/intake.md`); every test file parses. No problem found. It is not the project's validator.
- The archive's integrity records recomputed from the files: 47 of 47 hashes and sizes match.

## Not executed

`python -m pytest`, `muro validate`, `muro check-sources`, `muro build`, the routing evaluation and any live host.
The Tests workflow on `develop` is the first run of all of them on this change. The rewrites most likely to need a
second look there are the tests whose fixtures changed (`test_check_scope`, `test_eval_intents`,
`test_zero_slop_design_intake`, `test_runtime`): they were written without running them. The reworded exclusions,
the plugin description and the removal note are this session's wording and have not been evaluated by a routing
run; `eval-cases.json` was only reduced, no expectation was written for where the requests of the removed
capabilities go now.

## Open for the owner

- Marionette no longer covers an app prototype, a wireframe, an HTML deck, design variations or a tweak panel,
  committing a look for a product with no brand, an accessibility audit that fixes what fails, the generic-look,
  hierarchy and interaction-state reviews, a polish pass, or extracting tokens and a component inventory outside a
  DESIGN.md. `design-guidance` still recommends, `design-file-inspection` reports accessibility against a stated
  standard, and `design-file` extracts a DESIGN.md from an existing interface.
- The catalog changed, and the package version did not (`plugin.version` stays 0.5.1): hosts cache a plugin by
  version, and merging a version change into `main` starts `Release Marionette`. Whether to bump it, with a note in
  `docs/releases/`, is for the release.
