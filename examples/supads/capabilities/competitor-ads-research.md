---
id: competitor-ads-research
role: ad-research
when: —
after: []
outputs: ["competitor_ads_report"]
checks: ["pages_pulled_by_proven_id", "run_folder_holds_three_files", "only_marked_ads_watched_once", "claims_cite_refs_and_population"]
check_conditions: {"run_folder_holds_three_files": "At least one competitor's pull returned ads, so a ledger was built.", "only_marked_ads_watched_once": "At least one competitor's pull returned ads, so a ledger was built.", "claims_cite_refs_and_population": "At least one competitor's pull returned ads, so a ledger was built."}
intents: [{"id":"ads.competitor-ads-research","description":"Research the ads competitors, or one named brand, are running in Meta's ad library: the ones live now, the ones already stopped and which have run longest. A vision model watches the video ads and reads the image ads, and the set is read for patterns: what is holding, what was dropped and what nobody runs. It applies to competitor ad research, an ad teardown, a competitive or category analysis of ads, what ads a named brand runs, or what is working and what nobody has tried. Research only: it writes a ledger, the per-ad teardowns and an analysis.","excludes":["Deciding what to make next from the findings is campaign planning.","Writing ad copy, generating an image or video ad, or rebuilding a competitor's ad with the user's own product.","The ads the user's own company runs are the own-ads audit.","Only naming who the competitors are, with no ads read, is the competitor list.","Spend, reach or results of an ad: the public library publishes none of it."]}]
tools: [{"name":"list_research_sources","purpose":"List every research platform, endpoint, params, accepted values and per-call cost from the server's own catalog. No vendor call, no spend.","required":true},{"name":"social_research","purpose":"Read Meta's ad library (`search_companies`, `company_ads`, `search_ads`) through the research provider (the provider's API with the user's own key, SuperCMO's proxy with the managed key). The advertiser name or page id and the filters go out. Every call is billed, including one that returns nothing. Each response is written to a JSON file in a temporary run directory, and the tool sets aside an output folder under `./supercmo-media/competitor-research/`.","required":true},{"name":"video_analysis","purpose":"Send up to ten ad video URLs per call, each with the teardown prompt, to the vision provider (Gemini with the user's own key, SuperCMO's proxy with the managed key); text comes back. One billed call per ad.","required":true},{"name":"image_analysis","purpose":"Send up to ten ad image URLs per call, each with the teardown prompt, to the vision provider; text comes back. One billed call per ad.","required":true},{"name":"url_extraction","purpose":"Only on the discovery route of step 1: read the user's own website through the page-reading provider to learn what they sell in their own words. Billed per call.","required":false},{"name":"web-fetch","purpose":"Only when a competitor came as a website with no name: read the site to take the brand name off it. The source names no tool for this.","required":false},{"name":"shell","purpose":"Run the packaged `build_ledger.py` (Python 3, standard library only) over the saved responses; it writes `ledger.md` into the run's output folder and calls no network.","required":true},{"name":"file-access","purpose":"Read the packaged references and `competitors.md` and `brand.md` in `./supercmo-company`; write `per-ad-teardowns.md` and `ad-set-analysis.md` into the run's folder; write a competitor's domain into `competitors.md` in place of \"website unconfirmed\".","required":true}]
hooks: []
conflicts: []
reads: ["competitors", "brand_profile"]
resumable: true
---

# Competitor Ads Research

Analyzes what competitors advertise, works out what is holding and maps what the category covers. Research only: nothing is generated, posted or planned here. `$SK` below is `<package_root>/scripts/supercmo-skills/skills/researching-competitor-ads`. The packaged original, `$SK/SKILL.source.md`, is the full version of this method and wins where this body differs from it, except for the changes listed in the Sources section.

## Behavior

1. **Settle who the competitors are.** Three ways, tried in order; stop at the first that works.
   - Read them from `competitors.md` in `./supercmo-company`. Where it is absent or empty, move on.
   - Ask the user for a name and a website for each competitor.
   - Find candidates, only where the user does not know: call `url_extraction` on the user's own website to learn what they sell in their own words, then `social_research` on `meta_ad_library` / `search_ads` with those words. Show a plain list of the advertiser names with the number of ads each appeared on, most ads first, and nothing else; ask which are real competitors.

   You need a name for each competitor, and a website where there is one: step 3 uses the domain to prove the ads came from the right company. A competitor saved as "website unconfirmed" needs no question.
