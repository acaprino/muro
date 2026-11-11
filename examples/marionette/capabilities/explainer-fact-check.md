---
id: explainer-fact-check
role: claim-verification
when: —
after: []
outputs: ["verification_report", "verification_verdict"]
checks: ["every_claim_has_a_verdict", "evidence_opened_this_session", "verdict_matches_rows"]
intents: [{"id":"explainer.fact-check","description":"Audit an explainer or article that already exists against its sources, claim by claim, or against the real code when it explains a codebase, and report what is supported, unsupported or contradicted with the concrete fix for each.","excludes":["Writing a new explainer: its authoring step already contains this gate.","Proofreading, style or grammar review.","A pure opinion piece that makes no factual claim.","Verifying claims in a slide deck, Office document or web page that is not an explainer or article."]}]
tools: [{"name":"file-access","purpose":"Read the article and its local sources or the repository it explains. The article is changed only when the user accepts the fixes.","required":true},{"name":"web-research","purpose":"Open the cited web sources to read the passage behind each claim. Requests leave the machine.","required":false}]
hooks: []
conflicts: []
---

# Explainer Fact-Check

No explainer ships with an unverified factual claim. Every checkable claim is supported by a source you opened, corrected to match it, or cut.

## Behavior

1. **Extract** every checkable claim with its location (section, figure caption, or `path:line`): numbers, dates, names and attributions, direct quotes, order of events, benchmarks, and mechanism claims ("X uses Y", "X is faster because Z"). Labelled opinion, analogies and transitions are not claims. When unsure, treat it as a claim.
2. **Find the support.** Open the cited source and read the passage. For a codebase explainer open the real file at the exact path and line; names and comments are not evidence. A citation that exists is not support.
3. **Assign a verdict:** `supported` (a passage directly backs it), `needs-source` (plausible, no citation), `unsupported` (nothing backs it), `contradicted` (a source says otherwise).
4. **Report** one table row per claim: claim quoted, location, verdict, source or evidence with the quoted passage or code, severity (`high` for a numeric, named, dated or mechanism error; `low` otherwise) and the recommended fix. Then one line: `PASS` only if every row is `supported`, else `FAIL` with counts per verdict. The format is in `<package_root>/scripts/explain-this/skills/fact-checking-explainers/references/verification-report-format.md`.
5. **Offer the fixes.** Present the report and offer to apply them: add the supporting passage, correct the claim, soften it to labelled interpretation, or cut it. After the user accepts, apply them and re-check only the changed claims.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `verification_report` (the table) and `verification_verdict` (the PASS or FAIL line, and whether fixes were applied) as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- "Verify" means opening the source in this session. Memory, plausibility and "well known" are reasons to check, not to skip.
- Numbers, dates and names are exact or wrong. "Roughly" attached to a specific figure is a red flag.
- When sources disagree, the disagreement belongs in the article.
- A caveat does not make an unsupported factual claim deliverable.
- A source that cannot be opened (no web access, missing file) leaves its claims `needs-source`; say which ones.
- No runtime dependency is installed by this capability.

## Checks

- **every_claim_has_a_verdict**: each checkable claim in the article has one row and one of the four verdicts.
- **evidence_opened_this_session**: every `supported` row quotes the passage or code that was actually read.
- **verdict_matches_rows**: the final line is `PASS` only when all rows are `supported`; otherwise `FAIL` with the counts.

## Sources

- AI intent mapping: fact-checking-explainers → explainer.fact-check (its "on request" use). Its research-time and post-draft gates are steps of `interactive-explainer`.
- Source: explain-this (analyticalmonk/explain-this@f64dab45, plugin 0.1.1) — `skills/fact-checking-explainers/SKILL.md` and `references/verification-report-format.md`.
- Runtime dependency: none.
- Hooks: the selected files and both plugin manifests define none; `docs/**` and `evals/**` were not inspected for hooks.
- Harmonized by: prompts/harmonizer.md — kept as its own role with its own outputs; no prerequisite, because an existing article can be checked without authoring it here.
