---
id: campaign-plan
role: campaign-planning
when: —
after: []
outputs: ["campaign_concepts"]
checks: ["inputs_stated", "every_concept_routed", "no_invented_proof_or_terms", "nothing_built_before_approval"]
intent_checks: {"ads.campaign-plan": ["inputs_stated", "every_concept_routed", "no_invented_proof_or_terms", "nothing_built_before_approval"], "ads.hooks-and-angles": ["no_invented_proof_or_terms", "nothing_built_before_approval"]}
intents: [{"id":"ads.campaign-plan","description":"Decide what ads to make or test next: turn the brand, the product, the account's own running ads and competitor research into campaigns of concepts, each a full description of one ad with its buyer, the bet it tests, the evidence it rests on and its format, tagged with what would build it. It also covers running a whole campaign end to end, from research to finished ads: the plan comes first, the user says which concepts to build, and only those are built.","excludes":["A single ad with no plan behind it goes straight to the capability that produces it.","Researching competitors' ads, auditing the account's own ads, analysing the brand or analysing the product, asked for on their own.","Writing the copy fields of an ad platform is ad copy.","Nothing is generated before the user approves the plan and names the concepts to build."]},{"id":"ads.hooks-and-angles","description":"Answer one planning question in the shape it was asked, such as which hooks or which angle to try next: ranked answers with the reasoning behind each, not a set of full concepts.","excludes":["A full creative plan or campaign concepts is the campaign plan.","Writing the platform copy fields or the spoken script from a chosen hook is ad copy or script work.","Nothing is generated."]}]
tools: [{"name":"file-access","purpose":"Create the run's folder under ./supercmo-files/campaigns/ in the working directory, write concepts.md there and copy into it every file the gathered analyses produced. Read the packaged references and the packaged skill files this procedure opens. Sends nothing by itself.","required":true},{"name":"image_analysis","purpose":"When the plan gathers an input itself (step 3): Send the product photo, or each downloaded candidate image (the local file's bytes), with a prompt to the vision provider (Gemini with the user's own key, SuperCMO's proxy with the managed key); text comes back. At most 10 calls for one product URL; each is billed.","required":false},{"name":"url_extraction","purpose":"When the plan gathers an input itself (step 3): URL mode only: read the product page through the page-reading provider (Firecrawl with the user's own key, SuperCMO's proxy with the managed key). The URL and the prompt go out; structured fields and product-image URLs come back. Billed per call.","required":false},{"name":"shell","purpose":"When the plan gathers an input itself (step 3): URL mode only: download at most 10 candidate images from the store's servers with a browser User-Agent into `./supercmo-files/product-images/<date-time>` in the user's project, and check each file's size.","required":false},{"name":"list_research_sources","purpose":"When the plan gathers an input itself (step 3): List every research platform, endpoint, params, accepted values and per-call cost from the server's own catalog. No vendor call, no spend.","required":false},{"name":"social_research","purpose":"When the plan gathers an input itself (step 3): Read Meta's ad library (`search_companies`, `company_ads`) for the user's own brand through the research provider (the provider's API with the user's own key, SuperCMO's proxy with the managed key). The brand name or page id and the filters go out. Every call is billed, including one that returns nothing. Each response is written to a JSON file in a temporary run directory, and the tool sets aside an output folder under `./supercmo-media/competitor-research/`.","required":false},{"name":"video_analysis","purpose":"When the plan gathers an input itself (step 3): Send up to ten ad video URLs per call, each with the teardown prompt, to the vision provider (Gemini with the user's own key, SuperCMO's proxy with the managed key); text comes back. One billed call per ad.","required":false},{"name":"web-fetch","purpose":"When the plan gathers an input itself (step 3): Only when the user gave a website and no brand name: read the site to take the brand name off it. The source names no tool for this.","required":false}]
hooks: []
conflicts: []
reads: ["product_facts", "brand_profile", "own_ads_report", "competitor_ads_report", "competitors", "company_profile"]
resumable: true
---

# Campaign Plan

Decides what ads to make next, writes each one as a concept a producer can build from directly, and hands the ones the user approves to the capability that builds each. Nothing is generated before the plan is approved: everything up to the plan is planning, and building is a separate decision the user makes at the end, concept by concept. The packaged original, `<package_root>/scripts/supercmo-skills/skills/planning-campaigns/SKILL.source.md`, is the full version of this method and wins where this body differs from it, except for the changes listed in the Sources section. `$SKILLS` below is `<package_root>/scripts/supercmo-skills/skills` and `$REF` is `$SKILLS/planning-campaigns/references`.

