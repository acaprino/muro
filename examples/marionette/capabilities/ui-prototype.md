---
id: ui-prototype
role: prototype-authoring
resumable: true
when: —
after: []
outputs: ["prototype_plan", "prototype_file", "prototype_verification"]
checks: ["flow_and_state_mapped_first", "design_context_matched", "every_interaction_wired", "state_survives_reload", "no_filler_or_invented_content", "unverified_behavior_disclosed"]
intents: [{"id":"ui.interactive-prototype","description":"Build a screen or a flow of an app or product as a hi-fi working prototype in HTML: clickable, with real state, navigation, form validation, loading, success and error feedback, and a device frame when useful, rooted in the product's existing design system or a recorded direction, to try the experience before it is engineered.","excludes":["A company website or landing page is built by visual direction.","Shipping the screen as production code inside the product's codebase is an engineering change; a prototype is a design artifact.","Low-fidelity exploration of structure is the wireframe step.","A design inside a Figma file is Figma work.","Advice about a screen, with nothing to build, is design guidance."]}]
tools: [{"name":"file-access","purpose":"Read the product's theme, tokens and components and write the prototype as one HTML file.","required":true},{"name":"browser","purpose":"Walk the flow, the keyboard path and a reload in the rendered prototype.","required":false},{"name":"subagents","purpose":"Hand the rendered check to a separate verifying agent when the host has one, so its screenshots stay out of the conversation.","required":false},{"name":"question-form","purpose":"Ask the opening questions as a structured form when the host has one; otherwise in plain text, once.","required":false}]
hooks: []
conflicts: []
reads: ["aesthetic_direction", "palette", "typography", "constraints", "design_tokens", "component_inventory", "wireframe_decision", "motion-spec", "reduced-motion"]
needs: [{"capability": "aesthetic-direction", "label": "no brand, no direction", "when": "The prototype is hi-fi and nothing gives it a look to match: no brand, design system, theme or reference in the project or in the user's material, and no direction, palette or tokens among the recorded outputs. Not when any of those exists, and not for a mid-fidelity prototype the user wants kept neutral.", "reason": "Hi-fi work with no committed look drifts to template defaults; the source asks for the aesthetic direction before drawing when no brand or design system exists (make-a-prototype, Phase 1)."}]
---

# UI Prototype (interactive, hi-fi)

Builds a prototype that behaves: static screens strung together with links do not count, because the point is to test the flow by really clicking, typing, validating, succeeding and failing. `<CD>` below stands for `<package_root>/scripts/claude-design-system-prompt/claude`. The method is `<CD>/skills/make-a-prototype.md`; the system prompt is `<CD>/system-prompt.md`. Open a packaged original only at the section a step names, when the step says so. The original is the full version and wins where this body differs, except for the changes listed in the Sources section.

## Behavior

