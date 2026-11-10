# Marionette example package and dependency-audit withdrawal — 2026-11-10

Owner correction: Muro is only the factory; the unified skills are a separate
package ("un esempio di un plugin", named Marionette); dependencies are judged at
runtime, case by case. See ADR-0011.

## What changed

- Withdrawn, never committed: `muro/dependencies.py`, `DEPENDENCIES.md` in
  releases, the step field `dependencies`, the `--validate`/build gate, the
  earlier ADR-0011 draft and `tests/test_dependency_audit.py`. `runtime_deps`
  is back to the committed records.
- Moved to `examples/marionette/`: `sources.json`, `capabilities/`, `ROUTER.md`,
  `guide-examples.json`. Plugin identity `muro` → `marionette`.
- `muro/factory.py`: `prompts_dir()` and `runtime_source()` take prompts and the
  shipped runtime from the factory unless the package directory has its own.

## Commands and results

TEMP/TMP pointed at `.muro/tmp-verify-20261110`.

| Command | Result |
|---|---|
| `python -m pytest -q --basetemp .muro/pytest-split` | 221 passed |
| `python muro_build.py --manifest examples/marionette/sources.json --validate` | OK |
| `python muro_build.py --manifest examples/marionette/sources.json --check-sources` | OK (contacted the pinned remotes) |
| `build_release(...)` into `.muro/release-marionette-20261110` | built `marionette/`, five hosts under `adapters/<host>/skills/marionette` |
| `muro.py plan --task "Describe hover timing"` from each host skill copied outside the checkout | all five: `classification-required`, 12 catalog entries, nothing written in the consumer |

## Not verified

- No AI classification, step execution or evidence recording was rerun on the
  Marionette release; the launcher check stops at `classification-required`.
- No host installation. `dist/` in the repository root holds older `muro`
  outputs and was left untouched.
- A first launcher attempt failed with `No such file or directory: ROUTER.md`
  because the test copied the skill into a folder named after the host, which
  the launcher treats as an adapter folder. Rerun with other folder names passed.

## Later the same day: draggable graph and `reads` data flow

Owner feedback on `GUIDE.html`: "il grafo mi aspettavo dinamico, che si possa
draggare e muovere", "anche per capirne il flusso dei dati"; `reads` approved ("sì").

- `muro/guide.html`: nodes are draggable (`autoungrabify:false`); green labelled
  arrows render `reads`; the node drawer lists "Usa gli output di" and "I suoi
  output servono a".
- `muro/core.py`: optional eleventh frontmatter field `reads`, validated (no
  duplicates, not an own output, produced by another capability). It is in the
  runtime catalog and never adds a step. Prompts updated.
- Marionette: `reads` on figma-design, motion-principles, gsap-scrolltrigger and
  css-scroll, taken from what each body says it reads from the map.

| Check | Result |
|---|---|
| `python -m pytest -q --basetemp .muro/pytest-reads` | 222 passed |
| `--validate` on Marionette | OK |
| Build into `.muro/release-marionette-20261110c` | built |
| Browser (Chromium via Playwright, 1400×900, served over local HTTP) | dragging "work-map" moved it and opened no drawer; 4 `reads` edges drawn: visual-direction → figma-design, visual-direction → motion-principles, motion-principles → gsap-scrolltrigger, motion-principles → css-scroll; 0 console errors |

Not verified: mobile width, touch dragging, other browsers. In the default
layout some green arrows cross nodes and their labels are small.

## Data flow shown only for a chosen path or intent

Owner feedback: "i flussi dati dipendono dai processi e non sono validi sempre";
"di base non mostrerei nulla, solo se si seleziona un processo/intento".

- Base view: no `reads` arrow.
- A path from "Percorsi": solid green arrows only where the producer precedes the
  reader in that path.
- An intent from "Intenti": dashed green arrows touching that intent's
  capabilities (possible flow, order unknown).

Browser check on `.muro/release-marionette-20261110e` (Chromium via Playwright,
1400×900): base view 0 arrows; path "Landing con animazioni allo scroll" 2 solid
(visual-direction → motion-principles → gsap-scrolltrigger); "Ripristina" 0;
intent `ui.motion-design` 3 dashed. `tests/test_release_guide.py`: 14 passed.
The full suite was not rerun after this last template change.

## Conditional prerequisites (`needs`) and five-word labels

Owner: conditional subordination "a noi servirebbe", "sempre con LLM che ne
stabilisce la logica"; "le etichette generate devono essere 5 parole al massimo".
See ADR-0012.

