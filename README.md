<h1 align="center">
  <img src="docs/assets/branding/muro-logo-oni.png" alt="Muro" width="800">
</h1>

<p align="center"><strong>A factory for AI-routed skill packages</strong></p>

<p align="center">
  <a href="#quickstart">Quickstart</a> ·
  <a href="#how-muro-works">How it works</a> ·
  <a href="#marionette">Marionette</a> ·
  <a href="#build-your-own-package">Build your own package</a> ·
  <a href="#host-adapters">Host adapters</a>
</p>

Muro turns a curated collection of skills and plugins into one coordinator that
an AI agent can use across hosts. Each package has its own name, catalog and
release. [Marionette](examples/marionette/ROUTER.md) is the example package for
design, motion, Office files, interactive explainers and software-work
coordination. Its scope follows the sources absorbed at intake.

The host AI reads the source material, decides how the capabilities fit
together, and interprets each request in the context of the user's project.
Muro's Python runtime validates that decision and delivers one capability at a
time.

## Quickstart

From the repository root, with **Python 3.10+** and **Git**, run each command
separately.

```sh
python muro_build.py --manifest examples/marionette/sources.json --validate
python muro_build.py --manifest examples/marionette/sources.json --build
```

The first command checks the capability schema and router. The build fetches
the pinned sources for verification, so it needs network access. It stages a
fresh release in `examples/marionette/dist/marionette/` and refuses to replace
an existing release at that path.

Open **`examples/marionette/dist/marionette/GUIDE.html`** in your browser. Pick
an example to see its capability path and data handoffs, or click a node for
its intents and constraints. The guide works offline. A copy travels inside
every standalone host skill. [Guide design](docs/adr/ADR-0010-release-html-guide.md)

You can inspect the AI handoff from the terminal before installing a skill.

```sh
python examples/marionette/dist/marionette/muro.py plan --task "Explain how this repository builds a release as interactive HTML" --project .
```

The response is `classification-required`. It gives the host AI the task
context, catalog and classification instructions. Execution starts only after
the host supplies a valid decision.

## How Muro works

| Phase | Who does what |
| --- | --- |
| **Intake** | Muro exports the verified source selection. The host AI reads it and extracts supported outcomes, constraints, tools, hooks and source provenance. |
| **Harmonization** | The host AI resolves overlaps and conflicts, defines variants and dependencies, and records the reasons and unresolved gaps. |
| **Build** | Muro verifies the pins, licenses, catalog and examples. It assembles the package, portable host adapters, notices and offline guide. |
| **Runtime** | The host AI selects capability/intent pairs and explains why they fit. Python validates the decision against the task, stack and catalog digest, then runs the coordination protocol. |

Intent descriptions and exclusions carry the semantics. Capability IDs and
stack tokens constrain the decision. Python adds only declared unconditional
prerequisites. The host AI judges any conditional prerequisites, and the
runtime validates that the plan respects those judgments. Declared output
handoffs tell the guide where data travels and create no prerequisites.
[AI routing](docs/adr/ADR-0003-ai-owned-intent-classification.md) ·
[Data flow and prerequisites](docs/adr/ADR-0012-data-flow-and-conditional-prerequisites.md)

## Marionette

