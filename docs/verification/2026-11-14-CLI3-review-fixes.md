# CLI3 — fixes from the deep code review of the CLI work (2026-11-14)

Linux container (cloud session), Python 3.13. A ten-finding code review of the
ADR-0021/0022 work was run the same day; every finding was fixed. Amendments:
ADR-0021 (baseline `drifted`) and ADR-0022 (agent repair, install rerunnability).

## Fixes

| Finding | Fix |
| --- | --- |
| Harmonize parse error aborted the agent instead of a repair round | One shared `_captured` (muro/cli.py) with the (OSError, ValueError) net; muro/mcp.py uses it. A parse crash now returns as the repair report |
| Stale files from a rejected agent round poisoned later validation | `run_step` tracks what each round wrote and removes files a repair round no longer names |
| `baseline` missed a retagged upstream | Release pins now verify the tag exists upstream and still points at the pinned commit; `drifted` status otherwise |
| OpenCode install wrote config where a fresh home may not read it | Fresh home → `.config/opencode/opencode.json`; an existing project-form `opencode.json` still wins |
| `lstrip("./")` mangled dotted paths and rewrote `../x` | Only an exact leading `./` is stripped; traversal stays visible and is rejected |
| Re-running claude/codex install failed at `marketplace add` | The host's "already exists" answer is tolerated for that one step; the plugin install still runs. Live re-run passed, though via the normal path (below) |
| Empty `ls-remote HEAD` raised uncaught IndexError (pre-existing) | Guarded; becomes a per-source error row |
| Duplicate `_captured` in cli.py and mcp.py | Deduplicated into cli.py |
| `absorb` validated twice back-to-back | Second call removed (harmonize already validated; build re-checks) |
| Failed `init` left an empty package directory | The directory it created is removed when it stayed empty |

## Checks run

| Check | Result |
| --- | --- |
| `python -m pytest -q` | 575 passed, 15 skipped (9 new/updated tests in `tests/test_agentic.py`) |
| `python muro_build.py --manifest examples/marionette/sources.json --validate` | OK |
| **Live re-install (claude-code)**: `muro install` run a second time into the home of the CLI2 live install | exit 0. On this Claude Code (2.1.325) re-adding the same marketplace path is simply accepted, so the run took the normal path; the "already exists" tolerance was NOT hit live and is exercised only by the monkeypatched tests |

New tests: moved and deleted pinned tag → `drifted`; stale-file cleanup across
agent rounds; `_captured` turns a parse crash into a repair report; traversal
survives parsing and is rejected; fresh-home OpenCode path and project-form
precedence; tolerated "already exists" with a still-raising network failure;
failed `init` leaves no directory.

## Not executed

Codex and Pi installs remain unexecuted on real hosts (CLIs absent here); the
"already exists" tolerance for Codex is the same code path as Claude Code's,
exercised only through the monkeypatched test. Windows remains unexercised.
