---
id: brand-onboarding
role: onboarding
when: —
after: []
outputs: ["company_profile"]
checks: ["brand_file_in_profile", "one_summary_no_questions", "nothing_invented_in_profile"]
check_conditions: {"brand_file_in_profile": "The run was not stopped by a site that could not be read or by the user's request to skip.", "one_summary_no_questions": "A website was analyzed in this run, or a stored profile was summarized; not the no-website case, an unreadable site or a skip."}
intents: [{"id":"ads.brand-onboarding","description":"Set a brand up for the first time from one website: work out the brand, find who it competes with, and save both to the company profile in `./supercmo-company` that later work reads. It applies when the user wants to onboard, get started with their brand, or set up their brand or company profile; a user with no website onboards from a short description instead.","excludes":["Only analyzing a brand from its website, with no competitor list and no first-time setup, is brand analysis.","Setting up keys or checking which media tools are ready is media setup.","Researching the ads competitors run, planning a campaign or generating creative."]}]
tools: [{"name":"url_extraction","purpose":"Read the brand's homepage through the page-reading provider (Firecrawl with the user's own key, SuperCMO's proxy with the managed key): the URL goes out and the page text, its colours, fonts and logo, and a screenshot link come back. Also used to learn what the brand sells for the competitor search. Every call is billed, including one that returns nothing.","required":true},{"name":"image_analysis","purpose":"Send the homepage screenshot link and a prompt to the vision provider (Gemini with the user's own key, SuperCMO's proxy with the managed key); text comes back. Each picture is billed.","required":true},{"name":"web-search","purpose":"Search the web for the alternatives buyers compare the brand against; the brand name and category words go to the host's search.","required":true},{"name":"social_research","purpose":"Only where the web search runs thin: keyword search of Meta's ad library through the research provider. It spends credits.","required":false},{"name":"file-access","purpose":"Read the three packaged originals; read, write and patch `brand.md` and `competitors.md` in `./supercmo-company`, creating the folder where needed.","required":true}]
hooks: []
conflicts: []
---

# Brand Onboarding

Turns one website into a working brand profile, then gives the user their first next steps. The profile is two files in the user's project, `./supercmo-company/brand.md` and `./supercmo-company/competitors.md`, written with the host's file tool; no server tool writes them. `$SK` below is `<package_root>/scripts/supercmo-skills/skills`. The packaged original, `$SK/onboarding-user/SKILL.source.md`, is the full version of this method and wins where this body differs from it, except for the changes listed in the Sources section.

## Behavior

1. **Get the website.** First read `brand.md` in `./supercmo-company`. Where it already holds a brand, follow "already onboarded" under Specifics. Otherwise ask for the user's website, unless the conversation already carries it.
   - **No website.** The user still onboards. Ask what the brand is called, what it sells and who buys it, plus anything they want to add about how it sounds or what sets it apart. A short answer is fine. Write what they give into the matching sections of `brand.md` in `./supercmo-company`, leave the sections they did not cover marked `unconfirmed — needs user input`, then skip the rest of the steps.
2. **Analyze the brand.** First load everything the next two steps use in one step, not one after another: `$SK/analyzing-brand/SKILL.source.md`, `$SK/analyzing-brand/references/reading-the-brand.md` and `$SK/identifying-competitors/SKILL.source.md`.
   - Then run the brand analysis as its original lays it out, in quick mode, with the website, as a run that onboarding is running: it asks the user nothing and skips its own hand-over.
   - It writes `./supercmo-company/brand.md` itself. Do not copy or re-save the file; read it back where the summary needs its contents.
3. **Identify the competitors.** Run the competitor search as its original lays it out, with the brand's name, its website and what it sells, as a run that skips confirmation and that onboarding is running: it saves the shortlist without pausing and skips its own hand-over.
   - It writes `./supercmo-company/competitors.md` itself. Do not copy or re-save it.
4. **Show what was written.** One summary for the whole run, compact, not the files read back:
   - the brand: its name and what it sells, in a line;
   - the voice, in a sentence;
   - the audience, as the site evidenced it;
   - the competitors, as a plain list;
   - where a section stayed unconfirmed, what the site did not show, in one line.
