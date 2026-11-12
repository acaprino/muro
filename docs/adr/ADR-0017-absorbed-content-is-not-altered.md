---
adr_id: ADR-0017
version: 1
title: Absorbed content is not altered, except for harmonization and coexistence
status: Proposed
author: Alfio Caprino
scope:
  paths:
    - prompts/intake.md
    - prompts/harmonizer.md
    - prompts/delivery.md
    - muro/delivery.py
    - AGENTS.md
  modules: []
  domains:
    - factory
    - intake
    - harmonization
    - delivery
governs_symbols: []
depends_on:
  - ADR-0008
  - ADR-0015
  - ADR-0016
created_from_task: content-is-not-altered
proposed_on: 2026-11-12
proposed_at_sha: e5932ed
accepted_on: null
accepted_at_sha: null
last_verified_sha: null
retired_on: null
---

# ADR-0017: Absorbed content is not altered, except for harmonization and coexistence

## Context

Marionette absorbed Ponytail v5.3.3 and i-have-adhd v0.4.1 as one permanent
policy. The host AI wrote that policy as a 1,999-character synthesis of about
10,000 characters of source text, under a prompt that said "write it yourself
[...] never paste a source's prompt" and under a fixed 2,000-character limit.
Compared with the originals: of the ten i-have-adhd rules five were kept, three
became "when helpful" (numbered steps, the five-item cap, no preamble) and two
were lost (restate state every turn, make completed work visible), with the
pre-send check; Ponytail lost its persona and its two closing lines. The package
would have replaced the owner's installed originals with a weaker version.

Owner, 2026-11-12, in three messages confirmed the same day: "non deve mai
alterare il contenuto Muro", "se non per garantire armonizzazione e coesistenza
in base ai suoi principi", "solo in quel caso può riscriverne il contenuto delle
skills ecc". Earlier the same day: the always-on limit "deve essere
proporzionale al numero di intake che ci vanno dentro", and Ponytail and
i-have-adhd "dovrebbero essere attivi di default per tutti quanti".

## Decision

The three sentences above are the owner's. The points below are how they are
implemented; their wording is not separately approved.

1. **Form and place are the AI's decision; content is the source's.** Absorbed
   content is carried in the source's own words, whole, in whatever form the
   delivery judgment chose for it (capability, permanent policy, hook).
2. **Wording changes only for harmonization and coexistence** under the
   package's principles: two owners of one output, rules of two sources that
   contradict each other, routing or activation that competes with the
   coordinator, a step no supported host can run, a rule that would bend the
   work of another capability.
3. **Size, style, tone and taste are never reasons.** When content does not fit
   a limit, its form changes (a part moves to an on-demand capability that
   reads the original), not its words. The always-on allowance is therefore
   sized so a real source fits (ADR-0016 amendment: 6000 characters for each
   contributing source).
4. **Each change is the smallest that removes the collision, and is recorded**
   with that collision: in the decision's reason in `delivery.json`, or in the
   capability's `## Sources`. In permanent policy every line that is not a
   source's is marked with the package name in square brackets.
5. Python does not judge any of this. A package can prove its own wording with
   a test that compares it with the pinned originals.

A short capability body that sends the host to the packaged original for the
full method changes the place of the content, not the content, and is allowed.

## Applied to Marionette

`delivery.json` `always_on` is now 9,998 characters: the i-have-adhd `SKILL.md`
body and Ponytail's `.agents/rules/ponytail.md`, unchanged, plus a two-line
header and three marked changes:

| Change | Collision it removes |
|---|---|
| A line under the i-have-adhd title: the rules shape replies to the user; an artifact a capability produces follows that capability's format, checks and approval gates | reply-shaping rules (five-item cap, no preamble) against capabilities that must deliver complete documents, decks and pages |
| A line under the Ponytail title: the section applies when the task writes or changes code | a developer identity and a least-code rule against design, document and research capabilities |
| Ponytail's "End your reply with one or two lines [...]" becomes "Close a code-change reply with one or two lines [...]; the one next action of i-have-adhd rule 3 comes after them" | both sources claim the end of the reply |

What had been recorded as dropped from i-have-adhd (the opening statement about
the reader, every-turn rules, numeric limits, the phrases that turn it off) is
carried. The skill's frontmatter is not: it registers the original as a skill.

## Consequences

- Cost: Marionette's policy goes from 1,999 to 9,998 characters in every
  receiving prompt, about 2,500 tokens at four characters per token (an
  estimate). That is what the two originals cost when installed separately.
- `tests/test_policy_original_wording.py` reads both pinned originals from
  their repositories and checks the policy line by line.
- **Not yet applied to the rest of the catalog** (state on the day of the
  decision; see the amendment below, which applied it). Capability bodies written
  before this rule restate their sources (the design capabilities were checked
  on purpose for low verbatim overlap). They have not been re-read against it.
  Where a body's packaged original is read at run time the content is intact;
  where the original is `intake_only_paths`, the restated body is all that
  travels.
- A source's own persona or identity statement is content. It is scoped, not
  removed, unless it collides with something that cannot be scoped.

