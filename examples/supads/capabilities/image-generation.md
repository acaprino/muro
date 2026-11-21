---
id: image-generation
role: image-generation
when: —
after: []
outputs: ["images"]
checks: ["model_guide_read_before_prompt", "resolution_1k_unless_asked", "pending_rejoined_not_rerun", "urls_and_paths_returned"]
intents: [{"id":"ads.image-generation","description":"Turn a text brief, optionally guided by reference images (a character, a style to follow, an existing photo to edit), into one or more still images: general images, graphics and posters, portraits, illustrations, cinematic stills, infographics, thumbnails and one-off edits of a supplied image such as a background swap. The brief is routed to the image model that fits what the image has to do and the prompt is written to that model's guide.","excludes":["Commercial photography of a product being sold (a packshot, a product in a styled scene, a hero or banner for a product, an on-model or try-on shot, restyling an existing product photo) is product photography.","A product advertisement (a headline, an offer or a call to action drawn over the product, a promotional before/after or comparison) is an image ad.","The result is a still image; a video clip is not made here."]}]
tools: [{"name":"image_generate","purpose":"Generate still images, one request object per image and at most 10 per call; each carries prompt, model, aspect_ratio, resolution and up to 10 reference_images (local paths or URLs). The prompt and the references (a local file is read and sent to that provider) go to the provider serving the model: WaveSpeed with WAVESPEED_API_KEY, else fal with FAL_KEY, else the SuperCMO managed proxy (api.getsupercmo.ai) with SUPERCMO_API_KEY; every image is billed. Each finished image comes back as a hosted URL and, when its download succeeds, as a file in the output folder: the server's SUPERCMO_OUTPUT_DIR variable when set, else ./supercmo-media under the server's working directory. The tool has no output folder argument. dry_run previews the requests without spending. Unless telemetry is turned off, anonymous usage events (tool name, model, provider, outcome, duration; never prompts, files or keys) go to SuperCMO.","required":true},{"name":"job_status","purpose":"Rejoin a generation that came back pending, with the exact handle object, up to 10 handles per call. Polls the provider that holds the job, starts and bills no new one, and saves a finished image the same way image_generate does.","required":true},{"name":"image_analysis","purpose":"Read a supplied reference image, or up to 10 in one call, and answer a question about each; returns text and writes nothing. The image (a local file is read and sent inline) and the question go to Google Gemini with GEMINI_API_KEY, else to the SuperCMO managed proxy. Used only when references are supplied.","required":false},{"name":"list_image_models","purpose":"List the image models with strengths, price, accepted aspect ratios, resolution tiers and the reference image limit on the provider that will serve each, optionally filtered by a keyword. Reads the bundled catalog; nothing goes to a provider.","required":false}]
hooks: []
conflicts: []
---

# Image Generation

Turns a brief (text, optionally with reference images) into still images through `image_generate`. Two decisions drive quality: which model, always, and which format recipe, only when the deliverable is a known one. `$GI` below is `<package_root>/scripts/supercmo-skills/skills/generating-images`. The packaged original, `$GI/SKILL.source.md`, is the full version of this method and wins where this body differs from it, except for the changes listed in the Sources section. The source orders it read before any image is generated or edited; the other image capabilities of this package open it inside their own steps. The server's tool description says to load the `generating-images` skill first: in this package that is this capability, never a host skill of that name.

## Behavior

