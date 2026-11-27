---
adr_id: ADR-0036
version: 1
title: Harmonization studies how the sources relate before it builds the graph
status: Proposed
author: Claude Code
scope:
  paths: [prompts/intake.md, prompts/harmonizer.md, prompts/review.md, tests/test_relations_study.py, AGENTS.md]
  modules: []
  domains: [harmonization]
governs_symbols: []
depends_on: [ADR-0003, ADR-0008, ADR-0017]
created_from_task: relations-study
proposed_on: 2026-11-27
accepted_on: null
---

# ADR-0036: Harmonization studies how the sources relate before it builds the graph

Date: 2026-11-27. Status: Proposed. The requirement is the owner's, in the words
quoted below. The wording of the prompts, the place of the record and this text
are implementation choices and are not separately approved.

## Context

A package had absorbed a library of prompts as one capability. Its intake goal
described it as a library to consult; the harmonization judged it an alternative
to the package's other ways of making the same kind of deliverable, wrote the
exclusions that tell them apart and stopped. No other capability used the
library, and the owner found out only when asking how it was used in a
production session.

The cause is in the factory, not in that package:

- `prompts/intake.md` already asked intake to propose "what it adds, duplicates,
  complements or contradicts", but nothing received "complements".
- `prompts/harmonizer.md` had rules for a merge, a variant, `after`, `reads`,
  `needs` and conflicts. `reads` records what a body already does. No rule asked
  whether the material of one source improves the work of another.
- ADR-0017 forbids inventing what a source does not prescribe, so a Harmonizer
  in doubt wired nothing and said nothing.

## The owner's words (2026-11-27)

- "l'obiettivo era che venisse usato"
- "allora non hai armonizzato bene", "è un limite di muro?"
- "prima deve capire a che serve, poi capire se è affiancabile o lavorare in
  sinergia con altro", "o se è complementare", "o se è simmetrica"
- "altrimenti che razza di armonizzazione è", "deve fare uno studio accurato"
- "producendo un report finale di intake per capire quali altri
  nodi/plugin/skill sono complementari o simmetriche", "o subordinate o in
  dipendenza, sub o super", "e in che ordine"

## Decision

1. Purpose comes first. Intake and harmonization say what each source is for
   before they compare it with anything.
2. Intake ends with a relations report: for each capability, how it stands to
   the others (symmetric, complementary, subordinate as part or whole,
   dependent, beside), in which order where both act in one task, and why.
3. The Harmonizer studies every pair of sources on every pass, starting from
   that report and not stopping at it, and gives each relation a decision.
4. A source whose capabilities still work alone after the study is a finding
   shown to the owner.

## Implementation choices (not separately approved)

- The kinds are the owner's words, read as follows. "Simmetrica" is read as two
  capabilities that do the same work from equal standing (a merge, variants or
  alternatives); "sub o super" as part and whole. The reading is the author's.
  The kinds are not exclusive and not a closed list: an alternative for a whole
  piece of work can also supply a part of it, which is the case that was missed.
- A relation takes a form the catalog already has: a merge, variants, `after`,
  `needs`, `reads`, exclusions, or the part's packaged files opened as working
  material by the whole. No new field and no new file.
- The Harmonizer wires a link by itself. A link adds a handoff and never changes
  a rule, number, condition or limit of either source, never makes a second
  producer of an output and never runs two bodies in one step. A link that
  cannot be made without changing what a source prescribes is a coexistence
  change under ADR-0017. The owner's words settle the study; that the AI wires
  without asking first is the author's choice, taken from "altrimenti che razza
  di armonizzazione è".
- The report is recorded in each capability's `## Sources` as `- Relations:`
  lines, where a capability has no size limit, and ROUTER.md's record carries
  one line for each link across sources. The whole report is shown to the owner
  when intake and harmonization end.
- `prompts/review.md` re-examines the study: a missing judgment, a link with
  nothing behind it, and a source that works alone are findings.
- Per-task cost of a link: none when the whole opens the part's files inside its
  own step; one more step with its record call when the part runs first through
  `needs`.

## Not done

- No Python check and no build gate. A prompt rule does not prove the study ran:
  a package validates and builds without a single `- Relations:` line. A gate
  would refuse every package harmonized before this rule until it is harmonized
  again, so it is left for a separate decision.
- No package was harmonized again under this rule when this text was written.
- The prompts were not run in a live host session.
