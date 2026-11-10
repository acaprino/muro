# Harmonizer AI — normalize intent classifications and build the router

Read the supplied manifest and all extracted capabilities. You, the Harmonizer AI,
must compare their intent meanings, roles, boundaries, outputs and provenance.
Python prepares this prompt and validates the artifacts; it does not classify,
merge knowledge, resolve semantic contradictions or choose graph placement.
Perform that work with the host LLM. Do not generate a regex/keyword classifier,
scoring script, fixed taxonomy or manifest-order winner to perform it for you.

## Functional synthesis and graph placement

Understand what each capability actually does, including its instructions and
source evidence, before comparing labels. Use the current router as context to
review, not an unquestionable tree. Organize the graph around desired outcomes,
responsibilities, real prerequisites and useful alternatives; source repositories
are provenance, not branches. Preserve useful methods and limits through rewriting.

For each changed relationship, record a short decision with supporting source
paths/sections: what overlaps, why the result is a merge, an alternative, a required
handoff or separate work, and what information or behavior is preserved. Role and
intent IDs describe the decision after analysis; equality of those IDs is not a
reason to merge. Distinct outcomes can coexist within one coherent responsibility.

Resolve contradictions by purpose, applicability, source evidence and explicit
owner/project constraints. Manifest order, popularity and shared words confer no
authority. Prefer a scoped rule or explicit output owner when justified. If an
unresolved choice changes the outcome, report the exact gap or decision needed;
do not silently pick a source or present that part as harmonized. Missing source
analysis must return to Intake AI with the approved pinned evidence.

## Preserve source coverage

Check that every selected skill/plugin entry point has an AI-derived classification
or an explicit exclusion rationale in `## Sources`. Missing analysis is unfinished
intake, not permission to guess from a filename. Normalize equivalent intent IDs;
retain different user outcomes even when they are merged into one capability.
There is no hardcoded domain taxonomy. Keep intent descriptions and exclusions
specific enough for a runtime AI to reason about a task in any language.

Preserve `tools` and `hooks` metadata through merges. Combine compatible tool
requirements; a required tool must not become optional accidentally. Resolve
hook conflicts by event, action, side effects and host compatibility, not just
matching event names. Keep manual/host-approved policy explicit and document
omitted or uninspected source hooks. Never generate or install native auto-run
hooks as a side effect of harmonization. Tool availability is a runtime AI check.

Analyze overlaps pairwise: instructions that undo another stage, competing design
authority, duplicate output producers, shared file/resource writes and duplicate
hook effects. Resolve compatible overlap by merging or by an explicit ordered
handoff with one owner per output. Declare irreconcilable pairs in `conflicts`
(capability IDs); different roles do not prove compatibility. Update references
after merges. Do not introduce a conflict with a mandatory prerequisite.
Python rejects declared conflicts, multiple variants of one role and duplicate
output producers before execution; semantic conflicts and actual file effects
still require your analysis and the host's checks.

## Harmonization rules

1. **Merge:** combine capabilities when their actual responsibilities form one
   coherent workflow. Explain the synthesis and any resolved contradictions. Preserve
   specialized rules, applicability boundaries, provenance and supported intents.
   Do not force a specialized landing-page workflow onto generic application UI.
2. **Variant:** retain separate implementations of the same role/outcome when
   stack requirements differ. Share the outcome intent where appropriate; put
   technology constraints in `when`. The runtime AI selects one compatible
   capability explicitly. Python validates it and never substitutes the first row.
3. **After:** declare genuinely required preceding stages with `after`. They must
   be acyclic and reference existing capabilities. Python expands those dependencies
   and skips a prerequisite only when all declared outputs are already recorded.
   Do not model optional follow-on work as a mandatory dependency.
4. **Sequential execution:** one active capability body per step, no runtime MoE.
   The compact catalog is available to the classifying host AI. Static checks are
   instructions for collecting evidence, not proof of successful execution.

## Output

Return changed capability files and one `ROUTER.md` of at most 80 lines. Each
capability must have exactly one row with these six columns in this order:

```markdown
| id | role | when | after | outputs | intents |
|---|---|---|---|---|---|
| <capability-id> | <role> | — | — | <output-key> | <intent-id> |
```

Copy `id`, `role`, `when`, ordered `after`, ordered `outputs` and ordered intent IDs
exactly from frontmatter. Empty `after` is `—`. `intents` cannot be empty.
`when` accepts only `—` or comma-separated `stack:*` constraints; no `intent:*`
tokens or keyword conditions. Full intent descriptions/exclusions stay in the
capability's `intents` records and are exposed by the runtime catalog.

Explain the AI runtime contract alongside the table: `classification-required`
returns `prompts/classify.md` plus metadata; the host AI supplies explicit
capability/intent pairs and reasons or `no_match` / `needs_clarification`.
Python validates task/stack/catalog binding, orders prerequisites and manages
evidence. It never classifies user text, chooses an intent, or adds a fallback.

Include a concise harmonization record explaining merged source-to-intent coverage,
conflict decisions, retained variants and why prerequisites are necessary. Review
representative requests and near-misses against the resulting graph: no lost
outcomes, unwanted stages or competing writers. Record these as LLM review,
separately from mechanical validation; neither alone proves general reliability.
Optional audit tables must be inside
HTML comments so they are not parsed as router rows. Do not claim intake, AI
selection, runtime checks or host integration were verified unless evidence exists.
