---
id: research-practice
role: research-guidance
when: —
after: []
outputs: ["research_guidance"]
checks: ["advice_is_operational", "expectation_recorded_before_run", "failures_inspected_before_new_metrics"]
intent_checks: {"research.planning": ["advice_is_operational", "expectation_recorded_before_run"], "research.experiment-debugging": ["advice_is_operational", "expectation_recorded_before_run", "failures_inspected_before_new_metrics"]}
check_conditions: {"expectation_recorded_before_run": "An experiment is planned or run in this task."}
intents: [{"id":"research.planning","description":"Help with the practice of ML/AI research: choosing a problem deliberately, turning an idea into a research plan and a cheap experiment loop, building a reading plan, or setting up a research log with hypothesis, expectation, result and updated belief.","excludes":["Finding or reading specific papers.","Planning the implementation of software that is not a research experiment.","Writing, pitching or promoting the results.","General career or study advice unrelated to doing research."]},{"id":"research.experiment-debugging","description":"Diagnose a model training run or an evaluation that misbehaves or disappoints, through data inspection, simple baselines, small-case validation, sorting failures into piles, and baseline and ablation discipline.","excludes":["A bug in ordinary application code with no model or experiment.","Tuning infrastructure, cost or deployment."]}]
tools: [{"name":"file-access","purpose":"Read the project's code, configs, logs, results and existing research notes; write a plan, checklist or log entry only where the user asks.","required":false},{"name":"shell","purpose":"Inspect outputs and run the small cheap checks the plan calls for, when the user wants them run.","required":false}]
hooks: []
conflicts: []
---

# Research Practice

Turns the principles of the essay "How to be good at research" into concrete research behavior for the task in front of the user. Be concrete and operational. Avoid generic motivation.

The full version is `<package_root>/scripts/open-paper-skills/skills/research-bible/SKILL.source.md`. It wins where this body differs, except for the changes listed in the Sources section.

## Behavior

1. **Essay first, in three cases.** When the user asks for research advice, a research workflow or a plan inspired by this method, first read the essay at its public address (see `## Specifics`); it is not packaged. If it cannot be opened, say the essay was not read and work from the packaged file.
2. **Choose the moves.** Shape the answer around the smallest useful subset of these eight:
   - Pick the problem deliberately: ask what outcome should exist, why it matters, what would falsify the direction, and whether the user has a plausible attack.
   - Upgrade inputs: older sources, adjacent fields, primary papers, appendices and direct inspection of artifacts, instead of threads or summaries.
   - Forecast before running: the expected result, the reason for it and the update rule are recorded before experiments begin.
   - Tighten the loop: shrink the first version until it is cheap, with one command to run, one to plot, one config to reproduce and one small case to overfit or validate.
   - Inspect outputs by hand: pull failures or transcripts, sort them into piles, attack the largest pile, and only then ask for new aggregate metrics.
   - Protect against self-deception: keep a log with `hypothesis`, `setup`, `expectation`, `result` and `updated belief`, and write contrary evidence down immediately.
   - Tune baselines and ablate: a gain is provisional until the baselines are strong and the component carrying the result is known.
   - Distill publicly when useful: notes, posts, diagrams or tools, when that would reduce research debt.
3. **Give the output its pattern.**
   - Research plan: a compact checklist with sections for problem, prior art, experiment loop, failure analysis, baseline/ablation plan and logging. When writing or auditing a plan, or checking whether an experiment is ready to run or a result is ready to trust, open `## Research Checklist` in the packaged file for its items before starting, before running experiments and after results.
   - Debugging model training or evals: start with data inspection, then dumb baselines, then single-batch overfit or small-case validation, then failure-pile analysis.
   - Reading plan: mix old foundations, current primary papers, appendices and adjacent-field material, and explain why each source changes the user's model of the problem.
   - Research log: use this template.

