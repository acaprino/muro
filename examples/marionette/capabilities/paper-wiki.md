---
id: paper-wiki
role: paper-knowledge-base
when: —
after: []
outputs: ["wiki_changes", "wiki_validation"]
reads: ["literature_findings"]
checks: ["fidelity_pass_done", "links_bidirectional_and_indexed", "viewer_regenerated_before_validation", "validator_passes", "reading_status_left_to_user"]
intents: [{"id":"research.paper-notes","description":"Add or update notes in a Markdown paper wiki (default folder paper-wiki/): one page per paper, a lighter page for a blog post, documentation page or talk, topic pages for durable themes and concept pages for recurring methods, datasets, benchmarks, metrics, terms or tools, all cross-linked, with an optional simplified-Chinese mirror of each paper note.","excludes":["Only finding or reading papers, with no wiki to update.","A one-off summary or comparison wanted in the conversation.","An interactive HTML explainer or lesson about a paper.","Writing the manuscript of a paper."]},{"id":"research.wiki-upkeep","description":"Maintain an existing paper wiki: validate its structure and links, regenerate its offline graph and timeline viewer, set a note's reading status on the user's word, define a custom note template, link papers to the project that uses them, or write a durable comparison note.","excludes":["Organizing a general repository or documentation folder that is not a paper wiki.","Reference managers such as Zotero."]}]
tools: [{"name":"file-access","purpose":"Read and write Markdown pages and indexes under the wiki root, and the wiki's own template config when the user asks for a custom template.","required":true},{"name":"shell","purpose":"Run the packaged Python scripts (paper search and fetch, viewer generation, validation, status, template profiles) and fetch the five viewer libraries once. Paper ids and queries go to the literature services that are on.","required":true},{"name":"web-research","purpose":"Open a blog post, documentation page or talk that is added as a non-paper source. Requests leave the machine.","required":false},{"name":"browser","purpose":"Open the generated viz.html to look at the graph and timeline.","required":false}]
hooks: []
conflicts: []
---

# Paper Wiki

Maintains an Open Knowledge Format (OKF) paper wiki as Markdown files with YAML frontmatter. `<PW>` is `<package_root>/scripts/open-paper-skills/skills/paper-wiki-manager`; `$PS` is `<package_root>/scripts/open-paper-skills/skills/paper-search/scripts/paper_search.py`. The source skill is `<PW>/SKILL.md`: read its section for the page type you are editing before you write.

## Behavior

