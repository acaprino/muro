---
id: design-options
role: design-options
when: —
after: []
outputs: ["options_file", "options_summary"]
checks: ["options_differ_in_one_sentence", "both_ends_covered", "single_file_delivered", "recommendation_given", "tweaks_update_and_persist", "panel_hidden_when_off"]
intents: [{"id":"ui.design-variations","description":"Produce three or more substantively different hi-fi variations of a screen, a component or a flow in one file, from the conventional to the novel, each captioned with what it changes, with a recommendation, so the user can keep, reject and combine.","excludes":["Low-fidelity structural exploration before a look exists is the wireframe step.","Cosmetic differences alone (a button colour, a shadow) are not variations.","Variants of a component inside a Figma file are Figma work.","An A/B test wired into production code is an engineering change."]},{"id":"ui.tweak-controls","description":"Add a small floating panel of live controls to a finished HTML design so the user can adjust chosen aspects in place (colour, type, density, a layout or component variant, copy, shown sections), with values kept across reloads and the panel fully hidden when off.","excludes":["A settings screen or theme switcher that is a feature of the product itself.","Changing the design's values once, with no wish to keep adjusting, is an ordinary edit.","A design-tool clone with dozens of controls: the panel holds three to eight."]}]
tools: [{"name":"file-access","purpose":"Read the design and its system, and write the variations or the panel into one HTML file.","required":true},{"name":"browser","purpose":"Compare the variations as rendered and operate each control, including a reload.","required":false}]
hooks: []
conflicts: []
reads: ["aesthetic_direction", "palette", "typography", "constraints", "design_tokens", "prototype_file"]
---

# Design Options (hi-fi variations and tweak controls)

Gives the user alternatives inside one file: several distinct takes on a design, or one design with live controls. One design is one bet; a few let the user reject and combine. `<CD>` below stands for `<package_root>/scripts/claude-design-system-prompt/claude`.

## Behavior

0. **Scope by the selected intent.** Variations are steps 1 to 5, tweak controls steps 6 to 9; record what was not asked as `not requested`. The design to work on is the user's file, or a recorded `prototype_file`.
1. **Baseline.** What is varied, how many (three by default, five or six at most), and where the user wants the exploration weighted. Variations stay inside the existing system (`aesthetic_direction`, `design_tokens`, a recorded `palette` and `typography`, or the product's own files) unless the user asks to break out of it.
2. **Pick two to four axes:** visual treatment, layout, interaction model, information hierarchy, tone, component style. Write which axis each variation moves.
3. **Specify each variation before building it:** its palette family, type pairing and layout skeleton. Variety has to be designed; unspecified, variations drift to one look. Build from conventional to novel: one that follows existing patterns, one with the same structure and one or two dimensions pushed, one that is a different take, then hybrids or a wildcard when more are asked. All safe wastes the user's time; all wild ignores the brief.
4. **Drop near-duplicates.** Any two variations differ in layout, hierarchy, what is primary, type system, density, interaction or copy strategy, in a way one sentence can state.
5. **Present and recommend.** Static variations side by side in one labelled grid; variations of one structure behind toggles; flows as small storyboards. Caption each in one or two sentences, then say which one you would pick and why, and name the next step (refine, another round on another axis, a prototype, a review).
6. **Choose the controls** with the user, or propose them: three to eight of colour (primary, accent, background tone), type (family, base size, scale ratio), density, layout variant, component variant, copy, shown sections. One or two when the user asked for none but the design has an obvious axis.
7. **Build the panel:** floating, usually bottom right, titled "Tweaks", a narrow stacked column. Colour picker for colours, button group or dropdown for fonts and variants, slider with sensible bounds for numbers, toggle for booleans, text input for copy.
8. **Wire and persist.** Visual values are CSS custom properties set on the root element; copy, layout variants and flags are script state. Defaults live in one JSON object in an inline script; changed values are saved to `localStorage` and restored on load.
9. **Hide it completely when off**, not dimmed or collapsed, and state how it opens (a key, or a parameter in the address). Check each control live, a reload, and the design with the panel off.
10. **Record** `options_file` and `options_summary` (variations with their axes and the recommendation; or controls with types, defaults and those considered and left out).

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return both output keys as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **One file, many variants.** Never `v1.html`, `v2.html`, `v3.html`.
- The source's panel is switched by a toolbar of its own host, through window messages and a marked defaults block that the host rewrites on disk (`<CD>/skills/make-tweakable.md`, Phases 4 and 5). No host this package runs on has that toolbar, so the panel here opens by itself and persists in the browser. Follow those two phases only inside a host that provides the toolbar.
- The source's side-by-side canvas starter (`design_canvas.jsx`) is not packaged: use a plain CSS grid.
- A recorded direction stays the owner of the look. A variation that leaves it is labelled as doing so, and a control never writes outside the file it lives in.
- A company's distinctive interface or branded elements are not offered as a variation unless the user states the product is their own.
- Full methods: `<CD>/skills/generate-variations.md` and `<CD>/skills/make-tweakable.md`. Nothing is installed.

## Checks

- **options_differ_in_one_sentence**: for any two variations the difference is stated in one sentence and is not cosmetic; not applicable to a tweak-only request.
- **both_ends_covered**: the set holds a conventional variation and a novel one.
- **single_file_delivered**: every variation or control is in one file.
- **recommendation_given**: one variation is recommended with its reason.
- **tweaks_update_and_persist**: each control changes the design live and its value survives a reload; without a browser this is not tested and said so.
- **panel_hidden_when_off**: with the panel off no control or handle is visible, and the way to open it is stated.

## Sources

- AI intent mapping: generate-variations → ui.design-variations (its six phases); make-tweakable → ui.tweak-controls (its seven phases); system prompt chapter 17 ("Give multiple variations", "One file, many variants") supports both.
- Source: claude-design-system-prompt (Trystan-SA/claude-design-system-prompt@3c3ddb07, head; commit `3c3ddb07d7aa3fef051d83608596470c95cfd8fe`, pin `head`) — `claude/skills/generate-variations.md`, `claude/skills/make-tweakable.md`, packaged under `<package_root>/scripts/claude-design-system-prompt/`; `claude/system-prompt.md` chapters 16, 17 and 19, read at intake only and not packaged (`intake_only_paths`: its rules are restated in this body).
- Provenance: the upstream README describes the repository as a "Reverse-engineered system prompt of Claude Design from Anthropic" (README.md is excluded from the selection and was not read at intake; the fact comes from the intake brief). The method is restated here, not copied.
- Not adopted as the default: the host edit-mode protocol and on-disk defaults rewriting (see Specifics); the `design_canvas.jsx` starter. Adaptation, a Muro choice: the panel's own opening control and `localStorage` persistence.
- Runtime dependency: none. Hooks: the selected files define none; `codex/**` and `README.md` are excluded and were not inspected.
- Harmonized by: prompts/harmonizer.md (2026-11-12) — the two skills are merged into one role with two intents: both deliver alternatives of a hi-fi design in a single file, and the source presents variations through tweaks and tweaks as variants (generate-variations Phase 5, make-tweakable Phase 1). Kept apart from `wireframe`, whose greyscale conventions contradict hi-fi rules.
