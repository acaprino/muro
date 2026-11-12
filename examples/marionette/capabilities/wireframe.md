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

Sketches several structures of the same screen or flow quickly, so the user compares arrangements before any look is chosen. The value is the breadth of options; no single wireframe is worth polishing. `<CD>` below stands for `<package_root>/scripts/claude-design-system-prompt/claude`.

## Behavior

1. **Fix the goal.** What is explored (a screen, a flow, navigation, hierarchy, an interaction model), what the user of that screen wants to do, the constraints (mobile or desktop, existing product or new, elements that must stay), how many variations (three at least, five or six at most per round) and the axis they vary on. When the request names no axis, propose two or three (for a sign-up: one page, a multi-step wizard, progressive disclosure) and ask which, once. A recorded `page_outline` and `offer` give the content to arrange.
2. **Keep the wireframe language**, so nobody reads the sheet as unfinished hi-fi:
   - black, white and two or three greys, no brand colour;
   - a system sans-serif, no type personality;
   - labelled boxes for content areas ("headline", "image", "feature card");
   - striped placeholders with a monospace label and size for imagery, never real images;
   - skeleton copy, no final wording;
   - numbered callouts on the decisions that matter.
3. **Write each variation's structure before drawing it.** One sentence per variation saying what distinguishes it (layout, density, flow structure, placement of the main action, navigation). Left unstated, variations converge. Order them from the conventional to the novel and make one clearly unusual.
4. **Draw them in one file.** Single screens side by side in a grid; a flow as a storyboard of three to five screens per variation.
5. **Annotate beside each variation**, two to four points: what it is good at and what it costs.
6. **Capture the decision.** After the user picks: the chosen variation or hybrid, what attracted them, what they rejected, constraints that surfaced. This is the brief for the hi-fi step. If the user has not chosen yet, record the decision as pending with your recommendation.
7. **Record** `wireframe_file` (path, variations, axis) and `wireframe_decision`.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return both output keys as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Simple line shapes and rough icons are acceptable here and only here: everything sits at the same low fidelity.
- When the user holds a hypothesis about their audience, a wireframe round and a hi-fi round on different bets tell more than several hi-fi takes on one bet.
- One file with every variation; never `v1.html`, `v2.html`, `v3.html`.
- Sections, pages or content beyond the brief are proposed to the user, not added.
- The source lays variations out with a canvas starter of its own host (`design_canvas.jsx`), which is not packaged: use a plain CSS grid.
- After the decision, the usual next step is a prototype, an HTML deck when the wireframe was for a presentation, or another low-fidelity round. Suggest it; do not start it.
- Full method: `<CD>/skills/wireframe.md`. Nothing is installed.

## Checks

- **axis_stated_before_sketching**: the axis of variation and each variation's distinguishing structure were written before drawing.
- **variations_structurally_distinct**: at least three variations differ in structure, not in decoration, and one is outside the conventional range.
- **lofi_conventions_kept**: the sheet is greyscale, in a system sans-serif, with labelled boxes, placeholder imagery and skeleton copy.
- **annotations_beside_variations**: every variation carries two to four annotations next to it.
- **decision_captured_or_pending**: the user's pick, attractions, rejections and new constraints are recorded, or the decision is recorded as pending with a recommendation.

## Sources

- AI intent mapping: wireframe → ui.wireframe-exploration, from its five phases; discovery-questions supplies the single question round of step 1; system prompt chapter 15 ("Test assumptions") and chapter 19 (no added scope) supply two Specifics.
- Source: claude-design-system-prompt (Trystan-SA/claude-design-system-prompt@3c3ddb07, head; commit `3c3ddb07d7aa3fef051d83608596470c95cfd8fe`, pin `head`) — `claude/skills/wireframe.md`, `claude/skills/discovery-questions.md`, packaged under `<package_root>/scripts/claude-design-system-prompt/`; `claude/system-prompt.md` chapters 15 and 19, read at intake only and not packaged (`intake_only_paths`: its rules are restated in this body).
- Provenance: the upstream README describes the repository as a "Reverse-engineered system prompt of Claude Design from Anthropic" (README.md is excluded from the selection and was not read at intake; the fact comes from the intake brief). The method is restated here, not copied.
- Not adopted: the host starter `design_canvas.jsx` and the `questions_v2` tool, which the selected snapshot names but does not contain; the source's "then suggest `make-a-prototype`" routing, kept only as a suggestion to the user.
- Runtime dependency: none. Hooks: the selected files define none; `codex/**` and `README.md` are excluded and were not inspected.
- Harmonized by: prompts/harmonizer.md (2026-11-12) — a new role. No earlier capability explores structure at low fidelity: `visual-direction` plans one page by screens and builds it, `design-options` varies a design that already has a look. It reads a recorded landing outline but needs none.
