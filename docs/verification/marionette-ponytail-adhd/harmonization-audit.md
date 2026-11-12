# Marionette: Ponytail + i-have-adhd harmonization audit

2026-11-12. Read-only review of the existing 26-capability catalog, ROUTER.md,
entries.json and delivery.json. Engineering/design/motion catalog read directly;
Office/research/explainer review delegated to catalog_research_office and checked
against its cited clauses. Exact upstream intake is provided separately by the
source_intake and prompt_only_audit agents. No production files changed by this
audit. Line references identify the pre-integration snapshot.

## Recommendation and policy comparison

Use a short, neutral permanent working/communication policy; preserve requested
engineering procedures as discoverable capabilities. Scope is established before
minimization. Concision applies to conversation, never the completeness of the
requested result. Root's proposed principles match the catalog if they expressly
preserve required engines, formats, recorded design fidelity, full deliverables,
scientific evidence, meaningful checks, honest limitations and user-owned
approval gates. Reuse approvals already given. Flexible paragraphs/lists and a
next action only when work remains avoid imposing a rigid every-turn template.

The source's original diagnosis/persona, compulsory ending, fixed list/step
limits and ungrounded estimates do not belong in the general policy. Actual
uncertainty must survive compression. A stated concise preference is not
authority to skip authorized work, optional output is not silently added, and
the user's requested detailed explanation wins over the default.

## Ownership and procedure placement

- work-map remains the implementation/spec/slicing owner. Ponytail's code method
  enriches its build/review step. It must not force a direct clear change through
  a planning map (work-map.md:7,20-24). Preserve destination, testing seams,
  slice approval and HITL decisions (25-46); reuse existing answers/approvals.
- engineering-review owns report-only change review and whole-repository audit,
  with distinct intents engineering.change-review and engineering.codebase-audit.
  Its outputs code_review_findings/code_review_coverage avoid design-review's
  existing review_findings/review_fixes. No automatic extra review step.
- engineering-debt owns a requested shortcut ledger, distinct from session state
  and measured command costs. Preserve custom/legacy markers, concrete ceilings,
  upgrade triggers, no-trigger tags and optional blame. Persist only on request.
- engineering-guidance explains the method and published benchmark evidence,
  with intents engineering.working-guidance/engineering.benchmark-evidence.
  It may explain lite/full/ultra as request-scoped preferences, but must not claim
  upstream off/default/session flags can disable a fixed package policy.
- ADHD continuity is context/goal/decision/open-work awareness. session-handoff
  still owns requested HANDOFF.md artifacts and optional agreed startup reads;
  no automatic file creation follows from the new general policy.
- token-economy stays separate: actual tool output is verbatim
  (token-economy.md:24-29), while apply/restore/configuration/migration and six
  hook activations require explicit requests and disclosure (26-36,55-58).
  A general brevity policy does not grant any of those mutations.

## Constraints that minimality must preserve

| Area | Existing evidence and required result |
|---|---|
| Design authority | visual-direction.md:43-47 preserves approved palette/type/layout, one owner and required visual richness. Existing brand overrides generic aesthetic defaults. |
| Alternatives and flows | aesthetic-direction, wireframe and design-options retain their requested/required distinct alternatives and user choices. ui-prototype retains validation/error/loading/success/focus/persistence, not only happy path. |
| Actual design evidence | figma-design.md:21-27 requires real integration, bound foundations, full states and screenshots. design-system-extract preserves exact source values, full component inventory and honest approximate measures. |
| Motion engines | gsap-scrolltrigger.md:42-47 uses/installs selected GSAP; dependency minimization cannot substitute CSS. css-scroll applies only to the explicit CSS-only variant, with supported fallback/reduced motion. |
| Motion ownership | design-review.md:40 preserves recorded motion-spec timing; motion-principles preserves purpose/trigger/reduced-motion and no motion-only meaning. |
| Office engines | office-authoring.md:20, office-deck.md:20 and office-files.md:20 require GenOffice, no substituted or simulated output. |
| Figure engines | paper-figure.md:25-31,40-41 preserves matplotlib/drawio, its renderer and editable/script sources; all data/entities/labels remain. |
| Artifact format | interactive-explainer.md:28 requires 80-180-word prose paragraphs without body bullets. Chat list preferences cannot override artifact prose. html-deck preserves requested content/count and presentation behavior. |
| Evidence completeness | research-pitch.md:23-33 classifies all material claims, gates public copy and returns the complete claim ledger; explainer-fact-check.md:20-24 requires one row per checkable claim and PASS only when all supported. |
| Honest verification | office-authoring.md:27-28,47-50 and office-deck.md:24-26,45-48 require real checks/render and unavailable inspection marked untested; office-files.md:29-30,40-54 preserves loss/partial batch/formula disclosures. |
| User-controlled state | paper-wiki.md:23,32,41,52 protects notes/metadata/status, with evidence-supported merges; paper-search.md:21,26,44 keeps disabled sources disabled. |
| Existing approvals | interactive-explainer.md:26 outline approval; explainer-fact-check.md:24 fixes accepted; research-pitch.md:41-42 no sending/publishing or unnamed file edits; research-practice.md:63 checks only when requested. |

