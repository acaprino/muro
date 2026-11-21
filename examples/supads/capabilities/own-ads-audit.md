---
id: own-ads-audit
role: ad-audit
when: —
after: []
outputs: ["own_ads_report"]
checks: ["own_page_pulled_by_proven_id", "run_folder_holds_three_files", "only_marked_ads_watched_once", "claims_cite_refs_and_population"]
check_conditions: {"run_folder_holds_three_files": "The pull returned ads, so a ledger was built; not when the brand has no page or no ads in the market.", "only_marked_ads_watched_once": "The pull returned ads, so a ledger was built; not when the brand has no page or no ads in the market.", "claims_cite_refs_and_population": "The pull returned ads, so a ledger was built; not when the brand has no page or no ads in the market."}
intents: [{"id":"ads.own-ads-audit","description":"Audit the ads the user's own company is running, read from Meta's public ad library: what is live now, what it already stopped and which ads have run longest. A vision model watches the video ads and reads the image ads, and the audit maps what the account already covers (angles, hooks, formats, offers), what was dropped and how fast, and which long-runners have nothing newer beside them. It applies when the user wants their own ads audited, wants to know what they are running, which of their ads is holding, what they already cover, or whether anything is going stale. Research only: it writes a ledger, the per-ad teardowns and an audit.","excludes":["Competitors' ads are competitor ads research.","Deciding what to make next is campaign planning.","Spend, CPA, ROAS, CTR or any real result: the public library carries none of it, only run lengths.","The brand's identity, a product's facts, or generating or changing any ad."]}]
tools: [{"name":"list_research_sources","purpose":"List every research platform, endpoint, params, accepted values and per-call cost from the server's own catalog. No vendor call, no spend.","required":true},{"name":"social_research","purpose":"Read Meta's ad library (`search_companies`, `company_ads`) for the user's own brand through the research provider (the provider's API with the user's own key, SuperCMO's proxy with the managed key). The brand name or page id and the filters go out. Every call is billed, including one that returns nothing. Each response is written to a JSON file in a temporary run directory, and the tool sets aside an output folder under `./supercmo-media/competitor-research/`.","required":true},{"name":"video_analysis","purpose":"Send up to ten ad video URLs per call, each with the teardown prompt, to the vision provider (Gemini with the user's own key, SuperCMO's proxy with the managed key); text comes back. One billed call per ad.","required":true},{"name":"image_analysis","purpose":"Send up to ten ad image URLs per call, each with the teardown prompt, to the vision provider; text comes back. One billed call per ad.","required":true},{"name":"web-fetch","purpose":"Only when the user gave a website and no brand name: read the site to take the brand name off it. The source names no tool for this.","required":false},{"name":"shell","purpose":"Run the packaged `build_ledger.py` (Python 3, standard library only) over the saved responses; it writes `ledger.md` into the run's output folder and calls no network.","required":true},{"name":"file-access","purpose":"Read the packaged references and the brand profile in `./supercmo-company`; write `per-ad-teardowns.md` and `own-ads-audit.md` into the run's folder.","required":true}]
hooks: []
conflicts: []
reads: ["brand_profile", "company_profile"]
resumable: true
---

# Own Ads Audit

Audits what a company is advertising itself, works out what is holding and maps what it already covers. Research only: nothing is generated, posted or planned here. It reads the public ad library, so it carries run lengths, not spend or results. `$SK` below is `<package_root>/scripts/supercmo-skills/skills/analyzing-own-ads`. The packaged original, `$SK/SKILL.source.md`, is the full version of this method and wins where this body differs from it, except for the changes listed in the Sources section.

## Behavior

