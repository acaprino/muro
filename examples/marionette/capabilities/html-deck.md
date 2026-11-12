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

Builds a presentation that is a web page: slides of a fixed size that fit any screen, moved with the keyboard. It is the browser alternative to `office-deck`, which produces a PowerPoint file; the user's wanted format decides between them. `<CD>` below stands for `<package_root>/scripts/claude-design-system-prompt/claude`; the full method is `<CD>/skills/make-a-deck.md`.

## Behavior

1. **Brief, in one round, only what is open:** the audience and what it already knows, the aspect ratio (16:9 unless told otherwise) and the slide count (about one slide per minute: ten for ten minutes, twenty to twenty-five for thirty), the tone, the source content, speaker notes (off unless asked), and the brand or design system. Read any attached document before sketching. Enough context means no questions.
2. **Take the look from what exists:** the recorded `aesthetic_direction`, `design_tokens`, or `palette`, `typography` and `constraints`; otherwise the user's brand material. With nothing to match, this step should have followed `aesthetic-direction` (see `needs`); if it did not, report that instead of inventing a brand.
3. **Plan the layout system** in a comment block at the top of the file before any slide: four to six layout types (cover, section header, content with headline and one chart, image or list, quote, comparison, closing), each with its background, headline size and position, body area and footer. One or two background colours for the deck; section headers may use a third.
4. **Write the shell once:**
   - a stage of the fixed slide size holding one `<section>` per slide;
   - a script that scales the stage to the window with a transform, so the deck letterboxes;
   - arrow keys, space and tap to move, and a slide counter;
   - the slide index saved in `localStorage`;
   - a print stylesheet with one slide per page.
   Label every slide `data-screen-label="01 Title"`, numbered from 1 like the counter.
5. **Build in order and show the file after one or two slides.** On each slide:
   - body text of at least 24px on a 1920×1080 canvas, 32px or more where it fits, headlines from 60 to 96px or more;
   - one primary message, with supporting elements smaller and quieter;
   - imagery from the design system, or an honest labelled placeholder;
   - in a chart, only the columns and points that carry the slide's message;
   - the system's spacing and colour values, no new ones inline.
6. **Speaker notes, only on request:** one entry per slide in `<script type="application/json" id="speaker-notes">`, written as the full spoken script; slides with notes can carry less text. Say how the notes are shown.
7. **Walk the deck:** several window sizes, the counter, keyboard navigation, nothing outside the slide bounds, the type minimum, contrast. Without a browser, record that as not tested.
8. **Record** `html_deck_plan` (layout system and slide list), `html_deck_file` and `html_deck_review` (what was walked, placeholders still to replace, decisions for the user).

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return every output key as a JSON string. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **No filler slides.** "Why choose us", "About this deck" and a slide that repeats another cost attention: cut them. Figures, names and quotes come from the user's material; an illustrative number is labelled. More slides or sections than asked are proposed first.
- **The shell is written here.** The source tells its own host to copy a deck-shell starter (`deck_stage.js`) and not to hand-roll the scaling; that starter is not in the selected snapshot, so step 4 writes a small shell and step 7 must check it. The source's `data-om-validate` tagging belongs to that host and is not used.
- Avoid web-page habits on slides: no navigation bar, no scrolling section, no hover-only content.
- Colour never carries meaning alone, and text contrast meets 4.5:1 (3:1 for large text). A full audit is the `design-review` step.
- One self-contained HTML file. A web font adds a network request: say so, and use system fonts when the deck must work offline.
- A company's distinctive branded slide design is not recreated unless the user states it is their own.

## Checks

- **layout_system_stated**: the file opens with the layout types and their rules, and every slide uses one of them.
- **slides_scale_and_navigate**: the deck letterboxes at different window sizes, the keys and the counter work and the position survives a reload; without a browser this is recorded as not tested.
- **slide_type_minimums_met**: no body text under 24px on the 1920×1080 canvas, and nothing overflows a slide.
- **no_filler_slides**: every slide carries one message the audience needs; none repeats another.
- **deck_content_from_material**: figures, names and quotes trace to the user's material; illustrative values are labelled.
- **deck_walked_or_disclosed**: the deck was walked from first to last slide, or the report says what was not checked.

## Sources

- AI intent mapping: make-a-deck → ui.html-deck, from its six phases; discovery-questions → step 1 (its deck questions); system prompt chapters 5 (no filler), 8 (sizes on slides), 14 ("Fixed-size content scales itself", persistence) and 17 (deck format).
- Source: claude-design-system-prompt (Trystan-SA/claude-design-system-prompt@3c3ddb07, head; commit `3c3ddb07d7aa3fef051d83608596470c95cfd8fe`, pin `head`) — `claude/skills/make-a-deck.md`, `claude/skills/discovery-questions.md`, packaged under `<package_root>/scripts/claude-design-system-prompt/`; `claude/system-prompt.md`, read at intake only and not packaged (`intake_only_paths`: its rules are restated in this body).
- Provenance: the upstream README describes the repository as a "Reverse-engineered system prompt of Claude Design from Anthropic" (README.md is excluded from the selection and was not read at intake; the fact comes from the intake brief). The method is restated here, not copied.
- Not adopted: `copy_starter_component` with `deck_stage.js`, `questions_v2` and the verifier subagent as fixed host tools. Open gap: whether upstream publishes the starters anywhere was not inspected.
- Runtime dependency: none. A browser is optional for step 7. Hooks: the selected files define none; `codex/**` and `README.md` are excluded and were not inspected.
- Harmonized by: prompts/harmonizer.md (2026-11-12) — kept apart from `office-deck`: genoffice builds a .pptx through its own checked pipeline and its intent excludes an HTML slideshow, while this source builds a web page. They are alternatives chosen by the wanted format, with different outputs and no shared file, so no conflict is declared; a request that names no format stays with `office-deck`. `resumable` because it shows the first slides and continues.
