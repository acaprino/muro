# open-paper-skills intake into Marionette — 2026-11-11

Owner request: "Puoi integrare https://github.com/pengqianhan/open-paper-skills/tree/main",
destination confirmed "In marionette". Intake and harmonization were done by the
host LLM of this session; the selection and its reasons below are that AI's
decisions, not separately approved text.

## Source

| Fact | Value | How it was checked |
|---|---|---|
| Repository | `pengqianhan/open-paper-skills`, not a fork, not archived | GitHub API |
| Licence | MIT, root `LICENSE`, `Copyright (c) 2026 pengqianhan` | `--check-sources` against the live remote |
| Releases and tags | none | GitHub API and `git ls-remote --tags` |
| Pin | `head`, `f85fd3dc80720dfa42fb5ab069f232f28c831109` (2026-10-12) | `git ls-remote ... HEAD` |
| Contents | 41 skills: 21 under `skills/` (the author's), 20 under `collected-skills/` (copied from other authors) | `git ls-tree` |

A full checkout failed on Windows under the long scratch path (`Filename too
long` for a file in `skills/research-bible/references/`). Files were read with
`git show`; Muro reads blobs the same way, so intake preparation and the build
are not affected (both ran, see below).

## What was absorbed and why

Seven skills became six capabilities. Each has its own role; none was merged
with an existing Marionette capability.

| Capability | From | Intents |
|---|---|---|
| `paper-search` | paper-search | research.literature-search, research.paper-reading |
| `paper-wiki` | paper-wiki-manager | research.paper-notes, research.wiki-upkeep |
| `paper-figure` | drawio-paper, codex-paper-figure-skill | research.paper-diagram, research.paper-plot |
| `research-practice` | research-bible | research.planning, research.experiment-debugging |
| `research-pitch` | sell-research-honestly | research.value-communication |
| `session-handoff` | session-handoff | engineering.session-handoff, engineering.session-resume |

Harmonization decisions: the two figure skills produce the same editable paper
diagram and are one method (the image-reference pass and the icon workflow of
the second are optional steps of the first; they disagreed on deleting the
`.drawio` source after export, resolved in favour of keeping it). `paper-wiki`
runs the paper-search script inside its own step and only `reads`
`literature_findings`, so there is no prerequisite edge.

## What was left out and why

| Left out | Reason |
|---|---|
| `collected-skills/**` (20 skills) | Other authors' work with their own upstreams and licences; one of them is explain-this, already a Marionette source from its original repository. |
| `skills/research-bible/references/**` | An essay by another author and copies or stubs of other authors' texts. The repository's MIT licence does not cover them. The skill's own workflow does not need them. |
| `skills/paper-wiki-manager/scripts/vendor/*.js` | Five third-party MIT libraries. `cose-base.js` and `cytoscape-fcose.js` carry no copyright notice in the file, so redistributing them would drop a required notice. They are a runtime dependency: the capability downloads the exact versions listed in the packaged `vendor/README.md` from the jsDelivr npm mirror. All five URLs answered 200. |
| explain-paper-html, explain-anything-html | The need (interactive explainer of a paper) is served by explain-this; the second one derives from a third-party gist. |
| map-then-territory | The need (route map, then execution edge by edge) is served by wayfinder. |
| karpathy-coding-rules | Another author's notes. |
| project-dispatch, research-project-manager, skill-organizer, discover-academic-skills | They operate the author's own Research OS (`os-harness`, the `projects-folder/` contract, the hub's indexes). |
| human-cognition-cache, okf-repo-organizer, filetree-simple, task-file-builder, writing-great-prompt, uv-env | General agent utilities outside the repository's stated purpose (research planning, paper search, paper wikis, academic figures, paper explainers, session handoffs). Not rejected: adding them is another intake of this source. |
| tests, `evals/**`, `agents/openai.yaml` | Not runtime material. |

Parts of selected skills that depend on the author's own interface (os-ui's
Papers panel and Status row) are recorded as not adopted in the capabilities.

