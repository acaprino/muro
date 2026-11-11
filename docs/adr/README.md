# Architecture decision records

One record per version of a decision: ADR-NNNN-<slug>.md, then ADR-NNNN-vN-<slug>.md.
A record is Proposed when the interview produces it, Accepted when the user
approves its text, Superseded when a later version or another Accepted record
replaces it, and Abandoned when it is retired unapproved. Read the active table
before touching the paths, modules or domains it governs.

## Current implementation amendment

[ADR-0003 — AI-owned intent classification](ADR-0003-ai-owned-intent-classification.md)
records the owner's requested correction, implemented on 2026-11-09: AI derives
and selects intents; Python validates decisions and coordinates execution.
It also covers tool requirements and passive hook metadata. The record remains
Proposed pending separate approval of its text. The historical generated index
below predates this amendment; its generator is not included in this repository.

## Output and writer-safety amendment

[ADR-0004 — Output ownership, conflict guards and atomic map writes](ADR-0004-output-owners-conflicts-and-map-writer-lock.md)
records incompatible capability declarations, single-producer outputs and the
exclusive writer lock for the whole read/modify/write cycle. It remains Proposed
pending separate approval. The external ADR generator could not reindex the
directory because ADR-0003 lacks required frontmatter fields; no generated block
was edited manually.

## License gate amendment

[ADR-0005 — Apache-2.0 appendix copyright notice in the license gate and NOTICE](ADR-0005-apache-appendix-notice-in-license-gate.md)
records how the gate treats an Apache-2.0 license whose appendix notice is
filled in, and which lines `NOTICE.md` lists as copyright notices. It was
written while including GenOffice on 2026-11-09 and remains Proposed pending
separate approval. This note was added by hand outside the generated block,
whose generator is not included in this repository.

[ADR-0006 — License file declared inside the source folder](ADR-0006-license-file-inside-the-source-folder.md)
adds `license_path` for repositories that license each folder separately, limits
that license to its own folder and widens the nested-license names. Proposed on
2026-11-09 at the owner's request to extend the gate; its text is not separately
approved.

## Pin mode amendment

[ADR-0009 — Pin mode per source (release, head, static)](ADR-0009-pin-mode-per-source.md)
records the owner decisions of 2026-11-10: sources are pinned to published
releases, not to the upstream HEAD, and every intake declares one of three pin
modes. It replaces the HEAD requirement restated in ADR-0006. Proposed: the
modes are the owner's, the wording is not separately approved. This note was
added by hand outside the generated block.

## Runtime dependency amendment

[ADR-0007 — Capabilities install their missing runtime dependencies](ADR-0007-capabilities-install-missing-runtime-dependencies.md)
records the owner decision of 2026-11-09 that a capability installs a missing
package, command-line tool or application instead of stopping. Intake, build and
hooks stay inert. The record is Proposed: the decision is the owner's, its
wording is not separately approved.

## LLM-owned factory amendment

[ADR-0008 — LLM-owned intake, synthesis and graph placement](ADR-0008-llm-owned-intake-and-unification.md)
records the owner's 2026-11-10 clarification: the LLM understands and unifies the
sources, including conflict decisions and tree placement. Source order and label
matches cannot decide meaning. It remains Proposed pending separate approval of
the text. This manual note is outside the historical generated index.

## Illustrated release guide amendment

[ADR-0010 — An offline HTML guide in every release](ADR-0010-release-html-guide.md)
records the owner's 2026-11-10 requirement that every release explain its plugin
as a decision graph, including commands, skills, collaborations, precedence,
activation conditions and intents. The guide renders the actual packaged catalog;
its main view is compact, with a navigable graph and authored example paths.
Semantic explanations remain AI-authored. Proposed pending separate approval of
the text. This manual note is outside the historical generated index.

## Factory and package separation amendment

[ADR-0011 — The factory is separate from the packages it builds](ADR-0011-factory-separate-from-its-packages.md)
records the owner's 2026-11-10 correction: Muro is only the factory; the unified
skills are a separate package, with `examples/marionette/` as the example plugin;
dependencies are judged at runtime, with no manifest gate. Proposed: the decisions
are the owner's, the wording is not separately approved. This manual note is
outside the historical generated index.

## Data flow and conditional prerequisites amendment

[ADR-0012 — Declared data flow (reads) and AI-judged conditional prerequisites (needs)](ADR-0012-data-flow-and-conditional-prerequisites.md)
records the owner's 2026-11-10 requests: a draggable guide graph, data flow shown
only for a chosen path or intent, conditional subordination judged by the LLM,
and generated labels of 5 words at most. Proposed: the decisions are the owner's,
the wording is not separately approved. This manual note is outside the
historical generated index.

## Runtime lifecycle, discovery and factory-isolation amendment

[ADR-0013 — Slug-neutral step handoff, map completion lifecycle, low-ceremony batch CLI and factory isolation](ADR-0013-runtime-lifecycle-discovery-and-factory-isolation.md)
records the 2026-11-11 full audit remediation authorized by the owner: canonical
`state_dir` and `recorded_outputs` handoffs, `active|completed` map lifecycle
restoring `direct` mode, stale-digest isolation, domain-aware `SKILL.md`
descriptions, atomic inline/stdin `step` batches, multi-instance `step_id`,
manifest-driven stack rules, strict frontmatter validation, token-bound lock
recovery, `--offline-pins`, configurable install policy and guide language.
Proposed pending separate approval of the text. This manual note is outside the
historical generated index.

## Discovery entries amendment

[ADR-0014 — Discovery entries](ADR-0014-discovery-entries.md) records the
owner's 2026-11-11 choice of area entries after the live host test: AI-authored
`entries.json` groups with sharp descriptions, emitted as extra skills that run the
same coordinator, hidden from the Claude Code slash menu. Proposed: the choice is
the owner's, the wording is not separately approved. This manual note is outside
the historical generated index.

## Design principles amendment

[ADR-0015 — Design principles learned from the first audit and live host tests](ADR-0015-design-principles-from-first-real-use.md)
turns the 2026-11-11 failures and successes into five principles with their
mechanisms: design for the second time (`--amend`, rerunnable preparation,
`--build --out`), declare do not infer (`resumable`, `plugin.replaces`), verify
from outside (routing eval, live host run), fit the host, and keep AI semantics
while shrinking ceremony. Proposed at the owner's request to learn from the
evidence; the wording is not separately approved. This manual note is outside the
historical generated index.
