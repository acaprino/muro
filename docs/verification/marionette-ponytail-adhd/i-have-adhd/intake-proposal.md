# i-have-adhd intake proposal — 2026-11-12

This is an AI-authored semantic intake proposal and static source audit. No production package files were changed. The requested integration is communication guidance, not a medical inference about the user.

## Pin, rights and exact source evidence

- Repository: https://github.com/ayghri/i-have-adhd
- Latest published non-draft/non-prerelease release returned by GitHub: [v0.4.1](https://github.com/ayghri/i-have-adhd/releases/tag/v0.4.1), published 2026-10-19T19:46:23Z.
- Lightweight tag refs/tags/v0.4.1 resolves to commit `1ecea1993b7fce257ffbd686c070948b5e07eda6`.
- Root tree: `d4775095f471d938babccea77838d43b7fd39bc3`. GitHub reports the commit signature verified/valid.
- Root LICENSE is standard MIT, Copyright (c) 2026 Ayoub Ghriss, blob `19db5f1b0ca65e277c158bd4c4263139ccfd859c`. No NOTICE or deeper license appears in the complete recursive tree.
- Canonical `skills/i-have-adhd/SKILL.md`: blob `6c42757ffae37e442adfb52fbba2a8609f1cff00`. The Cursor copy has this exact same blob. README blob: `d784a4359d68ae959e85ac7cd22bbebef42cc682`.
- Evidence was retrieved through the GitHub connector: repository metadata, complete release list returned for this repository, exact tag ref, signed commit payload, non-truncated recursive tree and 42 source text files. The tags list endpoint rejected the request; exact published release/tag binding succeeded.
- `verified-mirror.git` retains the original signed commit object, exact tag ref, all 25 tree objects and 42 hash-verified inspected blob paths. It is a partial local repository: unfetched unselected blob contents and parent history are deliberately absent. This is not a synthetic commit or a full clone.
- Use it through `repo_path` in a scratch build manifest, not as a file:// clone source. The production manifest keeps its public repo_url. `materialize_evidence.py` recreates and checks objects from saved connector evidence; it is our standard-library evidence utility, not downloaded source code.

## Semantic result

The source has one end-user responsibility: shape the assistant's communication so the user can understand the answer, keep state and act. It does not supply an independent tool-driven task, artifact pipeline, output ownership or prerequisite. A second capability, a mode-toggle skill, or a review-response skill would fabricate a procedural boundary.

Carry the reviewed communication principles as always-on text. They apply to design, engineering, Office and research sessions, including before a procedural capability is chosen. Preserve the scope of all existing capabilities and their artifact/review requirements. No entries, capabilities, hooks, dependencies or output keys are added for this source.

The decision is not based on the source calling itself a skill or on the presence of a SessionStart hook. It follows the behavior: every useful instruction governs how the assistant explains or works with the user; the remaining executable machinery only activates that same text.

## Source-to-policy mapping

| Source evidence | Preserved outcome | Adaptation / boundary |
|---|---|---|
| Rules 1–3 and 7 | Answer/result first, bounded steps, visible result and useful next action | Use steps when helpful; no mandatory command first, two-minute estimate or artificial final task |
| Rules 4–5 | Stay on the current work, resolve agent-owned questions, retain state | Report meaningful state changes; avoid redundant re-teaching, every-turn progress banners and duplicating an existing plan tool |
| Rule 6 | Make useful estimates concrete | Only grounded estimates, for the actor doing the work; no invented duration |
| Rule 8 and Pre-send check 4 | Neutral error reports and useful diagnostic progress | Distinguish facts from hypotheses; never fabricate a cause to satisfy “cause/fix” form |
| Rule 9 | Manage visual working load without losing relevant information | Group when useful; completeness, search, analysis and requested scope are never capped at five |
| Rule 10 and Pre-send check | Remove filler, canned closers and figurative clutter | Honor host-required tool announcements and user-requested prose/format |
| When to break the rules 1 and 5 | Complete explanations, real options and task-preserving depth | User's demonstrated knowledge guides the starting point; concrete examples/diagrams support complex concepts |
| When to break the rules 4 and 6 | Material clarification and authorized agent autonomy | Ask only what evidence cannot resolve; perform already authorized work rather than asking again or delegating it back |
| When to break the rules 2–3 | Host permissions and recovery after repeated failed fixes | Preserve applicable authorization; revisit the uncertain assumption instead of a fixed counter or repeated blind patches |
| Persistence and README “No ADHD diagnosis needed” | Consistent communication across topics, user control | No identity diagnosis, cognitive stereotypes, magic stop-phrase parser or rigid session mode |

The source itself explicitly says full explanations are allowed, the task wins if shape would delete the answer, the harness wins, and uncertainty-bearing hedges must remain. These clauses are central, not incidental exceptions. The owner's current request further requires respect for what the user knows and realistic explanations rather than a forced format.

## Runtime hooks, tools and dependencies inspected

| Files | Original default and effects | Integration decision |
|---|---|---|
| hooks/hooks.json; always-on.mjs | SessionStart startup/resume/clear/compact; flag in CLAUDE_CONFIG_DIR or ~/.claude; reads canonical skill and prints full policy, timeout 30; errors exit silently | Drop; native adapter already delivers reviewed text |
| hooks/always-on.sh, always-on.ps1 | Equivalent shell/PowerShell flag-and-print fallbacks; read-only, no model call | Drop; no shell/PowerShell runtime requirement |
| .opencode/plugins/i-have-adhd.mjs and .js | V1 config/experimental system hook; V2 setup/context hook; registers skill and slash command; optional flag under XDG_CONFIG_HOME or ~/.config/opencode; reads files and mutates host config/context | Drop competing registrations and per-turn duplicate injection; no Node requirement |
| extensions/i-have-adhd.ts; context-compat.ts | Pi/OMP extension API and Node builtins; /i-have-adhd, /skill alias, --adhd, stop-input handling; optional flag/JSON settings; persisted custom mode entries, hidden rule messages, status/notifications; restores across session start/tree/compaction | Drop source mode state and transport; no Pi package or status UI dependency; no source event hook |
| skills/*/agents, plugin/package/native manifests, GEMINI.md | Discover or import the same policy; Codex explicitly disables implicit invocation; Gemini extension applies at install while command route is opt-in | Drop original activation/discovery; add i-have-adhd to plugin.replaces |
| INSTALL.md | Source installation, updates, removal, global instructions and flags for the documented hosts | Drop source installation and config modifications; not a runtime dependency installer for Marionette |
| scripts/run_evals.py; judge.py | Standard-library Python invokes configured host CLIs/models, writes/resumes JSONL, retries, reports usage and grades; judge has separate provider spending | Developer evaluation support, not adopted or executed |
| scripts/run_scenario_eval.py | Paid Claude CLI calls with resumed session, temporary work directory and exclusive result JSONL; host session can persist | Developer evaluation support, not adopted or executed |
| scripts/check_pi_extension.py | Python checks manifests, installs the source into a temporary Pi config, starts Pi/OMP RPC, writes test probes/state; claims no model request; OMP branch uses existing runtime | Not adopted or executed; installation is a side effect even in a smoke test |
| scripts/check_context_compat.ts | Imports context helper and exercises in-memory cases; logs result | Developer test, not adopted or executed |
| .github/workflows/* | CI installs runtimes/source for load checks, compares Cursor duplicate; @claude comment workflow invokes a model action | Upstream repository automation, not plugin hooks; not adopted or executed |

Source installers name host CLIs and in CI Node 22 plus npm package @earendil-works/pi-coding-agent or @anthropic-ai/claude-code. These are transport/developer requirements only. No runtime dependency remains for the synthesized text. No source executable is needed or selected for packaging.

## QA evidence and limits

The inspected eval README, rubric, cases, runner config, scenario and RESULTS distinguish correctness/autonomy from mere shortness. RESULTS records an upstream candidate gate failure (3 blocker rows) for one historical run. One autonomy case had tools disabled in the runner, so it cannot demonstrate actual edit behavior. The partial-success case records a fabricated confident auth cause, supporting the adaptation's explicit observed-fact/uncertainty boundary. Those results do not prove quality of this reviewed policy or of v0.4.1 on another host.

The source's test bodies, translation contents, CONTRIBUTING and binary logo were not fetched. Their paths and blob identities are inventoried from the complete tree. They are excluded developer/docs/branding material; no claim is made that uninspected test or translation text is identical to the canonical instructions. All runtime hook manifests, runtime extensions, source helper scripts, native discovery manifests and canonical policy were inspected.

`behavioral-cases.json` contains six AI-authored review cases: complete explanation for a knowledgeable user, authorized edit, unknown failure cause, explicit six-option table, second-turn style change, and preservation of a research claim ledger. They were not executed. They test communication behavior, not a keyword-based router, and are not fake proof of model reasoning.

## Harmonization with the current catalog

- interactive-explainer/explainer-fact-check own requested HTML explanation artifacts, fact-checks and review stages. Ordinary conversational explanation does not acquire those stages just because this policy asks for clarity. Conversely this policy must not shorten a requested HTML artifact or remove its checks.
- work-map and session-handoff own workflow state/documents. A conversation progress update does not create a map, and it must not rewrite coordinator state. Existing explicit HITL choices remain; do not manufacture another approval for already authorized work.
- research-pitch and paper-reading/writing roles keep evidence, limitations and their required deliverables. Brevity cannot delete ledger rows, qualifiers or meaningful alternatives.
- token-economy retains its own requested hook/control procedure. This policy's concision does not activate its hooks, trim its analysis, or alter its state.
- UI/Office format, tool and design ownership stays in the selected capability. “Action first” never replaces an artifact with instructions for the user to build it.
- Ponytail's collaboration/critique guidance can merge with these communication methods. Root owns the final combined text and full pairwise catalog audit. No source order determines precedence.

## Artifacts and mechanical checks

- `manifest-entry.json`: production-ready source entry candidate; selected canonical SKILL.md plus README.md, MIT, empty runtime_deps.
- `delivery-proposal.json`: five explicit decisions and a 1283-character standalone candidate; root must merge it with Ponytail and keep the total at most 2000.
- `evidence-bundle.json`: metadata and 42 source texts, with exact SHA identities.
- `source/`: exact inspected file bytes; inert evidence.
- `object-verification.json`: successful original SHA reconstruction report.
- `proposal-verification.json`: factory source inspection result against local mirror.
- `verify_proposal.py`: factory-owned source checks and metadata consistency checks only.

Cost of this source's candidate: 1283 permanent characters before consolidation, no source model calls, no source hook events, no file writes, no new task approvals. Model token overhead is tokenizer-dependent and unmeasured. Native-delivery registration and actual model behavior remain separate verification layers.

No install, source code execution, paid evaluation, live-host session, commit, push or publication occurred. A staged build must use the exact mirror via repo_path and keep that local override out of production sources.json.
