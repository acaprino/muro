# Working on Muro

## Desktop UI ownership

The desktop UI is React on `@acaprino/sigrid` (owner decision of 2026-11-23,
ADR-0031). Every component, layout, style and UI behaviour comes from Sigrid,
the graph canvas included. Muro owns only domain data, operations and screen
composition; it keeps no design system of its own: no components that restyle
or repeat Sigrid's, no CSS rules beyond the Tailwind entry, no literal colours
or sizes. What Sigrid lacks is asked of Sigrid. Keep the shell body stable
across renders while a modal is open.

Sigrid is not on npm. `package.json` names its GitHub Release tarball,
`https://github.com/acaprino/sigrid/releases/download/v<version>/acaprino-sigrid-<version>.tgz`
(first `v3.3.9`), and the SHA-256 of that release's `manifest.json` is recorded
in `docs/verification/`. Never a `file:` path to a checkout, and never a git
dependency that runs `prepare`. `package.json` changes in the commit that
installs it; until then it still names Imago.

Native window primitives (glass and native theme, caption controls, navigation
guard) stay with the Rust crate `imago-shell`, pinned in
`apps/desktop/src-tauri/Cargo.toml` and `Cargo.lock`, until the owner moves
them. The npm package `@acaprino/imago` stays for its window glue
(`@acaprino/imago/shell`, with its Tauri adapter) and nothing else of it: keep
its tag in `package.json` and `package-lock.json` equal to the Rust pin
(`imago-check` is gone: compare them by hand).
`docs/imago-migration.md` is the history of what Muro took from Imago.

Before UI work, read `node_modules/@acaprino/sigrid/AGENTS.md` and `DESIGN.md`
(they ship in the package; `agents/catalog.json` lists every component and its
props) and the component or style files they reference. Apply its tokens and
confirmed design choices within the requested scope. Use its components and
tokens. Build a control of your own from the tokens, never from literal colours
or sizes. Report conflicts and keep unresolved choices explicit.
Run `npx --no sigrid-check apps/desktop/src` before you say UI work is done: it
reads files and builds nothing. It needs the Sigrid package installed, and no CI
step runs it yet (ADR-0031); where it was not run, say so.

## Product contract

Muro is a factory that absorbs curated pinned skills/plugins into one multi-host
coordinator. **AI owns semantic classification** at intake, harmonization and
runtime. Never replace it with keyword lists, regex/substring task matching,
hardcoded domain taxonomies or an automatic coordinator fallback.
Intake and unification are performed by the host LLM, including comprehension,
knowledge synthesis, conflict resolution and placement in the decision graph.
Source order and matching role/name labels do not decide precedence or merges.
Preparation only supplies evidence; it is not completed AI intake/harmonization.
Record concise source-grounded reasons and unresolved gaps (ADR-0008).

Owner correction of 2026-11-11: a package's scope is set by intake and by nothing
else. Whatever the absorbed skills and plugins do, the generated plugin does, in
any domain (code, design, documents, anything a harness can run). Never ask
whether a package "should" cover a domain its sources cover, never hide an
absorbed capability from discovery, and never treat a domain as a pending
decision: to change the scope, add or remove a source (ADR-0015).

Owner rule of 2026-11-12: Muro never alters absorbed content, meaning what a
source prescribes: its rules, numbers, conditions, exceptions and limits. The AI
chooses the form and the place of each part (capability, permanent policy,
hook, command). It may change what a source prescribes only to guarantee
harmonization and coexistence under the package's principles: two owners of one
output, contradictory rules of two sources, routing or activation that competes
with the coordinator, a step no host can run. Size, style and taste are never
reasons. Every such change is recorded with the collision that required it
(ADR-0017). Text that acts in every session (always-on) keeps the source's own
words, because nothing opens the original later.

Owner correction of the same day, after that rule was applied word for word
("hai preso troppo alla lettera"): "il contenuto si altera o addirittura si
rigenera tramite llm per creare l'hook, il prompt di ingresso o la descrizione
di selezione [...] ma poi se attivata va a fare riferimento alla sua versione
integrale, ed è integrale solo in relazione a ciò che serve". So there are two
layers. What selects and starts a capability (intent and entry descriptions,
the capability body as its entry prompt, hook text) is written by the host LLM
in its own words, compact, for this package. What the rule protects is the
substance: a generated text never drops, weakens, strengthens or invents a
rule, number, condition or exception of the source. Once activated, the body
sends the host to the packaged original, which stays whole and untouched, for
the parts the task at hand needs, named by file and section; it does not
require reading everything first and does not need to quote. Same message: a
selected file (a skill, a reference, knowledge, a script) the generated plugin
does not need is removed as a file and as a reference (`intake_only_paths`). The original wins
where the two differ, except for the differences listed with their collision
in `## Sources` under "Changes for coexistence (ADR-0017)". Name packaged paths
as the release lays them out (the factory drops `skills/<source-id>/`) and
never write the heading literal of the Sources section inside a step.

