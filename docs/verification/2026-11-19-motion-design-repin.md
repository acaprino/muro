# motion-design re-pinned to head d77a9fc8 (2026-11-19)

## Why

The `Tests` workflow failed on `develop` at `7f7cfec` (run 44503916097: 1 failed, 4 errors, 728 passed,
16 skipped). Every failure had the same cause: `motion-design` follows its upstream head (`pin: head`), and
the gate refuses a head pin that is not the remote HEAD (`pinned commit 2e1f3c05… does not match remote
HEAD d77a9fc8…`). LottieFiles merged one pull request into `motion-design-skill` on 2026-11-19. The failing
tests build a Marionette release: `test_live_host_fixes`, and in their setup
`test_capabilities_read_originals`, `test_claude_design_intake` and `test_tokeneconomizer_intake`.

`python -m muro baseline --manifest examples/marionette/sources.json` the same morning: `motion-design`
behind (head `2e1f3c052dd7`, upstream `d77a9fc8cb37`), `genoffice` behind (release `v0.12.852`, upstream
`v0.13.18`), the other 15 current. A release pin that is behind passes the gate; `genoffice` was not
re-pinned here.

## Upstream change

`2e1f3c05..d77a9fc8`: `4cc6b0d` "Fix install commands with exact client-specific syntax" (2026-11-17) and
its merge `d77a9fc` (pull request #7). Changed files: `README.md` (not selected) and
`skills/motion-design/reference/export-and-render.md` (+43, −4), the only change in the selected paths.
`LICENSE` is unchanged; the source has no `NOTICE`.

The file now gives the Codex install as `codex mcp add creator-mcp --url …` and `codex mcp login
creator-mcp`, the Cursor install as an entry in `~/.cursor/mcp.json`, and a `## Handoff Template` with the
command for the user's client when it is known and the setup guide link otherwise. Its headings
(`## Installation`, `## Handoff Template`, `## Applying Motion Design Principles with Creator MCP`) are
unchanged, so the sections that `motion-principles` step 0 names still exist. The rule "Only suggest once
per conversation" is unchanged.

## Package changes

- `examples/marionette/sources.json`: `commit` d77a9fc8cb371cab1ba5420df5bfd232cd14c9bb, still `pin: head`.
- `capabilities/motion-principles.md` and `capabilities/css-scroll.md`: the `## Sources` pin. In
  `motion-principles`, a re-pin line, and the runtime dependency line, which said the file gives "the
  server address for Codex and Cursor", now says it gives the commands for Claude Code and Codex and the
  configuration entry for Cursor (ADR-0017: a generated text does not misstate the source). Step 0 is
  unchanged.
- `ROUTER.md`: one harmonization record line (79 of 80 text lines).
- `tests/test_motion_design_intake.py`: `COMMIT`.
- `delivery.json`: reviewed, unchanged. The selected parts and their forms are the same; the changed file
  stays a reference the capability opens on demand.

## Evidence

| Command | Result |
| --- | --- |
| `python -m muro intake motion-design --manifest examples/marionette/sources.json` | `coverage.json`: 18 selected files; `referenced` empty; `left_out` `.gitignore`, `LICENSE`, `README.md` |
| `python muro_build.py --manifest examples/marionette/sources.json --validate` | `OK: capabilities and ROUTER.md valid` |
| `python muro_build.py --manifest examples/marionette/sources.json --check-sources` | first run: `[motion-design] … Empty reply from server` (network); second run: `OK: all sources and plugin identity valid` |
| `python -m pytest -q tests/test_motion_design_intake.py tests/test_live_host_fixes.py tests/test_capabilities_read_originals.py tests/test_claude_design_intake.py tests/test_tokeneconomizer_intake.py` | 48 passed before Claude Code stopped the run for low memory on the machine, with no summary line; the evidence is the `Tests` workflow on the commit that carries this record |

## Not executed

- Marionette's version stays 0.4.0. Its packaged files changed, so the next Marionette release needs a
  version bump (AGENTS.md, "Releasing"); no Marionette release was requested.
- No live host run of a rendered-file request after the re-pin.
- `genoffice` stays at `v0.12.852`.
