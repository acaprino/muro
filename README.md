# Muro — coordinator and factory

Muro builds one branded coordinator from a curated set of MIT/Apache-2.0
sources. The factory verifies pinned Git snapshots and licenses; an agent uses
the prepared intake and harmonization prompts to produce the capabilities and
router. **AI classifies every absorbed skill/plugin and every runtime request.**
Python validates the resulting data and coordinates execution; it never guesses
intent from keywords. At runtime the coordinator loads **one capability at a time**.

Muro is the factory only. A package (the list of sources and the unified catalog
built from them) is a separate directory with `sources.json`, `capabilities/`,
`ROUTER.md` and `guide-examples.json`. `examples/marionette/` is the example
plugin: design, motion, Office and explainer skills unified as **Marionette**.
Prompts and the shipped runtime come from the factory (ADR-0011).

Capabilities relate in three declared ways. `after` is a prerequisite that holds
every time. `needs` is a conditional prerequisite: the harmonizing AI writes the
condition in plain language, the classifying AI judges it for each task, and
Python only requires that judgment and holds the plan to it. `reads` names the
outputs a capability uses when another one recorded them; it adds no step. The
guide graph is draggable, always shows `after` and `needs`, and shows `reads`
only for a chosen example path or intent (ADR-0012).

## AI ownership and decision graph

The two factory prompts and the runtime prompt have distinct responsibilities:

1. **Intake AI** reads each selected skill's actual content and derives its intents,
   meaning, exclusions, outputs, tool requirements and adopted hooks. One plugin
   may contain several skills and support several intents.
2. **Harmonizer AI** normalizes equivalent outcomes, merges overlapping roles,
   preserves specialized intents and writes `ROUTER.md`. Alternative implementations
   share a role/outcome; `after` declares only a stage that is required every time.
   Stages that are useful but optional are selected by the host AI, in order.
3. **Host AI at runtime** reasons about the user's request, project and constraints
   against that catalog and selects an appropriate path through the graph.
4. **Python** checks the decision, orders prerequisites, handles confirmation and
   persists evidence. It neither substitutes a variant nor adds a coordinator
   fallback when the task is ambiguous or unsupported.

Intake and unification are LLM work in the host session: understanding the source's
purpose, preserving its useful methods and placing it coherently in the decision
graph. Matching names, regex, keyword scores and source-list order cannot decide
merges, precedence or branches. The AI records concise, source-grounded reasons
for merges, alternatives, necessary handoffs and unresolved gaps. The legacy
role-based `resolve_plan` API now refuses selection and directs callers to the
host-AI classification flow.

Intent vocabulary is open: adding a new domain requires AI-authored catalog data,
not Python keyword edits. The current catalog has website direction and build with
landing strategy, local design guidance for any interface, Figma design, motion
design, scroll implementation and engineering coordination, plus Office work through GenOffice: new
presentations, new documents and workbooks, and reading, converting or editing
existing files; and interactive HTML explainers from documents, topic research
or a codebase, with a claim-by-claim fact-check. GSAP/CSS are alternative implementations of the same
scroll outcome. A static hero does not imply motion; hover timing does not imply
scroll implementation or a new page design. Since the 2026-11-10 re-harmonization
no shipped capability has a mandatory prerequisite: each can start from existing
work or a stated behavior and reads earlier outputs when they are recorded.
Full descriptions and exclusions live in the capabilities.

### Catalog contract

Each capability has ten frontmatter fields: `id`, `role`, `when`, `after`,
`outputs`, `checks`, `intents`, `tools`, `hooks`, `conflicts`. `intents` is a nonempty array
of `{id, description, excludes}` records. `when` is only `—` or comma-separated
`stack:*` constraints; it is not an intent classifier. Router columns are
`id | role | when | after | outputs | intents` and must match the frontmatter.

`tools` contains `{name, purpose, required}` records using logical operations,
not invented host API names. `hooks` contains `{event, action, tools, policy}`
records with `manual` or `host-approved` policy. The host AI checks actual tool
availability, permissions, trigger semantics and effects for selected capabilities
and their prerequisites. Metadata does not call tools or install/register hooks.
Empty hook arrays mean none are adopted in the selected scope; upstream defaults
outside selected files remain uninspected. Record such gaps during intake.