## Limits this intake tripped, and the fixes

Recorded in ADR-0015, "Amendment after the second-source intake".

| Limit | Before | After |
|---|---|---|
| Router cap | 80 lines including table rows; 18 capabilities reached it and one test that adds a row failed | counts text lines only |
| Compact catalog | 16.2 KB at 12 capabilities, 25.6 KB at 18 (host persisted 29.4 KB to a file earlier today) | `--focus <ids>` and `--brief`; index 9.4 KB, focused views 10.7 to 12.9 KB |

TDD: the changed and new tests failed first (5 failed, 109 passed in the
affected files), then passed.

## Checks run

- `--validate`: OK. `--check-sources`: OK, nine remotes answered.
- `--prepare-intake open-paper-skills`: wrote `PROMPT.md`, `source.json` and 25 selected files.
- `--build --out <scratch>`: built; 25 helper files under `scripts/open-paper-skills/`, licence in `LICENSES/open-paper-skills.txt`, the runtime dependencies listed in `NOTICE.md`, eight skill folders per host (umbrella plus seven entries).
- Packaged `paper_search.py`, run from the built skill folder in a folder with no switch file: `sources` printed the defaults; `search "KV cache compression" --source arxiv --limit 2` returned 2 results, no errors.
- `python -m pytest -q` (temporary files on drive C:): **284 passed** after the intake tests were added (274 before them).

## Live host runs

Claude Code 2.1.322, `claude-fable-5-2`, effort medium, the owner's configuration
unchanged (10 plugins loaded, Superpowers among them), sessions started one at a
time, staged release loaded with `--plugin-dir`. One sample per request.

| Request | Entry chosen | Runtime calls | Result | Cost / time |
|---|---|---|---|---|
| Find recent work on KV cache compression, with code | `marionette-papers` | `plan --compact --focus paper-search,paper-wiki,paper-figure` (13.8 K characters, inline), `plan --classification` -> `direct` | ran the packaged `paper_search.py` six times against alphaXiv, Hugging Face and Papers with Code; returned a table of papers with code links | $1.89 / 57 s |
| My model validates below the baseline, where do I look | `marionette-research` | focus on research-practice, research-pitch (11.9 K), -> `direct` | read the two project files, gave a first cheap check and an ordered list; ran nothing | $0.78 / 39 s |
| Stop for today, write the handoff | `marionette-engineering` | focus on work-map, session-handoff (11.7 K), -> `direct` | wrote `HANDOFF.md` at the repository root from `git log` and the files | $1.82 / 44 s |

Three of three entries chosen with Superpowers loaded, no plan output persisted
to a file, no denial of a runtime call. One denial in the first run was a
compound shell command outside the test's tool limits.

## Routing eval

`--prepare-eval` (22 cases, 38 KB prompt), one headless session wrote
`decisions.json`, `--score-eval`: **20 of 22**, cost $1.46, 75 s. All 22 decisions
passed runtime validation. The eight new cases agreed, including the two
near-misses (an interactive explainer of a paper is not a wiki note; a dashboard
chart is not a paper plot).

Both differences are the same boundary: a small, clear code change
(`db-migration`, `dashboard-chart-not-paper-plot`), where the model answered
`no_match` and the cases expect `work-map`. In this morning's run the model
chose `work-map` for `db-migration`. The catalog is ambiguous here: work-map's
body handles small work without a map, while the classification rules say a
coordinator is never a fallback. The expectations were left as they are; the
wording of work-map's intent needs a harmonization pass. This is an unstable
boundary, not a measured rate. A later run the same evening (25 cases, after the
tokeneconomizer intake) agreed on both.

Cost of this intake's live runs: $5.95.

## Not executed

- `paper-wiki` end to end in a host (viewer-library download, `generate_viz.py`, validator).
- `paper-figure`: the 266 MB reference download, a draw.io export, a matplotlib plot.
- `research-pitch` in a host.
- Hosts other than Claude Code.
- A second sample of any live request.