1. **Stay on this surface.** This capability makes general images. When the brief turns out to be product photography or a product advertisement (the intent's boundaries), say which and stop: the coordinator routes it.
2. **Route to a model** by what the image has to do. The rows are signals to weigh, not a literal router.
   - Words rendered legibly, or a designed layout with elements in deliberate positions (a poster, ad, banner, thumbnail, infographic): `gpt-image-2`, guide `$GI/references/prompt-gpt-image-2.md`.
   - A drawn or rendered look rather than a photograph (cartoon, anime, illustration, flat vector, 3D render): `nano-banana-2`, guide `$GI/references/prompt-nano-banana.md`.
   - A convincing real person, or a photographic frame with deliberate cinematography (a creator or influencer portrait, UGC, a film-like still): `nano-banana-pro`, same guide.
   - Altering a supplied image (swap a background, remove or replace an element, restage the scene): `gpt-image-2`. Where a real face must stay recognisable: `seedream-5`, guide `$GI/references/prompt-seedream.md`.
   - When more than one applies, in this order: (1) the user named a model, use it; (2) legible text is required, `gpt-image-2`, even over a person or a scene; (3) the look is non-photographic, `nano-banana-2`, even when a person is involved; (4) a supplied image is being altered, `gpt-image-2`, or `seedream-5` when a real person must stay recognisable; (5) a supplied image is only a style or mood cue, `nano-banana-2`, or `seedream-5` if a specific face must carry over too.
   - Nothing clearly fits (an ordinary object or scene): `nano-banana-2`, or call `list_image_models` and pick by `strengths`. Use `grok-imagine` (`$GI/references/prompt-grok.md`), `flux-2-pro` or `flux-2-klein-4b` (both `$GI/references/prompt-flux.md`) only when the user names them.
   - Read the chosen model's prompt guide before writing anything.
3. **Read a format recipe when one fits.** Poster, ad, banner or social graphic: `$GI/references/format-poster.md`. Portrait, avatar or influencer: `$GI/references/format-portrait.md`. Cinematic still: `$GI/references/format-cinematic.md`. Follow its sections and example. When none matches, skip this step: the prompt guide is enough.
4. **Get missing inputs.** Ask only for what would change the result and cannot be sensibly defaulted: the exact text that has to appear on the image, a source image for an edit, the aspect ratio when it decides the crop. Bundle it into one ask. When the user has signalled they want no questions, choose sensible defaults, state them in a line and proceed.
5. **Look at the references, only when some are supplied.** Call `image_analysis` on each, asking what the prompt will have to carry: enough to name what must stay fixed and not to contradict the source. Skip it when the content is already known (generated this turn, or it arrived with a description). When the finding changes the routing (a face to keep recognisable, a stylized source), go back to step 2.
6. **Write the prompt** as the model's guide specifies, starting from the recipe's sections and worked example when one was read. With a reference, say what stays fixed (the product, the face, the palette) and what changes. The model sees only this one prompt: specify the whole frame (subject, wardrobe or materials, setting, lighting, colour palette, camera and lens, medium, mood) in dense, concrete terms, not a thin one-liner or vague adjectives.
7. **Generate.** Call `image_generate` with a `requests` list, one object per image: `prompt` (required), `model` from step 2, `aspect_ratio`, `resolution` at `1k` unless the user asked for a higher tier, `reference_images` for a supplied source. For several different images (an A/B set, a carousel) add one object per image to the same call.
   - Requests are generated independently, so a back-reference ("the same woman", "same outfit") gives a different result each time. For one subject or style across a set, write the appearance, wardrobe and style once and repeat that description word for word in every request; vary only the shot, framing and aspect ratio, and hold one lighting and palette.
   - A heavy image (a large model, 4k, a big batch) can come back as `{status: "pending", …}`: a job handle, not a failure. Pass that exact handle to `job_status`, again if it is still pending. Never re-run a pending image with `image_generate`: that starts a new, separately billed job.
8. **Return.** Once every image has finished (rejoin pending ones first), share the image URL(s) and local file path(s) with the user.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `images` as one JSON string: for each image the model, aspect ratio and resolution used, its hosted URL and its local file path (or that no file was saved), and any image that failed, with the error text. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Tool limits: at most 10 request objects per call and 10 reference images per request. Every model accepts `1:1` (the default), `16:9`, `9:16`, `4:3` and `3:4`; `4:5` and `21:9` are accepted by some models only. Tiers are `1k` (the default), `2k` and `4k`; asking a model for a tier it cannot render is an error, never a silent downgrade. The default model is `nano-banana-2`. How many references a model takes differs per model and per provider: `list_image_models` reports it.
- Where the files land: the tool takes no output folder argument. It writes into the folder named by the server's `SUPERCMO_OUTPUT_DIR` variable, else `./supercmo-media` under the server's working directory, which on some hosts is not the user's project. Each result carries the absolute `path`; saving is best-effort, so an image whose download failed has only its URL. Report the paths as the result gives them.
- Safety or NSFW rejection: name a workable stand-in for what tripped the filter (cover the wardrobe, change the setting) and resubmit. On a second rejection tell the user which element is blocked instead of retrying blind.
- A call that times out with no handle is still rendering on the server: do not resubmit; wait and tell the user it is still processing.
- Generic failure (an explicit error, not a timeout): when the error names a parameter or a limit, correct that and resubmit. Otherwise resubmit once; if it fails again, give the user the error text.
- `reference_images` rejected on count: the error states the model's limit; drop to it. `error: "no_provider_configured"`: relay the tool's `hint` (the user must set their key).
- Open "Unsafe requests" and "Holding one subject across several images" in `$GI/references/format-portrait.md` when a portrait brief touches them.

## Checks

- **model_guide_read_before_prompt**: the model was chosen by the routing of step 2 (or named by the user) and its prompt guide was read before the prompt was written.
- **resolution_1k_unless_asked**: every request used `1k` unless the user asked for a higher tier.
- **pending_rejoined_not_rerun**: no image that came back pending or timed out was submitted again; each pending handle was rejoined through `job_status`.
- **urls_and_paths_returned**: after every image finished, the user received each image's URL and local file path.

## Sources

- AI intent mapping: generating-images → ads.image-generation.
- Source: supercmo-skills (SupercmoHQ/superCMO-skills@3bf78a42, release v0.1.27) — `skills/generating-images/SKILL.md` and its `references/` (`format-cinematic.md`, `format-portrait.md`, `format-poster.md`, `prompt-flux.md`, `prompt-gpt-image-2.md`, `prompt-grok.md`, `prompt-nano-banana.md`, `prompt-seedream.md`), packaged unchanged under `<package_root>/scripts/supercmo-skills/` (the skill file as `SKILL.source.md`). Tool facts were read in `scripts/supercmo_skills/tool_specs.py`, `mcp/tools/image.py`, `mcp/tools/jobs.py`, `mcp/tools/analyze.py`, `client.py`, `paths.py` and `catalog.py`, and telemetry in `TELEMETRY.md`.
- Read at intake only: the skill's eval cases.
- Changes for coexistence (ADR-0017):
  - The frontmatter triggers ("ALWAYS read this skill before ...", "Use whenever ...") are not applied: they would start the original as a skill, and the coordinator classifies by meaning. The order to read this skill before any image call is kept as a file the other image capabilities open inside their steps.
  - "Hand off to `generating-product-photos`" and "hand off to `generating-image-ads`" become the intent's boundaries and the stop of step 1: a skill that routes to another competes with the coordinator.
  - The tool description's "load the `generating-images` skill" names a skill no host has here; this capability stands for it.
  - Nothing else was changed.
- Runtime dependency: a provider key, which the plugin does not ship. `WAVESPEED_API_KEY` or `FAL_KEY` serves `image_generate`, `GEMINI_API_KEY` serves `image_analysis`, the managed `SUPERCMO_API_KEY` serves both; the server reads them from its environment or from `~/.supercmo/.env`. A call without one returns `no_provider_configured` with a hint that gives both ways to get a key.
- Hooks: the selected files define none.
