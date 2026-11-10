# GenOffice intake and delivery verification — 2026-11-09

## Request and source

Owner request: include GenOffice to generate Office documents.

- Repository: `genspark-ai/genoffice`, pinned at the remote HEAD
  `d8eb53baed18327b83d8655147c4759b8c44639c` (2026-11-09).
- License: **Apache-2.0**, `Copyright 2026 Mainfunc, Inc.`, with a root `NOTICE`.
- Selected: `skills/genoffice/SKILL.md` (skill 2.69.0, `cli: >=0.9.0`), read in
  full for the intake.
- Excluded: `ee/**` (GenOffice Enterprise License, not Apache-2.0),
  `skills/recommended/**` (48 separate scenario skills and their locale files,
  two sampled, none taken in), application, packaging, tooling and test trees.
- Runtime dependency: the GenOffice app and its `genoffice` command line,
  installed by the user; not bundled or installed by Muro.

## Factory changes required by the source

1. **License gate.** The pinned `LICENSE` fills the Apache appendix notice, so
   the whole-text hash rejected it. The gate now accepts exactly one plain
   copyright line in that slot and still compares everything else with the
   template. Tests written first: 5 failed before the change.
2. **NOTICE copyright lines.** The first fresh release listed two lines of the
   license terms ("copyright notice that is included in…", "copyright license to
   reproduce…") as copyright notices of GenOffice. `NOTICE.md` now takes
   notices only from the MIT header or the filled Apache appendix line. Tests
   written first: 2 failed before the change. The defect predates this source;
   it was not visible with MIT-only sources.

Both rules are recorded in ADR-0005 (Proposed).

## Intake and harmonization

`python muro_build.py --prepare-intake genoffice` exported the selected snapshot
and source-specific prompt to `.muro/factory/intake/genoffice/`; the
harmonization prompt is in `.muro/factory/harmonization-genoffice/`. Neither
command calls an LLM. The classification below was authored by the AI doing the
intake from the skill's content.

| Capability | Role | Intents |
|---|---|---|
| `office-deck` | deck-authoring | `office.presentation-creation` |
| `office-authoring` | document-authoring | `office.document-creation`, `office.spreadsheet-creation` |
| `office-files` | office-file-operations | `office.file-editing`, `office.format-conversion`, `office.content-extraction`, `office.editor-handoff` |

No stack constraint, prerequisite, conflict or hook. Each capability requires
the logical tool `genoffice-cli`; the provider-backed `search`, `image` and
`media` commands are an optional tool marked as sending data off the machine,
and give no standalone intent. Skill, MCP and CLI installation or registration
commands were dropped. The selected file defines no hook; the rest of the
upstream repository was not inspected for hooks.

## Evidence

- `python -m pytest -q -p no:cacheprovider` → **135 passed** (56.48 s); 110
  before this work. New: `tests/test_apache_notice_gate.py` (14) and
  `tests/test_genoffice_intake.py` (11).
- `python muro_build.py --validate` → OK: capabilities and ROUTER.md valid.
- `python muro_build.py --check-sources` → OK: all sources and plugin identity
  valid, against the seven real pinned remotes. One earlier run failed on
  another source with Windows error 1455 (paging file too small) while Git was
  fetching; the rerun and two full builds passed.
- Fresh `build_release` in a temporary directory outside the repository: all
  five host skill folders contain the three Office capabilities,
  `LICENSES/genoffice.txt` and the upstream NOTICE text; the GenOffice block of
  `NOTICE.md` lists only `Copyright 2026 Mainfunc, Inc.`; every capability
  carries the Apache modification comment; the runtime dependency is listed as
  not bundled. Repository `dist/` was not replaced.
- `claude plugin validate` on that release → Validation passed (structural
  check only).
- Packaged Claude Code launcher run from a consumer directory outside the
  checkout, task "Prepara una presentazione di 6 slide sul piano commerciale
  2027": `classification-required` with nine catalog entries; a hand-authored
  decision selecting `office-deck` / `office.presentation-creation` returned
  `direct` with outputs `deck_outline`, `deck_file`, `deck_review`.

## Not verified, and limits

- **No Office file was generated.** GenOffice is not installed on this machine
  (`genoffice` is not on PATH, there is no `~/.genoffice/launcher` and no default
  install directory), so no `genoffice` command was executed. The command
  syntax in the capabilities is transcribed from the skill, not exercised.
- Runtime decisions in tests and in the launcher run are fixtures or one
  hand-authored decision; they do not measure AI classification quality.
- There is no live remote test for this source: the factory requires the pin to
  equal the remote HEAD and upstream made 6 to 64 commits a day in the previous
  week, so `--check-sources` and `--build` will fail on the next upstream commit
  until the source is re-pinned and re-reviewed.
- The release packages the original 77 KB `SKILL.md` under
  `scripts/genoffice/`, as it does for every source's selected files.
- JanuraCode ships a different GenOffice surface: an embedded engine exposed as
  a host tool with JSON actions (`create`, `modify`, `inspect`, `guide`,
  `render`; no PDF, conversion, cloud or external CLI) and its own adapted skill
  (2.68.0, upstream `4b55db9e`). These capabilities target the upstream command
  line and stop at their engine check inside JanuraCode. Which engine Muro
  should drive there is an open owner decision.
- The JanuraCode source (`Tri-tech-solutions/tri-opencode-desktop`) pins the
  same upstream to published releases only (`v0.12.852`, skill 2.68.0) and
  records that a newer `main` is not an update. Muro's factory instead requires
  the pin to equal the remote HEAD, which is why this source is pinned to `main`
  (skill 2.69.0). The two policies differ; aligning them is not decided.
- No commit, push, installation or publication was made.

## Amendment, later on 2026-11-09

By owner decision the three capabilities no longer stop when GenOffice is
missing: they install it from its official releases and then continue
(ADR-0007). The statements above that the dependency is "installed by the user"
and that nothing is installed describe the state before that decision. See
[the license path and dependency record](2026-11-09-license-path-and-dependency-install.md).
