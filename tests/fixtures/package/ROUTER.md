# Pressroom router

An invented package used only by the factory's own tests. One row per capability; the host AI selects by
meaning, never by role name or by the order of the rows.

| id | role | when | after | outputs | intents |
|---|---|---|---|---|---|
| story-brief | story-direction | — | — | audience, angle, outline, voice | story.brief, story.angle |
| series-concept | series-direction | — | — | series_concept, series_sample | story.series-concept |
| pacing-spec | pacing | — | — | pacing-plan, reduced-motion | story.pacing |
| scroll-build-gsap | scroll-build | stack:gsap | — | scroll-patch, scroll-verified | story.scroll-build |
| scroll-build-css | scroll-build | stack:css-only | — | scroll-patch, scroll-verified | story.scroll-build |
| newsletter-edition | newsletter | — | — | edition_draft, subject_lines | story.newsletter-edition |
| manuscript-files | manuscript-operations | — | — | file_reading, file_result | files.editing, files.conversion, files.extraction |
| fact-check | verification | — | — | claims_table, corrections | story.fact-check |

## Harmonization record

- editorial-desk v2.1.0: five on-demand roles, nothing session-wide. story-brief and series-concept are two
  owners of a story's direction and conflict; newsletter-edition has story-brief as a conditional
  prerequisite (`needs`) only for a new story with no angle. manuscript-files is one role with three
  operations, each with its own check scope.
- scroll-stories (head: no release upstream): pacing-spec, and two stack variants of one build role,
  scroll-build-gsap (`stack:gsap`) and scroll-build-css (`stack:css-only`), which conflict.
- Owner Markdown `custom-instructions/plain-words.md` is the permanent session policy, in its own words
  (`delivery.json`). No forced prerequisite and no duplicate output owner outside the two build variants.
