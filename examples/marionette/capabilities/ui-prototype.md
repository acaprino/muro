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

Builds a prototype that behaves: the user clicks, types, fails validation, waits, succeeds. Screens strung together with links do not count, because the point is to test the flow. `<CD>` below stands for `<package_root>/scripts/claude-design-system-prompt/claude`; the full method is `<CD>/skills/make-a-prototype.md`.

## Behavior

1. **Brief, in one round.** Read what is attached first. Then confirm only what is open and changes the design: the flow (screens, entry point, goal state), fidelity, device frame, whether variations are wanted, sample data, and the starting point (UI kit, design system, codebase, screenshots). Decide minor choices yourself and list them in the summary.
2. **Take the look from what exists.** Use the recorded `aesthetic_direction`, `design_tokens` and `component_inventory`, or `palette`, `typography` and `constraints` from a website step; otherwise open the product's theme file, tokens and the components concerned and lift exact colours, spacing and font stacks. Do not work from memory of what the app looks like. A recorded `wireframe_decision` is the structural brief. A hi-fi prototype with nothing to match should have reached this step after `aesthetic-direction` (see `needs`); if it did not, report that instead of inventing a brand.
3. **Map screens and state** in a comment block at the top of the file, where the user can see the plan: each screen with its actions and where they lead, and the state variables.
4. **Show a skeleton early**, then build screen by screen inside one page (display toggling or component state): the system's real components, plausible real content, one primary action per screen with secondary actions smaller and quieter.
5. **Wire every interaction, not only the happy path:**
   - navigation forward and back, with state kept across screens;
   - validation: an empty submit, a badly formatted value with an error tied to its field, a valid value that proceeds;
   - asynchronous actions with a loading state and a disabled button; fake the latency with a timer rather than skipping the state;
   - success and error feedback; selections, filters and toggles that update at once;
   - modals that take focus and close on Escape.
6. **Keep state across a reload** with `localStorage`: the current screen and form drafts. People refresh constantly while iterating.
7. **Verify** the whole flow: every action leads somewhere, every form validates, every error is recoverable, Tab, Enter and Escape work, focus is visible, a reload returns to the same place. Give the check to a verifying agent when the host has one. Without a browser, record what was not tested.
8. **Record** `prototype_plan`, `prototype_file` and `prototype_verification`, and tell the user in a few lines what works, what is faked and what is theirs to decide. No recap of the build.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return every output key as a JSON string. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **No filler.** No lorem ipsum at hi-fi, no invented statistics, no button without a destination, no section that repeats another. A section that feels empty is a layout problem, solved by composition. Sections, pages or copy beyond the request are proposed first.
- **Semantic and reachable:** real `<button>`, `<a>` and labelled inputs, a visible `:focus-visible` ring that is never removed, hit targets of 44px, body text of 16px on mobile.
- Use what the web does well: grid and flexbox, custom properties for the system's values, container queries, real transitions. Timings come from a recorded `motion-spec`; without one, state changes take 0.2 to 0.3 seconds.
- **Device frame.** The source copies iOS, Android, macOS and browser frames from starters of its own host, which are not packaged: draw a plain frame in CSS, or none, and say so.
- Variations of the flow go in the same file as toggles; a wider set of options or a tweak panel is the `design-options` step. Never separate `v1`, `v2` files.
- A company's distinctive interface, command structure or branded elements are not recreated unless the user states the product is their own; build an original design for the same need.
- One self-contained HTML file with no required dependency. A library is loaded only when the user asks for it; say that the file then needs the network.

## Checks

- **flow_and_state_mapped_first**: the file opens with the screen and state map, written before the screens.
- **design_context_matched**: colours, type, spacing and components trace to the recorded direction, the tokens or the product's own files; nothing was invented beside an existing system.
- **every_interaction_wired**: each action navigates or changes state, forms validate with field-tied errors, asynchronous actions show loading and a result.
- **state_survives_reload**: after a reload the prototype is on the same screen with its drafts.
- **no_filler_or_invented_content**: no placeholder text at hi-fi, invented figures, dead controls or unrequested sections remain.
- **unverified_behavior_disclosed**: every behaviour that could not be checked in a browser is named as not tested.

## Sources

- AI intent mapping: make-a-prototype → ui.interactive-prototype, from its seven phases. discovery-questions supplies no intent of its own: a question round is never the outcome a user asks for, so it is step 1 here and the brief step of `aesthetic-direction`, `wireframe`, `design-options` and `html-deck`. System prompt chapters 2 (plan in the file, skeleton early, verify, brief summary), 4 (read the source), 5 (no filler, ask before adding), 11 and 12 (feedback, one primary action), 14 (real interactions, persistence), 18 (honest progress) and 19 (limits).
- Source: claude-design-system-prompt (Trystan-SA/claude-design-system-prompt@3c3ddb07, head; commit `3c3ddb07d7aa3fef051d83608596470c95cfd8fe`, pin `head`) — `claude/skills/make-a-prototype.md`, `claude/skills/discovery-questions.md`, packaged under `<package_root>/scripts/claude-design-system-prompt/`; `claude/system-prompt.md`, read at intake only and not packaged (`intake_only_paths`: its rules are restated in this body).
- Provenance: the upstream README describes the repository as a "Reverse-engineered system prompt of Claude Design from Anthropic" (README.md is excluded from the selection and was not read at intake; the fact comes from the intake brief). The method is restated here, not copied.
- Not adopted: `copy_starter_component` and its frame starters, `questions_v2` and the "verifier subagent" as fixed host tools (logical optional tools instead); the chapter 19 email-domain test; the chapter 2 rule of silence between tool calls, which is the host's to set; adding tweak controls nobody asked for (left to `design-options`).
- Runtime dependency: none. A browser is optional for step 7. Hooks: the selected files define none; `codex/**` and `README.md` are excluded and were not inspected.
- Harmonized by: prompts/harmonizer.md (2026-11-12) — a new role: building an app screen was owned by nobody (`visual-direction` excludes app screens, `design-guidance` only recommends, `work-map` ships production code). `resumable` because it shows a skeleton and iterates. Its one conditional prerequisite, `aesthetic-direction`, is the source's own rule.
