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

Produces one `index.html` in the style of distill.pub: serif text, a sticky sidebar, and 3 to 5 canvas figures the reader operates. The article is built in stages and does not ship with an unverified factual claim. `<ET>` below stands for `<package_root>/scripts/explain-this/skills`; a bare `references/...` or `assets/...` path, here and inside the originals, is under the folder of the skill that names it (`<ET>/creating-explainers/` unless the step says otherwise).

## Behavior

0. **Read the originals first.** The method is the source's, in its own words, in these packaged files. Read them whole before working:
   - every explainer: `<package_root>/scripts/explain-this/skills/creating-explainers/SKILL.source.md`;
   - a codebase explainer, in addition: `<package_root>/scripts/explain-this/skills/explaining-codebases/SKILL.source.md`;
   - before step 2 or step 7, whichever comes first: `<package_root>/scripts/explain-this/skills/fact-checking-explainers/SKILL.source.md` and `<package_root>/scripts/explain-this/skills/fact-checking-explainers/references/verification-report-format.md`.

   The reference files named in the steps below are read whole when their step is reached, as the source asks: "Read these as needed during the workflow - don't load them all upfront." The steps below are an index into those files. Where this body and an original differ, the original wins, except for the changes listed in the "Changes for coexistence" bullet of the Sources section.
1. **Intake.** Pick the branch from what the user gave and read its reference:
   - files, a URL or pasted text: `<ET>/creating-explainers/references/intake-from-files.md`; the provided documents are the source of truth.
   - only a topic: `<ET>/creating-explainers/references/intake-from-research.md`. "If you only have a topic and web search is unavailable, ask the user to paste sources. Do not write a technical interactive explainer from training data alone": do not write from memory.
   - files plus a topic they do not cover: both references; "Files as spine, research as supporting".
   - a codebase: `<ET>/explaining-codebases/references/code-intake.md`. Confirm the angle with the user (architecture overview or one mechanism), state the spine as one sentence, and "Quote actual code, short (5-20 lines), each tagged with its `path:line`."
2. **Research-time fact-check (required if you researched).** Before drafting, "go through the gathered sources and confirm each one exists and actually supports the points it will be used for." "Drop or replace any source that does not hold up." In a mixed intake it runs "on the researched sources only; the given files are user-provided ground truth."
3. **Outline, then stop for approval.** "Show the user: title, subtitle, section list with one-line summaries, and a numbered figure list with what each figure shows and how the reader interacts with it." Use the outline format of the intake reference in use; a codebase outline adds the snippet list. "Don't pause between the other steps unless something is genuinely ambiguous. Show progress, don't ask for permission to keep working."
4. **Scaffold.** Copy `<ET>/creating-explainers/assets/article-template.html` to `<article-folder>/index.html` and fill its `{{PLACEHOLDERS}}` following `references/template-walkthrough.md`. "Don't try to rebuild this structure from scratch".
5. **Prose pass.** "Read `references/voice-and-style.md` before writing prose", then write all sections with figure placeholders. Its quick reminders are in the `## Voice` section of the creating-explainers original (second person, 80-180 word paragraphs, no bullet lists in body prose, a concrete opening scene or tension, captions that say what to look for, no em-dashes). Pick accents from `references/color-palettes.md`.
6. **Figures pass.** "Each interactive figure is a self-contained IIFE"; "State lives in closure variables, not globals. There's exactly one shared utility: `initCanvas(id)`". Take the pattern from `references/figure-archetypes.md`, and for code also from `<ET>/explaining-codebases/references/code-figure-archetypes.md`. "Aim for 3-5 figures per interactive explainer." "Each figure should pay off something the prose has just set up - no "decorative" figures."
7. **Post-draft fact-check (required, blocking).** Follow `<ET>/fact-checking-explainers/SKILL.source.md`, sections "What Counts as a Checkable Claim", "The Verification Process", "The Two Gates" and "Resolution": extract every checkable claim, read the supporting passage (for a codebase explainer, "the actual code at the exact path and line"), assign a verdict, then resolve everything that is not `supported`: add support, correct, soften or cut. Report in the format of `<ET>/fact-checking-explainers/references/verification-report-format.md`. "Do not deliver the article until the verdict is `PASS`. Apply the recommended fixes, then re-run on the changed claims." Deliver only on `PASS`.
8. **Polish.** Run the `## Quality Checklist` of the creating-explainers original to completion: "Step 8 is complete only when every Quality Checklist item passes. Fix any failing item before delivery." "The "test it locally" step is `python3 -m http.server 8000` from the directory containing the file, then open it in a browser. If you have browser tooling available, do this. If you don't, at minimum grep for common bugs: `getElementById` calls without matching IDs, canvas IDs referenced before declaration, `initCanvas` not defined."

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `explainer_outline` (the approved outline and figure list), `explainer_file` (the index.html path) and `explainer_claims` (the claim report and its PASS or FAIL line) as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- The source's core constraints are non-negotiable: "**Zero dependencies.** No npm, no bundler, no React, no D3, no Three.js, no Tailwind. Vanilla HTML + inline CSS + vanilla JS only." "**One file per article.** All CSS in a single `<style>` block in `<head>`; all JS at the bottom of `<body>`. The only external network requests are Google Fonts." This overrides the project's own frontend stack; the article folder stands alone.
- The Google Fonts link of the template "Loads Crimson Pro and JetBrains Mono. Don't remove. Don't add other fonts."
- "**Hand-coded Canvas figures**, not SVG libraries or images. 3D uses custom projection + z-sorting + lighting (see `references/figure-archetypes.md`)."
- For code: "Never tidy code into something the repo does not contain"; "Build the diagram from the actual imports and call sites, not a guess"; "Note when code is generated, and prefer explaining the source it is generated from."
- The article itself has zero dependencies; only the optional viewing browser may be installed, and only when none exists.

