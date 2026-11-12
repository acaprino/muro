---
id: session-handoff
role: session-handoff
when: —
after: []
outputs: ["handoff_state"]
checks: ["open_items_have_next_action_and_acceptance", "facts_reverified_against_repository", "no_secrets_in_handoff", "links_resolve_and_nothing_mirrored"]
intents: [{"id":"engineering.session-handoff","description":"Record or prepare a repository-root HANDOFF.md that hands a task spanning several sessions to a cold session: active work with next actions and acceptance checks, settled decisions, deviations and what was intentionally not done.","excludes":["A summary of the conversation wanted in the chat.","Release notes, a changelog or commit messages.","Planning the work itself: destination, spec and slices are coordination work.","Durable project knowledge that belongs in memory files or documentation."]},{"id":"engineering.session-resume","description":"Continue earlier work from an existing HANDOFF.md: read it, re-verify its load-bearing facts against the repository, and carry on with the recorded next action.","excludes":["Starting a task that has no handoff file.","Resuming a coordinator map of this plugin, which its own resume command handles."]}]
tools: [{"name":"file-access","purpose":"Read and write HANDOFF.md at the repository root and read the artifacts it links.","required":true},{"name":"shell","purpose":"Run git status, git log and targeted checks to verify the recorded state against the repository.","required":true}]
hooks: []
conflicts: []
---

# Session Handoff

Keep one compact repository-root `HANDOFF.md` that transfers control to a cold session without requiring the prior conversation. It is a snapshot: repository evidence always wins over it.

`<SH>` is `<package_root>/scripts/open-paper-skills/skills/session-handoff`. The full version is `<SH>/SKILL.source.md`; it wins where this body differs, except for the changes listed in the Sources section.

Each fact lives in its authoritative layer:

- Git holds commits and diffs: link `git log` or `git show`, never mirror a commit table.
- Memory files hold durable cross-task or cross-project knowledge; project memory holds project-local state.
- A dedicated map or tracker holds its own execution status: link it, do not mirror it.
- `HANDOFF.md` holds the current task arc: active work, settled decisions, deviations and intentional omissions.

## Behavior

Pick the flow the task calls for. If `HANDOFF.md` is missing or needs structural repair, open `<SH>/references/format.md` before recording (the file's skeleton and its three closing rules); do not open it otherwise.

**Resume** (an existing file):

1. Read `Active Work`, then `Decisions`, guardrails, blockers and any suggested skills relevant to the next action.
2. Re-verify load-bearing facts with `git status`, `git log`, the referenced artifacts and targeted checks. Current repository evidence is preferred over the snapshot.
3. Continue the recorded next action. Settled defaults stand unless the user explicitly reopens them.

Done when the next action, its authority, its prerequisites and the evidence for the current state are all known without the previous transcript.

**Record ongoing work:**

1. Create or update the active task arc before work may cross a session boundary. Every open item gets an exact next action and a checkable acceptance condition; add paths or commands when useful.
2. Update the record as state changes. A blocked or partial item stays unchecked with its blocker; an item is checked and struck through only after its verification passes.
3. Settled choices go in as `Decision | Default taken | To reverse`, material route changes under `Deviations`, deliberately deferred scope under `Intentionally not done`.
4. Reference existing specs, plans, ADRs, issues, maps, commits and diffs by path or URL, adding only the context needed to understand why they matter and what happens next.
5. Keep sensitive values out. For credentials and private data record a safe location or a handling instruction, never the secret or the personal detail itself.

Done when a cold agent can identify the current state, next action, acceptance check, blocker and governing decision from repository artifacts alone.

**Prepare the next session:**

1. Compact finished detail into links to authoritative artifacts and Git evidence; only live, load-bearing context stays in `HANDOFF.md`.
2. If the user names the next session's focus, tailor the next action to it. Add `Suggested skills` only when naming them changes tool or workflow routing.
3. Audit the handoff: verify factual claims, resolve local links, remove duplicated artifact content, and confirm no credentials or sensitive personal information appear.
4. When the arc has no remaining execution work, write `No active tasks.`, after preserving durable decisions and intentional omissions in their authoritative layers.

Done when a fresh agent can resume safely from `HANDOFF.md` and its links, with no transcript and no hidden prerequisite.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `handoff_state` as one JSON string: whether the file was resumed, recorded or prepared, the next action with its acceptance check, open blockers, and what was re-verified. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- `HANDOFF.md` stays in the repository root, with relative links and `Active Work` near the top. Keep it lean: Git history and linked artifacts carry completed detail.
- Nothing reads the file automatically at session start: the repository's startup instructions must explicitly direct agents to read `HANDOFF.md`.
- A coordinator map under this plugin's state folder, or a work map under `.scratch/`, is a dedicated map or tracker: link it from the handoff, never copy it in.
- No runtime dependency is installed by this capability.

## Checks

- **open_items_have_next_action_and_acceptance**: every unchecked item names its next action and a checkable acceptance condition, with its blocker when blocked.
- **facts_reverified_against_repository**: the state claimed in the file was compared with `git status`, `git log` or the referenced artifact this session; quote what was run.
- **no_secrets_in_handoff**: the file contains no credential, token or sensitive personal detail.
- **links_resolve_and_nothing_mirrored**: local links open, and no commit table, tracker status or artifact content is duplicated in the file.

## Sources

- AI intent mapping: session-handoff → engineering.session-handoff (its record and prepare flows) and engineering.session-resume (its resume flow).
- Source: open-paper-skills (pengqianhan/open-paper-skills@f85fd3dc, head) — `skills/session-handoff/SKILL.md` (packaged as `SKILL.source.md`) and `references/format.md`, packaged unchanged.
- Changes for coexistence (ADR-0017):
  - The source's frontmatter triggers are not applied: they would activate the original as a skill beside the coordinator, which classifies by meaning.
  - The source's rule for a dedicated map or tracker is applied by name to this package's own maps (the coordinator map and the `work-map` map under `.scratch/`), and a coordinator map is resumed by the coordinator's own resume command, not by this capability; otherwise two capabilities would hold the same execution status.
- Runtime dependency: none (Git is already present in a repository).
- Hooks: the selected files define none. The source says it does not run at session start by itself; nothing here registers a hook for it.
- Harmonized by: prompts/harmonizer.md — its own role. `work-map` plans and tracks the slices of a change in its own map; this capability carries any task arc across sessions and links that map instead of mirroring it.
