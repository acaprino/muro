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

"NO EXPLAINER SHIPS WITH AN UNVERIFIED FACTUAL CLAIM." "Every checkable claim either traces to a source that supports it, gets corrected to match the source, or gets cut."

## Behavior

0. **Read the originals first.** The method is the source's, in its own words, in two packaged files. Read both whole before working: `<package_root>/scripts/explain-this/skills/fact-checking-explainers/SKILL.source.md` and `<package_root>/scripts/explain-this/skills/fact-checking-explainers/references/verification-report-format.md`. The steps below are an index into them. Where this body and an original differ, the original wins, except for the changes listed in the "Changes for coexistence" bullet of the Sources section.
1. **Extract** "every checkable claim, with its location in the article (section, figure caption, or `file:line` for code)." What counts is the list in "What Counts as a Checkable Claim": "numbers, dates, measurements, percentages", "names, attributions, who-did-what, who-built-what", "direct quotes", "historical events and their order", "performance results and benchmarks", and mechanism claims ("X uses Y", "X causes Y", "X is faster than Y because Z"). Clearly-labeled interpretation or opinion, analogies and illustrative scenarios, and the author's framing and transitions are not flagged. Heuristic: "if you are unsure whether something is a checkable claim, treat it as one and verify it."
2. **Find the support.** "For each claim, locate the passage in the cited source that backs it, and read that passage. For codebase explainers, open the actual code at the exact path and line. Do not treat the existence of a citation as support; a cited source often does not say what the draft claims." For code, "Names and comments can lie; the code does not."
3. **Assign a verdict:** `supported` ("A source passage directly backs the claim"), `needs-source` ("Plausible but no citation yet"), `unsupported` ("No source backs it"), `contradicted` ("A source says otherwise"). Only `supported` is allowed at delivery.
4. **Report** in the format of `<package_root>/scripts/explain-this/skills/fact-checking-explainers/references/verification-report-format.md`: one table row per checkable claim with the columns `#`, Claim (quoted), Location, Verdict, Source / evidence, Severity, Recommended fix. Severity is "`high` for a numeric, named, dated, or mechanism error a reader could act on or repeat; `low` for a minor imprecision that does not change the reader's understanding." After the table, one line: "`PASS` only if every row is `supported`.", or "`FAIL` otherwise, with a count of unresolved rows by verdict, for example: `FAIL - 1 contradicted, 2 unsupported, 1 needs-source`."
5. **Offer the fixes.** "On direct request: present the report to the user and offer to apply the fixes." The fixes are the source's resolution loop: add support from a source passage, correct the claim to match what the source actually says, soften to clearly-labeled interpretation "if the statement is genuinely interpretive rather than factual", or cut it. After the user accepts, apply them, "then re-run on the changed claims."

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `verification_report` (the table) and `verification_verdict` (the PASS or FAIL line, and whether fixes were applied) as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- "Treat memory, plausibility, background knowledge, and deadline pressure as signals to run the loop, not reasons to skip it. "Verify" means checking an actual source in this session."
- "Numbers, dates, and names are exact or they are wrong." The original's "Red Flags" list, with "roughly..." attached to a specific number, applies whole.
- "If sources disagree, that disagreement belongs in the article, not buried."
- "An unresolved `needs-source`, `unsupported`, or `contradicted` claim keeps the report at FAIL. Caveats do not make unsupported factual claims deliverable."
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
  - The original's frontmatter (`name`, `description`, trigger phrases) and its "When to Use" list are not followed: they register and route the original as a skill, and the coordinator classifies by meaning from this capability's intent.
  - This capability is the original's "On request" use only. "The Two Gates", "When invoked as a gate by another skill, return the report inline and hold delivery until PASS" and "As a gate (called by `creating-explainers` or `explaining-codebases`)" are not applied here: those gates are steps 2 and 7 of `interactive-explainer`, one capability per step.
  - Step 4 "Resolve" of the original's process is carried as step 5 here, after the report and on the user's acceptance: that is the original's own direct-request rule ("present the report and offer to apply the fixes"), and the article belongs to the user.
  - The report and its verdict line are also returned as `verification_report` and `verification_verdict` through the coordinator: output handoff is the coordinator's.
  - Added rule "A source that cannot be opened (no web access, missing file) leaves its claims `needs-source`; say which ones": `web-research` is an optional tool, so on a host without it the original's "open the source" step cannot run, and such a claim must not be reported `supported`.
- Runtime dependency: none.
- Hooks: the selected files and both plugin manifests define none; `docs/**` and `evals/**` were not inspected for hooks.
- Harmonized by: prompts/harmonizer.md — kept as its own role with its own outputs; no prerequisite, because an existing article can be checked without authoring it here.