## Behavior

1. **Scope the run.** Ask once, in a single message, always with a free-text way out. Skip what the brief already answers. Do not go on without the product.
   - The product, always: a URL or a photo. Where the user names several, ask whether it is one campaign for all of them or one each.
   - The objective, when the brief does not say: offer awareness, consideration and conversion, and a way to type another.
   - The competitors, when the brief names none: a name and a website for each. Where the user does not know, say the research will propose them and confirm before it reads anything.
   - The market, when the brief names none and the site implies none: offer the likely markets and a way to type another.
   - How deep to go, when the brief does not say: offer the quick scan first and recommend it; say the deeper option roughly doubles what is watched, and costs accordingly.
2. **Open the run's folder first**: `campaigns/<date-time>` under `./supercmo-files`. Where a folder for this minute already exists, add `-2`, `-3`, … rather than writing into it. Everything this run produces lives there.
3. **Gather the context.** The plan is built from four inputs. Collect each one; skip one only where the brief already carries what it would return. An input an earlier step of this map already recorded counts as carried: use it and do not run that analysis again. For each of the others, open the named file and run its workflow:
   - the product: `$SKILLS/analyzing-products/SKILL.source.md`, with the URL or photo. It gives what the product is, how it is used and what it can be shown doing;
   - the brand: `$SKILLS/analyzing-brand/SKILL.source.md`, with the brand's website. It gives the voice, the audience, the differentiators and the proof points;
   - our own ads: `$SKILLS/analyzing-own-ads/SKILL.source.md`. It gives what the account already covers, what is holding and what was stopped;
   - competitors' ads: `$SKILLS/researching-competitor-ads/SKILL.source.md`. It gives the category's patterns, what its long-runners share and what nobody runs.
   - Every answer from step 1 goes into the request that starts each workflow (the product, the objective, the competitors, the market, the depth), so it treats its own scoping questions as answered. Where something is still unsettled, have it reported back rather than assumed, and bring it to the user.
   - Each workflow gets its own folder inside the run's folder, named after its skill, and everything it produced goes there: every file, not a chosen few. Where one wrote elsewhere because a tool gave it no location, copy everything across before moving on. Nothing the run rests on is left in a temporary folder.
   - Close the step by saying in one line which of the four inputs the plan is built on and which are absent: skipped, failed or returned empty.
4. **Build the concept list.** Decide how many; do not ask. Up to three campaigns and up to ten concepts in each. Those are ceilings, not targets: build as many as the evidence carries and stop there, saying what ran out. Where the brief asks for a specific number, or for one specific output, honor that instead.
   - Read `$REF/finding-concepts.md` and work through it. It writes the campaigns and their concepts to `concepts.md` in the run's folder. Each concept is the whole handoff a producer builds from: the full description of the ad plus four fields, the buyer, the hypothesis, the evidence and the format. Whether a concept can be produced is not a criterion here.
   - Three rules bind every concept. No invented proof: every statistic, rating, testimonial, award or result comes from the brand profile or the user, quoted as recorded. No invented commercial terms: an offer, price, discount, trial or CTA exists only where the brand profile or the user states it. No claim the product cannot support: the product facts bound what can be argued, and anything the brand profile marked unconfirmed never becomes a hook, a headline or a button.
5. **Route each concept.** Tag each concept in `concepts.md` with the skill that would build it, using `$REF/production-palette.md` alone: do not open or start a producer to route. Every concept gets a route (a specialist, a general generator, or outside the pipeline with a note on how it would get made), and no concept is dropped for being unroutable.
6. **Hand the plan over.**
   - Finish the file: `concepts.md` carries the campaigns with their concepts and routes in order; add a short grounding header saying which inputs the plan is built on. Everything the plan cites is named by a path inside the run's folder or by a link, never by a code that needs a document the folder does not hold.
   - Present it in one message: which inputs the plan is built on, then each campaign with its concepts in order. Close with the path to `concepts.md`.
   - Ask whether to create the assets, and if so which concepts: all, some or none. Say that building is billed. Wait for the answer: an unanswered question is not a yes.
