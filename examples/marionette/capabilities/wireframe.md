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

Sketches several structures of the same screen or flow quickly, so the user compares arrangements before any look is chosen. In the skill's words: "**Wireframes are disposable** — their value is breadth of options, not the fidelity of any one." `<CD>` below stands for `<package_root>/scripts/claude-design-system-prompt/claude`.

## Behavior

0. **Read the originals whole before working.** They are the method, in the source's own words:
   - `<CD>/skills/wireframe.md`, all five phases;
   - `<CD>/skills/discovery-questions.md`, for the question round of step 1;
   - in `<CD>/system-prompt.md`, these chapters only, each from its heading to the next `# ` heading: `# 2. Workflow`, `# 3. Asking questions first`, `# 5. Content principles — no filler`, `# 15. Understanding users`, `# 16. Quality over quantity`, `# 19. IP and content boundaries`. No other part of the prompt is read for this capability.

   The steps below are an index into those files. Where this body and an original differ, the original wins, except for the changes listed in the Sources section under "Changes for coexistence".
1. **Understand the goal** (skill Phase 1, discovery-questions, chapters 3 and 15). "Confirm: **what's being explored** (a screen, a flow, a navigation pattern, an information hierarchy, an interaction model); **the user goal** on this screen or flow; **constraints** (mobile or desktop, existing context or greenfield, non-negotiable elements); **number of variations** (3 minimum, 5–6 ceiling per round); **axis of variation** (layout? density? step count? CTA placement?)." "If the user just says "wireframe a sign-up flow," propose 2–3 axes (e.g., "single-page form vs multi-step wizard vs progressive disclosure") and ask which to explore." One consolidated round. A recorded `page_outline` and `offer` give the content to arrange.
2. **Establish wireframe conventions** (skill Phase 2). "Stick to the wireframe visual language so the user reads them as wireframes, not broken hi-fi:"
   - "**Greyscale only** — black, white, 2–3 grays; no brand color"
   - "**System sans-serif** — no type personality; the user shouldn't form font opinions yet"
   - "**Boxes for content areas**, labeled ("headline", "image", "feature card")"
   - "**Striped placeholders for imagery** with monospace labels (`product shot 1200×800`) — never real images; they pull focus"
   - "**Ipsum or skeleton copy** — no final copy at this stage"
   - "**Annotations welcome** — numbered callouts on key decisions"
3. **Sketch variations** (skill Phase 3). "Produce **at least 3** variations differing on the established axis." "Write down each variation's distinguishing structure before sketching it. Left unspecified, variations converge on near-identical layouts — make the differences deliberate, and make at least one genuinely off-distribution." "Order from most by-the-book to most novel". The dimensions to vary across are the skill's list in Phase 3.
4. **Draw them in one file.** Single-screen variations side by side; "build flow variations as small storyboards (3–5 screens each)".
5. **Annotate** (skill Phase 4). "Add 2–4 annotation points per variation, placed next to it (not in a separate doc), so the user reads the variation and its rationale together".
6. **Capture decisions and hand off** (skill Phase 5). "After the user picks a direction, capture: the chosen variation (or hybrid), what attracted them to it, what they explicitly rejected, and any new constraints surfaced. This becomes the brief for the hi-fi follow-up." If the user has not chosen yet, record the decision as pending.
7. **Record** `wireframe_file` (path, variations, axis) and `wireframe_decision`, and summarize as the skill ends: "variations produced, axis of variation, recommended next step, open questions surfaced."

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return both output keys as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Skill Phase 2: "This is the one context where hand-drawn-feeling SVG (rectangles, lines, simple icons) is acceptable — everything is at the same low fidelity."
- Skill Phase 5: "Don't invest hi-fi polish in the wireframes themselves — they've served their purpose."
- Chapter 15: "When the user has hypotheses about what their audience wants, gently surface options that test those assumptions. A wireframe round and a hi-fi round on different bets is more useful than four hi-fi takes on the same bet."
- One file holds every variation: the skill lays them side by side on one canvas, and this step hands over one `wireframe_file`.
- Chapter 19: "If you think additional sections, pages, copy, or content would improve the design, **ask the user first.**"
- The source lays variations out with a canvas starter of its own host (`design_canvas.jsx`), which is not packaged: use a plain CSS grid.
- After the decision the skill suggests the next step: a hi-fi interactive prototype (`ui-prototype`), an HTML deck "if the wireframe was for a presentation" (`html-deck`), "or another low-fi round". Suggest it; do not start it.
- Nothing is installed.

## Checks

