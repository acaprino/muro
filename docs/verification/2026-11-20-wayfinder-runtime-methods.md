# Wayfinder runtime dependency completion (2026-11-20)

Review finding C3: `work-map` claimed to perform grilling, domain modeling, prototyping and implementation inline while their source methods were unselected and unread. The dependency closure is now selected at the existing pin; the coordinator loads the needed originals instead of reconstructing their methods from names.

## Source evidence

- Repository: `mattpocock/skills`.
- Release pin retained: `v1.3.2`, commit `d1478fcb140db0b93c0c8df17bcfd311844749d0`.
- Re-read the upstream tag through the GitHub API: annotated tag `85cbec972d7a79c278c793d272f7fc715850fad4` still resolves to that exact commit.
- Read the complete pinned Git tree through the GitHub API (`truncated: false`) and all 20 selected runtime text files plus root MIT license. Each returned text was verified against its Git blob SHA using `SHA1('blob ' + byte_length + NUL + UTF-8 bytes)`: 21/21 matched.
- Read all four missing methods and their transitive runtime references before changing selection: domain glossary/ADR formats; both prototype branches; implement's TDD/review handoffs; TDD's test/mocking guidance and codebase-design references.
- The manifest adds 15 files; Wayfinder now selects 20 runtime files. Source pin and runtime originals are unchanged.

| Pinned file | Git blob SHA |
|---|---|
| `skills/engineering/code-review/SKILL.md` | `83183e0ad36fd0eef25d37c7e483284b7e34c1f0` |
| `skills/engineering/codebase-design/DEEPENING.md` | `cd94075cfd754d147555c5d747a16431ed4c7dd8` |
| `skills/engineering/codebase-design/DESIGN-IT-TWICE.md` | `aebdc9f8c05b40d7832de38e2fd8380e1e5507ac` |
| `skills/engineering/codebase-design/SKILL.md` | `3f63c8146dd2604b419c929e9876b90c30d410e9` |
| `skills/engineering/domain-modeling/ADR-FORMAT.md` | `d7e61f30a9fd8ca70d9ee68f019c2a9ebf2d13f7` |
| `skills/engineering/domain-modeling/GLOSSARY-FORMAT.md` | `9c0b4c7a2e8507c23cbb5e0baa66d81699321cc6` |
| `skills/engineering/domain-modeling/SKILL.md` | `a4438c6879c517d1a08e2b5fbca049b632688dfe` |
| `skills/engineering/implement/SKILL.md` | `bd49e472984c7b99aac40286fdae749bb955a842` |
| `skills/engineering/prototype/LOGIC.md` | `32be86a0a5d9928db84b3988e55f9debe476ab40` |
| `skills/engineering/prototype/SKILL.md` | `a0044501fe0d385b4d8575b610188ede9b236ccf` |
| `skills/engineering/prototype/UI.md` | `3977951663490882c2632b40695d9f59a2fe2408` |
| `skills/engineering/tdd/SKILL.md` | `01eadaa34e7c9a63a67d6dc3cce1cc81b0e49985` |
| `skills/engineering/tdd/mocking.md` | `71cbfee674d93244ce81d1830b930ca9a69200bd` |
| `skills/engineering/tdd/tests.md` | `7ab86479f925a1f9e8ba680af33cb3b12e015381` |
| `skills/productivity/grilling/SKILL.md` | `d2f09a18e6a6c65c55f1271ba08dfeaf06f0bed3` |
| `skills/engineering/wayfinder/SKILL.md` | `975d6bf9c0a49d18a651f3335e0b4dcf8650fe31` |
| `docs/engineering/wayfinder.md` | `607f6556d56bc1b96b86baba442cc9cda451ba93` |
| `skills/engineering/to-spec/SKILL.md` | `3f52599ae2a4347aee5a07432c2707518e691a7f` |
| `skills/engineering/to-tickets/SKILL.md` | `9b77a01db9460c99c22d03c910c349f890f12c0e` |
| `skills/engineering/research/SKILL.md` | `ffc9eb89849cc4cf74962ce93d786ffd17c6a5dc` |
| `LICENSE` | `f1dd2c09108dde1a5f56097cee8461b3ea834499` |

## Delivery decisions

- One `work-map` owner still coordinates the engineering change. Source Skill-tool calls become reads of packaged `SKILL.source.md` files; methods retain their rules and required reference files.
- Grilling retains decision-frontier rounds, environment investigation, user answers and final shared-understanding confirmation. Domain modeling retains inline glossary updates, contexts and the three-part ADR condition.
- Prototype retains its distinct logic/UI methods, throwaway constraints, variant counts and user-owned decision. Its no-test rule applies to the throwaway artifact; Ponytail and source implementation checks govern production promotion.
- Implementation retains TDD where possible at pre-agreed seams, recurring typecheck/single-test checks, an end-of-work full suite at the project's authorized execution location, and the Standards/Spec review axes. A report does not claim independent review where the host has no subagents.
- The source's HEAD-only review would omit the uncommitted work that implement asks to review before its final commit. The coexistence record explicitly binds review to the actual current change and its baseline, including uncommitted files.
- Tracker operations and pushed prototype/research branches remain replaced by explicit local records under the original intake goal. Commit/branch operations still follow user and host authorization.

## Coverage gate

`source_coverage` and the production `_coverage_errors` gate were executed against the verified selected bytes and pinned tree inventory. Result: no unselected runtime dependency without an explanation. Remaining matches name consumer-project files (`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `GLOSSARY.md`, local `docs/`) or research host-discovery metadata. Their omissions are explicit and do not intersect selected paths.

The optional setup-matt-pocock-skills tracker setup remains excluded under the already recorded local-record integration. Its tracker-specific setup is not claimed to have run. Navigation links to other upstream workflows do not activate them.

## Verification

`python -m pytest -q tests/test_wayfinder_intake.py tests/test_reharmonization.py`: **26 passed** in 0.38 s. `python -m muro validate --manifest examples/marionette/sources.json`: **OK**. The source coverage gate above used the complete pinned tree and SHA-verified originals, not fabricated source fixtures. This evidence does not claim a live model completed a Wayfinder planning/build session or a fresh full release build. The full project suite remains a CI-only check.
