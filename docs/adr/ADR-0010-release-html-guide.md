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
changes:
  - "2026-11-24: the guide shows the API keys a package declares, the one exception to its minimal first view."
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

## Amendment of 2026-11-24: the guide shows the API keys a package's tools read

Owner requirement, after a package that wraps many services (Supads names about
85 to 90 distinct environment variables) showed none of them in its guide:
"questo va nella guida chiaramente". The keys are shown in the guide, in plain
view and in the order the owner gives, and in the install notes.

Decision (implementation choice; the wording is not separately approved):

- `delivery.json` takes an optional list `credentials`. An entry names an
  environment variable (`env`), the `service` it belongs to, what it `unlocks` and
  whether it is `required`, and may add a `rank`, a `route` (how the source itself
  receives the key) and `used_by` (sources, capabilities, tools). There is no
  field for a value: a key, a token or another secret has no place in the package,
  and no error message repeats what an entry holds. The Harmonizer AI writes the
  list from the intake evidence and orders it with the owner's own words. Python
  (`muro/credentials.py`) checks shape and references and chooses no key, rank or
  meaning (ADR-0003, ADR-0008). A name of a tool in `used_by` is checked only
  against a roster the package records, and never fails without one.
- A package that declares credentials has an "API keys" panel in its guide, in the
  guide's language (English or Italian), visible at once: in `<main>`, before the
  graph, outside the reference data a script hides and not inside a collapsed
  section. It lists the entries with a rank in rank order, sets the first three
  apart as the ones to get first, then shows a table of every entry (variable,
  service, what it unlocks, need, used by). `rank` is the only reordering: nothing
  is inferred, filtered or invented, in keeping with "Python copies and escapes
  that evidence into HTML".
- This is the one exception to "the initial screen is the graph only, with a few
  controls". A package that declares no credentials gets exactly the guide it had:
  the panel's markup and style enter the template through placeholders that are
  empty for it, and its script data is unchanged (the panel's strings are not part
  of it). A byte comparison with the commit before this change, on the same
  package and a frozen clock, found the two pages identical.
- Every `INSTALL.md` of a package that declares credentials has a "Keys" section,
  before `## Install`, with the same names in the same order. It says that the
  package's tools read those variables and describes no way for a host to pass
  them to a server: no run has shown one (ADR-0033, "Not run").

Cost. Nothing at run time: no call, no token, no hook, no prompt in a user's
session. `delivery.json` is part of `catalog_digest` and of the context of every
intake, harmonization and review prompt, so credentials move the digest and cost
tokens in each of those: about 250 bytes an entry (an estimate), so 15 to 25 KB for
the longest list known. The guide grows by the panel for a package that declares them and by
nothing for any other.

Evidence and limits: `tests/test_credentials.py`, `tests/test_release_guide.py`
and `tests/test_package_server_delivery.py`, and
[the verification record](../verification/2026-11-24-keys-in-the-guide.md). Not
covered: the panel was not looked at in a browser (its markup and its place in the
page were checked as a tree, not its look at desktop and narrow widths or with a
keyboard); no package declares credentials yet, so the real list of Supads and its
order are written at its next harmonization, with the owner.
