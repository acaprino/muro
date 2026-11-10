# Release HTML guide — 2026-11-10

## Requested behavior and scope

Every release must contain an illustrative HTML guide. During implementation the
owner narrowed the interface to a clear, responsive navigable graph, node details
on click, and a few controls for example paths and intents. The initial view must
not contain an open manual, a large introduction or automatically selected work.

The task began at HEAD `77b7a76584d996ca3a54b4ee12e4482f0c2842eb`, with the owner's
previous verification report already modified. That report was left untouched.
Another workspace process re-harmonized capabilities, router and routing tests
during this work. Its edits were preserved; temporary catalog mismatches were
observed while it was writing, and later validation passed. The final catalog
contains 12 capabilities and no mandatory `after` edges. Those facts must not be
replaced with the old graph's four prerequisite edges.

## Implementation evidence

`muro/guide.py` copies the actual staged catalog into a self-contained HTML file,
including the final bodies after license-notice insertion. Its catalog digest
matches the packaged coordinator. All interpolated strings are escaped, and
embedded JSON cannot terminate its script block. Browser interactions display
data; they do not classify a user's request or execute tools.

`guide-examples.json` supplies three authored scenarios: landing design followed
by motion specification and GSAP implementation; direct document conversion;
and an interactive explanation of a repository. Their explicit decisions are
validated with the existing runtime rules. Only declared prerequisites are
expanded. The source examples remain semantic documentation owned by the LLM or
person: matching identifiers cannot prove an example remains semantically apt.

The release creates `GUIDE.html` before completing its staged delivery, and
copies it and the example document into all five standalone skill folders.
Failed generation or invalid/missing examples do not deliver a partial release.
The harmonization packet now carries the current example document for AI review.

## Automated checks

- Before implementation, the new mandatory-guide test failed because the build
  omitted `GUIDE.html`.
- The first six guide tests exposed a test-fixture error: a raw Unicode line
  separator split the JSON frontmatter before the renderer ran. Encoding that
  fixture's separator as a JSON escape corrected the fixture; production parsing
  was not changed.
- The guide and factory subset passed: **21 passed in 44.91s**.
- Full suite on the updated working tree:
  `python -m pytest -q --basetemp .muro/pytest-guide-full` returned
  **218 passed in 112.02s**. TEMP/TMP pointed to `.muro/tmp-guide`; Git checks ran
  with authorized network access.
- Guide-specific checks after compact rendering and examples integration:
  **12 passed in 12.13s**. Coverage includes release freshness and branding,
  every host copy, runtime digest agreement, inert HTML/script/template strings,
  arbitrary domain data, asymmetric conflict declarations, explicit prerequisite
  expansion, missing/unknown examples, and failure cleanup.

`python muro_build.py --validate`, `python muro_build.py --check-sources` and
`git diff --check` passed. Source pins were not changed by this task.

## Packaging and runtime boundaries

A fresh candidate release was generated at `.muro/release-guide-20261110/muro`.
Each of its five packaged launchers was run from a consumer directory outside
the checkout, with PYTHONPATH removed. Each returned `classification-required`
without a decision and a direct `office-files` step for an explicit conversion
fixture. The guide and example JSON copies were byte-identical across hosts.
Consumer evidence is under
`C:/Users/alfio/.codex/visualizations/2026/11/10/01a1c4ad-6e9c-7112-bb51-41bea7dd4046/muro-guide-launchers/`.

These are real subprocess/package checks with simulated classification input,
not native host sessions or actual Office execution. No dependency was installed,
no hook activated and no release published. Existing dist output was not replaced.

## Interface review

Earlier visual revisions were rejected by the owner as too dense and replaced.
Independent review found two UI defects: inactive controls visible on mobile
without JavaScript, and an SVG retaining its old dimensions after filtering.
The controls were scoped to JavaScript-enabled UI and SVG dimensions reset before
measurement. The final graph-first layout is checked separately below; earlier
screenshots are not evidence of the final interface.

## Final graph-only interface

The final initial view has the plugin name/version, the graph and exactly three
controls: `Percorsi`, `Intenti`, `Ripristina`. No example, detail drawer or prose
section opens automatically. Clicking a capability opens a brief intent
description and expandable details. Clicking the central AI node exposes the
runtime explanation, commands, sources and catalog rationale. The current
12-capability catalog has zero mandatory dependency edges; neutral connections
to the AI node indicate available choices, not a compulsory sequence.

Browser checks used isolated Chromium contexts and local HTTP only to view the
self-contained file. Selecting the landing example highlighted exactly
`visual-direction`, `motion-principles`, `gsap-scrolltrigger`, numbered 1–3,
with two dashed example links. Selecting `ui.scroll-animation` highlighted
exactly GSAP and CSS alternatives. Reset cleared both selection and links.
Node details, keyboard Enter/Escape, commands and close actions worked. After
loading, the same interactions worked with network disabled; the only request
was the HTML itself. No browser errors were observed.

At 390px with JavaScript disabled all 12 static capability entries remained
available, interactive controls stayed hidden, and the page did not overflow.
An encoding defect found in the last review was corrected at the template:
the actual browser now displays accents and separators correctly, and an
unconstrained capability no longer displays a spurious stack constraint.

