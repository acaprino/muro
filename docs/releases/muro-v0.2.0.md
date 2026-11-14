# Muro 0.2.0

The factory gains its own command line and agentic surfaces
(ADR-0021, ADR-0022; full reference with parameters and examples: `docs/cli.md`).

- One CLI, `muro <command>` (also `python -m muro`; `pip install -e .` gives
  the `muro` console command). The legacy `muro_build.py` flags keep working
  unchanged and are frozen.
- Two new factory operations: `muro review` prepares a host-AI re-examination
  of the package's recorded decisions against its pinned sources, and `muro
  baseline` reports, read-only, how each pin stands against its upstream —
  including `drifted` when a pinned tag was deleted or force-moved (exit 1
  when anything moved, `--json` for watchers).
- `muro mcp`: an MCP stdio server exposing the factory's operations, so an MCP
  host (Claude Code, Codex) drives intake, harmonization and review with its
  own tools and permissions.
- `muro agent intake|harmonize|review`: the same AI-owned steps through an
  OpenAI-compatible endpoint — key from an environment variable only, https
  required off localhost, answers restricted to allowlisted package paths,
  validation-driven repair rounds that also remove a rejected round's stale
  files.
- The keeper flow: `muro init` scaffolds a pinned, license-gated single-source
  package from a repository link; `muro install` executes a built adapter's
  own INSTALL.md against a harness home you name (rerunnable: an
  already-registered marketplace is kept); `muro absorb` chains init → agent
  intake → agent harmonize → build → install.
- Fixes from the same-day ten-finding code review, among them the `drifted`
  detection, the agent repair-round robustness and the OpenCode user-level
  config path (`docs/verification/2026-11-14-CLI3-review-fixes.md`).

Verification: `python -m pytest -q` 575 passed, 15 skipped; live MCP call from
a real headless Claude Code session; live `muro install` (first run and
re-run) of the built Marionette adapter into a fresh Claude home
(`docs/verification/2026-11-14-CLI1…CLI3`).

Not executed: `muro agent` against a real LLM endpoint (mechanics proven on a
scripted endpoint only); `muro install` on real Codex and Pi hosts; a
single-file executable (the console command needs an editable install from a
source tree); Windows.
