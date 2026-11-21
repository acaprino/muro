---
id: format-adaptation
role: format-adaptation
when: —
after: []
outputs: ["adapted_ads"]
checks: ["plan_shown_before_generating", "supplied_ratio_not_regenerated", "original_ad_referenced_one_model", "margins_stated_copy_verbatim"]
intents: [{"id":"ads.format-adaptation","description":"Take an image ad that already exists and produce it in the other shapes it has to run in: a named ratio, a ratio family, or every size a channel takes. The ad is read first, then each shape is regenerated with the original passed in as a reference and recomposed rather than cropped: the background is extended into the space the new proportions open up, the product, the copy and the look carry across, and the headline and call to action stay clear of the buttons and captions the platform draws over the ad.","excludes":["Making an ad that does not exist yet is image ad production, which makes the ad and its ratio family in one pass.","Writing the words of the ad is ad copywriting.","Swapping in a different product, brand or claims is a rebuild of someone else's ad, not a resize.","A video ad is a different job: this resizes stills."]}]
tools: [{"name":"image_analysis","purpose":"Read the supplied ad once and report its parts: the product, every drawn string word for word, the background, the look and the layout; returns text and writes nothing. The ad image (a local file is read and sent inline) and the question go to Google Gemini with GEMINI_API_KEY, else to the SuperCMO managed proxy. Each call is billed.","required":true},{"name":"list_image_models","purpose":"List the models actually available with the aspect_ratio values each accepts and its reference image limit on the provider that will serve it. Reads the bundled catalog; nothing goes to a provider.","required":true},{"name":"image_generate","purpose":"Regenerate the ad, one request object per shape and at most 10 per call; each carries prompt, model, aspect_ratio, resolution and reference_images (the original ad, and the clean product photo when supplied; up to 10, local paths or URLs). The prompt and the references (a local file is read and sent to that provider) go to the provider serving the model: WaveSpeed with WAVESPEED_API_KEY, else fal with FAL_KEY, else the SuperCMO managed proxy (api.getsupercmo.ai) with SUPERCMO_API_KEY; every image is billed. Each finished image comes back as a hosted URL and, when its download succeeds, as a file in the output folder: the server's SUPERCMO_OUTPUT_DIR variable when set, else ./supercmo-media under the server's working directory. The tool has no output folder argument. Unless telemetry is turned off, anonymous usage events (tool name, model, provider, outcome, duration; never prompts, files or keys) go to SuperCMO.","required":true},{"name":"job_status","purpose":"Rejoin a generation that came back pending, with the exact handle object, up to 10 handles per call. Polls the provider that holds the job, starts and bills no new one, and saves a finished image the same way image_generate does.","required":true}]
hooks: []
conflicts: []
reads: ["image_ads"]
resumable: true
---

# Format Adaptation

Takes an image ad that already exists and produces it in the other shapes it has to run in. Each shape is regenerated, not cropped: the ad is rebuilt for the new proportions with the original passed in as a reference, so it stays the same ad. `$AF` below is `<package_root>/scripts/supercmo-skills/skills/adapting-formats`. The packaged original, `$AF/SKILL.source.md`, is the full version of this method and wins where this body differs from it, except for the changes listed in the Sources section.

## Behavior

1. **Get the ad and the shapes.**
   - The ad: the image file or URL, at the largest version the user has. Without it there is nothing to resize: ask for it and stop. Several ads at once are read and planned separately, and can all be generated in one call at the end.
   - The shapes: the ratios, or the channel they run on. For a named channel take the ratios from `$AF/references/ratios-and-safe-zones.md`. Where neither is given, ask which sizes they need, offering that table's channels and a free-text way out.
   - The product photo, where they have one: a clean shot of the product on its own is worth asking for, since it holds the product's identity far better than the ad can.
   - Drop the shape the ad is already in. An ad supplied at `1:1` and asked for the Meta family needs `4:5` and `9:16` only.
