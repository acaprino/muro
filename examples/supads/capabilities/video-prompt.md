---
id: video-prompt
role: video-prompting
when: —
after: []
outputs: ["video_prompts"]
checks: ["one_prompt_per_clip", "beats_add_up_to_clip_length", "speech_segment_exact", "no_generation_call"]
check_conditions: {"speech_segment_exact": "Someone speaks in the clip, on camera or as a voiceover."}
intents: [{"id":"ads.video-prompt","description":"Write or fix the motion prompt of each clip of a video, in the shape its chosen video model wants: what moves, how the camera behaves, the physics and the audio. It works from a brief alone, a start frame, a source video or a storyboard sheet where each panel becomes a cut, and returns one prompt per clip. It applies when the clip's model, duration and content are settled.","excludes":["Nothing is generated here: the result is prompt text only. Rendering the clip is video generation.","A request whose deliverable is a finished video (an ad, a UGC video, an animated photo) is video production, which writes its prompts as one of its own stages.","A prompt for a still image is image generation work.","The words spoken in the video are script work; this step places a given script segment and does not write it."]}]
tools: [{"name":"file-access","purpose":"Read the packaged prompt guide of the chosen model. Nothing is written or sent.","required":true},{"name":"image_analysis","purpose":"Read a storyboard sheet panel by panel before writing, when the clip has one. Sends the image (a local file is encoded and sent, a URL is passed on) and the question to Google Gemini with the user's GEMINI_API_KEY, or to SuperCMO's managed proxy with the managed key, which is billed per use. Returns text, no media. The server also sends its anonymous, opt-out usage event for the call (tool name, model, outcome; never prompts, files or keys).","required":false},{"name":"list_video_models","purpose":"List the server's video models with the inputs each accepts, for a model that has no guide here. Reads the packaged catalog; generates nothing.","required":false}]
hooks: []
conflicts: []
reads: ["video_script", "storyboard_sheets"]
---

# Video Prompt

Turns each clip of a video into a prompt its model will honour. Text only: nothing is generated here. A video may be one clip or several; clips in one video share a model, an aspect ratio and a look. Write only what the clip has: no person on camera means no performance direction, no product means no product rules, no speech means no dialogue. The packaged original, `<package_root>/scripts/supercmo-skills/skills/writing-video-prompts/SKILL.source.md`, is the full version of this method and wins where this body differs from it, except for the changes listed in the Sources section. `$REF` below is `<package_root>/scripts/supercmo-skills/skills/writing-video-prompts/references`.

## Behavior

1. **Read what the clip has.** Ask only for what would change the prompt and cannot be defaulted:
   - the model and the duration. Where no model was named, use `seedance-2.0-fast` and say so. The aspect ratio is a call parameter, not prompt text: carry it if given, do not ask;
   - what happens in the clip, as beats or as a single action;
   - the media and what each one is for: a storyboard sheet, a start frame, an end frame, reference images, a source video, an audio track. Any may be absent, and they differ from clip to clip;
   - the dialog segment where anyone speaks, and whether they are on camera or heard over the picture.
2. **Pick the clip's form.** With a storyboard sheet, one cut per panel: panel 1 is the first cut, panel 2 the second, hard cut between them. Without a sheet, cut only where the brief asks for one. Where a beat's opening frame is fixed by a panel or a start frame, the hands, the grip, the product, the props and the positions are already there: write what happens next, not how it starts. Write "a hand reaches in" or "she brings it into frame" only when the frame has no such element; introducing something already there renders a second one.
3. **Read the chosen model's guide.** `seedance-2.5` and `seedance-2.0`: `$REF/prompt-seedance.md`. `veo-3.1`: `$REF/prompt-veo.md`. `gemini-omni` and `gemini-omni-1.1`: `$REF/prompt-gemini-omni.md`. `kling-3.0-pro`: `$REF/prompt-kling.md`. `grok-imagine-video`: `$REF/prompt-grok.md`. `wan-2.7` and `wan-3.0`: `$REF/prompt-wan.md`. The `-fast`, `-lite`, `-turbo`, `-standard` and `-mini` variants share their family's guide. A model with no guide: call `list_video_models` for its accepted inputs and write to the guide of the family it most resembles.
   - The guide owns how the prompt is laid out: the order of the elements, how references are labelled, how speech and sound are marked, how to keep something out of frame. Follow it on those over anything the steps here imply about layout.
   - It does not own which sections the prompt is built from or their order (step 6), and it does not decide whether the clip cuts (step 2).
4. **Label the media.** Where more than one piece of media goes on the call, name each one in the prompt in the order it will be passed and say once what each is, in the guide's convention (a numbered slot, a tag or plain words). A single start frame and nothing else needs no label: say what the clip opens on.
   - A storyboard sheet: labelled once at the top as the storyboard for this clip. Do not contradict it and do not caption it: write each panel's beat in motion.
   - A start or end frame: named as the frame the clip opens or closes on.
   - The person: labelled on first mention in a beat, then the plain noun. Repeating the label later in the same beat snaps the render back to the reference.
   - The product: pointed at by its label and its name, never described: words about its colour, finish, shape or markings compete with the image and the sheet. A fuller description from the plan is for your reference, never for the prompt. Label it where it is shown intact (first introduction, a hero close-up, a label point-out). Drop the label during any verb that changes it (opening, tearing, pouring, scooping, applying, drinking, mixing, putting on) and pick it up again once it is shown intact. With several product images, point at the one that shows the angle the beat needs.
   - Never put a label inside quoted speech: quoted text is read aloud as written.
