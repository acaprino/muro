---
id: brand-analysis
role: brand-analysis
when: —
after: []
outputs: ["brand_profile"]
checks: ["known_brand_not_rebilled", "unevidenced_marked_unconfirmed", "brand_file_sections_in_order"]
check_conditions: {"brand_file_sections_in_order": "`brand.md` was written or patched in this run: the brand was not handed back as already known, the read did not fail, and the site gave something usable."}
intents: [{"id":"ads.brand-analysis","description":"Establish what a brand is from its own website, as facts: its colours and fonts, its logo and hero imagery, its photography style, its tagline, how it sounds, who it sells to, what sets it apart, the proof it offers and what it sells, written to `./supercmo-company/brand.md` with anything the site does not evidence marked unconfirmed. It applies when a brand's guidelines, palette, typography, voice, tone or positioning need establishing, or when other work needs the brand before it plans or generates.","excludes":["A single product's facts from a product page or a photo is product analysis.","First-time onboarding, which also finds the competitors and saves the whole company profile.","Nothing is generated, planned or judged here: a new name, a logo or a rebrand is not analysis.","Who the competitors are, the ads they run, or an audit of the user's own ads."]}]
tools: [{"name":"url_extraction","purpose":"Read the brand's homepage through the page-reading provider (Firecrawl with the user's own key, SuperCMO's proxy with the managed key). The URL goes out; the page's own text, the colours, fonts and logo it renders and a screenshot link come back. Every call is billed, including one that returns nothing.","required":true},{"name":"image_analysis","purpose":"Send the screenshot link, in detailed mode also up to 9 hero photograph links, each with its prompt, to the vision provider (Gemini with the user's own key, SuperCMO's proxy with the managed key); text comes back. Each picture is read and billed on its own.","required":true},{"name":"file-access","purpose":"Read the packaged reference; read, write or patch `brand.md` in `./supercmo-company`, creating the folder where it does not exist.","required":true}]
hooks: []
conflicts: []
---

# Brand Analysis

Reads what a brand is from its website and writes it down as facts in `./supercmo-company/brand.md`, the brand half of the company profile. The host's file tool writes that file; no server tool does. `$SK` below is `<package_root>/scripts/supercmo-skills/skills/analyzing-brand`. The packaged original, `$SK/SKILL.source.md`, is the full version of this method and wins where this body differs from it, except for the changes listed in the Sources section.

## Behavior

1. **Check whether the brand is already known.** Read `brand.md` in `./supercmo-company`. Where it already holds this brand, hand it back and stop: re-researching bills again and tells the user nothing new. Carry on where it is missing, where it is a different brand, or where the user asked to re-analyze.
   - A request for a detailed run of a brand already saved is a re-analysis too: run step 3 again for a fresh screenshot (its link does not last), then step 4 in detailed mode with the hero photos from `brand.md`'s Assets, and patch only what they add.
2. **Check what you were given.**
   - A brand website: carry on.
   - A product page (Amazon, Shopify, a single listing): this is product analysis, not this capability. Say so and analyze nothing here.
   - Nothing, or a URL that will not load: ask for the website. A brand described from memory is invented, not read.
   - No mode named: run quick mode and do not ask. Detailed mode runs only when the user or the calling work asks for it.
3. **Read the site.** Call `url_extraction` with the homepage as the `url` and no `prompt` or `schema`. It returns the page's own text in `data.markdown`, `branding` (the colours, fonts and logo the page renders) and `screenshot`. Read the brand's identity off the text yourself, as `$SK/references/reading-the-brand.md` lays out field by field: name, what it sells, logo, hero images, tagline, audience, voice and up to six voice examples copied exactly, differentiators, proof. `metadata.title` and `metadata.description` are the brand's own words too: use them where the text is thin. Keep `branding` and the screenshot for step 4.
   - The read failed when the call returns `ok: false`, or when step 4 finds an error, login or bot-check page; never just because there is little text. Then say the site could not be read and treat it as a URL that will not load.
   - Short or empty text but a screenshot that shows the brand's site: carry on, take the name from `metadata.title`, add "What does this screen show for sale?" to the screenshot's prompt, and do not ask the user.
4. **Look at the pictures.** Both modes run this step. It gives the photography style and a check on `branding`.
   - Quick mode reads the screenshot alone: one `image_analysis` call.
   - Detailed mode adds the hero photographs step 3 found: one `image_analysis` call with the screenshot and up to 9 photographs as entries in `requests`. Give every entry its own `prompt`; with `requests`, a prompt beside them is ignored. Put the style together from what the pictures have in common.
   - The screenshot's prompt asks four things in a fixed order (error, login or bot-check page: yes or no; the photography style in about 120 words; which of `branding`'s colours are the brand's own and the page background; how the headline and body text look). Take the wording from "Step 4" of the original. A yes to the first is a failed read: stop and use nothing from the call. A photograph's prompt asks only the second.
   - No screenshot and no photograph: there is no photography style to record; say so.
