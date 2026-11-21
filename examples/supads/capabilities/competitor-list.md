---
id: competitor-list
role: competitor-research
when: —
after: []
outputs: ["competitors"]
checks: ["every_candidate_has_source", "known_list_not_searched_again", "list_saved_as_confirmed"]
check_conditions: {"list_saved_as_confirmed": "A search ran in this step and named at least one competitor; the list was not handed back as already known."}
intents: [{"id":"ads.competitor-identification","description":"Find out who a brand competes with: learn what it sells, search the web for the alternatives buyers compare it against, propose a shortlist of names and websites with a source for each, confirm it with the user and save it to `./supercmo-company/competitors.md`. It applies when the user asks who their competitors are, wants a competitor list found or refreshed, or other work needs the competitors named first.","excludes":["Researching the ads those competitors run is competitor ads research; this stops at names and websites.","Analyzing the user's own brand, or first-time onboarding of the whole company profile.","Positioning, pricing or any comparison beyond who the competitors are."]}]
tools: [{"name":"web-search","purpose":"Search the web with the brand's name and its category and audience words for the alternatives buyers compare it against, and for a competitor's official site. The queries go to the host's search.","required":true},{"name":"url_extraction","purpose":"Read the brand's website through the page-reading provider (Firecrawl with the user's own key, SuperCMO's proxy with the managed key) to learn what it sells; skipped where that is already known. Billed per call.","required":false},{"name":"social_research","purpose":"Only where the web search runs thin: keyword search of Meta's ad library (`meta_ad_library` / `search_ads`) through the research provider with the category words, and `country` where known. It spends credits and writes each response to a file.","required":false},{"name":"file-access","purpose":"Read `brand.md` and `competitors.md` in `./supercmo-company`; write or merge `competitors.md`, creating the folder where it does not exist.","required":true}]
hooks: []
conflicts: []
reads: ["brand_profile", "company_profile"]
---

# Competitor List

Finds who a brand competes with, confirms the list and saves it: names and websites only. The list is `./supercmo-company/competitors.md`, the competitor half of the company profile, written with the host's file tool. The packaged original, `<package_root>/scripts/supercmo-skills/skills/identifying-competitors/SKILL.source.md`, is the full version of this method and wins where this body differs from it, except for the changes listed in the Sources section.

## Behavior

1. **Check whether the competitors are already known.** Read `competitors.md` in `./supercmo-company`, and `brand.md` for the brand's name, website and what it sells. Where `competitors.md` already holds this brand's competitors, hand them back and stop: re-searching bills again and tells the user nothing new. Carry on where it is missing, where it is a different brand, or where the user asked to refresh.
2. **Settle the brand.** You need a brand name and a website. Where you do not already have them, ask the user for whichever is missing. Do not proceed without the website.
3. **Learn what the brand sells.** Call `url_extraction` on the website. Skip this where you already know.
4. **Find the candidates.** Search the web with queries like:
   - `alternatives to <brand>`: how buyers who already know the brand shop around;
   - `best <category> for <audience>`: how buyers who do not yet know the brand find the category.

   Take the competitor names from the answer and the source it drew from. Take each website from a result, or from an ad's `landing_url`, that links to the competitor's own site, not a store, a marketplace or a social page. Where a result names a competitor without its site, search its name for its official site. Where nothing shows one, write "website unconfirmed", never a domain from memory. Where a query returns nothing, vary the category words and search again.
   - **Every candidate needs a source**: the search result that named it. Do not add competitors from memory.
   - **Where search runs thin** (a niche category, a non-English market), `social_research` on `meta_ad_library` / `search_ads` with the category words shows who actually advertises in the space. Pass `country` for the market the brand sells in, where its page or `brand.md` shows it; where nothing does, leave it out. It spends credits: say so and wait for a yes. Under a brief that skips confirmation, run it without asking.
5. **Confirm.** Show the 3 to 5 top candidates in one message: name, website, and one line on why it competes. Ask which are real, which to drop, and who is missing. Where the brief says to skip confirmation, do not stop to show the candidates or ask: save the shortlist without waiting.
6. **Hand it over.** Write the confirmed list to `competitors.md` in `./supercmo-company`: a heading naming the brand, then one line each, the name then its website. Create the folder where it does not exist.
   - Where `competitors.md` already exists for this brand, merge into it: keep the competitors already listed unless the user dropped them, and add the new ones. Where it holds another brand's competitors, replace it.
   - Close by showing the list and giving the path.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `competitors` as one JSON string: the path of `competitors.md`, the brand it is for and the market where one was chosen, each competitor's name and website (or "website unconfirmed") with the source that named it, the candidates dropped and why, and whether the list was confirmed, saved without confirmation or handed back as already known. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **`error: "no_provider_configured"` on any tool**: relay the tool's `hint` (the user must set their key).
- **A candidate is a retailer, a marketplace or a comparison site**: not a competitor unless the user says so. Say why you dropped it.
- **The brand sells in several countries**: competitors differ by market. Ask which one this list is for rather than mixing them; under a brief that skips confirmation, take the market the site leads with and say which.
- **The user wants those competitors' ads researched**: that is competitor ads research, a separate capability. Say which competitors this list holds; do not start the ad research here.
- **Run from inside another capability's step** (onboarding): the original's rule applies. Skip the closing hand-over of step 6; the calling step gives the reply.

## Checks

- **every_candidate_has_source**: each competitor shown or saved traces to a search result or an ad that named it; none came from memory, and a site nothing showed is written "website unconfirmed".
- **known_list_not_searched_again**: where `competitors.md` already held this brand's competitors and no refresh was asked, they were handed back and no search or billed call was made.
- **list_saved_as_confirmed**: `./supercmo-company/competitors.md` has a heading naming the brand and one line per competitor (name, then website), holds what the user confirmed (or the shortlist, under a brief that skips confirmation), and was merged where it already existed for this brand.

## Sources

- AI intent mapping: identifying-competitors → ads.competitor-identification.
- Source: supercmo-skills (SupercmoHQ/superCMO-skills@3bf78a42, release v0.1.27) — `skills/identifying-competitors/SKILL.md`, and for the tools `scripts/supercmo_skills/mcp/tools/extract.py`, `mcp/tools/research.py`, `tool_specs.py` and `catalog.py` (the research sources), packaged unchanged under `<package_root>/scripts/supercmo-skills/` (the skill file as `SKILL.source.md`).
- Changes for coexistence (ADR-0017):
  - The source's frontmatter triggers ("Use when the user asks who their competitors are ...") are not applied: they would start the original as a skill, and the coordinator classifies by meaning.
  - "The user wants those competitors' ads researched: that is `researching-competitor-ads`. Hand over and say which competitors you used" is not followed as a hand-over from inside this step: it is routing between the source's skills, which competes with the coordinator. The step says which competitors the list holds, and the boundary is in the intent's `excludes`.
  - Nothing else that the source prescribes was changed.
- Runtime dependency: a web search tool of the host. Keys for the server's tools, delivered as media setup describes: the managed key, or the user's own `FIRECRAWL_API_KEY` (`url_extraction`); `social_research` runs on the managed key or on the research provider's key (`SCRAPECREATORS_API_KEY` in the server's registry, absent from the setup skill's key table). The source gives no other install method.
- Unresolved in the source: the skill says "search the web" and names no tool; the server has no general web search, so the host's own is used. The skill describes the result as "an answer and the source it drew from", which is the shape of whatever search the host has.
- Hooks: the selected files define none.
