# supads: first intake, harmonization, build and live runs (2026-11-21)

The owner asked for a new package, `supads` (`examples/supads/`), from two
sources, and that the MCP server of one of them be absorbed
([ADR-0030](../adr/ADR-0030-absorbed-mcp-servers.md)).

## Sources

| Source | Pin | License | What was selected |
| --- | --- | --- | --- |
| `supercmo-skills` (SupercmoHQ/superCMO-skills) | release `v0.1.27`, `3bf78a42` | Apache-2.0, root `NOTICE` | `skills/**` (23 skills), `scripts/supercmo_skills/**` and `scripts/supercmo_env.py` (the MCP server), `scripts/doctor.py`, `NOTICE`, `TELEMETRY.md`; read at intake only: `README.md`, `.mcp.json`, `pyproject.toml`, `skills/*/evals/*` |
| `awesome-opus5-5-videos` (yihui-dev/awesome-opus5-5-videos) | head `92aee2f5` (no release, no tag) | MIT | `data/videos.json`; read at intake only: `README.md` |

- The two Inter fonts the server's caption tool uses are declared in
  `media_paths`; the root `NOTICE` that credits them (SIL OFL 1.1) is in
  `notice_paths`.
- `prompts/*.md` of the second source is omitted with a reason: the 703 files
  were compared with `data/videos.json` at the pinned commit, and every prompt
  text is in its JSON entry (one file's prompt contains code fences, which a
  first comparison cut short).
- The second source's README says "Every video and prompt belongs to its
  creator". The MIT license is the curator's and covers the collection. The
  owner chose to absorb it with credits; the capability carries the credit rule
  as a check and records the boundary.
- `python muro_build.py --manifest examples/supads/sources.json
  --check-sources`: `OK: all sources and plugin identity valid`.

## Intake and harmonization

- The 23 skills of supercmo-skills were read by four parallel intakes of the
  host model, each on a group of five to seven skills, under one brief with
  fixed ids, output keys and packaged paths. Each wrote one capability per
  skill. The capability of the second source was written in the main session.
- Harmonization in the main session: no merge (no two skills produce the same
  thing), no prerequisite, `reads` for the outputs a body uses when recorded,
  `resumable` for the steps that pause for approval. Two changes for two
  owners of one output: `campaign-plan` hands approved concepts to their
  producers instead of building them in place (it still gathers its four
  inputs inside its step, as the source designs, and declares the tools those
  analyses call); `media-setup` offers the brand
  setup instead of running the onboarding inside its step. Both are recorded
  in the capability and in `ROUTER.md`.
- The server is declared in `delivery.json` as `supercmo`, started with
  `python -m supercmo_skills.mcp` and `PYTHONPATH` on the packaged
  `scripts/supercmo-skills/scripts`.
- `--validate`: `OK: capabilities and ROUTER.md valid`.

## Build

`--build --out <scratch>` at the working tree of this date: built, 33 MB. A
script resolved every packaged path the 24 capability bodies name, including
the ones written with a shorthand: 251 paths, none missing.

## The absorbed server, run

- Started by hand from the packaged files on Windows 11, telemetry switched
  off (`SUPERCMO_TELEMETRY=false`, `DO_NOT_TRACK=1`): `initialize` answers
  `supercmo` 0.1.27; `tools/list` returns 22 tools whose descriptions and
  schemas are 46,245 bytes, about 11,500 tokens. This is the per-session cost
  stated in `delivery.json`.
- Claude Code 2.1.330, `claude-sonnet-5-5`, `--plugin-dir
  <adapters/claude-code>`, `--setting-sources project,local`, without
  `--strict-mcp-config` (it drops a plugin's servers): the init event shows
  `plugin:supads:supercmo` connected. Asked which generation capabilities are
  ready, the model called `mcp__plugin_supads_supercmo__setup_status` and
  reported the key state of the machine. 2 turns, 0 denials, 0.46 USD. It did
  not invoke a supads skill: the tool's own description was enough.
- Same host and model, a copywriting request ("headline e testo principale per
  un annuncio Meta…"): the model invoked the discovery entry
  `supads:supads-planning`, whose text loaded, and then wrote the copy
  directly. It ran no coordinator command, so nothing was classified, mapped
  or recorded. 3 turns, 0 denials, 0.09 USD.
- Same host and model, a script request ("cosa deve dire la persona in un
  video di 12 secondi…"): the model answered in one turn and invoked no skill.
  0.05 USD.
- Same host and model, a production request ("Fammi un video UGC di 15
  secondi per la nostra crema solare…"), with only `Skill` allowed so that no
  generating tool could run: the model invoked `supads:supads-videos`, ran
  `muro.py plan`, got `classification-required`, wrote
  `.supads/classification.json`, confirmed the plan `["ugc-video"]` and
  received the step with its `package_root`. It then followed the capability:
  it asked for a photo or link of the product before generating anything and
  proposed a concept for approval. 7 turns, 0 denials, 0.43 USD. Nothing was
  generated.
- Four samples in all, one per request. The coordinator ran in the one that
  asked for a production; the two short writing requests were answered
  without it, and the readiness question went straight to the tool.

## Routing eval

`muro eval prepare` staged 23 cases; a fresh agent on a smaller model
(Claude Sonnet), which saw the prompt and the catalog and not the
expectations, wrote the decisions. `muro eval score`: 23 of 23 passed, twice:
on the first catalog (digest `e94c2865…`) and again, with a new agent, after
`campaign-plan` declared its tools and joined the server's targets (digest
`ac7f230c…`, the committed catalog). The agents named as ambiguous
"configurare tutto" (setup alone or with the brand onboarding), competitor ad
research without the competitor list first, and "quali annunci testare" (the
plan, or a single ranked answer); in each they chose the expected answer.

## Tests

`tests/test_supercmo_skills_intake.py` (7) and
`tests/test_awesome_opus5_5_videos_intake.py` (4): the pins, the selection,
one capability per skill pointing at its packaged original, one producer per
output, the two handovers, the server declaration and its targets, the
discovery entries, one two-step routing fixture. Fixtures prove mechanics
only.

## Not run, and open

- No image, video or audio was generated, and no research or analysis tool
  was called: only `setup_status` and `tools/list` ran. Every generating
  capability is unexecuted.
- supads was loaded only on Claude Code. Codex, Pi, OpenCode and Hermes were
  run with a stub server (see the ADR-0030 record), not with this package.
- A short writing request did not reach the coordinator in two samples of
  two: once the entry skill loaded and was not followed, once no skill was
  invoked. Whether this is the size of the request, the model or the entry
  text is not known, and the routing eval does not measure it. The same was
  not tried on the default model or on another host.
- The capability bodies were written by four delegated intakes and were not
  each re-read line by line in the main session. What was checked: they parse,
  their packaged paths exist, their reports were read, and the two places that
  ran another capability's work were rewritten.
- Carried from the source unresolved, each in its capability: differing safety
  ladders between the image skills; a one-clip cartoon whose narration needs a
  tool that refuses fewer than two clips; the setup skill's default key route
  against the tool hints; `./supercmo-files` against `./supercmo-media`.
- On Codex and Hermes the server starts in the plugin's folder, so its default
  output folder lands there; `media-setup` carries the source's variable for
  it. Not run on those hosts.
- The four calendar tools do not work on Windows (the source imports a
  POSIX-only module); no skill calls them.
- The desktop app was not run on this package.
