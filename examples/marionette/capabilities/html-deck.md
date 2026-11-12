---
id: html-deck
role: html-deck-authoring
resumable: true
when: —
after: []
outputs: ["html_deck_plan", "html_deck_file", "html_deck_review"]
checks: ["layout_system_stated", "slides_scale_and_navigate", "slide_type_minimums_met", "no_filler_slides", "deck_content_from_material", "deck_walked_or_disclosed"]
intents: [{"id":"ui.html-deck","description":"Build a slide presentation as one HTML file that runs in a browser: fixed-size slides (1920×1080 by default) that scale and letterbox to any screen, keyboard and tap navigation, a slide counter, the position kept across reloads and printing to PDF, designed through a stated layout system.","excludes":["A deck wanted as a PowerPoint file, or a presentation request that names no format and gives no reason to run in a browser, is the Office deck.","Turning an existing .pptx into HTML or PDF is an Office file conversion.","A scrolling web page or an interactive article is not a deck.","Talking points wanted only in the conversation need no file."]}]
tools: [{"name":"file-access","purpose":"Read the source material and the design system, and write the deck as one HTML file.","required":true},{"name":"browser","purpose":"Walk the deck at several window sizes and check navigation, overflow and print.","required":false},{"name":"question-form","purpose":"Ask the opening questions as a structured form when the host has one; otherwise in plain text, once.","required":false}]
hooks: []
conflicts: []
reads: ["aesthetic_direction", "palette", "typography", "constraints", "design_tokens"]
needs: [{"capability": "aesthetic-direction", "label": "no brand, no direction", "when": "Nothing gives the deck a look to match: no brand, template, design system or reference in the user's material or the project, and no direction, palette or tokens among the recorded outputs. Not when any of those exists.", "reason": "The source confirms the brand or design system before drawing a deck and asks for the aesthetic direction first when there is none (make-a-deck, Phase 1)."}]
---

# HTML Deck (browser presentation)

Builds a presentation that is a web page: slides of a fixed size that fit any screen, moved with the keyboard. It is the browser alternative to `office-deck`, which produces a PowerPoint file; the user's wanted format decides between them. `<CD>` below stands for `<package_root>/scripts/claude-design-system-prompt/claude`. The full version is `<CD>/skills/make-a-deck.md`: open it when a step leaves a doubt. It wins where this body differs, except for the changes listed in the Sources section. Other files are opened only where a step names them.

## Behavior

1. **Brief.** Read every attached resource before asking. Confirm what is still open: the audience (it sets tone and density); the format (aspect ratio, 16:9 by default, and slide count: a 10-minute deck is about 10 slides, a 30-minute one about 20 to 25); the tone (formal corporate, casual internal, marketing-bold, technical); the source content (read any PRD or existing material before sketching); speaker notes (off by default, only when explicitly requested); the brand or design system (always confirm; with none, the direction comes first: the `needs` on `aesthetic-direction`). If the user gave enough context (for example "make a 5-slide deck for engineering all-hands from this PRD"), skip the round. Otherwise ask once, in one round (a structured form when the host has a question-form tool, plain text when not), and end the turn until the answers come back; later minor decisions are made and listed in the summary, not asked. When a round is needed, open `<CD>/skills/discovery-questions.md` from `## Phase 2: Decide whether to ask` to `## Phase 5: End the turn, then confirm` for the always-ask questions, the sizing and order of the round and the handling of the answers.
2. **Take the look from what exists.** Use the recorded `aesthetic_direction`, `design_tokens`, or `palette`, `typography` and `constraints`; otherwise the user's brand material. Read the source, not memory: lift exact hex codes, spacing values and font stacks, and follow the existing visual vocabulary (palette and tone, typography, density, radii, shadows, card patterns, copy tone) before adding to it. With nothing to match and no `aesthetic-direction` step before this one, ask the user for context: do not invent a brand or a visual language unless explicitly asked to.
3. **Plan the layout system.** Before building any slide, commit to a layout system and write it in a comment block at the top of the file. A typical deck has 4 to 6 layout types: cover/title, section header (full-bleed color or image), content slide (headline + chart/image/list), quote/pull-out, comparison/two-column, closing/CTA. For each: background treatment, headline size and position, body content area, footer (page number, brand mark, none). Limit the deck to 1–2 background colors; section headers may break to a third, no more. For a choice the recorded direction or the brand does not settle, open in `<CD>/system-prompt.md` only the chapter that covers it: `# 6. Aesthetic principles — purposeful visuals` (gradients, emoji, cards, imagery, fonts, toned whites and blacks, palette), `# 7. Visual hierarchy and rhythm` (hierarchy signals, spacing scale) or `# 8. Typography system` (families, type scale, body text).
4. **Write the shell once.** The source's deck-shell starter is not packaged, so write a shell that does what it handles: scaling and letterboxing to any viewport by JS (never locked to one screen size), keyboard and tap navigation, the slide counter, `localStorage` persistence of the slide index, print-to-PDF. Each slide is one `<section>`, a direct child of the stage element of the fixed slide size (typically 1920×1080). Give each slide a `data-screen-label` so the user can name it when commenting (`<section data-screen-label="01 Title">`); labels are 1-indexed, like the counter the user sees.
5. **Build slide by slide**, in order, and show the user the file after 1–2 slides: do not perfect 15 in private and then reveal. Per slide:
   - **Type.** Body never under 24px on a 1920×1080 canvas, ideally 32px+; headlines 60–96px+.
   - **Hierarchy.** One primary message per slide; supporting elements smaller and more muted.
   - **Imagery.** From the design system, or honest placeholders (striped background, monospace label). No hand-drawn SVG filler.
   - **No filler slides.** "Why choose us?" and "About this deck" cost the user attention: cut them.
   - **Charts.** Show what matters; cut columns and data points that do not support the slide's point.
   - Use the design system's spacing and color tokens, no new values inline.
