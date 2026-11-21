---
id: audio-generation
role: audio-generation
when: —
after: []
outputs: ["audio_clips"]
checks: ["script_settled_before_generating", "voice_id_from_list_voices", "speech_only_from_audio_generate", "audio_paths_returned"]
intents: [{"id":"ads.speech-generation","description":"Turn a script into spoken audio delivered as its own audio file: a voiceover, narration, an ad read, a character line or any text read aloud. Covers choosing the speech model and the voice, preparing the text so it is read correctly, and splitting a long script into clips.","excludes":["Music, sound effects, ambience, re-voicing or dubbing an existing recording, and cloning a voice from a sample are not produced.","Mixing or timing tracks (a voiceover under music, an effect on a logo) is left to the user's editor.","Lip-synced dialogue spoken by a character inside a video clip is video generation.","A still image or a video."]}]
tools: [{"name":"audio_generate","purpose":"Submit 1 to 10 speech requests in one call, billed per character. Each text, voice id and delivery setting goes to ElevenLabs on the user's own key, else to SuperCMO's managed proxy. The server saves each clip (mp3 unless `format` says otherwise) into its media output folder and returns its local path.","required":true},{"name":"list_voices","purpose":"List the voices saved in the active ElevenLabs account (the user's own on their key, the shared SuperCMO set on a managed key). The search text goes to that provider. Returns each voice's id, gender, accent, age, use case and a preview URL. Writes nothing.","required":true},{"name":"list_audio_models","purpose":"Read the server's own catalog of speech models: strengths, price, per-request character limit, languages and output formats. Nothing leaves the machine.","required":false}]
hooks: []
conflicts: []
resumable: true
---

# Audio Generation

Turns a script into speech through the `audio_generate` tool. Two decisions drive the quality: which voice reads it, and how the script is written for the ear. The packaged original, `<package_root>/scripts/supercmo-skills/skills/generating-audio/SKILL.source.md`, is the full version of this method and wins where this body differs from it, except for the changes listed in the Sources section. Its reference is `<package_root>/scripts/supercmo-skills/skills/generating-audio/references/directing-the-read.md`.

## Behavior

1. **Keep to speech.** This makes a voice reading written words, as its own audio file. It makes no non-speech sound, alters no existing audio and combines no tracks. Where part of the brief is speech and part is not, state the limits in one message first, then deliver the speech. Never generate first and disclose the gaps after.
2. **Settle the script.** Generate only from the exact words that will be spoken.
   - Words supplied: use them verbatim.
   - Enough is known to write them (product, audience, platform, length): draft the script and show it before generating.
   - Not enough: ask. Never invent a tagline, a product claim or a brand name to fill the gap.
   - Write to a duration. Speech runs about two to three words a second, so a fifteen-second read is thirty to forty-five words. Set the word count before writing, and trim words rather than speeding up the delivery.
3. **Pick the model.** `eleven-v3` is the default: the most expressive read. Use another only on a clear signal: a long, even read where the voice must not drift (an explainer, documentary narration, an audiobook chapter) → `eleven-multilingual-v2`; a high-volume, throwaway or cost-sensitive read where expressiveness does not matter → `eleven-flash-v2.5`. A model the user names is used. Character limits per request differ sharply between models, and a script over the limit is rejected, not truncated: `list_audio_models` gives each ceiling.
4. **Pick the voice.** Call `list_voices`, filtered by what the brief demands: `gender`, `accent`, `age`, `use_case`, `language` or free-text `search`. There is no default voice: every request needs a `voice_id` chosen here and passed as `voice`. Display names are not accepted.
   - A stated gender, accent or age is a hard filter. Read the attribute from the row's own fields, never from the voice's name.
   - Unless the user named a voice, offer two or three candidates with their `preview_url` and let the user pick. Choose on tone: what the listener is doing, and whose voice it is meant to be.
   - For a script that is not in English, check the row's `language` and that the chosen model covers it.
   - A `voice_id` the user pastes is taken as given. Reuse the chosen `voice_id` for every clip in the job.
   - Nothing matched is a normal result. Drop the narrowest facet (`use_case` first, then `age`) and search again. Only when gender and accent alone come back empty is the account short of voices: relay the tool's hint word for word.
