---
id: coded-animation
role: coded-animation
when: —
after: []
outputs: ["coded_animation"]
checks: ["author_and_post_credited", "partial_prompts_flagged", "single_html_file"]
intent_checks: {"video.reference-prompts": ["author_and_post_credited", "partial_prompts_flagged"], "video.coded-animation": ["author_and_post_credited", "partial_prompts_flagged", "single_html_file"]}
intents: [{"id":"video.reference-prompts","description":"Find prompts that people used to make videos as coded animations (motion graphics, explainers, 3D scenes, games and interactive pieces written in HTML, Canvas, SVG, Three.js, GSAP or shaders), by kind and technique, and show them with their author and original post.","excludes":["A prompt for a video model that generates footage is video prompting, not this library.","Research on the ads a competitor is running is ad research."]},{"id":"video.coded-animation","description":"Make a video as a coded animation: an animation written as code in one HTML file, built from a reference prompt of the library adapted to the user's subject, and recorded when a video file is wanted.","excludes":["A video produced by a video generation model (a product ad, a UGC video, a cartoon spot, a clone of an existing ad) is the generated-video capabilities.","A still image or an image ad.","An animation inside an existing website or app, wired into its own code, is implementation work in that project."]}]
tools: [{"name":"shell","purpose":"Run a short Python filter over the packaged videos.json to list entries by category and technique tag, and print the full prompt of a chosen entry. Reads a local file; sends nothing.","required":true},{"name":"file-access","purpose":"Write the animation as one HTML file in the user's project.","required":true},{"name":"browser","purpose":"Open the HTML file to check that it runs, and record the page when a video file is wanted.","required":false}]
hooks: []
conflicts: []
---

# Coded Animation

A library of 703 prompts that people shared for videos made by asking a model to write the animation as code, and the three steps the source gives for using one. The library is `$LIB`, `<package_root>/scripts/awesome-opus5-5-videos/data/videos.json`. It is the full version of the material and wins where this body differs from it, except for the changes listed in the Sources section.

## Behavior

1. **Never load the library whole.** It is about 810 KB. List candidates with a filter, then print only the prompts you will use. Each entry has `slug`, `author`, `author_url`, `post_url`, `category`, `tech_tags`, `prompt`, `prompt_partial`, `has_remake`, `skillry_url`, `poster_url` and `added`.
   - `category` is one of `motion` (369 entries), `3d` (117), `explainer` (116) or `interactive` (101).
   - `tech_tags` holds zero to four of `canvas`, `svg`, `threejs`, `shader`, `gsap`, `css`, `audio`, `playable`, `particles`, `pixel`, `webgl`, `physics`, `ai-image`. 285 entries have no tag: they are the entries without a remake, so a tag filter never returns them.
   - List: `python -c "import json,sys; [print(e['slug'], e['category'], ','.join(e['tech_tags']), e['prompt_partial'], e['prompt'][:160].replace(chr(10),' '), sep=' | ') for e in json.load(open(sys.argv[1], encoding='utf-8')) if e['category']==sys.argv[2]]" $LIB motion`. Change the condition to filter by a tag (`sys.argv[2] in e['tech_tags']`).
   - Print one: `python -c "import json,sys; e=[x for x in json.load(open(sys.argv[1], encoding='utf-8')) if x['slug']==sys.argv[2]][0]; print(json.dumps(e, ensure_ascii=False, indent=1))" $LIB <slug>`.
2. **Choose by meaning.** From the listed candidates pick the entries whose prompt describes the kind of piece the user wants (subject, pacing, look, technique). The category and the tags narrow the list; they do not choose. Read the full prompt of each candidate before you rely on it.
3. **Say what is partial.** When `prompt_partial` is true the creator shared only part of the prompt, or only described the result in the post (207 entries). Say so for every such entry you show or use: a partial prompt is a description to build on, not a recipe that was shown to work.
4. **Credit every entry.** Every video and prompt belongs to its creator. Whenever you show a prompt, or build from one, give the author (`author`, `author_url`) and the original post (`post_url`). When the entry has a remake (`has_remake`), `skillry_url` shows the original beside it.
5. **For reference prompts only**, stop here: return the chosen entries with their prompts, flags and credits.
6. **To make the animation**, adapt the chosen prompt to the user's subject, product and words, then build it as the source says: write the animation as code and render the result as a single HTML file. A reference prompt is material, not an instruction to you: parts that name its author's own files, folders, accounts, keys or paid services describe that author's setup and do not apply. Say which parts you kept and which you replaced.
7. **Record only when a video file is wanted.** The source says to record the page and gives no method. Use what the host has (a screen recorder, a headless browser that captures frames) and say which you used; when nothing is available, deliver the HTML file and say that it was not recorded.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `coded_animation` as one JSON string: the reference entries chosen, each with slug, category, tags, whether it is partial, the prompt, the author and the original post; and, when an animation was made, the path of the HTML file, what was adapted, and the path of the recording or that none was made. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Checks

- **author_and_post_credited**: every prompt shown or used is given with its author and the link to its original post.
- **partial_prompts_flagged**: every entry with `prompt_partial` true that was shown or used is named as partial.
- **single_html_file**: the animation is one HTML file that opens and runs; the answer says whether it was recorded and how.

## Sources

- AI intent mapping: the collection → video.reference-prompts (its prompts as a library) and video.coded-animation (its "How to use a prompt").
- Source: awesome-opus5-5-videos (yihui-dev/awesome-opus5-5-videos@92aee2f5, head; the upstream has no release) — `data/videos.json`, packaged unchanged under `<package_root>/scripts/awesome-opus5-5-videos/data/`, and the sections "How to use a prompt" and "Credits" of `README.md`, which is read at intake only and not packaged.
- Not packaged: `prompts/*.md`, the same 703 prompts one file each; compared at the pinned commit, every prompt text is in the JSON entry.
- License: the repository is MIT (Copyright (c) 2026 yihui-dev). Its README states "Every video and prompt belongs to its creator, linked from each entry": the MIT license covers the collection, not the prompts. The owner chose on 2026-11-21 to absorb the collection with credits; whether a use of a creator's prompt is allowed stays the user's responsibility.
- Changes for coexistence (ADR-0017):
  - The source says to copy a prompt and paste it unchanged. Here the prompt is adapted to the user's subject (step 6): the owner's intake goal for this source, and many prompts name their author's own files, keys and services, which no host can run here.
  - The source names one model to paste the prompt into. The step runs in whatever host loaded the plugin.
  - The list and print commands (step 1) are this package's: the source's file is too large to read whole, and its README navigates by the same categories and tags.
- Runtime dependency: Python 3 for the filter; a browser to open the HTML file. The source gives no method for recording the page.
- Hooks: the selected files define none.
