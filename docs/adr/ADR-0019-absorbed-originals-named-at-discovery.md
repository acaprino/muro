---
adr_id: ADR-0019
version: 1
title: A package names the originals it absorbs where the host chooses a skill
status: Proposed
author: Alfio Caprino
scope:
  paths:
    - muro/entries.py
    - muro/adapters.py
    - prompts/harmonizer.md
    - examples/marionette/entries.json
    - AGENTS.md
  modules: []
  domains:
    - factory
    - discovery
    - harmonization
governs_symbols: []
depends_on:
  - ADR-0014
  - ADR-0015
  - ADR-0016
created_from_task: absorbed-originals-named-at-discovery
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

# ADR-0019: A package names the originals it absorbs where the host chooses a skill

## Context

In the same 2026-11-13 Ethel session as ADR-0018, Marionette ran only once, and only
after the owner asked "stai usando marionette?". Three earlier design requests
("usa ui pro max per rivedere tutta la pagina dei settings", the theme and accent
confusion, the theme × palette system) went elsewhere. The causes, from the
session, the host configuration and the generated skills:

1. **A project rule.** Ethel's `AGENTS.md` (line 158, an owner request of
   2026-11-11) sends every interface task, sketches included, to the project's
   own copy `.opencode/skills/ui-ux-pro-max/`. The host obeyed it. A project
   instruction outranks any skill; no package can or should override it.
2. **Originals installed beside the package.** Shinatama loads Marionette with
   `--plugin-dir`; the user scope still enables `ui-ux-pro-max`, `taste-skill` and
   `i-have-adhd` as plugins and `design-taste-frontend`, `landing-page-design`,
   `figma-designer`, `motion-design` and `gsap-scrolltrigger` as skills: eight of
   the forty names in `plugin.replaces`. `INSTALL.md` says to switch them off, but
   a launcher that injects the adapter never shows `INSTALL.md`.
3. **A rule the host could not apply.** The umbrella description ended with
   "Never invoke original absorbed skills." without naming one, and no entry named
   any. A host that hears "ui pro max", or sees `ui-ux-pro-max` installed, had no
   way to know Marionette holds it.
4. **A description cut by the factory.** The umbrella's AI-authored description
   (863 characters) plus the factory's suffix exceeded the 1024-character limit,
   so the build cut the AI text at "or steering what...".

Causes 1 and 2 are configuration outside the factory. Causes 3 and 4 are the
factory's.

## Principle

**A rule names what it refers to.** An instruction a host cannot apply without
knowledge it does not have is not a rule. "Never invoke original absorbed skills"
needs the names, at the place where the host chooses a skill: the descriptions it
reads before invoking anything, not `INSTALL.md` or a body loaded afterwards.

## Decision

1. **Declared, per entry.** An entry of `entries.json` may declare `absorbs`: the
   names from `plugin.replaces` whose work it now does. The harmonizing AI judges
   it from the capabilities' sources, never from similar names. A name whose
   source became session policy only belongs to no entry (Marionette:
   `i-have-adhd`).
2. **Written by the build, after the AI text.** The generated entry description is
   the AI-authored description, unchanged, followed by one sentence:
   "It replaces the absorbed `<names>`: use this skill instead of them, also when
   the user names one of them." The AI text is never reworded or cut; the sentence
   counts toward the 1024-character limit, which validation enforces.
3. **The umbrella points to them.** With entries that declare `absorbs`, the
   umbrella ends "Never invoke a skill it absorbs; its entries name them." Without
   entries it lists every name of `plugin.replaces`. The fixed part is shorter, so
   Marionette's AI-authored umbrella text now fits whole (999 of 1024 characters).
4. **Python checks, never chooses.** Every `absorbs` name must be in
   `plugin.replaces`, at most once per entry, and the list is nonempty when present.
   Python does not decide which entry absorbs what and does not require every name
   to be claimed: a name delivered as session policy has no entry.

### Algorithm

```
entry_description(entry):
    text = entry.description                       # AI-authored, verbatim
    if entry.absorbs:                              # AI-declared names from plugin.replaces
        text += " It replaces the absorbed " + join(entry.absorbs, ", ", " and ")
              + ": use this skill instead of them, also when the user names one of them."
    return text                                    # validated: len(text) <= 1024

umbrella suffix:
    entries declare absorbs  -> "Never invoke a skill it absorbs; its entries name them."
    replaces, no entries     -> "Never invoke a skill it absorbs: " + join(replaces, ", ") + "."
    neither                  -> ""
```

### Example

`examples/marionette/entries.json`:

```json
{"name": "marionette-web-design",
 "description": "Use when designing, building or restyling a website or landing page ... Not for a clickable prototype of app screens in HTML.",
 "capabilities": ["visual-direction", "design-guidance", "figma-design"],
 "absorbs": ["taste-skill", "design-taste-frontend", "landing-page-design", "figma-designer", "ui-ux-pro-max"]}
```

Generated `skills/marionette-web-design/SKILL.md` description (563 characters):
"Use when designing ... Not for a clickable prototype of app screens in HTML. It
replaces the absorbed taste-skill, design-taste-frontend, landing-page-design,
figma-designer and ui-ux-pro-max: use this skill instead of them, also when the
user names one of them."

## Consequences

- A request that names an absorbed original, or a session where one is still
  installed, now finds the package's entry with the name in its description. The
  original still competes while installed: the sentence is a preference the host
  reads, not a switch. Removing the originals stays the user's step.
- Cost: Marionette's twelve entry descriptions grow by 1,880 characters in all
  (about 470 tokens), listed in every session where the plugin is enabled; the
  umbrella's fixed part shrinks. No extra call.
- Outside the factory, recorded for the owner: Ethel's `AGENTS.md` rule decides
  interface work in that project until it is changed; the eight originals stay
  active until disabled; Shinatama could disable `plugin.replaces` for the
  sessions it starts with Marionette.

## Verification

`tests/test_absorbed_names.py`: names come from `plugin.replaces`, the sentence
counts against the limit, the AI text is kept whole and followed by the names,
Marionette claims every name except `i-have-adhd`, and the built umbrella keeps
its AI text whole. Live host runs (Claude Code 2.1.323, the owner's real user scope with
the original installed): a request naming "ui pro max" went to `ui-ux-pro-max:ui-ux-pro-max`
in 2 of 2 sessions on Marionette 0.2.0 and to `marionette:marionette-web-design` in 2 of 2
on this build; an unnamed request went to `marionette:marionette-design-review` on both
(1 of 1 each). Details, costs and limits:
`docs/verification/2026-11-13-check-scope-and-absorbed-names.md`.
