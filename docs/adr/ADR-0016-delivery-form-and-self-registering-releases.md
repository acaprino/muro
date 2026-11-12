---
adr_id: ADR-0016
version: 2
title: Delivery form per intake and releases that register what they need
status: Proposed
author: Alfio Caprino
scope:
  paths:
    - prompts/delivery.md
    - prompts/intake.md
    - prompts/harmonizer.md
    - prompts/classify.md
    - muro/delivery.py
    - muro/adapters.py
    - muro/release.py
    - muro/factory.py
    - muro/runtime.py
    - muro/guide.py
    - muro/core.py
    - muro/cli.py
    - examples/marionette/delivery.json
  modules: []
  domains:
    - intake
    - harmonization
    - release
    - multi-host
governs_symbols: []
depends_on:
  - ADR-0007
  - ADR-0008
  - ADR-0011
  - ADR-0014
  - ADR-0015
created_from_task: delivery-form-and-self-registration
proposed_on: 2026-11-12
proposed_at_sha: e5932ed
accepted_on: null
accepted_at_sha: null
last_verified_sha: null
retired_on: null
retired_reason: null
supersedes: []
superseded_by: null
changes:
  - "2026-11-12: native policy delivery on five hosts, policy-only packages, delivery-bound classification and literal hook argv after the Ponytail probe."
---

# ADR-0016: Delivery form per intake and releases that register what they need

## Context

The owner asked whether `Trystan-SA/claude-design-system-prompt` could be absorbed
into Marionette. The source is a 647-line system prompt and fourteen procedural
skills. Until now the factory had one output form, the on-demand capability, and
a rule that a release ships nothing a host activates by itself (ADR-0007 and its
amendment of 2026-11-11). So a source shaped as a system prompt had no honest
destination, and a source whose function is its hooks stayed idle until asked.

Owner statements of 2026-11-12, in the owner's words:

- "io permetterei a muro di generare anche system prompt suo a partire dalle
  skills, se serve".
- "la strategia tra scomponi o iniezione deve farla muro tramite analisi llm",
  "con un suo prompt magari".
- "quest adr è obsoleta, se installo il plugin generato da muro, allora può
  attivare da solo prompt, hook, tools, skills ecc", and, asked what: "tutto ciò
  che serve".
- On this source: "in questo caso secondo me il system prompt di claude code non
  deve fagocitare tutto, perché marionette è un plugin onnicomprensivo e non
  specifico di design", "è multi theme, context e intent", "quindi secondo me è
  meglio farlo diventare una skill chiamabile automaticamente in base al
  contesto", "da armonizzare e coordinare con le altre".
- "questo è anche il tipo di sensibilità che mi aspetto da Muro nella decisione
  da prendere su cosa farsene di ogni nuovo intake".

The decisions are the owner's. The wording, the file format, the size cap and
the host mapping below are this record's implementation and are not separately
approved.

## Decision drivers

- Installing a generated plugin is the consent. A second opt-in per hook or
  prompt is friction the owner does not want.
- That a plugin may activate something does not mean it should. Whatever
  activates by itself is paid for in every session, including unrelated ones.
- The choice of form is a judgment about meaning and fit, so it belongs to the
  host AI, with reasons a person can read (ADR-0003, ADR-0008, ADR-0015).

## Decision

1. **Every intake decides a delivery form.** For each coherent part of a source
   the host AI decides what it becomes in this package: `capability` (on demand),
   `always-on` (text in every session), `hook` (registered by the release) or
   `dropped`. One source normally splits across several forms. A workflow is a
   chain of capabilities, a source's command an intent, a tool a `tools` entry.
2. **The judgment has its own prompt**, `prompts/delivery.md`. It asks, for this
   package and its whole catalog: in which sessions the part is useful
   (breadth), whether it must act before a task is classified (timing), whether
   it claims the whole session (authority), what every session would pay
   (cost), whether it does anything when nothing calls it (function), and what
   the catalog already covers (fit). When the answers do not clearly call for
   something that runs by itself, the answer is on demand, with the doubt
   recorded. Both preparations append the prompt: the judgment is made at intake
   and reviewed at harmonization, because a new source can change earlier ones.
