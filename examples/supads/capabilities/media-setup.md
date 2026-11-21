---
id: media-setup
role: setup
when: —
after: []
outputs: ["setup_status"]
checks: ["readiness_from_status_call", "ready_and_blocked_named", "default_key_route_kept", "telemetry_as_documented"]
intent_checks: {"ads.media-setup": ["readiness_from_status_call", "ready_and_blocked_named", "default_key_route_kept"], "ads.telemetry": ["telemetry_as_documented"]}
intents: [{"id":"ads.media-setup","description":"Get the media tools of this package working: see which capabilities are ready or blocked with the keys that are set, deliver the key (the managed key, or the user's own vendor keys when they ask for that), verify the result, then offer to set up the brand. It also covers questions about which keys are needed, how the managed key and the bring-your-own route work, and a tool that failed with `no_provider_configured`.","excludes":["Building the brand or company profile from a website is onboarding; setup only offers it once the keys work.","Setting up a development environment or tooling that is not this package's media tools.","A request to generate, analyze or research something is that work, not setup."]},{"id":"ads.telemetry","description":"Learn what anonymous usage telemetry the package's media server sends, where it goes and how long it is kept, or turn it off, or see what would be sent without sending it.","excludes":["What a generation or analysis tool sends to its provider is stated by the capability that calls that tool."]}]
tools: [{"name":"setup_status","purpose":"Report each vendor key and the managed key as set or missing (names only), what each enables, where to get it, and readiness for image, video and audio. It re-reads ~/.supercmo/.env on every call. With check=true it also runs a free key-validity probe at the vendor where one exists; it never runs a paid generation.","required":true},{"name":"shell","purpose":"Run the managed-key login, `npx --yes @supercmo/skills@0.1.27 login`: it fetches that npm package, opens SuperCMO in the browser for the user's sign-in and writes the key to ~/.supercmo/.env. Run the packaged doctor.py when the server is not loaded.","required":true},{"name":"file-access","purpose":"Read the packaged originals and TELEMETRY.md. On the bring-your-own route write the user's vendor keys to ~/.supercmo/.env, one per line. When the brand setup is accepted, read and write the profile files in ./supercmo-company.","required":true}]
hooks: []
conflicts: []
---

# Media Setup

Gets the keys working so the media tools can run, verifies it, then offers to set up the brand. It also answers what the server's telemetry sends and how to turn it off. `$SRC` below is `<package_root>/scripts/supercmo-skills`. The packaged original, `$SRC/skills/supercmo-setup/SKILL.source.md`, is the full version of this method and wins where this body differs from it, except for the changes listed in the Sources section.

## Behavior

1. **Check what is set up.** Call `setup_status` with `check: true`. It validates the keys that are set and never generates. First time through nothing is set up: go to step 2. Where a working setup is already there, go to step 4.
   - **`setup_status` does not exist.** The host has not loaded the plugin's tools yet. Ask the user to restart the agent, then try again. Only if it is still missing after a restart is something broken, and here that means the plugin's `supercmo` server is not loaded: have the user check that the plugin is enabled in the host. On Hermes the server is registered by a companion package installed beside the plugin; it must be installed and enabled too. Do not run the source's installer to fix this.
   - **Without the server**, `python $SRC/scripts/doctor.py` prints the same data as `setup_status` (each key set or missing, what it enables, where to get it, readiness); add `--check` for the free probe. The source also asks for this output when a problem is reported as an issue.
2. **Set up the key.** The managed key is the default: one command, one key covering every capability, pay per use. Set it up unless the user has specifically asked to bring their own keys, and do not raise the bring-your-own route yourself.
   - **Managed.** `npx --yes @supercmo/skills@0.1.27 login` opens SuperCMO in the browser to sign in and authorize this device, and writes the key to `~/.supercmo/.env`. Credits are bought in the web app; no card is needed to sign in. Run it for the user once they are ready: it needs their sign-in. With this key, requests go to SuperCMO's proxy and are billed to the user's credits.
   - **Own keys, only when the user asks.** Free, and requests go straight to the vendors. Not all five are needed: `WAVESPEED_API_KEY` alone is enough to start generating images and video; voiceover, analysis and website reading can be added when a task calls for them. Ask only for the capabilities the user wants.

     | Key | Enables | Get it at |
     | --- | --- | --- |
     | `WAVESPEED_API_KEY` | generate images + video (recommended) | https://wavespeed.ai/dashboard |
     | `FAL_KEY` | generate images + video (also supported) | https://fal.ai/dashboard/keys |
     | `ELEVENLABS_API_KEY` | generate voiceover + narration | https://elevenlabs.io/app/settings/api-keys |
     | `GEMINI_API_KEY` | analyze a photo or video | https://aistudio.google.com/app/apikey |
     | `FIRECRAWL_API_KEY` | extract data from URLs | https://www.firecrawl.dev/app/api-keys |

   - Keys go in `~/.supercmo/.env`, one per line (`WAVESPEED_API_KEY=their-key`); create the file where it does not exist. Every host reads that file live, with no restart. A shell export, or the host's own MCP `env` block, also works and takes precedence over the file. With both image keys set WaveSpeed is used; `SUPERCMO_MEDIA_PROVIDER=fal` picks the other.
