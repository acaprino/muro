# CLI1 — factory CLI executable, review and baseline commands (2026-11-14)

Linux container (cloud session), Python 3.13, Git 2.x. Change: ADR-0021
(`muro/cli.py` subcommands + legacy flags, `muro/__main__.py`,
`muro/baseline.py`, `review_prompt` in `muro/factory.py`, `prompts/review.md`,
`pyproject.toml` console script). Windows was not exercised in this run; the
console-script shim (`muro.exe`) and the suite on Windows remain to be run
there.

## Checks run

| Check | Result |
| --- | --- |
| `python -m pytest -q` | 551 passed, 15 skipped (includes the 12 new tests in `tests/test_cli.py`) |
| `python -m muro validate --manifest examples/marionette/sources.json` | OK |
| `python muro_build.py --manifest examples/marionette/sources.json --validate` (legacy) | OK, byte-identical output (asserted in `test_subcommand_and_legacy_validate_agree`) |
| `python muro_build.py --manifest ... --check-sources` (pinned remotes) | OK: all sources and plugin identity valid |
| `python -m muro build --manifest ... --out <scratch>` | Built marionette |
| `pip install -e .` then `muro validate` from an unrelated directory | OK (console script works outside the checkout) |
| `python -m muro review --manifest ...` | PROMPT.md staged in `.muro/factory/review/` |
| `python -m muro baseline --manifest ...` (live, pinned remotes) | 15 sources: 14 current, 1 behind — genoffice v0.12.852 → upstream v0.13.18; exit 1 |

## New tests (`tests/test_cli.py`)

Release pin behind with prereleases skipped; head and static pins; unreachable
remote as an `error` row, not a crash; unreadable tag scheme as `unknown`;
subcommand/legacy output equality; unknown command rejected; missing manifest;
`python -m muro` entry; baseline `--json` shape and exit codes; review bundle
contents; review workbench replacing only its own artifacts (a foreign file
blocks it); review via CLI on a package copy.

## Limits

- The baseline tag comparison is a mechanical numeric sort over same-prefix,
  non-prerelease tags; schemes it cannot read are reported `unknown`.
- The console script requires an editable install from a checkout or release
  source tree (ADR-0021 §5); no single-file executable is claimed.
- Live `baseline` contacted the pinned remotes once; no rate/latency behaviour
  beyond that run is claimed, and nothing was re-pinned.