3. **Decisions are package data**: `delivery.json`, beside `sources.json`, with
   `decisions` of `{source, content, form, targets, reason}`, the `always_on`
   text when a decision uses it and `hooks` wirings of
   `{host, capability, event, matcher, run}`. The session text is written by the
   AI from the catalog, never pasted from a source.
4. **Python validates and emits, nothing more** (`muro/delivery.py`): exact
   keys, known sources and capabilities, a decision for every source, a text of
   at most 6000 characters per contributing source (amendment below), and a form with something behind it (text for
   always-on; for a hook, a catalog hook with the new policy `active` and a
   wiring). It never picks a form. An invalid document stops the build.
5. **A release registers what its document declares.** Every adapter emits its
   native plugin/package entrypoint. Declared permanent guidance is an additive
   system-prompt section on Claude Code, Pi, OpenCode and Hermes, and developer
   instructions on Codex. It never replaces the host prompt or becomes a user
   request. The complete adapter must be loaded: copying only skill directories
   does not activate its policy. Without declared text or source wirings, no
   policy or event handler is registered; procedural skill discovery remains.
6. **Host limits are explicit.** `INSTALL.md` identifies the native API and
   activation requirements. Source command wirings are supported on Claude Code
   and Codex only; other hosts reject them. Native policy support does not imply
   arbitrary hook support. Host trust, permissions and feature controls still
   apply; installation consent does not bypass them.
7. **The factory machine stays inert.** Intake and build still execute and
   register nothing (ADR-0007 RA-002, ADR-0011). Classification still never
   registers a hook; an `active` hook is already running.
8. **Permanent guidance needs no fabricated procedure.** A valid delivery
   document with nonempty `always_on` can have no capabilities, a header-only
   router, no discovery entries and reviewed `no_match` guide examples. Its
   adapter exposes no `SKILL.md`. Missing delivery or an empty policy does not
   waive the normal nonempty-catalog validation. `plan` still asks the host AI
   for a decision and never invents a coordinator fallback.
9. **Delivery participates in the decision boundary.** The complete validated
   delivery document enters the catalog digest used by runtime, guide and eval.
   Changing it invalidates classifications and resumable maps, preserving old
   evidence until an explicit new classification is confirmed. Eval preparation
   includes the exact policy. Packages without delivery retain their old digest.
10. **Hook arguments remain data.** The generated command contains a static
    Python trampoline and base64-encoded JSON argv. The trampoline resolves the
    host's plugin-root environment variable and invokes the declared executable
    with `shell=False`, preserving stdin, stdout, stderr and exit status. Source
    arguments and installation paths are never shell-interpolated. Codex policy
    hooks emit event-specific JSON `additionalContext`, so a policy beginning
    with `{` or `[` is still text, not hook control fields.
    Windows batch targets (`.cmd`/`.bat`) are rejected: the OS routes them through
    a command interpreter even with `shell=False`. Declare the underlying
    executable and script instead.

ADR-0007's dependency-install decision stands. Its sentence "Hooks remain passive
metadata and are never installed or activated", its INV-003 for hooks and its
amendment of 2026-11-11 are superseded by this record.

## Verified interview examples