2. **Read the ad.** Run `image_analysis` on it once and separate what the ad is made of, the parts a resize moves: the product and what must stay identical (shape, colour, label, printed text); every drawn string, word for word, wherever it sits (a word read wrong here is a word wrong in the ad); the background (surface, scene, light direction, perspective), which is what gets extended; the look (palette, character of the type); the layout (what the eye lands on first, how the parts sit). Take what this ad actually has: an ad with no call to action does not get one invented. Read it once; a second analysis call bills again.
3. **Plan each new shape.** Read `$AF/references/recomposing.md` first. For each shape decide and write down:
   - how far it is from the original: `1:1` into `4:5` is a nudge; `1:1` into `9:16` is a real recomposition; a vertical into `16:9` or `21:9` inverts the frame and keeps very little, closer to a new ad than a resize, which is worth saying before it is generated;
   - what fills the new area: normally the background extended in keeping with its own light and perspective, plus deliberate negative space around the product; never a new element invented to fill it;
   - where each part goes, including which part had to move out of the band the platform covers;
   - whether the copy still fits. The `9:16` safe area is roughly the middle half of the frame, so a copy-dense square ad often cannot move into it at a readable size. Say that; do not shrink the type until it fits. Fewer words is the answer, and that is the user's call.
4. **Show the plan and wait.** Nothing has been generated yet and everything after this costs money. In one short message: the shapes being made, what fills the new space in each, anything significant that had to move, and anything the shape cannot carry. Then ask, and wait. Where the user has said they do not want to be asked, say in one line what you are going with and carry on.
5. **Choose one model for every shape**, so the set comes back as one campaign. A resize redraws every string, so how well a model holds text usually decides it. `gpt-image-2` for a designed, text-forward layout (a headline, an offer, callouts), the usual choice since most ads carry real copy: short labelled segments on separate lines, every string quoted exactly. `nano-banana-pro` when the ad leads on a photoreal product or a person and carries lighter text: connected sentences in one narrative paragraph, the drawn copy quoted. `seedream-5` for a photoreal ad another model refused or keeps failing: a description leading with what matters most. A model the user named is used instead. Call `list_image_models` for what is actually available and for each model's `reference_images` limit.
6. **Write one prompt per shape** from step 2's reading and step 3's plan. Hold the product, the palette, the type and every drawn string identical across them: only the arrangement changes.
   - State the new arrangement as regions of the frame: where each part sits, what the background extends into, where the negative space falls.
   - Keep the copy out of the platform's furniture: take the margins from `ratios-and-safe-zones.md` and state them. Margin cannot be added to a finished frame.
   - Quote every drawn string exactly, in single quotes, with its size and position against the others.
   - Say the product is the one in the reference and reaches the image unchanged: its shape, colour, label and printed text as they are.
   - The source orders its image skill read before any image call: open the chosen model's guide under `<package_root>/scripts/supercmo-skills/skills/generating-images/references/` (`prompt-gpt-image-2.md`, `prompt-nano-banana.md` or `prompt-seedream.md`) for how that model wants a prompt; this method keeps the model choice and the prompt's content.
7. **Generate.** Call `image_generate` with a `requests` list, all of them in the same call so they render at once: one object per shape with `prompt`, `model`, `aspect_ratio`, `resolution`, `reference_images`.
   - The original ad goes in `reference_images` every time, and the clean product photo alongside it where the user supplied one.
   - `resolution` is `1k` unless the user asked for a higher tier; raise it where the ad is dense with small type.
   - The model of step 5 on every object. Take the accepted `aspect_ratio` values from `list_image_models`; a wrong enum fails a billed call.
   - One image per request. Never a second to compare models or to correct one you judged poor.
   - A result `{status: "pending", …}` is a job handle: pass that exact handle to `job_status`, again if still pending, and never re-run it through `image_generate`.