Owner decision of 2026-11-12 ("io eliminerei in generale questo limite per tutto muro"): Muro adds no limit of
its own on what an absorbed tool or command may send off the machine (a file,
a query, content to a provider), in any package. An earlier harmonization had
written "not unless the user asks" on three GenOffice commands with no source
behind it. The source's own statement of what leaves the machine is carried as
content, a tool's purpose may say that data leaves, and the host's permissions
and the user's instructions stay authoritative; intake, harmonization and
capability bodies never add a restriction the source does not state.

Owner correction of 2026-11-17 ("marionette ha tutto!", "fai in modo che non
accada mai più questa perdita di tempo"): a source is absorbed with every file
its method uses at run time: its kit, its scripts, its checks, its gate, its
images. A capability that tells the host a part of its source is "not packaged"
and has it work by hand is a failed intake, not a disclosed limit, and a check
never passes because an omission was disclosed. The intake completes the file
selection from the evidence the factory prepares; the source check and the
build refuse a named file that is neither selected nor explained (ADR-0026).
Binary media is not refused for being binary (ADR-0027).

Owner question of 2026-11-18 ("controlla come viene usata la skill explain
anything html"): it was not used. The intake of 2026-11-11 had left it out of
its source, unread, as "served by explain-this", which starts on other requests
and makes another page. A skill is read before it is left out as a duplicate,
and the comparison goes in its `dropped` decision; only the owner narrows a
source without that reading (`prompts/intake.md`, ADR-0026 amendment). Absorbing
it was not enough either: a rule of the always-on policy ("Explain fully")
answered the same request in the chat. A text that acts in every session can
own a request that a capability also answers: harmonization names the one owner
there, in a marked line, and a live session checks it.

Owner correction of 2026-11-10: Muro is only the factory. The unified skills are
a package of their own, never part of Muro: the example is `examples/marionette/`
(`sources.json`, `capabilities/`, `ROUTER.md`, `guide-examples.json`, plugin
identity `marionette`). Paths below that name those files are relative to a
package directory. Keep package-specific knowledge (named dependencies, domain
rules) out of `muro/` and `prompts/`. Prompts and the shipped runtime come from
the factory unless the package directory has its own (ADR-0011).

Read README.md, the package's ROUTER.md, the relevant capability files and
docs/adr/ADR-0003-ai-owned-intent-classification.md before changing routing.
ADR-0001/0002 document the original architecture; ADR-0003 records the requested
correction and its implemented contract (its text is not yet separately approved).
Preserve local user changes and check Git status before editing. No commit, push,
installation, publication or replacement of existing dist output without request.

## Architecture and ownership

- `custom-instructions/**/*.md` beside a package's `sources.json`: owner-authored
  UTF-8 input, including subdirectories, with no required frontmatter. The host
  LLM decides its meaning, scope, coexistence and delivery form. Filename and
  order never classify it. Preparations include exact snapshots and inventory;
  `delivery.custom_instructions` records `digest`, `files` and AI-authored
  `intake_only_paths`. Every file has a delivery decision with its exact relative
  path as `source`. One collection contributes one 6000-character always-on
  allowance. Changes, renames and removals require re-harmonization. Originals
  stay in the source package; only runtime-needed files ship, with `SKILL.md`
  renamed `SKILL.source.md`. The build receipt `custom-instructions.lock.json`
  permits that declared pruning at runtime, never at source validation. Preserve
  raw bytes across Git checkouts. See ADR-0024 and docs/custom-instructions.md.

- `sources.json`: source identity, pinned revision, license gate, selected paths,
  exclusions, runtime dependencies and source-specific intake goal. Optional
  `intake_only_paths`: selected files the intake AI read and that the generated
  plugin does not need at run time (their content is carried in the policy or in
  a body, or was dropped). They stay in the intake snapshot and are not packaged; a capability that
  points at one is rejected. The AI decides per file; Python only removes and
  checks (owner, 2026-11-12: a system prompt turned into capabilities does not
  also travel as a raw file; ADR-0016 amendment). Every source
  declares `pin`: `release` (with `release`, the published tag its commit must
  be), `head` or `static`. Owner rule of 2026-11-10: pin published releases, not
  an arbitrary commit; an upstream without releases follows `head`, and `static`
  freezes a reviewed commit (ADR-0009). The license
  is the root `LICENSE` unless `license_path` names the file that licenses the
  source's own folder; that file covers only paths under its folder, and a
  license deeper than the verified one always needs review (ADR-0005, ADR-0006).
  Optional `notice_paths`: selected files that list the third-party notices of
  code a source bundles in a prebuilt file, which the gate cannot see inside.
  They must ship; the aggregated `NOTICE.md` points at each one. Declared at
  intake, never guessed from a file name (ADR-0025).
- `muro/coverage.py` and `coverage.json` in the intake workbench: what the pinned
  commit holds outside `selected_paths` (`left_out`) and which of those files
  and folders the selected files name (`referenced`). Owner correction of
  2026-11-17, after Marionette built a flat page by hand because taste-skill
  travelled as 11 files of 1,631 ("marionette ha tutto!", "ma è un problema di
  muro allora"): a source is absorbed with every file its method uses at run
  time. The intake AI completes `selected_paths` from that evidence and has the
  intake prepared again. A capability never tells the host that part of its
  source is "not packaged", and no check passes because an omission was
  disclosed. Python resolves paths and counts; it never decides what is needed
  (ADR-0026). The gate: `check-sources` and `build` refuse an unselected file
  that a selected file names unless the source's `omissions` (`{paths, reason}`,
  AI-authored) explains it; `intake` and `init` do not gate, because the
  workbench is where the AI learns what is missing. Owner, same day, on being
  told the gate refused taste-skill's images by extension ("ma come può averle
  taste skill allora se non si potrebbero usare?", "fai in modo che non accada
  mai più questa perdita di tempo"): binary media travels when the intake
  declares it in `media_paths` after reading how the source licenses it, with
  third-party credits in `notice_paths`. The refusal by extension alone and the
  exclusion of a source's own downloader tools (ADR-0002) no longer hold
  (ADR-0027).
- `prompts/intake.md`: AI reads selected source skills, classifies all their
  supported outcomes and extracts capabilities with source-to-intent provenance.
  `prompts/harmonizer.md`: AI normalizes intent meanings, merges overlapping roles
  and defines alternatives/dependencies. `prompts/delivery.md`: AI decides the
  form each part takes (below). Preparation commands do not call an LLM.
- `capabilities/*.md`: ten frontmatter fields: id, role, when, after, outputs,
  checks, intents, tools, hooks, conflicts. `intents` is nonempty `{id, description, excludes}`
  data. Optional eleventh field `reads`: output keys of other capabilities used
  when recorded; AI-authored data flow for the guide, validated against producers,
  never a prerequisite. Optional twelfth field `needs`: conditional prerequisites
  `{capability, label, when, reason}`; `when` is plain language judged per task by
  the classifying AI, never by Python, which only requires a reasoned judgment
  for each and holds the plan to it. AI-written graph labels are 5 words at most
  (ADR-0012). `when` is only `—` or comma-separated stack constraints. Router rows must
  match the capability exactly, including ordered intent IDs in column six.
  Check scope (ADR-0018): with more than one intent, `intent_checks` maps every
  intent to the checks a step serving it answers, and every check belongs to at
  least one intent; the runtime asks a step only those and rejects any other.
  `check_conditions` gives a check that applies only in some tasks its case in plain
  language; the host may record it `not-applicable` with the reason, and no other
  check may be. Both are AI judgments at harmonization, never derived by Python. An
  `after` prerequisite has no AI-chosen intent, so its intents share one check scope.
- `ROUTER.md`: one table row per capability plus a short harmonization record;
  the 80-line cap counts text only, never table rows (ADR-0015 amendment).
- `prompts/classify.md`: the host AI interprets the runtime task and actual project
  context. `plan --compact --focus <ids>` gives those capabilities in full and
  the rest as a brief index, one group per discovery entry when the package has
  entries (a group names no skill; live run, 2026-11-14); `--brief` gives the
  index alone. Entry skills focus
  on their own capabilities, the umbrella starts from the index. `muro/routing.py` validates its structured decision and expands only
  explicit prerequisites. `muro/runtime.py` handles confirmation, state and evidence.
- `muro/adapters.py` and `muro/release.py`: every host's standalone skill folder
  includes runtime, router, capabilities, prompts and license notices. Test the
  packaged launcher outside the source checkout, not only Python imports.
  An adapter is installable with its host's own command: the Claude Code and
  Codex adapter folders are their own single-plugin marketplace
  (`.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`), and
  each `INSTALL.md` ends with `## Install`: the command and what is active after
  it. Write a command there only after running it on the real host (owner,
  2026-11-12: what a package declares always-on is active by default once
  installed). Codex reviews a plugin's hooks in `/hooks` before running them;
  say so, never claim it away.
- `muro/guide.py` and `muro/guide.html`: every release generates an offline,
  self-contained `GUIDE.html` at its root and in every standalone host skill.
  Initially show only the responsive navigable graph and a few controls for
  paths, intents and reset. Open brief intent descriptions and details on node
  click; keep full catalog and commands available on demand.
  Render actual packaged metadata and source pins without losing exclusions,
  constraints, dependencies, alternatives, conflicts, outputs, tools or checks.
  Meaning and collaboration rationale remain AI-authored; rendering/filtering
  never classifies tasks or invents graph edges. Do not hand-edit or reuse a
  previous release's HTML (ADR-0010).
  Use the pinned Cytoscape.js bundle in `muro/vendor/cytoscape/` for graph layout
  and navigation; verify its recorded hashes and preserve its MIT license. Embed
  it in the HTML rather than fetching a browser CDN. Keep semantic decisions in
  the AI-authored catalog and examples.
- `guide-examples.json`: required nonempty documented examples authored/reviewed
  by a person or host LLM, maintained with the catalog and packaged beside the
  guide. Validate explicit decisions with runtime rules and expand declared
  prerequisites only; never derive example meanings or selections by script.
- `entries.json` (optional): discovery entries the harmonizing AI authors, each a
  named group of capabilities with a sharp "Use when" description. The build
  emits one extra skill per entry that runs the same coordinator against the
  whole catalog, hidden from the slash menu on Claude Code. Python checks names,
  references, length and that every capability has an entry; it never groups
  capabilities or writes descriptions (ADR-0014). An entry's `absorbs` lists the
  names from `plugin.replaces` whose work it does, judged by the harmonizing AI
  from the sources; the build appends after the AI text a sentence naming them,
  and the umbrella says its entries name what it absorbs. A name delivered only
  as session policy has no entry (ADR-0019).
- `delivery.json` (optional) and `prompts/delivery.md`: what each part of each
  source becomes in this package, decided by the host AI at intake and reviewed
  at harmonization: `decisions` of `{source, content, form, targets, reason}`
  with form `capability`, `always-on`, `hook`, `mcp-server` or `dropped`, the `always_on`
  session text (the contributing sources' own words plus marked coexistence
  lines; at most 6000 characters for each source with an `always-on` decision,
  owner rule of 2026-11-12: the limit is proportional to the intakes that go
  into it) and `hooks`
  wirings `{host, capability, event, matcher, run}`, with an optional `timeout`
  in whole seconds when the source declares one for its hook. Both preparations append the
  prompt. `muro/delivery.py` checks shape, references, a decision for every
  source and that each form has something behind it, then emits only what the
  document declares; it never chooses a form (ADR-0016). A validated always-on
  package can have no capabilities: header-only router, authored no_match guide
  examples, no entries and no discoverable SKILL.md. The policy and delivery
  declarations participate in catalog_digest and are supplied to routing evals.
  Owner, 2026-11-21, on a source whose skills call the tools of a server it
  ships ("Secondo me Muro dovrebbe inglobare anche server mcp"): the server is
  absorbed with its source. The intake selects the files it runs from, and
  `mcp_servers` declares it once, host-neutral, as `{name, source, run}` with
  an optional `env` for its own packaged files (never a secret). Each adapter
  writes the form its host reads: `.mcp.json` (Claude Code), root `mcp.json`
  (Codex), `pi.registerMcpServer` in a second extension (Pi), `ctx.mcp.transform`
  (OpenCode) and, because Hermes ignores `mcp.json` beside a native
  `plugin.yaml`, a portable package `adapters/hermes-mcp` with its own copy of
  the serving source's files, licenses and notice. A server's program is a
  command on the host and its packaged files are arguments; it names only
  files under `scripts/<its source>/`, and the build refuses a path outside
  that folder or one the release does not carry. A server the source only calls and does not
  ship stays a runtime dependency. Python never chooses a name or a host
  (ADR-0030).
- `eval-cases.json` (optional): AI-authored requests with expected status and
  ordered capabilities. Use `expect.selections` to test the actual operation
  when a capability serves several intents or depends on a conditional prerequisite.
  `--prepare-eval` gives the host AI rules, catalog and
  contexts without the expectations; `--score-eval <decisions.json>` validates
  and compares. Python never classifies a case (ADR-0015).

## Tools, hooks and execution

Catalog logical tool requirements with purpose and required/optional status.
Catalog adopted hooks with event, action, declared tools and policy `manual`,
`host-approved` or `active`. Record original defaults, effects, portability and
omitted/uninspected hooks in source provenance; do not assume omitted upstream
files contain none. The host AI must map requirements to real tools and check
availability/authorization. Capability frontmatter describes a hook; it is not
the wiring and grants no permissions.

Owner correction of 2026-11-12 ("se installo il plugin generato da muro, allora
può attivare da solo prompt, hook, tools, skills", "tutto ciò che serve"):
installing a generated plugin is the consent, so a release may register by
itself what its package declares in `delivery.json`: text for every session,
hooks with policy `active` and, since 2026-11-21, the MCP servers a source
ships (ADR-0030). May is not should. Same day, on a design system
prompt offered to Marionette: it "non deve fagocitare tutto" in a package that
is "multi theme, context e intent"; it becomes capabilities found from context,
harmonized with the others, and "questo è anche il tipo di sensibilità che mi
aspetto da Muro" for every new intake. So the form of each absorbed part is an AI
judgment with a recorded reason (`prompts/delivery.md`), always-on is the
exception, and never a Python rule or a default taken from the source's shape.
A package without the document registers nothing. Intake and build still execute
and register nothing on the factory machine, and classification never registers
a hook. All five native adapters deliver permanent policy through the host's
system/developer instruction channel. Hermes caps a section at 4,000 characters
(8,000 in all) and skips what is over: a longer policy is never cut, it goes
whole through `pre_llm_call` into the turn's user message (read in the Hermes
source on 2026-11-12, not run live). Claude Code and Codex also register
declared source command hooks; unsupported wirings are rejected. Installing
only skill folders does not load native policy. Host trust, safe mode and
permissions remain authoritative. API requirements and limitations belong in
`INSTALL.md` (ADR-0016, which
supersedes the passive-hook rule of ADR-0007 and its 2026-11-11 amendment).
Hook `run` is literal argv, never shell syntax; generated commands resolve the
plugin root inside a stdlib Python trampoline. Windows batch targets are
rejected; declare the executable and script directly. Codex policy hooks emit
event-specific JSON additionalContext; raw `session-context` is inspection only.
Test native delivery separately from model behavior and record both limits.
After a policy upgrade, Hermes needs a new session because resumed sessions may
retain their persisted prompt. Do not claim refresh from registration alone.
TokenEconomizer's hooks are still `host-approved` and registered on the user's
request by its capability: activating them by default is an open delivery
decision, not yet run live. Marionette's first active source hook was
taste-skill's finish gate on `Stop` (2026-11-17): it exited at once where no
build was armed, and was run live on Claude Code, not on Codex. The owner
removed taste-skill on 2026-11-19 ("la ritengo troppo prescrittiva e
costrittiva"), and Marionette registers no hook since. A catalog with
an active hook is refused by the runtime without its `delivery.json`: a test
fixture that copies a package's capabilities copies that document too
(`tests/routing_helpers.py`, `copy_delivery`).

Owner decision of 2026-11-09 ("il plugin/skill dovrebbero installarli se
necessario"): a capability installs a runtime dependency it needs and finds
missing (a package, a command-line tool, an application) instead of stopping. It
states in one line what is installed, from which official source and where; uses
project or user scope before anything wider; checks the tool answers; and never
substitutes another engine. A failed install, or the user's objection, blocks
only the delivery that depends on it. The classifier does not treat such a
dependency as a reason to stop. Intake records how each dependency is checked
and installed; when the source gives no method, it says so. Intake and build
still install nothing, and the skill or plugin itself is never installed by a
capability (ADR-0007). What a release registers by itself is ADR-0016's subject.

Owner correction of 2026-11-10 ("sono da valutare runtime caso per caso"): there
is no closed dependency manifest and no build gate on dependencies. The host AI
judges at runtime what the task needs (GSAP, a browser, a runtime) and installs
what is missing under the rule above. `runtime_deps` and capability notes are
guidance from intake, not an exhaustive list.

Analyze contradictions and shared resource writes during harmonization and runtime
selection. Use `conflicts` for incompatible capability IDs, not just role labels.
Python must reject duplicate output producers and conflicting variants before
execution. Preserve one owner per output and explicit sequential handoffs. Map
mutations must hold the writer lock for the full read/modify/write operation.
Evidence is bound to its map and step: `record`/`check` require the `map_id` and
capability returned with the step, and reject anything else unchanged. Capability
bodies hand outputs over in `## Output handoff`, never by writing the map, and
reference helpers as `<package_root>/scripts/<source-id>/...`. A packaged source
`SKILL.md` is stored as `SKILL.source.md`, so no host registers an absorbed
original as a skill; validation rejects a body that names the old file. A mapped
step's result carries `scope`, `remaining_steps` and the exact `submit`
arguments; `checks` carries `submit_check` and `submit_complete` (live runs,
2026-11-12). A direct result carries the exact `record --direct` line as
`submit`, and the skill says to run it even after another shell command was
denied: without both, live hosts left `required_outputs` unrecorded (live
runs, 2026-11-14).

Without an AI decision, `plan` returns classification-required and executes nothing.
The host creates the JSON and submits --classification; users need not know skill
names or write routing JSON. no_match and needs_clarification stop execution.
Resume preserves the validated decision; stale/legacy maps require a new
classification and --new, archiving prior evidence on confirmation. Never silently
migrate old keyword decisions or reuse outputs for a changed classification.

## Changes and verification

Keep Python standard-library-only and host-neutral. Keep upstream code inert
during intake. Respect license/provenance rules and the one-capability-per-step
contract. Do not hand-edit generated dist copies; build to a fresh output location.

Owner principle of 2026-11-14 ("il senso è progettare l'architettura in
funzioni, moduli e classi riutilizzabili, senza duplicazioni"): every piece of
knowledge lives once and is reused — per-harness delivery and adaptation in the
adapter modules (harmonization stays host-neutral; `build` turns the one
catalog into every host's native form), pin mechanics in one module shared by
baseline and scaffold, one capture helper for CLI and MCP. A second copy of
the same logic is a bug, not a convenience.

For routing changes, cover the full chain: source prompt → capability schema →
router/catalog → AI-response boundary → plan/state → portable host adapters.
Test malformed/unknown/stale decisions, new non-UI intents, negation-sensitive
examples supplied as AI fixtures, variant constraints, dependencies, state
preservation, missing tools, hook metadata and delivery declarations (a release
registers exactly what `delivery.json` declares, and nothing without it). A fixture does not prove
AI reasoning quality. Report real and simulated integrations separately.

Owner rule of 2026-11-17 ("le suite falle sempre in remoto in github actions"):
the suite runs in GitHub Actions, not on the developer machine, where it took about an
hour against about two minutes on a runner. Locally run only the targeted tests
of what changed, then push the branch and read the run.

Owner rule of 2026-11-22 ("Muro non deve avere test su Marionette"): Muro's own CI and
release never run Marionette checks, so a problem of the package (a source that moved)
cannot block them. The `Tests` workflow, which is Muro's Verify run (`.github/workflows/tests.yml`: every push to
and pull request to `develop`, or `gh workflow run tests.yml --ref <branch>`; never the
`develop` -> `main` pull request or `main`, whose commit the push to `develop` already
verified) runs the Python tests that do not name Marionette (`-m "not marionette"`:
`tests/conftest.py` marks every test module that names it) and the desktop job. The
tests that name it (`-m marionette`), the manifest validation, the source check, the
package build and the default-project pack run in `.github/workflows/marionette.yml`
(when Marionette's paths change, or `gh workflow run marionette.yml --ref <branch>`);
the gate of its own release stays in `release-marionette.yml`. The release of Muro
(`release.yml`) runs no Marionette test or check and builds nothing of it (owner decision
of 2026-11-22: "Muro prende dalla repository, punto. È Marionette a essere costruita con
Muro"): `build-release.bat` runs `scripts/desktop_resources.py`, which takes the latest
published release of `acaprino/marionette` (built with Muro by `release-marionette.yml`),
checks its `.sha256` and places the zip, unchanged, under `projects/` in the bundle. The
runtime only installs `projects/marionette.mp`, which nothing makes any more, so the zip
is carried and not read: a new Muro has no default project until the runtime reads the
release (`docs/desktop-cli.md`).

Run `python -m pytest -q` and `python muro_build.py --manifest
examples/marionette/sources.json --validate`. For source/build changes also run
the same command with `--check-sources` and verify a fresh staged
release. Source checks contact pinned Git remotes. Run targeted tests first for
new behavior and preserve failure/success evidence in docs/verification/.

The flag interface and the subcommand CLI (`muro <command>`, `python -m muro`;
ADR-0021) run the same command functions in `muro/cli.py`: a new operation is a
subcommand, and the legacy flags are frozen as they are. `muro review` prepares
the decisions re-examination (prompts/review.md; it rewrites nothing itself)
and `muro baseline` (`muro/baseline.py`) reports pins against upstreams
read-only, by mechanical version order; re-pinning stays the procedure below.

ADR-0022 adds the agentic surfaces: `muro mcp` (`muro/mcp.py`) serves the
operations to an MCP host, which does the judgment and writes artifacts with
its own file tools; `muro agent` (`muro/agent.py`) relays a prepared step to an
OpenAI-compatible endpoint under a strict output contract (allowlisted paths,
env-only key, https off localhost refused) and the same validation; `muro init`
(`muro/scaffold.py`) scaffolds a pinned, gated single-source package; `muro
install` (`muro/installer.py`) executes a built adapter's own INSTALL.md
against a caller-named harness home; `muro absorb` chains them. The
AI-ownership rules above apply unchanged in every mode: Python validates, it
never classifies, merges or reviews. The command reference with parameters,
exit codes and examples is docs/cli.md; keep it current when a command changes.

## Principles from the first real use (ADR-0015)

- Design for the second time: specify and test every flow on its second pass
  (second turn, task, run, version, package). Preparation commands are
  rerunnable; a refined request uses `plan --amend`, never a silent restart.
- Declare, do not infer: what the runtime needs to know about meaning is
  AI-authored data (`resumable`, `needs`, `entries.json`, `plugin.replaces`) or
  an AI judgment. No Python proxy such as step count or string equality.
- Verify from outside: fixtures prove mechanics only. Test package behaviour
  with a slug other than `muro`. Run the routing eval after catalog or prompt
  changes. A change to the host protocol is run once in a real host first.
- Fit the host: one-line calls, JSON written with the host's file tool, output
  small enough to stay inline, pre-approval through the host's own field.
- State the per-task cost (calls, tokens, denials) of every safeguard you add.
- Evidence describes the step it is bound to (ADR-0018): never ask a step for a
  check written for another intent or step, and give a check that may not apply
  a declared condition and an honest `not-applicable`, or the runtime manufactures
  a `pass` that proves nothing and then certifies it.
- A rule names what it refers to (ADR-0019): an instruction the host cannot apply
  without knowledge it lacks is no rule. Put the names where the host decides
  (skill descriptions it reads before invoking), not in `INSTALL.md` or a body.

Live host recipe (Claude Code, leaves the owner's configuration untouched):
stage a release with `--build --out <scratch>`, then in an empty test project run
`claude -p "<request>" --plugin-dir <scratch>/<slug>/adapters/claude-code
--permission-mode dontAsk --allowedTools "Skill" --output-format stream-json
--verbose --max-budget-usd 2 --no-session-persistence`. Read the transcript for
skills invoked, runtime calls, permission denials and cost; record them, with the
sample size, in `docs/verification/`. First confirm the host loaded what you
built: hidden entries are absent from the init event, so ask one session to list
the package's skills and compare with `entries.json`; a skill with invalid
frontmatter is dropped silently. Start sessions one at a time: sessions started
in parallel loaded no marketplace plugins. Delete the session folders the run leaves
under `~/.claude/projects/`. With the owner's own plugins and MCP servers loaded
every turn carried about 114,000 tokens and cost about 2 dollars on the default
model (2026-11-14), and `--max-budget-usd` is checked between turns. To test the
package alone add `--setting-sources project,local --strict-mcp-config`, name the
model with `--model`, and record both in the result. `--strict-mcp-config` also
drops the MCP servers a plugin registers: leave it out for a package that
declares `mcp_servers` (run of 2026-11-21).

## Adding or re-pinning a source

Look for published releases first. Pin the newest non-draft, non-prerelease tag
with `pin: release`; only an upstream with no release or tag gets `pin: head`.
Before moving a pin, diff the selected paths, `LICENSE` and `NOTICE` between the
old and new commit and check that no capability relies on what changed or
disappeared. Prepare the intake and read its `coverage.json`: select every file
the method uses at run time, declare binary media in `media_paths` with its
credit files in `notice_paths`, and explain in `omissions` each named file that
stays out; `check-sources` and `build` refuse the source otherwise (ADR-0026,
ADR-0027). Write the pin and its release into each capability's `## Sources`
line and into `tests/test_<source>_intake.py`. Record in `delivery.json` what
each part of the source became and why, and review the earlier decisions. Record the release, the diff
summary, the commands and their results in `docs/verification/`. A release
proves packaging; say what was not executed.

## Releasing

Two products are released, each with its own tag: Muro from this repository, a package from its own public
repository (Marionette from `acaprino/marionette`; owner request of 2026-11-19, ADR-0011 amendment).

- The factory and its desktop app, `muro-v<version>` (version in `muro/__init__.py`, `__version__`): released
  at every merge of `develop` into `main` by `.github/workflows/release.yml` (see "Git"). The GitHub Release
  carries `Muro-<version>-windows-x64.zip`, the portable folder `build-release.bat` makes. Do not bump
  `__version__` or create `muro-v*` tags by hand.
- A package, `<slug>-v<version>` (version in its `sources.json`, `plugin.version`; Marionette is
  `marionette-v<version>`). Merging a package version change into Muro's `main` requests its release.
  1. Bump the package version on `develop`. A package changes version whenever its catalog, policy or
     packaged files changed: hosts cache an installed plugin by version.
  2. Write `docs/releases/<tag>.md`: what changed for a user, the verification results, and what was not
     executed. Without that file the notes carry only the version and the Muro commit it was built from.
  3. On the commit to release run `python -m pytest -q`, `--validate` and `--check-sources`, and stage a
     fresh build with `--build --out <scratch>`.
  4. Merge the `plugin.version` change into Muro's `main`. `Release Marionette` starts automatically,
     runs the tests, validates the manifest and its sources, and builds the package. It pushes `marionette/`
     and `releases/<tag>.md` to `release/<tag>` in `acaprino/marionette`, where a workflow opens the PR.
     The existing `workflow_dispatch` remains available for recovery from Actions on `main`. A published tag is preserved. The push uses `MARIONETTE_DEPLOY_KEY`.
  5. The owner merges the pull request: `acaprino/marionette` then publishes the tag and the GitHub release
     with `<slug>-<version>.zip` and its SHA-256. `marionette-v0.2.0` to `marionette-v0.4.0` stay among this
     repository's releases.
  6. Do not commit `dist/`, and do not push tags by hand: the workflows are the way.

The README header shows `docs/assets/branding/muro-logo.png`. Keep that
line and that file when rewriting the README.

## Documentation

Update README.md, ROUTER.md, affected prompts/capabilities and an ADR when the
contract changes. Preserve historical decision/evidence records; distinguish
owner requirements, implementation choices and separately approved text. Do not
rewrite generated ADR/FRD index blocks by hand. If their generators are unavailable,
add a clearly labeled note outside those blocks. Keep plans outside the repository;
verification records belong in docs/verification/. Never write new docs/superpowers/.

## Git

- Two branches, and only two: `main` (what is released) and `develop` (where work is integrated).
- Work always on `develop`, or on a short branch from `develop` that is merged back into `develop` and then
  deleted. Never merge or push into `main`, and leave no other branch, locally or on GitHub.
- A release is the pull request `develop` → `main`, opened and merged by the owner: every merge into `main`
  is a release (`.github/workflows/release.yml`, the same in Shinatama, Mukade, Xiox, Muro, Ethel and
  artcraft-web).
  The version goes up by a patch, or by a minor or major step when the pull request has the label
  `release:minor` or `release:major`; `build-release.bat` builds on Windows; the tag `muro-v<version>` and the GitHub
  Release (the installer of `release\installer\` and one portable zip with all of `release\` in a folder; no loose
  program) are published, and `main` is merged back into
  `develop`. Nothing is published when the build fails.
- A release is the pull request develop → main, merged only when the Verify run on develop's tip is green: the release workflow builds and publishes, it does not run the tests again.
- Never change the version or create release tags by hand: the workflow does it (`.github/release.json` lists
  the version files, `.github/scripts/release.mjs` writes them).

## Rust is built and tested on GitHub only (the owner's absolute rule)

- Never run `cargo` on this machine: no `cargo build`, `cargo test`, `cargo clippy`, `cargo check`, `cargo run`,
  `cargo doc`, no `tauri dev`, no `tauri build`, and no npm or batch script that calls them. `cargo fmt` is the
  only exception.
- Rust is compiled, linted and tested only by GitHub Actions. To know whether Rust code is right, push to
  `develop` and read the run (`gh run watch`, `gh run view --log-failed`).
- A program needed on this machine is taken from a release or a workflow artifact (`gh run download`), never
  built here.
- This holds for every agent and every subagent. A plan, a skill or a brief that says to run cargo locally is
  wrong on that point: write the code and the tests, do not run them, and say they wait for CI.


## Nothing is compiled on this machine (the owner's absolute rule)

- Never compile, build, lint or run a test that needs a build on this machine: no `cargo`, `tauri`, `tsc`, `vite build`,
  bundler or compiler; no npm, batch or shell script that calls them (`npm run build`, `npm test` when it builds first,
  `npm run verify`); and no `npm install` or `npm ci` that runs a dependency's `prepare` script (a dependency taken from
  git compiles itself). `cargo fmt` stays allowed where a project already allows it.
- Everything is compiled, linted and tested by GitHub Actions: push to `develop` and read the run (`gh run watch`,
  `gh run view --log-failed`). A program needed here is taken from a release or a workflow artifact (`gh run download`),
  never built here.
- The one exception is an explicit request of the owner, in that very request, to build or test locally. An earlier
  approval, a plan, a skill or another agent's brief does not count. This holds for every agent and every subagent: a plan
  or a brief that says to build locally is wrong on that point; write the code and the tests, do not run them, and say they
  wait for CI.
