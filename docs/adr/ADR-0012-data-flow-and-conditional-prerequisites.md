---
adr_id: ADR-0012
version: 1
title: Declared data flow (reads) and AI-judged conditional prerequisites (needs)
status: Proposed
author: Alfio Caprino
scope:
  paths:
    - muro/core.py
    - muro/routing.py
    - muro/guide.py
    - muro/guide.html
    - prompts
  modules: []
  domains:
    - factory
    - routing
    - release
governs_symbols: []
depends_on: []
created_from_task: data-flow-and-conditional-prerequisites
proposed_on: 2026-11-10
proposed_at_sha: 77b7a76
accepted_on: null
accepted_at_sha: null
last_verified_sha: null
retired_on: null
retired_reason: null
supersedes: []
superseded_by: null
changes: []
---

# ADR-0012: Declared data flow (`reads`) and AI-judged conditional prerequisites (`needs`)

## Context

Owner feedback of 2026-11-10 on the release guide: the graph should be dynamic
("che si possa draggare e muovere") and help to understand the data flow; data
flows "dipendono dai processi e non sono validi sempre", so "di base non mostrerei
nulla, solo se si seleziona un processo/intento". On subordination: "a noi
servirebbe" a conditional one, "sempre con LLM che ne stabilisce la logica, in
base alla sua sensibilità". Labels: "le etichette generate devono essere 5
parole al massimo".

`after` holds for every task. The Marionette catalog had removed all `after`
edges because none was true every time, which left one real rule in prose only:
Figma Design needs the landing strategy, but only for a new landing page.

## Decision

Two optional capability frontmatter fields, both authored by the harmonizing AI:

- `reads: ["<output key>"]` — outputs of other capabilities used when recorded.
  Information only: it never adds a step. Python checks that each key is
  produced by another capability.
- `needs: [{"capability","label","when","reason"}]` — a prerequisite that holds
  only when `when` is true. `when` is plain language for another AI; `label`
  summarizes it in at most 5 words for the graph.

At runtime the classifying AI judges every `needs` of each capability it
selects and returns, inside that selection,
`"needs": [{"requires","applies","reason"}]`. Python never reads `when`. It
rejects a classification that leaves a declared `needs` unjudged or unreasoned,
judges one that is not declared, or says `applies: true` without selecting the
required capability before the dependent one. Validation also rejects `needs`
towards an unknown capability, an alternative of the same role, a conflict, an
existing `after`, and cycles across `after` and `needs`.

The guide: nodes are draggable. Blue arrows are `after`. Orange dashed arrows
are `needs`, always visible, labelled with `label`; a click shows the full
condition. Green arrows are `reads`, hidden in the base view: solid inside a
chosen example path where the producer precedes the reader, dashed around the
capabilities of a chosen intent. Data-flow labels show three keys at most.

## Consequences

- A selection that declares no `needs` keeps the previous three fields, so
  earlier classifications of such capabilities stay valid. The catalog digest
  changes, so stored maps need a new classification.
- Python does not add a conditional prerequisite on its own: the AI selects it
  with its own intent and reason. A wrong judgment is the AI's; Python only
  guarantees that a judgment exists and that the plan respects it.
- `ROUTER.md` keeps six columns; `reads` and `needs` live in frontmatter and in
  the runtime catalog.

The decisions are the owner's; this wording is not separately approved.
