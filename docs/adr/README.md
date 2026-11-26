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

## Owner Markdown instructions

Manual note outside the generated index: [ADR-0024 — Owner Markdown enters AI
harmonization](ADR-0024-custom-instructions-markdown.md) records the approved
`custom-instructions/` input model, per-file delivery provenance, stale-input
checks and Marionette's permanent ADHD progress recaps.

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

## Delivery form amendment

[ADR-0016 — Delivery form per intake and releases that register what they need](ADR-0016-delivery-form-and-self-registering-releases.md)
records the owner's 2026-11-12 decisions: installing a generated plugin is the
consent, so a release may register session text and hooks by itself; what each
absorbed part becomes is an AI judgment with its own prompt, recorded with
reasons in `delivery.json`; and a broad package does not let one source's system
prompt take over every session. It supersedes the passive-hook rule of ADR-0007.
Proposed: the decisions are the owner's, the wording is not separately approved.
This manual note is outside the historical generated index.

The 2026-11-12 native-policy correction updates ADR-0016 to version 2: five
explicit host instruction channels, policy-only packages without a fabricated
skill, delivery-bound classification/eval and literal hook arguments. The
earlier host table remains marked as historical. See the
[verification and limits](../verification/2026-11-12-native-policy-delivery.md).

## Unaltered content amendment

[ADR-0017 — Absorbed content is not altered, except for harmonization and coexistence](ADR-0017-absorbed-content-is-not-altered.md)
records the owner rule of 2026-11-12: the AI chooses the form and the place of
each absorbed part, the words stay the source's, and wording changes only for a
recorded collision. ADR-0016 gained three amendments the same day: a transformed
original is not shipped, the always-on limit is proportional to the contributing
sources, and an adapter installs with its host's own command. Proposed: the
rule is the owner's, the wording is not separately approved. This manual note
is outside the historical generated index.

## Check scope amendment

[ADR-0018 — Checks are scoped to the intent of the step](ADR-0018-checks-scoped-to-the-step-intent.md)
records the 2026-11-13 failure the owner called "errori gravissimi": a
two-intent capability forced its host to certify a tweak-panel test on a step
that had no panel. A multi-intent capability now declares `intent_checks`, a
conditional check declares `check_conditions`, `not-applicable` is accepted
only under a declared condition, and the runtime rejects a check recorded on
the wrong step. Proposed: the wording is not separately approved. This manual
note is outside the historical generated index.

## Absorbed names amendment

[ADR-0019 — A package names the originals it absorbs where the host chooses a skill](ADR-0019-absorbed-originals-named-at-discovery.md)
records the discovery half of the same session: the umbrella told the host
"Never invoke original absorbed skills" without naming one, and the factory cut
the umbrella's AI-authored description to fit 1024 characters. An entry now
declares `absorbs` (names from `plugin.replaces`); the build appends a sentence
naming them after the AI text, and the umbrella points to its entries. The
project rule and the originals still installed in the user scope are recorded
as configuration outside the factory. Proposed: the wording is not separately
approved. This manual note is outside the historical generated index.

## Official documentation design

