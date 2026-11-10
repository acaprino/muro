---
adr_id: ADR-0010
version: 1
title: An offline HTML guide in every release
status: Proposed
author: Alfio Caprino
scope:
  paths:
    - muro/guide.py
    - muro/guide.html
    - muro/release.py
    - muro/adapters.py
    - prompts/harmonizer.md
    - guide-examples.json
  modules: []
  domains:
    - factory
    - release
    - documentation
governs_symbols: []
depends_on:
  - ADR-0003
  - ADR-0008
created_from_task: release-html-guide
proposed_on: 2026-11-10
proposed_at_sha: 77b7a76584d996ca3a54b4ee12e4482f0c2842eb
accepted_on: null
accepted_at_sha: null
last_verified_sha: null
retired_on: null
retired_reason: null
supersedes: []
superseded_by: null
changes: []
---

# ADR-0010: An offline HTML guide in every release

## Owner requirement

On 2026-11-10 the owner requested that every release generate an illustrative
HTML explanation of the new plugin as a decision tree, including commands,
skills, collaborations, precedence, activation conditions and intents.
The owner then requested a much more essential, simple presentation: a responsive,
navigable graph, brief descriptions of intents and example activation paths.

The HTML delivery is an explicit owner requirement. The filename, rendering
implementation, interactions and layout are implementation choices. This record
remains Proposed because its wording has not been separately approved.

## Decision

Every successful build generates `GUIDE.html` for that release, at the package
root and in each of the five independently installable host skill directories.
The build renders it before completing delivery; a guide-generation failure is
a release failure. An earlier release's guide is never reused, and generated
copies are not hand-edited.

The file is self-contained and works offline in a browser: inline presentation
and interactions, no external fonts, libraries, server or installation. Its
readable catalog remains available without JavaScript. The package's skill and
installation instructions point to it.

The owner subsequently requested using an existing graph library. Cytoscape.js
3.34.4 now supplies rendering, built-in layouts, pan, zoom and touch interaction.
Its unmodified official browser bundle and MIT license are pinned locally with
SHA-256 checksums in `muro/vendor/cytoscape/manifest.json`. Generation rejects
changed bundle/license bytes and embeds the bundle (including its full license)
inside the standalone HTML. There are no CDN or runtime download requirements.
The original custom SVG renderer and geometric layout were replaced. Accessible
node buttons and keyboard pan/zoom preserve keyboard access to the canvas graph.

The primary view contains the navigable graph. Brief intent descriptions,
documented example paths, full details and commands are available on demand:

- The request-to-execution flow: host AI classification, explicit selection,
  `no_match` and `needs_clarification` stops, direct work or confirmation,
  one active capability per step, output handoffs and evidence-backed checks.
- The actual capability graph: intents and exclusions, stack constraints,
  explicit `after` prerequisites, same-role alternatives, declared conflicts,
  outputs, tool requirements, passive hooks, checks and full instructions.
- The public entry command and technical runtime commands, including the
  classification handoff, resume, map-bound output recording and checks.
- Release identity/version, generation time, catalog digest and source
  identities, pin modes, releases and revisions.

The initial screen is the graph only, with a few controls for example paths,
intent highlighting and reset. Node details open on click in a closeable drawer
or mobile sheet; they do not fill the initial screen. Commands and provenance
are available from the coordinator node. No example is preselected.

The owner's "tree" is presented as the actual dependency graph: a capability
can have several prerequisites and independent entry points remain independent.
The diagram must not invent prerequisite relations to force a strict tree.
Neutral connections from the AI choice node show available catalog entry points,
not mandatory predecessors. An example's ordered path is visually distinct from
declared prerequisite edges and does not change the catalog.
Shared roles identify mutually exclusive alternatives in the existing runtime
contract; shared names or outputs do not create collaboration edges. Where no
explicit edge exists, the guide does not claim mandatory ordering.

## Documented example paths

`guide-examples.json` is a required source document, packaged at the release root
and in each standalone skill folder. Its nonempty `examples` array contains
human/LLM-authored scenarios, each with exactly `title`, `task`, `stack_tokens`,
`status`, `selections`, `reason` and `questions`. These are the host decision
fields plus a title, without a stored `catalog_digest`.

The renderer binds each example to the current catalog digest and validates the
explicit decision with runtime rules, including references, stack variants,
conflicts and dependencies. For a selected example it expands only declared
prerequisites to display the ordered path. A stop example explains its recorded
`no_match` or `needs_clarification` decision. Nothing is executed or saved as a
runtime work map.

The Harmonizer reviews and updates these scenarios when the catalog changes.
Mechanical validation cannot establish that a still-valid example remains
semantically appropriate. Examples illustrate specific decisions; they are not
universal triggers, new mandatory dependencies or a browser-based classifier.

## AI ownership and rendering boundary

Intake and Harmonizer AI remain responsible for meaning, useful composition and
the reasons behind collaboration, prerequisites and conflict decisions. Their
catalog descriptions, exclusions, bodies and output handoffs are the guide's
semantic evidence. The harmonizer prompt requires these explanations to remain
coherent with the declared metadata.

Python copies and escapes that evidence into HTML, and browser code lays out and
explores declared relationships. Neither component classifies natural-language
tasks, chooses a capability, synthesizes new knowledge or performs an automatic
merge. Intent highlighting filters declared identifiers only. A stack constraint is not
a keyword trigger; an unconstrained capability is not automatically activated.
Source-list order grants no precedence.

The guide is generated from the validated artifacts actually being packaged,
including their final capability bodies, so its digest identifies that runtime
catalog. It introduces no new capability frontmatter fields, independent
semantic taxonomy or LLM provider. The build still does not invoke an LLM.

Upstream instructions and catalog strings are displayed as text, not executed
as HTML, script, commands or hooks. Opening or exploring the guide grants no
permissions and starts no capability or external service.

## Verification and limits

Acceptance requires that a fresh release and all standalone skill folders include
the generated guide; its identity, descriptions, graph references and digest must
match their packaged catalog. New capabilities must appear from their data without
renderer changes. Missing/empty examples or invalid decisions must fail the build;
valid displayed paths must match the runtime's expansion of their explicit
selections. Unsafe strings must remain inert, and a failed guide generation must
not deliver a partial release or replace existing output.

Review the rendered page at desktop and narrow widths, with keyboard navigation,
offline loading and no-script content; check the documented flow and commands
against the runtime. Run the existing source/build and portable-launcher checks
in addition to targeted guide tests. Record executed results and any omissions in
[the verification record](../verification/2026-11-10-release-html-guide.md).

The guide documents a release; it is not evidence that capabilities, hooks,
external integrations or native host sessions have been executed. Valid HTML
and a matching digest do not prove LLM authorship or general semantic accuracy.
