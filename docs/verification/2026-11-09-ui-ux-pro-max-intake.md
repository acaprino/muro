# UI UX Pro Max intake and delivery verification — 2026-11-09

## Source and intake

- Repository: `nextlevelbuilder/ui-ux-pro-max-skill`
- Pinned current HEAD: `4f2dbb67e64969a9a30ab00742f2d55d66ddec2b`
- License verified: **MIT**, `Copyright (c) 2024 Next Level Builder`
- Intake scope: `ui-ux-pro-max/SKILL.md`, quick/pro references, search/core/
  design-system/reasoning scripts and local data. Premium assets, screenshots,
  CLI installers, unrelated skills and test/template trees were excluded.
- `sources.json` records a source-specific goal and Python 3.10+ as a separate
  runtime prerequisite. No installation or external asset download was run.
- `python muro_build.py --prepare-intake ui-ux-pro-max` produced the selected
  snapshot and source-specific prompt under `.muro/factory/intake/ui-ux-pro-max/`.
  Harmonization prompt: `.muro/factory/harmonization-ui-ux-pro-max/`.

## Integration and contract

`visual-direction` now returns `design_candidates` and `stack_guidance` before
its visual choices, alongside `offer` and `page_outline`. Search recommendations
must be checked for domain/product fit and an explicitly detected stack. Empty
or off-topic matches are disclosed, never fabricated. Existing design decisions
are not overwritten with `--force`.

Current capabilities also carry AI-authored `intents`, passive `tools`/`hooks`
metadata and `conflicts`. No upstream hook is activated. `ADR-0003` documents AI
classification; the new Proposed `ADR-0004` covers incompatible capabilities,
single-producer outputs and the exclusive map writer lock. The ADR generator
could not reindex ADR-0003's incomplete frontmatter, so its manual index note
was left outside the generated block.

## Evidence

- `python -m pytest -q -p no:cacheprovider`: **99 passed**, including source
  gates, AI decision validation, output ownership, conflict guards and a busy
  writer leaving state byte-identical.
- `python muro_build.py --validate`: catalog and router valid.
- `python muro_build.py --check-sources`: all six sources verified at their
  pinned HEADs.
- Fresh release: `.jcode/local/verification/ui-ux-pro-max-delivery/muro`.
- `claude plugin validate .jcode/local/verification/ui-ux-pro-max-delivery/muro`:
  **Validation passed**. The separate publication-directory profile still
  requires a distribution license and icon; neither was chosen.
- Executed `scripts/ui-ux-pro-max/scripts/search.py` with
  `"internal operations dashboard" --design-system --json` from the packaged
  helper in an isolated verification directory. It returned a structured
  dashboard recommendation with pattern `Hero + Features + CTA`, style
  `minimalism-and-swiss-style`, colors, typography and no persistence writes.
  This was a real offline execution of the packaged helper, not an LLM semantic
  evaluation or visual review.
- `NOTICE.md` and `LICENSES/ui-ux-pro-max.txt` retain Next Level Builder's
  copyright. Figma MCP and Python remain separate non-bundled dependencies.

## Limits

No interactive Figma session or end-user website visual evaluation was run.
Codex, Pi, OpenCode and Hermes interactive sessions remain unverified. No new
commit, push, installation or publication was made. The older `dist/` content
was not replaced.
