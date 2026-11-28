---
adr_id: ADR-0037
version: 1
title: A package is used for the whole result, on every turn, without talk of its mechanics
status: Proposed
author: Claude Code
scope:
  paths: [prompts/classify.md, prompts/delivery.md, prompts/review.md, muro/adapters.py, muro/runtime.py, muro/delivery.py, muro/system_section.py, tests/test_natural_use.py, tests/test_delivery.py, AGENTS.md, README.md]
  modules: [muro.adapters, muro.runtime, muro.delivery, muro.system_section]
  domains: [coordinator, runtime, delivery]
governs_symbols: [focused_catalog, _skill, _skill_description, system_section, injected_text, codex_hooks, install_note]
depends_on: [ADR-0003, ADR-0014, ADR-0015, ADR-0016, ADR-0017, ADR-0036]
created_from_task: natural-use
proposed_on: 2026-11-27
accepted_on: null
---

# ADR-0037: A package is used for the whole result, on every turn, without talk of its mechanics

Date: 2026-11-27. Status: Proposed. The requirement is the owner's, in the words
quoted below. The diagnosis, the wording of the prompts and skills, the runtime
change and this text are implementation choices and are not separately approved.

## Context

The owner followed a production session (Claude Code, a mobile app's dictation
flow, a package with 17 discovery entries installed) from the phone. Its
transcript, read with the session tools on the same day, shows four things:

1. **The package was not used until the owner named it.** For about thirty
   minutes the host designed and twice revised five mockups of app screens by
   hand. It invoked the package only after the owner wrote "Usa ui pro max", "O
   marionette per la ux".