```markdown
## YYYY-MM-DD - Experiment Name

Hypothesis:
Setup:
Expectation:
Result:
Updated belief:
Next action:
```

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `research_guidance` as one JSON string: the plan, checklist, diagnosis or log entry given, and the next concrete action. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- The essay is "How to be good at research" by vivek, June 11, 2026: https://x.com/itsreallyvivek/article/2064686372737454155. Keep its claims and voice intact when adapting it, and add structure around it rather than rewriting it. Do not turn it into a rewritten essay unless the user asks for a rewrite. When quoting or adapting it, preserve its wording where possible and link the texts used, at the addresses here.
- The essay and the source notes the packaged file lists under `references/` are not packaged: they belong to their authors. Open a note's text only when attribution or deeper context matters:
  - Hamming, "You and Your Research" (important problems, open doors, prepared minds, compounding): https://www.cs.virginia.edu/~robins/YouAndYourResearch.html
  - Schulman, guide to ML research (the outcome-backward framing attributed to him): no stable public original was located; treat the source as unverified.
  - Shannon, "Creative Thinking" (simplification heuristic): http://www1.ece.neu.edu/~naderi/Claude%20Shannon.html
  - Sutton, "The Bitter Lesson" (scaling computation): http://www.incompleteideas.net/Incideas/BitterLesson.html
  - Graham, "Putting Ideas into Words" (writing as a test of thought): https://paulgraham.com/words.html
  - Feynman, "Cargo Cult Science" (self-honesty rule): https://calteches.library.caltech.edu/51/2/CargoCult.htm
  - Darwin, "The Autobiography of Charles Darwin" (writing down contrary evidence): https://darwin-online.org.uk/content/frameset?itemID=F1497&viewtype=text&pageseq=1
  - "Research Debt" (distillation and public explanations): https://distill.pub/2017/research-debt/
  - Karpathy, "A Recipe for Training Neural Networks" (training and debugging recipe): https://karpathy.github.io/2019/04/25/recipe/
  - Ng, "Machine Learning Yearning" (error analysis): https://info.deeplearning.ai/machine-learning-yearning-book
  - Old-but-useful ML lineage: "Adaptive Mixtures of Local Experts" https://doi.org/10.1162/neco.1991.3.1.79, "Long Short-Term Memory" https://doi.org/10.1162/neco.1997.9.8.1735, "Learning Representations by Back-Propagating Errors" https://doi.org/10.1038/323533a0
- No runtime dependency is installed by this capability.

## Checks

- **advice_is_operational**: each recommendation names a concrete action, artifact or command for this user's problem, not a general principle alone.
- **expectation_recorded_before_run**: for any experiment planned or run here, the expected result and the update rule are written before the result.
- **failures_inspected_before_new_metrics**: for a debugging request, failures or transcripts were looked at and grouped before new aggregate metrics were proposed; when no outputs were available, that is stated.

## Sources

- AI intent mapping: research-bible → research.planning (problem choice, plans, reading plans, logs) and research.experiment-debugging (its training and eval debugging pattern).
- Source: open-paper-skills (pengqianhan/open-paper-skills@f85fd3dc, head) — `skills/research-bible/SKILL.md`, packaged unchanged as `<package_root>/scripts/open-paper-skills/skills/research-bible/SKILL.source.md`.
- Not packaged: `skills/research-bible/references/**` (the essay by another author, a copy of "The Bitter Lesson", and the skill author's short source notes on other authors' texts) and `agents/openai.yaml`. The repository's MIT licence does not cover the other authors' texts.
- Changes for coexistence (ADR-0017):
  - The source reads the essay and the notes from local files under `references/` and links those files; here the host reads and links each text at its public address, because the package does not carry other authors' texts and no host can open a file that is not packaged.
  - When the essay cannot be opened the host says it was not read and works from the packaged file; the source has no rule for a case that only arises once the essay is remote.
  - The source's frontmatter triggers and `agents/openai.yaml` are not applied: they would activate the original as a skill beside the coordinator, which classifies by meaning.
- Runtime dependency: none.
- Hooks: the selected file defines none.
- Harmonized by: prompts/harmonizer.md — its own role; distinct from `work-map`, which coordinates software work, and from `paper-search`, which retrieves literature.
