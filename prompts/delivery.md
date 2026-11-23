# Delivery AI — decide what each absorbed source becomes

A source is not automatically a skill. For every coherent part of a selected
source, decide the form in which the generated plugin carries it. **You make this
judgment**, at intake for the new source and again at harmonization for the whole
catalog. Python checks the shape of your answer and writes the host files it
declares; it never chooses a form, counts lines or matches file names for you.

## What the plugin may do

Installing the generated plugin is the user's consent. The plugin may register by
itself whatever it needs: session text, hooks, MCP servers, tools, skills. That it may does not
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
- `mcp-server`: an MCP server the source ships, whose tools its procedures call.
  The release carries its files and registers it, so the tools exist as soon as
  the plugin is installed.
- `package-tool`: a command of the source, served as a tool of the package
  server (below), with the capabilities whose steps call it as `targets`.
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
Use the same forms and explain coexistence with the absorbed sources.
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

## MCP servers

A source that ships its own MCP server is absorbed with it. Select the files the
server runs from, like every file the method uses at run time, and declare the
server once, for every host:

- `name`: the name the host shows for the server. Keep the source's own name
  unless two servers of the package would share it.
- `source`: the source whose files it runs.
- `run`: the command as a list of parts. The first part is a program found on
  the host (`python`, `node`), never a packaged path: two hosts accept only a
  bare program name. Packaged files are arguments, with `<package_root>`.
  Literal data, under the rules of a hook's `run`.
- `env`: only what the server needs to find its own packaged files (a module
  path, a data folder), with `<package_root>`. A server names only files of
  its own source, under `<package_root>/scripts/<source-id>/`; the build
  refuses any other packaged path and one the release does not carry. The
  names `PLUGIN_ROOT` and `PLUGIN_DATA` belong to the hosts. Never a key, a token or another
  secret: carry the source's own way of receiving them as content in the
  capability that sets the server up.

Start the server from the packaged files, not from a published package the
source's own registration downloads: what runs is then the pinned commit the
license gate verified. The original's registration and installer (its
`.mcp.json`, host manifests, an install script) are evidence of how the server
starts; list them in `intake_only_paths`. What the server needs and does not
ship (an interpreter, a library, an external program) stays a runtime
dependency, with how it is checked and installed.

The cost question applies in full. A registered server is paid for in
every session of every user of the package: the host loads its tool
descriptions whether or not the task is about them. State in the decision's reason how many
tools it registers and roughly what their descriptions weigh, and say why the
package pays it. The decision's `targets` are the capabilities whose steps call
the server's tools; their `tools` field still names each operation and its side
effects.

A server the source only calls and does not ship is not declared: it is a
runtime dependency of the capability that needs it.

If the original plugin or its server may already be configured on a user's
host, say so in the reason and in the capability that sets the server up: two
servers with the same tools offer every tool twice, and on some hosts a server
the user configured under the same name wins over the plugin's.

## The package server