2. **Scope the run.** Ask once, in a single message, always with a free-text way out. Skip whatever the brief already answers.
   - The country the ads run in, when the brief names no market and the user's own site implies none: offer the likely markets and a way to type another.
   - How deep to go, when the brief does not say: offer the quick scan first and recommend it; say a detailed analysis watches many more ads per competitor and costs accordingly.
   - What they want to learn, optional, and only where the brief says nothing about what the research is for: one open field, no options.
   - Take whatever the brief says they are after, in their own words, and do not ask again; the analysis closes by answering those words.
   - Nothing given and nothing answered: run it neutrally, with a quick scan, the market the user's own site sells to, and a report that says no goal was set. Say in one sentence what you took and keep going.
   - Every number is per competitor, so a run costs that times the number of competitors. The script holds and enforces them; pass it the depth and do not re-count.

     | Depth | Ads kept, live / stopped | Ads watched, live / stopped |
     | --- | --- | --- |
     | Quick scan | 30 / 30 | 4 / 2 |
     | Detailed analysis | 60 / 60 | 20 / 20 |
3. **Pull each competitor's ads.** Open `$SK/references/pulling-competitor-ads.md` and follow it. What every run needs from it:
   - Call `list_research_sources` once, with no query, and read each endpoint's params and `accepted_values` there. Send `trim: true` on every pull; it defaults to `false`, and the ledger script refuses that shape.
   - Never pull by `companyName`. Resolve every competitor's page id with `search_companies` before the first `company_ads` pull, then check the first page of ads against the competitor's domain and the advertiser name on each ad.
   - Pull the live set (`status: "ACTIVE"`, `sort_by: "total_impressions"`, paging with the cursor until the long-runners appear or the depth cap is reached) and the stopped set (`status: "INACTIVE"`) separately, and keep them apart.
   - Every pull is written to a response file whose path comes back in `saved.path`. Note that file's directory: it is step 4's only input. Take the next page's cursor from `saved.cursor`, and keep `saved.output_dir`. Do not take the ads apart yourself.
   - Every call is billed, including one that returns nothing. Where the params are uncertain, send `dry_run: true` once: it spends nothing.
4. **Build the ledger.** Run the script by its full path, not from inside the skill's folder:

   `python <package_root>/scripts/supercmo-skills/skills/researching-competitor-ads/scripts/build_ledger.py <responses-dir> --depth <quick|detailed> --out <saved.output_dir>`

   `--depth` is what step 2 settled. `--out` is `saved.output_dir`, the same on every response of the run; every file this run produces goes in that folder. Read `ledger.md`. Say in one line how many ads are in the ledger and how many are marked to watch, then carry on without stopping for approval. The cap lines at the top of the file go into the analysis's coverage section verbatim.
5. **Watch the ads.** Open `$SK/references/reading-one-ad.md` and send its video prompt or its image prompt verbatim as each entry's `prompt`. `ledger.md`'s **Watch these** section lists each ad's `ref` and media URL, split into videos and stills. Send them in batches of at most ten: `video_analysis` for the videos, `image_analysis` for the stills.
   - Write each teardown to `per-ad-teardowns.md` in the run's folder as its batch comes back: the `ref` as a heading with the ad's ad-library link beside it, then the teardown verbatim.
   - Never watch the same `ref` twice, and never watch an ad the ledger did not mark.
6. **Read the set and write the analysis.** Open `$SK/references/reading-the-set.md` and follow it; it writes `ad-set-analysis.md` into the run's folder.
   - Name the patterns from the teardowns, then check them against the ledger, citing `ref`s and counts. A claim with no `ref`s behind it does not go in.
   - Analyze the whole ledger, not only the watched ads: run-length distribution, format mix and campaign structure come from every row. Only findings about how an ad is built come from the teardowns, counted over the ads actually read. Never quote one population as a share of the other.
   - The watched ads are each competitor's longest-running, live and stopped taken separately: a sample of the long end. A claim about what a competitor is trying now rests on metadata and copy.
   - How much is enough: five or more ads behind any pattern; at least 25 live ads for that competitor before quoting a share; more than one competitor before calling anything a category norm; every count says what it is out of. Run length is the only performance proxy and is named as a proxy every time.