[ADR-0020 — Every package ships official documentation in a standard form, started from its sources' own documentation](ADR-0020-official-package-documentation.md)
is a design, not an implemented contract. A package gets a README and one page
per discovery entry, in English and in a fixed form: the host AI writes the
prose starting from each source's official documentation, read from a pinned
Git repository; the build fills in the facts from the package's data and
refuses documentation written for another scope. The finished copy is also
committed in the package directory. The owner approved the design on
2026-11-14 and asked that it not be implemented yet. This manual note is
outside the historical generated index.

## Factory CLI

[ADR-0021 — One factory CLI executable, with review and baseline commands](ADR-0021-factory-cli-executable.md)
makes `muro <command>` (also `python -m muro`) the interface. The legacy flags
run the same command functions. `muro review` prepares the decisions
re-examination, and `muro baseline` reports pins against upstreams read-only.
Proposed: the wording is not separately approved. This manual note is outside
the historical generated index.

## Agentic CLI

[ADR-0022 — The CLI runs the AI-owned steps itself](ADR-0022-agentic-cli-mcp-and-absorb.md)
adds `muro mcp`, `muro agent`, `muro init`, `muro install` and `muro absorb`.
Python still validates and never classifies, merges or reviews. Proposed: the
wording is not separately approved. This manual note is outside the historical
generated index.

## Desktop registry

[ADR-0023 — A desktop registry alongside the factory](ADR-0023-global-desktop-registry.md)
records the native portable Tauri app and its `muroctl`/`mukade` command-line
tools. They manage harness instances and a desired plugin registry with
reviewable sync plans, and adapt sources through the factory with a real host
AI. The factory stays independent. Proposed: it implements the owner's approved
design, and the text is not separately approved. This manual note is outside
the historical generated index.

## Declared third-party notices

Manual note outside the generated index: [ADR-0025 — Third-party notices
declared by the source](ADR-0025-declared-third-party-notices.md) records the
optional `notice_paths` field for a source that bundles third-party code in a
prebuilt file, and what the license gate still does not check.

## Source coverage evidence

Manual note outside the generated index: [ADR-0026 — Source coverage evidence
at intake](ADR-0026-source-coverage-evidence-at-intake.md) records why an
intake could ship a capability written around files its source needs, and the
`coverage.json` evidence the intake AI now receives, and the gate: the source
check and the build refuse a named file that is neither selected nor explained
in `omissions`.

## Declared binary media

Manual note outside the generated index: [ADR-0027 — Binary media travels when
the intake declares it](ADR-0027-declared-binary-media.md) replaces the refusal
of images, fonts and video by extension (ADR-0002) with `media_paths`, declared
by the intake after it read how the source licenses them.

## Desktop projects and sync

Manual note outside the generated index: [ADR-0028 — The desktop app manages
projects and sync](ADR-0028-desktop-projects-and-sync.md) records the owner's
decisions of 2026-11-19 for the desktop app: Sync as the page where plugins
reach the harnesses, with its state always visible, plugins outside the list
under one visible rule, and a shell that lives in the notification area, starts
with Windows and keeps the harnesses in sync from the background. Proposed: the
owner's decisions are recorded, the explanatory text and the implementation
choices are not separately approved. The part about projects (the `.mp` file,
decision records, harmonization per project) is not implemented yet.

## Absorbed MCP servers

Manual note outside the generated index: [ADR-0030 — A source's MCP server is
absorbed and registered by the release](ADR-0030-absorbed-mcp-servers.md)
records the owner's decision of 2026-11-21 that a server a source ships travels
with it and is registered by the generated plugin, declared once in
`delivery.json` and written by each adapter in its host's form. Proposed: the
owner approved the design before the code; the explanatory text is not
separately approved.

## Desktop on Sigrid

Manual note outside the generated index: [ADR-0031 — The desktop window moves
from Imago to React on Sigrid](ADR-0031-desktop-on-sigrid.md) records the
owner's decision of 2026-11-23 that the window is a React app on
`@acaprino/sigrid`, replacing the Imago window in place, with `imago-shell` kept
for the native window. It names what is lost (the ONI look, `imago-check`),
the consequence for `develop` (no Sync page until the follow-up plans port it,
and no merge into `main` meanwhile) and what was not verified. Proposed: the
decision is the owner's; the explanatory text is not separately approved.

## Desktop projects, write side

Manual note outside the generated index: [ADR-0032 — Projects are made and
changed in the desktop app](ADR-0032-desktop-projects-write-side.md) records the
owner's requirement of 2026-11-21 ("è fondamentale poterli creare gestire
aggiornare editare") and its implementation, the third plan of ADR-0028: a
change of a package is an AI run of Claude Code committed by the factory under a
digest guard, and the details, records and changelog are edited offline. It was
written on a side branch as ADR-0030 and renumbered when its factory commands and
runtime actions were taken over on 2026-11-23; its screens were written for the
Imago window and are rewritten in React (ADR-0031). Proposed: the decisions are
implementation choices, not separately approved.

## Package MCP server

Manual note outside the generated index: [ADR-0033 — A package's own MCP server,
decided with the owner at harmonization](ADR-0033-package-mcp-server.md) records
the owner's request of 2026-11-23 that Muro ask, at harmonization, what to do
with the MCP servers a source ships. One answer is a package server named for the
package, whose tools are declared in `delivery.json` and either forward to a tool
of an absorbed server or run an absorbed command. The build refuses it without
the recorded answer on the sources as pinned. Only Claude Code registers it for
now. Proposed: the owner chose the approach and accepted the review's fixes; the
explanatory text is not separately approved. No live host session has run.

## Project stores

Manual note outside the generated index: [ADR-0034: A project's repository is a
plugin store built from its project file](ADR-0034-project-stores.md) records the
owner's model of 2026-11-25 ("l'mp contiene tutto", "un push dell'mp scatena una
nuova release", "non repository aperte o scompattate"): a project is one `.mp`
file, its repository holds that file and the store generated from it, and a push
of the file is a release. Muro owns the repository-side build as one reusable
workflow, `.github/workflows/project-store.yml`, which a store calls pinned to a
Muro ref. Proposed: the model is the owner's; the workflow, its rules and the text
are not separately approved. The workflow has not run on GitHub.

## Extracting one harness

Manual note outside the generated index: [ADR-0035: The plugin of one harness is
extracted from the project file](ADR-0035-project-extract.md) records the command
and the button the owner asked for on 2026-11-26. Proposed: the request is the
owner's; the choices and the text are not separately approved.