6. **Speaker notes, only if requested.** Add a `<script type="application/json" id="speaker-notes">` array in the head, one entry per slide, written as full conversational scripts, not bullet outlines. Slides with notes can carry less on-screen text. The shell of step 4 must render them itself, and the report says how they are shown.
7. **Verify and deliver.** Walk the deck top to bottom in the preview: scaling at multiple viewport sizes, the counter increments correctly, keyboard navigation (arrows, space) works, nothing overflows slide bounds, type meets the 24px+ minimum, contrast passes WCAG. Because the shell is written here, also check tap navigation, the position after a reload and the print layout. Without a browser, record each of these as not tested: what could not be verified is said, never claimed.
8. **Record** `html_deck_plan` (layout system and slide list), `html_deck_file` and `html_deck_review`: what was walked, and a brief summary of caveats (for example placeholder imagery still needed), next steps (for example real charts to swap in) and decisions the user should sign off on, with no recap of the work.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return every output key as a JSON string. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **No filler.** Every element must earn its place: cut what does not say something essential, advance the narrative or give needed structure (made-up stats, lorem ipsum, redundant or purely decorative elements, charts with too many data points). When in doubt about a cut, open `## What counts as filler` and `## The five-question test` in chapter `# 5. Content principles — no filler` of `<CD>/system-prompt.md`. If more slides, sections or copy would improve the deck, ask the user first; a slide that feels empty is a layout problem, solved with composition. Figures, names and quotes come from the user's material; a value still missing is an honest placeholder, labelled as one.
- A deck is not a web page: avoid web-design tropes and conventions.
- **Contrast and colour.** The minimums are 4.5:1 for normal text (under 18px), 3:1 for large text (18px+ bold or 24px+) and 3:1 for UI components (buttons, icons). Do not rely on colour alone to communicate state. A thorough accessibility audit is the `design-review` capability, in its own step.
- The deck is a single HTML file.
- Variations of the deck and live tweak controls, when the user asks for them in the brief, are the `design-options` capability in its own step: record the request in `html_deck_review`. This step builds one deck.
- A company's distinctive UI patterns or branded visual elements are not recreated unless the user states the brand is their own; help with an original design instead.

## Checks

- **layout_system_stated**: the file opens with the layout types and their rules, and every slide uses one of them.
- **slides_scale_and_navigate**: the deck letterboxes at different window sizes, the keys and the counter work and the position survives a reload; without a browser this is recorded as not tested.
- **slide_type_minimums_met**: no body text under 24px on the 1920×1080 canvas, and nothing overflows a slide.
- **no_filler_slides**: every slide carries one message the audience needs; none repeats another.
- **deck_content_from_material**: figures, names and quotes trace to the user's material; placeholders are labelled.
- **deck_walked_or_disclosed**: the deck was walked from first to last slide, or the report says what was not checked.