5. **Ask the user nothing.** The profile is complete as written and the competitors are your pick: do not call them a draft or unconfirmed, and do not ask for corrections. Say they can change anything on the Brand page, or by telling you. Where they do, apply each change directly to the file in `./supercmo-company`. Corrections are edits: patch the section that changed. Do not re-analyze the site and do not re-run the analysis or the search to apply a correction.
6. **Suggest what to do next.** Close with this list:
   - **Create a UGC video**: a creator-style video for your product.
   - **Create a product ad video**: a produced ad or commercial for your product.
   - **Generate product photos**: packshots and lifestyle shots from one product photo.
   - **Research competitor ads**: what's working in your category, and what nobody runs.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `company_profile` as one JSON string: the paths of `brand.md` and `competitors.md`, the brand's name, website and what it sells, the competitors' names and websites, the sections left unconfirmed, and what could not run (an unreadable site, a search that named nobody, a skip). For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **`error: "no_provider_configured"` on any tool**: relay the tool's `hint` (the user must set their key).
- **Already onboarded** (`brand.md` exists in `./supercmo-company`): do not re-run the analysis and do not ask anything. Summarize what is stored, say it can be changed on the Brand page, and close with step 6's list. Still run step 3 where `competitors.md` is missing: a half-finished onboarding is completed, not restarted.
- **Run it again** only for a different website, or where the user asks to redo it. Then have the brand analysis re-analyze. Where it is a different brand, replace `brand.md` and `competitors.md` rather than patching or merging them: the old brand's proof, voice and competitors must not carry over.
- **The site cannot be read** (the brand analysis reports a failed read, a site that will not load, or a site that gave nothing usable): stop there. Do not run step 3, and do not guess the brand from its name. Ask once for a working URL, and say they can describe the brand instead (the no-website case of step 1).
- **The competitor search names nobody**: carry on with the steps that can run, say plainly what is missing, and still give the summary and the next steps.
- **The user asks to skip**: stop, and say the brand can be set up any time by asking. Do not leave a partial profile behind.

## Checks

- **brand_file_in_profile**: `./supercmo-company/brand.md` holds this brand, written by this run's analysis, from the user's description, or already there; it was not copied or saved a second time.
- **one_summary_no_questions**: the reply carries one compact summary (brand and what it sells, voice, audience, competitors, what stayed unconfirmed) and asks the user nothing about the profile.
- **nothing_invented_in_profile**: no section of the profile holds a fact that neither the site nor the user gave; sections without evidence read `unconfirmed — needs user input`.

## Sources

- AI intent mapping: onboarding-user → ads.brand-onboarding.
- Source: supercmo-skills (SupercmoHQ/superCMO-skills@3bf78a42, release v0.1.27) — `skills/onboarding-user/SKILL.md`, and the three files its Step 2 loads: `skills/analyzing-brand/SKILL.md`, `skills/analyzing-brand/references/reading-the-brand.md`, `skills/identifying-competitors/SKILL.md`, packaged unchanged under `<package_root>/scripts/supercmo-skills/` (each skill file as `SKILL.source.md`).
- Changes for coexistence (ADR-0017):
  - The source's frontmatter triggers ("Use when the user wants to onboard ...") are not applied: they would start the original as a skill, and the coordinator classifies by meaning.
  - "Trigger the `analyzing-brand` skill" and "trigger the `identifying-competitors` skill" become running those two procedures from their packaged originals inside this step, with the same instructions the source passes (quick mode, onboarding is running it, skip confirmation): triggering a skill is activation that competes with the coordinator.
  - Nothing else that the source prescribes was changed.
- Runtime dependency: keys for the server's tools, delivered as media setup describes: the managed key, or the user's own `FIRECRAWL_API_KEY` (`url_extraction`) and `GEMINI_API_KEY` (`image_analysis`); `social_research` needs the managed key or the research provider's key. A web search tool of the host. The source gives no install method beyond the keys.
- Unresolved in the source: "the Brand page" is named here and in the brand analysis and is defined in none of the selected files. The words are carried as the source says them.
- Hooks: the selected files define none.
