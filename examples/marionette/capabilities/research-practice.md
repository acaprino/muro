---
id: research-practice
role: research-guidance
when: —
after: []
outputs: ["research_guidance"]
checks: ["advice_is_operational", "expectation_recorded_before_run", "failures_inspected_before_new_metrics"]
intents: [{"id":"research.planning","description":"Help with the practice of ML/AI research: choosing a problem deliberately, turning an idea into a research plan and a cheap experiment loop, building a reading plan, or setting up a research log with hypothesis, expectation, result and updated belief.","excludes":["Finding or reading specific papers.","Planning the implementation of software that is not a research experiment.","Writing, pitching or promoting the results.","General career or study advice unrelated to doing research."]},{"id":"research.experiment-debugging","description":"Diagnose a model training run or an evaluation that misbehaves or disappoints, through data inspection, simple baselines, small-case validation, sorting failures into piles, and baseline and ablation discipline.","excludes":["A bug in ordinary application code with no model or experiment.","Tuning infrastructure, cost or deployment."]}]
tools: [{"name":"file-access","purpose":"Read the project's code, configs, logs, results and existing research notes; write a plan, checklist or log entry only where the user asks.","required":false},{"name":"shell","purpose":"Inspect outputs and run the small cheap checks the plan calls for, when the user wants them run.","required":false}]
hooks: []
conflicts: []
---

# Research Practice

Turns research-practice principles into concrete behavior for the task in front of the user. Be concrete and operational; no generic motivation.

## Behavior

Shape the answer around the smallest useful subset of these moves:

1. **Pick the problem deliberately.** What outcome should exist, why it matters, what would falsify the direction, and whether the user has a plausible attack.
2. **Upgrade inputs.** Older sources, adjacent fields, primary papers, appendices and direct inspection of artifacts, instead of threads and summaries.
3. **Forecast before running.** Record the expected result, the reason for it and the update rule before the experiment starts.
4. **Tighten the loop.** Shrink the first version until it is cheap: one command to run, one to plot, one config to reproduce, one small case to overfit or validate.
5. **Inspect outputs by hand.** Pull failures or transcripts, sort them into piles, attack the largest pile, and only then ask for new aggregate metrics.
6. **Protect against self-deception.** Keep a log with hypothesis, setup, expectation, result and updated belief; write contrary evidence down immediately.
7. **Tune baselines and ablate.** A gain is provisional until the baselines are strong and the component carrying the result is known.
8. **Distill when useful.** Turn hard-won understanding into clear notes, posts, diagrams or tools when that reduces research debt.

Output by request:

- **Research plan:** a compact checklist with sections for problem, prior art, experiment loop, failure analysis, baseline and ablation plan, logging.
- **Debugging training or evals:** start with data inspection, dumb baselines, single-batch overfit or small-case validation, then failure-pile analysis.
- **Reading plan:** mix old foundations, current primary papers, appendices and adjacent-field material; say how each source changes the user's model of the problem.
- **Research log:** use this template.

```markdown
## YYYY-MM-DD - Experiment Name

Hypothesis:
Setup:
Expectation:
Result:
Updated belief:
Next action:
```

Checklist to apply or hand over:

- Before starting: the problem is chosen, not absorbed from hype; the desired outcome is explicit; a plausible attack and a falsification condition are written; old and adjacent sources were checked.
- Before running: hypothesis, setup, expectation and update rule are logged; the first run is cheap and reproducible; the baseline is strong enough to mean something; a small-case or single-batch validation passed.
- After results: failures were inspected by hand and sorted into piles; the largest pile has a next action; ablations identify what carries the result; the updated belief is written.

## Output handoff

Return `research_guidance` as one JSON string: the plan, checklist, diagnosis or log entry given, and the next concrete action. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- The source skill builds on the essay "How to be good at research" (https://x.com/itsreallyvivek/article/2064686372737454155) and on the texts its `SKILL.md` lists under "Reference Loading" (Hamming, Shannon, Sutton, Feynman, Darwin, Karpathy, Ng and others; it marks the Schulman source as unverified). Those texts belong to their authors and are not packaged. Name the relevant one when attribution matters, and open it on the web when the user wants the original wording; do not quote them from memory as if verified.
- Use the project's own files as evidence when they exist (configs, logs, result tables) before giving advice.
- Run a check only when the user wants it run; otherwise give the exact command or procedure.
- No runtime dependency is installed by this capability.

## Checks

- **advice_is_operational**: each recommendation names a concrete action, artifact or command for this user's problem, not a general principle alone.
- **expectation_recorded_before_run**: for any experiment planned or run here, the expected result and the update rule are written before the result.
- **failures_inspected_before_new_metrics**: for a debugging request, failures or transcripts were looked at and grouped before new aggregate metrics were proposed; when no outputs were available, that is stated.

## Sources

- AI intent mapping: research-bible → research.planning (problem choice, plans, reading plans, logs) and research.experiment-debugging (its training and eval debugging pattern).
- Source: open-paper-skills (pengqianhan/open-paper-skills@f85fd3dc, head) — `skills/research-bible/SKILL.md`, packaged unchanged under `<package_root>/scripts/open-paper-skills/skills/research-bible/`.
- Not packaged: `skills/research-bible/references/**`. They are an essay by another author and copies or stubs of other authors' texts, which the repository's MIT licence does not cover. The workflow, checklist and output patterns above are the skill's own and do not need them.
- Runtime dependency: none.
- Hooks: the selected file defines none.
- Harmonized by: prompts/harmonizer.md — its own role; distinct from `work-map`, which coordinates software work, and from `paper-search`, which retrieves literature.