Runtime dependencies are installed by the capability that needs them. When a
package, command-line tool or application is missing, the step states in one
line what it installs, from which official source and where, installs it in the
narrowest scope that works, checks that it answers and continues; it never
switches to another engine. A failed install blocks only the work that depends
on it. This is separate from the factory: intake and build install nothing, a
capability never installs the skill or plugin itself, and hooks are never
installed or activated (ADR-0007).

`conflicts` lists incompatible capability IDs, including different roles. Before
execution, Python rejects declared conflicts, duplicate role variants and multiple
producers of the same output. The AI must additionally resolve contradictory
instructions and overlapping file/tool/hook effects: metadata validation cannot
prove undeclared behavior safe. Harmonization assigns output ownership and explicit
sequential handoffs rather than layering competing skills on the same artifact.

## Commands

Requires Python 3.10+ and Git. Tests additionally require pytest.

```bash
python muro_build.py --manifest examples/marionette/sources.json --validate
python muro_build.py --manifest examples/marionette/sources.json --check-sources
python muro_build.py --manifest examples/marionette/sources.json --prepare-intake taste-skill
python muro_build.py --manifest examples/marionette/sources.json --harmonize
python muro_build.py --manifest examples/marionette/sources.json --build
python -m pytest -q
```

`--manifest` names the package; its outputs (`dist/`, `.muro/factory/`) are
written beside that manifest.

`--prepare-intake` exports the selected source files and a source-specific
`PROMPT.md` under `.muro/factory/intake/<source-id>/`, including the existing router
and capability bodies as context for the AI. It does not invoke an LLM
or run downloaded code. Give that prompt to the host AI to classify the selected
skills and generate capabilities; preparing files is not completed intake.
`--harmonize` prepares the agent's harmonization prompt and source manifest under
`.muro/factory/harmonization/`, with the current router and full capability bodies.
The host AI must perform the semantic synthesis and review the resulting graph;
preparation is not unification. The resulting artifacts must then pass `--validate`
and `--check-sources` before building. These commands check structure and source
integrity, not the quality or authorship of the AI's judgment.

The source checks fetch each remote Git commit in a temporary repository. They
verify selected files, SPDX conflicts, common nested licenses and the approved
license text at that commit, not the current working tree. This does not prove
ownership or all asset rights; inspect third-party assets and notices before
distribution. Local repository paths can be absolute or manifest-relative.

An Apache-2.0 license whose appendix notice is filled in with one plain
copyright line, as the appendix itself instructs, is the approved text; any
other difference is rejected (ADR-0005).

A repository that licenses each skill folder separately, with no root `LICENSE`,
is declared with `license_path`, for example
`"license_path": "skills/pptx/LICENSE.txt"`. That file is verified like a root
license and covers only the selected paths under its own folder; a path outside
it is rejected, so two folders with their own licenses are two source entries.
The `NOTICE` shipped with the release is the one beside the verified license. A
license file found deeper than the verified one (`LICENSE`, `LICENSE.txt`,
`LICENSE.md`, `LICENCE`, `COPYING`) stops the check until it is declared or the
path is dropped (ADR-0006). 

Every source declares how its pinned commit is anchored (ADR-0009):
`"pin": "release"` with `"release": "<tag>"` binds it to the commit of a
published tag, `"pin": "head"` to the upstream HEAD, `"pin": "static"` to a
reviewed commit that follows nothing. `commit` is a full SHA in every mode.
Upstreams that publish releases are pinned to one; those that publish none
follow `head`, so their check fails when they move until the diff is reviewed.
A newer release is adopted by a reviewed re-pin, never automatically.

`--build` refuses to replace existing output. A successful build is staged and
moved into `dist/<slug>/` only after all steps succeed. Existing `dist/` content
may predate the current implementation and is not evidence of a verified build.

## Illustrated release guide

Every successful release includes **`GUIDE.html`** at its root and in each of the
five standalone host skill folders. Open it in a browser: the file is self-contained,
works offline and needs no server, installation or external fonts/scripts.

The initial view contains only a responsive, navigable capability graph and a
few controls to highlight example paths or intents. Clicking a node opens its
brief intent descriptions and details; no panel opens automatically. Commands and the full
catalog open on demand, including prerequisites, alternatives, conflicts,
exclusions, constraints, outputs, tools, passive hooks, checks and instructions.

