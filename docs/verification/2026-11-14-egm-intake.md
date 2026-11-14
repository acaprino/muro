# Marionette: EGM trial intake — 2026-11-14

## Status and authorization

The owner asked for a trial intake of <https://egm.dev/> into Marionette ("fai una prova di intake in
marionette"). The source was added, read, classified and harmonized in the working tree. Nothing was
committed, released, installed or version-bumped: `plugin.version` is still 0.2.0, and a release that
ships this catalog needs a new version.

During the intake the owner also stated what every intake must leave behind: a registry of the absorbed
plugins with starting version, link, licence and name, where their commands and skills ended up, all of
it visible in the HTML guide. The registry and the destinations already existed; the link and the
copyright were not shown in the guide and now are (see "Factory changes").

One check fails and is left failing on purpose: the focused plan no longer fits the inline bound (see
"Open finding").

## Pinned source and rights

| Source | Release | Tag target | Licence |
|---|---|---|---|
| [google/elephant-goldfish-model](https://github.com/google/elephant-goldfish-model/releases/tag/v0.1.1) | v0.1.1, published 2026-11-06T21:50:31Z | `dea7761de06ce5b51c177ebb9bba0469f24af5a4` | Root Apache-2.0 |

- v0.1.1 was the newest non-draft, non-prerelease release GitHub returned (v0.1.0 is the only other
  one). `main` was 44 commits ahead of the tag; the tag is pinned, not `main`.
- The root `LICENSE` is the Apache-2.0 text with no copyright line. Upstream files carry the header
  `Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0`; the site footer says the same and
  adds "This is not an officially supported Google product." There is no `NOTICE` file at the tag and
  no licence file below the root.
- The site and `plugin.json` name the plugin `egm`, author Google, homepage egm.dev.

## What was read

Read whole: the seven skills (`skills/egm-*/SKILL.md`), `resources/execution_instructions.md`,
`agents/synthesizer.md`, `skills/egm-bootstrap/references/templates.md` and
`worker-return.schema.json`, `docs/privacy.md`, `plugin.json`, `.cursor-plugin/rules/egm.mdc` (first
30 lines, fetched at the tag; it is outside `selected_paths`).

Read in part: `docs/claude.md` (first 175 lines of about 200), `docs/harnesses.md` and `docs/codex.md`
(headings and the lines on nesting and isolation), the nine other persona files (frontmatter and
headings; `agents/zoom_out.md` adapter read whole), `resources/document_standards/zoom-out-standard.md`
(opening), `skills/egm-draft/references/design_doc.md` (headings).

Not read: `README.md`, `docs/index.md`, `docs/getting_started.md`, `docs/faq.md` beyond what the site
fetch returned; the four other document standards; everything outside `selected_paths` beyond the file
list (tests, site, release scripts, other hosts' manifests and wrappers, `docs/designs/**`).

The capability bodies were written from the skills read whole. They point at the persona and standard
files by path and do not restate them, so the partial read of those files limits what this record can
say about them, not what a step opens at run time.

## What each part became

| Source part | Result |
|---|---|
| `egm-brainstorm` | `concept-brief` / `docs.idea-brainstorm` |
| `egm-draft`, its template, `resources/execution_instructions.md` | `design-doc` / `docs.design-draft` |
| `egm-review`, `egm-review-loop`, `egm-resolve` | `fresh-review` / `docs.staged-review`, `docs.review-loop`, `docs.finding-resolution` |
| `egm-bootstrap`, its templates and schema | `codebase-contracts` / `docs.codebase-contracts` |
| `egm-drift-report` | `design-drift` / `docs.design-drift` |
| Ten personas, five standards, three host guides | Packaged unchanged under `scripts/egm/`, opened by the steps |
| Execution-constraint blocks as session rules; Cursor and Windsurf rules | Dropped as always-on; they act inside the capabilities |
| Upstream manifests, Claude adapters, wrappers, install commands | Dropped |
| README, other docs, `.claude-plugin/**` | Read as evidence, `intake_only_paths`, not packaged |
| Tests, site, release tooling, design records | Outside the selection |

Eleven decisions with their reasons are in `examples/marionette/delivery.json`. The discovery entry is
`marionette-design-docs`; it absorbs `egm` and the seven skill names, which are also in
`plugin.replaces`.

Judgments worth a second look:

- **Nothing is always-on.** EGM's communication rules (no flattery, no apologies, one question per
  gate, plain English) are written for design work with an author. In a package that also makes pages,
  Office files and papers they stay inside the steps that carry them.
- **Three commands, one capability.** The review invokes the loop "in-thread" at stages 7 and 9 and the
  loop hands each round to the resolution in the same session. Three steps would break that thread;
  three intents keep each entry point.
- **Two documents, two owners.** `work-map` already writes a `spec`, with opposite rules (no file
  paths, no interview). `design-doc` lists every file and is gate-driven. They keep separate outputs;
  the classifier chooses by the request.
- **One capability per step.** `egm-brainstorm`'s handoff to draft, `egm-draft`'s handoff to review and
  bootstrap's "run the drift report" become the next capability's own step.

## Gaps

- **Reviewer isolation is weaker than upstream.** The upstream Claude adapters register reviewer types
  with `tools: [Read, Grep, Glob]` and `omitClaudeMd: true`. Marionette has no delivery form that
  registers a host subagent, so the capabilities use the skills' own alternative: a general-purpose
  subagent told to read the persona file. Such a reviewer starts without the conversation, but
  read-only is an instruction and it may receive the project's instruction files. Each body says so and
  `fresh-review` asks its step to state the isolation actually obtained.
- **Not run in a host.** No capability was executed: no subagent was spawned, no document was drafted
  or reviewed. The fixtures below prove mechanics only.
- **Packaged guides describe another plugin in places.** `docs/claude.md`, `docs/codex.md` and
  `docs/harnesses.md` travel unchanged because every skill opens one of them; their parts on installing
  the upstream plugin, its `/egm:` commands, its plugin cache and its registered reviewer types do not
  apply. The bodies say which parts.
- **README.md** of the repository does not mention the new source.

## Factory changes

- `muro/sources.py`: an SPDX header inside an HTML comment that closes on the same line
  (`<!-- ... SPDX-License-Identifier: Apache-2.0 -->`) was read as `Apache-2.0 --` and refused as a
  conflicting licence. Intake preparation failed on `docs/privacy.md`. The trailing `--` is now
  dropped before the comparison. Test: `test_selected_file_with_matching_spdx_header_in_a_comment_is_accepted`
  (failed before the fix for the HTML form, passes after; a different licence is still refused).
- `muro/guide.py`: the guide's source list showed id, licence, release or pin, and commit. It now also
  shows the source's public address as a link and its copyright line. Only an `https://` address is
  shown or stored in the page data; a local checkout path is not. Test:
  `test_sources_registry_shows_where_each_source_comes_from` (failed before, passes after).
- Five tests pin the number of capabilities or router rows; 29 became 34 (69 became 74).

## Commands and results

| Check | Result |
|---|---|
| `python muro_build.py --manifest examples/marionette/sources.json --prepare-intake egm` | Failed on the SPDX header; exported after the fix |
| `... --validate` | `OK: capabilities and ROUTER.md valid` |
| `... --check-sources` (contacts the pinned remotes) | `OK: all sources and plugin identity valid` |
| `... --build --out <scratch>` | Built on the fifth attempt; see below |
| `python -m pytest -q tests/test_egm_intake.py` | 19 passed |
| `python -m pytest -q tests/test_release_guide.py tests/test_delivery.py tests/test_policy_only.py` | 62 passed |
| Full suite, first run | 383 passed, 9 failed, 7 skipped, then a pytest internal `MemoryError` |
| The 9 failures, rerun after the fixes below | 8 pass; 1 fails (inline bound, open finding) |
| Routing eval | See "Routing eval" |

The nine failures of the full run: five were the pinned counts and one body wording (`fresh-review`
lacked the word the originals test looks for); one was the router at 80 text lines, which left no room
for a test that appends a row after a blank line (now 79); one is the inline bound; the others passed
on rerun and coincide with the machine running out of commit memory.

The full suite was not rerun to completion after the fixes. The machine was at 159 MB of free commit
memory out of 42.6 GB, with other sessions and builds of the owner running; Git failed with "Out of
memory, malloc failed" and "Il file di paging è troppo piccolo" during four build attempts. The
affected test files were rerun one group at a time instead.

Staged release (`egm-build-5/marionette` in the session scratch folder, outside the repository):

- 29 EGM files under `scripts/egm/`; each `SKILL.md` travels as `SKILL.source.md`; none of the eight
  `intake_only_paths` is present.
- `NOTICE.md` lists `egm — Apache-2.0 (see LICENSES/egm.txt)`; `LICENSES/egm.txt` exists.
- `GUIDE.html`: 34 capabilities, 17 examples; the `egm` source entry shows Apache-2.0, v0.1.1, the
  commit, the repository link, the copyright line and the eleven delivery decisions. All 14 sources
  show a link.
- `adapters/claude-code/skills/marionette-design-docs/SKILL.md` exists with the entry description and
  the sentence naming the eight absorbed originals.

## Open finding: the focused plan no longer fits the inline bound

Closed the same day by indexing the focused view by discovery entry; see
`2026-11-14-focused-index-by-entry.md`. The text below is the finding as recorded.

`tests/test_audit_host.py::test_compact_plan_fits_inline_and_keeps_what_the_ai_needs` fails: the
focused plan for three web-design capabilities is 22,199 bytes against `INLINE_LIMIT = 20000`.

- Before this intake the same output was about 19,920 bytes: 80 bytes under the bound. Any new source
  would have crossed it.
- EGM adds 2,278 bytes to the brief index for five capabilities (about 456 each; the catalog average
  is 542). The index is linear in the number of capabilities: 31 brief entries are 16.8 KB.
- The bound is the test's own margin; the real host threshold is undocumented and was last checked
  live at a smaller catalog.

The bound was not raised here: that is a host-protocol change, and it needs one live run. A structural
option that uses data the harmonizing AI already authors: in a focused view, index the capabilities
outside the focus by discovery entry (13 entries, name and "Use when" description) instead of one line
per capability, and let the host ask for an entry's capabilities with `--focus`.

## Routing eval

`--prepare-eval`, then one fresh subagent classified the 54 cases from the prepared prompt alone. It was
told not to open the expectations, the tests or any other repository file, and its report lists no
such read. `--score-eval` on its `decisions.json`: **53 of 54**, catalog digest
`4d1ed3de9acef6b4bc1a5488e33dfb7670d7ecac6a7a5fbd0f8ff343c3f12cc1`.

- All eight new EGM cases matched, including the original named in the request (`egm-resolve` →
  `fresh-review` with `docs.finding-resolution`), the two-step chain (`concept-brief` then
  `design-doc`) and the negation case that must stay with `engineering-review`.
- The one miss is not an EGM case: `scroll-css-only` expects `motion-principles` then `css-scroll`; the
  classifier selected `css-scroll` alone, reading the cards' entrance as stated behaviour. The
  expectation predates this intake and was not changed.
- The classifier named `egm-fresh-review` among its hard cases (staged review or loop); it chose the
  staged review because the request names no reviewers, standards or section, which is the boundary
  the two intent descriptions draw.

Sample size is one run of one model. It shows the catalog text separates the new intents from the
existing ones for that reader; it does not show how a host behaves in a live session.
