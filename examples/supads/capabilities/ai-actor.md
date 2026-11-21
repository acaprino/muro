---
id: ai-actor
role: actor-generation
when: —
after: []
outputs: ["actor_image"]
checks: ["adult_invented_person_stated", "closed_top_written_as_presence", "generated_once_and_handed_back"]
intents: [{"id":"ads.ai-actor","description":"Generate one photorealistic, invented adult person as a single image: an AI actor, influencer, presenter or model, cast deliberately feature by feature. The image is reusable: passed into a later image or video generation it brings the same face, hair and build back, so one person holds across a set of images or videos. Applies when the user wants an AI actor, or when something needs a person and no photo of one was supplied.","excludes":["When a photo of the person was supplied, that photo is the reference and no actor is generated.","An ordinary portrait or picture of a person that is not meant as a reusable actor, or an edit of a supplied photo of a person, is image generation.","Producing the video the actor appears in is video production."]}]
tools: [{"name":"image_generate","purpose":"Generate the actor image in one call with one request object: prompt, model, aspect_ratio and resolution. The prompt goes to the provider serving the model: WaveSpeed with WAVESPEED_API_KEY, else fal with FAL_KEY, else the SuperCMO managed proxy (api.getsupercmo.ai) with SUPERCMO_API_KEY; the image is billed. The finished image comes back as a hosted URL and, when its download succeeds, as a file in the output folder: the server's SUPERCMO_OUTPUT_DIR variable when set, else ./supercmo-media under the server's working directory. The tool has no output folder argument. Unless telemetry is turned off, anonymous usage events (tool name, model, provider, outcome, duration; never prompts, files or keys) go to SuperCMO.","required":true},{"name":"job_status","purpose":"Rejoin a generation that came back pending, with the exact handle object. Polls the provider that holds the job, starts and bills no new one, and saves the finished image the same way image_generate does.","required":true}]
hooks: []
conflicts: []
---

# AI Actor

Generates the image of one AI actor, to be reused as the identity reference of later images and videos. The packaged original, `<package_root>/scripts/supercmo-skills/skills/generating-ai-actors/SKILL.source.md`, is the full version of this method and wins where this body differs from it, except for the changes listed in the Sources section. Anything the brief specifies wins; the defaults below fill gaps only, except where a step says otherwise.

## Behavior

1. **Cast the person.** An adult, always: fill a younger brief with an adult and say so. Keep casual words for young people out of the prompt altogether, even for a plainly adult person: they trip the image model's content filter and lose the generation. Decide each point deliberately; left to the model, the same face comes back every time.
   - Who they are: gender, age, ethnicity, build. An age anywhere from early twenties to late sixties; a build anywhere from slight to athletic, broad or full.
   - How they look, feature by feature, since this is what makes them recognisable when the image is reused. Open "Step 1: Cast the person" in the original for its fifteen lines with their examples: face shape, jaw and chin; cheekbones; eye shape and set; eye colour; eyebrows; nose; mouth; skin texture and tone; hair colour; hair length and how it is worn; hair texture; facial hair; glasses; makeup; one distinguishing feature, or none, and never a mole or a beauty mark. The examples are a starting point, not the choices on offer: reach past them, decide each line separately, and do not cast the same combination twice.
   - Keep the face attractive and the build well-proportioned.
   - Say in the prompt that the person is invented. Open the subject with it, in these words or close to them: "a wholly fictional, non-identifiable person — not a real or public figure, and not resembling any actual individual."
   - What they are wearing: the garments and how they sit on the body, any accessories or jewellery, and how the whole is put together.
   - The top is closed, whatever the brief asks for: the neckline high and the chest fully covered. Anything cut low or strappy is only worn with a closed layer over it. Write the coverage as what is there ("a round-neck T-shirt", "a fully buttoned V-neck cardigan"), never as what is left off: describing the plunge, the skin or the gap tends to put it in the picture.
