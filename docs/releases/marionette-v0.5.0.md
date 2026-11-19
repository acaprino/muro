# Marionette 0.5.0

taste-skill is no longer part of Marionette, and the Figma step now works in
any design tool with a canvas. The catalog is 37 capabilities from 16 sources.

## Changed

- **taste-skill is removed** (owner decision of 2026-11-19: too prescriptive
  and constraining). Websites and landing pages are still planned, written and
  built by the same step, now by landing-page-design alone: its strategy and
  copy, and its own visual system (one typeface from a short list in named text
  styles, spacing and radius tokens, flat backgrounds, hero, icons, motion,
  states, ship requirements). An explicit request of yours wins over any of
  those rules, and so does a project `DESIGN.md`.
- **What went with it.** The kit of ready-made sections, the scripts that dealt
  hero, palette and type, the automated checks of a built page in a headless
  browser and the finish gate. Marionette no longer registers a `Stop` hook, or
  any hook, and no longer needs Node.js and Chrome for a website.
- **Figma design is now canvas design.** The step that builds variables, text
  styles, components and screens inside a design file serves Figma, FigCraft or
  another canvas editor, through the integration your host has for that tool.
  The design rules are the same; in an editor other than Figma a rule it cannot
  carry out is reported, not approximated.
- If you had switched off `taste-skill` or `design-taste-frontend` because
  Marionette replaced them, Marionette no longer does: switch them back on if
  you want them.

## Use and upgrade

A host caches an installed plugin by version: install this one from the ZIP,
following the `INSTALL.md` of your adapter. The release is much smaller than
0.4.1: 2,268 files, 53 MB unpacked.

## Verification

The record is
[taste-skill removed, canvas design](https://github.com/acaprino/muro/blob/develop/docs/verification/2026-11-19-marionette-taste-skill-removed-canvas-design.md).

The `Release Marionette` workflow ran the tests, source validation, source
checks and the build on the release commit before it opened this pull request.
The `Tests` workflow passed on `develop` at `9c08521`, the same catalog at
0.4.1: **725 tests**, **16 skipped**, then source validation, source checks and
a fresh build. Locally: `--validate` and `--check-sources` pass at 0.5.0. Routing eval: 76 of 76 cases, classified by
one fresh model session without the expectations; one sample.

Not executed: no page was built with the new website step in a live host; the
canvas step was not run in Figma or in FigCraft, whose features are taken from
its README; no live host session with this version; Codex, Pi, OpenCode and
Hermes.

No previous release is replaced.
