# AI-owned routing verification — 2026-11-09

## Scope and baseline

Baseline: `2e0fa680e6efd66d29d2d088294d39baf7fcc761`, plus existing local Figma and
source-integration work. Concurrent ui-ux-pro-max source/helper changes were
preserved and included in the catalog. Owner requests: AI-only classification,
alternative/sequential routing, tool/hook awareness, prevention of conflicting
work, updated documentation/AGENTS.md, autonomous decisions, then commit and push.

Inspected the producer/consumer chain: source manifest and factory preparation,
intake/harmonizer prompts, capability schema and router, runtime AI handoff,
dependency/variant/conflict resolution, state mutation/resume, packaging and
all five generated host adapters. Also inspected existing ADR/FRD expectations
and preserved their historical records with explicit amendment links.

## Behavior and regression evidence

- Initial `tests/test_ai_routing.py`: 17 failures reproduced automatic direct/confirm
  behavior without AI classification. After removing inference: 17 passed.
- Added failing tool/hook catalog tests (missing metadata); implemented passive
  operational catalog records and their validation, then verified passing.
- Added failing tests for multiple output producers, declared cross-role conflicts
  and an existing writer lock; implemented pre-execution rejection and whole
  read/modify/write locking, then verified passing.
- Added missing-prompt factory tests: two failures showed partial output folders;
  preparation now validates/reads prompts before creating the export directory.
- Full suite: `python -m pytest -q --tb=short` → **101 passed** (38.25 s).
  This includes source gates, explicit AI-response validation, new non-UI domain,
  static hero and hover-only selection, unknown/uncertain outcomes, malformed/stale
  responses, forbidden variants/prerequisites, legacy-map archival, evidence
  preservation, hook-policy checks, portable launchers and existing integrations.

## Real integrations and build

`python muro_build.py --validate` → OK: capabilities and ROUTER.md valid.

`python muro_build.py --check-sources` → OK: all sources and plugin identity valid.
This used the real pinned Git sources, including ai-design-skills and ui-ux-pro-max.

A real `build_release` completed at
`C:/Users/alfio/AppData/Local/Temp/opencode/muro-ai-routing-release-20261109/muro`.
It verified the actual source snapshots and packaged all five hosts without
replacing repository `dist/` or installing any plugin. The final reviewed source
will be rebuilt to a fresh location if review changes runtime/package inputs.

`git diff --check` → exit 0 (only local CRLF conversion notices).

## Simulation and limits

Runtime tests supply explicit host-AI response fixtures. They exercise real Python
validation, state transitions and subprocess launchers, not a live model or semantic
accuracy benchmark. Source preparation still does not invoke an LLM: the host AI
must follow the prompts. Validation cannot prove that JSON was AI-authored.

No interactive installed Claude/Codex/OpenCode/Pi/Hermes session, Figma edit, UI
animation or native hook registration was exercised here. Existing helper/UI-source
verification reports remain separate evidence. Tool availability and undeclared
file/semantic effects require the host AI's actual checks. Empty hook arrays mean
none adopted in the scoped catalog, not that entire upstream repositories have no hooks.

ADR-0003 records the implemented owner-requested direction but remains Proposed
pending separate text approval. Final review and integration evidence are recorded
below when available.

## Final review: evidence binding, output handoff and helper paths

The final review left five failing tests in `tests/test_ai_routing.py` (101 passed,
5 failed): late outputs/checks could be recorded into a replacement map (two
parametrizations), evidence was not bound to the active step, capability bodies
told the host to write `.muro/map.md` directly, and helper paths resolved against
the consumer project instead of the installed package.

Implemented:

- Each map gets a fresh `map_id`, returned with every mapped step, `resume` and
  the checks payload. `record` requires that `map_id` and the active step's
  capability; `check` requires that `map_id` and a plan capability owning the
  check, and stores the result with its capability. A state without `map_id` is
  legacy and is not resumed. The CLI takes `--map-id` and `--capability`.
- Every instruction payload returns `package_root`; capability bodies reference
  helpers as `<package_root>/scripts/<source-id>/...`. The previous
  `scripts/taste-skill/start.mjs` path did not exist in a release; the packaged
  path is `scripts/taste-skill/scripts/start.mjs`.
- The five domain capabilities gained `## Output handoff` and no longer instruct
  direct map writes. `prompts/intake.md`, the generated host `SKILL.md`, README,
  ROUTER.md, AGENTS.md and ADR-0004 (EX-004/005, INV-004/005) carry the contract.
- Six existing tests that recorded evidence without a binding were updated to
  pass the binding returned by their step; none was weakened or removed. Four
  tests were added: check ownership, legacy map without identity, the CLI
  boundary, and all five packaged launchers run as subprocesses.

Evidence after the change:

- `python -m pytest -q -p no:cacheprovider` → **110 passed** (52.44 s).
- `python muro_build.py --validate` → OK: capabilities and ROUTER.md valid.
- `python muro_build.py --check-sources` → OK: all sources and plugin identity
  valid (real pinned Git remotes).
- Fresh `build_release` outside the repository, in a temporary directory; all five
  host skill folders contain `scripts/taste-skill/scripts/start.mjs`,
  `scripts/taste-skill/scripts/shoot.mjs`, `scripts/ui-ux-pro-max/scripts/search.py`,
  the `--map-id` instructions and five capabilities with `## Output handoff`.
  Repository `dist/` was not replaced.
- Real run of the packaged Claude Code launcher from a consumer directory outside
  the checkout, real catalog, task "Specify the motion for the pricing page hero":
  `package_root` equalled the installed skill folder; the helper named in the
  instructions existed under it and not under the consumer. `record` without a
  binding, for the wrong step and for another `map_id` each exited 1 and left
  `state.json` byte-identical; the exact binding advanced to `motion-principles`
  on the same map; `check` stored its result with `capability: visual-direction`.
- `claude plugin validate` on that fresh release → Validation passed (structural
  check only; the directory profile was not run).

Limits: the classification in that run was one hand-authored decision and the
recorded outputs were placeholder strings, so it exercises the Python boundary
and launcher, not AI reasoning quality or real design work. Helpers were checked
for presence, not executed. Only the Claude Code launcher was driven by hand; the
other four hosts are covered by the subprocess test, not by an interactive
session. No commit, push, installation or publication was made.