2. **When used, it ran one capability.** The UX entry focused on its own two
   capabilities; the host selected one. Its pass cut things (Occam's razor), and
   the owner answered "È tutto troppo statico rigido quadrato", "Ma magari icone?",
   "Non stai usando marionette al massimo".
3. **The follow-up was done by hand.** The next request ("icone?", "troppo
   statico") went to grep and a choice between two corner radii, not to the
   package, though its skill had been invoked in the same conversation.
4. **The mechanics were the story.** "Faccio pianificare a Marionette tutta la
   catena", "piano Marionette confermato (1 passo)", and five to seven launcher
   calls per use, two of them to read the plan's own output.

In the factory the causes were:

- `prompts/classify.md` asked for "the smallest sufficient set of capabilities"
  and said "Do not extrapolate unrequested stages: a static layout does not imply
  animation". A request that names a result ("make it less rigid, icons?") was
  read as a request for the one capability its words matched.
- An entry's first call returned its own capabilities in full and every other
  area as a one-line group. Selecting from a group cost one more call; the host
  did not make it.
- Nothing told the host that a skill once invoked still holds for later work.
- The session text's code section (a least-code method, "skip features nobody
  asked for") governs any task that writes code. An interface built in code is
  code, so that section owned the design of screens, which the design
  capabilities also do; the host designed them its own, minimal way.

## The owner's words (2026-11-27)

- "È tutto troppo statico rigido quadrato", "Ma magari icone?"
- "Non stai usando marionette al massimo"
- "Magari proprio odometer icone", "Invece di tasti"
- "Ancora l'uso di marionette non è naturale e soddisfacente"

## Decision

1. **Size the selection to the result.** A precise operation is the capability
   that does it. A result the user wants made, or made better, takes every
   capability whose own work it needs to be complete and good, also those the
   request does not name, ordered so that makers come before checkers. A stage
   the user rules out stays out, and so does one the result does not contain;
   nothing that only repeats another's work is added.
2. **Name every area in the first call.** With discovery entries, step 1 of every
   generated skill asks the host which of the package's skills (in its own skill
   list) the result needs and names them all in `--focus`; an entry's name stands
   for its capabilities. The umbrella falls back to `--brief` when none fits.
3. **Come back for later work.** Every generated skill says it holds for the rest
   of the conversation: a later request or a part of a larger task that the
   catalog covers goes through the skill again, invoked anew, before it is done by
   hand. A skill pre-approves its launcher calls only in the turn that invokes it:
   a live follow-up that ran the launcher directly was denied. The umbrella's
   description, which the host reads before invoking anything, says to use it
   also when the work comes up inside a larger task.
4. **Approve in the same call.** When the user asked for the work to be done, not
   proposed, `--confirm` goes on the classification call and the result is the
   first step (the runtime already accepted this; the skills did not say so).
5. **Speak of the work.** The host tells the user what each part makes or checks
   and the choices it leads to, and runs classification, plans, maps, steps and
   records without announcing or recapping them.
6. **Draw the boundary between session text and capabilities.** A section of the
   always-on text that governs a kind of work (code, replies, files) gets a marked
   line where a capability does part of that work: the capability does it,
   through the entry the line names, also inside a larger task; the section's size
   rules are not rules for how much of the capability's work the result gets.
   `prompts/delivery.md` asks for the line and `prompts/review.md` makes its
   absence a finding.

## Implementation choices (not separately approved)

- The rule of decision 1 replaces, rather than amends, "smallest sufficient set"
  and the "static layout does not imply animation" example; the protection that
  example gave is kept in a narrower form ("a specification asked for on its own
  does not ask for its code").
- Entry names in `--focus` are expanded by `focused_catalog`; an id that is both
  a capability and an entry name stays the capability. Nothing else in the runtime
  changes, and the catalog digest does not depend on the focus.
- The umbrella description keeps the words "AI-routed coordinator" (a package's
  own tests read them) and drops "classify by meaning, one capability per step",
  which said how it works, not when to use it.
- Entry descriptions get no added sentence: one package's longest entry is 1,007
  of 1,024 characters with its absorbed names, so a sentence there would refuse
  that package. The "later work" rule lives in the skill bodies and in the
  umbrella's description.
- Decision 6 is a prompt rule for the harmonizing AI, applied package by package.
  The factory's own text for the system prompt is the Muro system section of the
  amendment below.

## Amendment of the same evening: the Muro system section

The owner, after reading the diagnosis: "ogni skill, ogni comando, plugin nuovo che
viene generato da questa armonizzazione deve avere una parte nel contesto in modo
che sia chiamabile", and "ogni plugin o muro comunque dovrebbero iniettare
automaticamente anche una parte di system prompt per guidare bene l'uso. Chiamato
muro system".

7. **Every release with a skill injects a Muro system section.** It goes before the
   session text the package declares, through the channel each host already uses
   for it: `policy.md` and its native module on Claude Code, Pi, OpenCode and Hermes,
   and `session-context` from `SessionStart` and `SubagentStart` on Codex. It is
   written from the package's data alone (`muro/system_section.py`): each skill the
   release installs with the titles of the capabilities it covers, the umbrella for
   the whole catalog, and four rules: invoke the skill before doing its work, also
   inside a larger task and for each later change; name in the first call every
   skill the result needs; tell the user about the work, not about skills, plans or
   steps; do not invoke an absorbed original. A package with no capability gets no
   section.

This amends ADR-0016: a release without `delivery.json` still registers nothing it
declares, and now registers this section. The section is outside the always-on
allowance of the sources (it is the factory's, not a source's) and outside the
catalog digest. `prompts/delivery.md` tells the harmonizing AI that it is there, so
the session text does not repeat it.

## Cost per task

- Decision 2 saves the refocus call when the result needs other areas. A focused
  view grows by about 5 to 10 KB per area; on the package measured, one area is
  17 to 21 KB and three areas 28.7 KB, close to the size a host shows inline
  (about 30 KB on Claude Code). Above it the host reads a saved file.
- Decision 4 saves one call for every plan with a map.
- Decision 1 can add steps: one step per capability the result needs, each with
  its record call.
- Decisions 3 and 5 add about 900 characters to each generated `SKILL.md`.
- Decision 7 adds the section to every session and subagent: 2,736 characters (about
  700 tokens) for a package of 17 skills and 43 capabilities. On Codex the section
  arrives through `SessionStart` and `SubagentStart` hooks, and Codex runs a plugin's
  hooks only after its user trusts them in `/hooks`: every release with a skill now
  asks for that one review on Codex, also when it declares nothing else.

## Verification

See `docs/verification/2026-11-27-natural-use.md` for the live runs before and
after, with their sample size and cost.

## Not done

- No Python check: whether a selection fits a result is a judgment.
- No package was released under these rules. The boundary line of decision 6 was
  written for one package in a scratch build only; it reaches users with that
  package's next release, through its own project file and store.
- Whether one pass that applies several capabilities' material at once would read
  more naturally than one step per capability (ADR-0001) is an open question for
  the owner; it is not changed here.
