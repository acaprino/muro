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

Gives the user alternatives inside one file: several distinct takes on a design, or one design with live controls. One design is one bet; three let the user reject what they do not want and combine what they do. `<CD>` below stands for `<package_root>/scripts/claude-design-system-prompt/claude`. The method is `<CD>/skills/generate-variations.md` for `ui.design-variations` (steps 1 to 5) and `<CD>/skills/make-tweakable.md` for `ui.tweak-controls` (steps 6 to 9, also when variations are presented through tweaks). Open a packaged original only at the section a step names, when the step says so. Each original is the full version and wins where this body differs, except for the changes listed in the Sources section. Record what was not asked as `not requested`. The design to work on is the user's file, or a recorded `prototype_file`.

## Behavior

1. **Establish the baseline.** Confirm: what is being varied (screen, component, flow, visual treatment; the scope sets how many variations are useful); the existing design context (variations are rooted in the UI kit or design system unless the user explicitly asks to break free); the number (default 3; 5–6 is a healthy ceiling); the axis preference (visuals, interactions, layout, or copy and tone); whether they want by-the-book options, novel ones or a mix. The context is the recorded `aesthetic_direction`, `design_tokens`, `palette` and `typography`, or the product's own files, read and not remembered, with exact values lifted from them. Ask only what the request leaves open, in one plain-text message, and wait; skip the round for a small follow-up on existing work. For a new or ambiguous request open `## Phase 3: Build the question set` of `<CD>/skills/discovery-questions.md`.
2. **Pick 2–4 dimensions to vary across** (`## Phase 2: Pick the axes` of generate-variations lists them: visual treatment, layout, interaction model, information hierarchy, tone, component style) and write down which axis each variation flexes.
3. **Specify each variation concretely before building it**: a distinct palette family, a distinct type pairing, a distinct layout skeleton, written down per variation. Left unspecified, variations drift toward one default look. Order them from most by-the-book to most novel: (1) by the book, matching existing patterns; (2) refined, the same structure with one or two dimensions pushed; (3) novel, a genuinely different take, deliberately off-distribution; (4–6, if requested) hybrids along the spectrum or a wildcard on another axis. Cover both ends: an all-safe set wastes the user's time, an all-wild set ignores the brief.
4. **Vary substantively, not cosmetically**: in layout, hierarchy, what is primary, type system, density, interaction approach or copy strategy, not just button colour, accent shade or shadow opacity. If two are too close, drop one for a more substantive alternative. The user must be able to say the difference between any two in one sentence.
5. **Present in a single file, caption and recommend.** Static variations side by side in one labelled CSS grid, or as tweaks (steps 6 to 9) when they share structure and differ on a few axes; for flows, each variation is a small storyboard. Caption each in one or two sentences; a caption that cannot be written clearly means the variation is not distinct enough. End with a clear recommendation and its reason: the user decides, but do not hedge that all options are equally good. Then name the next step: a refinement round on the chosen direction, another round on a different axis, a prototype (`ui-prototype`), or a review before shipping (`design-review`).
6. **Identify what should be tweakable.** Confirm with the user, or propose and check, which aspects to expose: colour, typography, density, layout variant, component variants, copy, feature flags (show or hide sections). Keep the surface small, 3–8 controls. If the user did not ask for tweaks but the design has obvious axes of variation, add 1–2 by default.
7. **Design the panel.** It lives inside the design, floating (typically bottom-right), semi-transparent with a subtle border, titled **"Tweaks"**, a narrow stacked column. One control per value type: colour picker for colours; dropdown or button group for fonts and variants; slider with sensible min and max for numbers; toggle for booleans; text input for copy.
8. **Wire the live updates and persist.** Visual tokens are CSS custom properties set on the root element; copy, layout variants and feature flags use JS state with re-render or DOM manipulation. Defaults live in one valid JSON object in an inline script of the file; changed values are saved to `localStorage` and restored on load.
9. **Hide the controls when off, then verify.** With the panel off it is entirely hidden, not dimmed and not collapsed to a corner; this is non-negotiable. State how it opens (a key, or a parameter in the address). Verify in the preview: turn the panel on and off, change each tweak and confirm it updates live, reload and confirm the values persist, and check the design reads as a finished artifact with the panel off.
10. **Record** `options_file` and `options_summary`: the variations with their axes, captions and the recommendation; or the tweaks exposed with their value types and defaults, the tweaks considered but excluded and why, and whether the set covers the user's exploration axes.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return both output keys as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **One file, many variants.** Never `v1.html` / `v2.html` / `v3.html`: one file, all variations visible or toggle-able.
- The source's panel is switched by a toolbar of its own host. Only inside a host that provides that toolbar, open `## Phase 4: Implement the host protocol` and `## Phase 5: Persist defaults on disk` of `<CD>/skills/make-tweakable.md` and follow them as written; everywhere else the panel opens by itself and persists in the browser.
- A recorded direction stays the owner of the look. A variation that leaves it is labelled as doing so, and a control never writes outside the file it lives in.
- Each variation is a hi-fi design: fewer and polished beats many half done, bold on one or two dimensions rather than safe on all, and within the minimum sizes (mobile body 16px, hit targets 44px × 44px, desktop body 14–16px, 1920×1080 slides body 24px, print 12pt).
- Ask the user before adding sections, pages, copy or content nobody requested; empty space is solved with composition, not filler.
- Refuse to recreate a company's distinctive UI patterns, proprietary command structures or branded visual elements, unless the user states the product is their own; such a design is not offered as a variation.
- Nothing is installed.

