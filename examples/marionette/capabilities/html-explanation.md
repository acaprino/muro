---
id: html-explanation
role: explanation-authoring
when: —
after: []
outputs: ["explanation_file"]
checks: ["four_sections_one_long_page", "quiz_five_questions_give_feedback", "single_dated_file_outside_repo", "preformatted_blocks_keep_whitespace"]
intents: [{"id":"explanation.html-page","description":"Explain a research paper, blog post, article, documentation or any complex concept the user wants to understand deeply (\"explain this paper\", \"help me understand this post\", \"break down this concept\"): the answer is a rich single-file HTML page with background, intuition, walkthrough and a quiz, even when HTML is not asked for.","excludes":["A quick factual answer, a definition or a summary of a few lines is not a rich explanation.","An explanation the user explicitly wants in the conversation and not as a file.","The interactive explainer article with hand-built figures the reader operates, or a walkthrough traced through a repository's code, asked for as such, is interactive-explainer's work.","Finding or fetching a paper is a literature search; it can come first as its own step.","A slide deck, a Word or a PDF document is Office work."]}]
tools: [{"name":"file-access","purpose":"Read the paper, post, article or documentation the user points at, and write one HTML file in a folder outside the project.","required":true},{"name":"web-research","purpose":"Open a subject given as a link, and look up the related work or the prerequisite ideas it builds on when that helps. Queries leave the machine.","required":false}]
hooks: []
conflicts: ["interactive-explainer"]
reads: ["literature_findings"]
---

# HTML Explanation

Answers a request to explain or understand something with one rich HTML page instead of a chat message: background, intuition, walkthrough and a quiz, read top to bottom. The packaged original, `<package_root>/scripts/open-paper-skills/skills/explain-anything-html/SKILL.source.md`, is one page and is the full version of this method: read it before writing. It wins where this body differs from it, except for the changes listed in the Sources section.

## Behavior

1. **Take in the subject.** Read the paper, post, article or documentation the user names, or pin down the concept. Explore the source material broadly and, where useful, the related work or prerequisite ideas it builds on. When an earlier step recorded `literature_findings`, start from the text it fetched.
2. **Write four sections on one long page.**
   - **Background**: the existing context relevant to the subject. How much the reader knows is unknown, so include a deep background for beginners, noting that a reader already familiar can skip it, then a narrower background directly relevant to the subject.
   - **Intuition**: the essence, not the full details: the paper's central idea, the post's key argument, the heart of the concept. Use concrete examples with toy data, and figures and diagrams liberally.
   - **Walkthrough**: a high-level walkthrough of the substance: the methods, arguments, results or key sections. Group and order the material so it is understood, not in the source's order when another order explains it better.
   - **Quiz**: five questions that test whether the reader has actually understood. Medium difficulty: hard enough that answering needs the substance, never gotchas. They are interactive multiple-choice questions: a click tells the reader whether the answer is correct and gives feedback.
3. **Format.** One self-contained HTML file with its CSS and JavaScript inside. One long page with section headers and a table of contents; no tabs for the top-level structure. Basic responsive styling, so the page can be read on a phone, is welcome too.
4. **Voice.** The clarity and flow of Martin Kleppmann: engaging, in classic style, with smooth transitions between sections.
5. **Diagrams.** Ideally pick a small number of diagram families and reuse them through the page for the various cases. Useful kinds: a schematic or conceptual diagram of the key idea, of the states before and after, or of how the pieces relate, concrete with example values where possible; a system diagram of the data flow or of the relation between components or steps, with example data in it. Never an ASCII diagram: simple HTML designs for diagrams, HTML lists for lists.
6. **Preformatted text.** Code blocks, equations and any preformatted text go in `<pre>` tags. A custom styled `div` used in their place must have `white-space: pre-wrap` in its CSS, or the browser collapses all its newlines into one line. Before saving, scan each code block in the HTML source and confirm its CSS includes `white-space: pre` or `pre-wrap`.
7. **Callouts.** Use callouts for key concepts or definitions, important edge cases and the like.
8. **Save outside the project.** Put the file in a global place on the user's computer, outside the code repository, under a name that always starts with today's date as `YYYY-MM-DD-`: that keeps the files sorted by time and out of version control. The source's example is `/tmp/2026-01-12-explanation-<slug>.html`; on a system with no `/tmp` use its temporary folder. When a file of that name already exists (the same subject, explained earlier that day), that is not a reason to stop: read it first when the user asked to redo that page, otherwise keep it and add a short suffix to the new name (`-2`). Give the user the full path.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `explanation_file` (the full path of the HTML file) as a JSON string. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- This method has no outline to approve, no fixed number of figures and no claim gate: those belong to `interactive-explainer`, which is another capability and never runs in the same plan.
- Nothing is installed: the page needs only a browser to be read.

