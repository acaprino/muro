---
id: concept-brief
role: concept-ideation
when: "—"
after: []
outputs: ["concepts_brief"]
checks: ["problem_drilled_before_review", "readiness_confirmed", "lenses_ran_fresh", "brief_written_to_file", "next_step_chosen_by_user"]
intents: [{"id":"docs.idea-brainstorm","description":"Turn a raw or half-formed idea into a stress-tested concept brief: drill the problem with open questions, have fresh-context reviewers attack the anchored hypothesis from several lenses, and refine the brief until the user is satisfied.","excludes":["Writing the design document itself or its implementation plan.","Implementing the idea or changing production code.","Quick opinion or a list of ideas in chat with no brief to keep.","Choosing a visual look, a page concept or a research problem: those belong to the design and research capabilities."]}]
tools: [{"name":"file-access","purpose":"Write and update concepts_brief.md in the working directory (or the host's artifact directory), publish it under docs/designs/ when the user chooses that, and read the packaged personas and guides.","required":true},{"name":"subagent","purpose":"Spawn subagents in a fresh context with no conversation history: the synthesizer or the seven reviewer lenses in parallel; they read the persona files and return findings.","required":true},{"name":"structured-question","purpose":"Present a single-select gate with exactly one question; plain chat is the fallback.","required":false},{"name":"shell","purpose":"Read the author name from git config user.name.","required":false}]
hooks: []
conflicts: []
resumable: true
---

# Concept Brief

Turns an idea into `concepts_brief.md` through questions and a review by subagents that never saw the conversation (the source calls the main session the Elephant and those subagents Goldfish). It writes no design document and no code.

The packaged original is the full version and wins where this body differs, except for the changes listed in the Sources section: `<package_root>/scripts/egm/skills/egm-brainstorm/SKILL.source.md`. Open the section a step names when you reach it. Its relative paths (`agents/`, `resources/`, `docs/`) resolve under `<package_root>/scripts/egm/`.

## Behavior

1. **Rules of the step.** Apply `## Execution Constraints (CRITICAL)` of the original, all thirteen: the brief goes to a file and chat gets its path, plain English, stress-test before agreeing, no flattery and no apologies, every gate has exactly one question and is the only tool call of its turn.
2. **Drill the problem** (`### Step 1`). Ask open questions in plain chat across as many turns as it takes; no structured question tool and no ready-made answer options here. Resolve the author from `git config user.name`, then `GIT_AUTHOR_NAME`, else ask.
3. **Readiness gate.** Summarize the anchored hypothesis in two or three sentences and present the single-select gate of Step 1.3. Spawn no subagent before the user chooses the review option.
4. **Fresh review** (`### Step 2`, `## Delegation`). Spawn the synthesizer with mode BRAINSTORM, or the seven lenses in parallel when the host cannot nest subagents. The lens table is `## The Goldfish Brainstorming Lenses`. Each subagent is a general-purpose subagent told to read its persona file first: `<package_root>/scripts/egm/agents/synthesizer.md`, `design_critic.md`, `codebase_details.md`, `zoom_out.md`, `comprehension.md`, `implementation_readiness.md`, `structural.md`, `inventive_catalyst.md`. Pass the prompt verbatim with absolute paths, nothing of the conversation. A reviewer that fails is retried once, then recorded as `not run`, never as zero findings. No subagent tool: stop and tell the user that a review in the same context is not a fresh review.
5. **Write the brief** in the structure given in Step 2 (Overview, Analysis, Goals vs. Non-Goals, Alternatives Weighed, Key Decisions).
6. **Iterate** (`### Step 3`): give the path, highlight two or three objections, ask how to address them, repeat steps 2 to 5 until the concept has survived scrutiny.
7. **Finalize** (`### Step 4`): the user confirms the brief, then chooses one of the four options of the handoff gate.

## Output handoff

Return `concepts_brief` (the path of the brief, the option the user chose at the handoff gate and, when published, the path under `docs/designs/`) as a JSON string. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- When the user chooses to proceed to the design document, that is a step of design-doc, which reads the brief from its file. Ask the coordinator for it (a refined request) when it is not already planned.
- The host guides the original opens first are packaged: `<package_root>/scripts/egm/docs/claude.md`, `docs/codex.md` and `docs/harnesses.md`. Their parts on installing or enabling the upstream plugin, its slash commands, its plugin cache and its registered reviewer types describe that plugin, not this package.
- What leaves the machine, in the source's words: the runtime "does not operate a hosted service, database, analytics client, or telemetry endpoint"; the host processes prompts, files and agent activity under its own account settings.
- Runtime dependencies: a host subagent tool. Git is optional. The source prescribes no installation.

## Checks

- **problem_drilled_before_review**: the problem, consumers, constraints, boundaries and success measure were asked in open chat questions before any review.
- **readiness_confirmed**: no subagent was spawned before the user chose the review option at the readiness gate.
- **lenses_ran_fresh**: every lens ran in a subagent without the conversation history, or is recorded as `not run` after one retry.
- **brief_written_to_file**: the brief is in a file with the five sections, and chat carried its path, not its text.
- **next_step_chosen_by_user**: the handoff gate was presented and the user's option is recorded.

## Sources

- Source: egm (google/elephant-goldfish-model@dea7761de06ce5b51c177ebb9bba0469f24af5a4, release v0.1.1, Apache-2.0) — `skills/egm-brainstorm/SKILL.md`, `agents/synthesizer.md` and the seven lens personas under `agents/`, packaged as `<package_root>/scripts/egm/skills/egm-brainstorm/SKILL.source.md` and `<package_root>/scripts/egm/agents/`.
- AI mapping: egm-brainstorm → docs.idea-brainstorm. Its outcome is a reviewed brief, distinct from a design document (design-doc) and from work-map's spec, which is synthesized without interviewing inside an implementation route.
- Changes for coexistence (ADR-0017):
  - `/egm-brainstorm` and the `/egm:egm-draft` handoff commands are not carried: the coordinator classifies by meaning and the next document is another capability's step (one capability per step).
  - The registered subagent types (`egm-synthesizer`, `egm-zoom-out` and the others) do not exist in this package, which registers no host subagent: the source's own alternative is used, a general-purpose subagent told to read the persona file. The Claude adapters' `omitClaudeMd` and read-only tool list are therefore not enforced by the host; see the gap below.
  - The brief is also handed over as `concepts_brief` through the coordinator; its file, structure and gates stay the source's.
- Gap: without the upstream adapters a reviewer subagent still starts without the conversation history, but it may receive the project's instruction files and is read-only by instruction only. The source's Claude guide says a Claude Code without `omitClaudeMd` support "must not be treated as verified Goldfish isolation environments"; the same limit holds here. Not run live.
- `hooks: []`: the upstream ships no hook at this release (`docs/privacy.md`: it "installs no permission-approval hook").
