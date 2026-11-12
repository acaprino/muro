---
id: wireframe
role: lofi-exploration
when: —
after: []
outputs: ["wireframe_file", "wireframe_decision"]
checks: ["axis_stated_before_sketching", "variations_structurally_distinct", "lofi_conventions_kept", "annotations_beside_variations", "decision_captured_or_pending"]
intents: [{"id":"ui.wireframe-exploration","description":"Explore a screen, a flow, a navigation pattern or an information hierarchy as three or more low-fidelity, greyscale, annotated wireframes or short storyboards in one file, to compare structures before any hi-fi work, and record which one the user picks and why.","excludes":["A polished or clickable design is the prototype step; wireframes are disposable and never polished.","Alternatives of a design that is already hi-fi are design options.","The offer, copy and content outline of a landing page are landing strategy.","A diagram of software architecture or of a paper's method is not a wireframe."]}]
tools: [{"name":"file-access","purpose":"Read the brief's material and write one HTML file holding every variation.","required":true},{"name":"browser","purpose":"Look at the rendered sheet of variations.","required":false},{"name":"question-form","purpose":"Ask which axis to explore as a structured form when the host has one; otherwise in plain text, once.","required":false}]
hooks: []
conflicts: []
reads: ["offer", "page_outline"]
---

# Wireframe (low-fidelity exploration)

Sketches several structures of the same screen or flow quickly, so the user compares arrangements before any look is chosen. Wireframes are disposable: their value is the breadth of options, not the fidelity of any one. `<CD>` below stands for `<package_root>/scripts/claude-design-system-prompt/claude`. The method is `<CD>/skills/wireframe.md`. Open a packaged original only at the section a step names, when the step says so. The original is the full version and wins where this body differs, except for the changes listed in the Sources section.

## Behavior

1. **Understand the goal.** Read what is attached, then confirm: what is being explored (a screen, a flow, a navigation pattern, an information hierarchy, an interaction model); the user's goal on that screen or flow, and who the primary audience is; constraints (mobile or desktop, existing context or greenfield, non-negotiable elements); the number of variations (3 minimum, 5–6 ceiling per round); the axis of variation (layout, density, step count, CTA placement). When the user only says "wireframe a sign-up flow", propose 2–3 axes (for example single-page form, multi-step wizard, progressive disclosure) and ask which to explore. One consolidated round holding only questions whose answer changes the design; decide minor choices yourself and list them in the summary; then wait. For a brief that leaves more open, open `## Phase 3: Build the question set` of `<CD>/skills/discovery-questions.md`, and `## Phase 4: Format the question round` when the host has a question form. A recorded `page_outline` and `offer` give the content to arrange.
2. **Keep the wireframe conventions**, so the sheet reads as wireframes and not as broken hi-fi:
   - greyscale only: black, white, 2–3 greys; no brand colour;
   - a system sans-serif, so the user forms no font opinion yet;
   - labelled boxes for content areas ("headline", "image", "feature card");
   - striped placeholders for imagery with monospace labels (`product shot 1200×800`), never real images;
   - ipsum or skeleton copy, no final copy;
   - numbered callouts on key decisions are welcome.
