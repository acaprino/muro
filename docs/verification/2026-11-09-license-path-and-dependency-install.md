# License path gate and runtime dependency installation — 2026-11-09

## Requests

1. Owner: extend the license gate ("facciamo estensione del gate"), so that a
   repository licensing each skill folder separately can be a source. The
   intended first use is the Anthropic `pptx` and `docx` skills.
2. Owner: missing runtime dependencies "dovrebbero installarli se necessario":
   the capability installs them instead of stopping.

No source was added in this change. `sources.json` changed only in the wording
of the GenOffice runtime dependency.

## License path gate

`inspect_source` accepts an optional `license_path`. Recorded in ADR-0006.

- Tests written first: `tests/test_license_path_gate.py`, 21 cases; 19 failed
  before the change and all 21 pass after it. They cover a folder license with no
  root license, the undeclared case, paths outside the license folder, a text
  that does not match, nine unsafe or missing values, a deeper license, five
  license file names under a root license, the explicit root default, and a
  release carrying the declared license and the `NOTICE` beside it.
- Real repository `anthropics/skills` at remote HEAD
  `2c5958ecac7cee2b583967a2c4981d0f4a75c579`, through `check_sources`:

  | Case | Result |
  |---|---|
  | `skills/pptx/SKILL.md` with `skills/pptx/LICENSE.txt` | OK |
  | `skills/docx/SKILL.md` with `skills/docx/LICENSE.txt` | OK |
  | `skills/theme-factory/SKILL.md` with its own license (filled Anthropic notice) | OK |
  | no `license_path` | root LICENSE missing at pinned commit |
  | pptx license with a docx file selected | outside the folder covered by `license_path` |
  | pptx license declared as MIT | does not match the approved template |

- `python muro_build.py --check-sources` → OK: all sources and plugin identity
  valid. The seven registered sources still pass with the wider nested-license
  names.

## Runtime dependency installation

Recorded in ADR-0007 and in `AGENTS.md` with the owner's words.

- `prompts/intake.md`: new "Runtime dependencies" section; installation of the
  skill or plugin itself is still dropped.
- `prompts/classify.md`: an installable missing dependency no longer leads to a
  stop or a switch of capability.
- Generated host `SKILL.md`: step 4 carries the rule.
- `office-deck`, `office-authoring`, `office-files`: a missing GenOffice is
  installed from `https://github.com/genspark-ai/genoffice/releases` and
  confirmed with `genoffice --version`; when the installer needs the user or
  fails, the delivery stops and nothing is simulated.
- Tests updated: the GenOffice body test now asserts the install rule instead of
  "install nothing"; the packaged-launcher test asserts the rule in all five host
  skill files.

## Evidence

- `python -m pytest -q -p no:cacheprovider` → **156 passed** (77.22 s); 135
  before this change.
- `python muro_build.py --validate` → OK: capabilities and ROUTER.md valid.
- Fresh `build_release` in a temporary directory outside the repository: each of
  the five host skill folders has the rule in `SKILL.md`, in
  `prompts/classify.md` and in the three Office capabilities. Repository `dist/`
  was not replaced.
- `claude plugin validate` on that release → Validation passed (structural
  check only).
- `git diff --check` → no whitespace errors.

One partial run of three test files reported 8 errors in test setup. They did
not recur in the next run of the same files or in three full-suite runs. The
cause was not established; a background task output file disappeared from the
temporary directory during the same period.

## Not verified, and limits

- **No installation was executed.** The rule is text for the host AI; no
  capability was run and no dependency was installed on any machine. The
  GenOffice skill gives no unattended install command, so the installer may need
  the user on some platforms.
- The Anthropic `pptx` and `docx` skills are not sources yet. Only the license
  gate was exercised against them; no intake was done. Their folders contain
  OOXML schema files and the repository keeps a root `THIRD_PARTY_NOTICES.md`:
  the gate does not collect that file, and it must be read at intake before any
  script or schema is selected.
- The gate checks the license text and its folder, not ownership or the rights
  to every file in that folder.
- The pinned commit must still equal the remote HEAD.
- No commit, push, installation or publication was made.
