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

No explainer ships with an unverified factual claim: every checkable claim traces to a source that supports it, is corrected to match the source, or is cut. The packaged original, `<package_root>/scripts/explain-this/skills/fact-checking-explainers/SKILL.source.md`, is the full version of this procedure: open the section a step names when the task needs it, and where this body differs the original wins, except for the changes listed in the Sources section.

## Behavior

1. **Extract** every checkable claim with its location (section, figure caption, or `file:line` for code). Checkable: numbers, dates, measurements, percentages; names, attributions, who did or built what; direct quotes; historical events and their order; performance results and benchmarks; mechanism claims ("X uses Y", "X causes Y", "X is faster than Y because Z"). Not flagged: clearly-labeled interpretation or opinion, analogies and illustrative scenarios the reader knows are illustrative, the author's framing and transitions. When unsure, treat it as checkable and verify it.
2. **Find the support.** For each claim, locate the passage in the cited source that backs it and read it; for a codebase explainer, open the actual code at the exact path and line. A citation existing is not support, and for code a name or a comment is not evidence: read the implementation. The original's "Red Flags" and "Rationalization Table" list the thoughts that mean stop and verify: open them when a claim seems too obvious to check.
3. **Assign a verdict:** `supported` (a source passage directly backs the claim), `needs-source` (plausible but no citation yet), `unsupported` (no source backs it) or `contradicted` (a source says otherwise). Only `supported` is allowed at delivery.
4. **Report** in the format of `<package_root>/scripts/explain-this/skills/fact-checking-explainers/references/verification-report-format.md` (open it for the column notes): one table row per checkable claim with the columns `#`, Claim (quoted), Location, Verdict, Source / evidence, Severity, Recommended fix. Severity is `high` for a numeric, named, dated or mechanism error a reader could act on or repeat, `low` for a minor imprecision that does not change the reader's understanding. After the table, one line: `PASS` only if every row is `supported`; otherwise `FAIL` with a count of unresolved rows by verdict, for example `FAIL - 1 contradicted, 2 unsupported, 1 needs-source`.
5. **Offer the fixes.** Present the report to the user and offer to apply the fixes: add support from a source passage, correct the claim to what the source actually says, soften to clearly-labeled interpretation only if the statement is genuinely interpretive rather than factual, or cut it. After the user accepts, apply them and re-run on the changed claims.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `verification_report` (the table) and `verification_verdict` (the PASS or FAIL line, and whether fixes were applied) as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Verifying means checking an actual source in this session. Memory, plausibility, background knowledge and deadline pressure are signals to run the loop, not reasons to skip it.
- Numbers, dates and names are exact or they are wrong; "roughly" or "about" attached to a specific number is a signal to re-open the source.
- If sources disagree, the disagreement belongs in the article.
- An unresolved `needs-source`, `unsupported` or `contradicted` claim keeps the report at FAIL; a caveat does not make an unsupported factual claim deliverable.
- A source that cannot be opened (no web access, missing file) leaves its claims `needs-source`; say which ones.
- No runtime dependency is installed by this capability.

## Checks

- **every_claim_has_a_verdict**: each checkable claim in the article has one row and one of the four verdicts.
- **evidence_opened_this_session**: every `supported` row quotes the passage or code that was actually read.
- **verdict_matches_rows**: the final line is `PASS` only when all rows are `supported`; otherwise `FAIL` with the counts.

## Sources

- AI intent mapping: fact-checking-explainers → explainer.fact-check (its "on request" use). Its research-time and post-draft gates are steps of `interactive-explainer`.
- Source: explain-this (analyticalmonk/explain-this@f64dab45, plugin 0.1.1) — `skills/fact-checking-explainers/SKILL.md` (packaged as `SKILL.source.md`) and `references/verification-report-format.md`, packaged unchanged under `<package_root>/scripts/explain-this/skills/fact-checking-explainers/`.
- Changes for coexistence (ADR-0017):
  - The original's frontmatter triggers and "When to Use" list are not followed: routing is the coordinator's, by meaning, from this capability's intent.
  - Only the original's "On request" use is applied here; "The Two Gates" and the "As a gate" report rule are steps 2 and 7 of `interactive-explainer` (one capability per step).
  - The original's process step 4 "Resolve" comes after the report and on the user's acceptance (step 5 here): the original's own direct-request rule, and the article is the user's.
  - The report and its verdict line are also returned as `verification_report` and `verification_verdict`: output handoff is the coordinator's.
  - Added "A source that cannot be opened ... leaves its claims `needs-source`; say which ones": `web-research` is optional, and a claim whose source was not opened must not be reported `supported`.
- Runtime dependency: none.
- Hooks: the selected files and both plugin manifests define none; `docs/**` and `evals/**` were not inspected for hooks.
- Harmonized by: prompts/harmonizer.md — kept as its own role with its own outputs; no prerequisite, because an existing article can be checked without authoring it here.