Cytoscape.js draws and lays out the graph, with pan, zoom and touch gestures.
The pinned MIT browser bundle is vendored in `muro/vendor/cytoscape/` and embedded
with its license in the HTML. Opening or building a guide downloads nothing.
Keyboard users can navigate nodes with Tab/Enter, pan with arrow keys, zoom with
plus/minus and restore the viewport with Home or `Ripristina`.

`guide-examples.json` supplies the documented scenarios and is required by every
build. People or the host LLM author and review these examples with the catalog;
the generator validates their explicit decisions and expands only declared
prerequisites. Clicking an example illustrates its recorded path, without
classifying a new request or executing work. The examples ship beside the guide
at the package root and in each standalone skill folder.

The build regenerates the guide from the validated catalog being packaged, with
the plugin identity/version, generation time and catalog digest. The LLM-authored
capabilities supply meaning and functional explanations; Python renders that
evidence and declared relationships. Graph layout and intent highlighting never infer
intent, create collaborations or choose a capability. A stack condition is a
constraint, not an automatic trigger, and source order establishes no precedence.

Do not edit a generated guide or reuse an older release's copy. Update the
AI-authored catalog and rebuild to a fresh location. See
[ADR-0010](docs/adr/ADR-0010-release-html-guide.md) and
[the guide verification record](docs/verification/2026-11-10-release-html-guide.md)
for the contract and recorded checks.

## Runtime and installation

Every adapter contains a complete `skills/<slug>/` directory: `SKILL.md`,
`muro.py`, the Python package, capabilities, router, prompts, source helpers and license
notices, plus `GUIDE.html` and `guide-examples.json`. Install the complete skill
folder, not just `SKILL.md`.

- **Claude Code:** plugin layout with `.claude-plugin/plugin.json` and
  `skills/muro/SKILL.md`. The installed plugin skill is namespaced by the host;
  the exact command can therefore be `/muro:muro`, not simply `/muro`.
- **Codex:** install the skill under `.agents/skills/` (project) or
  `~/.agents/skills/` (user).
- **OpenCode:** install under `.opencode/skills/` (project) or
  `~/.config/opencode/skills/` (global).
- **Pi:** install under `.agents/skills/` or Pi's skill directory. Pi performs
  the same steps sequentially in-session.
- **Hermes:** use its `skill_view`/skill directory integration. An optional
  `delegate_task` can isolate a step.

The universal fallback inside every skill directory is `python muro.py`.

```bash
python muro.py plan --task "Build a landing page with scroll animation" --project /path/to/project
# Returns classification-required: the HOST AI reads the prompt/catalog and
# writes classification.json, copying the returned context exactly.
python muro.py plan --task "Build a landing page with scroll animation" --classification classification.json --project /path/to/project
# For a multi-step plan, confirm with the SAME classification after approval:
python muro.py plan --task "Build a landing page with scroll animation" --classification classification.json --confirm --project /path/to/project
# After completing the returned step, save its required output keys as JSON and
# pass back the map_id and capability returned with that step:
python muro.py record --project /path/to/project --map-id <map_id> --capability <capability> --outputs outputs.json
# Resume uses the saved AI decision; it does not classify the task again:
python muro.py resume --project /path/to/project
# Record actual check results with their evidence, bound to the owning capability:
python muro.py check --project /path/to/project --map-id <map_id> --capability <capability> --result result.json
```

For an explicit CSS-only requirement, pass `--stack stack:css-only` consistently
to both planning calls. GSAP is detected from declared package dependencies;
an empty/missing package manifest does not imply CSS-only. If a required stack
cannot be established, the AI asks for the missing constraint rather than guessing.

### Runtime AI response

The host AI, not the user, authors JSON with exactly these fields:

- `task`, `stack_tokens`, `catalog_digest`: copied unchanged from the returned
  `context`. The digest binds the catalog, instructions and checks.
- `status`: `selected`, `no_match` or `needs_clarification`.
- `selections`: for `selected`, a nonempty list of
  `{capability, intent, reason}` records using known capability/intent pairs,
  one per capability. Empty for other statuses.
- `reason`: a nonempty overall justification.
- `questions`: nonempty only for `needs_clarification`; otherwise `[]`.

`prompts/classify.md` supplies the complete response example and reasoning rules.
No classification means no executable plan. Unsupported/uncertain responses
return their status and reason without creating state. Invalid, unknown, stale or
incompatible selections fail without being silently corrected. JSON validation
does not prove AI authorship or semantic accuracy; the host agent owns those steps.