3. **Verify.** Run `setup_status` with `check: true` again and say what changed: which capabilities went from blocked to ready. Do not declare success from the fact that a file was written. Where a key still does not register, the causes in order of likelihood: the variable name is misspelled in `~/.supercmo/.env`; the key was pasted with surrounding quotes or a trailing space; an old `export` in the shell is shadowing the file.
4. **Offer the brand setup.** Say the keys work and ask whether to set up the brand from the user's website. On yes, the brand setup is the next step, run by the capability that owns the company profile: say so, and do not run it inside this step.
5. **Suggest what to do next.** Skip this where the user accepted the brand setup in step 4: the onboarding closes with the same list. Otherwise close with it:
   - **Create a UGC video**: a creator-style video for your product.
   - **Create a product ad video**: a produced ad or commercial for your product.
   - **Generate product photos**: packshots and lifestyle shots from one product photo.
   - **Research competitor ads**: what's working in your category, and what nobody runs.
6. **A telemetry question** is answered from `$SRC/TELEMETRY.md`, the source's telemetry statement; open it for the full field table and the retention terms. What it states:
   - The telemetry is anonymous and opt-out. Each tool call sends one event with only an allowlist of fields: the event name, the tool name, success, duration, the error type and a normalized error code (never the message), the surface, the route (`byok` or `proxy`), the provider (own keys only), the model slug, the SuperCMO, OS, architecture and Python versions, whether it runs in CI and under which agent, a random install id, and session, event and sampling ids.
   - Never collected: prompts or tool arguments, generated media or their URLs, file paths, names or contents, API keys, hostname, username, MAC address or machine fingerprint, the IP address (used transiently for rate limiting, never stored), any account identity.
   - Events are POSTed to `https://api.getsupercmo.ai/api/v1/telemetry/events` and forwarded server-side to PostHog. The install id is a random UUID4 in `~/.local/state/supercmo/install-id` (`%LOCALAPPDATA%\supercmo` on Windows); deleting the file rotates it.
   - Any one of these environment variables turns it off completely: `SUPERCMO_TELEMETRY=false`, `DO_NOT_TRACK=1`, `DISABLE_TELEMETRY=1`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`. `SUPERCMO_TELEMETRY=log` prints each payload to stderr instead of sending it.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `setup_status` as one JSON string: the key route in use (managed or own keys), the key names `setup_status` reported set or missing, which capabilities are ready and which stay blocked and why, whether the user accepted the brand setup, and for a telemetry question what was answered or switched. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **A probe fails on a key that is set**: the vendor rejected it (expired, revoked, or from the wrong product). Name the vendor and have the user re-issue it; do not retry.
- **The user asks which route is better**: managed is fastest to working and pay-per-use; their own keys go straight to the vendor, but they manage several keys with different vendors and must keep each in balance. Both are fully supported. It is their call.
- **The user wants one capability only** (just voiceover, just images): set up that key alone and say plainly which capabilities stay blocked.
- **Credits, billing or top-ups**: that lives in the web app; point there rather than guessing balances.
- **The server reads one more vendor key than the table lists.** `setup_status` returns every key of the server's registry, and that includes `SCRAPECREATORS_API_KEY` (public social-platform research: profiles, posts, comments, competitor ads; scrapecreators.com), which serves `social_research` on the bring-your-own route. Report the keys as `setup_status` returns them.
- **Where generated files go.** The server writes media to the folder named by `SUPERCMO_OUTPUT_DIR`, else to `./supercmo-media` under its own working directory; the generating tools take no folder argument. On a host that starts a plugin's server inside the plugin's folder (Codex and Hermes do), that default lands inside the installed plugin. When a tool returns a `path` under the plugin's folder, tell the user and offer to add `SUPERCMO_OUTPUT_DIR=<a folder of their choice>` to `~/.supercmo/.env`: the server loads every `KEY=VALUE` line of that file that is not already set in its environment.
- **The original SuperCMO plugin on the same host.** If the user also has the source's own plugin or its server configured, every tool is offered twice, and on some hosts a server the user configured under the name `supercmo` wins over this plugin's. Tell the user when you see it.

## Checks

- **readiness_from_status_call**: the readiness reported comes from a `setup_status` call with `check: true` made in this step, after the keys were set where any were; success is never declared from a file having been written.
- **ready_and_blocked_named**: the reply says which capabilities are ready and which stay blocked, and after a key was set, which went from blocked to ready.
- **default_key_route_kept**: the managed key was the route set up unless the user asked to bring their own keys; the bring-your-own route was not raised by the agent.
- **telemetry_as_documented**: what was said about fields, switches, endpoint and retention matches `TELEMETRY.md`, with nothing added.

## Sources

- AI intent mapping: supercmo-setup → ads.media-setup. `TELEMETRY.md` → ads.telemetry; the skill has no telemetry step, so placing the statement here as an intent of its own is an intake choice.
- Source: supercmo-skills (SupercmoHQ/superCMO-skills@3bf78a42, release v0.1.27) — `skills/supercmo-setup/SKILL.md`, `TELEMETRY.md`, `scripts/doctor.py`, and for the tool's behaviour `scripts/supercmo_skills/mcp/tools/setup.py`, `scripts/supercmo_skills/readiness.py`, `scripts/supercmo_skills/client.py` (the provider registry) and `scripts/supercmo_skills/providers/*.py`, and the four files step 4 opens (`skills/onboarding-user/SKILL.md`, `skills/analyzing-brand/SKILL.md`, `skills/analyzing-brand/references/reading-the-brand.md`, `skills/identifying-competitors/SKILL.md`), packaged unchanged under `<package_root>/scripts/supercmo-skills/` (the skill file as `SKILL.source.md`). `README.md` ("Set up a key", "Security & trust") was read at intake only, for where requests go on each route.
- Changes for coexistence (ADR-0017):
  - The source's frontmatter triggers ("Use when the user asks to set me up ...") are not applied: they would start the original as a skill, and the coordinator classifies by meaning.
  - "Still missing after a restart is a broken install" and the edge case "reinstall with `npx --yes @supercmo/skills@0.1.27 --claude` (or `--cursor`, `--codex`, `--all`)" become "the plugin's server is not loaded: check that the plugin is enabled; on Hermes the companion package". Collision: two owners of one output. The source's installer would install the original plugin and its server beside this plugin, which already registers the same server and the same tools.
  - Step 4's "trigger the `onboarding-user` skill" is not run in place: the onboarding has its own capability in this package, which owns the company profile (two owners of one output). This step offers it; on yes it runs as the following step.
  - "Where generated files go" (Specifics) is this package's: the source's default folder is relative to the server's working directory, and Codex and Hermes start a plugin's server inside the installed plugin's folder (live run and loader read of 2026-11-21), where the source's own install starts it elsewhere. The variable and the key file are the source's (`scripts/supercmo_skills/paths.py`, `scripts/supercmo_env.py`).
  - "Create the file where it does not exist" is added to the key file line: the source's installer, which is not run here, is what created `~/.supercmo/.env` (README, "Bring your own keys").
  - Nothing else that the source prescribes was changed. The managed login command and the bring-your-own table are the source's own.
- Runtime dependency: Node.js with `npx`, used only for the managed login (`@supercmo/skills@0.1.27` from npm). Check it with `npx --version`; the source gives no install method for Node.js. `doctor.py` needs Python 3 and the standard library. The keys themselves are delivered as steps 2 and 3 state.
- Unresolved in the source: the skill makes the managed key the default and says not to raise the bring-your-own route, while the hints returned by `setup_status` and by a `no_provider_configured` error say to let the user pick and not to run the login unless they choose managed. The skill's key table lists five keys; the server's registry has six. This body follows the skill and reports the sixth key as the tool returns it.
- Hooks: the selected files define none.
