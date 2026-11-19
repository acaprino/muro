---
adr_id: ADR-0027
version: 1
title: Binary media travels when the intake declares it
status: Proposed
author: Claude Code
scope:
  paths: [muro/sources.py, muro/coverage.py, prompts/intake.md, sources.json]
  modules: []
  domains: [licensing, intake, sources]
governs_symbols: []
depends_on: [ADR-0002, ADR-0005, ADR-0006, ADR-0015, ADR-0017, ADR-0025, ADR-0026]
created_from_task: taste-skill-truncated-intake
proposed_on: 2026-11-17
accepted_on: null
---

# ADR-0027 — Binary media travels when the intake declares it

Date: 2026-11-17. Status: implements the owner's instruction of the same day;
this explanatory text has not been separately approved.

## Context

ADR-0002 made the license gate refuse binary media and asset-fetcher scripts:
"Binary media and external asset-fetcher scripts (such as `scripts/assets.mjs`
fetching `CC BY-SA` or `Unsplash` assets) are listed in `excluded_paths` and
refused if present in `selected_paths`." The code refused any selected file
whose extension was an image, font or video extension, and any file that was
not UTF-8 text, whatever its license.

taste-skill v2.5.1 carries 151 images (66 `.webp`, 46 `.png`, 39 `.jpg`,
26.5 MB) that its method places on the pages it builds, and credit files beside
them. The ones read name, for each photograph, its author, its page and its
license: the Unsplash License, CC0, CC BY-SA 3.0 and 4.0; icons and logos are
CC0-1.0 with their trademarks marked. The source tells the page to print those
credits and to write "adapted" after a photograph shown through an effect.

So the source ships its media under stated terms, and the gate refused them for
a reason the source does not have. With ADR-0026 the same intake that must now
take the kit whole would have been stopped at its images.

## Owner statements

On being told that the gate refuses the images: "ma come può averle taste skill
allora se non si potrebbero usare?". On the proposal to accept media that the
source's own credit file covers, with the release about 220 MB instead of a few:
"ecco, fai in modo che non accada mai più questa perdita di tempo".

## Decision

A source may declare `media_paths`: safe repository-relative paths or patterns
of selected files that are not text. For a file that a pattern covers, the gate
no longer refuses a binary extension and no longer requires UTF-8. Everything
else stays: the file must be a regular file, inside the folder its license
covers, with no nested license above it, and not matched by `excluded_paths`. A
covered file that is text keeps its SPDX check. A pattern that covers no
selected file fails the check.

A binary file that no pattern covers is refused as before, by extension or
because it is not UTF-8, and the message names `media_paths`.

The declaration is the intake AI's: it says the AI read how the source licenses
those files. Third-party media is declared together with the file that credits
it, in `notice_paths` (ADR-0025), so the credit file ships and the aggregated
`NOTICE.md` points at it. The capability carries the source's own rule on
showing credits. Media whose rights the source does not state is not declared;
it is named as an unresolved gap for the owner.

A tool of the source that downloads when a task runs it is a helper like any
other (ADR-0026, prompt). ADR-0002's refusal of asset-fetcher scripts no longer
holds: it was Muro's limit, not the source's (ADR-0015, ADR-0017 amendment of
2026-11-12).

Binary files are written to the intake workbench and the release byte for
byte. The coverage evidence reads no paths out of them.

## What this does not do

- The gate does not read a credit file, does not check that it covers every
  declared image and does not know the Unsplash or Creative Commons terms. The
  declaration records that the intake read them; it proves nothing about them.
- `LICENSES/<source>.txt` and `NOTICE.md` still state one license per source.
  Media under other terms is reached only through the declared notice file.
- CC BY-SA requires attribution and share-alike on adaptations. Whether a page
  built with such a photograph meets that is the user's responsibility; the
  capability passes on the source's instruction, and nothing enforces it.
- Size is not limited. A release holds six copies of every packaged file, the
  root and five host skill folders.

## Verification

`tests/test_media_paths_gate.py` covers: media refused until declared, declared
media accepted, a binary file with an unlisted extension, a text file declared
as media that keeps its SPDX check, a pattern that covers nothing, malformed
values, `excluded_paths` still refusing declared media, the intake workbench
carrying the bytes, and a release carrying them in every host folder with the
credit file named in `NOTICE.md`.