After classification, a one-step task returns `direct`: execute its instructions
and checks without `record`/`check` state calls. Multi-step work returns `confirm`
and uses `.<slug>/map.md` plus `state.json`. Each step returns only its active body
and tool/hook metadata. Outputs and check results require real evidence.

Every payload includes `package_root`; capability bodies reference helpers as
`<package_root>/scripts/<source-id>/...`, so they resolve against the installed
package and never against the consumer project. Each map has a fresh `map_id`,
returned with every mapped step. `record` accepts outputs only for that map and
its active capability; `check` accepts a result only for that map and a
capability of its plan that owns the check (`checks_by_capability` lists them).
Evidence arriving late for a replaced map, or for another step, is rejected and
changes nothing. The host never edits the map or state files: capability bodies
hand outputs to the coordinator through their `## Output handoff` section.

### Migration and restart

Old five-column routers/frontmatter need AI re-intake/harmonization, not a keyword
conversion. Legacy maps without a saved AI decision or a `map_id` are not silently resumed.
If the task, catalog or classification changes, request a fresh classification,
then plan with `--new --classification ...` and confirm. Confirmation archives the
previous state and evidence before starting an empty map, including when the new
task has one step. Until confirmation, previous state is untouched.

Map mutations use an exclusive writer lock around read/modify/write, preventing
two host processes from overwriting each other's evidence. A crash can leave
`.<slug>/.write-lock`; verify that its process is no longer active before removing
the stale lock. Muro never guesses that an existing lock is safe to delete.

See [ADR-0003](docs/adr/ADR-0003-ai-owned-intent-classification.md) and
[ADR-0004](docs/adr/ADR-0004-output-owners-conflicts-and-map-writer-lock.md)
for decision records, and [AGENTS.md](AGENTS.md) for contributor/agent rules.

## Verification status and sources

- Python unit/integration tests cover source checks, router behavior, workflow,
  factory preparation, AI-decision validation and all five generated launchers.
  Current commands/results and limits are recorded in
  [the AI-routing verification record](docs/verification/2026-11-09-ai-owned-routing.md).
  Test decisions are explicit AI-response fixtures, not evidence of LLM reasoning quality.
- Added `ui-ux-pro-max` (MIT) with its offline design-system search and data;
  the packaged `search.py` returned a structured dashboard recommendation.
- Added `elayadesign/ai-design-skills` (MIT) for conversion strategy and Figma
  design rules; Figma MCP remains an optional external dependency.
- Added `genspark-ai/genoffice` (Apache-2.0) for Office files: `office-deck`,
  `office-authoring` and `office-files`. They drive the `genoffice` command
  line, which Muro does not bundle; the capability installs GenOffice from its
  official releases when it is missing. No Office file was generated during
  verification, and no installation was attempted there; see
  [the GenOffice intake record](docs/verification/2026-11-09-genoffice-intake.md).
- Added `analyticalmonk/explain-this` (MIT) for interactive explainers:
  `interactive-explainer` (documents, topic research, codebase; one
  self-contained `index.html` with canvas figures and a blocking claim gate) and
  `explainer-fact-check` for an article that already exists. Its article
  template and references are packaged helpers; nothing is installed. No
  explainer was generated during verification; see
  [the explain-this intake record](docs/verification/2026-11-10-explain-this-intake.md).
- `start.mjs` was executed successfully from the real packaged helper, loading
  its palette and type resources; this is a dependency check, not a UI review.
- Earlier verification includes a real Claude Code `claude plugin validate`
  structural check; it does not validate the new AI classification in a live session.
- Codex, Pi, OpenCode and Hermes are packaged from their documented skill
  contracts, but no interactive host session has been verified yet. Native
  slash-command names and collisions must be checked at installation time.
- Downloaded helpers are namespaced under `scripts/<source-id>/`; they are not
  automatically executed or independently validated. GSAP remains a separate
  target-project dependency with its own license.
- No plugin installation, publication, commit or push is performed by the build.

Host contract references:
[Claude Code plugins](https://code.claude.com/docs/en/plugins/manifest-reference),
[Claude Code skills](https://code.claude.com/docs/en/skills),
[Codex skills](https://developers.openai.com/codex/skills/),
[OpenCode skills](https://opencode.ai/docs/skills/),
[Pi skills](https://pi.dev/docs/latest/skills).
