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

Turns the principles of the essay "How to be good at research" into concrete research behavior for the task in front of the user. Be concrete and operational. Avoid generic motivation.

## Behavior

0. **Read the original first.** Read `<package_root>/scripts/open-paper-skills/skills/research-bible/SKILL.source.md` whole before working. It is the method in the source's own words. Where this body and that file differ, the file wins, except for the changes listed in the Sources section below under "Changes for coexistence". The source's first step is: "Read `references/how_to_be_good_at_research.md` first when the user asks for research advice, a research workflow, or a plan inspired by this skill." That essay is not packaged (see `## Specifics`): read it first at its public address in those same cases. When it cannot be opened, say that the essay was not read and work from `SKILL.source.md`.

When helping with a research task, shape the answer around the smallest useful subset of these moves:

1. Pick the problem deliberately. Ask what outcome should exist, why it matters, what would falsify the direction, and whether the user has a plausible attack.
2. Upgrade inputs. Suggest older sources, adjacent fields, primary papers, appendices, and direct artifact inspection instead of relying on threads or summaries.
3. Forecast before running. Record the expected result, the reason for that expectation, and the update rule before experiments begin.
4. Tighten the loop. Reduce the first version until it is cheap: one command to run, one command to plot, one config to reproduce, one small case to overfit or validate.
5. Inspect outputs by hand. Pull failures or transcripts, sort them into piles, attack the largest pile, and only then ask for new aggregate metrics.
6. Protect against self-deception. Keep a log with `hypothesis`, `setup`, `expectation`, `result`, and `updated belief`; write down contrary evidence immediately.
7. Tune baselines and ablate. Treat gains as provisional until baselines are strong and the component carrying the result is known.
8. Distill publicly when useful. Turn hard-won understanding into clear notes, posts, diagrams, or tools when that would reduce research debt.

Output patterns:

- For a research plan, produce a compact checklist with sections for problem, prior art, experiment loop, failure analysis, baseline/ablation plan, and logging.
- For debugging model training or evals, start with data inspection, dumb baselines, single-batch overfit or small-case validation, then failure-pile analysis.
- For reading plans, mix old foundations, current primary papers, appendices, and adjacent-field material. Explain why each source changes the user's model of the problem.
- For research logs, use this template:

```markdown
## YYYY-MM-DD - Experiment Name

Hypothesis:
Setup:
Expectation:
Result:
Updated belief:
Next action:
```

Research checklist:

- Before starting:
  - Problem is chosen deliberately, not absorbed from hype.
  - Desired outcome is explicit.
  - Plausible attack and falsification condition are written down.
  - Old and adjacent-field sources have been checked.
- Before running experiments:
  - Hypothesis, setup, expectation, and update rule are logged.
  - First run is cheap and reproducible.
  - Baseline is strong enough to be meaningful.
  - Small-case or single-batch validation has passed.
- After results:
  - Failures or transcripts were inspected by hand.
  - Errors were sorted into piles.
  - The largest pile has a concrete next action.
  - Ablations identify which component carries the result.
  - Updated belief is written down.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `research_guidance` as one JSON string: the plan, checklist, diagnosis or log entry given, and the next concrete action. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- The essay and the source notes that `SKILL.source.md` names under `references/` are not packaged: the essay and the texts the notes point to belong to their authors. The essay is "How to be good at research" by vivek, June 11, 2026, https://x.com/itsreallyvivek/article/2064686372737454155. About it the source says: "Keep the original essay's claims and voice intact when adapting it; prefer adding structure around it rather than rewriting it." and "Do not turn `how_to_be_good_at_research.md` into a rewritten essay unless the user asks for a rewrite. If quoting or adapting the essay, preserve wording where possible and add links to the local reference files." Here the links go to the public addresses below, since the local files are absent.
- The source says: "Load source notes only when attribution or deeper context matters". Each note's own `Source:` line gives where its text lives:
  - Hamming, "You and Your Research" (important problems, open doors, prepared minds, compounding): https://www.cs.virginia.edu/~robins/YouAndYourResearch.html
  - Schulman, guide to ML research (the attributed outcome-backward research framing): "Not confidently located as a stable public original during this pass." The source says: "treat its source as unverified until replaced".
  - Shannon, "Creative Thinking" (simplification heuristic): http://www1.ece.neu.edu/~naderi/Claude%20Shannon.html
  - Sutton, "The Bitter Lesson" (scaling-computation argument): http://www.incompleteideas.net/Incideas/BitterLesson.html
  - Graham, "Putting Ideas into Words" (writing as a test of thought): https://paulgraham.com/words.html
  - Feynman, "Cargo Cult Science" (self-honesty rule): https://calteches.library.caltech.edu/51/2/CargoCult.htm
  - Darwin, "The Autobiography of Charles Darwin" (writing down contrary evidence): https://darwin-online.org.uk/content/frameset?itemID=F1497&viewtype=text&pageseq=1
  - "Research Debt" (research distillation and public explanations): https://distill.pub/2017/research-debt/
  - Karpathy, "A Recipe for Training Neural Networks" (training/debugging recipe): https://karpathy.github.io/2019/04/25/recipe/
  - Ng, "Machine Learning Yearning" (error analysis): https://info.deeplearning.ai/machine-learning-yearning-book
  - Old-but-useful ML lineage examples: "Adaptive Mixtures of Local Experts" https://doi.org/10.1162/neco.1991.3.1.79, "Long Short-Term Memory" https://doi.org/10.1162/neco.1997.9.8.1735, "Learning Representations by Back-Propagating Errors" https://doi.org/10.1038/323533a0
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
  - The source reads `references/how_to_be_good_at_research.md` and the notes under `references/` from local files. The package does not carry them (licence: other authors' texts), so step 0 and `## Specifics` send the host to each text's public address, and "add links to the local reference files" becomes links to those addresses. No supported host can open a file that is not packaged.
  - When the essay cannot be opened, the host says so and works from `SKILL.source.md`. The source has no rule for this case; it is added so an unread essay is not presented as read.
  - The source's frontmatter (`name`, `description` with its "Use this skill when" triggers) and `agents/openai.yaml` are not applied: they register and trigger the original as a skill, and the coordinator classifies by meaning.
- Runtime dependency: none.
- Hooks: the selected file defines none.
- Harmonized by: prompts/harmonizer.md — its own role; distinct from `work-map`, which coordinates software work, and from `paper-search`, which retrieves literature.
