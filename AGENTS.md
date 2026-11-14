# Working on Muro

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
  with form `capability`, `always-on`, `hook` or `dropped`, the `always_on`
  session text (the contributing sources' own words plus marked coexistence
  lines; at most 6000 characters for each source with an `always-on` decision,
  owner rule of 2026-11-12: the limit is proportional to the intakes that go
  into it) and `hooks`
  wirings `{host, capability, event, matcher, run}`. Both preparations append the
  prompt. `muro/delivery.py` checks shape, references, a decision for every
  source and that each form has something behind it, then emits only what the
  document declares; it never chooses a form (ADR-0016). A validated always-on
  package can have no capabilities: header-only router, authored no_match guide
  examples, no entries and no discoverable SKILL.md. The policy and delivery
  declarations participate in catalog_digest and are supplied to routing evals.
- `eval-cases.json` (optional): AI-authored requests with expected status and
  ordered capabilities. `--prepare-eval` gives the host AI rules, catalog and
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
itself what its package declares in `delivery.json`: text for every session and
hooks with policy `active`. May is not should. Same day, on a design system
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
decision, not yet run live.

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

For routing changes, cover the full chain: source prompt → capability schema →
router/catalog → AI-response boundary → plan/state → portable host adapters.
Test malformed/unknown/stale decisions, new non-UI intents, negation-sensitive
examples supplied as AI fixtures, variant constraints, dependencies, state
preservation, missing tools, hook metadata and delivery declarations (a release
registers exactly what `delivery.json` declares, and nothing without it). A fixture does not prove
AI reasoning quality. Report real and simulated integrations separately.

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
never classifies, merges or reviews.

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
model with `--model`, and record both in the result.

## Adding or re-pinning a source

Look for published releases first. Pin the newest non-draft, non-prerelease tag
with `pin: release`; only an upstream with no release or tag gets `pin: head`.
Before moving a pin, diff the selected paths, `LICENSE` and `NOTICE` between the
old and new commit and check that no capability relies on what changed or
disappeared. Write the pin and its release into each capability's `## Sources`
line and into `tests/test_<source>_intake.py`. Record in `delivery.json` what
each part of the source became and why, and review the earlier decisions. Record the release, the diff
summary, the commands and their results in `docs/verification/`. A release
proves packaging; say what was not executed.

## Releasing

Two products are released from this repository, each with its own tag: the
factory as `muro-v<version>` (version in `muro/__init__.py`, `__version__`) and
a package as `<slug>-v<version>` (version in its `sources.json`,
`plugin.version`; Marionette is `marionette-v<version>`). No release, tag or
version bump without the owner's request.

1. Bump the version of what is being released, in a pull request to `main`. A
   package changes version whenever its catalog, policy or packaged files
   changed: hosts cache an installed plugin by version.
2. Write `docs/releases/<tag>.md`: what changed for a user, the verification
   results, and what was not executed. Without that file GitHub generates the
   notes from the merged pull requests.
3. On the merged commit run `python -m pytest -q`, `--validate` and
   `--check-sources`, and stage a fresh build with `--build --out <scratch>`.
4. Run the `Release` workflow (GitHub, Actions, "Run workflow" on `main`, or
   `gh workflow run release.yml -f target=<muro|marionette|both>`). It repeats
   validation, source checks and the build, creates the tags on that commit and
   publishes the GitHub releases; the package release carries
   `<slug>-<version>.zip` with its SHA-256. It refuses a tag that already
   exists: a published release is never replaced, bump the version instead.
5. Do not commit `dist/`, and do not push tags by hand from a session whose
   access is limited to its own branch: the workflow is the way.

The README header shows `docs/assets/branding/muro-logo.png`. Keep that
line and that file when rewriting the README.

## Documentation

Update README.md, ROUTER.md, affected prompts/capabilities and an ADR when the
contract changes. Preserve historical decision/evidence records; distinguish
owner requirements, implementation choices and separately approved text. Do not
rewrite generated ADR/FRD index blocks by hand. If their generators are unavailable,
add a clearly labeled note outside those blocks. Keep plans outside the repository;
verification records belong in docs/verification/. Never write new docs/superpowers/.
