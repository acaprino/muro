# Marionette 0.4.0

Marionette now carries taste-skill whole and answers a request to explain
something with an HTML page. Five research capabilities leave the package. The
catalog goes from 41 to 37 capabilities; the sources stay 17.

## A website built with taste-skill's own kit, checks and finish gate

In 0.3.0 [taste-skill](https://github.com/Leonxlnx/taste-skill/tree/v2.5.1)
v2.5.1 travelled as 11 of its 1,631 files: the instructions, without the kit,
the scripts and the checkers they call. The capability told the host that the
rest was "not packaged" and had it write the page by hand. It now travels whole,
37 MB: heroes, palettes, type sets, moments, interface fragments, icons and 151
images with their credit files.

- **Website direction** follows the source's own run: brief, copy first, plan,
  a dealt hero, palette, type and moments, the page built from the kit, then
  its checks (copy lint, consistency at five widths, layout, performance) and
  its finish gate, three rounds at most.
- **The finish gate is an active `Stop` hook** on Claude Code and Codex. Where
  no build is armed it exits at once (0.5 to 0.6 s measured). Where a build is
  armed and failures remain, it holds the stop and says what is left. Codex asks
  you to review a plugin's hooks in `/hooks` before it runs them.
- It needs Node.js 22 or later and Chrome, Edge or Chromium. Its photo and icon
  tools fetch from Wikimedia, picsum.photos, jsDelivr and GitHub.

## An explanation as a page

From [open-paper-skills](https://github.com/pengqianhan/open-paper-skills)
(MIT, commit `f85fd3dc`), the skill explain-anything-html becomes one
capability. Ask to explain or to understand a paper, a post, an article,
documentation or a hard concept, and the answer is one self-contained HTML
page: background, intuition, walkthrough and a quiz of five questions, saved
outside the project under a dated name. You do not have to ask for HTML. A
quick answer, and an explanation you want in the chat, stay in the chat. The
interactive explainer with figures you operate (explain-this) is still there
when you ask for it as such.

One line was added to the text that acts in every session, marked
`[Marionette]`: it names this page as the owner of such a request, which the
"explain fully" rule of i-have-adhd would otherwise answer in the chat.

The skill says it is adapted from a public gist by Geoffrey Litt. The gist
carries no licence statement; the licence checked is the repository's MIT.

## Removed

The paper wiki, paper figures, research practice, research pitch and session
handoff capabilities are no longer in the package, with the entry
`marionette-research` (owner decision, 2026-11-18). Paper search stays. To keep
using them, install the originals from open-paper-skills.

## Also

- motion-design follows its upstream head (`2e1f3c05`): a rendered animation
  file can be handed to Creator MCP, a hosted service.
- The work map carries wayfinder's research skill.

## Use and upgrade

The ZIP is 188 MB (0.3.0: 16 MB), because each of the five adapters holds its
sources whole. Install the complete native adapter from the ZIP, following its
`INSTALL.md`. A host caches an installed plugin by version, so this version is
needed to see the new catalog. If the originals are installed beside
Marionette, switch them off: they compete for the same requests.

Shinatama: versions up to 0.1.1 refuse a release zip over 128 MiB and stay on
0.3.0. The bound is raised on Shinatama's `develop` (`5e48ab6`, 2026-11-18).
Measured there with this package against 0.3.0, on one machine: install and
verification 191 to 203 s (47 s), a Claude Code launch 2.9 s (0.3 s), and once
after an update 28 s (6 s) for the launch that first reads the fresh copy.

The third-party images travel with eight credit files, and the aggregated
`NOTICE.md` points at each.

## Verification

The verification records are
[the factory change](https://github.com/acaprino/muro/blob/develop/docs/verification/2026-11-17-source-coverage-evidence.md),
[taste-skill](https://github.com/acaprino/muro/blob/develop/docs/verification/2026-11-17-taste-skill-whole-intake.md)
and
[the explanation page](https://github.com/acaprino/muro/blob/develop/docs/verification/2026-11-18-open-paper-skills-two-skills.md).

The `Tests` workflow passed on `develop` with **733 tests**, **16 skipped**,
followed by source validation, source checks and a fresh build. A 75-case
routing evaluation by a separate model session that was not given the expected
answers matched 74; the one miss is an older case about scroll animation.
Several case ids hint at the intended route, so that run is not fully blind.

Live, on Claude Code only. The `Stop` hook: two sessions, one allowed and one
held. The explanation: seven sessions. On Haiku the page was saved in two of
two. On the account's default model the request was classified correctly and
the page generated, then not saved, because an earlier test had left a file of
the same name; the capability now says what to do then, and that text was not
run live.

Not executed: no model has built a page with the rewritten website direction
(its scripts were run by hand from the packaged adapter); Codex, Pi, OpenCode
and Hermes; taste-skill's photo and icon tools, its performance check and a
full consistency pass; a paper or an article given as a file or a link. The
image credits were read, not checked against the pages they name.

Publication uses the `Release Marionette` workflow, which repeats the tests, the
source checks and the build on the release commit and attaches a versioned ZIP
with its SHA-256. No previous release is replaced.