The prior design-system-prompt delivery decision remains valid: its global
designer identity, secrecy and silence rules stay dropped. Scope any wording
such as 'no always-on text is declared' to that source so the record does not
falsely describe the newly combined package.

## Final policy and proposed procedure review

Reviewed root's combined-policy.md after the draft above: it preserves scope
before minimization, required engines/formats/fidelity/full deliverables/evidence,
approval gates and honest uncertainty. It gives a small next action only when
work remains for the user and invents no diagnosis or rigid response template.
No blocking conflict. Optional wording improvement sent to root: replace
'Avoid speculative features, wrappers and abstractions' with 'Avoid speculative
features and unnecessary wrappers or abstractions' to avoid treating every
wrapper as forbidden.

Reviewed all three complete proposed-capabilities bodies after source intake:
engineering-review, engineering-debt and engineering-guidance. The review/audit
merge preserves connected-flow inspection, concrete failure evidence, priority,
report-only behavior and scope distinction. The audit's 20 findings is a display
default with omissions disclosed and material risks/full requested findings
preserved. Debt remains a real-comment, ignore-aware, optional-blame report with
requested persistence. Guidance preserves the source experiment's sample,
disabled shell and hidden-check limits, forbids counterfactual savings and does
not promise missing persistent mode controls. No blocking placement conflict.

## Regression implementation evidence

Owned only tests/test_ponytail_intake.py, tests/test_i_have_adhd_intake.py,
the exact source map in tests/test_pin_modes.py and the blanket no-hooks
assertion portion of tests/test_tokeneconomizer_intake.py. Existing unrelated
changes in those last two files were preserved.

Red run before root's production integration:

```
python -m pytest -q tests/test_ponytail_intake.py tests/test_i_have_adhd_intake.py tests/test_pin_modes.py::test_manifest_declares_a_mode_for_every_source --tb=short
14 failed, 5 passed in 7.39s
```

Failures were the missing source entries, new capabilities, delivery/policy,
authored coverage and exact pin-map entries. Existing-owner and no-match
fixtures passed. No network or live host session was used. One draft-only
assertion was subsequently improved to check declared intent IDs in provenance
instead of requiring a particular 'AI mapping' wording.

First integrated targeted pass (targeted-tests.log):

```
python -m pytest -q tests/test_ponytail_intake.py tests/test_i_have_adhd_intake.py tests/test_pin_modes.py tests/test_ai_routing.py tests/test_reharmonization.py tests/test_discovery_entries.py tests/test_audit_host.py tests/test_audit_p1.py tests/test_lessons.py --tb=short
9 failed, 131 passed in 78.45s
```

One failure was the new test's ASCII-hyphen expectation: the actual no-constraint
sentinel is U+2014, corrected in the test. Six failures were existing file://
Git remote fixtures; local repo_path versions passed. Two production integration
limits were reported to root: the now-exact 80-text-line router leaves no blank
line headroom for the duplicate-role fixture; focused inline plan size grew to
20,453 bytes versus the existing 20,000-byte budget. These must be fixed by
reducing router/catalog text, not weakening the bounds.

The corrected source-specific suites and source pin map passed independently:

