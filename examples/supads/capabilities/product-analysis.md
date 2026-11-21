---
id: product-analysis
role: product-analysis
when: —
after: []
outputs: ["product_facts"]
checks: ["images_read_through_image_analysis", "facts_complete_for_mode", "image_caps_kept"]
check_conditions: {"image_caps_kept": "The product came as a URL and the extraction returned image candidates."}
intents: [{"id":"ads.product-analysis","description":"Turn one product into facts ready for image or video generation. From an e-commerce URL (Amazon, Shopify, AliExpress, any product page): a factual description of about two paragraphs and up to 5 downloaded, filtered product images. From a photo alone: what the product is, how it is used, its moving or opening parts and the visual details to keep identical. It applies when a product link or photo needs turning into generation inputs, or when other work needs the product's facts before generating.","excludes":["A brand's identity from its website (palette, voice, positioning) is brand analysis.","Generating the image or the video is the work that follows, not this.","Ranking the product's market position: the work that uses these facts decides that from packaging cues."]}]
tools: [{"name":"image_analysis","purpose":"Send the product photo, or each downloaded candidate image (the local file's bytes), with a prompt to the vision provider (Gemini with the user's own key, SuperCMO's proxy with the managed key); text comes back. At most 10 calls for one product URL; each is billed.","required":true},{"name":"url_extraction","purpose":"URL mode only: read the product page through the page-reading provider (Firecrawl with the user's own key, SuperCMO's proxy with the managed key). The URL and the prompt go out; structured fields and product-image URLs come back. Billed per call.","required":false},{"name":"shell","purpose":"URL mode only: download at most 10 candidate images from the store's servers with a browser User-Agent into `./supercmo-files/product-images/<date-time>` in the user's project, and check each file's size.","required":false},{"name":"file-access","purpose":"Read the one packaged reference that matches the input.","required":true}]
hooks: []
conflicts: []
---

# Product Analysis

Turns a product, given as an e-commerce URL or as a bare photo, into clean facts that generation can reuse: a tight description, curated product images, and how the product is physically used. It is a building block that other work runs at the input stage, before any generation. `$SK` below is `<package_root>/scripts/supercmo-skills/skills/analyzing-products`. The packaged original, `$SK/SKILL.source.md`, is the full version of this method and wins where this body differs from it, except for the changes listed in the Sources section.

## Behavior

1. **Pick the mode.** Read only the reference that matches the input and follow it end to end.
   - An e-commerce URL: `$SK/references/url-extract.md` (step 2).
   - A product photo only, with no URL and no description: `$SK/references/photo-analysis.md` (step 3).
   - Both a URL and a photo: run the URL mode, which is richer, and keep the photo as one more reference image.
   - Neither: there is nothing to analyze; ask for one.
   - Do not pause for confirmation: a URL or a photo plus the intent to generate means extract and proceed.
2. **URL mode.**
   - **Extract.** Call `url_extraction` with the URL and a product-focused prompt: the name, brand, price and currency, the chosen variant, the full write-up, spec or feature bullets, and the URLs of the main product photos (hero shots and packaging), leaving out review images, related products, navigation, banners, colour-swatch thumbnails, sizing charts and brand logos. Pass a `schema` only when a strict, typed shape is wanted. The reference carries an example prompt.
   - **Download.** Take at most the first 10 candidate URLs, hero and main-gallery shots first; never download or filter more than 10, however many come back. Download each into `./supercmo-files/product-images/<YYYY-MM-DD-HHMM>` with a browser User-Agent: without one some CDNs return a stub a few hundred bytes long. The reference has the exact `curl` command and User-Agent string. Check that each file is over 10KB; a smaller one is a placeholder or a blocked URL, so drop it. From here on work from the downloaded files, not the URLs.
   - **Filter.** Call `image_analysis` on each downloaded image, at most 10 calls in total, and keep only clean product shots. Always route each image through `image_analysis`; do not rely on reading it yourself. The filter is mandatory: one wrong-variant or face-carrying image corrupts the generation. Judge three things: type (the product is the clear subject, not a lifestyle or review photo, size chart, logo or banner), face (drop any image showing a human face; hands holding the product are fine), variant (drop any image whose colour or variant differs from the listing). The reference has one prompt that asks all three. Keep up to 5 that pass.
   - **Describe.** From the extracted fields write about two paragraphs, factual, not marketing copy: open with what it is and who makes it, cover the three to five points that would decide a purchase, give the concrete specs (dimensions, weight, materials, compatibility), and close on who it is for.