8. **Return** the image URLs and local file paths once every shape has finished, never a partial set, labelled by ratio. Say in one line what changed between the shapes and what was held, and name any shape where the plan and the result parted company.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `adapted_ads` as one JSON string: the source ad and its ratio, the model used, and for each new shape its ratio, hosted URL and local file path, what changed and what was held, and any shape that failed or parted from the plan. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Never regenerate a shape without the user asking: every re-run bills again. Hand back what came out, say what looks wrong, and wait.
- Ratios per channel (`ratios-and-safe-zones.md`): Meta ads `4:5`, `9:16`, `1:1`; Instagram `4:5`, `9:16`; Facebook `4:5`, `9:16`, `1:1`, with `16:9` only where the material is genuinely landscape; LinkedIn `1:1`, `16:9`; YouTube `9:16`, `16:9`; Reddit `4:5`, `1:1`. For a channel not listed, work to the closest one and say which.
- Safe zones: vertical `9:16` keeps clear the top ~14%, the bottom ~35% and ~6% on each side, built to the Reels margins, which clear Stories too. YouTube Shorts covers the bottom fifth and the right-hand edge. On feed shapes (`4:5`, `1:1`, `16:9`) keep the lower strip clear: a drawn call to action at the bottom edge collides with the platform's own. Open that file's "Before handing back" list when describing the result; it also says specs move and anything load-bearing is confirmed in the channel's own ads manager.
- `recomposing.md` forbids letterboxing or pillarboxing, centre-cropping, stretching or squashing, and scaling the whole layout uniformly; it gives the order of what fills new area (more of the existing environment, then negative space, then redistribution of what is there) and the arrangements for going taller and going wider.
- Only the requested shape is the one the ad already has: there is nothing to make; say so. A ratio no model accepts: offer the nearest available shape. One shape fails while the others succeed: send a new call with only that request.
- The new size came back different from the plan (a shifted layout, a redrawn label, warped type): hand it over and say what moved. For warped or misspelled copy the fix to propose is to quote the strings exactly, cut the amount and route to `gpt-image-2`.
- `error: "no_provider_configured"` on any tool: relay the tool's `hint`; the user has to set their key.
- A failure this list does not cover (a call that times out with no handle, an explicit error that names no cause): open "Edge cases" in `<package_root>/scripts/supercmo-skills/skills/generating-images/SKILL.source.md`. Where both speak, this method's own rule wins.
- "Common mistakes" in the original lists what a plan and a prompt are checked against.
- Tool limits: at most 10 requests per call and 10 reference images per request. Every model accepts `1:1`, `16:9`, `9:16`, `4:3` and `3:4`; `4:5` and `21:9` are accepted by some models only. The tool has no output folder argument: files go to the server's `SUPERCMO_OUTPUT_DIR` folder, else `./supercmo-media` under the server's working directory; report the `path` each result gives.

## Checks

- **plan_shown_before_generating**: the shapes, what fills the new space, what moved and what a shape cannot carry were shown and answered before the first `image_generate` call, or stated in one line when the user had said not to be asked.
- **supplied_ratio_not_regenerated**: no request was sent for the ratio the ad was already supplied in.
- **original_ad_referenced_one_model**: every request carries the original ad in `reference_images` and the same model, and the shapes were sent together in one call (split only past the tool's limit of 10 requests per call).
- **margins_stated_copy_verbatim**: each prompt states the safe margins for its shape as regions of the frame and quotes every drawn string exactly as read from the ad.

## Sources

- AI intent mapping: adapting-formats → ads.format-adaptation.
- Source: supercmo-skills (SupercmoHQ/superCMO-skills@3bf78a42, release v0.1.27) — `skills/adapting-formats/SKILL.md`, `references/recomposing.md` and `references/ratios-and-safe-zones.md`; `skills/generating-images/SKILL.md` (its "Edge cases") and the prompt guides under its `references/` (step 6), packaged unchanged under `<package_root>/scripts/supercmo-skills/` (the skill file as `SKILL.source.md`). Tool facts were read in `scripts/supercmo_skills/tool_specs.py`, `mcp/tools/image.py`, `mcp/tools/analyze.py`, `client.py`, `paths.py` and `catalog.py`.
- Read at intake only: the skill's eval cases.
- Changes for coexistence (ADR-0017):
  - The frontmatter trigger ("Use when the user has an ad and needs it in another size ...") is not applied as a trigger: it would start the original as a skill, and the coordinator classifies by meaning. Its "Not for ..." clauses are the intent's boundaries.
  - "The ad doesn't exist yet → `generating-image-ads`" becomes a boundary of the intent: a skill that routes to another competes with the coordinator.
  - The source's order to read `generating-images` before any image call (its frontmatter and the tool description of `image_generate`) is kept as the model's prompt guide opened in step 6; no host has a skill of that name here. That this method keeps the model choice and the prompt's content is this intake's reading: the source states no precedence between the two skills.
  - Nothing else was changed.
- Runtime dependency: provider keys, which the plugin does not ship. `GEMINI_API_KEY` for `image_analysis`, `WAVESPEED_API_KEY` or `FAL_KEY` for `image_generate`, or the managed `SUPERCMO_API_KEY` for both; the server reads them from its environment or from `~/.supercmo/.env`, and a call without one returns `no_provider_configured` with a hint.
- Hooks: the selected files define none.