The same catalog can handle a single operation or a sequence of steps. These
paths come from [Marionette's authored examples](examples/marionette/guide-examples.json).

| Request | Capability path |
| --- | --- |
| Convert an existing Word file to PDF | Office file operations |
| Design a new landing page in Figma with no content outline | Visual direction → Figma design |
| Design a landing page and implement its scroll animations in a GSAP project | Visual direction → Motion specification → GSAP implementation |
| Explain a mechanism in a repository as interactive HTML | Interactive explainer, including claim verification |

A new landing page can require visual direction before Figma design. When the
outline already exists, that prerequisite can be skipped. CSS and GSAP scroll
implementations are separate variants of the same intent, selected according
to the project and the request.
[Router](examples/marionette/ROUTER.md) · [Capabilities](examples/marionette/capabilities/) ·
[Source manifest](examples/marionette/sources.json)

## Build your own package

A package lives in its own directory, with the following files. The factory
provides the prompts and runtime by default. A package can supply its own
`prompts/` or `muro/` directory.
[Factory and package boundary](docs/adr/ADR-0011-factory-separate-from-its-packages.md)

| File | Purpose |
| --- | --- |
| `sources.json` | Package identity, source revisions and licenses, selected paths, exclusions, runtime dependency notes and intake goals. |
| `capabilities/*.md` | Supported intents and exclusions, instructions, outputs, checks, tools, hooks, conflicts and any dependencies or data handoffs. |
| `ROUTER.md` | Catalog index whose rows mirror the capability metadata. |
| `guide-examples.json` | Reviewed scenarios with explicit decisions that the guide validates and illustrates. |
| `eval-cases.json` | Optional routing eval: requests with the expected decision, scored against a real model's classifications. [Principles](docs/adr/ADR-0015-design-principles-from-first-real-use.md) |
| `entries.json` | Optional discovery entries: AI-authored area skills with sharp descriptions that hosts can find, all running the same coordinator. [Discovery entries](docs/adr/ADR-0014-discovery-entries.md) |

1. **Prepare intake.** Run `--prepare-intake <source-id>` against the package
   manifest. It writes source evidence and a prompt to
   `.muro/factory/intake/<source-id>/` beside the manifest. Give that prompt to
   the host AI to perform intake.
2. **Harmonize.** Run `--harmonize` and give the prepared context in
   `.muro/factory/harmonization/` to the host AI. Review the resulting catalog,
   rationale and examples. Both preparation commands leave upstream code inert.
3. **Verify and build.** Run `--validate`, `--check-sources` and `--build`
   separately, using `--manifest <path/to/sources.json>` each time. Releases
   are staged before delivery to `dist/<slug>/` beside the manifest.

[Source intake prompt](prompts/intake.md) · [Harmonizer prompt](prompts/harmonizer.md) ·
[Intake and unification contract](docs/adr/ADR-0008-llm-owned-intake-and-unification.md)

<details>
<summary>Source pins, licenses and runtime dependencies</summary>

Every source declares a full commit SHA. `pin: release` ties it to a published
tag. `pin: head` follows an upstream without releases or tags. `pin: static`
freezes a reviewed commit. A re-pin requires review of selected files and
license notices. [Pin policy](docs/adr/ADR-0009-pin-mode-per-source.md)

Muro gates source selection on MIT or Apache-2.0. Source checks inspect
the pinned Git snapshot, selected paths, SPDX conflicts and nested licenses.
A declared `license_path` covers its own subtree. A deeper license requires
review, and the `NOTICE` beside the verified license ships with the release.
Third-party asset rights require separate inspection.
[Apache notice rule](docs/adr/ADR-0005-apache-appendix-notice-in-license-gate.md) ·
[License scope](docs/adr/ADR-0006-license-file-inside-the-source-folder.md)

The host checks tool availability and permissions at runtime. If a selected
step needs a missing runtime dependency, it announces the dependency,
official source and install location, uses the narrowest workable scope, and
checks the tool before continuing. Intake and build install nothing. Adopted
hook metadata is passive.
[Runtime dependency policy](docs/adr/ADR-0007-capabilities-install-missing-runtime-dependencies.md)

</details>

## Host adapters

For Marionette, each adapter lives under `adapters/<host>/` in the release
and includes a complete `skills/marionette/` directory. Keep that directory
intact so the launcher, catalog, prompts, helpers, license notices and offline
guide remain together.

| Host | Where the package goes |
| --- | --- |
| **Claude Code** | Use `adapters/claude-code/` as the plugin root. The namespaced skill is `/marionette:marionette`. |
| **Codex** | Copy the skill directory into `.agents/skills/` for the project or `~/.agents/skills/` for the user. |
| **OpenCode** | Copy it into `.opencode/skills/` for the project or `~/.config/opencode/skills/` for the user. |
| **Pi** | Use `.agents/skills/` or Pi's skill directory. |
| **Hermes** | Use Hermes' skill directory and `skill_view`. |

Each skill directory ships with the same standalone entry point, `python muro.py`.
Host references: [Claude Code](https://code.claude.com/docs/en/plugins/manifest-reference) ·
[Codex](https://developers.openai.com/codex/skills/) ·
[OpenCode](https://opencode.ai/docs/skills/) · [Pi](https://pi.dev/docs/latest/skills).

<details>
<summary>Runtime protocol and evidence</summary>

1. `plan --task "..." --project <path>` returns the classification context.
   The host AI copies `task`, `stack_tokens` and `catalog_digest` from that
   context and authors a decision with `status`, `selections`, `reason` and
   `questions` (adding `needs` judgments where declared, and optional `step_id`
   such as `office-files#1` when repeating a capability).
2. Repeat `plan` with the same task, project and stack options plus
   `--classification <file>`, a JSON file the host writes in the state folder
   (`plan --compact` returns its path and a compact catalog; `--focus <ids>` returns
   those capabilities in full and the others as a brief index, `--brief` returns the
   index alone, so the output stays small as sources are added; the rules travel in
   `SKILL.md`). Keep each call on one line so host permission rules match. A `direct`
   result returns the one step when no active map exists. A `confirm` result
   returns the ordered plan before repeating with `--confirm`. `no_match` and
   `needs_clarification` stop execution.
3. Each step returns `package_root`, `state_dir`, `map_path` and
   `recorded_outputs`. Submit outputs and check results atomically in one call
   with `step --project <path> --map-id <id> --capability <step> --step-data <file>`
   (or separately via `record`, `check` and `complete`). Map writes hold a
   tokened `.write-lock` recoverable after a crash via `unlock --token <token>`.
4. `resume --project <path>` uses the saved decision. When the user refines a
   request that has an active map, `plan --amend` replans and keeps the steps
   whose work is still valid. A capability declared `resumable` gets a map even
   as a single step. Replacing an active map
   uses `--new` (with optional `--preserve-completed <steps>` to retain valid
   upstream outputs) and archives previous evidence on confirmation.

The host AI authors classification JSON. Capabilities hand off through
their `## Output handoff` sections using `recorded_outputs` and `<state_dir>`,
and resolve helpers under `package_root`. The coordinator owns the map and state files.
[Classification prompt](prompts/classify.md) ·
[Output ownership and writer lock](docs/adr/ADR-0004-output-owners-conflicts-and-map-writer-lock.md) ·
[Lifecycle, discovery and batch protocol](docs/adr/ADR-0013-runtime-lifecycle-discovery-and-factory-isolation.md)

</details>

## Development and verification

```sh
python -m pytest -q
python muro_build.py --manifest examples/marionette/sources.json --validate
python muro_build.py --manifest examples/marionette/sources.json --check-sources --offline-pins
python muro_build.py --manifest examples/marionette/sources.json --build --out <scratch folder>
python muro_build.py --manifest examples/marionette/sources.json --prepare-eval
python muro_build.py --manifest examples/marionette/sources.json --score-eval <decisions.json>
```

Tests require `pytest`. They exercise source verification, factory preparation,
AI decision validation, state and the five portable launchers using fixtures.
Headless Claude Code runs exercised discovery, routing and design guidance;
engineering discovery remains unresolved. These are small samples, not measured
success rates. Interactive sessions, live multi-step execution, and live runs
on Codex, Pi, OpenCode and Hermes remain unverified.
[Live Claude Code results](docs/verification/2026-11-11-claude-code-host-test.md) and
[engineering follow-up](docs/verification/2026-11-11-engineering-discovery-followup.md).
[Routing verification](docs/verification/2026-11-09-ai-owned-routing.md) ·
[Marionette verification](docs/verification/2026-11-10-marionette-example-package.md) ·
[Guide verification](docs/verification/2026-11-10-release-html-guide.md)

[Contributor instructions](AGENTS.md) · [Architecture decisions](docs/adr/README.md) ·
[Verification records](docs/verification/)
