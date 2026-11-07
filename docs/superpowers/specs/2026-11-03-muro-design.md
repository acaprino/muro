# Muro: design

Date: 2026-11-03. Status: draft for approval. Decision record: ADR-0001
(`docs/adr/ADR-0001-factory-and-coordinator.md`).

## 1. Intent and why

The user has hundreds of plugins, skills and agents installed across five agent
hosts (Claude Code, Codex, Pi, OpenCode, Hermes). Today the cognitive load is
theirs: knowing which skill exists, what it is called, which pairs with which,
whether it is installed, and when to invoke it. The model, on its side, is
handed a list of hundreds of names and chooses poorly among them, or several
skills fire together and contradict each other, or the right one never fires.

Muro inverts the load. The user speaks in natural language. One intelligence
knows every absorbed capability, infers what the task needs, proposes a path,
confirms briefly, and works the path step by step in a feedback loop with the
user, switching on only the knowledge each step needs.

Priority, stated by the user: *the user never has to remember anything*. A
clean model context is a means to that, not the goal. The failure that counts
most, also stated by the user: a flow that runs but whose result nobody
evaluates. Evaluation is part of the loop, not a tail.

## 2. Goals, non-goals, anti-goals

Goals:

- Zero names to remember: at most one universal command, optional where the
  host activates skills from descriptions (Claude Code).
- One coherent plugin: one vocabulary, no duplicated rules, every component
  declares when it activates, how, and what it hands to the next.
- Task-shaped work maps: the path is built from the task, in local markdown,
  and degenerates to one step for small tasks without ceremony.
- Feedback loop through the whole cycle (brief, decide, prototype, build,
  evaluate), not only through planning.
- Multi-host from the first release: Claude Code, Codex, Pi, OpenCode, Hermes.
- The plugin grows and stays coherent automatically: every add, update or
  removal of a source regenerates harmonization, documentation, adapters and a
  release.

Non-goals (for the first release):

- Deciding now what the full source list contains beyond the first four
  sources (section 6). The relationship with the user's existing `daodan`
  marketplace is explicitly deferred by the user.
- Absorbing everything installed. The list is curated; intake is per source.
- A remote issue tracker for maps.

Anti-goals (a release is a failure if):

- The user must type or remember a skill name to get a capability.
- Two absorbed sources give conflicting advice in the same step.
- A long autonomous run ends without the user having seen and judged results.
- A component exists in the product that no registered intake produced.

## 3. Shape: two layers, factory first

### 3.1 The factory

Built first. It is the set of agents and scripts that produce the product from
a curated source list. Parts:

1. **Agent designer.** Given a need ("an intake for GSAP ScrollTrigger"),
   writes the agent definition and its scripts in Muro's component format.
   Used to create the factory's own agents and the product's agents. The user
   never writes prompts.
2. **Per-source intake.** One registered intake per source: an *analysis
   script* (what the source contains, which kind it is, what it duplicates
   against existing components) plus an *intake agent* that decomposes it into
   Muro components. Intakes are custom per source because sources differ in
   nature: art-direction rulebooks (tasteskill), principle libraries
   (motion-design), technical knowledge (GSAP), work protocols (wayfinder).
3. **Harmonizer.** Agents plus scripts that, after every intake: deduplicate
   rules, align vocabulary (one palette concept, one easing concept), and
   write for each component its activation contract: *when* (intent signals,
   project context, map phase), *how* (autonomous, after a short confirmation,
   inside a workflow step) and *what it hands on* (named outputs the next
   component consumes). Conflicts the harmonizer cannot settle are raised to
   the user; nothing else is.
4. **Source watch.** The factory checks upstream sources itself (pinned
   revision per source). When one changes it re-runs that source's intake
   only, re-harmonizes, regenerates documentation and release, and reports
   what changed.
5. **Release.** Regenerates documentation, the five host adapters and a new
   plugin version. Never done by hand.

### 3.2 The product: the coordinator

One plugin, one entry. Behavior on a request:

1. **Understand.** Infer intent from the user's words, the open project, and
   the current map phase if a map exists.
2. **Confirm briefly.** One line: "I read this as X, I would go this way."
   The user confirms or corrects. No questionnaire.
3. **Brief when needed.** A short interview when the task has real unknowns
   (product, audience, tone, stack). Skipped when the request already answers
   them.
4. **Build the map.** A task-specific work map in local markdown: the
   decisions to take, prototypes to choose from, research to do, build steps,
   evaluation steps. Each step names the components it switches on. Small
   tasks produce a one-step map and no ceremony.
5. **Work the map.** One step at a time. Each step reports: what was done, what
   is proposed, what is asked of the user. Human steps (choosing a mockup,
   judging a page) wait for the user; agent steps run alone. Evaluation steps
   are first-class: code and tests are judged by the product's own reviewers,
   visible things by the user.
6. **Loop.** The user's judgment decides: advance, redo, or change route.

Universal command: one, always the same name on every host. On Claude Code the
coordinator also activates from its description, so the command is optional
there; on hosts without description-based activation the user types it.

### 3.3 The work map

