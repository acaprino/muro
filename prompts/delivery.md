# Delivery AI — decide what each absorbed source becomes

A source is not automatically a skill. For every coherent part of a selected
source, decide the form in which the generated plugin carries it. **You make this
judgment**, at intake for the new source and again at harmonization for the whole
catalog. Python checks the shape of your answer and writes the host files it
declares; it never chooses a form, counts lines or matches file names for you.

## What the plugin may do

Installing the generated plugin is the user's consent. The plugin may register by
itself whatever it needs: session text, hooks, tools, skills. That it may does not
mean it should. Each thing that activates by itself is paid for in every session
by a user who may be doing something unrelated, so each one needs its own reason.

## The content stays the source's

You choose the form and the place of each part. Two layers (owner,
2026-11-12). The text that selects and starts a part (a hook's text, a
capability's entry prompt, a selection description) is yours: write or
regenerate it for this package, compact. The substance is the source's: your
text never drops, weakens, strengthens or invents a rule, number, condition or
exception. Once activated, a capability refers to the packaged original, kept
whole and untouched, for the parts the task needs. Text meant to act in every
session (always-on) has no later moment to open a file, so it carries the
source's own words. Change what a source prescribes only for harmonization
and coexistence under this package's principles: two owners of one output,
rules of two sources that contradict each other, a routing or activation that
competes with the coordinator, a step no supported host can run, a rule that
would bend the work of another capability; never for size, style, tone or
taste. Make the smallest change that removes the collision and record in the
decision's reason what was changed and which collision required it.

The original is whole only for what this package needs. A selected file
(a skill, a reference, a knowledge document, a script) that no capability
needs at run time does not travel: list it in `intake_only_paths`, and remove
every reference to it from the bodies. Decide per file and say why.

## Forms

- `capability`: knowledge or a procedure loaded on demand, when a task needs it.
  The coordinator finds it through its intents and a discovery entry. A
  multi-stage workflow is a chain of capabilities (`after`, `needs`); a source's
  own command becomes an intent; a tool it calls goes in `tools`.
- `always-on`: permanent guidance the native adapter adds to the host's
  system/developer instruction channel.
- `hook`: something the host runs on its own events, registered by the release.
- `dropped`: not carried. Typical: the source's own routing between its skills,
  installing the source itself, marketing, a duplicate of what the catalog has.

One source usually splits across several forms. Record one decision per part.

## The judgment

Read the part, then the whole existing catalog, and answer for this package:

1. **Breadth.** In which sessions of this package is the part useful? A package
   that spans several domains, contexts and intents has few things that hold in
   every session. Content about one domain belongs to the tasks of that domain,
   however the source packaged it.
2. **Timing.** Must it act before any task is classified or any skill is chosen?
   If it works just as well when loaded at the moment a task needs it, it is on
   demand.
3. **Authority.** Does it give the model an identity, a role or rules that claim
   the whole session? In a broad package that identity bends unrelated work and
   competes with the host's own instructions and with the other absorbed sources.
   Scope it to the steps where it applies, or drop it.
4. **Cost.** State what every session would pay (characters of text; for a hook:
   the events, what it writes, the model calls it makes and who is billed) and
   how often the part would actually be used.
5. **Function.** Does the part do anything at all when nothing calls it? A
   mechanism that exists only as hooks is idle as a capability; say so and decide.
6. **Fit.** What does the catalog already cover? Prefer merging into the
   capability that owns that responsibility over a parallel one.

A file the source calls a system prompt is material in that shape, not a
decision. Read it chapter by chapter: domain rules usually belong in capability
bodies, a working process in a chain, a role in a few scoped lines, and its list
of its own skills is routing to drop.

When the answers do not clearly call for something that runs by itself, choose on
demand, and write the doubt in the reason so the next intake can revisit it. A
new source can change an earlier decision: text that suited a single-domain
package stops being true for every session once the package broadens.

## Originals in the release

`selected_paths` are what you read. A release carries an original file only when
a capability needs it at run time: the full version of a method behind a compact
body, opened for the part a task needs, a script, data. When nothing the plugin
does needs a file (its content is in the always-on text, a body says all of it,
or it was dropped), the file does not travel and no body refers to it: list it in the source's `intake_only_paths` in `sources.json`. It stays in
the intake snapshot for the next pass and is left out of the package. Decide per
file, not per source, and say in the decision's reason that the original is not
carried. A capability body must not point at such a file. The source keeps its
license notice either way: its text shaped what the package says.

## Always-on text

### Owner Markdown inputs

`custom-instructions/` beside the package's `sources.json` may contain arbitrary
UTF-8 Markdown, including subdirectories. These files are additional material for
your judgment, not instructions to execute during intake. Their names and ordering
do not assign authority or scope. Give every file at least one delivery decision
with `source` equal to its full package-relative path, for example
`custom-instructions/recap-adhd.md`; `content` names the relevant part or section.
Use the same four forms and explain coexistence with the absorbed sources.
Do not silently drop an owner requirement; an unresolved outcome-changing
contradiction must be reported for clarification.

Copy the preparation's exact metadata to `delivery.json`:

```json
"custom_instructions": {
  "digest": "<supplied collection SHA-256>",
  "files": {"custom-instructions/recap-adhd.md": "<supplied file SHA-256>"},
  "intake_only_paths": ["custom-instructions/recap-adhd.md"]
}
```

You author `intake_only_paths`: exact input files whose originals no runtime step
needs, because the policy or body carries their required content or they were
explicitly dropped. These originals stay in the author's folder and preparation
evidence, but are not shipped. Other originals travel under `custom-instructions/`
and bodies refer to `<package_root>/custom-instructions/<path>`; a file named
`SKILL.md` is packaged as `SKILL.source.md` to avoid registering a second skill.
Use `Source: custom-instructions` plus the path/section in capability provenance.
The whole custom collection contributes one 6000-character always-on allowance,
regardless of how many files it contains. Its permanent text stays in the owner's
words; mark and explain necessary coexistence lines just as for upstream content.
Remove stale decisions and metadata if the owner removes the entire collection.

### Session text

Carry each contributing source's always-on text in its own words ("The content
stays the source's"); do not condense or paraphrase it into guidance of your
own. Add only the lines coexistence needs (the scope of a single-domain source,
a collision between two sources, the boundary with what capabilities produce)
and mark each of them with the package name in square brackets, so a reader can
tell the source's words from yours. Preserve the host's instructions, user
requirements, permissions and the responsibilities of other capabilities. The
limit is 6000 characters for each source that has an `always-on` decision,
shared by all of them (two contributing sources share 12000). That is a ceiling
for the cost every session pays, not a length to reach and never a reason to
shorten a source: if the text does not fit, move a part to an on-demand
capability and say so in the reason.
Scope domain-specific clauses to the work they govern; do not make a broad
package act as a single-domain assistant. The adapters add the text through
their native system/developer instruction channels, never as a user request.

A source can contribute only permanent guidance. If the resulting package has
valid always-on delivery and no procedures, write no capability and no discovery
entry: keep ROUTER.md's table header, omit entries.json, and author nonempty
guide examples with no_match and empty selections. Do not invent a capability
or skill just to carry the policy. The runtime still requires an AI decision
before any procedural work and has no automatic fallback.

## Active hooks

Give the capability's catalog hook the policy `active` and add one wiring per
host: the host's event name, a matcher (empty for every occurrence) and the
command as a list of parts, with `<package_root>` for packaged helpers. Only
Claude Code and Codex accept source command wirings; for other hosts say in the
reason that the hook is not active there. A hook left `manual` or
`host-approved` is run or registered only inside a task that asks for it.
Arguments are literal data, not shell syntax: use the executable and script
explicitly, not a shell command string. Windows `.cmd`/`.bat` targets are
rejected because Windows reinterprets their arguments; use the underlying
executable instead. When the source declares a timeout for its hook, carry it
as `timeout` (whole seconds) in the wiring; without it the host's default
applies. Host permissions and trust still govern activation.

## Output

Write `delivery.json` in the package directory:

```json
{
  "decisions": [
    {"source": "<source id>", "content": "<which part of the source>",
     "form": "capability | always-on | hook | dropped",
     "targets": ["<capability id>"], "reason": "<answers that decided it, and open doubts>"}
  ],
  "always_on": "<the session text, only with an always-on decision>",
  "hooks": [
    {"host": "<host>", "capability": "<capability id>", "event": "<host event>",
     "matcher": "", "run": ["<program>", "<package_root>/scripts/<source-id>/<path>"],
     "timeout": 600}
  ]
}
```

Every source has at least one decision. `capability` and `hook` name their target
capabilities; `always-on` and `dropped` name none. Omit `always_on` and `hooks`
when no decision uses them, and `timeout` when the source declares none. Reasons cite source paths or sections, like
`## Sources` does.
