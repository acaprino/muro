<h1 align="center">
  <img src="docs/assets/branding/muro-logo.png" alt="Muro" width="800">
</h1>

<p align="center"><strong>A factory for AI-routed skill packages</strong></p>

<p align="center">
  <a href="#quickstart">Quickstart</a> ·
  <a href="#supported-harnesses">Harnesses</a> ·
  <a href="#marionette">Marionette</a> ·
  <a href="#build-your-own-package">Build a package</a> ·
  <a href="#ecosystem">Ecosystem</a> ·
  <a href="#contributing">Contributing</a>
</p>

---

Bring the agent skills and plugins you already use into **one package with its own catalog, coordinator, and release**. Ship that package to Claude Code, Codex, OpenCode, Pi, or Hermes Agent. [Marionette](examples/marionette/ROUTER.md) is the example package you can build from this repo.

- **Compose skills into workflows.** The host AI reads the selected sources, resolves overlaps, and uses the request and project context to choose a single capability or an ordered plan.
- **Keep decisions inspectable.** Every source is pinned, every route has a reason, and multi-step runs record their outputs and checks as they go.
- **Explore a release offline.** Open its standalone `GUIDE.html` to trace example paths, inspect capabilities and dependencies, and see which source revisions shipped.

## Quickstart

From the repository root, run these commands with **Python 3.10+** and **Git**. Building needs network access to verify the pinned sources.

```sh
python muro_build.py --manifest examples/marionette/sources.json --validate
python muro_build.py --manifest examples/marionette/sources.json --build
```

