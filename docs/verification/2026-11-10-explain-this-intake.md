# explain-this intake and delivery verification — 2026-11-10

## Source and intake

- Repository: `analyticalmonk/explain-this` (plugin 0.1.1), original, not a fork,
  not archived; last commit 2026-07-08, last push 2026-10-26.
- Pinned current HEAD: `f64dab456ca23a351fe4d932c4e73bc91d3f2c52`
- License verified: **MIT**, `Copyright (c) 2026 analyticalmonk` (root `LICENSE`).
- Intake scope: the three `SKILL.md` (`creating-explainers`,
  `explaining-codebases`, `fact-checking-explainers`), their `references/**` and
  `skills/creating-explainers/assets/article-template.html`. Excluded: both
  plugin manifests, `skills/**/agents/**`, `docs/**`, `evals/**`, `AGENTS.md`,
  `CLAUDE.md`.
- `runtime_deps` is empty: the explainer is vanilla HTML, CSS and JS. The page
  itself loads Google Fonts; a browser and `python -m http.server` are optional
  viewing aids for which the source gives no install method.
- Hooks: none in the selected files or in the two plugin manifests. `docs/**`
  and `evals/**` were not inspected for hooks.
- `python muro_build.py --prepare-intake explain-this` passed the license and
  pin gate and exported the snapshot and prompt to
  `.muro/factory/intake/explain-this/`.

## Classification and harmonization (AI-authored)

| Upstream skill | Capability | Intents |
|---|---|---|
| creating-explainers | `interactive-explainer` | `explainer.source-walkthrough`, `explainer.topic-research` |
| explaining-codebases | `interactive-explainer` | `explainer.codebase-walkthrough` |
| fact-checking-explainers | `explainer-fact-check`, and steps 2 and 7 of `interactive-explainer` | `explainer.fact-check` |

- The two authoring skills produce the same artifact, so they are one role
  (`explainer-authoring`) with one owner of `explainer_file`.
- Upstream calls the fact-check skill as a blocking gate. With one capability
  per step, the gate is written into the authoring step (check
  `claims_gate_passed`) so the classifier cannot leave it out; the standalone
  capability covers an article that already exists. It has no `after`, because a
  prerequisite would force authoring before checking somebody else's article.
- No `conflicts`, no stack constraint, no output shared with another capability.
  Boundaries are in the intent `excludes`: a chat explanation, a deck or
  document, a landing page or app screen are not explainers.
- The upstream pause for outline approval is kept as the step's only planned
  pause. The zero-dependency rule overrides the consumer project's own stack
  inside the article folder only.

## Evidence

- `tests/test_explain_this_intake.py`: **10 passed** (manifest scope, router
  parity, passive tools and hooks, helper paths, output ownership, direct step,
  no-match, wrong intent rejected, ordered plan with `office-deck`).
- `python -m pytest -q -p no:cacheprovider`: **166 passed** (156 before).
- `python muro_build.py --validate`: catalog and router valid.
- `python muro_build.py --check-sources`: **failed on `genoffice`**, not on this
  source: its pin `d8eb53ba` no longer equals the remote HEAD `8dc3bd16`. This
  is the drift announced in the GenOffice record. `sources.json` was not
  re-pinned: the new upstream content has not been reviewed.
- Fresh release built with `build_release` into a temporary directory outside
  the repository, from a temporary copy of the manifest in which only the
  `genoffice` commit was moved to its remote HEAD so the build could run. All
  five host folders contain both capabilities, `LICENSES/explain-this.txt` and
  the 13 selected files under `scripts/explain-this/skills/`; `NOTICE.md` lists
  `Copyright (c) 2026 analyticalmonk`. Repository `dist/` was not replaced.
- `claude plugin validate` on that release: Validation passed (structural only).
- Packaged Claude Code launcher run from a consumer directory outside the
  checkout, task "Trasforma questo paper in un explainer interattivo":
  `classification-required` with eleven catalog entries; a hand-authored
  decision selecting `interactive-explainer` / `explainer.source-walkthrough`
  returned `direct` with outputs `explainer_outline`, `explainer_file`,
  `explainer_claims`. The template and two references resolved under the
  returned `package_root`. No state was written in the consumer directory.

## Limits

- Runtime decisions are fixtures or one hand-authored decision; they do not
  measure AI classification quality.
- No explainer was generated, no figure rendered, no fact-check performed on a
  real article. The packaged helpers were checked for presence, not for the
  quality of their guidance.
- The temporary release shipped an unreviewed GenOffice snapshot and proves
  packaging only. A release from the repository manifest needs the `genoffice`
  pin decided first.
- `python muro_build.py --harmonize` stopped with WinError 183 because
  `.muro/factory/harmonization` already exists; harmonization was done from
  `prompts/harmonizer.md` read directly.
- Codex, Pi, OpenCode and Hermes interactive sessions remain unverified. No
  commit, push, installation or publication was made.

## Addendum — GenOffice re-pin, same day (owner request)

- Reviewed `d8eb53ba..8dc3bd16` (15 commits, 66 files). The only selected path,
  `skills/genoffice/SKILL.md`, changes in two lines: skill version 2.69.0 →
  2.70.0, and the tool list of the GenOffice app's own MCP server on
  `127.0.0.1:3093` gains `check_document` and `convert_document`. `cli` stays
  `>=0.9.0`; `LICENSE` and `NOTICE` are unchanged.
- No capability changes behavior: the three Office capabilities drive the
  `genoffice` command line (or `genoffice mcp`), not the app's editor server.
  Only their `## Sources` line moves to `8dc3bd16`, skill 2.70.0.
- `sources.json` and `tests/test_genoffice_intake.py` carry the new pin.
- `python muro_build.py --check-sources` → OK: all eight sources valid.
- `python -m pytest -q -p no:cacheprovider` → **170 passed**.
- Fresh `build_release` from the repository manifest into a temporary directory:
  five host folders, packaged GenOffice `SKILL.md` at 2.70.0;
  `claude plugin validate` → Validation passed. This replaces the earlier
  release built from a temporary manifest. `dist/` was not replaced.
- The drift will recur at the next upstream commit; the pin policy for this
  source is still an open owner decision.

## Superseded the same day

The GenOffice pin `8dc3bd16` above was replaced by the release pin `v0.12.852`
when the owner chose published releases over HEAD. See
[the pin-mode record](2026-11-10-pin-modes-and-release-pins.md). explain-this
publishes no release and is pinned `head` at `f64dab45`.
