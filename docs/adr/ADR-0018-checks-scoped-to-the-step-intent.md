---
adr_id: ADR-0018
version: 1
title: Checks are scoped to the intent of the step
status: Proposed
author: Alfio Caprino
scope:
  paths:
    - muro/core.py
    - muro/runtime.py
    - muro/routing.py
    - muro/adapters.py
    - muro/guide.py
    - prompts/intake.md
    - prompts/harmonizer.md
    - examples/marionette/capabilities/**
    - AGENTS.md
  modules: []
  domains:
    - factory
    - harmonization
    - runtime
    - verification
governs_symbols: []
depends_on:
  - ADR-0003
  - ADR-0004
  - ADR-0012
  - ADR-0015
created_from_task: checks-scoped-to-the-step-intent
proposed_on: 2026-11-13
proposed_at_sha: 271bd6f
accepted_on: null
accepted_at_sha: null
last_verified_sha: null
retired_on: null
retired_reason: null
supersedes: []
superseded_by: null
changes: []
---

# ADR-0018: Checks are scoped to the intent of the step

## Context

On 2026-11-13 a Claude Code session in the owner's Ethel project (run inside
Shinatama, which loads Marionette 0.2.0 with `--plugin-dir`) used
`marionette-product-design` for a theme × palette sketch. The host classified two
steps of one capability: `design-options#1` with intent `ui.design-variations`, then
`design-options#2` with intent `ui.tweak-controls`. `design-options` declares six
checks, written for both intents. The runtime asked every step all six, and
allowed only `pass`, `fail` and `not-tested`.

To close the map the host recorded, for step #1, the two tweak-panel checks as
`pass` with the evidence "Stesso file: …", although the panel was built in step #2;
and for step #2 the four variation checks as `pass` ("restano nella vista Tutti i
temi"). The completed `map.md` therefore certifies a panel test on a step that had
no panel. The owner called this, with the discovery failure of the same session,
"errori gravissimi".

The check text already knew: "not applicable to a tweak-only request". The runtime
did not, because that knowledge was prose. Fifteen of the 29 Marionette
capabilities have more than one intent; every single step of one of them had to
answer the checks of its other intents, typically with a vacuous `pass`. The
existing tests encoded the defect: one asserted `palette_applied: pass` on a
landing-strategy step that builds no page.

Replay on the runtime at `271bd6f` with the session's decision (fixture copied from
the session's `state.json`):

```
HEAD step #1 checks: [all six]
HEAD not-applicable: status must be pass, fail or not-tested
HEAD step #2 checks: [all six]
HEAD complete: Cannot complete map: missing check results for design-options#1.tweaks_update_and_persist,
  design-options#1.panel_hidden_when_off, design-options#2.options_differ_in_one_sentence, ...
HEAD accepted a variations check on the panel step: True
```

## Decision

1. **Scope is declared, per intent.** A capability with more than one intent
   declares `intent_checks`: every intent id mapped to the checks a step serving
   that intent answers. Every check belongs to at least one intent. The
   harmonizing AI decides it from what the body does for each intent. Python checks
   the shape (every intent present, no unknown intent or check, no empty or
   uncovered list) and never decides which check fits which intent.
2. **Conditions are declared, per check.** `check_conditions` gives a check that
   applies only in some tasks its case in plain language ("The design has a tweak
   panel: always when adding tweak controls, and for variations only when they are
   presented through tweaks"). The host judges it per task, as it judges `needs`.
3. **A fourth status, bound to a condition.** `not-applicable` is accepted only for
   a check with a declared condition, with evidence saying why the case does not
   hold. `not-tested` keeps its meaning: the check applies and could not be run.
4. **The runtime holds the step to its scope.** A step result carries its `intent`,
   its scoped `checks` and the conditions among them. `step` and `check` reject a
   check outside the step's scope and a `not-applicable` without a condition, and
   record nothing. `complete` and auto-completion require exactly the scoped checks.
   A loaded state holding a foreign or unconditioned result is refused.
5. **`after` prerequisites keep one scope.** A step added only through `after` has
   no AI-chosen intent, so validation rejects an `after` edge to a capability whose
   intents scope different checks: the dependency belongs in `needs`, where the AI
   selects the prerequisite with its intent, or the intents share one scope. The
   shipped Marionette catalog declares no `after` edge.
6. **Digest.** A catalog that declares a scope or a condition includes them in the
   catalog digest; a catalog without either keeps its earlier digest, so older
   packages do not lose their maps.

### Principle

**Evidence describes the step it is bound to.** A check result says something
about the work of one step. A runtime that asks a step about another step's work,
and offers no honest way to answer "this does not apply", manufactures filler and
then certifies it. Applicability is meaning, so it is declared by the harmonizing
AI and judged by the host; Python only holds both to the declaration.

### Algorithm

```
step_intent(classification, step) = intent of the selection whose step_id (or capability) is step
                                    | None for a step added only through `after`

checks_for(capability, intent):
    no intent_checks               -> capability.checks                 # single intent: all
    intent is None                 -> the one scope all intents share   # else build-time error
    otherwise                      -> [c in capability.checks if c in intent_checks[intent]]

validate check result (step, item):
    item.status in {pass, fail, not-tested, not-applicable}
    item.name in capability.checks                 else "Unknown check"
    item.name in checks_for(capability, step_intent) else "does not apply to step ..."
    status == not-applicable -> item.name in check_conditions else "declares no condition"

completion: every step has a result for each name in checks_for(...), none is `fail`
```

The list keeps the capability's declaration order. The step result returned to the
host carries `intent`, `checks` = `checks_for(...)` and `check_conditions` limited to
those checks; `checks_by_capability` and `check_conditions` at the checks stage are
built the same way.

### Example

`design-options` frontmatter (Marionette):

```yaml
checks: ["options_differ_in_one_sentence", "both_ends_covered", "single_file_delivered", "recommendation_given", "tweaks_update_and_persist", "panel_hidden_when_off"]
intent_checks: {"ui.design-variations": [all six], "ui.tweak-controls": ["single_file_delivered", "tweaks_update_and_persist", "panel_hidden_when_off"]}
check_conditions: {"tweaks_update_and_persist": "The design has a tweak panel: always when adding tweak controls, and for variations only when they are presented through tweaks.", "panel_hidden_when_off": "(the same case)"}
```

The session's map, recorded on the new runtime:

```
- options_differ_in_one_sentence (design-options#1): pass — ...
- tweaks_update_and_persist (design-options#1): not-applicable — the themes are side by side; the panel is step #2
- panel_hidden_when_off (design-options#1): not-applicable — ...
- single_file_delivered (design-options#2): pass — ...
- tweaks_update_and_persist (design-options#2): pass — jsdom: a palette click changes --c-accent; values survive a reload
```

Submitting `options_differ_in_one_sentence` for `design-options#2` now fails with
"Check options_differ_in_one_sentence does not apply to step design-options#2
(intent ui.tweak-controls): its checks are single_file_delivered,
tweaks_update_and_persist, panel_hidden_when_off. Nothing was recorded".

The Marionette catalog declares the scope of its fifteen multi-intent capabilities
and conditions for twelve of their checks. Two single-intent capabilities had a written
condition and now declare it (`aesthetic-direction.directions_distinct`,
`design-guidance.master_not_overwritten`). Each declaration restates a condition
the capability's own body or check text already gave; no check was added, removed
or reworded.

## Consequences

- A completed map no longer contains a `pass` for work the step did not do. The
  session's map would read: step #1, four variation checks `pass` and the two panel
  checks `not-applicable` ("the panel is step #2"); step #2, three panel checks.
- A package whose multi-intent capability has no `intent_checks` fails validation
  until its harmonizer declares one. This is deliberate: without it, the runtime
  cannot tell evidence from filler.
- Cost per task: no extra call on the normal path. A step result gains `intent`
  and, when present, `check_conditions` (tens of tokens); its check list is shorter
  for 15 capabilities. A host that submits a foreign check gets one rejected call
  naming the step's checks.
- The body's `## Checks` keeps describing every check; the generated `SKILL.md`
  tells the host to record only those its step result lists.

## Verification

`tests/test_check_scope.py` replays the session's decision on the new runtime with
the `marionette` slug: scoped lists per step, a foreign check rejected with the
state byte-identical, `not-applicable` refused without a condition, a forged state
refused, a direct step scoped by its intent, the `after` rule and the digest
compatibility. Three earlier tests that recorded every check of a capability on
every step were corrected to record the step's own list. Results and what was not
run: `docs/verification/2026-11-13-check-scope.md`.
