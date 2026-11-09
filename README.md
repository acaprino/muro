# Muro — coordinator and factory

Muro builds one branded coordinator from a curated set of MIT/Apache-2.0
sources. The factory verifies pinned Git snapshots and licenses; an agent uses
the prepared intake and harmonization prompts to produce the capabilities and
router. At runtime the coordinator loads **one capability at a time**.

## Commands

Requires Python 3.10+ and Git. Tests additionally require pytest.

```bash
python muro_build.py --validate
python muro_build.py --check-sources
python muro_build.py --prepare-intake taste-skill
python muro_build.py --harmonize
python muro_build.py --build
python -m pytest -q
```

`--prepare-intake` exports the selected source files and a source-specific
`PROMPT.md` under `.muro/factory/intake/<source-id>/`. It does not invoke an LLM
or run downloaded code. Give that prompt to the host agent to generate the
capabilities. `--harmonize` prepares the agent's harmonization prompt under
`.muro/factory/harmonization/`; the resulting router and capabilities must then
pass `--validate` and `--check-sources` before building.

The source checks fetch each remote Git commit in a temporary repository. They
verify selected files, SPDX conflicts, common nested licenses and the approved
license text at that commit, not the current working tree. This does not prove
ownership or all asset rights; inspect third-party assets and notices before
distribution. Local repository paths can be absolute or manifest-relative.

`--build` refuses to replace existing output. A successful build is staged and
moved into `dist/<slug>/` only after all steps succeed. Existing `dist/` content
may predate the current implementation and is not evidence of a verified build.

## Runtime and installation

Every adapter contains a complete `skills/<slug>/` directory: `SKILL.md`,
`muro.py`, the Python package, capabilities, router, source helpers and license
notices. Install the complete skill folder, not just `SKILL.md`.

- **Claude Code:** plugin layout with `.claude-plugin/plugin.json` and
  `skills/muro/SKILL.md`. The installed plugin skill is namespaced by the host;
  the exact command can therefore be `/muro:muro`, not simply `/muro`.
- **Codex:** install the skill under `.agents/skills/` (project) or
  `~/.agents/skills/` (user).
- **OpenCode:** install under `.opencode/skills/` (project) or
  `~/.config/opencode/skills/` (global).
- **Pi:** install under `.agents/skills/` or Pi's skill directory. Pi performs
  the same steps sequentially in-session.
- **Hermes:** use its `skill_view`/skill directory integration. An optional
  `delegate_task` can isolate a step.

The universal fallback inside every skill directory is `python muro.py`.

```bash
python muro.py plan --task "Build a landing page with scroll animation" --project /path/to/project
# Review the plan, then confirm explicitly:
python muro.py plan --task "Build a landing page with scroll animation" --confirm --project /path/to/project
# After completing the returned step, save its required output keys as JSON:
python muro.py record --project /path/to/project --outputs outputs.json
# Record actual check results with their evidence:
python muro.py check --project /path/to/project --result result.json
```

Small tasks return one direct coordinator instruction and no map. Multi-step
work uses `.muro/map.md` and `.muro/state.json` in the target project. Each
returned payload contains only the active capability body. Output and check
results are never invented or marked as passed automatically.

## Verification status and sources

- Python unit/integration tests cover source checks, router behavior, workflow,
  factory preparation and all five generated launchers (48 passing tests).
- `start.mjs` was executed successfully from the real packaged helper, loading
  its palette and type resources; this is a dependency check, not a UI review.
- Claude Code has a real `claude plugin validate` structural check.
- Codex, Pi, OpenCode and Hermes are packaged from their documented skill
  contracts, but no interactive host session has been verified yet. Native
  slash-command names and collisions must be checked at installation time.
- Downloaded helpers are namespaced under `scripts/<source-id>/`; they are not
  automatically executed or independently validated. GSAP remains a separate
  target-project dependency with its own license.
- No plugin installation, publication, commit or push is performed by the build.

Host contract references:
[Claude Code plugins](https://code.claude.com/docs/en/plugins/manifest-reference),
[Claude Code skills](https://code.claude.com/docs/en/skills),
[Codex skills](https://developers.openai.com/codex/skills/),
[OpenCode skills](https://opencode.ai/docs/skills/),
[Pi skills](https://pi.dev/docs/latest/skills).
