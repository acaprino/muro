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

One script searches every literature source the user has switched on, in parallel, and returns one JSON shape; its `fetch` reads one paper through the user's read order. `$PS` below is `<package_root>/scripts/open-paper-skills/skills/paper-search/scripts/paper_search.py`. The packaged original, `<package_root>/scripts/open-paper-skills/skills/paper-search/SKILL.source.md`, is the full version of this method and wins where this body differs from it, except for the changes listed in the Sources section. Open it only where a step below says so.

## Behavior

1. **Run from the user's project.** The script finds the switch file `memory/paper-sources.json` by walking up from the working directory, so work from inside the user's project. bioRxiv and PubMed start switched off and every other source starts on; a source the file leaves out keeps that default. `uv run $PS sources` shows which sources are on.
2. **A source that is off is off on every route.** Reach literature through `$PS`, and do not reach a switched-off source another way either: MCP connectors, other skills (the other capabilities of this package included) and web fetches. When the evidence needs a source that is off, say so and let the user decide.
3. **Search.** `uv run $PS search "<query>"` searches every source that is on; repeat `--source <name>` to narrow. Pick the sources that fit the field: machine learning through `alphaxiv`, `huggingface` and `pwc`; journal and cross-disciplinary work through `openalex`; biology through `biorxiv` and `pubmed`; an exact title, author or arXiv category through `arxiv` with a fielded query such as `ti:"context language models"` (`ti:`, `au:`, `abs:`, `cat:`). Open the table in the original's "Search" section when you need what each source covers or which extra fields (votes, citations, code) it returns.
   - `--mode semantic` (default) or `keyword`: alphaXiv embedding or full-text keyword search, PwC hybrid or keyword, arXiv all-words or exact phrase; other sources ignore it. Use `keyword` for exact method names, acronyms, benchmarks and title phrases.
   - `--published-after` / `--published-before YYYY-MM-DD`: inclusive window. Supply one only when the question asks for a period.
   - `--limit N`: results per source (default 10; PwC caps at 25).
4. **Read the result.** The script prints `{query, searched, disabled, errors, results}`. Each result has `source`, `id` (an arXiv id, a DOI, an OpenAlex `W…` id, a PMID or a PwC catalog id), `title`, `url` and whatever else its source provides.
   - Results interleave the sources rank by rank. A paper several sources found appears once, under the first source, with the others in `also_in`; it keeps that source's `votes` and takes missing fields such as `code` from the rest.
   - `errors` names each source that failed. Report a failed source as unsearched, never as evidence that no such literature exists; the same holds for an empty result. Exit 0: at least one source answered; 1: every searched source failed; 2: invalid use, including asking for a source that is off.
   - Cite only papers the results or a follow-up read actually returned.
