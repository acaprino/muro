# Marionette: claude-design-system-prompt pinned to its tag (2026-11-22)

Owner correction of 2026-11-22: the design system prompt is part of Marionette and stays in it. What must not
happen is that a move of its upstream HEAD blocks the release of Muro. The source keeps its commit and changes the
way the commit is anchored (ADR-0009): `pin: head` becomes `pin: release` on the tag `v1-design-prompt`.

## What failed

After the pull request of the Imago 0.3.0 pins (#27) the `Tests` workflow (run 45013089110) and the `Release`
workflow (run 45013089182) failed on `main`: `ValueError: pinned commit 3c3ddb07d7aa3fef051d83608596470c95cfd8fe
does not match remote HEAD e0a46359dcd497e73f1f8a6e953b2e56fb59bef2` (`muro/sources.py`, `source_repository`). The
Tests run ended with 1 failed, 4 errors in the setup of tests that build the release, and the packing step; the
Release run ended in the failed `muro build`. All of it is that one check. Nothing was published.

## What the upstream did (read-only, 2026-11-22)

- `e0a46359` ("Pivot to product-engineer-skills", 10:08Z) deletes both selected paths of the source
  (`claude/system-prompt.md`, `claude/skills/**`) and `codex/**`, and adds other skills. The MIT license is not among
  the changed files. `5e0534c9` (10:37Z) is HEAD now.
- The upstream keeps the old content at the annotated tag `v1-design-prompt`: `git ls-remote` gives the tag object
  `7cd69c7f` and, peeled, `refs/tags/v1-design-prompt^{}` = `3c3ddb07d7aa3fef051d83608596470c95cfd8fe`, the commit
  Marionette has pinned since 2026-11-12. The tag message: "Last version of the design system prompt, before the
  pivot to product-engineer-skills" (tagger date 2026-11-22T09:31:07Z).
- There is no GitHub release (the releases list is empty): the tag is all there is.

## What changed

- `sources.json`: `"pin": "release", "release": "v1-design-prompt"`; `commit` is the same, so the selected files,
  the license, the notices, the coverage and every recorded hash are unchanged. A release-mode pin does not follow
  HEAD: the gate asks the remote for the tag, peels it and requires it to resolve to `commit` (ADR-0009, INV-002).
- The line `## Sources` of the seven capabilities that cite the source (`aesthetic-direction`, `wireframe`,
  `ui-prototype`, `design-options`, `html-deck`, `design-system-extract`, `design-review`): "head" becomes
  "release v1-design-prompt" and "pin `head`" becomes "pin `release`"; nothing else in them changes.
- `ROUTER.md` (the source's bullet) and `records.json` (a new record, `harmonization-21`) say it.
- `tests/test_pin_modes.py` (the manifest row, now with the release sources) and
  `tests/test_claude_design_intake.py` (the pin assertion and the format of the Sources line) follow.

## Left as it was

The intake record of 2026-11-12 and the source-check archive of the same day
(`marionette-ponytail-adhd/prior-11-source-check/`: the pin file and the mirror-index entry say `head`, as it was
then; they are hashed evidence of that check), `history.json`, `CHANGELOG.md`, `records.json` `harmonization-13`. The
package version is not changed (0.5.1), because no catalog, policy or packaged file changed.

## Checks made

Read-only. No test, build, `--validate` or `--check-sources` was run (the owner's rule).

- `git ls-remote -- <repo> refs/tags/v1-design-prompt 'refs/tags/v1-design-prompt^{}'`: the annotated tag peels to
  `3c3ddb07`, as `_tagged_commit` reads it (the peeled line wins).
- The tag name matches the gate's pattern (`[A-Za-z0-9][A-Za-z0-9._+-]*`, no `..`); `release` is given only with
  `pin: release`, as `pin_mode` requires.
- The failed run's traceback comes after the `git fetch` of the commit and its `cat-file`, so the fetch of
  `3c3ddb07` by SHA worked on the runner; only the HEAD comparison failed.

## Not executed

The gate with the new pin, `--check-sources`, the build, the tests and the Release workflow: the first run is the
`Tests` workflow on `develop`. ADR-0009 records that Git proves the tag and its commit and that a tag being a
published, non-draft release is checked by reading the hosting service at intake; here there is no release to read,
so what is verified is the tag only. A new commit pushed to the upstream cannot move the pin; the upstream deleting
or moving the tag would fail the check, which is the intended behaviour of `release` mode.
