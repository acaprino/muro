# A project file written on Windows keeps its executable files (2026-11-26)

The defect is recorded in `2026-11-26-project-store-real-repositories.md`: `muro/project.py` asked the disk
whether a file is executable, and Windows keeps no such bit, so a project file packed there marked nothing
executable under `release/`. The owner asked for the fix the same day. Factory: branch `exec-bit` from `develop`
(`aff9a35`).

## The two truths

Measured on two real project files written on Linux (2,632 and 5,562 members under `release/`):

- **The built plugin.** The executable members are exactly the files under a `scripts/` folder that start with
  `#!`: 126 of 126 and 467 of 467, and no file that starts so lies outside a `scripts/` folder. That is the
  build's own rule (`copy_source_helpers` makes such a helper executable, whatever its mode in Git).
- **The inputs.** They follow Git's mode at the pin, which is another set: 13 executable against 21 that start
  with `#!` in the first file, 67 against 77 in the second.

No member outside `release/` and `inputs/` is executable in either file.

## The change

- `muro/factory.py`: the rule is one function, `starts_as_script`; the build and the pack both ask it.
- `muro/project.py`: `pack` marks a helper of the build by that rule when the disk says no (`_add_release`). The
  sources cache keeps the names of an entry's executable files beside its stamp (`<commit>.modes`), written by
  `_seal`; an entry without that file is fetched again, so a cache made before the fix is never trusted.
  `executable_members` reads the names a project file marks.
- `muro/project_work.py`: `edit` and `commit` fill their cache from the unpacked file and give it those names
  from the file itself (`seed_cache`).
- A package's own files (`capabilities/`, `prompts/`, `custom-instructions/`) are still asked of the disk: a
  `shortcut:` comment in `_add_tree` says so. No real project has an executable file there.

`_seal(cache, src)` still works with two arguments (an entry filled by hand names no executable file): a
project's repository calls it in its own tests.

## Tests

Three new ones, written first and seen to fail (`3 failed`) before the change:

- `test_a_disk_that_keeps_no_executable_bit_packs_the_same_file`: a source with a file that is executable in Git
  and one that only starts with `#!`, a build with both as helpers and a launcher that starts with `#!` outside
  `scripts/`. Packed once from Git, and once from the cache with the disk answering no for every file: the same
  bytes, and exactly the expected names marked.
- `test_a_cache_entry_that_names_no_executable_files_is_fetched_again`.
- `test_an_edit_and_a_commit_keep_the_executable_files_on_a_disk_that_has_no_such_bit`, with a release built by
  the real factory.

On Linux the disk keeps the bit, so the tests make it answer no (`project._executable`). On the developer machine
(Windows 11, Python 3.13) the disk really has none: `python -m pytest -q tests/test_project_file.py
tests/test_project_work.py tests/test_project_store.py tests/test_project_release.py tests/test_project_extract.py
tests/test_project_layout.py -p no:cacheprovider`: 383 passed, 1 skipped.

## Run for real on Windows

The two Linux-made files, copied to a scratch folder and rewritten by this branch's Muro on the developer
machine, where the unpacked folder shows 0 executable files:

| | Marked executable under `release/` | under `inputs/` | Same names as the original |
| --- | --- | --- | --- |
| First file, original | 126 | 13 | |
| after `edit` | 126 | 13 | yes |
| after an unpack and `commit --step none` (the release is built again here) | 126 | 13 | yes |
| Second file, original | 467 | 67 | |
| after `edit` | 467 | 67 | yes |
| after an unpack and `commit --step none` | 467 | 67 | yes |

## Found on the way, not fixed: line endings of a build made on Windows

The rebuilt release has the same file names as the Linux one, and 616 files of the first project (824 of the
second) differ from it only in line endings. Two causes were seen in the first project's root folder (91 of its
422 files have CRLF, none in the Linux build): the factory's own files, copied from a checkout that Git wrote
with CRLF (`muro/*.py`, `prompts/`), and files the build writes as text (`capabilities/*.md` after the notice
line is added, `NOTICE.md`, the manifests), which Python writes with the platform's line ending. The helpers of
the sources are written as bytes and do not change. Another session saw the same on the same day.

## Not run

- The app: **Release…** and a harmonization from the window run the released Muro, not this branch. Until a
  release carries the change, a file written by the app on Windows still loses the marks.
- A release to a store of a file rewritten on Windows.
- macOS.