1. **Discovery, in one round.** Read what is attached first. Confirm before building: the flow (screens, entry point, goal state, mapped as a list); fidelity (hi-fi or mid-fi); device frame (desktop browser, iOS, Android, macOS window); variations (one flow or several to compare); brand or design system (always confirm); sample data (real-looking content, no Lorem ipsum); the primary audience and what they must achieve. Ask only what changes the design, once; decide minor choices yourself and list them in the summary; then wait for the answers and build without follow-up questions. For a new or ambiguous request open `## Phase 3: Build the question set` of `<CD>/skills/discovery-questions.md`, and `## Phase 4: Format the question round` when the host has a question form.
2. **Take the look from what exists.** Use the recorded `aesthetic_direction`, `design_tokens` and `component_inventory`, or `palette`, `typography` and `constraints` from a website step; otherwise the product's own files, read and not remembered: open the theme file, the tokens and the component being changed, and lift exact hex codes, spacing values and font stacks. Follow the existing vocabulary before adding to it: palette and tone, typography, density, radii, shadows and card patterns, hover and click animations, copy tone. A recorded `wireframe_decision` is the structural brief. A hi-fi prototype with nothing to match should have reached this step after `aesthetic-direction` (see `needs`); if it did not, say so and ask the user for the context. Do not invent a brand or a visual language unless explicitly asked to.
3. **Map screens and state before building**, and put the map in the file as a comment block the user can see: each screen with its actions and their targets, then the state variables. `## Phase 2: Map screens and state` of the skill shows the form.
4. **Build screen by screen**, and show the file as soon as there is a skeleton. Each screen is mounted in the DOM of a single page (display toggling or React state), drawn hi-fi with the design system's real components and not generic boxes, filled with plausible real content (actual names, product copy, numbers), and has one primary CTA, with secondary actions smaller and de-emphasized. Open, in the system prompt: `# 10. Accessibility and inclusivity` when writing markup, forms, focus styles or motion; `# 14. Respecting the medium` for layout and CSS technique; `## Reduce options` (in `# 12. Simplicity and one clear CTA`) for navigation, long forms, many filters or many variants.
5. **Wire every interaction, not only the happy path**: navigation (CTAs advance, back goes back, state persists across screens); form validation (empty submit and bad format each give an inline error tied to the field, valid input proceeds); loading (an async action shows an indicator and disables its button against double submit; fake the latency with `setTimeout` and never skip the loading state because the work is fake); success and error feedback (toast, inline confirmation or page transition, errors tied to their field or action); state changes (toggling, selecting, filtering update the UI immediately). Open `# 11. Interaction and feedback` of the system prompt for the states every interactive element needs, transition timing and how long a confirmation stays.
6. **Sub-state and persistence.** Make meaningful sub-state reactive: selection, filter and sort, open state of modals and dropdowns (focus moves into the modal, Escape closes it), form values and errors. Persist across reload through `localStorage`: current screen, form drafts, tweak values.
7. **Verify.** Walk the whole flow in the preview: every CTA leads somewhere, every form validates, every error is clear and recoverable, every async action shows feedback, every state change is visible, the keyboard works (Tab through, Enter to submit, Escape to close), focus is visible. Reload once and confirm the state of step 6 returns. Give the walk to a verifying agent when the host has one, after every substantive visual change, and then take no screenshots of your own. What could not be verified is named in the summary, never claimed.
8. **Record** `prototype_plan`, `prototype_file` and `prototype_verification`, and summarize briefly, caveats and next steps only: which flows work, what is faked (for example "submit calls a setTimeout fake"), what is open for the user to decide. No recap of what the user watched.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return every output key as a JSON string. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **No filler.** Every element earns its place: no Lorem ipsum, made-up statistics, buttons with no destination, redundant or unrequested sections. A section that feels empty is a layout problem, solved with composition and not with invented content. Ask the user before adding sections, pages, copy or content. When unsure whether an element stays, open `# 5. Content principles — no filler` (what counts as filler, the five-question test).
- **Minimum sizes.** Mobile body text 16px; interactive hit targets 44px × 44px; desktop body 14–16px is standard. Never remove the focus ring without a replacement.
- **Timings.** Transitions on state changes last 0.2–0.3 seconds with an ease curve. A recorded `motion-spec` and `reduced-motion` come first when the plan has them.
- **Polish what is visible, in depth rather than breadth**: spacing and type on the scale, real or honestly placeholdered imagery, every interactive state present, copy proofread. Asked for five features, deliver three done well rather than five half done.
- **Device frame.** Draw a plain frame in CSS, or none, and say so. The frame stays fixed; the prototype lives inside it.
- **Variations, if requested**: side by side in a plain CSS grid or as in-prototype toggles, in the same file; never `v1.html` / `v2.html` / `v3.html` scattered across the project. A floating tweak panel is the `design-options` step.
- Refuse to recreate a company's distinctive UI patterns, proprietary command structures or branded visual elements, unless the user states the product is their own; find out what the user wants to build and help with an original design instead.
- Nothing is installed. When the file loads a library or a font from the network, say so.

## Checks