5. **Read a paper.** `uv run $PS fetch <id>` takes an arXiv id or URL, a DOI, an OpenAlex `W…` id or a PubMed id and routes it by shape; `--via <source>` reads through one source only; `--report` gives alphaXiv's overview of about 10 KB, for skimming.
   - An arXiv paper is read from each source in the read order (default `huggingface`, `alphaxiv`, `arxiv`), skipping switched-off sources, until one returns a complete text: at least 5,000 characters with a heading such as Introduction or Method. A cut-short text (the lone figure caption Hugging Face serves for some fresh submissions) falls through to the next source.
   - The text goes to a file (`--out`, default under the system temp directory); stdout is a JSON report with `tried` (each source's outcome), `source`, `url`, `file`, `chars` and `metadata` from arXiv, else Hugging Face. Read the file in parts and cite the `source` and `url` the report names.
   - Exit 1: no source returned a complete text; report the `tried` outcomes and the `pdf` link and let the user decide. `--via` or `--report` through a switched-off source exits 2.
   - A DOI, OpenAlex id or PMID returns its record (no full text) from OpenAlex, bioRxiv or PubMed, under that source's switch; follow its `url` or `doi` for the text.
   - When the host has a logged-in alphaXiv connector, use it to put questions to a paper's PDF. It belongs to the `alphaxiv` source and follows that switch.
6. **Keys.** Each user brings optional keys: `OPENALEX_API_KEY` (OpenAlex and bioRxiv), `NCBI_API_KEY` (PubMed), `HF_TOKEN` (Hugging Face); alphaXiv and PwC need none. The script reads them from the environment, else from the gitignored `.env` of the user's project, beside its `memory/` folder. `uv run $PS keys` shows which are set. A rate-limited source (`HTTP 429`) comes back naming the key that lifts the limit: relay that next step to the user, who edits `.env` or has `keys --set NAME` store the value it reads from stdin. Keep key values out of commits, prompts and logs.
7. **Switches belong to the user.** Change a switch only on the user's word: `uv run $PS sources --disable pubmed`, `uv run $PS sources --enable pubmed --json`. The read order is the user's choice too: `sources --read-order alphaxiv,huggingface,arxiv` sets it, and a source left out of it is not read through by `fetch` while search still uses it. Both rewrite `memory/paper-sources.json`, a tracked file; commit it with the change that motivated it. In a project with no switch file the script answers `no memory/paper-sources.json above the working directory; pass --config`: pass `--config <project>/memory/paper-sources.json` to create it there.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `literature_findings` as one JSON string: the query or id, the sources searched, the sources that failed or are off, and the papers kept (title, id, source, url, why each matters) or the path and source of the fetched text. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Open "Known source behaviour" in the original's "Read the result" section when a search is rate-limited or slow, or a date window returns odd results: it covers the PwC limit of 10 hybrid searches per minute per IP (bursts need `--mode keyword`) and `PWC_MCP_URL`, the Hugging Face and PubMed date windows, and arXiv's one request every three seconds.
- Runtime dependency: `uv`, or Python 3.11+ already present. The source runs every command as `uv run $PS ...`. When `uv` is missing and wanted, install it from astral.sh (user scope) and say so in one line; `uv run` then installs the optional `truststore` named in the script header. When `uv` is missing and not wanted, run `python $PS ...` with Python 3.11 or later: the script needs only the standard library. Nothing else is installed.

## Checks

- **searched_and_failed_sources_reported**: the answer names which sources were searched and which failed or are off; a failed or empty source is not presented as absence of literature.
- **citations_from_returned_results**: every cited paper appears in a result or a fetch report of this session.
- **switched_off_sources_untouched**: no switched-off source was reached by any route, and no switch or read order changed without the user's instruction.

## Sources

- AI intent mapping: paper-search → research.literature-search (its search and its source switches) and research.paper-reading (its `fetch`).
- Source: open-paper-skills (pengqianhan/open-paper-skills@f85fd3dc, head) — `skills/paper-search/SKILL.md` and `scripts/paper_search.py`, packaged unchanged under `<package_root>/scripts/open-paper-skills/skills/paper-search/` (the skill file as `SKILL.source.md`). The script reimplements designs from alphaXiv OpenResearch (MIT) and google-deepmind science-skills (Apache-2.0), as its header states.
- Not packaged: `scripts/test_paper_search.py`.
- Changes for coexistence (ADR-0017):
  - The source's frontmatter triggers ("Use when ...") are not applied: they would trigger the original as a skill, and the coordinator classifies by meaning.
  - "Run from anywhere inside the repository" becomes the user's project (step 1): the packaged script lives under `<package_root>`, outside that project, and it finds the switch file from the working directory.
  - The source's `.env` template (`.env.example` in the author's repository) does not exist here: the `.env` is the user's project's, written by the user or by `keys --set NAME`.
  - The os-ui routes (switches from its **Papers** button, keys pasted under **Keys** in its Papers panel) are not followed: os-ui is the author's own interface and no supported host has it. Switches change through `sources`, keys through `.env` or `keys --set NAME`; the script's rate-limit message still names the panel, relay the `.env` route.
  - "other skills" in the off-on-every-route rule also covers the other capabilities of this package (step 2), which would otherwise be a second route to a switched-off source.
  - Installing `uv` when wanted, and `python $PS` when it is not, are this package's dependency rule (ADR-0007); the source names only `uv run`.
  - `--config <project>/memory/paper-sources.json` (step 7) is the script's own instruction, not in the skill text: the source's repository always has the switch file, a user's project may not.
- Runtime dependency: `uv` or Python 3.11+; optional `truststore`; optional user keys. The source gives `uv run` as the method.
- Hooks: the selected files define none.
- Harmonized by: prompts/harmonizer.md — its own role; `paper-wiki` calls the same script as a helper inside its step and reads `literature_findings` when recorded.
