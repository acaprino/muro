# ai-design-skills intake verification — 2026-11-09

## Source and scope

- Repository: `https://github.com/elayadesign/ai-design-skills`
- Pinned commit: `456d9e0d3e2d84c748bb143c6ca3d90c45e16213` (current HEAD at intake)
- Root license verified: **MIT**, `Copyright (c) 2026 Elaya`
- Selected text only: `skills/landing-page-design/SKILL.md` and
  `skills/figma-designer/SKILL.md`
- Excluded: image assets, scripts, tests and workflow files. No external asset
  download or source script execution was performed.

## Integration

- Registered `ai-design-skills` with a source-specific intake goal in
  `sources.json`.
- Merged conversion strategy into `visual-direction`: offer, one primary
  action, page outline, supported proof, content states and responsive
  requirements. `offer` and `page_outline` are now required outputs.
- Added `figma-design`, which requires Figma MCP and `figma-use` to be present
  and explicitly forbids simulating Figma changes when unavailable.
- Preserved `taste-skill` precedence on conflicts: no gradients (including
  text), no fixed font ban, no forced font pairing, and no universal Tailwind
  scale. Retained only compatible strategy, token, accessibility and component
  rules from the new source.
- Generated `NOTICE.md` and `LICENSES/ai-design-skills.txt` retain Elaya's MIT
  copyright. Figma MCP and `figma-use` are declared separately as non-bundled
  external dependencies.

## Evidence

- `python -m pytest -q -p no:cacheprovider`: **53 passed**, including live
  source/license checks, landing strategy outputs and Figma intent routing.
- `python muro_build.py --validate`: capabilities and router valid.
- `python muro_build.py --check-sources`: all five sources verified at their
  pinned HEADs.
- `python muro_build.py --prepare-intake ai-design-skills`: produced
  `.muro/factory/intake/ai-design-skills/` with only selected snapshot files
  and a source-specific prompt.
- Harmonization prompt produced at `.muro/factory/harmonization-ai-design/`.
- Real package generated at `.jcode/local/verification/ai-design/muro`.
- `claude plugin validate .jcode/local/verification/ai-design/muro`: **Validation
  passed**. Its separate publication-directory check still reports the
  previously unchosen distribution license and icon.
- Real Figma task routing returned `visual-direction -> figma-design`.

## Limits

No Figma MCP session or `use_figma` call was made, so no actual Figma file was
created or visually reviewed. Codex, Pi, OpenCode and Hermes interactive
sessions remain untested. No new commit, installation or publication was made.
