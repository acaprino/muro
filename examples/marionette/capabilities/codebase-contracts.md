---
id: codebase-contracts
role: codebase-contract-docs
when: "—"
after: []
outputs: ["contract_files"]
checks: ["scope_gate_respected", "symbols_cited_from_code", "existing_files_corrected_not_replaced", "links_and_targets_verified", "docs_only_no_commits"]
intents: [{"id":"docs.codebase-contracts","description":"Document an existing repository or folder tree with one contract README per directory, written bottom-up from the code: interface, invariants, side effects and verification for each component, and blueprint indexes for parent folders and the root.","excludes":["An interactive HTML walkthrough of how a mechanism works: that is the explainer.","A single project README, tutorial or user guide written from a brief.","Changing, refactoring or reviewing the code itself.","Committing or staging the generated files."]}]
tools: [{"name":"file-access","purpose":"List directories one level at a time, read source files and existing contract files, write or correct one contract file per directory.","required":true},{"name":"shell","purpose":"Directory discovery and search for top-level definitions; optionally run a markdown formatter the repository already configures, which may contact a package registry.","required":false},{"name":"subagent","purpose":"Spawn read-only scouts per code chunk and parallel workers per subtree; without it the scout steps run inline.","required":false},{"name":"structured-question","purpose":"Ask the approval question for a large tree and the final drift-report question; plain chat is the fallback.","required":false}]
hooks: []
conflicts: []
resumable: true
---

# Codebase Contracts

Writes or corrects a contract file (default `README.md`) in every code directory of a tree: leaf components first, then the parent indexes, then the root blueprint. Every entry comes from the code. It writes documentation only.

The packaged original is the full version and wins where this body differs, except for the changes listed in the Sources section: `<package_root>/scripts/egm/skills/egm-bootstrap/SKILL.source.md`, with `references/templates.md` and `references/worker-return.schema.json` in the same folder. Open the section a step names when you reach it.

## Behavior

1. **Rules of the step** (`## Execution Constraints (CRITICAL)`). No functional source code is written or refactored. No `git add` and no `git commit`: tracking is left to the user. Each worker keeps status and log files in its own directory outside the workspace, never a fixed shared path.
2. **Inputs** (`## Inputs`): the root `path` is required. `target_filename` defaults to `README.md`; another name such as `EGM.md` is used when existing human-maintained READMEs must not be modified.
3. **Verification command** (`### Step 0`): find the build manifest and record the matching test command for the contracts.
4. **Scope** (`### Step 2`). Map the tree one directory level at a time; never a recursive listing. Skip symbolic links, hidden and vendor directories and whatever `.gitignore` and `.egmignore` exclude. As soon as the count of directories found exceeds 15, stop and ask the user the approval question; on abort, end. Then prune bottom-up: test-only directories and directories with no code below them.
5. **Strategy** (`### Step 3`). Five pruned directories or fewer: document in this thread. More: partition with the adaptive depth algorithm and spawn one worker per partition in parallel; a worker is a general-purpose subagent told to read `<package_root>/scripts/egm/agents/bootstrap_orchestrator.md` and to follow Step 4 of the original for its subtree, returning the JSON of the worker schema.
6. **Per directory, deepest first** (`### Step 4`). Always scan the code with a read-only scout, also when the contract file exists; chunk at about 1,500 lines on definition boundaries, never mid-body; read in the order the original gives and ignore test files. An existing contract file is read, merged and corrected, never overwritten whole, keeping developer notes. The scout cites `[file:symbol_or_flag]` for every entry, never infers from names, and writes `["None"]` when the code states no invariant or side effect. A failed scout leaves the placeholder the original gives and the run continues.
7. **Templates and links.** Read `references/templates.md` before writing: component package for a directory with source files, intermediate blueprint for one with only documented children, repository root blueprint for `path`. Link only to files that exist.
8. **Root and final verification** (`### Step 5`). Compile intermediate and root files from the workers' payloads; a failed worker leaves a marked placeholder. Then read every created or modified contract file and verify the three sections, the code grounding, the markdown and that every link target exists.
9. **Drift question.** Ask the question of Step 5.5 as written.

## Output handoff

Return `contract_files` (the paths created and corrected, the verification command, placeholders left by failed scouts or workers, and the user's answer to the drift question) as a JSON string. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- When the user answers yes to the drift question, the drift report on the modified contracts is a step of design-drift; ask the coordinator for it when it is not already planned.
- What leaves the machine, in the source's words: "A formatter or other user-approved project command may contact a package registry or another service."
- The packaged host guides under `<package_root>/scripts/egm/docs/` describe the upstream plugin's installation, commands and cache; those parts do not apply here.
- Runtime dependencies: none required. A subagent tool makes large trees parallel; the project's own formatter is used only when the repository configures one.

## Checks

- **scope_gate_respected**: discovery was level by level and, above 15 directories, the user approved before any worker ran.
- **symbols_cited_from_code**: every interface, invariant and side-effect entry cites a file and symbol the scout read; nothing is inferred from names.
- **existing_files_corrected_not_replaced**: an existing contract file was corrected in place with its notes kept, or the alternate file name was used.
- **links_and_targets_verified**: every created or modified file was re-read; all links resolve and verification targets are valid.
- **docs_only_no_commits**: no source code changed and nothing was staged or committed.

## Sources

- Source: egm (google/elephant-goldfish-model@dea7761de06ce5b51c177ebb9bba0469f24af5a4, release v0.1.1, Apache-2.0) — `skills/egm-bootstrap/SKILL.md`, `skills/egm-bootstrap/references/templates.md`, `skills/egm-bootstrap/references/worker-return.schema.json`, `agents/bootstrap_orchestrator.md`, packaged under `<package_root>/scripts/egm/` (the skill as `skills/egm-bootstrap/SKILL.source.md`).
- AI mapping: egm-bootstrap → docs.codebase-contracts. Its files live in the repository and state contracts; interactive-explainer's codebase walkthrough is a teaching HTML page, so the two do not share an output.
- Changes for coexistence (ADR-0017):
  - `/egm-bootstrap` is not carried: the coordinator classifies by meaning.
  - Step 5.5 "run the `egm-drift-report` skill" becomes design-drift's own step after the user's yes (one capability per step, one owner of the drift report).
  - The registered worker type `egm-bootstrap-orchestrator` and the runtime-registered `goldfish-explorer` scout are replaced by the source's own alternative, a general-purpose subagent given the persona or the scout prompt; read-only is then an instruction, not a host limit.
  - The result is also handed over as `contract_files` through the coordinator.
- `hooks: []`: the upstream ships no hook at this release.