7. **Hand it over.** The run's folder holds `ledger.md`, `per-ad-teardowns.md` and `ad-set-analysis.md`. Open the reply by answering the user's question in their words. If they never asked for anything specific, give what the category covers: the patterns that dominate, each with its counts, and the space nobody runs. Back the answer with the two or three findings it rests on, each with its count and `ref`s. Nothing else from the analysis goes in the reply. Close with the folder.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `competitor_ads_report` as one JSON string: the run's folder and the paths of its three files, the competitors covered with the page each was pulled from, the market and the depth, how many ads the ledger holds and how many were watched, what came back empty or unwatched, and the answer given with its findings, counts and `ref`s. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **`error: "no_provider_configured"` on any tool**: relay the tool's `hint` (the user must set their key).
- **A pull comes back empty under the market filter**: record it as empty for that market. Do not re-pull without `country`, and never widen a filter to fill a gap; "When a pull comes back short" in the pulling reference covers the cases.
- **"Website unconfirmed"**: accept the page where what its ads sell matches what `brand.md` says the brand sells; where its ads link to the competitor's own site, write that domain into `competitors.md` in its place.
- **Script and watch failures**: open "Edge cases" in the original when `build_ledger.py` says a response is unprojected, holds a competitor this run never asked about or reports fewer ads than were pulled, and when `video_analysis` rejects a clip as too large or a creative cannot be fetched (record that `ref` as unwatched and name it in the coverage).
- **`url_extraction` is not available**, or discovery returns advertisers unrelated to the category: drop the discovery route and ask the user. **A website with no name**: take the brand name off the site and carry on.

## Checks

- **pages_pulled_by_proven_id**: every `company_ads` pull used a page id resolved through `search_companies`, with `trim: true`, and the page was checked against the competitor's domain and advertiser name (or, for "website unconfirmed", against what the brand sells).
- **run_folder_holds_three_files**: `ledger.md`, `per-ad-teardowns.md` and `ad-set-analysis.md` are in the run's `saved.output_dir`, and the ledger was built by the script with the depth step 2 settled.
- **only_marked_ads_watched_once**: every teardown belongs to a `ref` the ledger marked to watch, no `ref` was watched twice, and a `ref` that could not be watched is recorded as unwatched.
- **claims_cite_refs_and_population**: each finding in the analysis and in the reply cites `ref`s and says what its count is out of, and nothing presents spend, reach or results as fact.

## Sources

- AI intent mapping: researching-competitor-ads → ads.competitor-ads-research.
- Source: supercmo-skills (SupercmoHQ/superCMO-skills@3bf78a42, release v0.1.27) — `skills/researching-competitor-ads/SKILL.md`, `references/pulling-competitor-ads.md`, `references/reading-one-ad.md`, `references/reading-the-set.md`, `scripts/build_ledger.py`, and for the tools `scripts/supercmo_skills/mcp/tools/research.py`, `mcp/tools/analyze.py`, `tool_specs.py`, `catalog.py` and `research_shape.py`, packaged unchanged under `<package_root>/scripts/supercmo-skills/` (the skill file as `SKILL.source.md`).
- Changes for coexistence (ADR-0017):
  - The source's frontmatter triggers ("Use when the user wants competitor ads researched ...") are not applied: they would start the original as a skill, and the coordinator classifies by meaning.
  - `python3 <skill-dir>/scripts/build_ledger.py` becomes `python` with the packaged path: the skill directory of the original does not exist on a host of this package.
  - Nothing else that the source prescribes was changed. The source's statement that deciding what to make next is `planning-campaigns`' job is carried in the intent's `excludes`.
- Runtime dependency: Python 3 for `build_ledger.py` (standard library only; `--help` gives the full usage). Keys for the server's tools, delivered as media setup describes: the managed key, or the user's own `GEMINI_API_KEY` (`video_analysis`, `image_analysis`), `FIRECRAWL_API_KEY` (`url_extraction`) and, for `social_research`, the research provider's key (`SCRAPECREATORS_API_KEY` in the server's registry, absent from the setup skill's key table). The source gives no other install method.
- Unresolved in the source: `reading-the-set.md` asks for "the path to the local copy of its creative" beside each `ref`, and no step of the selected files downloads one. The skill tells the agent to take a brand name off a site and names no tool for it.
- Hooks: the selected files define none.
