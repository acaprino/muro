# LLM-owned intake and unification — 2026-11-10

## Scope and observed defects

The owner requires the LLM to understand skill/plugin purpose, synthesize useful
knowledge and decide coherent functional placement. Work started from an already
modified checkout at HEAD `2e0fa680e6efd66d29d2d088294d39baf7fcc761`; pre-existing
changes were preserved. This record covers this correction, not all changes in
the working tree. No commit, installation, publication or existing dist replacement
was performed by this task.

The active runtime already used explicit AI classifications. Two remaining
semantic shortcuts were found: the harmonizer gave the first manifest source
precedence, and the exported legacy `resolve_plan` chose the first compatible
variant. Reversing two equally compatible rows changed its answer from `first`
to `second`. The legacy API now refuses role-based selection with migration
guidance; its imports remain available. Mechanical syntax/license checks remain.

The prompts now require source-grounded functional decisions, preserved methods,
applicability limits and unresolved gaps. Both preparation packets include the
existing router and capability bodies. Design source goals no longer predetermine
the merge destination. The visual/Figma handoff now gives approved typography one
owner instead of letting an independent one-typeface rule overwrite it.

## Failure and success evidence

- Three legacy-path rejection cases failed before the change with `DID NOT RAISE`.
  After the change, the agent's 58 focused routing/legacy-boundary tests passed.
  Explicit selection remains the same when catalog row order is reversed.
- Initial targeted preparation/runtime baseline: 58 passed in 37.78s after
  configuring a project-local temporary directory. Updated context tests:
  59 passed in 36.88s. Preparation passes catalog text verbatim and does not mutate
  it or emit semantic decisions, even when the supplied text awaits AI review.
- Review caught a new failure path: unreadable catalog text left a partial intake
  directory. The regression test failed on the directory-exists assertion before
  moving context reads before export; afterward it passed in 1.14s, including a
  successful retry after repairing the catalog.
- Initial full suite after semantic changes: `170 passed in 82.02s`. Final suite
  after the export failure-path correction:
  `python -m pytest -q --basetemp .muro/pytest-ai-factory-final` returned
  **171 passed in 78.55s**. TEMP/TMP pointed to `.muro/tmp-ai-factory`.
- `python muro_build.py --validate` passed after the final code correction.
  `git diff --check` passed; line-ending conversion notices were informational.

Environment failures were kept distinct from code failures: the default Windows
temporary folder was inaccessible (58 setup errors on the first targeted run),
and restricted network/Git access initially prevented source checks and two of
the review agent's broader tests (89 passed, 2 access failures). Subsequent runs
used project-local TEMP/TMP and authorized Git access. No source gate was bypassed.

## Source and release checks

The first network-enabled `--check-sources` run rejected GenOffice: declared
`d8eb53baed18327b83d8655147c4759b8c44639c` differed from remote HEAD
`8dc3bd16593b65e40a1f498ae259baed7bbfbad8`. A concurrent workspace edit updated the
manifest to the latter revision while verification was running. This task did
not repin GenOffice or claim to review that upstream change.

A fresh build subsequently succeeded under
`.muro/release-llm-factory-20261110/muro`, using the updated manifest and the real
source gates. The final `python muro_build.py --check-sources` returned
`OK: all sources and plugin identity valid`. The final fresh build succeeded at
`.muro/release-llm-factory-20261110-final/muro`.
Existing `dist/` output was not replaced or edited. Prepared harmonization context
is at `.muro/factory/harmonization-llm-20261110/PROMPT.md`; preparation itself is
not evidence that the entire catalog was re-harmonized by an LLM.

All five final packaged launchers (Claude Code, Codex, Pi, OpenCode, Hermes) ran
from consumer directories outside the checkout, with PYTHONPATH removed. Each
returned `classification-required` without a decision and a direct `office-files`
step for the explicit conversion fixture, with the installed package root and no
map state. Consumer evidence remains under
`C:/Users/alfio/.codex/visualizations/2026/11/10/01a1c4ad-6e9c-7112-bb51-41bea7dd4046/muro-portability-20261110/`.

## Actual bounded LLM review

A separate LLM worker read the revised prompts and performed these synthetic
semantic decisions directly, without a classifier script. The scenarios were
self-authored and already discussed in context, not held-out benchmark inputs.

| Supplied scenario | LLM decision and justification |
|---|---|
| Both skills are called canvas; one produces diagrams and the other a business model | Separate responsibilities and intents; shared naming supplies no functional overlap. |
| Different-language names describe receipt/bank reconciliation with the same discrepancy output | Merge by the common responsibility, preserving both provenances and any format/evidence limits. |
| Measurement collection followed by interpretation that can also accept valid external measurements | Complementary responsibilities; no compulsory collection step when valid inputs already exist; explicit ordered handoff when both execute. |
| One source requires one font, another two; reverse source order while keeping an approved project typography | Preserve approved project typography in both orders; document incompatible source mandates as scoped adaptations. |

The worker also compared the visual/Figma handoff with selected local ai-design
material. Its one-font/weight/Tailwind/gradient prescriptions explain the actual
conflicts; the revised handoff preserves adopted visual constraints and stops
Figma independently replacing typography. This is a bounded semantic review,
not a full repeated intake, blind evaluation or proof of general model quality.

## Integration boundaries

Automated runtime tests supply explicit AI-response fixtures: they validate the
protocol, dependencies, conflicts, state preservation and packaged launcher, not
LLM authorship. Portable launchers are exercised outside the source checkout;
this is not a live native session in Claude Code, Codex, Pi, OpenCode or Hermes.
No actual Office or Figma task, runtime dependency installation or hook activation
is claimed. The host LLM must still perform intake and synthesis when used.