- **axis_stated_before_sketching**: the axis of variation and each variation's distinguishing structure were written before drawing.
- **variations_structurally_distinct**: at least three variations differ on the established axis in structure, not in decoration, and at least one is genuinely off-distribution.
- **lofi_conventions_kept**: the sheet is greyscale only, in a system sans-serif, with labelled boxes, striped placeholders with monospace labels for imagery and ipsum or skeleton copy.
- **annotations_beside_variations**: every variation carries two to four annotation points next to it.
- **decision_captured_or_pending**: the user's pick, what attracted them, what they rejected and new constraints are recorded, or the decision is recorded as pending with the recommended next step and the open questions.

## Sources

- AI intent mapping: wireframe → ui.wireframe-exploration, from its five phases; discovery-questions supplies the single question round of step 1; system prompt chapters 2 (order of work), 3 (questions), 5 (ask before adding), 15 ("Test assumptions"), 16 and 19 (no added scope) are applied as the delivery decisions assign them.
- Source: claude-design-system-prompt (Trystan-SA/claude-design-system-prompt@3c3ddb07, head; commit `3c3ddb07d7aa3fef051d83608596470c95cfd8fe`, pin `head`) — `claude/skills/wireframe.md`, `claude/skills/discovery-questions.md` and `claude/system-prompt.md` (chapters 2, 3, 5, 15, 16 and 19), all packaged under `<package_root>/scripts/claude-design-system-prompt/` and read at run time (step 0).
- Provenance: the upstream README describes the repository as a "Reverse-engineered system prompt of Claude Design from Anthropic" (README.md is excluded from the selection and was not read at intake; the fact comes from the intake brief).
- Changes for coexistence (ADR-0017):
  - The skill's opening trigger phrases ("explore options," "sketch something out," "see a few directions") are not activation rules here: the coordinator classifies by meaning.
  - "Lay single-screen variations side-by-side with the `design_canvas.jsx` starter": the starter belongs to the source's host and is not in the selected snapshot, so no supported host can copy it. The sheet is a plain CSS grid in one HTML file.
  - The form tool `questions_v2` of discovery-questions Phases 4 and 5 belongs to the source's host: the round uses the optional logical `question-form` tool when the host has one, otherwise one plain-text message, and the step waits for the answers either way.
  - Skill names in the originals are not invoked from this step (one capability per step, run by the coordinator). "Then suggest `make-a-prototype` ..., `make-a-deck` ..." is a suggestion to the user that names `ui-prototype` and `html-deck`; discovery-questions Phase 5 "Proceed to the appropriate building skill" means continuing with the steps of this body.
  - Added by the package: the pending value of `wireframe_decision` when the user has not picked yet (the coordinator closes a step only with both output keys); the recorded `offer` and `page_outline` as content to arrange (handoff from the landing capabilities).
  - Chapters 2, 5 and 16 are written for hi-fi work. Where they meet this skill, the skill's own words govern a wireframe: chapter 2's "(See chapter 4.)" is covered by the skill's constraint "existing context or greenfield" and its "no brand color"; chapter 5's "Lorem ipsum where real copy belongs" and chapter 16's "Copy proofread, no Lorem" by "**Ipsum or skeleton copy** — no final copy at this stage"; chapter 16's "Show fewer ideas, but show them polished" by "their value is breadth of options" and "Don't invest hi-fi polish in the wireframes themselves". This is the source's own exception ("This is the one context where ..."), recorded so the host does not apply both.
  - Chapter 2, closing paragraphs ("You are encouraged to call file-exploration tools concurrently", "Default to silence between tool calls ...") are not applied: conduct for the whole conversation belongs to the host and would change how other capabilities report. The "verifier subagent" of its step 5 is a tool of the source's host: the sheet is looked at with the optional `browser` tool, and what was not looked at is said.
  - Chapter 19's test "unless the user's email domain indicates they work at that company" cannot be run by any supported host: it is replaced by the user's own statement that the product is theirs.
  - Not read and not applied (dropped in `delivery.json`): the prompt's opening lines, chapter 1 (persona, "the user is your manager", the rule not to divulge the environment), chapter 20 (the source's own routing and trigger phrases) and the "Final principle".
- Runtime dependency: none. Hooks: the selected files define none; `codex/**` and `README.md` are excluded and were not inspected.
- Harmonized by: prompts/harmonizer.md (2026-11-12) — a new role. No earlier capability explores structure at low fidelity: `visual-direction` plans one page by screens and builds it, `design-options` varies a design that already has a look. It reads a recorded landing outline but needs none.
