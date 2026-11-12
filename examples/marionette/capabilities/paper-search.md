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

0. **Read the original first.** Read `<package_root>/scripts/open-paper-skills/skills/paper-search/SKILL.source.md` whole before working. It is the method in the source's own words, and `$PS` is its script. Where this body and that file differ, the file wins, except for the changes listed under `## Sources` → "Changes for coexistence". The steps below are an index into it; sentences in quotation marks are the source's.
1. **Run from the user's project.** "the script finds the switch file by walking up from the working directory", so the working directory is inside the user's project, where `memory/paper-sources.json` lives. "bioRxiv and PubMed start switched off and every other source starts on; a source the switch file leaves out keeps that default." `uv run $PS sources` shows which sources are on.
2. **A source that is off is off on every route.** "Reach literature through `$PS`, and leave a switched-off source alone through other routes as well: MCP connectors, other skills, and web fetches. When the evidence needs a source that is off, say so and let the human decide." Other capabilities of this package count as other skills.
3. **Search** (source section "Search", with its table of what each source covers). `uv run $PS search "<query>"`: "Without `--source`, every source that is on is searched. Pick the sources that fit the field: machine learning reads best through `alphaxiv`, `huggingface`, and `pwc`; journal and cross-disciplinary work through `openalex`; biology through `biorxiv` and `pubmed`; an exact title, author, or arXiv category through `arxiv` with a fielded query such as `ti:"context language models"`." Controls, in the source's words:
   - "`--mode semantic` (default) or `keyword`: alphaXiv embedding vs full-text keyword search, PwC hybrid vs keyword, arXiv all-words vs exact phrase. Use `keyword` for exact method names, acronyms, benchmarks, and title phrases. Other sources ignore it."
   - "`--published-after` / `--published-before YYYY-MM-DD`: inclusive window. Supply one only when the question asks for a period."
   - "`--limit N`: results per source (default 10; PwC caps at 25)."
4. **Read the result** (source section "Read the result"). "The script prints `{query, searched, disabled, errors, results}`. Each result has `source`, `id`, `title`, `url`, and, when its source provides them, `abstract`, `publication_date`, `authors`, and the extra fields above. `id` is an arXiv id, a DOI, an OpenAlex `W…` id, a PMID, or a PwC catalog id."
   - "Results interleave the sources rank by rank. A paper several sources found appears once, under the first source, with the others in `also_in`; it keeps that source's `votes` and takes missing fields such as `code` from the rest."
   - "`errors` names each source that failed. Report a failed source as unsearched rather than as evidence that no such literature exists; the same holds for an empty result. Exit 0 means at least one source answered, 1 means every searched source failed, 2 means invalid use, including asking for a source that is off."
   - "Cite only papers the results or a follow-up read actually returned."
5. **Read a paper** (source section "Read a paper"). "`fetch` takes an arXiv id or URL, a DOI, an OpenAlex `W…` id, or a PubMed id and routes it by shape". `uv run $PS fetch <id>` reads the full text through the read order; `--via <source>` reads one source only; `--report` gives "alphaXiv's ~10 KB overview, for skimming".
   - "An arXiv paper is read from each source in the read order (default `huggingface`, `alphaxiv`, `arxiv`), skipping switched-off sources, until one returns a complete text: at least 5,000 characters with a heading such as Introduction or Method. A cut-short text, such as the lone figure caption Hugging Face serves for some fresh submissions, falls through to the next source."
   - "The text goes to a file (`--out`, default under the system temp directory); stdout is a JSON report with `tried` (each source's outcome), `source`, `url`, `file`, `chars`, and `metadata` from arXiv, else Hugging Face. Read the file in parts and cite the `source` and `url` the report names."
   - "Exit 1 means no source returned a complete text: report the `tried` outcomes and the `pdf` link, and let the human decide; `--via` or `--report` through a switched-off source exits 2. A DOI, OpenAlex id, or PMID returns its record from OpenAlex, bioRxiv, or PubMed under that source's switch; follow its `url` or `doi` for the text."
   - "When the harness has a logged-in alphaXiv connector (Claude Code's, for instance), use it to put questions to a paper's PDF. It belongs to the `alphaxiv` source, so it follows that switch."
