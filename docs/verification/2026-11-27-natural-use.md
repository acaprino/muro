# A package used for the whole result, on every turn (2026-11-27)

ADR-0037. The owner, watching a production session from the phone: "Non stai usando marionette al
massimo", then "Ancora l'uso di marionette non è naturale e soddisfacente". This record holds what the
production transcript shows, what the factory changed, and the live runs before and after, with their
sample size and cost.

## The production session

Read with the session tools on 2026-11-27 (Claude Code on Windows, Marionette 0.7.1 from Muro's native
market, the Ethel app's dictation flow). Times are UTC.

| Time | What happened |
|---|---|
| 16:49–17:17 | The host designed five phone mockups in an Artifact canvas and revised them twice. No Marionette call. |
| 17:18 | The owner: "Usa ui pro max", "O marionette per la ux". |
| 17:23 | `marionette-ux`, `plan --compact --focus ux-laws,design-tips`, one capability selected (`ux-laws`). |
| 17:27 | Its pass cut the timer and the dashed box (Occam's razor) and moved Undo into the card. |
| 17:27–17:28 | The owner: "I tasti dictate e tidy up si possono non essere tasti rettangolari?", "Ma magari icone?", "È tutto troppo statico rigido quadrato", "Non stai usando marionette al massimo". |
| 17:28–17:29 | The host grepped the design system's radii and offered "B (pill) or C (round mic)". No Marionette call. |
| 17:29 | The owner: "Magari proprio odometer icone", "Invece di tasti". |
| 17:30 | "Hai ragione: ho usato una sola parte di Marionette […] Faccio pianificare a Marionette tutta la catena": a plan of `design-review` then `motion-principles`, the first step a generic-look audit. |

Per use: five to seven launcher calls and two or three JSON files; twice the host saved the plan's output
to a file and read it back with `python -c`.

## What the factory changed

See ADR-0037 for the decision. In short: `prompts/classify.md` sizes the selection to the result (it no
longer asks for the smallest set); every generated skill names, in its first call, every area of the package
the result needs (an entry's name in `--focus` stands for its capabilities), holds for later work in the
conversation, confirms work the user asked for in the classification call, and speaks of the work rather
than of plans and steps; `prompts/delivery.md` and `prompts/review.md` ask for a marked line where session
text that governs a kind of work (code, replies) meets a capability that does part of it.

For the package, the one such line was written in a scratch build only: in Marionette's session text, the
Ponytail section ("This section applies when the task writes or changes code", "Skip features […] nobody
asked for") governed interfaces built in code; the line hands their design to the design entries first and
says that its smallest change is a rule for code, not for how much design the interface gets.

## Live runs

Recipe of AGENTS.md, in this cloud container (Linux, Claude Code 2.1.332, `--model opus`, which served
`claude-opus-5-5`), one session at a time: `claude -p … --plugin-dir <adapter> --setting-sources
project,local --strict-mcp-config --permission-mode dontAsk --allowedTools Skill Read Write Edit Glob Grep
--max-budget-usd 3 --no-session-persistence`. Bash outside the skill's own launcher rule was therefore
denied: no run could render screenshots, the same in every variant.

The test project is invented: a phone notes app with `design-system.md` (colours, a `sharp` shape with
`radii.button` allowed, a button with an icon-only form, a 24 px icon set with `mic`, `sparkles`, `wand`,
motion tokens) and `mockups/dictation.html`, the listening state with two rectangular buttons, Dictate and
Tidy up. The request, the owner's words: "Nel mockup mockups/dictation.html i tasti Dictate e Tidy up sono
due rettangoli. È tutto troppo statico, rigido, quadrato. Magari icone invece di tasti? Sistemalo, restando
nel design system." It names no skill.

Variants, all built with `muro project commit` from Marionette's project file (its `head` pins frozen as
`static` in the scratch copy, because one source has moved upstream; see below):

- **before**: Marionette 0.7.1 as released.
- **factory-1**: the first factory change (classification sized to the result, later work, voice,
  `--confirm` in the classification call), without entry names in `--focus` and without session text.
- **final**: the factory change with entry names in `--focus`, plus the package's boundary line in its session
  text. **final-b** adds the rule that later work invokes the skill again (the first two-turn runs below were
  denied without it).
- **system**: final-b plus the Muro system section (the owner's request of the same evening).

A second request, the owner's design work arriving as a feature: "Aggiungi a mockups/dictation.html lo stato in
cui il permesso del microfono è negato: cosa vede l'utente e come lo risolve." A two-turn session repeats the
production sequence: first "Rivedi il flusso di mockups/dictation.html con le leggi della UX e sistemalo.", then,
resumed, "È tutto troppo statico, rigido, quadrato. Magari icone invece di tasti?".

| Run | Skill invoked | Capabilities selected | Launcher calls | Cost (USD) |
|---|---|---|---|---|
| before-1 | marionette-polish | interface-polish | 4 | 0.64 |
| before-2 | marionette-product-design | ui-prototype | 5 | 0.64 |
| before-3 | none (by hand) | — | 0 | 0.31 |
| before-4 | none (by hand) | — | 0 | 0.30 |
| factory-1 #1 | none (by hand) | — | 0 | 0.26 |
| factory-1 #2 | marionette-polish | interface-polish | 3 | 0.56 |
| factory-1 #3 | none (by hand) | — | 0 | 0.29 |
| factory-1 #4 | none (by hand) | — | 0 | 0.29 |
| final-1 | marionette-polish | interaction-motion, then interface-polish | 6 | 1.00 |
| final-2 | marionette-polish (first call: polish and motion) | interaction-motion, then interface-polish | 4 | 0.88 |
| final-3 | marionette-polish | interface-polish | 3 | 0.57 |
| system-1 | marionette-product-design (first call: product design and motion) | ui-prototype | 4 | 0.73 |
| system-2 | marionette-product-design (same) | ui-prototype | 3 | 0.64 |
| system-3 | marionette-product-design (same) | ui-prototype | 3 | 0.69 |

The feature-shaped request:

| Run | Skill invoked | Capabilities selected | Cost (USD) |
|---|---|---|---|
| before-mid-1 | none (by hand) | — | 0.29 |
| before-mid-2 | none (by hand) | — | 0.27 |
| system-mid-1 | marionette-product-design (first call: product design and UX) | ui-prototype | 0.71 |
| system-mid-2 | marionette-product-design (same) | ui-prototype | 0.72 |

The two-turn sessions (the second turn is the owner's follow-up):

| Run | Turn 1 | Turn 2 | Cost (USD) |
|---|---|---|---|
| before | marionette-ux, ux-laws | ran the launcher without invoking a skill: **denied**; done by hand | 0.72 + 1.14 |
| final #1 | marionette-ux, ux-laws | launcher with `--focus marionette-ux,marionette-motion,marionette-polish`: **denied**; done by hand | 0.66 + 1.04 |
| final #2 | marionette-ux, ux-laws | the same: **denied**; done by hand | 0.79 + 1.12 |
| final-b #1 | marionette-ux, ux-laws | invoked `marionette-ux` again, three areas named, interaction-motion then interface-polish, no denial | 0.67 + 1.63 |
| final-b #2 | marionette-ux, ux-laws | invoked `marionette` again, three areas named, interaction-motion then interface-polish, no denial | 0.79 + 1.95 |

## What the runs show

- **Used at all.** The same request used the package in 2 of 4 runs before, in 3 of 3 with the boundary line
  and in 3 of 3 with the Muro system. The feature-shaped request: 0 of 2 before, 2 of 2 with the Muro system.
  The factory change alone (factory-1, which did not touch session text) used it in 1 of 4: discovery was not
  its subject, and these numbers do not separate it from chance.
- **More than one craft.** Before, every run that used the package selected one capability. With entry names
  in `--focus`, 2 of 3 named two areas and planned the motion before the polish. With the Muro system the host
  went to the product-design area and named motion or UX beside it in every run, then selected the prototype
  alone, giving as its reason that "animation inside an HTML prototype belongs to the prototype step". That
  sentence is in the package's own catalog: the exclusions of `interaction-motion` give a prototype's motion
  to the prototype. The breadth stops where the harmonization made two capabilities exclusive instead of
  complementary, which is the subject of ADR-0036's study and of the owner's question about a method.
- **Later work.** A skill pre-approves its launcher calls only in the turn that invokes it. In all three
  two-turn sessions without the re-invocation rule the follow-up went back to the package and was denied
  (in an interactive session: a permission prompt). With the rule, both follow-ups invoked the skill again,
  named three areas and ran without a denial.
- **Approval in the classification call.** Every run with the change that had a map sent `--confirm` with the
  classification and received its first step from that call.
- **Voice.** Before: "piano Marionette confermato (1 passo, rifinitura dell'interfaccia)". After: "prima
  movimento e feedback dei comandi, poi rifinitura della schermata", and the step count of the owner's own
  session rule ("Passo 1 di 2 fatto"). Not counted beyond reading the replies.
- **Calls.** Launcher calls per use stayed between 3 and 6: the saved confirm call is spent again when the
  plan has two steps.

Sample sizes are 2 to 4 runs per variant: they show what happens, not rates. All the live runs together cost
20.30 USD.


## The source that moved

Building the project file as it is failed: `charles-skills` is pinned `head` at `83de509d` and its upstream
HEAD is now `a79ef9b2`. Marionette's next release fails its source check until that pin is moved by the
re-pinning procedure of AGENTS.md. It was not moved here.

## Not executed

- Codex, OpenCode, Pi and Hermes: not run.
- No screenshot of any result: Bash was denied in every run.
- The full suite of Muro ran in this cloud session after the last change: `python -m pytest -q`, 1862 passed, 20 skipped.
  `--validate` and `--check-sources --offline-pins` on the neutral fixture: OK. The `Tests` workflow on
  GitHub did not run, because nothing was pushed.
- Marionette was not released: the boundary line exists only in the scratch build, and the Muro system section
  reaches its users with the next Muro release and the next Marionette build after it.
- The cost of the Muro system section on a code-only request (the engineering entry claims "implementing a
  software change") was not measured.