Local markdown in a dedicated, ignorable folder inside the project. Adapted
from wayfinder (decision tickets, frontier, fog of war, ticket types) and
extended: tickets exist for build and evaluation steps too, not only for
decisions. Recorded decisions in the map that are architectural become
Proposed decision records in `docs/adr/` when the project keeps them.

## 4. Constraints

- Host-neutral core: markdown, scripts, files. Nothing in components, maps or
  protocols depends on one host's hooks or mechanisms. Host specifics live only
  in adapters.
- Curated source list, grown one source at a time. Each source enters through
  its own registered intake. Upstream revision pinned per source.
- **License gate.** Every source must be open source under a permissive
  license (MIT, Apache-2.0, BSD or equivalent). The intake records the
  license and copyright holder; the release carries the attributions.
  A source that fails the gate is refused at intake. Craftwork was removed
  from the first list for this reason (commercial, login-gated).
- Local markdown maps, never a remote tracker.
- The project keeps decision records (`docs/adr/`) and functional
  requirements (`docs/frd/`). The first FRD is extracted from this document.
- Science Mode is on for this project. Evidence that could change the
  coordinator's routing design (how many candidate components a model should
  choose among, progressive disclosure of tools) is relevant and is deferred
  to a research step in the plan; no research was published during this
  brainstorm.

## 5. Decisions already taken (as the user took them)

- Universal orchestrator, not a design-domain plugin.
- Factory before product.
- Intake custom per source, not a generic compiler.
- Maps in local markdown.
- Multi-host from day one, five hosts.
- One universal command as the safety net.
- Factory watches upstream sources itself.
- Evaluation is part of the loop; the user judges visible results, the
  product's reviewers judge code and tests.

## 6. First source list

In the order given by the user, licenses checked on 2026-11-03:

1. tasteskill v2 (anti-slop art direction; installed as
   `design-taste-frontend` / `taste-skill`), MIT, (c) 2026 Leonxlnx
2. motion-design (LottieFiles): https://github.com/lottiefiles/motion-design-skill,
   MIT
3. GSAP ScrollTrigger: the `gsap-scrolltrigger` skill from
   https://github.com/greensock/gsap-skills, MIT (the repo holds seven
   sibling GSAP skills; only ScrollTrigger is in the first list)
4. wayfinder (Matt Pocock; installed under `mattpocock-skills`), MIT,
   (c) 2026 Matt Pocock; absorbed as the work-map protocol, not as a
   planning-only tool

Removed: Craftwork design skill (commercial, login-gated; fails the license
gate).

## 7. Left to the builder

- Component format (file layout, front matter, activation-contract schema).
- Map file format beyond the sections named in 3.3.
- Scripting language for factory scripts and the adapter compiler. The user's
  existing `daodan` kernel compiler is prior art worth reading; reusing it is
  not decided.
- How the source watch runs (scheduled, on demand, on session start) as long
  as it is the factory, not the user, that notices.
- Test strategy for the factory (section "Confirmation" of ADR-0001 names the
  minimum).
- Order of intakes among the five sources.

## 8. Calls made by the author of this document

- The decision records and FRD live in the Muro repository, not in each target
  project. Target projects hold only their own maps.
- The universal command name is not chosen here; the builder proposes one.
- The project is not yet a git repository. Initializing one is the first step
  of the plan, so that records and releases have revisions to pin.
- **Core versus components.** The coordinator logic, the map protocol and the
  agents the agent designer writes are *core*, built by the factory itself.
  "Every component comes from a registered intake" (ADR-0001 INV-002) applies
  to *knowledge components*: rules, resources, protocols absorbed from a
  source. Wayfinder's intake informs the map protocol; it is not a prerequisite
  for building it. The release gate carries an explicit list of core paths.
- **Host capability floor.** The core assumes only: markdown files, script
  execution, and the ability to end a turn with a question to the user. Loading
  a component mid-run, spawning a subagent and blocking prompts are adapter
  capabilities; where a host lacks one the adapter falls back (inline loading,
  sequential execution, end-of-turn question). "Structural validation" means
  the host's own validator where one exists and a schema check of the adapter
  output otherwise.
- **Runtime requirements.** A component may declare what it needs at runtime
  (an MCP server and account, a library in the target project). A host or
  project that cannot satisfy it gets the component's rules without its
  resources, with a one-line notice. GSAP (library in the target project) is
  the first case.
- **Precedence.** The source list order is the precedence order: when two
  sources' rules conflict and the harmonizer cannot reconcile them, the earlier
  source wins and the yield is logged. Only conflicts that touch the user's
  stated priorities or lose a capability are raised to the user.
- **Pinned revision.** A git source pins a commit; a web page or an installed
  copy pins a content hash of the fetched or installed text. Each intake
  manifest names its upstream and how it is fetched.
- **Stable regeneration.** Components have stable identifiers; harmonization is
  incremental; components untouched by a change stay byte-identical, and the
  release gate diffs against the previous release. A release is produced and
  reported; installing it into the user's local hosts is part of the release
  step, since manual installation is the thing the user wants gone.
