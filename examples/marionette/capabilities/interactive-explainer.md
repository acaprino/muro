---
id: interactive-explainer
role: explainer-authoring
when: —
after: []
outputs: ["explainer_outline", "explainer_file", "explainer_claims"]
checks: ["outline_approved_by_user", "single_file_no_dependencies", "figures_render_and_respond", "claims_gate_passed"]
intents: [{"id":"explainer.source-walkthrough","description":"Turn material the user provides (a paper, article, transcript, report or pasted text) into one self-contained interactive HTML explainer whose hand-built canvas figures the reader can operate.","excludes":["A summary, notes or an explanation wanted only in the conversation is not an explainer page.","A slide deck, Word or PDF document is Office work, not an HTML explainer.","A landing page, marketing site, app screen or documentation site is UI work, even when it explains a product.","A static article with no interactive figure does not need this pipeline."]},{"id":"explainer.topic-research","description":"Build the same interactive explainer when the user names only a topic: the material is gathered by web research, or pasted by the user, and verified before any drafting.","excludes":["Answering a question about the topic in the conversation.","A research report without interactive figures.","Writing from memory when neither web research nor user-supplied sources are available."]},{"id":"explainer.codebase-walkthrough","description":"Explain real code as an interactive explainer: an architecture or onboarding overview of a repository, or a deep dive on one mechanism traced through the actual implementation with snippets quoted at path and line.","excludes":["Explaining code in the conversation, a README or reference documentation.","A code review, refactor or bug fix.","A whole framework in one article: one subsystem or one mechanism per explainer."]}]
tools: [{"name":"file-access","purpose":"Read the user's documents or repository and write one index.html in a new article folder. Nothing else in the project is changed.","required":true},{"name":"web-research","purpose":"Search and open web sources for a topic-only or mixed explainer. Queries leave the machine. Without it a topic-only explainer needs sources pasted by the user.","required":false},{"name":"browser","purpose":"Open the finished file to see the figures, the console and the narrow-width layout.","required":false}]
hooks: []
conflicts: []
---

# Interactive Explainer

Produces one `index.html` in the style of distill.pub: serif text, a sticky sidebar, and 3 to 5 canvas figures the reader operates. The article is built in stages and does not ship with an unverified factual claim. `<ET>` below stands for `<package_root>/scripts/explain-this/skills`; a bare `references/...` path is under `<ET>/creating-explainers/`.

## Behavior

1. **Intake.** Pick the branch from what the user gave and read only its reference:
   - files, a URL or pasted text: `<ET>/creating-explainers/references/intake-from-files.md`; the documents are the source of truth.
   - only a topic: `<ET>/creating-explainers/references/intake-from-research.md`. If web research is unavailable, ask the user to paste sources; do not write from memory.
   - files plus a topic they do not cover: both; files are the spine, research supports.
   - a codebase: `<ET>/explaining-codebases/references/code-intake.md`. Confirm the angle (overview or one mechanism), state the spine in one sentence, quote 5 to 20 line snippets tagged `path:line`.
2. **Research-time claim check.** If you researched, open every source and confirm it exists and says what it will be cited for, before drafting.
3. **Outline, then stop for approval.** Show title, subtitle, sections with one-line summaries and a numbered figure list (what each shows, how the reader interacts). This is the only planned pause.
4. **Scaffold.** Copy `<ET>/creating-explainers/assets/article-template.html` to `<article-folder>/index.html` and fill its `{{PLACEHOLDERS}}` following `references/template-walkthrough.md`. Do not rebuild the skeleton.
5. **Prose.** Read `references/voice-and-style.md` first: second person, concrete opening scene, 80 to 180 word paragraphs, no bullet lists in body prose, no em-dashes. Pick accents from `references/color-palettes.md`.
6. **Figures.** One IIFE per figure using the shared `initCanvas(id)`; state in closures. Take the pattern from `references/figure-archetypes.md`, or `<ET>/explaining-codebases/references/code-figure-archetypes.md` for code. Every figure pays off something the prose just set up; captions say what to look for.
7. **Post-draft claim gate (blocking).** Follow `<ET>/fact-checking-explainers/SKILL.md`: extract every checkable claim, read the supporting passage (for code, the real file at `path:line`), give a verdict, then support, correct, soften or cut. Report in the format of `<ET>/fact-checking-explainers/references/verification-report-format.md`. Deliver only on `PASS`.
8. **Polish.** Open the file (directly, or `python -m http.server` in its folder) when a browser tool exists; otherwise check that every `getElementById` has a matching id and `initCanvas` is defined.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `explainer_outline` (the approved outline and figure list), `explainer_file` (the index.html path) and `explainer_claims` (the claim report and its PASS or FAIL line) as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Zero dependencies: no npm, bundler, framework, D3, Three.js or Tailwind. All CSS in one `<style>`, all JS at the end of `<body>`. This overrides the project's own frontend stack; the article folder stands alone.
- The only network request of the page is Google Fonts (Crimson Pro, JetBrains Mono) from the template. Say so when the user needs an offline or private page, and use system fonts on request.
- Figures are hand-coded canvas, never images or SVG libraries; 3D uses the projection and z-sorting from the archetype reference.
- For code: never tidy a snippet into something the repository does not contain; build diagrams from real imports and call sites; note generated or vendored code.
- The article itself has zero dependencies; only the optional viewing browser may be installed, and only when none exists.

## Checks

- **outline_approved_by_user**: the user accepted the outline and figure list before scaffolding.
- **single_file_no_dependencies**: the article folder holds one index.html with inline CSS and JS and no external script or stylesheet other than the fonts link.
- **figures_render_and_respond**: every figure draws without console errors and every control changes it; a host without a browser records this as not-tested.
- **claims_gate_passed**: the claim report ends with `PASS`, every row `supported`.

## Sources

- AI intent mapping: creating-explainers → explainer.source-walkthrough and explainer.topic-research (its files and research intakes; mixed intake belongs to both); explaining-codebases → explainer.codebase-walkthrough; fact-checking-explainers → the two gates here and the standalone intent of `explainer-fact-check`.
- Source: explain-this (analyticalmonk/explain-this@f64dab45, plugin 0.1.1) — the three `SKILL.md`, their `references/**` and `skills/creating-explainers/assets/article-template.html`, packaged unchanged under `<package_root>/scripts/explain-this/skills/`.
- Runtime dependencies: none required. A web browser is optional for the polish step (the system's browser; Chrome from google.com/chrome only when none exists); `python3 -m http.server` uses the Python that Muro already needs.
- Not adopted: plugin manifests, `agents/openai.yaml`, evals, upstream plans and the skills' trigger phrases.
- Hooks: the selected files and both plugin manifests define none; `docs/**` and `evals/**` were not inspected for hooks.
- Harmonized by: prompts/harmonizer.md — the two authoring skills share one output format, so they are merged into one role with three intents; the upstream call to the fact-check skill becomes steps 2 and 7 of this single step.