## Sources

- AI intent mapping: make-a-deck → ui.html-deck, from its six phases; discovery-questions → step 1 (its protocol and its deck questions); system prompt chapters 2 (workflow order), 3 (questions), 4 (existing context), 5 (no filler), 6 to 9 (aesthetic defaults, hierarchy, type sizes on slides, colour), 14 ("Fixed-size content scales itself", persistence), 17 (deck format, right scale), 18 (show early, brief summary, honest reports) and 19 (limits), as assigned in `delivery.json`.
- Source: claude-design-system-prompt (Trystan-SA/claude-design-system-prompt@3c3ddb07, head; commit `3c3ddb07d7aa3fef051d83608596470c95cfd8fe`, pin `head`) — `claude/skills/make-a-deck.md`, `claude/skills/discovery-questions.md` and `claude/system-prompt.md`, packaged under `<package_root>/scripts/claude-design-system-prompt/`. At run time the body points at the two skill files and at chapters 5 to 8 of the prompt; what it uses of the other chapters is stated in the body.
- Provenance: the upstream README describes the repository as a "Reverse-engineered system prompt of Claude Design from Anthropic" (README.md is excluded from the selection and was not read at intake; the fact comes from the intake brief).
- Changes for coexistence (ADR-0017):
  - make-a-deck's "Use this when the user asks for a deck, presentation, slides, or pitch" and chapter 17's "Pick the right format" are not followed: the coordinator classifies by meaning, and a deck wanted as a PowerPoint file is `office-deck`.
  - "Use the deck-shell starter (`copy_starter_component` with `kind: "deck_stage.js"`)" and "Don't hand-roll the scaling": the starter is a tool of the source's host and is not in the snapshot, a step no supported host can run. Step 4 writes the shell with the functions the source lists, without `data-om-validate` and `<deck-stage>`; step 6 makes it render the notes the starter "renders automatically"; step 7 adds tap, reload and print to the walk.
  - "if none, invoke `frontend-aesthetic-direction` before drawing", chapter 4's "invoke the Frontend Design skill" and "invoke `accessibility-audit` for thoroughness": one capability runs per step, so these are the `needs` on `aesthetic-direction` and the `design-review` capability in its own step.
  - "call the verifier subagent for the thorough pass" (Phase 6; chapter 2, item 5; chapter 18, "Delegate verification", with "Don't take screenshots yourself"): the verifier is a tool of the source's host. The walk of step 7 is the verification, and what was not verified is said.
  - `questions_v2` (discovery-questions, Phases 4 and 5) is a tool of the source's host: the round uses the host's question-form tool when there is one, otherwise plain text, once. "Proceed to the appropriate building skill" is this same step.
  - Variations and tweak controls (chapter 3, discovery-questions, chapter 17) have one owner, `design-options`: this step asks and records, and does not build them. Chapter 17's "Even when the user doesn't ask, add 1–2 tweak controls by default" is not followed: chapter 19 of the same prompt forbids unrequested scope, and the controls are `design-options`' output.
  - Chapter 2's closing paragraphs on concurrent tool calls and silence between them are not followed: conversation conduct belongs to the host and its user.
  - Chapter 19, "unless the user's email domain indicates they work at that company": no host here can verify an email domain; the user's own statement replaces it.
- Not adopted: `copy_starter_component` with `deck_stage.js`, `questions_v2` and the verifier subagent as fixed host tools. Open gap: whether upstream publishes the starters anywhere was not inspected.
- Runtime dependency: none. A browser is optional for step 7. Hooks: the selected files define none; `codex/**` and `README.md` are excluded and were not inspected.
- Harmonized by: prompts/harmonizer.md (2026-11-12) — kept apart from `office-deck`: genoffice builds a .pptx through its own checked pipeline and its intent excludes an HTML slideshow, while this source builds a web page. They are alternatives chosen by the wanted format, with different outputs and no shared file, so no conflict is declared; a request that names no format stays with `office-deck`. `resumable` because it shows the first slides and continues. Second pass of 2026-11-12: the body is a working procedure that points at the packaged originals only where a step needs their detail.