- `muro/core.py`: optional `needs` entries `{capability, label, when, reason}`;
  label of 5 words at most; rejects unknown targets, alternatives, conflicts,
  duplicates of `after` and cycles.
- `muro/routing.py`: the classification must judge every declared `needs` of a
  selected capability (`requires`, `applies`, `reason`); `applies: true`
  requires the prerequisite to be selected earlier. Python never reads `when`.
- Marionette: `figma-design` needs `visual-direction`, label "only landing
  without outline". The other 11 bodies were searched for conditional
  prerequisites left in prose; none found. New guide example "Landing nuova in
  Figma".
- Guide: orange dashed `needs` arrow, always visible; a click on it shows the
  full condition. Data-flow labels show three keys at most ("+N" for the rest).

| Check | Result |
|---|---|
| `python -m pytest -q --basetemp .muro/pytest-needs3` | 228 passed |
| `--validate` on Marionette | OK |
| Build into `.muro/release-marionette-20261110h` | built |
| Browser (Chromium via Playwright, 1400×900, local HTTP) | base view: one arrow, labelled "only landing without outline"; click shows the full condition in the status line; example "Landing nuova in Figma" adds the solid data-flow arrow labelled "palette, typography, layout +3"; 0 console errors |

One earlier full run in this step ended `1 failed, 223 passed, 4 errors`, all in
`tests/test_pin_modes.py`; the next full run, with no change to that code,
passed. The cause was not investigated.

Not verified: `--check-sources` was not rerun after these changes (no source
or pin changed). No real AI judged a `needs` condition: every decision in the
tests is a fixture. Launchers were not rerun outside the checkout on this build.

## Graph layout and clipped step numbers

- Layout (desktop): a capability with an `after` or `needs` prerequisite is
  placed outside that prerequisite instead of on the ring, so the subordination
  is visible and its arrow crosses no other node. Mobile grid unchanged.
- Clipped step number ("!. Figma Desig"): first diagnosis wrong. Removing the
  font-weight change from the active style did not fix it (release `j` still
  clipped; the earlier "fix" only worked because a live style edit forced a
  redraw). Measured in the browser: the label width was already correct
  (109 px), and invalidating the texture caches changed nothing. What works:
  changing a label style value in a later frame than the text (in the same
  batch it had no effect: release `k` still clipped). `text-max-width` is mapped
  to node data and nudged two animation frames after a label changes.

Browser check on `.muro/release-marionette-20261110l` (Chromium via Playwright,
1400×900): Figma Design sits outside Visual Direction with the orange arrow and
its label clear of other nodes; in the example paths the step labels are whole.
Not verified: mobile width and touch.

## Initial arrangement of the graph

Owner feedback: "il grafo non parte disposto bene e in modo visibile". Measured
cause on a laptop-sized window (1366×700): the round layout left the sides of a
wide window empty and the view started at zoom 0.59, with small labels.

Change (desktop): ring nodes are placed on an ellipse sized to the window
(clamped so nodes never overlap); subordinate nodes still hang outside their
prerequisite. Mobile grid unchanged.

Browser check on `.muro/release-marionette-20261110o` (Chromium via Playwright),
initial view, nothing cut off and no overlapping nodes in all three:

| Window | Start zoom before | Start zoom now |
|---|---|---|
| 1920×1080 | 1.00 | 1.00 |
| 1366×700 | 0.59 | 0.78 |
| 1100×620 | 0.50 | 0.66 |

The owner's own window size and what exactly looked wrong were not confirmed.

## Overlapping arrows and node order

Owner feedback: the nodes' arrangement made arrows overlap.

- The grey line from the centre to a subordinate node (Figma Design) ran under
  its prerequisite, on top of that node's own line. It is now a dotted curve
  around it.
- Ring order: a capability that reads another one's outputs sits right after it.
- A chosen path with more than one step is laid out as a left-to-right row
  under the map; "Ripristina", another choice or a resize restores the map.
- Between two consecutive steps where data flows, only the solid green arrow is
  drawn; the dashed blue step arrow is kept for steps with no declared flow.

Browser check on `.muro/release-marionette-20261110q` (Chromium via Playwright,
1366×700): base view with no coinciding lines; "Landing con animazioni allo
scroll" as a row of three with both data labels readable between the nodes;
"Landing nuova in Figma" as a row of two with the orange and green arrows
separate; "Ripristina" restores the map. Not verified: mobile, touch, paths of
five or more steps (the row may then start below zoom 1).
