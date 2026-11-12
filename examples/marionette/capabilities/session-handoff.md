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

Keeps one compact `HANDOFF.md` at the repository root that transfers control to a cold session without the earlier conversation. It is a snapshot: repository evidence always wins. The file format is in `<package_root>/scripts/open-paper-skills/skills/session-handoff/references/format.md`; read it only when `HANDOFF.md` is missing or needs structural repair.

Each fact stays in its authoritative layer: Git holds commits and diffs (link `git log` or `git show`, never copy a commit table); memory files hold durable cross-task knowledge; a dedicated map or tracker holds its own execution status (link it, do not mirror it); `HANDOFF.md` holds the current task arc only.

## Behavior

**Resume** (an existing file):

1. Read `Active Work`, then `Decisions`, guardrails, blockers and any suggested skills relevant to the next action.
2. Re-verify load-bearing facts with `git status`, `git log`, the referenced artifacts and targeted checks. Prefer current repository evidence over the snapshot.
3. Continue the recorded next action. Keep settled defaults unless the user explicitly reopens them.

**Record ongoing work:**

1. Create or update the active task arc before work may cross a session boundary. Every open item gets an exact next action and a checkable acceptance condition; add paths or commands when useful.
2. Update as state changes. A blocked or partial item stays unchecked with its blocker; check and strike through an item only after its verification passes.
3. Record settled choices as `Decision | Default taken | To reverse`, material route changes under `Deviations`, deliberately deferred scope under `Intentionally not done`.
4. Reference specs, plans, ADRs, issues, maps, commits and diffs by path or URL, with only the context needed to see why they matter and what happens next.
5. Keep sensitive values out. Record a safe location or handling instruction for credentials and private data, never the secret or the personal detail.

**Prepare the next session:**

1. Compact finished detail into links to authoritative artifacts and Git evidence; keep only live, load-bearing context.
2. If the user names the next session's focus, tailor the next action to it. Add `Suggested skills` only when naming them changes tool or workflow routing.
3. Audit the file: verify factual claims, resolve local links, remove duplicated artifact content, confirm no credential or sensitive personal information appears.
4. When nothing remains to execute, write `No active tasks.` after durable decisions and intentional omissions are preserved in their own layers.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `handoff_state` as one JSON string: whether the file was resumed, recorded or prepared, the next action with its acceptance check, open blockers, and what was re-verified. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- `HANDOFF.md` lives in the repository root, uses relative links and keeps `Active Work` near the top. Keep it lean.
- It is not read automatically at session start: the repository's startup instructions (for example AGENTS.md) must tell agents to read it. Offer that one line when it is missing; add it only when the user agrees.
- A coordinator map under this plugin's state folder, or a work map under `.scratch/`, is linked from the handoff, never copied into it.
- No runtime dependency is installed by this capability.

## Checks

- **open_items_have_next_action_and_acceptance**: every unchecked item names its next action and a checkable acceptance condition, with its blocker when blocked.
- **facts_reverified_against_repository**: the state claimed in the file was compared with `git status`, `git log` or the referenced artifact this session; quote what was run.
- **no_secrets_in_handoff**: the file contains no credential, token or sensitive personal detail.
- **links_resolve_and_nothing_mirrored**: local links open, and no commit table, tracker status or artifact content is duplicated in the file.

## Sources

- AI intent mapping: session-handoff → engineering.session-handoff (its record and prepare flows) and engineering.session-resume (its resume flow).
- Source: open-paper-skills (pengqianhan/open-paper-skills@f85fd3dc, head) — `skills/session-handoff/SKILL.md` and `references/format.md`, packaged unchanged.
- Runtime dependency: none (Git is already present in a repository).
- Hooks: the selected files define none. The source says it does not run at session start by itself; nothing here registers a hook for it.
- Harmonized by: prompts/harmonizer.md — its own role. `work-map` plans and tracks the slices of a change in its own map; this capability carries any task arc across sessions and links that map instead of mirroring it.