By default every absorbed server registers as itself. When the owner answered
that the package has one server of its own (the harmonization prompt, "Servers
and tools"), declare it. It is a declaration and not a form: the forms above
keep their meaning, and `mcp-server` is still a server the source ships.

```json
"package_server": {
  "name": "<server name>",
  "children": ["<name of an mcp_servers entry>"],
  "tools": [
    {"name": "<the child's tool name>", "source": "<the child's source id>",
     "forward": {"server": "<child name>", "tool": "<the child's tool name>"},
     "description": "<the child's own description, copied>",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "<tool name>", "source": "<source id>",
     "description": "<what the command does, in your words>",
     "input_schema": {"type": "object",
                      "properties": {"<param>": {"type": "string"}, "<flag>": {"type": "integer"}},
                      "required": ["<param>"]},
     "run": ["<program>", "<package_root>/scripts/<source id>/<path>", "<command>",
             "--option", "{<param>}", {"if": "<flag>", "args": ["--limit", "{<flag>}"]}],
     "timeout": 120, "env": {"<NAME>": "<package_root>/scripts/<source id>/<path>"},
     "annotations": {"readOnlyHint": true}}
  ]
},
"server_choice": {
  "asked_on": "<YYYY-MM-DD>", "answer": "<the owner's own words>",
  "given_on": {"sources": {"<source id>": "<commit>"}, "shown": ["<tool or command name>"]}
}
```

- `name`: lowercase letters, digits and hyphens, starting with a letter; never
  the name of a server that stays registered.
- `children`: the `mcp_servers` entries the package server starts itself, on the
  first call that needs one. A child is not registered on the host by itself; a
  server not named here registers as before.
  Only a server that declares tools alone may be a child: one that also offers
  resources, prompts, an `instructions` text or requests of its own stays
  registered separately, because the package server forwards tools only and no
  part of a source is dropped without a decision. Python cannot see what a
  server declares without starting it: you read it from the source.
- A tool has `name`, `source`, `description` and `input_schema`, and exactly one
  of `forward` and `run`. `annotations` is optional; `timeout` and `env` belong
  to a `run` tool. A name is unique in the server and differs from the tools of
  a server that stays registered (Python does not see those: you check it).
- A forwarded tool keeps the child's name, description and input schema, copied
  from the pinned source. A tool description is loaded in every session and a
  direct call opens no capability, so it keeps the source's words. They change
  only when two tools would share a name, and you record that collision in the
  decision's reason (ADR-0017). The server compares the declared schema with the
  child's own at the first call. The saving of a package server is therefore in
  the tools it leaves out, not in shorter descriptions.
- A `run` tool's name matches `[a-z][a-z0-9_]{0,39}`. It has an argv template: a
  list whose items are literal strings, placeholders `{param}` that are a whole
  item, and conditional groups `{"if": "<param>", "args": [...]}` or
  `{"unless": "<param>", "args": [...]}`. A group is not nested; its `args` hold
  literals and placeholders. The first item is a literal program found on the
  host's `PATH`: never a placeholder, a `<package_root>` path or a `.cmd` or
  `.bat` file. A packaged file is named with `<package_root>` and lies under
  `scripts/<source id>/` of the tool's own source; the build refuses any other
  path and one the release does not carry. There is no shell syntax: the server
  starts the program with this argv. The source gives a command no tool
  description: write it, and quote the source's rule in full where one applies
  to that command.
- Its `input_schema` is `{"type": "object", "properties": {...}, "required": [...]}`.
  A property has a `type` of `string`, `integer`, `number` or `boolean`, and may
  add `enum`, `description` and `allow_leading_dash`; the schema may carry a
  `description`. Any other key is refused. The server applies five rules to
  every call:
  1. An argument not in the schema is refused. `type`, `required` and `enum`
     are enforced, and nothing else of JSON Schema.
  2. A placeholder outside a group names a required property. Inside a group it
     names the group's own `if` property or a required one.
  3. A string is passed as it is and a number in its JSON form. A boolean is
     only a group's condition. An array or an object is refused.
  4. A string that begins with `-` is refused, unless its property declares
     `"allow_leading_dash": true` (a program may read any item that starts with
     `--` as an option).
  5. An `if` group is included when its argument was given and is not `false`;
     an `unless` group when it was not given or is `false`.
- Carry the source's rule as a declared default. Where the source prescribes
  that a change is drafted or run dry first and applied only on the user's
  approval, declare the write command with
  `{"unless": "apply", "args": ["--dry-run"]}` (or the flag its program has for
  it) and a boolean `apply` in the schema, and quote the source's sentence in
  the description. That is the source's rule as data, not a limit the factory
  adds.
- `annotations` are MCP tool hints, authored from what the source says the
  command does. They go to the host's own permission system; the server adds no
  confirmation step. `idempotentHint` only where the source says a command is
  safe to repeat. `timeout` is whole seconds (120 without it).
- `env`, as for a server's: only what the command needs to find its packaged
  files. Never a key, a token or another secret. The package server and what it
  starts inherit the host's environment, where the source's own way of
  receiving credentials puts them: carry that way as content in the capability
  that sets the package up.

Decisions. Every source whose commands a `run` tool serves has one decision with
form `package-tool`: the commands as `content`, the capabilities whose steps
call them as `targets`. A `package-tool` decision that no `run` tool serves is
refused. A child's source keeps its `mcp-server` decision; its reason states the
estimated weight of the package server's own tool list and why the package pays
it.
Tools of a child that the package server leaves out get one `dropped` decision that lists them, with the owner's answer as its reason.

A capability body keeps naming a tool as its source does, which is also its name
in the package server. What changes on the host is the server it appears under,
so a tool's id changes. Only Claude Code registers the package server for now;
every other host registers the absorbed servers as it does without one.

## Output

Write `delivery.json` in the package directory:

```json
{
  "decisions": [
    {"source": "<source id>", "content": "<which part of the source>",
     "form": "capability | always-on | hook | mcp-server | package-tool | dropped",
     "targets": ["<capability id>"], "reason": "<answers that decided it, and open doubts>"}
  ],
  "always_on": "<the session text, only with an always-on decision>",
  "hooks": [
    {"host": "<host>", "capability": "<capability id>", "event": "<host event>",
     "matcher": "", "run": ["<program>", "<package_root>/scripts/<source-id>/<path>"],
     "timeout": 600}
  ],
  "mcp_servers": [
    {"name": "<server name>", "source": "<source id>",
     "run": ["<program>", "<package_root>/scripts/<source-id>/<path>"],
     "env": {"<NAME>": "<package_root>/scripts/<source-id>/<path>"}}
  ],
  "package_server": {"name": "<server name>", "children": ["<server name>"], "tools": ["<see The package server>"]},
  "server_choice": {"asked_on": "<YYYY-MM-DD>", "answer": "<the owner's own words>",
                    "given_on": {"sources": {"<source id>": "<commit>"}, "shown": ["<name>"]}}
}
```

Every source has at least one decision. `capability`, `hook`, `mcp-server` and
`package-tool` name their target capabilities; `always-on` and `dropped` name
none. Omit `always_on`, `hooks` and `mcp_servers` when no decision uses them,
`timeout` when the source declares none and `env` when the server needs none.
Omit `package_server` unless the owner chose one; write `server_choice` whenever
the owner was asked, with or without a package server. Reasons cite source paths
or sections, like `## Sources` does.