2. **Set the scene.** A place the brief names is the place; otherwise pick one that fits how the actor will be used, indoors or out. Describe it, since a name alone gives the model nothing to build from: the setting and what surrounds them; what is behind them, as it happens to be rather than arranged; the dominant colours; time of day and weather, where they show; the light (where it comes from, its quality, what it catches). Default to plain, neutral daytime light with no warm tint unless the brief asks otherwise. No studio lighting, no plain backdrop.
3. **Set the shot.** A self-portrait on a phone's front camera; head and shoulders fill the frame, at arm's length; framing slightly tilted, not quite centred; looking into the lens with the face turned toward it, not sideways, not in profile, not glancing off; small-sensor grain, real skin, no retouching, subject sharp and the background falling away on its own; hands empty. Keep out of the prompt: portrait, editorial, studio, posed, retouched, magazine-style, and any professional camera, tripod or lighting rig.
4. **Write the prompt** as prose, one paragraph is enough, in this order: subject (step 1), location (step 2), composition (step 3). The source orders its image skill read before any image call: open `<package_root>/scripts/supercmo-skills/skills/generating-images/references/prompt-nano-banana.md` (or `prompt-seedream.md` after a switch to `seedream-5`) for how the model wants a prompt; this method keeps the model, the order and the content.
5. **Generate and hand back.** One `image_generate` call: `nano-banana-pro` at `3:4` and `resolution` `1k`, unless the brief named a model, a shape or a higher resolution. Generate once, never a second version to compare. A result `{status: "pending", …}` is a job handle, not a failure: pass that exact handle to `job_status`, again if it is still pending, and never re-run a pending generation with `image_generate`, which starts a new, separately billed job. Hand back the image.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `actor_image` as one JSON string: the hosted URL and the local file path of the actor image, the model, ratio and resolution used, and the casting in a few words (age, build, the features that identify the person, wardrobe, setting). For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Safety or NSFW rejection: name a workable stand-in for what tripped the filter (cover the wardrobe, change the setting) and resubmit. Identical inputs fail identically, so change something. If it keeps refusing, switch to `seedream-5`. After a second rejection, tell the user which element is blocked instead of retrying blind.
- A video model refuses the image as a possible likeness of a real person: rewording the prompt changes nothing. Generate a different person, a different face and not a retouch of the same one. If it happens again, change the video model rather than the actor.
- `error: "no_provider_configured"`: relay the tool's `hint`.
- A failure this list does not cover (a call that times out with no handle, an explicit error that names no cause): open "Edge cases" in `<package_root>/scripts/supercmo-skills/skills/generating-images/SKILL.source.md`. Where both speak, this method's own rule wins.
- The tool has no output folder argument: the file goes to the server's `SUPERCMO_OUTPUT_DIR` folder, else `./supercmo-media` under the server's working directory. Report the `path` the result gives, since later generations take the image as a reference by that path or by its URL.

## Checks

- **adult_invented_person_stated**: the person cast is an adult, the prompt opens the subject by saying the person is wholly fictional and non-identifiable, and it holds no casual word for young people.
- **closed_top_written_as_presence**: the wardrobe line gives a high neckline and a fully covered chest, described as the garment that is there.
- **generated_once_and_handed_back**: one `image_generate` call produced one image (`nano-banana-pro`, `3:4`, `1k` unless the brief named otherwise), no second version was generated to compare, a pending handle was rejoined through `job_status`, and the image was handed back.

## Sources

- AI intent mapping: generating-ai-actors → ads.ai-actor.
- Source: supercmo-skills (SupercmoHQ/superCMO-skills@3bf78a42, release v0.1.27) — `skills/generating-ai-actors/SKILL.md` (it has no references); `skills/generating-images/SKILL.md` (its "Edge cases") and its prompt guides `references/prompt-nano-banana.md` and `references/prompt-seedream.md` (step 4), packaged unchanged under `<package_root>/scripts/supercmo-skills/` (the skill file as `SKILL.source.md`). Tool facts were read in `scripts/supercmo_skills/tool_specs.py`, `mcp/tools/image.py`, `client.py` and `paths.py`.
- Read at intake only: the skill's eval cases.
- Changes for coexistence (ADR-0017):
  - The frontmatter trigger ("Use when the user wants an AI actor, or when something needs a person and no photo of one was supplied") is not applied as a trigger: it would start the original as a skill, and the coordinator classifies by meaning. Its meaning is the intent.
  - The source's order to read `generating-images` before any image call (its frontmatter and the tool description of `image_generate`) is kept as the model's prompt guide opened in step 4; no host has a skill of that name here. That this method keeps the model, the order and the content is this intake's reading: the source states no precedence between the two skills.
  - Nothing else was changed.
- Runtime dependency: a provider key, which the plugin does not ship. `WAVESPEED_API_KEY` or `FAL_KEY`, or the managed `SUPERCMO_API_KEY`; the server reads them from its environment or from `~/.supercmo/.env`, and a call without one returns `no_provider_configured` with a hint.
- Hooks: the selected files define none.