1. **Locate the wiki.** `paper-wiki/` in the project unless the user names another root. Collections: `papers/` (one page per arXiv paper), `topics/`, `concepts/`, `sources/` (non-paper sources), `papers_zh/` (auxiliary Chinese mirrors, never graph nodes). Format: `<PW>/references/SPEC.md` (OKF) and `<PW>/references/schema.md` (the stricter paper-wiki profile).
2. **Resolve the paper.** Take the arXiv id from the URL, the input or the PDF filename; for a PDF without one, look for an embedded `arxiv.org` URL. For a title only, run `uv run $PS search "<title>" --mode keyword --limit 5`: continue without asking only when exactly one candidate's title equals the given title ignoring case and punctuation, and name it; otherwise show the candidates and wait. Never guess an id. Use `literature_findings` when it is recorded.
3. **Existing page first.** If `papers/<arxiv_id>.md` exists, read it and follow `<PW>/references/repeated-ingestion.md`: the existing body is the current best synthesis; merge only evidence-supported changes, protect the user's notes, never append a second generated note.
4. **Fetch.** `uv run $PS fetch <arxiv_id>` writes the full text to the file its report names and fills the metadata. Sources the user switched off stay off on every route. Prefer arXiv for bibliographic facts.
5. **Write the paper page.** Read `<PW>/assets/paper-wiki.toml` (or the wiki's own config when it has one): list its `paper_body.profiles`, use `default_profile` unless the user or the paper type calls for another, and use `section_descriptions` as drafting guidance without copying them into the note. New pages get `status: unread`.
6. **Fidelity pass.** Before finishing a note, locate every load-bearing number, taxonomy branch, named example and comparative claim in the fetched text or a source listed under `# Citations`. Mark reader-made examples and inferences as such; remove what cannot be located. The validator cannot check this.
7. **Chinese mirror.** When `[localized_notes].enabled` is true in the config (the packaged default), create or update `papers_zh/<arxiv_id>.md` after the English note, as `<PW>/SKILL.md` "Chinese Paper Notes" describes; it is never indexed or linked as a node. If the user does not want mirrors, use a wiki config with it set to false.
8. **Topics and concepts.** Update 1 to 3 important themes as topic pages (`# Scope`, `# Papers`, `# Open Questions`); reuse an existing topic when it means the same. Create a concept page only for an entity two or more wiki papers reference, a durable field-level entity, or one the user asks to track. Links are bidirectional; update `papers/index.md`, `topics/index.md`, `concepts/index.md` and the wiki home.
9. **Non-paper sources** go under `sources/<slug>.md` with `type: Reference`; their links to topics and concepts are one-way. A paper used by a project in the repository gets `# Used In Projects` with a relative link to a Markdown file of that project.
10. **Finish.** Fetch the viewer libraries if missing (Specifics), then from `<PW>`:
    `uv run scripts/generate_viz.py <absolute wiki root>` and `uv run scripts/validate_paper_wiki.py <absolute wiki root>` (plain `python` with 3.11+ when `uv` is unavailable). Generate before validating: the validator reads `viz.html`. Fix what it reports.
11. **Other requests.** Reading status changes only on the user's word: `python <PW>/scripts/set_status.py <note> unread|skimmed|read`. A custom note template is a profile made with `<PW>/scripts/create_paper_body_profile.py --config <wiki config> ...` (`--preview` first; `--set-default` only when asked). A comparison becomes a note only when the user wants a durable artifact.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `wiki_changes` (pages created or updated, with paths, and the sources actually used) and `wiki_validation` (the validator's result and whether `viz.html` was regenerated) as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Never write inside `<package_root>` except the viewer libraries below. A wiki-specific config is a copy of `<PW>/assets/paper-wiki.toml` kept in the user's project and passed with `--config`.
- Preserve on every update: `status`, `priority`, `tags`, `# Notes`, `# 个人笔记` and any frontmatter key the schema does not define.
- Cite only sources that were actually used.
- Runtime dependency, viewer libraries: `generate_viz.py` inlines five MIT libraries from `<PW>/scripts/vendor/`, which this package does not redistribute. When one is missing, download the exact versions listed in `<PW>/scripts/vendor/README.md` from the jsDelivr npm mirror into that folder (cytoscape 3.28.1, layout-base 2.0.1, cose-base 2.2.0, cytoscape-fcose 2.2.0, marked 12.0.0; about 700 KB) and say so in one line. If the download fails, the notes stand and viewer and validation are reported as not done.
- Runtime dependency: `uv`, or Python 3.11+ already present, as in `paper-search`.

## Checks

- **fidelity_pass_done**: every load-bearing number and comparative claim in a new or changed note was located in the fetched paper or a cited source; inferences are marked.
- **links_bidirectional_and_indexed**: each paper-topic and paper-concept link exists on both pages and every new page is in its index.
- **viewer_regenerated_before_validation**: `generate_viz.py` ran after the last content edit and before the validator.
- **validator_passes**: `validate_paper_wiki.py` exits clean on the wiki root; quote its final line.
- **reading_status_left_to_user**: no `status` changed without the user's instruction, and new pages are `unread`.

## Sources

- AI intent mapping: paper-wiki-manager → research.paper-notes (adding and updating papers, sources, topics, concepts, mirrors) and research.wiki-upkeep (validation, viewer, status, templates, project links, comparison notes).
- Source: open-paper-skills (pengqianhan/open-paper-skills@f85fd3dc, head) — `skills/paper-wiki-manager/SKILL.md`, `assets/paper-wiki.toml`, `references/**`, the four scripts, `scripts/static/**`, `scripts/templates/**` and `scripts/vendor/README.md`, packaged unchanged.
- Not packaged: `scripts/vendor/*.js` (third-party libraries under their own copyrights; two carry no notice in the file), the scripts' tests and `agents/openai.yaml`. Not adopted: the Status-row buttons that need the author's os-ui server; opened from disk the row is read-only, as the source says.
- Runtime dependencies: `uv` or Python 3.11+; the five viewer libraries, fetched as above. The source ships them vendored; fetching them is this package's method.
- Hooks: the selected files define none.
- Harmonized by: prompts/harmonizer.md — its own role and outputs. It calls the paper-search script as a helper inside its step, so no prerequisite; it reads `literature_findings` when a search step ran before it.
