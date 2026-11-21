---
id: video-script
role: scriptwriting
when: —
after: []
outputs: ["video_script"]
checks: ["segments_within_word_budget", "segments_rejoin_to_monologue", "one_segment_per_clip", "speakable_text_only"]
intents: [{"id":"ads.video-script","description":"Write what is said in a video: the words a person speaks on camera or a voiceover heard over the picture, opened by a hook, sized to the time available and split into one segment per clip, each sized to that clip's seconds.","excludes":["Nothing is recorded or voiced here: the result is the words as text only. Recording a voiceover is audio generation.","A request whose deliverable is a finished video is video production, which writes the script as one of its own stages.","The copy fields of an ad platform (headline, primary text, description) are ad copy.","Long-form writing such as a blog post."]}]
tools: []
hooks: []
conflicts: []
reads: ["campaign_concepts", "brand_profile", "product_facts"]
---

# Video Script

Writes the whole monologue first, to the video's total length, then cuts it into one segment per clip. The packaged original, `<package_root>/scripts/supercmo-skills/skills/writing-video-scripts/SKILL.source.md`, is the full version of this method and wins where this body differs from it, except for the changes listed in the Sources section.

## Behavior

1. **Collect what the video has already fixed.** The writing has to fit inside these. Where any is missing, ask for it rather than assuming it:
   - a brief of what the words should communicate; the script is written from it, cut to fit the duration where it will not all fit;
   - how long the video runs in total;
   - how many clips it is, and how many seconds each one runs;
   - which beats of the story land in which clip: what happens on screen, not what gets said;
   - whether the words are spoken on camera or carried as a voiceover;
   - which claims may be made, if any.
2. **Work out the budget.** Speech runs at a fixed pace, so the word count is not a style choice.
   - Aim for 2 to 3 words per second of clip: a 15-second clip wants about 30 to 40 words.
   - Never go past three words per second. That is the ceiling step 6 tests against: a 15-second clip fails at 46 words.
   - The gap between target and ceiling is room for pauses, breath and the beats where the picture carries the moment.
   - Add the per-clip budgets up against the total length before drafting anything. Where a segment runs long, cut words. Never speed up the delivery and never stretch the clip to fit the writing.
3. **Write the hook before any other line.** The first three seconds decide whether the rest is watched. The hook fits in three seconds: six to ten words at speaking pace. Pick one pattern and commit to it:
   - problem: name a symptom the viewer is living with right now;
   - contrarian: contradict something the category takes as given;
   - curiosity: point at a specific thing they do not know and signal it is about to be answered;
   - result first: show the outcome with no explanation attached yet;
   - social proof: someone else's experience or number, often relayed rather than claimed. Only where real proof was supplied; otherwise this pattern is closed;
   - scenario drop-in: start mid-situation, already recognisable, with no setup;
   - pattern interrupt: an ordinary scene with one thing visibly wrong, played straight;
   - listicle: state a defined scope up front.
4. **Write the monologue.** The hook is its first line; everything after carries that thought forward and finally closes the gap it opened.
   - It has to sound spoken, not read: contractions, sentence fragments, a thought that restarts, the occasional aside. Full, balanced sentences are the clearest sign of a script.
   - Specific beats general, every time. Make a point once.
   - Write only what can be said aloud. Punctuate with commas and full stops. No dashes or em dashes, no brackets, no stage directions, no speaker labels, no emoji.
5. **Split it into segments**, one per clip, each covering the beats step 1 gave that clip. The video should sound like one take cut into pieces.
   - Cut where the ear already hears a break: the end of a sentence, a comma, the join between two clauses. Mid-sentence is fine; mid-phrase is not.
   - Prefer fewer, longer segments: where two neighbouring sentences both fit inside one clip's budget, keep them together.
   - Do not change the words at the seam. Joined back in order, the segments reproduce the monologue exactly: nothing reworded, reordered, added or dropped. If a split only works by rewriting, the monologue is wrong: go back to step 4.
   - Only the first segment introduces anything. Every later one picks up mid-thought: no greeting, no saying what the product is again.
6. **Check every segment against its clip.** A segment that fails either test is rewritten, not shortened at the edges, then tested again.
   - Does it fit the seconds? Count the words against that clip's budget from step 2.
   - Does it match what is on screen? The words have to belong to the beats that clip actually shows.
   - Cutting frees budget. Spend it on a beat that earns it, or let the clip run quieter.
7. **Hand the segments back**: one segment per clip, in order, each tied to its clip. Music is never added unless the user asks for it. Where they do, say so when handing back: that request has to carry through into the clip prompts.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `video_script` as one JSON string: the full monologue, then one segment per clip in order, each with its clip, the clip's seconds and its word count, whether the words are on camera or a voiceover, and whether the user asked for music. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Checks

- **segments_within_word_budget**: every segment was counted against its clip and holds no more than three words per second of that clip.
- **segments_rejoin_to_monologue**: the segments joined in order reproduce the monologue exactly, with nothing reworded, reordered, added or dropped.
- **one_segment_per_clip**: there is one segment per clip, in order, each tied to its clip and matching the beats that clip shows.
- **speakable_text_only**: the script holds only words that can be said aloud, punctuated with commas and full stops; nothing was recorded or voiced.

## Sources

- AI intent mapping: writing-video-scripts → ads.video-script.
- Source: supercmo-skills (SupercmoHQ/superCMO-skills@3bf78a42, release v0.1.27) — `skills/writing-video-scripts/SKILL.md`, packaged unchanged under `<package_root>/scripts/supercmo-skills/` (as `SKILL.source.md`). The skill has no references and no scripts.
- Changes for coexistence (ADR-0017):
  - The source's frontmatter trigger ("Use when the user wants a script, dialogue, or a voiceover written for a video") is not applied: it would start the original as a skill, and the coordinator classifies by meaning.
  - Nothing else that the source prescribes was changed.
- Runtime dependency: none. The step calls no tool and needs no key.
- Hooks: the selected files define none.