1. **Settle whose page this is.** You need a brand name and a website. Read them from the brand profile in `./supercmo-company`, where one exists. Where it does not, ask the user for whichever is missing. A website but no name: take the brand name off the site and carry on.
2. **Scope the run.** Ask once, in a single message, always with a free-text way out. Skip whatever the brief already answers.
   - The country the ads run in, when the brief names no market and the user's own site implies none: offer the likely markets and a way to type another.
   - How deep to go, when the brief does not say: offer the quick scan first and recommend it; say a detailed audit doubles what is watched and costs accordingly.
   - What they want to learn, optional, and only where the brief says nothing about what the audit is for: one open field, no options.
   - Take whatever the brief says they are after, in their own words, and do not ask again; the audit closes by answering those words.
   - Nothing given and nothing answered: run it neutrally, with a quick scan, the market the user's own site sells to, and an audit that says no goal was set. Say in one sentence what you took and keep going.
   - The script holds these numbers and enforces them; pass it the depth and do not re-count.

     | Depth | Ads kept, live / stopped | Ads watched, live / stopped |
     | --- | --- | --- |
     | Quick scan | 30 / 30 | 10 / 10 |
     | Detailed audit | 60 / 60 | 20 / 20 |
3. **Pull the ads.** Open `$SK/references/pulling-own-ads.md` and follow it. What every run needs from it:
   - Call `list_research_sources` once, with no query, and read each endpoint's params and `accepted_values` there. Send `trim: true` on every pull; it defaults to `false`, and the ledger script refuses that shape.
   - Never pull by `companyName`. Resolve the page id with `search_companies`, then check the first page of ads against the brand's own domain and the advertiser name on each ad. Links that point at a retailer stocking the brand mean a reseller's page: say so and go back to the candidates.
   - Pull the live set (`status: "ACTIVE"`, `sort_by: "total_impressions"`, paging with the cursor until the long-runners appear or the depth cap is reached) and the stopped set (`status: "INACTIVE"`) separately, and keep them apart.
   - Every pull is written to a response file whose path comes back in `saved.path`. Note that file's directory: it is step 4's only input. Take the next page's cursor from `saved.cursor`, and keep `saved.output_dir`. Do not take the ads apart yourself.
   - Every call is billed, including one that returns nothing. Where the params are uncertain, send `dry_run: true` once: it spends nothing.
