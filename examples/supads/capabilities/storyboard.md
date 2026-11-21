---
id: storyboard
role: storyboarding
when: —
after: []
outputs: ["storyboard_sheets"]
checks: ["one_sheet_per_clip_in_sequence", "references_match_labels", "panel_limits_kept", "sheet_format_fixed"]
intents: [{"id":"ads.storyboard","description":"Generate the storyboard sheets of a video whose clip lengths and story are settled, before anything is animated: one 16:9 image per clip holding up to five vertical panels in a row, each panel one action, built one sheet at a time with the previous sheet passed as a reference so the person and the product stay consistent except where the story deliberately changes them.","excludes":["A still image on its own is image generation.","A request whose deliverable is a finished video is video production, which builds its storyboard as one of its own stages.","Nothing is animated here: turning a sheet or a photo into a clip is video generation."]}]
tools: [{"name":"image_analysis","purpose":"Read every supplied image (the person, the product) before deciding anything, unless the image is already known. Sends the image (a local file is encoded and sent, a URL is passed on) and the question to Google Gemini with the user's GEMINI_API_KEY, or to SuperCMO's managed proxy with the managed key, which is billed per use. Returns text. The server also sends its anonymous, opt-out usage event for the call (tool name, model, outcome; never prompts, files or keys).","required":true},{"name":"image_generate","purpose":"Generate one sheet per call. Sends the prompt and the reference images (local files are encoded and sent, URLs are passed on) to the provider that serves the model: WaveSpeed or fal with the user's own key, or SuperCMO's managed proxy with the managed key. A generation is billed by the provider that serves it. Returns a hosted image URL and writes the image under ./supercmo-media in the working directory, or under $SUPERCMO_OUTPUT_DIR. The server also sends its anonymous, opt-out usage event for the call (tool name, model, outcome; never prompts, files or keys).","required":true},{"name":"job_status","purpose":"Rejoin a generation that came back pending, with the exact handle it returned. It starts and bills no new job; the finished image is written like any other.","required":false}]
hooks: []
conflicts: []
reads: ["actor_image", "product_photos", "product_facts", "video_script", "campaign_concepts"]
resumable: true
---

# Storyboard

One sheet per clip: vertical panels in a row, each panel one action, read left to right. Panels are numbered within a sheet; sheets are numbered across the video. The sheet is always `16:9` and its panels are always vertical, whatever shape the finished video is. The plan settles how many sheets there are, what happens in each clip and how long it runs, which images come in as references, and the look; how a clip divides into panels is settled here. Anything the plan specifies wins; the defaults below fill gaps only. The packaged original, `<package_root>/scripts/supercmo-skills/skills/generating-storyboards/SKILL.source.md`, is the full version of this method and wins where this body differs from it, except for the changes listed in the Sources section.

## Behavior

**One sheet at a time.** Run steps 1 to 6 for the first sheet, then all six again for the second, and so on. Sheets cannot be built in parallel or in one call: each prompt needs the previous sheet's finished image in hand.

1. **Collect what is needed.** Where any of this is missing, ask for it rather than assuming it:
   - an image of the person, wherever a person appears in any panel;
   - the product image or images, where the video has a product;
   - the previous sheet, from the second sheet on;
   - what happens in this clip and how many seconds it runs;
   - how many sheets there are and which one this is;
   - the look, where the plan names one.
   - What a supplied image is for comes from the brief, not from its contents: a person in a frame does not make it the person reference, and one image cannot serve as both the person and the product.
   - Read every supplied image with `image_analysis` before deciding anything: the place, what the person is wearing, and for a product its colours, shape, finish and size. Skip this where the image is already known.
2. **Settle the sheet.** Every reference goes in twice: attached as `reference_images` on the generate call and labelled Image 1, Image 2, Image 3 in the prompt text, in the same order both times: the product image or images, the person's image, then the previous sheet once there is one. Say once what each is, then refer to it by label.
   - The person is pointed at by label, never described: no age, ethnicity, build, hair, makeup or features. State that wherever they appear it is the same person, with face, hair, build and skin tone identical throughout. They need not be in every panel.
   - Settle the setting, the light, the wardrobe, the look, the product name (one short noun phrase, used word for word in every panel that mentions it) and the product size (a measurement) as "Step 2: Settle the sheet" of the original sets out, defaults included. Skip the product name and size when there is no product.
   - From the second sheet on, write two lines: what carries over from the previous sheet, pointed at by its label, and what the plan deliberately changes. Anything not named as changed matches it exactly.
3. **Divide the clip into panels.** One panel is one primary action: one continuous motion at one object. Split the clip's story wherever a second motion starts or a second object is taken up.
   - Each panel runs two seconds of the clip where possible, three at most, so the seconds set how many there are: up to five panels, never more.
   - Where the story has more than five primary actions, keep the five that carry the clip, always including the opening and the closing beat, and let the rest be carried as motion inside those cuts.
