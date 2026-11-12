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

Produces one `index.html` in the style of distill.pub: serif text, a sticky sidebar and canvas figures the reader operates, built in stages and never delivered with an unverified factual claim. `<ET>` below stands for `<package_root>/scripts/explain-this/skills`. The packaged originals under it are the full version: open what a step names when the task needs it; where this body differs the original wins, except for the changes listed in the Sources section.

## Behavior

1. **Intake.** Open only the reference of the branch that fits:
   - files, a URL or pasted text: `<ET>/creating-explainers/references/intake-from-files.md`. The provided documents are the source of truth.
   - only a topic: `<ET>/creating-explainers/references/intake-from-research.md`. If web search is unavailable, ask the user to paste sources; do not write from memory.
   - files plus a topic they do not cover: both references; the files are the spine, research is supporting, and there is one outline and one article.
   - a codebase or source files: `<ET>/explaining-codebases/references/code-intake.md`. Confirm the angle with the user (architecture overview or one mechanism), state the spine as one sentence, and quote real snippets of 5-20 lines, each tagged `path:line`. One subsystem or one mechanism per article.
2. **Research-time fact-check (required if you researched).** Before the outline, confirm that each gathered source exists and supports the points it will be used for; drop or replace any that does not hold up. In a mixed intake this covers the researched sources only: the user's files are ground truth. A codebase explainer with no research skips this step.
3. **Outline, then stop for approval.** Show the title, subtitle, section list with one-line summaries, and a numbered figure list saying what each figure shows and how the reader interacts with it, in the outline format of the intake reference in use (a codebase outline adds the snippet list). This is the only planned pause: after it, show progress and do not ask permission to continue unless something is genuinely ambiguous.
4. **Scaffold.** Copy `<ET>/creating-explainers/assets/article-template.html` to `<article-folder>/index.html` and fill its `{{PLACEHOLDERS}}`; do not rebuild the structure from scratch. `<ET>/creating-explainers/references/template-walkthrough.md` says what each block is and where content goes; pick the accent colors from `<ET>/creating-explainers/references/color-palettes.md`.
5. **Prose pass.** Read `<ET>/creating-explainers/references/voice-and-style.md` before writing prose, then write every section with figure placeholders. In short: second person; paragraphs of 80-180 words; no bullet lists in body prose; open with a concrete scene or tension, not a definition; captions say what to look for; 3-5 `.callout` per article; never an em-dash.
6. **Figures pass.** Aim for 3-5 figures, each paying off something the prose has just set up; none is decorative. Each is a self-contained IIFE with its state in closure variables, not globals, and the one shared utility is `initCanvas(id)`, always used for canvas sizing. Open the section of `<ET>/creating-explainers/references/figure-archetypes.md` for the archetype you implement (always for 3D rotation, whose correctness details it handles), and for code figures also `<ET>/explaining-codebases/references/code-figure-archetypes.md`.
7. **Post-draft fact-check (required, blocking).** Extract every checkable claim of the finished article with its location, read the source passage that backs it (for a codebase explainer, the actual code at the exact path and line, for every behaviour claim, snippet and architecture claim), and give each a verdict: `supported`, `needs-source`, `unsupported` or `contradicted`. Resolve all that are not `supported`: add support, correct to the source, soften to clearly-labeled interpretation when the statement really is interpretive, or cut. Write the report in the format of `<ET>/fact-checking-explainers/references/verification-report-format.md`, apply the fixes and re-run on the changed claims. Deliver only on `PASS`. When unsure what must be checked, open "What Counts as a Checkable Claim" in `<ET>/fact-checking-explainers/SKILL.source.md`.
8. **Polish.** Run every item of the "Quality Checklist" section of `<ET>/creating-explainers/SKILL.source.md` and fix each failing one before delivery; the step is complete only when all pass. To test locally, run `python3 -m http.server 8000` from the directory containing the file and open it in a browser, if browser tooling is available. If it is not, at minimum grep for `getElementById` calls without matching IDs, canvas IDs referenced before declaration, and `initCanvas` not defined.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `explainer_outline` (the approved outline and figure list), `explainer_file` (the index.html path) and `explainer_claims` (the claim report and its PASS or FAIL line) as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Non-negotiable: zero dependencies (no npm, bundler, React, D3, Three.js or Tailwind; vanilla HTML, inline CSS and vanilla JS only) and one file per article, with all CSS in a single `<style>` block in `<head>` and all JS at the bottom of `<body>`. The only external network requests are Google Fonts. This overrides the project's own frontend stack; the article folder stands alone.
- Keep the template's Google Fonts link (Crimson Pro and JetBrains Mono): do not remove it and do not add other fonts.
- Figures are hand-coded Canvas, not SVG libraries or images; 3D uses custom projection, z-sorting and lighting.
- For code: never tidy a snippet into something the repo does not contain; build diagrams from the actual imports and call sites; note when code is generated and prefer explaining its source.
- The article has no dependency to install; only the optional viewing browser may be installed, and only when none exists.

