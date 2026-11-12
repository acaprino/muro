---
id: design-review
role: design-review
when: —
after: []
outputs: ["review_findings", "review_fixes"]
checks: ["surface_read_in_full", "every_finding_located_and_rated", "blockers_fixed", "recorded_system_respected", "fixes_rechecked", "unverified_items_disclosed"]
intents: [{"id":"ui.accessibility-audit","description":"Audit an HTML design or web interface for accessibility and fix what fails: contrast against the WCAG AA minimums, colour-only signalling, semantic structure and labels, keyboard reach and visible focus, reduced motion and flashing, form errors and touch targets.","excludes":["Looking up accessibility rules, or a report-only checklist for a native mobile or desktop stack, is design guidance.","Checking a Figma file's contrast is part of Figma work.","A legal conformance statement or certification."]},{"id":"ui.generic-look-check","description":"Find and replace what makes a design read as a generic generated template (decorative gradients and emoji, default card and font habits, amateur illustration, pure white on pure black, untraceable colours, off-scale spacing, an unexamined warm editorial look), so that it looks intended.","excludes":["Choosing a new visual direction is aesthetic direction or visual direction.","A look that traces to the client's brand or to a recorded direction is deliberate, not generic."]},{"id":"ui.hierarchy-rhythm-review","description":"Review and fix what the eye meets first, second and third on each screen or slide, and the consistency of spacing, type scale, repetition, palette and alignment across the design.","excludes":["Rewriting the copy or restructuring the content.","Specifying motion or scroll behaviour."]},{"id":"ui.interaction-states","description":"Verify that every interactive element of a web design has its default, hover, pressed, disabled, focus and loading states, transitions and visible feedback for each action, and add what is missing.","excludes":["Deciding how the interface moves as a whole is the motion specification.","Adding states to components inside a Figma file is Figma work.","Implementing new interactions or features."]},{"id":"ui.polish-pass","description":"Run all four reviews (accessibility, generic look, hierarchy and rhythm, interaction states) on a finished design before it is shown or shipped, fix the findings in order of severity and state whether it is ready.","excludes":["A design still mid-flight, with missing sections or a broken layout, is finished first.","Fact-checking the content is the explainer fact-check.","A code review of logic, performance or security."]}]
tools: [{"name":"file-access","purpose":"Read the design file with its styles and tokens, and apply the fixes in place.","required":true},{"name":"browser","purpose":"Measure rendered contrast and walk the keyboard path, focus and states.","required":false},{"name":"subagents","purpose":"Run the read-only review passes in parallel, each on the full file, when the host has an agent tool. They report; this step fixes.","required":false}]
hooks: []
conflicts: []
reads: ["aesthetic_direction", "palette", "typography", "constraints", "design_tokens", "motion-spec", "reduced-motion"]
---

# Design Review (audit and fix)

Reviews a design the host can read and edit (HTML, CSS, script or component markup) and fixes what it finds: one pass when the user asks for one, all four as the last gate before delivery. `<CD>` below stands for `<package_root>/scripts/claude-design-system-prompt/claude/skills`; each pass's full list is in its file there.

## Behavior

0. **Scope by the selected intent:** one pass, or all four for a polish pass.
1. **Fix the surface.** The file the user just edited or asked about, else the most recently changed design file; ask when unclear. Read it end to end with the styles, tokens and components it references, and note the medium (page, slide, mobile, dashboard), the level (WCAG AA unless told otherwise) and stated constraints. If a polish pass meets a design still in flux, ask whether to run now or after the structure settles.
2. **Review for coverage.** Report every finding with its location, a severity and a confidence, including borderline ones; filtering happens in step 3. With an agent tool, the passes may run in parallel; otherwise in sequence.
   - **Accessibility** (`<CD>/accessibility-audit.md`): computed contrast of 4.5:1 for normal text and 3:1 for large text (24px, or 18px bold) and for interface components; state shown by colour alone; hard combinations (red with green, light grey on white); one `<h1>` and no skipped level; the right element for each role, ARIA only where HTML cannot say it; alt text, empty for decoration; a label on every input; everything reachable by keyboard in reading order, Escape closing modals, a visible `:focus-visible` ring; a reduced-motion rule, nothing flashing more than three times a second; specific errors tied to their field, required fields marked by more than colour, input types and autocomplete; touch targets of 44px.
   - **Generic look** (`<CD>/ai-slop-check.md`): multi-colour or fashionable gradients; emoji as decoration; a rounded card with a thick left border as the default card; illustrative SVG of people or scenes; unexamined default fonts; pure white with pure black; colours that trace to no token or palette; spacing off the 4px or 8px scale; cream, serif display and terracotta together with no reason in the brief.
   - **Hierarchy and rhythm** (`<CD>/hierarchy-rhythm-review.md`): per screen, what is first, second and third by size, colour, weight, position and density, and whether a newcomer knows what to do within five seconds; across the file, the spacing and type scales with their outliers, repeated blocks that are almost but not quite alike, one deliberate break in a long pattern, three to five colours, consistent section separation, alignment.
   - **Interaction states** (`<CD>/interaction-states-pass.md`): list every interactive element, then check that it looks interactive at rest, changes on hover (not by fading), confirms a press, shows why it is disabled, has a focus ring and a loading state where it starts work; that state changes transition; that every action has a visible result and the current page, tab or filter is marked.