## Checks

- **four_sections_one_long_page**: Background (the beginner part marked as skippable, then the narrow part), Intuition, Walkthrough and Quiz are all there, on one long page with section headers and a table of contents and no top-level tabs.
- **quiz_five_questions_give_feedback**: the quiz has five multiple-choice questions, and on a click the page says whether the answer is correct and gives feedback.
- **single_dated_file_outside_repo**: one self-contained HTML file, CSS and JavaScript inside, saved outside the code repository under a name that starts with today's date as `YYYY-MM-DD-`.
- **preformatted_blocks_keep_whitespace**: every code block, equation or preformatted text is a `<pre>` or has `white-space: pre` or `pre-wrap`, confirmed in the HTML source before saving, and no diagram is ASCII.

## Sources

- AI intent mapping: explain-anything-html → explanation.html-page, its one outcome. Its trigger ("even if they don't explicitly ask for HTML") is the intent's meaning.
- Source: open-paper-skills (pengqianhan/open-paper-skills@f85fd3dc, head) — `skills/explain-anything-html/SKILL.md`, the whole skill, packaged unchanged as `<package_root>/scripts/open-paper-skills/skills/explain-anything-html/SKILL.source.md`.
- Origin of the text, as the skill states it: "Adapted from `explain-diff-html`, which is based on Geoffrey Litt's original skill" (gist `geoffreylitt/a29df1b5f9865506e8952488eac3d524`). The licence verified is the repository's MIT. The gist carries no licence statement (read on 2026-11-18): open for the owner.
- Intake of 2026-11-18, owner decision: this skill and paper search are what the package takes from this source. The intake of 2026-11-11 had left this skill out, unread, as "served by explain-this". The two differ in when they start (this one on any request to explain or understand, the explainer only when it is asked for) and in what they make (a lesson page with a quiz, saved outside the project; an article with operable canvas figures, an approved outline and a claim gate).
- Changes for coexistence (ADR-0017):
  - The frontmatter trigger does not start the original as a skill: the original is not registered and the coordinator classifies by meaning. What the trigger says is kept, as the intent's meaning and in the discovery entry.
  - Two sources answer "explain this as an HTML page", and one explanation has one owner: this capability and `interactive-explainer` are declared conflicts. The request that asks for the interactive explainer article or for a walkthrough of code is the explainer's; every other request to explain or understand is this one's.
  - The example path `/tmp/...` means nothing on a host without `/tmp`: there the file goes in the system's temporary folder. The rule itself (a global place outside the code repository, a name that starts with the date) is unchanged.
  - Added to step 8: what to do when the dated name already exists. The source gives one name for a subject and a day, and a host's file tool refuses to replace a file it has not read: in the live run of 2026-11-18 a second explanation of the same subject stopped there and saved no page.
  - The file path is also returned as `explanation_file`, and the `literature_findings` of an earlier step are read when recorded: output handoff is the coordinator's.
- Runtime dependencies: none.
- Hooks: the selected file defines none.
- Harmonized by: prompts/harmonizer.md (2026-11-18) — its own role, a declared alternative to `interactive-explainer`; `paper-search` can run first as its own step and hand its text over.