## Checks

- **outline_approved_by_user**: the user accepted the outline and figure list before scaffolding.
- **single_file_no_dependencies**: the article folder holds one index.html with inline CSS and JS and no external script or stylesheet other than the fonts link.
- **figures_render_and_respond**: every figure draws without console errors and every control changes it; a host without a browser records this as not-tested.
- **claims_gate_passed**: the claim report ends with `PASS`, every row `supported`.

## Sources

- AI intent mapping: creating-explainers → explainer.source-walkthrough and explainer.topic-research (its files and research intakes; mixed intake belongs to both); explaining-codebases → explainer.codebase-walkthrough; fact-checking-explainers → the two gates here and the standalone intent of `explainer-fact-check`.
- Source: explain-this (analyticalmonk/explain-this@f64dab45, plugin 0.1.1) — the three `SKILL.md` (each packaged as `SKILL.source.md`), their `references/**` and `skills/creating-explainers/assets/article-template.html`, packaged unchanged under `<package_root>/scripts/explain-this/skills/`.
- Changes for coexistence (ADR-0017):
  - The originals' frontmatter triggers and "When to Use" lists are not followed: routing is the coordinator's, by meaning, from this capability's intents.
  - "Use `fact-checking-explainers`", "Use `creating-explainers`" and "use `explaining-codebases` instead" invoke no skill: the originals are not registered, so the gates are steps 2 and 7 here and the codebase workflow is these eight steps with code intake as step 1 (one capability per step).
  - Relative `references/...`, `assets/...` and `<skill-path>` in the originals resolve under `<package_root>/scripts/explain-this/skills/<skill>/`, a `SKILL.md` is `SKILL.source.md`, and `Read`, `WebFetch`, `WebSearch` mean the host's own tools: package layout, multi-host.
  - The gate report, the approved outline and the file path are also returned as `explainer_claims`, `explainer_outline` and `explainer_file`: output handoff is the coordinator's.
  - Added "This overrides the project's own frontend stack; the article folder stands alone": other capabilities work under the project's stack constraints, and the zero-dependency rule needs a stated winner.
  - Added: a missing viewing browser may be installed for step 8 (ADR-0007), where the source only tests in a browser when tooling is available; `figures_render_and_respond` is not-tested on a host without one, and the source's minimum grep still runs.
- Runtime dependencies: none required. A web browser is optional for the polish step (the system's browser; Chrome from google.com/chrome only when none exists); `python3 -m http.server` uses the Python that Muro already needs.
- Not adopted: plugin manifests, `agents/openai.yaml`, evals, upstream plans and the skills' trigger phrases.
- Hooks: the selected files and both plugin manifests define none; `docs/**` and `evals/**` were not inspected for hooks.
- Harmonized by: prompts/harmonizer.md — the two authoring skills share one output format, so they are merged into one role with three intents; the upstream call to the fact-check skill becomes steps 2 and 7 of this single step.