- **EX-001** (the owner's own case): a design system prompt offered to a package
  that spans design, motion, Office files, explainers, research and engineering.
  Expected: no text in every session; its chapters become capabilities found from
  context and harmonized with the existing design capabilities; its list of its
  own skills is dropped as competing routing.
- **EX-002**: the same source offered to a package that is only a design
  assistant. The breadth answer changes, so a short AI-written session text may
  be justified; the reason says what each session pays.
- **EX-003**: a source whose mechanisms run only as hooks. Expected: the decision
  states events, writes, model calls and billing, and either registers them
  (`active` plus wirings) or keeps them on request with the reason.

## Rejected alternatives

- **RA-001**: inject a source's system prompt as it is. Rejected by the owner
  for a broad package, and in general: the text is the AI's synthesis, capped.
- **RA-002**: keep every release passive and let a capability register on
  request. Rejected by the owner ("obsoleta").
- **RA-003**: choose the form in Python from file names, sizes or a `kind`
  field in `sources.json`. Rejected: a proxy for meaning (ADR-0015).
- **RA-004** (initial implementation): emit untested plugin or extension code
  from documentation alone. The correction exercises installed Claude, Pi and
  Hermes APIs and generated Codex commands; OpenCode has protocol fixtures only.
  This last limitation remains an explicitly recorded verification gap, not a
  claim of a completed live-host test (ADR-0015).

## Enforceable invariants

- **INV-001**: no adapter contains a `hooks/` folder unless the package's
  `delivery.json` declares session text or a wiring for that host.
- **INV-002**: `always_on` is present exactly when a decision has form
  `always-on`, and never exceeds 6000 characters for each source with an
  `always-on` decision.
- **INV-003**: a capability hook has policy `active` exactly when a `hook`
  decision targets the capability and a wiring exists.
- **INV-004**: when `delivery.json` exists, every source has a decision.
- **INV-005**: `prompts/delivery.md` names no package.
- **INV-006**: policy-only packages emit no discoverable skill and cannot route
  to an invented procedure.
- **INV-007**: runtime, guide and eval bind decisions to the same delivery-aware
  digest; a stale decision never mutates saved evidence.
- **INV-008**: native policy registration preserves host instructions; command
  arguments are literal, and Codex context is explicitly enveloped as text.

## Consequences

- Cost: at most 6000 characters of policy per contributing source in the prompts receiving it; exact
  tokens and caching depend on the host/model. Native registrations make no
  additional model call. Codex policy delivery starts a trampoline and launcher
  process per matched session/subagent event. Each source command hook starts
  the trampoline plus its declared command; model calls inside that command
  remain the source's declared cost. No policy tokens for a package without it.
- A release can now change a user's sessions without a further step. The
  guide lists, under the release's sources, every decision with its reason, the
  session text with its size and every registered hook.
- The delivery prompt adds about 90 lines to both preparations.
- `delivery.json` is optional, so a package can still skip the decision; then
  nothing registers and the catalog cannot call a hook `active`.
- TokenEconomizer's six hooks are still `host-approved` and registered on
  request. Registering them automatically is now allowed and is recorded in
  Marionette's `delivery.json` as an open doubt: it has not been run live.

## Current native channels (correction of 2026-11-12)

The owner expected Ponytail's general working guidance to become a system prompt
and, after the probe exposed the gap, requested "Allora va ficxato" and
"aggiorna specifiche e documentazione". These authorize this correction; the
specific APIs and packaging choices below are implementation decisions, not a
separately approved ADR. The original probe remains historical evidence.

| Host | Generated channel | Reapplication and requirements | Evidence obtained |
|---|---|---|---|
| Claude Code | `hooks/hooks.json` loads `policy.mjs`; `prompt.compose` appends a named section | Composing again replaces only this plugin's section. Requires mods, 2.1.287+. `scope: session` is a cache partition, not a promise about every custom subagent. | Installed 2.1.322 plugin validation and native composition test; no model call. |
| Codex | Portable `plugin.json`, compatibility `.codex-plugin/plugin.json`, default `hooks/hooks.json` | `SessionStart` matches startup, resume, clear, compact and fork; `SubagentStart` supplies child context. JSON uses each event's `hookEventName` and `additionalContext`. Host hook trust remains required. | Emitted commands executed outside the checkout; actual model/session consumption not verified. |
| Pi | `package.json` exposes `extensions/policy.js`; `before_agent_start` writes a named `systemPromptOptions.sections` entry | Each run reintroduces the section; an existing section with that name is replaced, not duplicated. Requires the structured sections API. | Installed 1.4.0 loader, extension runner and system renderer, including repeated runs. |
| OpenCode | `package.json` exports `index.js`; native package `setup` registers skills and session hooks | Adds one system text part to context, compaction, generate and title hooks. Requires V2 package API, inspected at 2.2.5. | Executable boundary fixtures; live plugin loading/session remains unverified. |
| Hermes | `plugin.yaml` and `__init__.py` register skills plus `register_system_prompt_section` | Host assembles the registered section after memory. An older API emits an explicit warning and leaves skills available. | Installed 0.23.1 PluginContext/PluginManager; no live conversation. |

None of these checks measures whether a model follows the instructions. They
verify delivery at the stated boundaries, separately from behavior and routing.
Hermes can restore a persisted system prompt on resume. Updating its plugin
does not retroactively replace that snapshot: start a new session to receive
the revised policy. Section IDs are deterministically bounded to its 128-character
limit, including packages with long slugs. Live resume refresh is not claimed.
The bounded Ponytail probe absorbs only its central rules and review procedure;
this factory correction does not add the whole upstream project to Marionette.

Primary contracts:
[Claude mods](https://code.claude.com/docs/en/plugins/mods/reference),
[Codex hooks](https://developers.openai.com/codex/hooks),
[portable plugin packaging](https://developers.openai.com/plugins/build/plugins),
[OpenCode plugin API](https://github.com/anomalyco/opencode/tree/v2.2.5/packages/plugin/src/promise),
[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent),
[Hermes](https://github.com/NousResearch/hermes-agent).

## Historical initial mapping (superseded by the correction above)

| Host | Session text from an installed package | Hooks | In this change |
|---|---|---|---|
| Claude Code | `SessionStart` hook in the plugin's `hooks/hooks.json`; stdout becomes context, capped at 10,000 characters | same file, registered when the plugin is enabled | implemented, run live |
| Codex | plugin `SessionStart` hook; documented as skipped until the user trusts it through `/hooks` | plugin `hooks/hooks.json`, same trust step | not implemented; Marionette is installed there as skills, not as a plugin |
| OpenCode 2 | server plugin, `session` hook `context` | same plugin, tool hooks | not implemented |
| Pi | package extension, `before_agent_start` returning `systemPrompt` | same extension, `pi.on(...)` | not implemented |
| Hermes | not researched | not researched | not implemented |

In that first implementation the Codex, OpenCode and Pi rows were read through
a summarizing fetcher and not run. This table preserves that earlier state and
must not be used as installation guidance for the corrected adapters.

## Amendment of 2026-11-12: a transformed original is not shipped

After the intake of `claude-design-system-prompt` the staged release still
carried the raw `claude/system-prompt.md` under `scripts/`, although its twenty
chapters had been restated in seven capability bodies and no step read the file.
The owner was asked whether to keep it and answered: "non ha senso allora [...]
ma di tutta quella questione di avere la sensibilità di trasformare un system
prompt in una skill o altro e viceversa?". The question was the defect: the
delivery judgment decides what a part becomes, and packaging ignored it, because
every path in `selected_paths` was both read at intake and copied into the
release.

Decision (implementation choice, wording not separately approved):

- `selected_paths` are what the intake AI reads. A release carries an original
  file only when a capability reads it at run time.
- A source may declare `intake_only_paths`: selected files that were restated or
  dropped and that nothing reads. They stay in the intake workbench and are left
  out of `scripts/<source-id>/` in the release and in every adapter.
- The AI decides per file and says so in the delivery decision's reason
  (`prompts/delivery.md`, "Originals in the release"). Python checks that each
  pattern matches a selected file, removes the matches, and rejects a capability
  body that names `scripts/<source-id>/<path>` of such a file. It never chooses.
- License and notice are unchanged: the source's text shaped the package.

Invariant **INV-006**: a file matched by `intake_only_paths` exists in no
release folder, and no capability body references its packaged path.

Cost: none at run time; the release gets smaller. Limit: the reference check is
literal, so a body that reaches the file through an abbreviation it defines is
not caught; `--validate` checks plain paths only, the build checks every match.
Evidence: `tests/test_intake_only_paths.py` and
`docs/verification/2026-11-12-claude-design-intake.md`.

## Amendment of 2026-11-12: the always-on budget is proportional

The first implementation capped `always_on` at 2000 characters in total. With
two sources in it (Ponytail and i-have-adhd) Marionette's policy came out at
1,999 characters against roughly 10,000 of source text, and rules were softened
or left out. Told that the fixed limit was one cause, the owner answered: "mhh
no, deve essere proporzionale al numero di intake che ci vanno dentro".

Decision (the proportionality is the owner's; the unit is an implementation
choice): the limit is `ALWAYS_ON_PER_SOURCE` for each distinct
source that has a decision of form `always-on`, as one shared budget
(`always_on_limit` in `muro/delivery.py`). Python counts sources; it does not
judge which source deserves a place. The same function bounds the text the
packaged `session-context` command prints, and the Hermes registration no longer
carries a fixed `max_chars=2000`.

The unit was first kept at 2000. The same day the owner ruled that absorbed
content is never altered except for harmonization and coexistence (ADR-0017),
so a limit may not force a source to be shortened: the unit became 6000, sized
on Marionette's two always-on sources (i-have-adhd, about 7000 characters, and
Ponytail, about 2800, sharing one budget).

Cost: up to 6000 more characters in every receiving prompt for each further
source the AI gives a permanent place (about 1,500 tokens at four characters per
token, an estimate). Host ceilings are not enforced by the factory and were not
verified: Codex's documentation gives hook context a default limit of 2,500
tokens, and the Hermes contract test assumes a section of at most 4,000
characters, so a long policy may exceed either. Evidence: `tests/test_delivery.py`
(`test_the_always_on_budget_is_proportional_to_the_sources_that_contribute` and
the two tests after it).

## Amendment of 2026-11-12: an adapter installs with the host's own command

Owner requirement: "i have adhd e ponytail dovrebbero essere attivi di default
per tutti quanti". The first real sessions showed the policy inside the system
prompt on Claude Code, Pi and OpenCode as soon as the adapter is loaded, and
showed Codex's hook channel changing the model's answer. They also showed that
"installed" had no meaning on two hosts: the Claude Code and Codex adapters were
plugin folders with no marketplace manifest, and no `INSTALL.md` named a command.

Decision (implementation choice, wording not separately approved):

- The Claude Code and Codex adapter folders are their own single-plugin
  marketplace: `.claude-plugin/marketplace.json` and
  `.agents/plugins/marketplace.json`, named after the plugin slug, with the
  plugin source `./`.
- `INSTALL.md` of Claude Code, Codex, Pi and OpenCode ends with `## Install`:
  the host's command and what is active after it. A command is written there
  only after it ran on the real host; Hermes has none yet.
- Codex skips a plugin's hooks until its user trusts them in `/hooks`, and asks
  again when a release changes them. `INSTALL.md` says the policy is not active
  on Codex until that review. This is the host's rule (the original Ponytail
  documents the same step); the factory does not work around it.

Invariant **INV-007**: an adapter whose `INSTALL.md` has `## Install` can be
installed with exactly the commands written there.

Cost: two small JSON files per release; no run-time cost. Evidence and limits:
`tests/test_native_install.py` and
`docs/verification/2026-11-12-policy-active-by-default-live.md`. Not covered: a
session in a host where the plugin was installed through the marketplace
commands, Codex's review step itself, Hermes.

## Confirmation

`python -m pytest -q tests/test_delivery.py`, the full suite and `--validate` on
Marionette. The Claude Code registration was run live with a throwaway package;
commands, results and what was not executed are in
`docs/verification/2026-11-12-delivery-form.md`.

The subsequent failure probe is preserved in
`docs/verification/2026-11-12-ponytail-delivery-probe.md`. Corrected native delivery,
second-pass checks, full-suite results, costs and remaining verification gaps
are recorded in `docs/verification/2026-11-12-native-policy-delivery.md`.