## Checks

- **options_differ_in_one_sentence**: for any two variations the difference is stated in one sentence and is not cosmetic; not applicable to a tweak-only request.
- **both_ends_covered**: the set holds a by-the-book variation and a novel one.
- **single_file_delivered**: every variation or control is in one file.
- **recommendation_given**: one variation is recommended with its reason.
- **tweaks_update_and_persist**: each control changes the design live and its value survives a reload; without a browser this is not tested and said so.
- **panel_hidden_when_off**: with the panel off it is entirely hidden, not dimmed and not collapsed to a corner, and the way to open it is stated.

## Sources

- AI intent mapping: generate-variations → ui.design-variations (its six phases); make-tweakable → ui.tweak-controls (its seven phases); discovery-questions supplies what is confirmed first; system prompt chapters 3, 4, 14 (persisted tweak values), 16, 17 (with the minimum sizes of chapter 8) and 19 are stated in the body.
- Source: claude-design-system-prompt (Trystan-SA/claude-design-system-prompt@3c3ddb07, head; commit `3c3ddb07d7aa3fef051d83608596470c95cfd8fe`, pin `head`). Opened at run time, by section, from `<package_root>/scripts/claude-design-system-prompt/`: `claude/skills/generate-variations.md`, `claude/skills/make-tweakable.md` and `claude/skills/discovery-questions.md`. This capability opens no chapter of `claude/system-prompt.md`.
- Provenance: the upstream README describes the repository as a "Reverse-engineered system prompt of Claude Design from Anthropic" (from the intake brief; README.md is excluded and was not read).
- Changes for coexistence (ADR-0017):
  - The trigger phrases ("different takes," "show me a few", "play with options," "see different versions") are not activation rules: the coordinator classifies by meaning (competing routing). Two skills are one capability: the selected intent sets which steps run, the other part is `not requested`.
  - make-tweakable Phase 4 (`__activate_edit_mode`, `__deactivate_edit_mode`, `__edit_mode_available`, `__edit_mode_set_keys`) and Phase 5 (the `/*EDITMODE-BEGIN*/ ... /*EDITMODE-END*/` block the host rewrites on disk) need a toolbar no supported host has: the panel has its own opening control and persists in `localStorage`, and "to match the toolbar toggle", "With Tweaks toggled off" and "toggle the panel on/off via the toolbar" mean the panel's own control.
  - The `design_canvas.jsx` starter belongs to the source's host and is not in the snapshot: variations sit in a plain CSS grid in the same file.
  - The next steps of generate-variations Phase 6 (`make-a-prototype`, `polish-pass`) are named to the user as `ui-prototype` and `design-review` and not started: one capability per step, run by the coordinator.
  - `questions_v2` (discovery-questions) is a tool of the source's host and this capability declares no question-form tool: the round is one plain-text message.
  - Chapter 19's "unless the user's email domain indicates they work at that company" cannot be checked by any host: the user's own statement replaces it.
  - Added by the package: a recorded direction as owner of the look, with a variation that leaves it labelled as such (`aesthetic_direction` has one owner); the recorded `prototype_file` as the design to work on (handoff through the coordinator); the stated way to open the panel.
- Runtime dependency: none. Hooks: the selected files define none; `codex/**` and `README.md` are excluded and were not inspected.
- Harmonized by: prompts/harmonizer.md (2026-11-12) — the two skills are merged into one role with two intents: both deliver alternatives of a hi-fi design in a single file, and the source presents variations through tweaks and tweaks as variants (generate-variations Phase 5, make-tweakable Phase 1). Kept apart from `wireframe`, whose greyscale conventions contradict hi-fi rules.
