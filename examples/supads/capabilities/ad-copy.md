---
id: ad-copy
role: copywriting
when: —
after: []
outputs: ["ad_copy"]
checks: ["fields_within_channel_limits", "claims_grounded", "variants_are_distinct_arguments", "text_only"]
intents: [{"id":"ads.ad-copy","description":"Write the words that go into an ad platform's own fields beside the creative of a paid ad (headline, primary or introductory text, description, caption, call to action), for one channel or several, each field sized to that channel's limits and written in its register, as a few variants that each argue a different angle.","excludes":["Text drawn on the image itself (a headline or hook rendered into the creative) is image-ad work.","A spoken voiceover or a video script: any words heard over a video are script work.","Long-form copy such as a blog post, an email or landing-page copy.","Nothing is posted, generated or spent here: the result is text only."]}]
tools: [{"name":"file-access","purpose":"Read the packaged guide of each channel the copy runs on. Nothing is written, posted or sent.","required":true}]
hooks: []
conflicts: []
reads: ["brand_profile", "product_facts", "campaign_concepts", "competitor_ads_report", "own_ads_report"]
---

# Ad Copy

Writes the copy that rides beside the creative in the ad platform: headline, primary text, description and call to action, one set per channel. It is not the text drawn on the image and not a voiceover. The packaged original, `<package_root>/scripts/supercmo-skills/skills/writing-ad-copy/SKILL.source.md`, is the full version of this method and wins where this body differs from it, except for the changes listed in the Sources section. `$REF` below is `<package_root>/scripts/supercmo-skills/skills/writing-ad-copy/references`.

## Behavior

1. **Read what is fixed.** Ask only for what would change the copy and cannot be defaulted:
   - the product and the offer: what it is, what it does for the buyer, any promotion (a price, a discount, a launch);
   - who it is for and how aware they are;
   - which channel or channels the copy runs on: this decides the fields, the limits and the register;
   - the grounding: the claims the user will stand behind and any raw material (reviews, a winning ad, ad comments, the words real customers use). The copy is built from this.
2. **Default or ask.** Audience and awareness default to the broad buyer when unstated. The channel and the grounding do not: with no channel named, ask which; with no grounding at all, ask for it and do not write yet. A partial gap (a missing offer, one thin claim) is different: write the angles the material supports and name the gap.
3. **Feature claims and proof claims.** What the product is and does, how it works and the offer can be asserted by the user, and you write from that. A proof claim (a number, a rating, a testimonial, a "better than X" result) needs real backing: without it the claim is not made, and you ask rather than invent one. Proof that is only a paraphrase is attributed ("reviewers say…"), not stated as fact; a supplied review's own words are stronger still.
4. **Pick the angles.** An ad tests a few different arguments, not one argument reworded. Take a handful of distinct angles from what the product and the grounding support. The recurring ones, a starting range and not a closed list: the pain, the outcome, the proof (a real number, review or result, relayed not claimed), curiosity, the comparison, urgency (a real deadline or scarcity, never a fake one), identity, the contrarian. A thin brief supports only a few real angles: do not manufacture more.
5. **Read the channel's guide** for each channel, before writing. It owns that channel's fields, character limits, where the feed cuts the text off, its calls to action and its register. Take every limit from the guide: some are hard caps and some are working budgets, and the guide says which.
   - Meta (Facebook and Instagram ads): `$REF/channel-copy-meta.md`
   - Google (Search, Responsive Search Ads): `$REF/channel-copy-google.md`
   - LinkedIn (Sponsored Content): `$REF/channel-copy-linkedin.md`
   - TikTok (In-Feed ads): `$REF/channel-copy-tiktok.md`
   - X (Promoted ads): `$REF/channel-copy-x.md`
   - Reddit (Promoted posts): `$REF/channel-copy-reddit.md`
   - A channel with no guide: write to the closest guide, say which you used, keep to its limits and call out where the real channel likely differs.
6. **Write the core copy**, each field the channel calls for:
   - headline: specific and benefit-led, active voice, one clear idea; a number or a concrete detail beats a general claim;
   - primary text or body: leads on the angle and front-loads the hook, carries the proof and answers the obvious objection;
   - description: complements the headline and never repeats it (a proof point, an objection handled, the offer reinforced);
   - call to action: where the channel takes one, the single action the ad asks for, chosen from the channel's own set. Some channels assemble the ad and take no manual call to action; the guide says which.
   - Say what the picture cannot, in the buyer's own language. No filler to reach a limit, no hype the grounding does not earn.
7. **Fit each field.** The first words of the primary text and of the headline carry the message, because the feed truncates the rest: everything load-bearing sits before the fold the guide names. Write inside each field's limit. Where the platform assembles or randomises the fields, each one has to stand alone and make sense in any combination; the guide flags where.
8. **Make the variants.** One variant per angle, each a different reason to buy. Drop one of any two that collapsed into near-duplicates and replace it with a fresh angle. Hold the offer and the product identical across variants; vary only the argument. Where a channel assembles many assets from what you supply, give it distinct phrasings and lengths of the angles you have, but do not pad to the channel's maximum: fewer distinct assets beat near-duplicates.
9. **Check every field against its limit.** A field over its limit is rewritten, not trimmed at the end.
   - Does it fit? Count the characters against the guide's number for that field.
   - Is it grounded? Every claim traces back to the material of step 1. No invented statistic, rating or testimonial survives.
   - Is it compliant? Flag anything the channel restricts (an unsupported claim, personal-attribute phrasing such as "are you struggling with…", a before/after in a restricted category) and offer the compliant version rather than shipping it.
   - Run the guide's own "Before handing back" list for the channel.
10. **Hand the copy back** grouped by channel, then by angle: for each field, the text and its character count. Where the channel takes a bulk set of fields, lay them out in that shape. Text only: nothing here is posted, generated or spent.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `ad_copy` as one JSON string: for each channel and each angle, every field with its text and character count, the guide used for a channel that has none, the gaps named and the compliance flags raised. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Checks

- **fields_within_channel_limits**: every field was counted against its channel guide's number and fits; an over-limit field was rewritten whole, not cut at the end.
- **claims_grounded**: every claim traces to the material the user supplied; no statistic, rating, testimonial or result was invented, and paraphrased proof is attributed.
- **variants_are_distinct_arguments**: each variant argues a different angle with the same product and offer; no two are the same argument reworded, and the set was not padded.
- **text_only**: the step returned text; nothing was posted, generated or spent.

## Sources

- AI intent mapping: writing-ad-copy → ads.ad-copy.
- Source: supercmo-skills (SupercmoHQ/superCMO-skills@3bf78a42, release v0.1.27) — `skills/writing-ad-copy/SKILL.md` and its six `references/channel-copy-*.md` guides (meta, google, linkedin, tiktok, x, reddit), packaged unchanged under `<package_root>/scripts/supercmo-skills/` (the skill file as `SKILL.source.md`).
- Changes for coexistence (ADR-0017):
  - The source's frontmatter trigger ("Use when the user wants ad copy ...") is not applied: it would start the original as a skill, and the coordinator classifies by meaning.
  - The source's two redirects (text drawn on the image → `generating-image-ads`, a voiceover or script → `writing-video-scripts`) are not followed from inside this step: they are routing between the source's skills, which competes with the coordinator. The boundary is carried in the intent's `excludes`.
  - Nothing else that the source prescribes was changed.
- Runtime dependency: none. The step calls no tool of the server and needs no key.
- Hooks: the selected files define none.