## Amendment of 2026-11-12: applied to the 29 capabilities

Owner, after the report that the catalog had not been re-read: "falle tutte".
What follows is how it was done; the wording is not separately approved.

- Every capability was re-read by a host LLM against its originals at the
  pinned commits. Each body now names the packaged files (and, for the design
  system prompt, the chapters by number and title) that the host reads whole
  before working, says that the original wins, quotes the source where it
  states a rule, and lists every difference with its collision under
  "Changes for coexistence (ADR-0017)" in `## Sources`.
- An original a capability must read has to travel. `claude/system-prompt.md`
  and the six Ponytail `skills/*/SKILL.md` left `intake_only_paths`; the
  Ponytail rules file stays intake-only because the policy carries it whole.
  This reverses, for the prompt, the ADR-0016 amendment "a transformed original
  is not shipped": that amendment's own rule is that a release carries a file
  when a capability reads it at run time, and now seven do. It is still never
  session text.
- Drops that had a reason of taste were undone: the persona, the fixed closing
  lines and the English templates of the on-demand Ponytail skills; three
  limits on GenOffice's provider commands that no source states; rules the
  earlier bodies had added to open-paper-skills, explain-this and
  ui-ux-pro-max (one of them a `--rtl` flag that does not exist).
- Cost: the 29 bodies went from 239,833 to about 376,000 characters, and a
  step now reads its originals as well (a design step up to 13 chapters, about
  25,000 characters, an estimate). The classifier's brief index is unchanged.
- Limits: fidelity was judged by the re-reading AI, with quoted sentences
  checked by script against the pinned files; no host session was run, and the
  routing eval was not rerun (no intent, role or output changed). Open points
  for the owner are in `docs/verification/2026-11-12-capabilities-reread.md`.

## Amendment of 2026-11-12: the rule had been taken too literally

After the amendment above the owner read its cost (a design step loading about
11,000 tokens of body and originals, where it had loaded about 2,550) and
corrected the reading: "hai preso troppo alla lettera. Il contenuto si altera o
addirittura si rigenera tramite llm per creare l'hook, il prompt di ingresso o
la descrizione di selezione [...] ma poi se attivata va a fare riferimento alla
sua versione integrale, ed è integrale solo in relazione a ciò che serve. Se ci
sono md, skill, knowledge o altro che non servono al nostro plugin generato,
allora si possono anche eliminare sia come file sia come riferimenti."

Decision (the four sentences are the owner's; the points are how they are
implemented and their wording is not separately approved). This amendment
replaces Decision 1 and 3 above and the "quotes the source" and "reads whole"
parts of the previous amendment.

1. **Two layers.** The text that selects and starts a part (a hook's text, a
   capability body as its entry prompt, intent and entry descriptions) is
   written or regenerated by the host LLM for the package, compact. The
   substance is the source's: a generated text never drops, weakens,
   strengthens or invents a rule, number, condition or exception.
2. **The original is the full version, for what is needed.** An activated
   capability points to the packaged original, kept whole and untouched, by
   file and section, at the step that needs the detail. It does not order the
   host to read everything first and has no duty to quote.
3. **What the plugin does not need does not travel.** A selected file no
   capability needs at run time goes to `intake_only_paths` and every
   reference to it is removed.
4. **Always-on text keeps the source's own words**: nothing opens the original
   later in a session, so the policy of "Applied to Marionette" stands.
5. Changes to what a source prescribes still need a collision and a record
   (Decision 2 and 4 are unchanged), and the corrections of substance the
   re-read found are kept.

What went wrong in the first application: "not altered" was read as "the
wording is the source's", so the bodies grew by 57% with quotations and every
step read its originals whole. The defect that started this ADR was a rewrite
that lost and softened rules, not the fact of rewriting.

## Amendment of 2026-11-12: no added limit on data leaving the machine

The re-read removed three limits the earlier harmonization had put on
GenOffice's provider commands and asked the owner whether to restore them as a
package principle. Owner: "io eliminerei in generale questo limite per tutto muro".

Decision (the removal for the whole factory is the owner's; the wording is
not separately approved): Muro adds no restriction of its own on what an
absorbed tool or command may send off the machine. The source's statement of
what leaves is content and is carried; a tool's purpose may say that data
leaves; the host's permissions and the user's instructions decide. Consequence:
a host that allows it may pass a user's file to a provider-backed command
without a question from the package.

## Rejected alternatives

- **RA-001: keep a synthesis and raise the limit.** The limit was one cause, the
  instruction to rewrite the other. More room for a rewrite is still a rewrite.
- **RA-002: let Python diff every capability against its source.** The judgment
  of what counts as a collision is the AI's; a generic diff would flag every
  legitimate harmonization. A package-level test over named files is enough.
- **RA-003: carry the originals as files and point the policy at them.** Text
  in the system channel that says "read this file" is not active by default.

## Confirmation

`python -m pytest -q tests/test_policy_original_wording.py tests/test_delivery.py`
and the full suite; live host runs and what was not executed are in
`docs/verification/2026-11-12-policy-active-by-default-live.md`.
