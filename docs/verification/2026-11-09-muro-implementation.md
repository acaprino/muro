# Muro implementation verification — 2026-11-09

## Scope

Verified factory, source/license checks, capability/router validation, runtime
workflow, source-specific prompt preparation, transactional release and the five
host launchers. No installation, publication, commit or push was performed.

## Evidence

- `python -m pytest -q -p no:cacheprovider`: **48 passed**. Covers MIT and Apache
  fixtures, remote/local commit verification, selected glob/binary/SPDX paths,
  duplicate/missing/cyclic dependencies, conflicting stacks, merge-audit
  comments, task-specific state and archiving, registered provenance, helper
  dependencies, branding, collision checks, UTF-8 console output and five
  adapter launchers.
- `python muro_build.py --validate`: capabilities and router valid.
- `python muro_build.py --check-sources`: all four pinned sources verified at
  their current HEADs. `taste-skill` was updated from `9b4bf937` to `f6b76575`
  after the HEAD check detected an upstream update. The new `LICENSE` is MIT;
  `skills/taste-skill/assets/effects/fx.js` is included as a required helper
  dependency. Host-specific upstream Stop hooks were not absorbed.
- `python muro_build.py --prepare-intake taste-skill` and the equivalent API
  preparation generated source-specific prompts and selected snapshot files
  under `.muro/factory/`, without executing downloaded code.
- Real release built successfully at `.jcode/local/verification/helpers/muro`.
  It contains runtime, capabilities, four source licenses and all five adapters.
  Every adapter has a self-contained `skills/muro/` folder with runtime,
  capabilities, source helpers and notices.
- `claude plugin validate .jcode/local/verification/helpers/muro`: **Validation
  passed**. The separate directory/publication check still requires a license
  and suggests an icon; no publication was requested or attempted.
- Executed `node scripts/taste-skill/scripts/start.mjs deal --page product
  --no-record` from the real package in an isolated verification folder. It
  loaded `fx.js`, `palettes.json` and `type.json` successfully and emitted three
  palettes and three type pairings. No downloaded asset was fetched and no
  shared recent-history file was used. This proves that helper's dependency
  layout, not the visual quality of a generated page.
- Real launcher flow: generic single-step request returned `work-map`; the
  scroll task returned `visual-direction -> motion-principles ->
  gsap-scrolltrigger`; confirmation loaded only `visual-direction`; recording
  its outputs advanced to `motion-principles`. UTF-8 output works on the
  Windows cp1252 console regression.

## Independent review and fixes

A separate read-only review found one Critical helper-layout defect and four
Important gaps: missing helper imports/resources, unregistered intake
provenance/HEAD enforcement, state leaking between tasks, merge-audit and stack
conflicts, and unused `command`/map identity settings. Those cases now have
passing regression tests. Source helpers preserve relative imports and resource
paths. Releases reject unregistered provenance, outdated HEADs, conflicting
stacks and explicitly supplied installed-identity collisions. New tasks archive
old maps instead of mixing outputs. `plugin.command` selects the skill name and
`plugin.slug` selects the map directory.

## Not verified / open decisions

- Codex, Pi, OpenCode and Hermes interactive sessions have not been run. Their
  launchers share verified Python behavior, but skill registration and native
  invocation must be tested on each installed host. No host collision was
  checked automatically; callers can pass `--host-root` explicitly.
- No end-user UI or website was built or visually evaluated. The helper's
  browser-based `shoot.mjs` was not run.
- Third-party license/template checks do not prove ownership or every asset's
  rights. The Muro project's own distribution license and publication icon have
  not been chosen; this blocks the separate directory-publication profile, not
  the passing manifest validation.
- `ADR-0001` and `ADR-0002` are Accepted. `FRD-0001` remains Proposed: promoting
  the ADRs changed their bytes and therefore invalidated the FRD's pinned
  evidence hashes. The current `frd_tool.py` refuses both promotion and merge
  on that same stale record; no record was manually rewritten.
- The older `dist/muro/` directory was deliberately not overwritten and should
  not be treated as the current verified build. The verified package is under
  the ignored `.jcode/local/verification/helpers/` directory.
