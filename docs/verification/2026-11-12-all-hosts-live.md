# Marionette live on Codex, OpenCode, Pi and Claude Code — 2026-11-12

Owner request: "devi provarli tutti dal vivo" (every harness the build exports).
Until today only Claude Code had run Marionette live, and no host had ever run a
multi-step map through to `completed`.

## Setup

- Release: Marionette 0.1.0, 19 capabilities, built fresh with `--build --out`.
- The owner's configuration was not changed. Codex and OpenCode loaded the skills
  from the test project only (`.agents/skills`, `.opencode/skills`); Pi with
  `--skill <dir>` for the run; Claude Code with `--plugin-dir`.
- One empty git project per run. Request A: palette, fonts and accessibility
  advice for a fintech dashboard (one step, uses the ui-ux-pro-max helper).
  Request B: decide how cards enter on scroll and implement it in CSS only, with
  the plan approved in the prompt (two-step map: motion-principles, css-scroll).
- One sample per cell. A plan "completed" here means the coordinator's own state:
  `map_status: completed`, every step's outputs recorded, checks submitted.

| Host | Version | Model | Notes |
|---|---|---|---|
| Codex | codex-cli 0.167.2 | owner default (`gpt-6-astra`), effort medium | needs direct access to chatgpt.com (below) |
| OpenCode | 2.2.5 | owner default (`baidu/ernie-5.5-flash-preview:free`) | |
| Pi | 1.4.0 | `claude-sonnet-5-5` through the owner's `tri-llm-gateway` | the default provider (OpenRouter) answered 402, out of credits |
| Claude Code | 2.1.322 | `claude-sonnet-5-5` | `claude-fable-5-2` hit the owner's usage limit mid-run |
| Hermes | — | — | not installed on Windows or in the WSL distribution: **not tested** |

Environment facts found on the way: this session reaches the network through a
local proxy (`HTTPS_PROXY=127.0.0.1:18798`) that refuses chatgpt.com and
api.openai.com, so Codex runs had to leave the sandbox and drop that variable.
Codex warned in every run: "Exceeded skills context budget. All skill
descriptions were removed and 115 additional skills were not included" — with the
owner's installed skills, Codex shows the model skill names only.

## Loading

Asked to list the Marionette skills, all three new hosts listed the nine
(umbrella plus eight entries). Asked to list every skill from the project's
`.agents` folder with its path, **Codex also listed 19 absorbed originals**
(`design-taste-frontend`, `figma-designer`, `gsap-scrolltrigger`, `wayfinder`,
`paper-search` and others), registered from the source `SKILL.md` files packaged
as helpers inside `marionette/scripts/`. OpenCode did not list them.

## Round 1: release as it was

| Host | A (dashboard advice) | B (two-step map) |
|---|---|---|
| Codex | no skill; answered from a web search | no Marionette skill; read the packaged `taste-skill/SKILL.md` directly and wrote the CSS |
| OpenCode | the owner's global `~/.agents/skills/ui-ux-pro-max`, not Marionette | no skill; wrote the CSS |
| Pi | `marionette-web-design` → `plan --compact --focus` → classification → `direct`; ran the packaged `search.py` | `marionette-motion` → map confirmed (after fixing `--stack css-only` itself) → **did both steps' work and never submitted**: map left `active`, no outputs, no checks |
| Claude Code | (yesterday: `marionette-web-design`, `direct`) | no skill; wrote the CSS |

The packaged `search.py` failed once on Pi with `No module named 'core'`. The
import path was 258 characters, at the Windows path limit, inside this session's
scratch folder; the same files run from a short path. A test-environment
artifact, not a build defect.

## Fixes (test first: 6 failed, 1 passed, then green)

1. **Packaged source skills are never named `SKILL.md`.** `copy_source_helpers`
   stores them as `SKILL.source.md`; capability bodies refer to that name (12
   references in 7 capabilities); validation rejects a body that names a packaged
   `SKILL.md`. `## Sources` lines keep upstream names.
2. **A mapped step says what it covers and how to submit it.** The step result
   carries `scope`, `remaining_steps` and `submit` (the exact launcher
   arguments); `checks` carries `submit_check` and `submit_complete`. The
   generated `SKILL.md` says not to start a later step's work before submitting.
Full suite after the fixes: **298 passed in 258.98s**; `--validate` OK.

3. **Stack tokens.** The error for `--stack css-only` now names the token and the
   accepted form (`stack:css-only`); the skill text shows the full form.

## Round 2: fixed release, request B

| Host | Invocation | Result | Checks recorded |
|---|---|---|---|
| Codex | explicit (`$marionette`) | brief index → confirm → step → step → **completed** | 14 (pass / not-tested) |
| OpenCode | explicit (`@marionette`) | brief index → refocus → confirm → step → step → **completed** | 12 |
| Pi | implicit | `marionette-motion` → confirm → step → step → **completed** | 11 |
| Claude Code | explicit (`/marionette:marionette`) | brief index → confirm → step → step → complete → **completed** | 11 |

The Codex re-check listed only the nine Marionette skills from the project; the
budget warning dropped from 115 to 92 excluded skills. Pi, which abandoned the
map in round 1, submitted every step in round 2 (one sample each).

Every host wrote `prefers-reduced-motion` and `@supports (animation-timeline:
view())` fallbacks. Where the browser was not allowed by the run's limits, the
host recorded the browser checks as `not-tested` rather than `pass`.

## What the runs say about discovery

Implicit choice of Marionette, by host, over the requests tried: Claude Code 1
of 2, Pi 3 of 3, Codex 0 of 2 (descriptions stripped by its skills budget),
OpenCode 0 of 2 (one went to the owner's installed `ui-ux-pro-max`). The small
CSS request was handled directly by three hosts: whether a coordinator should
take a task that size is the same open boundary the routing eval shows.

## Usage

| Run | Input tokens | Output tokens | Cost |
|---|---|---|---|
| Codex A, B, round 2 | 59 K, 220 K, 1.95 M | 0.8 K, 1.6 K, 4.2 K | not reported |
| OpenCode A, B, round 2 | 0.67 M, 2.1 M, 3.0 M | 1.8 K, 7.9 K, 10.6 K | free model |
| Pi A, B, round 2 | 0.44 M, 0.95 M, 1.56 M | 6.1 K, 6.7 K, 11.5 K | $0.24, $0.46, $0.69 |
| Claude Code B, round 2 | — | — | $0.54, $0.85 |

## Not executed

- Hermes (not installed).
- Request A in round 2; implicit discovery after the fixes on Codex, OpenCode and Claude Code.
- `--amend`, a `resumable` single step, and resume after a restart, on any host.
- Repeated samples.