5. **Write it down.** Write `brand.md` into `./supercmo-company`, creating the folder where needed, with these sections in this order: Name, What it sells, Source (the homepage and the date it was read), Palette, Typography, Tagline, Target audience, Voice, Key differentiators, Proof, Photography style, Assets. The table in "Step 5" of the original says what goes in each; the reference says how to read palette, typography and logo from `branding`.
   - Where there is no evidence for a section, write `unconfirmed — needs user input` and move on. Never invent a fact, a number, a colour or a claim. Voice examples and proof are quoted exactly as the page wrote them.
   - New information goes into this one document; do not add another file. Keep hosted URLs in Assets; do not download them.
   - Where `brand.md` already exists for this brand, patch the sections that changed and leave the rest untouched. Where it holds a different brand, replace it.
   - Where the site gave nothing usable at all (no palette and no images), do not write the file. Say what was tried and what came back, and ask whether to supply the brand's assets, try another URL, or carry on without them.
6. **Hand it over.** Give the path to `brand.md`. In the reply also give the palette, the typography, the voice, the tagline, the differentiators and the proof, not the whole file. Where a section stayed `unconfirmed`, say in one line what the site did not show. Do not ask the user to fill it in: they can add it any time on the Brand page.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `brand_profile` as one JSON string: the path of `brand.md`, the brand's name and the homepage read, the mode, whether the file was written, patched or handed back as already known, the sections left unconfirmed, and a failed read or an unusable site where that happened. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **`error: "no_provider_configured"` on any tool**: relay the tool's `hint` (the user must set their key).
- **The page extracts as an empty shell** (a single-page app that renders no text to the reader): `branding` and the screenshot still read the rendered page, so take what they give, and say in `brand.md` that the page's text could not be read. Do not write an empty palette as if it were the brand's palette.
- **The user says the saved brand is out of date**: re-analyze, and say which parts changed.
- **Run from inside another capability's step** (onboarding, a campaign plan): the original's rule applies. Ask the user nothing, report a missing website or an unreadable site back to that step, and skip step 6; the calling step gives the one reply.
- Open "Traps" in the reference before writing: a logo or icon is not a hero image, and every call is billed, including a misspelled domain.

## Checks

- **known_brand_not_rebilled**: where `brand.md` already held this brand and no re-analysis was asked, it was handed back and no extraction or vision call was made.
- **unevidenced_marked_unconfirmed**: no section holds a fact, number, colour or claim the site did not evidence; such sections read `unconfirmed — needs user input`, and quotes are exact.
- **brand_file_sections_in_order**: `./supercmo-company/brand.md` is the one document, with the twelve sections in the source's order, patched rather than replaced where it already held this brand.

## Sources

- AI intent mapping: analyzing-brand → ads.brand-analysis.
- Source: supercmo-skills (SupercmoHQ/superCMO-skills@3bf78a42, release v0.1.27) — `skills/analyzing-brand/SKILL.md` and `references/reading-the-brand.md`, and for the tools `scripts/supercmo_skills/mcp/tools/extract.py`, `mcp/tools/analyze.py`, `tool_specs.py` and `providers/firecrawl.py`, `providers/gemini.py`, packaged unchanged under `<package_root>/scripts/supercmo-skills/` (the skill file as `SKILL.source.md`).
- Changes for coexistence (ADR-0017):
  - The source's frontmatter triggers ("Use when a brand's guidelines ... need establishing") are not applied: they would start the original as a skill, and the coordinator classifies by meaning.
  - "A product page: wrong skill, hand it to `analyzing-products`, and say which you used" is not followed from inside this step: it is routing between the source's skills, which competes with the coordinator, and the product facts have their own owner. The step says it is product analysis and stops; the boundary is in the intent's `excludes`.
  - Nothing else that the source prescribes was changed.
- Runtime dependency: keys for the server's tools, delivered as media setup describes: the managed key, or the user's own `FIRECRAWL_API_KEY` (`url_extraction`) and `GEMINI_API_KEY` (`image_analysis`). The source gives no other install method.
- Unresolved in the source: "the Brand page" is defined in none of the selected files; the words are carried as the source says them.
- Hooks: the selected files define none.