3. **Aggregate.** Merge duplicates and group: blockers (accessibility failures), quality issues (generic tropes, broken hierarchy, missing states), polish recommendations.
4. **Fix** every blocker and quality issue in the file with the design system's own values. Fix borderline accessibility cases too. Where several fixes are reasonable, apply the most defensible and note it. Note and skip false positives and third-party embeds. For ambiguous hierarchy, lean to the stronger contrast.
5. **Check the fixes:** a contrast fix that washed out a brand colour, a focus ring over neighbouring content, a primary action that still does not lead.
6. **Record** `review_findings` (by pass and group, with locations) and `review_fixes` (what changed, judgment calls, what is left to the user, things noticed out of scope and, for a polish pass, the verdict: ready, ready after the flagged decisions, or not ready for polish).

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return both output keys as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Read earlier outputs from the step's `recorded_outputs` or `<state_dir>/map.md` only. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **A recorded system is deliberate.** Values that trace to a dealt `palette` and `typography`, an `aesthetic_direction`, `design_tokens`, recorded `constraints` or the client's brand are not tropes. A finding against that system is reported to the user, not fixed.
- **Timing.** A recorded `motion-spec` and `reduced-motion` decide durations and alternatives. Without them, a missing state transition gets 0.15 to 0.3 seconds, an entrance or exit 0.3 to 0.5, inside a reduced-motion rule.
- Fallbacks when the system defines no state: hover 10 to 15% darker, press a further step or `scale(0.98)`, disabled at 0.6 opacity with a not-allowed cursor, focus a 2px outline at 2px offset.
- Toned whites and blacks are a style recommendation, not a WCAG requirement: report them as such.
- An interactive explainer keeps its template's look and a GenOffice deck its own audit: only accessibility findings are fixed in the former, and Office files are not reviewed here.
- The pass adds no content, copy or feature. Nothing is installed.

## Checks

- **surface_read_in_full**: the file and its referenced styles were read whole before any finding.
- **every_finding_located_and_rated**: each finding names its location, severity and confidence.
- **blockers_fixed**: no accessibility failure remains, or each remaining one is listed with the reason.
- **recorded_system_respected**: no value of a recorded direction, palette, tokens or client brand was changed; conflicts with it are reported.
- **fixes_rechecked**: contrast, focus rings and the primary action were checked again after the fixes.
- **unverified_items_disclosed**: what could not be measured or operated without a browser is named as not tested.

## Sources

- AI intent mapping: accessibility-audit → ui.accessibility-audit; ai-slop-check → ui.generic-look-check; hierarchy-rhythm-review → ui.hierarchy-rhythm-review; interaction-states-pass → ui.interaction-states; polish-pass → ui.polish-pass. System prompt chapters 6, 7, 9, 10, 11, 12 and 16 state the same rules as write-time defaults.
- Source: claude-design-system-prompt (Trystan-SA/claude-design-system-prompt@3c3ddb07, head; commit `3c3ddb07d7aa3fef051d83608596470c95cfd8fe`, pin `head`) — `claude/skills/accessibility-audit.md`, `ai-slop-check.md`, `hierarchy-rhythm-review.md`, `interaction-states-pass.md`, `polish-pass.md`, packaged under `<package_root>/scripts/claude-design-system-prompt/`; `claude/system-prompt.md`, read at intake only and not packaged (`intake_only_paths`: its rules are restated in this body).
- Provenance: the upstream README describes the repository as a "Reverse-engineered system prompt of Claude Design from Anthropic" (README.md is excluded from the selection and was not read at intake; the fact comes from the intake brief). The method is restated here, not copied.
- Not adopted: `${AGENT_TOOL_NAME}` as a required parallel dispatch (an optional logical `subagents` tool; one capability still runs per step); the chapter 20 advice to run a review whenever in doubt, which is routing.
- Runtime dependency: none. A browser is optional. Hooks: the selected files define none; `codex/**` and `README.md` are excluded and were not inspected.
- Harmonized by: prompts/harmonizer.md (2026-11-12) — five skills, one role, five intents: polish-pass runs "the equivalent of" the other four on one file with one aggregate-and-fix method, so separate capabilities would be four writers of the same file. `design-guidance` keeps rule lookup and report-only checklists. The source's 0.15 to 0.3 second transitions contradict motion-design's shorter feedback durations: a recorded motion specification wins.