## Checks

- **outline_approved_by_user**: the user accepted the outline and figure list before scaffolding.
- **single_file_no_dependencies**: the article folder holds one index.html with inline CSS and JS and no external script or stylesheet other than the fonts link.
- **figures_render_and_respond**: every figure draws without console errors and every control changes it; a host without a browser records this as not-tested.
- **claims_gate_passed**: the claim report ends with `PASS`, every row `supported`.

## Sources

- AI intent mapping: creating-explainers → explainer.source-walkthrough and explainer.topic-research (its files and research intakes; mixed intake belongs to both); explaining-codebases → explainer.codebase-walkthrough; fact-checking-explainers → the two gates here and the standalone intent of `explainer-fact-check`.
- Source: explain-this (analyticalmonk/explain-this@f64dab45, plugin 0.1.1) — the three `SKILL.md` (each packaged as `SKILL.source.md`), their `references/**` and `skills/creating-explainers/assets/article-template.html`, packaged unchanged under `<package_root>/scripts/explain-this/skills/`.
- Changes for coexistence (ADR-0017):
  - The frontmatter of the three originals (`name`, `description`, trigger phrases) and their "When to Use" lists are not followed: they register and route the originals as skills, and the coordinator classifies by meaning from this capability's intents.
  - "Use `fact-checking-explainers`", "Use `creating-explainers`" and "use `explaining-codebases` instead" do not invoke a skill: the three originals are not registered as skills in this package. They are read as files and carried out inside this one step (one capability per step); the fact-check gates are steps 2 and 7 here, and the codebase workflow is the same eight steps with code intake as step 1 and step 2 skipped when nothing was researched.
  - Relative `references/...` and `assets/...` paths and `<skill-path>` in the originals resolve under `<package_root>/scripts/explain-this/skills/<skill>/`, and a referenced `SKILL.md` is `SKILL.source.md` there: that is where the package stores them.
  - Tool names in the originals (`Read` and its `pages` parameter, `WebFetch`, `WebSearch`) mean the host's own file and web tools: the package is multi-host and the host maps the cataloged `file-access` and `web-research` requirements to its real tools.
  - The gate report that the source returns inline, the approved outline and the file path are also returned as `explainer_claims`, `explainer_outline` and `explainer_file` through the coordinator: output handoff is the coordinator's.
  - Added sentence "This overrides the project's own frontend stack; the article folder stands alone": other capabilities of the catalog work under the project's stack constraints, and the source's zero-dependency rule would otherwise meet them without a stated winner.
  - Added: a missing viewing browser may be installed for step 8 (install-missing-dependency rule, ADR-0007); the source only says to test in a browser when tooling is available. The check `figures_render_and_respond` is recorded as not-tested on a host without a browser, where the source's minimum grep still runs.
- Runtime dependencies: none required. A web browser is optional for the polish step (the system's browser; Chrome from google.com/chrome only when none exists); `python3 -m http.server` uses the Python that Muro already needs.
- Not adopted: plugin manifests, `agents/openai.yaml`, evals, upstream plans and the skills' trigger phrases.
- Hooks: the selected files and both plugin manifests define none; `docs/**` and `evals/**` were not inspected for hooks.
- Harmonized by: prompts/harmonizer.md — the two authoring skills share one output format, so they are merged into one role with three intents; the upstream call to the fact-check skill becomes steps 2 and 7 of this single step.