6. **Keys** (source section "Keys"). "Every user brings their own optional keys: `OPENALEX_API_KEY` (OpenAlex and bioRxiv), `NCBI_API_KEY` (PubMed), and `HF_TOKEN` (Hugging Face)." The script reads them from the environment, else from the gitignored `.env` of the user's project, beside its `memory/` folder; "`uv run $PS keys` shows which are set. alphaXiv and PwC need none." "A rate-limited source (`HTTP 429`) comes back with the key that lifts the limit. Relay that next step to the human": they edit `.env` themselves, or `keys --set NAME` stores the value it reads from stdin. "Keep key values out of commits, prompts, and logs."
7. **Switches belong to the user** (source section "Switch a source"). "Change a switch only on the human's word, since the switches are the human's choice": `uv run $PS sources --disable pubmed`, `uv run $PS sources --enable pubmed --json`. "The read order is the human's choice too: `sources --read-order alphaxiv,huggingface,arxiv` sets it, and leaving a source out of it keeps `fetch` from reading through it while search still uses it." "Both rewrite `memory/paper-sources.json`, a tracked file; commit it with the change that motivated it." When the project has no switch file yet, the script answers "no memory/paper-sources.json above the working directory; pass --config": pass `--config <project>/memory/paper-sources.json` to create it there.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `literature_findings` as one JSON string: the query or id, the sources searched, the sources that failed or are off, and the papers kept (title, id, source, url, why each matters) or the path and source of the fetched text. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

Known source behaviour, in the source's words:

- "PwC allows 10 hybrid searches per minute per IP; bursts need `--mode keyword`. `PWC_MCP_URL` points at another server, such as a local `pwc-mcp`."
- "Hugging Face has no date filter, so a window is applied to a wider pool afterwards and can return fewer results than `--limit`."
- "A PubMed window matches print or electronic dates, while `publication_date` shows the electronic one, so a hit can predate the window."
- "arXiv's terms allow one request every three seconds; the script waits out the gap, so back-to-back arXiv calls are slow rather than refused."

Runtime dependency: `uv`, or Python 3.11+ already present. The source runs every command as `uv run $PS ...`. When `uv` is missing and wanted, install it from astral.sh (user scope) and say so in one line; `uv run` then installs the optional `truststore` named in the script header. When `uv` is missing and not wanted, run `python $PS ...` with Python 3.11 or later: the script header asks for that version and needs only the standard library. Nothing else is installed.

## Checks

- **searched_and_failed_sources_reported**: the answer names which sources were searched and which failed or are off; a failed or empty source is not presented as absence of literature.
- **citations_from_returned_results**: every cited paper appears in a result or a fetch report of this session.
- **switched_off_sources_untouched**: no switched-off source was reached by any route, and no switch or read order changed without the user's instruction.

## Sources

- AI intent mapping: paper-search → research.literature-search (its search and its source switches) and research.paper-reading (its `fetch`).
- Source: open-paper-skills (pengqianhan/open-paper-skills@f85fd3dc, head) — `skills/paper-search/SKILL.md` and `scripts/paper_search.py`, packaged unchanged under `<package_root>/scripts/open-paper-skills/skills/paper-search/` (the skill file as `SKILL.source.md`). The script reimplements designs from alphaXiv OpenResearch (MIT) and google-deepmind science-skills (Apache-2.0), as its header states.
- Not packaged: `scripts/test_paper_search.py`.
- Changes for coexistence (ADR-0017):
  - The source's frontmatter (`name`, `description` with its "Use when" triggers) is not applied: it registers and triggers the original as a skill, and the coordinator classifies by meaning.
  - "Run from anywhere inside the repository" becomes the user's project (step 1): the packaged script lives under `<package_root>`, outside that project, and it finds the switch file from the working directory.
  - The links `../../../memory/paper-sources.json` and `../../../.env.example` in the source point into the author's own repository and resolve to nothing here. The switch file and `.env` are those of the user's project; there is no `.env` template.
  - os-ui is not part of this package (it is the author's own interface and server; no supported host has it): "the human flips the switches from the **Papers** button in os-ui's agent windows" and "they paste the key under **Keys** in os-ui's Papers panel" are not followed. Switches change through `sources`, keys through `.env` or `keys --set NAME` (steps 6 and 7). The script's own rate-limit message still names the panel; relay the `.env` route.
  - "other skills" in the off-on-every-route rule also means the other capabilities of this package (step 2), so a capability that fetches from the web does not reach a switched-off source.
  - Running `python $PS` when `uv` is missing and not wanted, and installing `uv` when it is wanted (`## Specifics`), are this package's dependency rule (ADR-0007). The source names only `uv run`.
  - `--config <project>/memory/paper-sources.json` for a project without a switch file (step 7) is the script's own instruction, not in the skill text; it is stated because the source's repository always has the file and a user's project may not.
- Runtime dependency: `uv` or Python 3.11+; optional `truststore`; optional user keys. The source gives `uv run` as the method.
- Hooks: the selected files define none.
- Harmonized by: prompts/harmonizer.md — its own role; `paper-wiki` calls the same script as a helper inside its step and reads `literature_findings` when recorded.