5. **Prepare the text.** `text` is read out word for word. Strip anything unspoken: stage directions, speaker labels, bracketed cues, markdown. Spell out numbers, dates, currency, acronyms and URLs as a person would say them. Punctuate for pacing: commas and full stops become pauses. Direct the delivery with `stability` and `style`, never with instructions written into the text.
6. **Generate.** Speech comes only from `audio_generate`. If it errors, or no voice fits, say so and stop. Never substitute another text-to-speech tool the host exposes: another engine means another voice, no access to the account's voices, and output outside the media folder.
   - Call `audio_generate` with a `requests` list, one object per clip, up to ten per call. Per object: `text` and `voice` (both required); `model` only when step 3 chose a non-default; `speed`, `stability`, `style`, `similarity_boost`, `format` as needed.
   - Split only where the audio will be cut: per scene, or per section placed separately. A continuous read split across two objects seams audibly.
   - Hold one `voice` and one `model` across every object. In a dialogue, one voice per character, the same across that character's lines.
   - For alternate takes repeat a line: different voices when the choice is unclear, or the same voice twice at low `stability`. Worth it on one short line, not on a whole script.
7. **Return.** Share the audio file path or paths. When the script was split, label each with the section it covers.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `audio_clips` as one JSON string: each clip's local path and the section it covers, the script as spoken, the model, the `voice_id` and the delivery settings used, the parts of the brief that were declined as not speech, and any line that failed. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Delivery settings: when delivery matters send them explicitly, because leaving them out gives whatever that voice was saved with, not the documented defaults. Start from `stability` 0.5, `similarity_boost` 0.75 and `style` 0 and move one value at a time. `speed` runs from 0.7 to 1.2, default 1.0; never use it to make a long script fit. Leave `style` at 0. Open the reference for what each value does, and for its section "When a read comes out wrong" when a read is flat, erratic, mispronounced or stressed on the wrong word (it keeps clips under 800 characters where quality or accent drifts).
- Other asks: for music, sound effects, ambience, re-voicing, dubbing or cloning a voice from a sample, say so plainly and substitute nothing. Do not generate a video clip to get music or effects out of its audio: that bakes the sound into the picture. A voice that is already cloned works by its `voice_id`; another language works by translating the script and generating it fresh. Where tracks need mixing or timing, deliver clean speech and let the user assemble it.
- Failures: a script over the model's character limit is split at a natural break or moved to a model with a higher ceiling. `no_voices_available`: relay the hint, which tells an empty account from a key that may not read voices. Part of a batch fails: keep the takes that worked and resend only the failed lines. A safety rejection: remove the sensitive wording and retry once. Any other failure: retry once as it is, then report the error. `no_provider_configured`: relay the tool's `hint`.
- Where files land: the server saves each clip into its media output folder, which is the folder named by `SUPERCMO_OUTPUT_DIR` in the server's environment, else `./supercmo-media` under the server's working directory. `audio_generate` takes no output folder argument. Give the user the `path` the tool returns.
- Runtime dependency: an ElevenLabs key (`ELEVENLABS_API_KEY`) or the SuperCMO managed key, read by the server from its environment or `~/.supercmo/.env`. The account must hold voices: a new ElevenLabs account starts empty, and voices are added in the ElevenLabs dashboard. No external program is needed.

## Checks

- **script_settled_before_generating**: the spoken text is the supplied words verbatim, or a draft that was shown before generating; no tagline, claim or brand name was invented.
- **voice_id_from_list_voices**: every request carried a `voice_id` from a `list_voices` row or pasted by the user, a stated gender, accent or age was kept as a filter, and one voice and model held across the job (one voice per character in a dialogue).
- **speech_only_from_audio_generate**: all speech came from `audio_generate`; no other text-to-speech tool was used, and anything asked for that is not speech was declined in words before generating.
- **audio_paths_returned**: the file path of every clip was returned, each labelled with its section when the script was split.

## Sources

- AI intent mapping: generating-audio → ads.speech-generation.
- Source: supercmo-skills (SupercmoHQ/superCMO-skills@3bf78a42, release v0.1.27) — `skills/generating-audio/SKILL.md` and `references/directing-the-read.md`; the tool schemas in `scripts/supercmo_skills/tool_specs.py`, their behaviour in `client.py`, `providers/elevenlabs.py` and `paths.py`; packaged unchanged under `<package_root>/scripts/supercmo-skills/` (the skill file as `SKILL.source.md`).
- Changes for coexistence (ADR-0017):
  - The source's frontmatter triggers ("ALWAYS read this skill before generating spoken audio or calling audio_generate", "Use whenever ...") are not applied: they would start the original as a skill, and the coordinator classifies by meaning. Their meaning is in the intent.
  - "Lip-synced dialogue ... belongs to `generating-videos`" is carried as an intent boundary, not as a hand-over inside the step: that output has its own capability, and the coordinator owns the routing.
  - Nothing else that the source prescribes was changed.
- Runtime dependency: `ELEVENLABS_API_KEY` or the SuperCMO managed key, and voices in the account. The tools check both themselves (`no_provider_configured`, `no_voices_available`, each with a hint). No program or library is installed.
- Hooks: the selected files define none.