5. **Read the storyboard**, where the clip has a sheet: run `image_analysis` on it before writing and take from each panel as it rendered the camera position, the framing distance, the action, which hand is doing what, where the product is (held, set down, worn, hidden, absent) and the expression. Where the sheet and the plan disagree, the sheet wins: write the cut to the panel and say which panel disagreed and how.
6. **Write the clip.** Every prompt has the same sections in this order: the look, what the clip is, the beats, the audio, the closing block. Leave out a section the clip has no use for; never reorder them and never fold one into another.
   - The look: one line with the light and how the camera behaves across the clip, plus the delivery register where anyone speaks.
   - What the clip is: one sentence saying who is in it, where they are and what happens across the whole clip. Never a beat of its own.
   - The beats, in order. Each cut is one or two sentences carrying one verb that moves something; a second moving verb is a second cut. Each beat runs two seconds of the clip where possible, three at most, and they add up to its length exactly.
   - With cuts, head each with its number and span, as in `Cut 2 (3.5-7s):`, and end every cut but the last with a hard-cut instruction on its own line; both go in whatever the guide says about timings. Without cuts, time the beats only where the model's guide uses timings.
   - The first beat opens already underway, not on a held pose. Where a frame is fixed it opens exactly on what that shows: nothing enters and nothing changes state before the motion starts. With a person on camera, hands are already moving or a reaction is already on the face, and the first words land at the top of the beat.
   - The camera, in every beat: where a sheet or start frame fixes what is in frame and where the camera sits, write only how it moves; without one, write the framing and position too. Locked off means the frame does not move and everything moves inside it, so keep any word suggesting an unsteady grip or a travelling lens out of those beats. At arm's length the camera is the phone, with a small natural unsteadiness, and no handset, screen or reflection of either is in shot.
   - The person: count hands at every moment. A phone at arm's length takes one hand, a locked-off shot leaves both; a third job renders a third hand. Where hands do not matter to the beat, leave them out. An arm's-length beat that needs two working hands cannot be shot as framed: send it back to the storyboard to be re-framed. For performance, open "6e" of the original's Step 6.
   - Every beat is bounded by six rules. One action per beat. Nothing below limb scale: moving, holding, tilting, lifting, gesturing and walking render; unscrewing a cap, pulling a drawstring, pumping a pump head, working a zip or a clasp do not, so open with the thing already in its new state. Interactions respect the physical chain; where it will not fit, open the clip further along it. Positions hold through a beat unless a visible movement changes them, and once changed stay changed. Describe only what the media show. Nothing can be written as absent: a thing named is a thing rendered, whether object, action or sound.
   - Do not restate what the media show, but write the prompt full: written thin, the image wins and the clip comes back as held poses.
7. **Write the audio**, where the clip carries sound. Split the clip's script segment across the beats at natural phrase breaks, roughly in proportion to their lengths. The words are exact: no rewording, insertions or deletions, and the pieces reassemble into the whole segment with nothing heard twice. Mark the speech the way the model's guide marks it. For the audio line, the closed-mouth moment in each beat, ambience (two or three sounds at once) and music (never named or implied unless the user asked), apply "Step 7: Write the audio" of the original in full.
8. **Close the prompt.** Every prompt ends on this block, after the audio, word for word: "Faces clear and undistorted, two hands per person, properly formed. No mirror, screen or glass showing anyone reflected. No on-screen text, no subtitles, no captions, no logo, no watermark." Cut the clauses about people where nobody is on camera. Add what the model's guide names as that model's own recurring defects, in the same plain form.
9. **Hand the prompts back.** Write every clip's prompt before any of them is generated. Hand back one prompt per clip, in order, each tied to its clip, with the media that go with it and the order they were labelled in.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `video_prompts` as one JSON string: for each clip in order, its prompt, the model and duration, the media that go with it in the order they were labelled, any panel that disagreed with the plan, and any beat handed back as not fitting. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- No beats were supplied, only a brief: write the clip as one continuous shot and split it into beats yourself, to the seconds in step 6.
- The beats need more time than the clip has: say so and hand back the beats that fit. Do not compress them into fewer seconds.
- A start frame arrives alongside reference images: they cannot be sent on one call. Say which the clip should keep and write the prompt for that form.

## Checks

- **one_prompt_per_clip**: there is one prompt for every clip, in order, each tied to its clip with its media and their label order.
- **beats_add_up_to_clip_length**: in each prompt every beat runs at most three seconds and the beats add up to the clip's length exactly.
- **speech_segment_exact**: the spoken pieces across the beats reassemble into the clip's script segment word for word, with nothing heard twice and no label inside quoted speech.
- **no_generation_call**: the step returned prompt text only; no image, video or audio generation tool was called.

## Sources

- AI intent mapping: writing-video-prompts → ads.video-prompt.
- Source: supercmo-skills (SupercmoHQ/superCMO-skills@3bf78a42, release v0.1.27) — `skills/writing-video-prompts/SKILL.md` and its six `references/prompt-*.md` guides (seedance, veo, gemini-omni, kling, grok, wan), packaged unchanged under `<package_root>/scripts/supercmo-skills/` (the skill file as `SKILL.source.md`). Tool behaviour read in `scripts/supercmo_skills/tool_specs.py`, `mcp/tools/analyze.py`, `mcp/tools/video.py` and `client.py`.
- Changes for coexistence (ADR-0017):
  - The source's frontmatter trigger ("Use when a clip's model, duration and content are settled and it needs the prompt written") is not applied: it would start the original as a skill, and the coordinator classifies by meaning. Its condition is kept in the intent description.
  - Nothing else that the source prescribes was changed.
- Runtime dependency: for `image_analysis` only, a key the server reads from `~/.supercmo/.env` or the environment: the user's `GEMINI_API_KEY`, or the managed key. The rest of the step needs no key. The source gives no install method in this skill.
- Hooks: the selected files define none.