3. **Photo mode.** Run `image_analysis` on the photo first and build from what comes back; always route the image through `image_analysis` rather than reading it yourself, so the result is the same whichever model is driving. Send the reference's prompt, which asks for four facts at once:
   - **Category**, named precisely down to its form ("over-ear noise-cancelling headphones", not "audio gear").
   - **How it is used**: the specific real action (worn, held and operated, applied, sprayed, poured, ridden, plugged in, consumed), not a vague "uses it".
   - **Moving or opening parts** (a cap, lid, hinge, zip, buttons, a switch, a clasp) and how they work; where something opens before use, the opening comes first. Skip this where the product has none.
   - **Key visual details** that must stay identical everywhere: colour, shape, material, size, labels, and the features that make it recognizable.
   Photo mode produces no new files: the user's photo is used directly as the reference.
4. **Hand off.** Return the result ready to drop into generation. URL mode: the description and the kept image files as local paths, usable as reference images. Photo mode: the category, how it is used, any moving or opening parts and the key visual details. Do not rank the product's market position; the job here is the objective facts.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `product_facts` as one JSON string: the mode; in URL mode the description and the local paths of the kept images (or the plain statement that no clean image survived); in photo mode the four facts and the photo's path; and anything that could not be determined. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **The URL cannot be extracted** (no result, or the extractor is not set up): ask for a product photo instead and switch to photo mode.
- **Every image fails the filter** (faces, wrong variant, not a product shot): keep the single cleanest, or hand off the description alone and say plainly that no clean image survived.
- **A supplied photo is too unclear to read** (blurry, cropped, ambiguous): say what you cannot determine and ask for a clearer shot rather than guessing the mechanic.
- The reference's download snippet is written for a POSIX shell (`date`, `mkdir -p`, `curl`). On another shell do the same three things: the same folder, the same User-Agent, the same size check.

## Checks

- **images_read_through_image_analysis**: every fact read from a picture, and every keep or drop decision on a candidate image, comes from an `image_analysis` call of this step.
- **facts_complete_for_mode**: URL mode returns the description and the kept image paths, or says plainly that no clean image survived; photo mode returns the four facts, or says what could not be determined.
- **image_caps_kept**: at most 10 candidates were downloaded and analyzed, every kept file is over 10KB, and at most 5 images were kept.

## Sources

- AI intent mapping: analyzing-products → ads.product-analysis.
- Source: supercmo-skills (SupercmoHQ/superCMO-skills@3bf78a42, release v0.1.27) — `skills/analyzing-products/SKILL.md`, `references/url-extract.md` and `references/photo-analysis.md`, and for the tools `scripts/supercmo_skills/mcp/tools/extract.py`, `mcp/tools/analyze.py` and `tool_specs.py`, packaged unchanged under `<package_root>/scripts/supercmo-skills/` (the skill file as `SKILL.source.md`).
- Changes for coexistence (ADR-0017):
  - The source's frontmatter triggers ("Use when a product URL or photo needs turning into inputs ...") are not applied: they would start the original as a skill, and the coordinator classifies by meaning.
  - Nothing else that the source prescribes was changed.
- Runtime dependency: keys for the server's tools, delivered as media setup describes: the managed key, or the user's own `GEMINI_API_KEY` (`image_analysis`) and `FIRECRAWL_API_KEY` (`url_extraction`). `curl` for the downloads; the source gives no install method for it.
- Unresolved in the source: `scripts/supercmo_skills/paths.py` says the product download reads `$SUPERCMO_SCRATCH_DIR`, while the reference's snippet sets the folder to `./supercmo-files/product-images/<date-time>` and reads no variable. This body follows the reference.
- Hooks: the selected files define none.
