# Marionette 0.3.0

Marionette absorbs two more sources. The catalog goes from 36 to 41 capabilities
and from 15 to 17 sources; nothing new acts in every session.

## A design file your sessions are held to

From [zero-slop-design](https://github.com/zero-slop-design/zero-slop-design-plugin/tree/v0.2.1)
v0.2.1 (MIT), fourteen skills become four capabilities around a project's
`DESIGN.md`:

- **Design file**: record your design choices in a design brief and in
  `DESIGN.md`, write it from scratch, extract it from an interface that exists,
  or change its colours, typography, layout or interaction states.
- **Apply**: change the interface's code from that file, with the project's own
  tokens and components, and report how each change maps to it.
- **Inspection**: examine the file for defects, compare an interface with it for
  drift, or inspect accessibility against a standard you name. These report and
  correct nothing.
- **Integration**: export the tokens as CSS, DTCG 2025.10 JSON or Tailwind v4
  theme data, and add a code check to the project and its CI that fails on
  colours, sizes, fonts or effects the file does not permit.

A `DESIGN.md` of your project that is not a starter or a reference now comes
first among the looks Marionette matches: before recorded tokens, a design-system
Master and a direction chosen earlier in the same plan. The capabilities that
build or review (website direction, prototype, HTML deck, design options, Figma,
design review, motion) follow it and never rewrite it; only the design file
capability does. What you ask in the turn still wins, and Marionette says when
that will fail the project's code check.

The tools need Node.js 22 or later; nothing else is installed and nothing is
sent off the machine by them.

## Prose that reads as written by a person

From [text-humanizer](https://github.com/acaprino/text-humanizer) 2.0.0 (MIT,
commit `c4d8276c`), one capability: make an existing text or file in any
language read as written by a person, at the level you ask (errors only, touches
inside each sentence, or a full rewrite), without adding any fact. You get the
complete final text, the changes and the open points; a file is written only
when you choose it.

## Use and upgrade

Ask in your own words, or by the original names: the two discovery entries
`marionette-design-file` and `marionette-writing` name what they absorb. If the
originals are installed beside Marionette, switch them off: they compete for the
same requests.

Install the complete native adapter from the ZIP, following its `INSTALL.md`, as
for 0.2.1. A host caches an installed plugin by version, so this version is
needed to see the new catalog.

The third-party notices of the code bundled in the design tool travel with it
(`scripts/zero-slop-design/THIRD_PARTY_NOTICES.md`), and the aggregated
`NOTICE.md` points at them.

## Verification

The verification records are
[zero-slop-design](https://github.com/acaprino/muro/blob/develop/docs/verification/2026-11-17-zero-slop-design-intake.md)
and
[text-humanizer](https://github.com/acaprino/muro/blob/develop/docs/verification/2026-11-17-text-humanizer-intake.md).
Source pins and licenses were checked against the upstreams, a fresh release was
staged, and a 77-case routing evaluation by a model that did not see the
expected answers matched 76; the one miss is an older case unrelated to these
sources. Fixtures prove mechanics, not that a model always understands a request.

The `Tests` workflow passed on `develop` with **656 tests**, **16 skipped**, followed by
source validation, source checks and a fresh build.

Not executed: the design tool itself (it was read and hashed, not run), and no
capability of the two sources in a live host. No project was put under the code
check.

Publication uses the `Release Marionette` workflow, which repeats the tests, the
source checks and the build on the release commit and attaches a versioned ZIP
with its SHA-256. No previous release is replaced.
