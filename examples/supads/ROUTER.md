# Supads AI routing catalog

Intake and harmonization AI derive and normalize intents from sources; the host AI interprets requests using capability descriptions and exclusions. IDs are data, not a Python taxonomy. `when` holds stack constraints; `-` is not activation.
Tool/hook metadata grants no permissions; native registration is declared in delivery.json.
Merges and edges need source-grounded reasons. GUIDE.html illustrates, never classifies.

| id | role | when | after | outputs | intents |
|---|---|---|---|---|---|
| media-setup | setup | — | — | setup_status | ads.media-setup, ads.telemetry |
| brand-onboarding | onboarding | — | — | company_profile | ads.brand-onboarding |
| brand-analysis | brand-analysis | — | — | brand_profile | ads.brand-analysis |
| product-analysis | product-analysis | — | — | product_facts | ads.product-analysis |
| competitor-list | competitor-research | — | — | competitors | ads.competitor-identification |
| competitor-ads-research | ad-research | — | — | competitor_ads_report | ads.competitor-ads-research |
| own-ads-audit | ad-audit | — | — | own_ads_report | ads.own-ads-audit |
| campaign-plan | campaign-planning | — | — | campaign_concepts | ads.campaign-plan, ads.hooks-and-angles |
| ad-copy | copywriting | — | — | ad_copy | ads.ad-copy |
| video-script | scriptwriting | — | — | video_script | ads.video-script |
| video-prompt | video-prompting | — | — | video_prompts | ads.video-prompt |
| storyboard | storyboarding | — | — | storyboard_sheets | ads.storyboard |
| image-generation | image-generation | — | — | images | ads.image-generation |
| image-ad | image-ad-production | — | — | image_ads | ads.image-ad |
| product-photos | product-photography | — | — | product_photos | ads.product-photography |
| ai-actor | actor-generation | — | — | actor_image | ads.ai-actor |
| format-adaptation | format-adaptation | — | — | adapted_ads | ads.format-adaptation |
| video-generation | video-generation | — | — | video_clips | ads.video-generation |
| ad-video | ad-video-production | — | — | ad_video | ads.product-ad-video |
| ugc-video | ugc-video-production | — | — | ugc_video | ads.ugc-video |
| cartoon-video | cartoon-video-production | — | — | cartoon_video | ads.cartoon-video |
| video-ad-clone | video-ad-cloning | — | — | cloned_ad_video | ads.video-ad-clone |
| audio-generation | audio-generation | — | — | audio_clips | ads.speech-generation |
| coded-animation | coded-animation | — | — | coded_animation | video.reference-prompts, video.coded-animation |

1. `plan` returns `classification-required`, the compact catalog and
   `prompts/classify.md`. The host AI supplies a reasoned classification.
2. The AI selects capability/intent pairs in execution order, or returns
   `no_match` or `needs_clarification`; Python never infers intent or falls back.
3. Python validates the decision against the task, catalog digest and stack,
   rejects incompatible/conflicting variants and orders explicit prerequisites.
4. Run one capability per step, skip prerequisites only when all their outputs
   are recorded, and execute the used capabilities' checks with real evidence.
5. Outputs and check results are submitted with the step's `map_id` and
   `capability`; Python rejects evidence for a replaced map or another step.
   Only the coordinator writes the map; helpers resolve under `<package_root>`.

## Harmonization record (first harmonization, 2026-11-21)

- Two sources. supercmo-skills v0.1.27 gives 23 capabilities, one per skill: no two of its skills produce the same thing, so nothing was merged. awesome-opus5-5-videos gives one, coded-animation: a library of prompts and the three steps its README gives for using one.
- The server the supercmo skills call is absorbed with them and registered by the plugin under the source's name, `supercmo` (delivery.json, ADR-0030). Bodies name a tool as the source does.
- No row has a prerequisite, mandatory or conditional. Every capability starts from the brief; `reads` records the earlier outputs a body uses when they are recorded. The source asks the user or gathers an input itself where one is missing, so no `needs` was declared: a forced stage would run research the user did not ask for.
- Pipelines stay inside their capability, as the source designs them. A production skill (ad-video, ugc-video, cartoon-video, video-ad-clone, video-generation, image-ad, product-photos) and brand-onboarding open other skills of the same source at the step that needs them, as packaged files: the product analysis, the actor, the script, the storyboard and the prompt made there are working material of that step, and only the step's own output is recorded. The same skills also serve a direct request through their own capability.
- Two places where one skill ran another skill's whole deliverable were changed, each for two owners of one output: campaign-plan ends at the approved plan and each approved concept is built as a following step by its producer; media-setup offers the brand setup and brand-onboarding runs it as the following step. Recorded in both capabilities.
- Shared files, one writer at a time: `./supercmo-company/brand.md` is written by brand-analysis and brand-onboarding, `./supercmo-company/competitors.md` by competitor-list, brand-onboarding and competitor-ads-research. They are the source's company profile, read by later sessions; the steps run in sequence.
- Alternatives for a video, chosen by what the user asks for: ad-video (a produced product ad), ugc-video (a creator on camera), cartoon-video (a drawn spot), video-ad-clone (rebuild a reference ad), video-generation (a clip), coded-animation (an animation written as code in one HTML file, not generated footage). Their intents exclude each other in the source's own words.
- image-generation, video-generation and audio-generation are also the files the other capabilities open before calling `image_generate`, `video_generate` or `audio_generate`, as the source orders. The server's tool descriptions still say "load the generating-images skill": the discovery entries name those skills as absorbed.
- Carried as the source has them, unresolved: the safety ladders differ between the image capabilities; the cartoon skill offers a one-clip video while `video_stitch`, its only way to lay narration, refuses fewer than two clips; the setup skill makes the managed key the default while the tool hints let the user pick; planning writes under `./supercmo-files`, the server under `./supercmo-media`. Each capability's Sources section names its own.
- The server registers tools no skill calls (`caption_video`, `video_overlay`, `transcribe` and four calendar tools): they come with the server as shipped and no capability owns them. The calendar tools do not work on Windows (the source imports a POSIX-only module).
- LLM review of representative requests against this graph: guide-examples.json and eval-cases.json. Mechanical validation is separate; neither proves general reliability. Routing eval of 2026-11-21: 23 of 23 cases, decisions written by a fresh agent on a smaller model that did not see the expectations (docs/verification/2026-11-21-supads-intake.md).