7. **Hand the approved concepts to their producers**, only after the user has named which. Nothing is built inside this step: each kind of asset has its own capability in this package and the coordinator runs one capability per step. For each approved concept, in the plan's order, name the route `concepts.md` gives it and say that it is built as its own step from that concept. Its description and its four fields are the whole brief: the producer builds from them and keeps its own approval gates, which are not answered on the user's behalf.
   - A concept the user did not approve stays queued, and a concept routed outside the pipeline is never built here.
   - Close with one short recap: which concepts were approved and the route of each, where `concepts.md` is, and which concepts remain queued.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `campaign_concepts` as one JSON string: the run's folder and the path to `concepts.md`, which of the four inputs the plan is built on and which are absent, each campaign with its concepts in order (description, buyer, hypothesis, evidence, format, evidenced or reasoned, route), which concepts the user approved, what was built and where, and which remain queued; for a single-shape answer, the ranked answers with their reasoning. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- No product URL or photo: ask for one and wait.
- The user will not run the ad research: plan without it and label the concepts reasoned rather than evidenced.
- The brand is not advertising yet, or has no competitors in the library: that comes back as an empty audit, which is a real answer. Plan from the product, the brand and whichever half did return ads, and say the set has no coverage map behind it.
- A product but no brand profile: offer the brand analysis first. If the user declines, ask which claims they will stand behind, plan from those and say the voice is unconfirmed.
- The user asks for one thing ("give me hooks", "what angle should I try"): answer in that shape, with ranked answers and the reasoning behind each, not a set of full concepts they did not ask for.
- The research carries no proof the brand can stand behind: plan the concepts that do not need proof and name the gap. Never invent a statistic, rating, testimonial or result to make a concept work.
- The user says "make it" or "build these": that is step 7's approval for those concepts. Nothing is built before it arrives.

## Checks

- **inputs_stated**: the plan says which of the four inputs (product, brand, own ads, competitors' ads) it is built on and which are absent, and `concepts.md` carries that grounding header.
- **every_concept_routed**: every concept in `concepts.md` carries a route, and none was dropped for being unroutable.
- **no_invented_proof_or_terms**: no statistic, rating, testimonial, award, result, offer, price, discount, trial or call to action appears that the brand profile or the user did not state.
- **nothing_built_before_approval**: nothing was generated before the user named the concepts to build; an unanswered question was not taken as a yes.

## Sources

- AI intent mapping: planning-campaigns → ads.campaign-plan (its workflow, including the end-to-end run through its Step 6) and ads.hooks-and-angles (its edge case for a request for one thing).
- Source: supercmo-skills (SupercmoHQ/superCMO-skills@3bf78a42, release v0.1.27) — `skills/planning-campaigns/SKILL.md`, `references/finding-concepts.md` and `references/production-palette.md`, packaged unchanged under `<package_root>/scripts/supercmo-skills/` (the skill file as `SKILL.source.md`). It opens the `SKILL.md` of `analyzing-products`, `analyzing-brand`, `analyzing-own-ads` and `researching-competitor-ads`, and of the producer its palette names for an approved concept.
- Changes for coexistence (ADR-0017):
  - The source's frontmatter trigger ("Use when the user asks what to make, what to test next ...") is not applied: it would start the original as a skill, and the coordinator classifies by meaning.
  - "Trigger the skill workflow" (its Steps 2 and 6, and the brand analysis it offers in an edge case) becomes opening that skill's packaged file and running its workflow inside this step: triggering a skill by name is activation that competes with the coordinator, and no host registers the absorbed originals as skills.
  - An input an earlier step already recorded is used instead of being gathered again (step 3): another capability of this package owns each of those outputs, and two owners of one output are not allowed. The source's own rule, "skip one only where the brief already carries what it would return", covers the case.
  - The source's last step builds each approved concept by running the producer skill in place. Here that step ends at the handover (step 7): every producer's output has its own capability in this package (two owners of one output), so each approved concept is built as a following step, from the concept this plan wrote.
  - Nothing else that the source prescribes was changed.
- Runtime dependency: none of its own. The four analyses it runs in step 3 call the server's tools, declared above as optional because an input already carried is not gathered again, and need the keys their own files name.
- Hooks: the selected files define none.
