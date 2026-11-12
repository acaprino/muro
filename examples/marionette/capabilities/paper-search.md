---
id: paper-search
role: literature-search
when: —
after: []
outputs: ["literature_findings"]
checks: ["searched_and_failed_sources_reported", "citations_from_returned_results", "switched_off_sources_untouched"]
intents: [{"id":"research.literature-search","description":"Find research papers, related work, prior art or the code for a method across the scholarly sources the user has switched on (alphaXiv, OpenAlex, bioRxiv, PubMed, Hugging Face Papers, Papers with Code, arXiv), or change which of those sources are on and in what order papers are read.","excludes":["A general web search for news, products or documentation is not a literature search.","Writing or updating a paper note, topic or concept page in a paper wiki.","An interactive HTML explainer of a paper is explainer work."]},{"id":"research.paper-reading","description":"Fetch and read one paper from its identifier (arXiv id or URL, DOI, OpenAlex id, PubMed id): its full text through the user's read order, or its record when no full text is served.","excludes":["A PDF, Word or other file the user already has on disk is read as a file, not fetched.","Summarizing text the user pasted into the conversation needs no retrieval."]}]
tools: [{"name":"shell","purpose":"Run the packaged paper_search.py with uv or Python 3.11+. Queries and paper ids go to the literature services that are switched on.","required":true},{"name":"file-access","purpose":"Read the fetched full text from the file the script names; write the switch file memory/paper-sources.json only on the user's word.","required":true}]
hooks: []
conflicts: []
---

# Paper Search

One command searches every literature source the user has switched on and returns one result shape; another reads one paper through the user's read order. `$PS` below is `<package_root>/scripts/open-paper-skills/skills/paper-search/scripts/paper_search.py`.

## Behavior

1. **Run from the user's project.** The script looks for `memory/paper-sources.json` above the working directory. Without that file every source keeps its default: on, except `biorxiv` and `pubmed`. `uv run $PS sources` shows what is on; when `uv` is missing run `python $PS ...` with Python 3.11 or later.
2. **A source that is off is off on every route.** Do not reach it through an MCP connector, another capability or a web fetch either. When the evidence needs a source that is off, say so and let the user decide.
3. **Search.** `uv run $PS search "<query>"` searches every source that is on. Pick sources with `--source` when the field is clear: machine learning through `alphaxiv`, `huggingface`, `pwc`; journals and cross-disciplinary work through `openalex`; biology through `biorxiv`, `pubmed`; an exact title, author or category through `arxiv` with a fielded query such as `ti:"..."`. `--mode keyword` for exact method names, acronyms, benchmarks and title phrases (default `semantic`). `--published-after` / `--published-before YYYY-MM-DD` only when the question names a period. `--limit N` per source (default 10; Papers with Code caps at 25).
4. **Read the result.** Output is `{query, searched, disabled, errors, results}`; each result has `source`, `id`, `title`, `url` and, when provided, `abstract`, `publication_date`, `authors`, `votes`, `citations`, `code`. A paper found by several sources appears once, with the others in `also_in`. `errors` names each source that failed: report it as unsearched, never as evidence that no such literature exists; the same holds for an empty result. Exit 0: at least one source answered; 1: every searched source failed; 2: invalid use, including a source that is off.
5. **Read a paper.** `uv run $PS fetch <id>` takes an arXiv id or URL, a DOI, an OpenAlex `W...` id or a PubMed id. An arXiv paper is read from each source in the read order (default `huggingface`, `alphaxiv`, `arxiv`), skipping sources that are off, until one returns a complete text. The text goes to a file (`--out`, default under the system temp directory); stdout reports `tried`, `source`, `url`, `file`, `chars`, `metadata`. Read the file in parts and cite the `source` and `url` reported. `--report` gives alphaXiv's short overview for skimming; `--via <source>` reads one source only. A DOI, OpenAlex id or PubMed id returns its record, not the full text: follow its `url` or `doi`. Exit 1 means no source returned a complete text: report the `tried` outcomes and the `pdf` link and let the user decide.
6. **Keys.** `OPENALEX_API_KEY`, `NCBI_API_KEY` and `HF_TOKEN` are optional and belong to the user; the script reads them from the environment, else from the project's gitignored `.env` beside `memory/`. `uv run $PS keys` shows which are set. A rate-limited source (`HTTP 429`) answers with the key that lifts the limit: relay that to the user. Never put a key value in a command line, a commit, a prompt or a log.
7. **Switches belong to the user.** Change one only when the user says so: `uv run $PS sources --disable pubmed`, `--enable pubmed`, `--read-order alphaxiv,huggingface,arxiv`. When the project has no switch file yet, pass `--config <project>/memory/paper-sources.json` to create it there. The file is tracked: tell the user it changed.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `literature_findings` as one JSON string: the query or id, the sources searched, the sources that failed or are off, and the papers kept (title, id, source, url, why each matters) or the path and source of the fetched text. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Cite only papers that a search result or a follow-up read actually returned.
- Papers with Code allows 10 hybrid searches per minute per address; bursts need `--mode keyword`. `PWC_MCP_URL` points the script at another server.
- Hugging Face has no date filter: a window is applied afterwards and can return fewer results than `--limit`.
- arXiv allows one request every three seconds; the script waits, so back-to-back arXiv calls are slow, not refused.
- When the host has a logged-in alphaXiv connector it belongs to the `alphaxiv` source and follows that switch.
- Runtime dependency: `uv`, or Python 3.11+ already present. When `uv` is missing and wanted, install it from astral.sh (user scope) and say so in one line; `uv run` then installs the optional `truststore` named in the script header. Nothing else is installed.

## Checks

- **searched_and_failed_sources_reported**: the answer names which sources were searched and which failed or are off; a failed or empty source is not presented as absence of literature.
- **citations_from_returned_results**: every cited paper appears in a result or a fetch report of this session.
- **switched_off_sources_untouched**: no switched-off source was reached by any route, and no switch or read order changed without the user's instruction.

## Sources

- AI intent mapping: paper-search → research.literature-search (its search and its source switches) and research.paper-reading (its `fetch`).
- Source: open-paper-skills (pengqianhan/open-paper-skills@f85fd3dc, head) — `skills/paper-search/SKILL.md` and `scripts/paper_search.py`, packaged unchanged under `<package_root>/scripts/open-paper-skills/skills/paper-search/`. The script reimplements designs from alphaXiv OpenResearch (MIT) and google-deepmind science-skills (Apache-2.0), as its header states.
- Runtime dependency: `uv` or Python 3.11+; optional `truststore`; optional user keys. The source gives `uv run` as the method.
- Not adopted: the references to os-ui's Papers panel (the author's own interface) and `scripts/test_paper_search.py`.
- Hooks: the selected files define none.
- Harmonized by: prompts/harmonizer.md — its own role; `paper-wiki` calls the same script as a helper inside its step and reads `literature_findings` when recorded.
