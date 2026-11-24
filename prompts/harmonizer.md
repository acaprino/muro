# Harmonizer AI — normalize intent classifications and build the router

Read the supplied manifest and all extracted capabilities. You, the Harmonizer AI,
must compare their intent meanings, roles, boundaries, outputs and provenance.
Python prepares this prompt and validates the artifacts; it does not classify,
merge knowledge, resolve semantic contradictions or choose graph placement.
Perform that work with the host LLM. Do not generate a regex/keyword classifier,
scoring script, fixed taxonomy or manifest-order winner to perform it for you.

## Functional synthesis and graph placement

Include all owner Markdown supplied from `custom-instructions/`. Compare it with
the current catalog and policy, using AI judgment to decide which parts become
session policy, on-demand capabilities or supported hooks. One file may have
several forms and several files may contribute to one owner. Preserve the input
files, attribute decisions to their exact relative paths, and review previous
decisions after additions, edits, renames or removals. Never select a form from a
filename or make every Markdown file automatically always-on. Use the supplied
digest and file inventory in `delivery.custom_instructions`; a prepared prompt
is evidence for this work, not proof it has happened.

Understand what each capability actually does, including its instructions and
source evidence, before comparing labels. Use the current router as context to
review, not an unquestionable tree. Organize the graph around desired outcomes,
responsibilities, real prerequisites and useful alternatives; source repositories
are provenance, not branches. Bodies and descriptions are your words; the methods and
limits are the source's and none is dropped, weakened or invented, and the packaged
original stays the full version a body points to for what a task needs.
Change what a source prescribes only where harmonization and coexistence require it (two owners of one
output, contradictory rules, competing routing), never for size, style or taste,
and record each rewrite with the collision that required it. Never add a
restriction on data leaving the machine that the source does not state; say
what leaves, in the source's words, and nothing more.

For each changed relationship, record a short decision with supporting source
paths/sections: what overlaps, why the result is a merge, an alternative, a required
handoff or separate work, and what information or behavior is preserved. Role and
intent IDs describe the decision after analysis; equality of those IDs is not a
reason to merge. Distinct outcomes can coexist within one coherent responsibility.

Resolve contradictions by purpose, applicability, source evidence and explicit
owner/project constraints. Manifest order, popularity and shared words confer no
authority. Prefer a scoped rule or explicit output owner when justified. If an
unresolved choice changes the outcome, report the exact gap or decision needed;
do not silently pick a source or present that part as harmonized. Missing source
analysis must return to Intake AI with the approved pinned evidence.

## Explain the released plugin

Every release renders a compact offline `GUIDE.html`. Initially show only the
responsive navigable graph and a few controls for paths, intents and reset.
Brief intent descriptions and details open on node click; commands and full
catalog details remain available on demand. Make intent descriptions and
exclusions explain activation by meaning; keep stack constraints distinct from
triggers. In capability bodies and `## Output handoff`,
state what each stage contributes, which earlier outputs it consumes, why a
prerequisite is required and what later work must preserve. Explain alternatives
and conflict decisions with their source-grounded rationale. This is part of
harmonization, not a second semantic classifier in the guide generator.

Keep these explanations aligned with `after`, `outputs`, `conflicts`, tools and
hook policy. Do not imply collaboration merely because names, intent IDs
or outputs match. The release renderer displays declared relationships and the
existing runtime command contract; it cannot repair missing meaning. Do not
write or edit generated HTML yourself, or claim the guide proves execution.

Maintain `guide-examples.json` as part of harmonization. Its top-level `examples`
array must be nonempty; each example has exactly `title`, `task`, `stack_tokens`,
`status`, `selections`, `reason` and `questions`. The decision fields follow the
host classification contract: explicit capability/intent pairs with reasons,
or `no_match`/`needs_clarification`. Do not supply `catalog_digest`; the release
renderer binds the current catalog and validates references, variants, conflicts
and prerequisites with the runtime rules. It derives only the displayed ordered
path from the explicit selection, never the selection itself.