4. **Build the ledger.** Run this skill's own script by its full path, not from inside the skill's folder (its watch allowances differ from the competitor research script's):

   `python <package_root>/scripts/supercmo-skills/skills/analyzing-own-ads/scripts/build_ledger.py <responses-dir> --depth <quick|detailed> --out <saved.output_dir>`

   `--depth` is what step 2 settled. `--out` is `saved.output_dir`, the same on every response of the run; every file this run produces goes in that folder. Read `ledger.md`. Say in one line how many ads are in the ledger and how many are marked to watch, then carry on without stopping for approval. The cap lines at the top of the file go into the audit's coverage section verbatim.
5. **Watch the ads.** Open `$SK/references/reading-one-ad.md` and send its video prompt or its image prompt verbatim as each entry's `prompt`. `ledger.md`'s **Watch these** section lists each ad's `ref` and media URL, split into videos and stills. Send them in batches of at most ten: `video_analysis` for the videos, `image_analysis` for the stills.
   - Write each teardown to `per-ad-teardowns.md` in the run's folder as its batch comes back: the `ref` as a heading with the ad's ad-library link beside it, then the teardown verbatim.
   - Never watch the same `ref` twice, and never watch an ad the ledger did not mark.
6. **Read the set and write the audit.** Open `$SK/references/reading-own-ads.md` and follow it; it writes `own-ads-audit.md` into the run's folder and closes without recommending.
   - Name the patterns from the teardowns, then check them against the ledger, citing `ref`s and counts. A claim with no `ref`s behind it does not go in.
   - Audit the whole ledger, not only the watched ads: run-length distribution, format mix and campaign structure come from every row. Only findings about how an ad is built come from the teardowns, counted over the ads actually read. Never quote one population as a share of the other.
   - The watched ads are the longest-running, live and stopped taken separately: a sample of the long end. A claim about what the account is trying now rests on metadata and copy.
   - How much is enough: five or more ads behind any pattern; at least 25 live ads before quoting a share; every count says what it is out of. An axis carrying one ad is thin, not covered. Run length is the only performance proxy and is named as a proxy every time.
7. **Hand it over.** The run's folder holds `ledger.md`, `per-ad-teardowns.md` and `own-ads-audit.md`. Open the reply by answering the user's question in their words. If they never asked for anything specific, give what is covered: the axes the account already runs, with counts, and the ones with nothing on them. Back the answer with the two or three findings it rests on, each with its count and `ref`s. Nothing else from the audit goes in the reply. Close with the folder.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `own_ads_report` as one JSON string: the run's folder and the paths of its three files, the brand and the page it was pulled from, the market and the depth, how many ads the ledger holds and how many were watched, what came back empty or unwatched, and the answer given with its findings, counts and `ref`s. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **`error: "no_provider_configured"` on any tool**: relay the tool's `hint` (the user must set their key).
- **No page, or no ads at all, in this market**: the brand is not advertising there. That is the audit; say so. A pull that comes back empty under the market filter is recorded as empty for that market; do not re-pull without `country`, and never widen a filter to fill a gap.
- **`search_companies` returns a reseller or a similarly-named business**: show the candidates and let the user pick. A misattributed own ad reports creative they have never run.
- **The user asks for spend, CPA, ROAS, CTR or any real result**: not here. The public library carries none of it. Say so plainly and offer the run-length proxy instead.
- **Script and watch failures**: open "Edge cases" in the original when `build_ledger.py` says a response is unprojected, holds an advertiser this run never asked about or reports fewer ads than were pulled, and when `video_analysis` rejects a clip as too large or a creative cannot be fetched (record that `ref` as unwatched and name it in the coverage).
- The run's folder sits under `competitor-research/` in the media output folder for this audit too: that is where the tool puts every research run.

## Checks

- **own_page_pulled_by_proven_id**: every `company_ads` pull used a page id resolved through `search_companies`, with `trim: true`, and the page was checked against the brand's own domain and advertiser name; a reseller's page was not audited as the brand's.
- **run_folder_holds_three_files**: `ledger.md`, `per-ad-teardowns.md` and `own-ads-audit.md` are in the run's `saved.output_dir`, and the ledger was built by this skill's script with the depth step 2 settled.
- **only_marked_ads_watched_once**: every teardown belongs to a `ref` the ledger marked to watch, no `ref` was watched twice, and a `ref` that could not be watched is recorded as unwatched.
- **claims_cite_refs_and_population**: each finding in the audit and in the reply cites `ref`s and says what its count is out of, and nothing presents spend, reach or results as fact.

## Sources

- AI intent mapping: analyzing-own-ads → ads.own-ads-audit.
- Source: supercmo-skills (SupercmoHQ/superCMO-skills@3bf78a42, release v0.1.27) — `skills/analyzing-own-ads/SKILL.md`, `references/pulling-own-ads.md`, `references/reading-one-ad.md`, `references/reading-own-ads.md`, `scripts/build_ledger.py`, and for the tools `scripts/supercmo_skills/mcp/tools/research.py`, `mcp/tools/analyze.py`, `tool_specs.py`, `catalog.py` and `research_shape.py`, packaged unchanged under `<package_root>/scripts/supercmo-skills/` (the skill file as `SKILL.source.md`).
- Changes for coexistence (ADR-0017):
  - The source's frontmatter triggers ("Use when the user wants their own ads audited ...") are not applied: they would start the original as a skill, and the coordinator classifies by meaning.
  - `python3 <skill-dir>/scripts/build_ledger.py` becomes `python` with the packaged path: the skill directory of the original does not exist on a host of this package.
  - Nothing else that the source prescribes was changed. The source's two boundaries (competitors' ads are `researching-competitor-ads`, deciding what to make next is `planning-campaigns`) are carried in the intent's `excludes`.
- Runtime dependency: Python 3 for `build_ledger.py` (standard library only; `--help` gives the full usage). Keys for the server's tools, delivered as media setup describes: the managed key, or the user's own `GEMINI_API_KEY` (`video_analysis`, `image_analysis`) and, for `social_research`, the research provider's key (`SCRAPECREATORS_API_KEY` in the server's registry, absent from the setup skill's key table). The source gives no other install method.
- Unresolved in the source: `reading-own-ads.md` asks for "the path to the local copy of its creative" beside each `ref`, and no step of the selected files downloads one. The skill tells the agent to take the brand name off the site and names no tool for it. Step 1 reads "the brand profile" without naming the file; `brand.md` is the file the brand analysis writes there.
- Hooks: the selected files define none.
