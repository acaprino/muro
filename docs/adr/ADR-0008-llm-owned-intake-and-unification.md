---
adr_id: ADR-0008
version: 1
title: LLM-owned intake, synthesis and graph placement
status: Proposed
proposed_on: 2026-11-10
accepted_on: null
proposed_at_sha: 2e0fa680e6efd66d29d2d088294d39baf7fcc761
accepted_at_sha: null
last_verified_sha: null
supersedes: []
---

# ADR-0008: LLM-owned intake and unification

## Owner requirement

On 2026-11-10 the owner clarified that intake and intelligent unification must use
the LLM's understanding of each skill/plugin's meaning and purpose, combine it
coherently by function and manage its place in the decision tree. Python scripts,
regex and other deterministic semantic substitutes do not meet that requirement.
The requirement is explicit; this record's wording and implementation details are
not separately approved. Historical records and verification evidence are preserved.

This amends ADR-0002's source-order precedence and automatic same-role merging,
and makes ADR-0003's AI-ownership boundary explicit for the complete factory.
Licensing, inert upstream code, output ownership and sequential execution remain
mechanically enforced under their existing contracts.

## Decision

1. Intake AI reads the approved selected material, identifies purpose, useful
   methods, outcomes and limits, and compares them with the existing catalog.
   It records source-grounded reasons and gaps rather than assigning branches
   from filenames, names, keywords, source order or a fixed capability quota.
2. Harmonizer AI synthesizes knowledge and chooses coherent responsibilities,
   merges, alternatives, real prerequisites and conflict resolutions. Labels
   express its conclusions; identical labels are not a merge algorithm. Explicit
   owner/project constraints and source evidence guide decisions. An unresolved
   consequential choice is reported, never resolved by taking the first source.
3. The graph is maintained as AI-authored capabilities and router data. Each
   changed relationship has a concise functional justification and provenance.
   Python only copies inputs, checks structure/references, verifies sources,
   packages artifacts and executes explicit validated dependencies and state rules.
4. Host LLM execution is required: preparing `PROMPT.md`, passing validation or
   running a build does not perform intake or unification. There is no new LLM
   provider SDK or embedded classifier. The host supplies semantic work using the
   current session's LLM and tools. Incomplete evidence returns to intake.
5. The legacy public `resolve_plan` role-selection function fails closed with
   migration guidance to host-AI classification. Imports remain compatible but
   no caller can obtain a first-compatible-row decision through that function.

## Concrete corrections

Both prepared prompts now include the current router and full capability bodies
verbatim as context; that context is not automatic authority. Source-specific
goals for the two design additions ask for functional assessment, instead of
predetermining their merge destination. The existing visual composition remains
one output owner's responsibility, with landing strategy and local guidance
retaining distinct contributions. Figma implements the approved typography,
including an approved pairing, without imposing a competing one-font rule.

No new semantic interpreter, taxonomy, scoring system or automated merge engine
is introduced. Existing regex used for syntax, license text or helper imports
does not interpret a skill's purpose and is not removed on that basis.

## Verification and limits

Tests cover the disabled legacy path and preservation of supplied context; AI
response fixtures test validation and state, not the model's understanding.
LLM review of synthetic examples is recorded separately from automated checks
and real source/host integration. Neither valid Markdown nor a successful test
proves AI authorship or general semantic quality. See
`docs/verification/2026-11-10-llm-owned-factory.md` for executed evidence.