3. **Write down each variation's distinguishing structure before sketching it**, then produce at least 3 variations that differ on the established axis: layout (centred, split-screen, grid), information density, flow structure (single page, multi-step, progressive disclosure), CTA placement or navigation pattern. Left unspecified they converge on near-identical layouts: make the differences deliberate and at least one genuinely off-distribution. Order them from most by-the-book to most novel.
4. **Draw them in one file**: single-screen variations side by side in a plain CSS grid, flow variations as small storyboards of 3–5 screens each.
5. **Annotate.** 2–4 annotation points per variation, placed next to it and not in a separate document, so the variation and its rationale are read together. `## Phase 4: Annotate` of the skill shows the form.
6. **Capture the decision.** After the user picks, record the chosen variation or hybrid, what attracted them, what they explicitly rejected and any new constraint that surfaced: this is the brief for the hi-fi follow-up. If the user has not chosen yet, record the decision as pending.
7. **Record** `wireframe_file` (path, variations, axis) and `wireframe_decision`, and summarize: variations produced, axis of variation, recommended next step, open questions surfaced.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return both output keys as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Hand-drawn-feeling SVG (rectangles, lines, simple icons) is acceptable here and only here, because everything is at the same low fidelity.
- Do not invest hi-fi polish in the wireframes: the hi-fi rules on real copy and polished detail do not apply to them.
- When the user holds hypotheses about what their audience wants, gently offer options that test them: a wireframe round and a hi-fi round on different bets are more useful than four hi-fi takes on the same bet.
- Ask the user before adding sections, pages, copy or content nobody requested.
- Refuse to recreate a company's distinctive UI patterns, proprietary command structures or branded visual elements, unless the user states the product is their own; help with an original design instead.
- After the decision suggest the next step, and do not start it: a hi-fi interactive prototype (`ui-prototype`), an HTML deck if the wireframe was for a presentation (`html-deck`), or another low-fi round.
- Look at the rendered sheet when a browser is available and say what was not looked at. Nothing is installed.

## Checks

- **axis_stated_before_sketching**: the axis of variation and each variation's distinguishing structure were written before drawing.
- **variations_structurally_distinct**: at least three variations differ on the established axis in structure, not in decoration, and at least one is genuinely off-distribution.
- **lofi_conventions_kept**: the sheet is greyscale only, in a system sans-serif, with labelled boxes, striped placeholders with monospace labels for imagery and ipsum or skeleton copy.
- **annotations_beside_variations**: every variation carries two to four annotation points next to it.
- **decision_captured_or_pending**: the user's pick, what attracted them, what they rejected and new constraints are recorded, or the decision is recorded as pending with the recommended next step and the open questions.

## Sources

- AI intent mapping: wireframe → ui.wireframe-exploration, from its five phases; discovery-questions supplies the round of step 1; system prompt chapters 3, 15 ("Test assumptions") and 19 are stated in the body.
- Source: claude-design-system-prompt (Trystan-SA/claude-design-system-prompt@3c3ddb07, head; commit `3c3ddb07d7aa3fef051d83608596470c95cfd8fe`, pin `head`). Opened at run time, by section, from `<package_root>/scripts/claude-design-system-prompt/`: `claude/skills/wireframe.md` and `claude/skills/discovery-questions.md`. This capability opens no chapter of `claude/system-prompt.md`.
- Provenance: the upstream README describes the repository as a "Reverse-engineered system prompt of Claude Design from Anthropic" (from the intake brief; README.md is excluded and was not read).
- Changes for coexistence (ADR-0017):
  - The trigger phrases ("explore options," "sketch something out," "see a few directions") are not activation rules: the coordinator classifies by meaning (competing routing).
  - The `design_canvas.jsx` starter belongs to the source's host and is not in the snapshot: the sheet is a plain CSS grid in one HTML file.
  - `questions_v2` (discovery-questions) is a tool of the source's host: the optional `question-form` tool or one plain-text message replaces it.
  - "Then suggest `make-a-prototype` ..., `make-a-deck` ..." names `ui-prototype` and `html-deck` to the user and starts neither: one capability per step, run by the coordinator.
  - The prompt's hi-fi rules (chapter 5 "Lorem ipsum where real copy belongs", chapter 16 "Show fewer ideas, but show them polished") contradict the skill's conventions: for a wireframe the skill governs.
  - Chapter 19's "unless the user's email domain indicates they work at that company" cannot be checked by any host: the user's own statement replaces it.
  - Added by the package: the pending value of `wireframe_decision` (a step closes only with both output keys); `offer` and `page_outline` as content to arrange (handoff from the landing capabilities); the line on what was looked at (honest reporting).
- Runtime dependency: none. Hooks: the selected files define none; `codex/**` and `README.md` are excluded and were not inspected.
- Harmonized by: prompts/harmonizer.md (2026-11-12) — a new role. No earlier capability explores structure at low fidelity: `visual-direction` plans one page by screens and builds it, `design-options` varies a design that already has a look. It reads a recorded landing outline but needs none.