The landscape check at 844×390 exposed overlapping nodes. The radial canvas now
keeps a readable minimum height and scrolls internally; geometric spacing grows
when needed without inventing graph relations. Pairwise browser bounding-box
checks found zero overlaps and no whole-page horizontal overflow at 1440×900,
768×844, 390×844, 320×568 and 844×390. Larger-catalog spacing received a synthetic
geometry check, not an end-to-end release/visual check with a real larger catalog.

Final targeted guide suite: **12 passed in 9.98s**. Final complete suite:
`python -m pytest -q --basetemp .muro/pytest-guide-complete` returned
**218 passed in 74.83s**. Validation and whitespace checks passed again.

## Delivered verification package

Fresh final package: `.muro/release-guide-20261110-graph/muro/`.
Its `GUIDE.html` was checked again in the browser: all five viewport sizes had
zero overlapping node pairs and no page overflow; path/intent/reset/detail
interactions worked offline, and the no-JavaScript fallback passed again.
Final screenshots are `.muro/guide-final-desktop.png`,
`.muro/guide-final-mobile.png`, `.muro/guide-final-landscape.png` and
`.muro/guide-final-path.png`. The desktop and mobile screenshots were visually
inspected, as were the highlighted path and short landscape layout.

The packaged template and harmonizer prompt match the working sources. All five
final skill copies contain byte-identical guides/examples. The embedded digest
equals the final runtime digest:
`4fd4a6c08173980b0014e6fd89cdb66cccdc27d97c8b26c0ae4a1f1dde0b797e`.
All five final launchers were run again outside the checkout with PYTHONPATH
removed: `classification-required` without a decision, then direct
`office-files` for a supplied conversion fixture, with the correct skill root.
Structured results and fixtures are under
`C:/Users/alfio/.codex/visualizations/2026/11/10/01a1c4ad-6e9c-7112-bb51-41bea7dd4046/muro-guide-final-launchers/`.
These remain packaging/runtime checks with simulated classification, not native
host or Office execution. No existing release was replaced or published.

## Follow-up: use an existing graph library

The owner requested an existing graph library. The custom SVG renderer and
geometric node layout were replaced with **Cytoscape.js 3.34.4**, the upstream
published release verified at
<https://github.com/cytoscape/cytoscape.js/releases/tag/v3.34.4>.
The unmodified browser bundle and MIT license came from that exact official tag;
their source URL and SHA-256 digests are in
`muro/vendor/cytoscape/manifest.json`. Generation verifies both files, embeds the
bundle with its full license, and rejects altered bytes. Git attributes preserve
the exact upstream bytes across Windows checkouts. No package was installed and
no runtime CDN request was introduced. Python remains standard-library-only.

Cytoscape owns rendering, built-in concentric/grid layout, pan, zoom and touch
interaction. The AI-authored catalog still owns all intent meanings, selections
and dependencies. The same three controls, node details on click, declared edge
semantics, example numbering, static fallback and print content remain.

New tests reject a changed local bundle or license before delivering a release.
The targeted guide suite passed: **14 passed in 12.16s**. During this follow-up
another workspace process added dependency-audit validation and updated shared
fixtures. The first guide run encountered its temporarily incomplete fixture;
after that fixture update the guide suite passed. The first complete suite
returned **233 passed, 1 failed in 60.89s**: a pre-existing factory assertion
expected an older sentence in the newly updated dependency instructions. The
assertion now checks the audited dependency/install wording and retains the
required no-extra-confirmation policy; its real portable-launcher test passed:
**1 passed in 10.08s**. No production dependency rule was changed for that check.

Fresh package: `.muro/release-guide-20261110-cytoscape/muro/`.
The packaged template equals the current source template, all five standalone
guides are byte-identical, and each standalone folder contains the vendored MIT
license. The embedded catalog digest equals its packaged runtime digest:
`4fc52900124789ce8313b13a96bb863bdd6c2fa055b6e32459fde79b8cb2e7a8`.
All five launchers were run outside the checkout with PYTHONPATH removed;
without a decision they requested classification, and the supplied conversion
fixture yielded a direct `office-files` step. Evidence is under
`C:/Users/alfio/.codex/visualizations/2026/11/10/01a1c4ad-6e9c-7112-bb51-41bea7dd4046/muro-cytoscape-launchers/`.

Chromium checks on the actual package confirmed Cytoscape 3.34.4, the initial
closed drawer and exactly three controls, example/intent highlighting and reset,
canvas node clicks, keyboard node activation and keyboard zoom/pan. Wheel zoom
and drag pan changed the viewport. Emulated mobile touch events also verified
pinch zoom and tapping a node. These are browser-emulated touch checks, not a
physical-phone session. At 1440×900, 768×844, 390×844, 320×568 and 844×390 there
were no overlapping node boxes or whole-page horizontal overflow. The narrow
no-JavaScript fallback retained all 12 capability entries and hid the controls.
Offline interactions made no requests after the initial HTML; no page errors
were observed. Final desktop/mobile screenshots are
`.muro/guide-cytoscape-final-desktop.png` and
`.muro/guide-cytoscape-final-mobile.png`; the equivalent preview layouts were
visually inspected. Native hosts and Office engines were not executed.

`python muro_build.py --validate`, `python muro_build.py --check-sources`,
JavaScript syntax and whitespace checks passed.

Final complete suite after the assertion update:
`python -m pytest -q --basetemp .muro/pytest-cytoscape-final` returned
**234 passed in 66.97s**.