The same operations are subcommands of one CLI: `python -m muro validate --manifest examples/marionette/sources.json`, or install the `muro` command with `pip install -e .` from this checkout (editable; the factory's prompts sit beside the package). `muro --help` lists every command, including two the flag interface does not have: `review` prepares a host-AI re-examination of the package's recorded decisions against its pinned sources, and `baseline` reports, read-only, which source pins are behind their upstream ([ADR-0021](docs/adr/ADR-0021-factory-cli-executable.md)).

Open `examples/marionette/dist/marionette/GUIDE.html` and choose an example from **Percorsi** (Paths). If you already have a build there, pass `--out <fresh-directory>` to stage the next release elsewhere.

To try the package in Claude Code, load the generated adapter from the repository root.

```sh
claude --plugin-dir examples/marionette/dist/marionette/adapters/claude-code
```

Run `/marionette:marionette` and ask *“Explain how this repository builds a release as interactive HTML.”* For another host, open the `INSTALL.md` in its adapter directory.

<details>
<summary>Inspect what the harness receives</summary>

```sh
python examples/marionette/dist/marionette/muro.py plan --task "Explain how this repository builds a release as interactive HTML" --project .
```

`classification-required` returns the task context, catalog, and instructions the host AI uses to choose a route. With a valid selection, the launcher returns either a single step or a plan to confirm.

</details>

## Supported harnesses

Each row corresponds to a native adapter in the generated release. Its `INSTALL.md` covers the host API, installation, and activation limits.

| Harness | Adapter directory | Native session instructions | Declared source command hooks |
| --- | --- | --- | --- |
| <img src="docs/assets/branding/harnesses/claude-code.svg" width="24" alt=""> **[Claude Code](https://code.claude.com/docs/en/plugins/mods/reference)** | `adapters/claude-code/` | `prompt.compose` system section | Supported |
| <img src="docs/assets/branding/harnesses/codex.svg" width="24" alt=""> **[Codex](https://developers.openai.com/codex/hooks/)** | `adapters/codex/` | Developer context on session and subagent start | Supported |
| <img src="docs/assets/branding/harnesses/opencode.svg" width="24" alt=""> **[OpenCode](https://opencode.ai/)** | `adapters/opencode/` | System parts via the V2 package plugin API | — |
| <img src="docs/assets/branding/harnesses/pi.svg" width="24" alt=""> **[Pi](https://pi.dev/)** | `adapters/pi/` | Named system section via a package extension | — |
| <img src="docs/assets/branding/harnesses/hermes.png" width="24" alt=""> **[Hermes Agent](https://github.com/NousResearch/hermes-agent)** | `adapters/hermes/` | Registered system prompt section up to 4,000 characters; a longer policy goes whole through `pre_llm_call` | — |

Installing the **complete adapter** lets the harness load the session instructions and active hooks declared in `delivery.json`, subject to the host's permissions and trust settings. For on-demand capabilities, the standalone `skills/<command>/` directory includes its launcher, catalog, prompts, helpers, notices, and offline guide. Keep the directory intact and install any discovery entries alongside it.

Each adapter's `INSTALL.md` ends with the host's own install command. The Claude Code and Codex adapters are their own marketplace (`claude plugin marketplace add <adapter>`, `codex plugin marketplace add <adapter>`); Pi uses `pi install <adapter>`; OpenCode lists the adapter under `plugins` in `opencode.json`. On Claude Code, Pi and OpenCode the declared session instructions are active with no further step. Codex runs a plugin's hooks only after you trust them once in `/hooks`. See the [live activation runs](docs/verification/2026-11-12-policy-active-by-default-live.md).

Marionette completed a two-step workflow in live runs on **Claude Code, Codex, OpenCode, and Pi**. Hermes prompt registration was exercised through its real plugin API. See the [live harness runs](docs/verification/2026-11-12-all-hosts-live.md) and the [native policy checks](docs/verification/2026-11-12-native-policy-delivery.md) for the scope of each test.

[Harness logo sources](docs/assets/branding/harnesses/README.md)

## Marionette

Marionette shows what the factory produces from sources covering product design, motion, Office files, research, explainers, and engineering workflows. These routes come from its [authored guide examples](examples/marionette/guide-examples.json).

| Example request | Route |
| --- | --- |
| Convert this Word document to PDF | Office file operations |
| Design a new landing page in Figma. We still need a content outline | Visual direction → Figma design |
| Design a landing page and implement the scroll animations in our GSAP project | Visual direction → Motion specification → GSAP implementation |
| Find recent papers on a method and add the three most relevant to the wiki | Literature search → Paper wiki |
| Explain a mechanism in this codebase as interactive HTML | Interactive explainer with claim verification |

Marionette also embeds **[Ponytail v5.3.3](https://github.com/DietrichGebert/ponytail/tree/v5.3.3)** and **[i-have-adhd v0.4.1](https://github.com/ayghri/i-have-adhd/tree/v0.4.1)**. Their synthesized session policy promotes complete, focused work and clear communication. It loads through the native system/developer channel when the complete adapter is installed, before any skill is selected. Concise conversation preserves the requested detail, artifact quality and verification.

Ask for a code-change review, a whole-repository audit, a deliberate-shortcut ledger, or an explanation of the working method and published benchmark. These remain distinct, discoverable tasks. The original plugins’ mode controls, status UI and telemetry are outside this curated integration. See the [integration and verification record](docs/verification/2026-11-12-marionette-ponytail-adhd.md) and [delivery decisions](examples/marionette/delivery.json).

[Browse the catalog](examples/marionette/ROUTER.md) · [Read the capabilities](examples/marionette/capabilities/) · [See the source manifest](examples/marionette/sources.json)

## How Muro works

| Phase | What happens |
| --- | --- |
| **Intake** | Muro exports the verified source selection. The host AI reads it, extracts supported intents, constraints and tools, and records what each part should become. |
| **Harmonization** | The host AI resolves overlaps and conflicts, defines variants and dependencies, and reviews delivery decisions across the whole package. |
| **Build** | Muro verifies pins, licenses, the catalog and examples, then packages the runtime, host adapters, notices and offline guide. |
| **Runtime** | The host AI interprets the request and chooses capability and intent pairs. Python validates that decision against the task, stack and catalog, expands declared prerequisites, and hands off one capability at a time. |

Intake sets the package scope. The host AI owns the meaning of intents and judges whether a conditional prerequisite applies. Output handoffs describe data flow independently of prerequisites. A package can expose **on-demand capabilities**, supply **session instructions**, or register **declared hooks**. The host AI records why each delivery form fits, and Muro emits the validated declarations. A package can also ship session policy alone with a header-only router and reviewed `no_match` guide examples.

[AI-owned routing](docs/adr/ADR-0003-ai-owned-intent-classification.md) · [Data flow and prerequisites](docs/adr/ADR-0012-data-flow-and-conditional-prerequisites.md) · [Delivery contract](docs/adr/ADR-0016-delivery-form-and-self-registering-releases.md)

<details>
<summary>Runtime protocol and evidence</summary>

1. `plan --task "..." --project <path>` returns the classification context. The host AI copies `task`, `stack_tokens`, and `catalog_digest` into the decision and authors `status`, `selections`, `reason`, and `questions`, plus any declared `needs` judgments. Repeated capabilities can carry a distinct `step_id` such as `office-files#1`.
2. The host writes its JSON in the state folder and passes it to the same `plan` call with `--classification <file>`. Use `--brief` for the index and `--compact --focus <ids>` to read selected capabilities in full. `direct` returns one step, `confirm` returns an ordered plan to approve with `--confirm`, and `no_match` or `needs_clarification` stops execution.
3. Submit outputs and checks with the returned `step --project <path> --map-id <id> --capability <step> --step-data <file>` arguments. A step answers only the checks its result lists: those its capability declares for the intent chosen for that step (`intent_checks`). A check recorded on the wrong step is rejected, and `not-applicable` is accepted only for a check with a declared condition (`check_conditions`, [ADR-0018](docs/adr/ADR-0018-checks-scoped-to-the-step-intent.md)). The runtime also accepts separate `record`, `check`, and `complete` calls. The coordinator holds a tokened writer lock during state changes. Use `unlock --token <token>` to recover after a crash.
4. Use `resume --project <path>` to continue the saved decision and `plan --amend` to refine an active task. Explicitly replacing a map uses `--new` and archives previous evidence on confirmation. `--preserve-completed <steps>` retains valid completed work when appropriate.

Capabilities hand outputs over through their `## Output handoff` sections using the step's recorded outputs and state directory. The coordinator owns the map, and helpers resolve under the package root. `python muro.py session-context` prints the declared policy for inspection. Policy changes invalidate earlier decisions through the catalog digest.

[Classification prompt](prompts/classify.md) · [Output ownership and writer lock](docs/adr/ADR-0004-output-owners-conflicts-and-map-writer-lock.md) · [Runtime lifecycle](docs/adr/ADR-0013-runtime-lifecycle-discovery-and-factory-isolation.md)

</details>

## Build your own package

Start with Marionette's layout and give the new package its own identity and source selection. Each package can supply its own prompts or runtime, with Muro's factory defaults available out of the box.

| File | What it holds |
| --- | --- |
| `sources.json` | Package identity, source pins, licenses, selected paths, exclusions, runtime dependency notes, and intake goals. Optional `intake_only_paths` name selected files the generated plugin does not need at run time: they are read at intake and not shipped in the release |
| `capabilities/*.md` | Intents and exclusions, procedures, outputs, checks, tools, hooks, and relationships. With more than one intent, `intent_checks` says which checks each intent answers; `check_conditions` gives the case in which a conditional check applies ([ADR-0018](docs/adr/ADR-0018-checks-scoped-to-the-step-intent.md)) |
| `ROUTER.md` | Catalog index with one row per capability and the harmonization record |
| `guide-examples.json` | Reviewed requests with explicit decisions that the guide validates and illustrates |
| `entries.json` | Optional discovery skills that point into the same catalog. Each entry's `absorbs` names the originals from `plugin.replaces` it stands in for, written into its description by the build ([ADR-0019](docs/adr/ADR-0019-absorbed-originals-named-at-discovery.md)) |
| `delivery.json` | Optional delivery decisions, session text, and hook declarations |
| `eval-cases.json` | Optional routing examples with expected decisions for scoring a host AI |

1. **Prepare intake.** Run `muro intake <source-id>` with the new manifest. Give the host AI the prompt and evidence under `.muro/factory/intake/<source-id>/` beside the manifest.
2. **Harmonize.** Run `muro harmonize` and give the host AI the context under `.muro/factory/harmonization/`. Review the resulting catalog, rationale, and examples.
3. **Verify and build.** Run `muro validate`, `muro check-sources`, and `muro build` separately with `--manifest <path-to-sources.json>` each time. The release lands in `dist/<slug>/` beside the manifest unless you supply `--out`.
4. **Keep it honest over time.** `muro baseline` says which pins fell behind their upstream (exit 1 when one did), and `muro review` prepares the host-AI re-examination of the recorded decisions before you re-pin or re-harmonize. Both change nothing by themselves.

Every step also works through the legacy flags (`python muro_build.py --manifest … --validate`).

[Intake prompt](prompts/intake.md) · [Harmonizer prompt](prompts/harmonizer.md) · [Delivery prompt](prompts/delivery.md) · [Review prompt](prompts/review.md) · [Factory and package boundary](docs/adr/ADR-0011-factory-separate-from-its-packages.md)

<details>
<summary>Source pins, licenses, and runtime dependencies</summary>

Each source records a full commit SHA. `pin: release` ties it to a published tag, `pin: head` follows an upstream without releases or tags, and `pin: static` freezes a reviewed commit. Re-pinning calls for a review of the selected paths and license notices.

The source gate accepts MIT and Apache-2.0, checks selected paths for nested licenses and SPDX conflicts, and ships applicable licenses and notices. A declared `license_path` covers its own subtree. Third-party asset rights need their own review.

Upstream code stays inert during intake and build. If a selected capability needs a missing runtime tool, the host checks permissions, reports the official source and install location, uses the narrowest workable scope, and verifies the tool before continuing. Active hooks must have an explicit delivery declaration. Hook commands use literal argv, and Windows batch shims require declaring the executable and script directly.

[Pin policy](docs/adr/ADR-0009-pin-mode-per-source.md) · [Apache notices](docs/adr/ADR-0005-apache-appendix-notice-in-license-gate.md) · [License scope](docs/adr/ADR-0006-license-file-inside-the-source-folder.md) · [Runtime dependencies](docs/adr/ADR-0007-capabilities-install-missing-runtime-dependencies.md)

</details>

## Ecosystem

| Project | What it does |
| --- | --- |
| **[Shinatama](https://github.com/acaprino/shinatama)** | Run multiple coding-agent harnesses in tiled terminals from a local-first desktop workspace. |
| **[Mukade](https://github.com/acaprino/mukade)** | Browse, export, and move coding-agent sessions between harnesses with a CLI, terminal UI, and Rust library. |

## Contributing

See [AGENTS.md](AGENTS.md) for repository conventions and verification commands. [Architecture decisions](docs/adr/README.md), the [functional requirements](docs/frd/README.md), and [verification records](docs/verification/) explain how the factory and portable adapters fit together.

Install `pytest` for the development suite.

```sh
python -m pytest -q
python muro_build.py --manifest examples/marionette/sources.json --validate
```

For source and packaging changes, also run `--check-sources` and stage a fresh release with `--build --out <fresh-directory>`. Use `--check-sources --offline-pins` to check manifest pins and local repositories offline. For changes to the routing prompt or catalog, use `--prepare-eval` and score the host AI's decisions with `--score-eval <decisions.json>`.

[Routing verification](docs/verification/2026-11-09-ai-owned-routing.md) · [Guide verification](docs/verification/2026-11-10-release-html-guide.md) · [Routing eval and development principles](docs/adr/ADR-0015-design-principles-from-first-real-use.md)