- **flow_and_state_mapped_first**: the file holds the screen and state map as a comment block, written before the screens were built.
- **design_context_matched**: colours, type, spacing and components trace to the recorded direction, the tokens or the product's own files; nothing was invented beside an existing system.
- **every_interaction_wired**: navigation, form validation, loading states, success and error feedback and state changes are wired as step 5 lists them, not only the happy path.
- **state_survives_reload**: after a reload the prototype is on the same screen with its form drafts, and with its tweak values when it has any.
- **no_filler_or_invented_content**: no Lorem ipsum, made-up statistics, buttons with no destination, redundant or unrequested sections remain.
- **unverified_behavior_disclosed**: every behaviour that could not be verified is named in the summary as not tested.

## Sources

- AI intent mapping: make-a-prototype → ui.interactive-prototype, from its seven phases. discovery-questions supplies no intent of its own: a question round is never the outcome a user asks for, so it is step 1 here and the brief step of `aesthetic-direction`, `wireframe`, `design-options` and `html-deck`. System prompt chapters 5, 10, 11, 12 and 14 are opened by section; chapters 2, 3, 4, 15 to 19 and the minimum sizes of chapter 8 are stated in the body.
- Source: claude-design-system-prompt (Trystan-SA/claude-design-system-prompt@3c3ddb07, head; commit `3c3ddb07d7aa3fef051d83608596470c95cfd8fe`, pin `head`). Opened at run time, by section, from `<package_root>/scripts/claude-design-system-prompt/`: `claude/skills/make-a-prototype.md`, `claude/skills/discovery-questions.md` and, of `claude/system-prompt.md`, chapters 5, 10, 11, 12 and 14.
- Provenance: the upstream README describes the repository as a "Reverse-engineered system prompt of Claude Design from Anthropic" (from the intake brief; README.md is excluded and was not read).
- Changes for coexistence (ADR-0017):
  - "Use this when the user asks for a prototype, mockup, demo, or "make it interactive."" is not an activation rule: the coordinator classifies by meaning (competing routing).
  - Phase 1 "if none, invoke `frontend-aesthetic-direction` first" and chapter 4's "invoke the Frontend Design skill" are the declared `needs` on `aesthetic-direction`, run by the coordinator as its own step; with no look to match this step reports and asks.
  - `copy_starter_component`, the four frame starters (`ios_frame.jsx`, `android_frame.jsx`, `macos_window.jsx`, `browser_window.jsx`) and `design_canvas.jsx` belong to the source's host and are not in the snapshot: a frame is drawn in CSS or left out, and variations sit in a plain CSS grid.
  - Phase 7 "Expose variations as tweaks in a floating panel (`make-tweakable`)" and chapter 17's "Even when the user doesn't ask, add 1–2 tweak controls by default" are not done here: the panel is the outcome of `design-options` (one owner per outcome).
  - Chapter 11's 0.2 to 0.3 seconds and chapter 10's motion section yield to a recorded `motion-spec` and `reduced-motion`: `motion-principles` owns durations and easing (two sources, one owner).
  - `questions_v2` (discovery-questions) is a tool of the source's host: the optional `question-form` tool or one plain-text message replaces it.
  - The "verifier subagent" of chapters 2 and 18 is the optional `subagents` tool; "Don't take screenshots yourself" holds when the host has one, otherwise the step checks with the optional `browser` tool or names what was not tested.
  - Chapter 19's "unless the user's email domain indicates they work at that company" cannot be checked by any host: the user's own statement replaces it.
  - Added by the package: recorded outputs of earlier steps as the first source of look and structure (handoff through the coordinator); the reload in step 7 (what `state_survives_reload` checks); the line on what the file loads from the network (honest reporting).
- Runtime dependency: none. A browser is optional for step 7. Hooks: the selected files define none; `codex/**` and `README.md` are excluded and were not inspected.
- Harmonized by: prompts/harmonizer.md (2026-11-12) — a new role: building an app screen was owned by nobody (`visual-direction` excludes app screens, `design-guidance` only recommends, `work-map` ships production code). `resumable` because it shows a skeleton and iterates. Its one conditional prerequisite, `aesthetic-direction`, is the source's own rule.