4. **Write the panels.** Settle the row first: the panels read left to right as one continuous story, and from the second sheet on the first panel continues from the final panel of the sheet before it. Then write each panel with all six of these: camera position, framing, action, hands, the product, performance. Open "Step 4: Write the panels" of the original and apply in full its lists of what varies across the row, what holds across the row, and the rules under each of the six.
5. **Assemble the prompt in this order:** the references (each label and what it is); the locks (the person identical throughout, the product on the side its image shows, and from the second sheet on what carries over and what changes); the layout (panels of identical size in a single row, none empty, thin white margins on clean white, the sheet `16:9` and the panels vertical); the sheet-wide settings from step 2; the product's size and how it may be placed; hands and camera (how many hands each position leaves free); what each panel shows, one line per panel left to right, each carrying the six; the constraints, in full, closing the prompt. Copy the constraints from "Step 5" of the original, with the ones it adds where the video has a product. Among them: no text anywhere on the sheet.
6. **Generate this sheet** with one `image_generate` call carrying one request:
   - `prompt`: the one assembled in step 5, whole;
   - `model`: `gpt-image-2`. Only the model changes, and only where the plan names one;
   - `aspect_ratio`: always `16:9`;
   - `resolution`: `1k`, unless the user asked for a higher tier;
   - `reference_images`: the product image or images, the person's image and, from the second sheet on, the sheet generated just before this one, in the same order they were labelled in step 2.
   - A result of `{status: "pending", …}` is a job handle, not a failure. Pass that exact handle to `job_status`, and again if it is still pending. Never re-run a pending generation: that starts a new, separately billed job.
   - Keep the result. It is the plan for its clip and the reference the next sheet is written against. Where another sheet remains, go back to step 1 for it.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `storyboard_sheets` as one JSON string: for each sheet in order, its clip and seconds, the local path and hosted URL of the image, its panels with the action of each, the references passed in their label order, and any element reported as blocked. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- `reference_images` rejected on count: the error states the limit. Drop to it, keeping the person and the previous sheet ahead of extra product angles.
- Safety or NSFW rejection: usually the person. Name a stand-in for whatever tripped the filter and resubmit; identical inputs fail identically. After a second rejection, say which element is blocked so the person can be recast.
- `error: "no_provider_configured"`: relay the tool's `hint`.

## Checks

- **one_sheet_per_clip_in_sequence**: there is one sheet per clip, each generated by its own call after the sheet before it was finished; no sheets were batched or run in parallel, and no pending job was re-run.
- **references_match_labels**: every reference image was attached in the order it is labelled in the prompt (product, person, previous sheet), and from the second sheet on the sheet generated just before is among them.
- **panel_limits_kept**: each sheet has at most five panels, each one primary action covering two seconds of the clip where possible and three at most.
- **sheet_format_fixed**: every sheet was requested at `16:9` with vertical panels in a single row, and the prompt closed with the original's constraints in full, no text on the sheet among them.

## Sources

- AI intent mapping: generating-storyboards → ads.storyboard.
- Source: supercmo-skills (SupercmoHQ/superCMO-skills@3bf78a42, release v0.1.27) — `skills/generating-storyboards/SKILL.md`, packaged unchanged under `<package_root>/scripts/supercmo-skills/` (as `SKILL.source.md`). The skill has no references and no scripts. Tool behaviour read in `scripts/supercmo_skills/tool_specs.py`, `mcp/tools/image.py`, `mcp/tools/analyze.py`, `mcp/tools/jobs.py`, `client.py`, `catalog.py` and `paths.py`.
- Changes for coexistence (ADR-0017):
  - The source's frontmatter trigger ("Use when a video's clip lengths and story are settled and it needs sheets before anything is animated") is not applied: it would start the original as a skill, and the coordinator classifies by meaning. Its condition is kept in the intent description.
  - The source's redirect of a still image to `generating-images` is routing between its skills; the boundary is carried in the intent's `excludes`.
  - The source lists the generate call's fields flat; the server's tool takes them as one object in `requests` (`tool_specs.py`). Step 6 says "one request" so the call matches the packaged tool. Nothing the source prescribes about the call changed.
  - Nothing else that the source prescribes was changed.
- Runtime dependency: keys the server reads from `~/.supercmo/.env` or the environment. For `image_generate` with `gpt-image-2`: the user's `WAVESPEED_API_KEY` or `FAL_KEY`, or the managed key. For `image_analysis`: the user's `GEMINI_API_KEY`, or the managed key. The catalog prices `gpt-image-2` at $0.06 per image at 1k on WaveSpeed ($0.10 at 2k, $0.18 at 4k) and $0.053 per image on fal. When no key serves the call the tool returns `no_provider_configured` with a hint naming both options; this skill gives no install method beyond relaying it.
- Hooks: the selected files define none.