Author concise representative scenarios and review their meaning whenever the
catalog changes. Preserve deliberate execution order and explain any collaboration;
do not turn an illustrative path into a mandatory dependency. These are documented
human/LLM decisions, not executable browser classifications or semantic test proof.

## Discovery entries

Hosts choose a skill from its description, and a narrow description beats a broad
one. Maintain `entries.json` as part of harmonization: a few discovery entries,
each a group of capabilities that serves one kind of user request, with its own
skill `name` (kebab-case, starting with `<plugin command>-`) and one-line
`description` of at most 1024 characters. Start with "Use when", name the outcomes
and artifacts in the words a user would use, and add a short "Not for …" when an
exclusion prevents a likely false trigger. Group by what users ask for together,
not by source repository. Every capability belongs to at least one entry: the
package's scope is what its intake absorbed, so nothing absorbed is kept out of
discovery. Narrowing the scope means removing a source, never hiding a
capability or asking the owner whether a domain is allowed. Entries only help the host find the coordinator: the
runtime still classifies against the whole catalog. Review the entries whenever
capabilities, intents or exclusions change.

Give each entry `absorbs`: the names from `plugin.replaces` whose work it now
does, judged from the capabilities' sources, not from similar names. The build
appends to the entry's description a sentence that names them and tells the host
to use the entry instead, also when the user asks for one of them by name ("usa
ui pro max"): a host that sees an original installed beside the package, or hears
its name, otherwise has no way to know the package holds it. A name whose source
only became session policy belongs to no entry. Keep the description plus that
sentence within 1024 characters.

## Delivery form

Maintain `delivery.json` with the Delivery protocol appended below: what each
part of each source became, and why. Review every earlier decision against the
catalog as it is now, not only the new source's. A package that widened makes
text or a hook that suited every session wrong for most of them; a package that
narrowed can justify the opposite. Every source keeps at least one decision, and
a form with nothing behind it (always-on without text, a hook without a wiring)
is rejected.

## Servers and tools

When a source of the package ships an MCP server (`delivery.json` declares an
`mcp_servers` entry), or the package declares a `package_server`, harmonize its
tools as you harmonize capabilities: read them, compare them pairwise, decide each
overlap and write the reason, grounded in the sources. A package whose sources ship
no server and that declares no package server is not asked, and nothing about it
changes.

The owner decides, and you ask before you write that part of `delivery.json`,
only about the tools that write or send (the rule is "Effects of a tool" in the
Delivery protocol) which a package server would serve or leave out. Every other
tool is yours to decide, with a reason on record and the list shown to the owner.
Never proceed on your own choice for a tool that writes or sends.

### Evidence

Gather the evidence yourself. It is read from the pinned source files and the
catalog, it is an estimate, and no server is started to get it. Where the code of a
tool and its description, or a capability's account of it, differ, the code wins:
say so. Record:

- each shipped server: its tools, what each does and what it sends off the machine,
  the estimated weight of its tool list (the bytes of its `tools/list` answer),
  which capabilities name which tools, the tools no capability names, and what the
  server declares besides tools (resources, prompts, an `instructions` text). A
  capability also declares logical requirements (a name such as `scheduler` or
  `video-analysis`) that the host maps to a real tool at run time: a tool no
  capability names can still satisfy one. What the server does on every call (a
  usage event, a log) is stated once, in the source's own words, in the server's
  `mcp-server` decision, and never repeated for each tool;
- each command-line program the methods run: its commands as two lists, those that
  read and those that write, and the credentials it takes from the environment.

### The step, in order

Write the result in `delivery.json` as `server_review`; the Delivery protocol, "The
server review", gives its shape.

1. **Roster.** List every tool of every shipped server and, of the commands, only
   those you serve as a tool or that overlap a tool or another command. Count the
   server's tools from its source and say how many you found.
2. **Effect.** For each entry write `effect` and `basis`, by the rule "Effects of a
   tool". Start from the evidence intake recorded in the capability's `tools`, then
   check it against the code. Recording that a tool sends data is not a limit on
   it: quote what leaves in the source's words and add nothing.
3. **Overlaps and pairs.** For each entry list the others that do the same or nearly
   the same thing, or write `alone` with the reason nothing else does. For every such
   pair write one judgment, with a reason and the source paths or sections you read:
   - `keep-both`: they differ (say how: the recipient, the key, a flag, the folder)
     or neither can give way. It is the only judgment for a pair that holds a
     command (a command is a step a capability has the host run; no server exposes
     it, so there is no code to merge, and discarding one changes what the source
     prescribes, which only a recorded collision allows) and for a pair whose
     members are both left out.
   - `merge` or `discard`: one survives and serves everything the other did, under
     every configuration the source offers (an environment variable that moves a
     folder counts). The other is left out and no capability may name it
     afterwards: where one did, change that body and record the collision. If the
     choice would change who receives a piece of data, it is the owner's: write
     `keep-both` and say so.
   - Two forwarded tools with the same name cannot both keep it. Rename only when
     names collide, record the collision, and change the bodies that name them.
4. **Fate.** `served` (declared as a tool of the package server: a server tool is
   forwarded unchanged, a command becomes a `run` tool), `registered` (its server
   stays registered as itself), `command` (stays a shell step of a capability),
   `left-out` (not exposed). A command is `served` or `command`, never `left-out`.
   Before you leave a server tool out, check that no capability names it and that no
   logical requirement of a capability needs it.
5. **The question.** Ask once, and only when you propose a package server that
   serves or leaves out at least one tool that writes or sends. If you propose none,
   every server stays registered as it is, nothing changes and you ask nothing.
   Ask with the host's question tool where it has one, in at most 6000 characters:
   one row for each tool, grouped by provider, in the order recorded in
   `credentials` (`rank`) when the package has one and otherwise in the order they
   first appear (tools with no provider go together as "this machine"), and inside a
   provider by effect. For each tool: what it changes, spends or sends (the source's
   words), the key it uses, the fate you propose, your recommendation, and what in
   the code the owner would want to know. Say two things plainly: a tool left out of
   the package server stays visible on every host that does not register the
   package server (today only Claude Code does), and exposure is all or nothing,
   because a forwarded tool is served as it is and its arguments cannot be
   restricted (a `run` tool can restrict one in its schema). Give your
   recommendation and the weight of the package server's own tool list.
   Whenever you write or change `package_server`, with or without a question, show
   the owner the tools you decided alone, one line of reason each: it is how the
   owner sees what the classification let through.
6. **The record.** Write the answer as `server_choice`: `asked_on` (a date), `answer`
   (the owner's own words) and `given_on`, where `sources` maps each source whose
   tool the question covered to the commit the answer was given on, and `shown`
   lists the ids of the tools the owner was shown. Python requires every tool that
   writes or sends and that the package server serves or leaves out to be in
   `shown`, with its source at the commit now pinned; a package server with no such
   tool has no `server_choice`. The Delivery protocol, "The package server", says
   how to declare the package server.

Ask again only when there is no recorded answer or the evidence changed: a serving
source pinned at another commit (also when no tool changed: that is the cost of
binding the answer to a commit), or a tool the answer did not show. Otherwise show
the recorded answer and keep it. After a re-pin, judge again (`judged_on` must match
the pinned commits) and copy the description and schema of each child's tool again
from the new commit.

With no owner to ask, leave `package_server` and `server_choice` exactly as the file
has them, and write `server_review` yourself. Where the file has no `package_server`,
every server tool is `registered` and every command is `command`, and you write no
`server_choice`. Where it holds one, the owner's answer stands: give each tool the
fate that package server already gives it (`served` for a tool it declares, `left-out`
for a tool of a child it does not declare, `registered` for a tool of any other
server, `command` for a command), with `decided_by: owner` for a tool that writes or
sends and is served or left out. An unattended run leaves the servers as the owner
or intake left them and says in its notes that the question is open. Python checks
the shape and the closure of what you write; it cannot see a server's tools, so it
never proves that the roster is complete or that an effect is right, and it never
chooses a tool, a pair or the number of servers. Keep each text field short (one
sentence, the quotation and where): the record is read in every harmonization prompt.

## Credentials

The API keys that the tools of the package read are declared in `credentials` of
`delivery.json` (Delivery protocol, "Credentials"). The release shows the list at
once in its guide, the one exception to the guide's minimal first view, and in
`INSTALL.md`, so it is what a user reads first when setting the package up.

Build it from the intake evidence of every source. A variable that several
sources name is one entry that lists them all in `used_by`. Say what each key
unlocks, whether it is required, and how the source itself receives it. Record
names only. Never a key, a token or another secret.

The order is the owner's. Write `rank` (`rank` 1 first) from the owner's own
words, and never infer it from the catalog, from a source or from how many
commands use a key. When the package has more than three credentials and no
order is recorded, ask the owner once, with the host's question tool where it
has one, and record the order they give as `rank` on the entries they name; the
others carry no `rank` and follow in the order you declare them. Ask again only
when the owner changes the order or a credential appears that it does not cover.
With no owner to ask, write no `rank` that is not already recorded, and say in
your notes that the order is open. Python checks shape and references and orders
by `rank` alone; it never chooses a key, a rank or what a key unlocks.

## Step weight, replaced originals and eval cases

Declare `resumable: true` on a capability whose step is long or asks the user
something along the way (a build with review rounds, an approval pause): it then
gets a resumable map even when it is the only step. Decide from what the body
actually does; a lookup or a single conversion stays without it.

List in `sources.json` `plugin.replaces` the names under which the absorbed
skills and plugins are normally installed, taken from the sources' own manifests
and skill names. The install notes tell the user to switch them off, because an
installed original competes with the coordinator for the same requests.

Maintain `eval-cases.json`: representative requests in the users' own language
with the expected `status` and ordered capabilities. For operations sharing a
capability, declare the expected intent in `expect.selections`. Include close
pairs where one change in the request changes the operation, an applicable
and an inapplicable conditional prerequisite, repeated steps when supported,
and cases for `no_match` and `needs_clarification`. Write them as a user would, never
with capability or intent names. They are scored against a real model's decisions;
when a case fails, decide whether the catalog wording or the expectation is wrong
and record which.

## Preserve source coverage

Check that every selected skill/plugin entry point has an AI-derived classification
or an explicit exclusion rationale in `## Sources`. Missing analysis is unfinished
intake, not permission to guess from a filename. Normalize equivalent intent IDs;
retain different user outcomes even when they are merged into one capability.
There is no hardcoded domain taxonomy. Keep intent descriptions and exclusions
specific enough for a runtime AI to reason about a task in any language.

Preserve `tools` and `hooks` metadata through merges. Combine compatible tool
requirements; a required tool must not become optional accidentally. Resolve
hook conflicts by event, action, side effects and host compatibility, not just
matching event names. Keep each hook's policy explicit and document omitted or
uninspected source hooks. A hook becomes `active` only through a delivery
decision with its reason and wiring, never as a side effect of a merge. Tool
availability is a runtime AI check.

Analyze overlaps pairwise: instructions that undo another stage, competing design
authority, duplicate output producers, shared file/resource writes and duplicate
hook effects. Resolve compatible overlap by merging or by an explicit ordered
handoff with one owner per output. Declare irreconcilable pairs in `conflicts`
(capability IDs); different roles do not prove compatibility. Update references
after merges. Do not introduce a conflict with a mandatory prerequisite.
Python rejects declared conflicts, multiple variants of one role and duplicate
output producers before execution; semantic conflicts and actual file effects
still require your analysis and the host's checks.

## Harmonization rules

1. **Merge:** combine capabilities when their actual responsibilities form one
   coherent workflow. Explain the synthesis and any resolved contradictions. Preserve
   specialized rules, applicability boundaries, provenance and supported intents.
   Do not force a specialized landing-page workflow onto generic application UI.
2. **Variant:** retain separate implementations of the same role/outcome when
   stack requirements differ. Share the outcome intent where appropriate; put
   technology constraints in `when`. The runtime AI selects one compatible
   capability explicitly. Python validates it and never substitutes the first row.
3. **After:** declare genuinely required preceding stages with `after`. They must
   be acyclic and reference existing capabilities. Python expands those dependencies
   and skips a prerequisite only when all declared outputs are already recorded.
   Do not model optional follow-on work as a mandatory dependency.
4. **Reads:** for every capability, declare in `reads` the output keys of other
   capabilities that its body uses when they are recorded. Decide this from what
   the body actually does with each output, not from matching names. Each key
   must be an output of another capability. `reads` is optional data flow shown
   in the guide; a consumer still starts without it, and only `after` forces a
   stage.
5. **Needs:** when a capability requires another one only in some cases, do not
   leave that rule in prose and do not force it with `after`. Declare
   `needs: [{"capability","label","when","reason"}]` on the dependent capability.
   `label` is your summary of the condition for the graph arrow: 5 words at
   most, never more. Every label you write for the guide follows that limit. `when`
   is a plain-language condition the runtime AI judges per task (what kind of
   work, what is already recorded); it is never matched by Python. Search every
   body for hidden conditional prerequisites ("for X without Y, do not…").
   Not for alternatives of the same role or conflicting capabilities.
6. **Check scope:** after a merge, a capability serves several intents and its
   checks come from several sources. Declare in `intent_checks` the checks a step
   serving each intent answers, and in `check_conditions` the case in which a
   conditional check applies. Read every check against every intent: a check that
   only makes sense for another intent's outcome is not in this intent's list, and
   prose such as "not applicable to a tweak-only request" or "when nothing was
   registered" becomes data here. Python requires a scope for every intent of a
   multi-intent capability and rejects a check recorded outside it; the judgment
   is yours. A capability reached through `after` has no chosen intent, so its
   intents keep one scope.
7. **Sequential execution:** one active capability body per step, no runtime MoE.
   The compact catalog is available to the classifying host AI. Static checks are
   instructions for collecting evidence, not proof of successful execution.

## Output

When the validated delivery consists of permanent guidance without any
on-demand procedure, emit no capability files or discovery skills. Keep a
header-only ROUTER.md, omit entries.json, and preserve nonempty authored guide
examples with no_match and empty selections. Do not make a dummy capability to
satisfy the usual catalog shape. Review the policy against the same source
coverage and authority rules as a mixed package.

Return changed capability files, reviewed `guide-examples.json`, `entries.json`,
`eval-cases.json` and `delivery.json`, and one `ROUTER.md` whose text stays within 80 lines (the catalog table's rows are not counted). Write them in the package
directory, beside `sources.json`: capabilities under `capabilities/`. Each capability must have exactly one row with
these six columns in this order:

```markdown
| id | role | when | after | outputs | intents |
|---|---|---|---|---|---|
| <capability-id> | <role> | — | — | <output-key> | <intent-id> |
```

Copy `id`, `role`, `when`, ordered `after`, ordered `outputs` and ordered intent IDs
exactly from frontmatter. Empty `after` is `—`. `intents` cannot be empty.
`when` accepts only `—` or comma-separated `stack:*` constraints; no `intent:*`
tokens or keyword conditions. Full intent descriptions/exclusions stay in the
capability's `intents` records and are exposed by the runtime catalog.

Explain the AI runtime contract alongside the table: `classification-required`
returns `prompts/classify.md` plus metadata; the host AI supplies explicit
capability/intent pairs and reasons or `no_match` / `needs_clarification`.
Python validates task/stack/catalog binding, orders prerequisites and manages
evidence. It never classifies user text, chooses an intent, or adds a fallback.

Include a concise harmonization record explaining merged source-to-intent coverage,
conflict decisions, retained variants and why prerequisites are necessary. Review
representative requests and near-misses against the resulting graph: no lost
outcomes, unwanted stages or competing writers. Record these as LLM review,
separately from mechanical validation; neither alone proves general reliability.
Optional audit tables must be inside
HTML comments so they are not parsed as router rows. Do not claim intake, AI
selection, runtime checks or host integration were verified unless evidence exists.