```
python -m pytest -q tests/test_ponytail_intake.py tests/test_i_have_adhd_intake.py tests/test_pin_modes.py::test_manifest_declares_a_mode_for_every_source --tb=short
19 passed in 8.03s
```

Full output: source-tests-green.log. Catalog validation also passed:

```
python muro_build.py --manifest examples/marionette/sources.json --validate
OK: capabilities and ROUTER.md valid
```

Output: targeted-validation.log. New source tests also assert intake-only
selection: Ponytail's seven instruction originals are not runtime helpers, its
benchmark remains a runtime reference, and both ADHD files are intake-only.

Final work-map review additionally caught a legacy sentence prohibiting runtime
dependency installation. The source agent clarified that the method has no
fixed dependency while authorized implementation dependencies follow the
package's install rule; that preserves ADR-0007 and required engines.

## Exact regression-test update inventory

| File and pre-integration line | Requirement |
|---|---|
| tests/test_pin_modes.py:121-138 | Exact source map gains ponytail release v5.3.3 and i-have-adhd release v0.4.1. |
| tests/test_audit_host.py:67 | Exact 26-capability assertion changes with catalog growth. Preserve focused-context size test rather than blindly raising its bound. |
| tests/test_audit_p1.py:212-213 | Exact 26-capability assertion/comment changes. |
| tests/test_lessons.py:205,211 | Exact 26 rows and 66 after adding 40 changes, preferably relative to original count. |
| tests/test_tokeneconomizer_intake.py:103-105 | Replace blanket no-hooks assertion with source-specific absence of TokenEconomizer active wiring/dispatch; native policy hooks are legitimate. |
| tests/test_ai_routing.py:55 | All after lists empty; no new dependency needed merely because source methods overlap. |
| tests/test_reharmonization.py:87 | Same no-automatic-prerequisite invariant. |
| tests/test_delivery.py:113-118 | Dynamic source decision coverage should pass unchanged. |
| tests/test_discovery_entries.py:58-64 | Dynamic coverage requires new capabilities in authored entries. |
| tests/test_claude_design_intake.py:111-113,131-143,239-270 | Preserve unique design outputs and source-scoped no always-on/hook decision; it already does not forbid another source's policy. |
| tests/test_explain_this_intake.py:95; tests/test_genoffice_intake.py:98 | Preserve output ownership; new engineering outputs must not collide. |

No exact global discovery-entry count found. Other source-specific pin tests
look up their own source and need not change. Add independent source-specific
Ponytail/i-have-adhd suites without hardcoded global counts. Runtime fixtures
must remain explicit host-AI decisions, not string-based classification logic.

Useful authored evals: direct code change without forced planning; requested
report-only review without edits; debt without persistence; benchmark evidence
without invented per-repository savings; concise chat with complete workbook;
complete explainer prose and claim gate; figure with all data/editable sources;
wiki reingestion retaining notes/status; disabled paper source remaining unused.

## Proposed combined wording (1,749 characters)

Complete the requested work, including its affected scope and required deliverables. Use supplied context and settled decisions; ask only for missing information that blocks a sound result, and continue independent authorized work. Carry out actions within your tools and authority instead of merely telling the user how.

Keep conversation concise, direct and easy to scan. Lead with the result or useful action; use short paragraphs or numbered steps when they help. Group long lists without dropping items. Adapt to the user's expertise and requested depth. Avoid filler, repeated instructions, unnecessary tangents, imposed status templates and invented time estimates. Keep track of the goal, decisions, progress and open work; offer one clear next action only when work remains for the user. Describe errors neutrally and give the recovery step. Do not infer a diagnosis or personal traits.

Brevity never reduces requested scope, artifact completeness, design fidelity, named engines, evidence, accessibility, security, validation, checks or honest disclosures. Follow each task's required format and approval gates; reuse approval already given. Preserve uncertainty and distinguish verified results from assumptions and untested work.

For code changes, inspect the full affected path, including callers, tests, configuration and exports. Fix the shared root cause with the smallest readable change. Reuse project patterns and suitable existing tools before adding abstraction or dependencies, while preserving required engines and behavior. Test meaningful changed behavior and report what was checked. If a deliberate shortcut remains, state its concrete limit and upgrade trigger. Do not claim unmeasured savings or fabricate benchmarks.
