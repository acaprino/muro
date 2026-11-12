---
id: research-pitch
role: research-communication
when: —
after: []
outputs: ["value_verdict", "value_deliverable", "claim_ledger"]
checks: ["one_audience_one_action", "every_claim_has_state_and_pointer", "external_claims_verified_or_held", "verdict_gates_deliverable", "nothing_sent_without_authorization"]
intents: [{"id":"research.value-communication","description":"Audit, position and communicate the value of one piece of research (an idea, experiment, paper, result, codebase, talk or demo) for one audience and one desired action, such as buy-in from an advisor, collaborator, reviewer, talk audience or the research community, without claiming more than the evidence supports; or detect and repair overclaiming in an existing pitch.","excludes":["Generic proofreading, summarization or formatting.","Writing the paper's manuscript or its slides.","Marketing copy or a landing page for a product.","Fact-checking an explainer or article against its sources."]}]
tools: [{"name":"file-access","purpose":"Read the research materials (results, data, figures, manuscript, code output) that the claims rest on. Files are edited only when the user names them.","required":true},{"name":"web-research","purpose":"Verify novelty, priority, state-of-the-art and comparisons against the external literature. Queries leave the machine. Without it those claims stay unverified and out of public copy.","required":false}]
hooks: []
conflicts: []
---

# Research Pitch

Turn one research object into the strongest defensible case for one audience and one desired action. Keep facts invariant while changing emphasis.

`<SR>` is `<package_root>/scripts/open-paper-skills/skills/sell-research-honestly`. The full version is `<SR>/SKILL.source.md` with `<SR>/references/audience-playbooks.md`. Where this body differs, the packaged original wins, except for the changes listed in the Sources section.

## Behavior

**Inputs.** Establish three: the research object (an idea, experiment, paper, codebase, talk, demo, or the files that contain it), one audience (an advisor, a collaborator, a reviewer, a talk audience or the research community) and the desired action (what that audience should understand, approve, discuss, accept, use, cite or do next). Inspect the supplied materials and the repository before asking for facts. If an input is still missing, ask one blocking question per turn and meanwhile do the audit work that is already possible.

Each step is complete only when its condition holds; the conditions are the "Complete when" lines of the packaged skill.

1. **Frame the case.** Classify the object as `idea`, `preliminary` or `evidenced`. Open in `<SR>/references/audience-playbooks.md` only the section for the current audience (`## Advisor: decision brief`, `## Collaborator: scoped invitation`, `## Reviewer: claim–evidence defense brief`, `## Talk audience: memorable narrative`, `## Research community: PR brief`): it gives that audience's model and the shape of its primary deliverable. Then write the four-part audience model: the outcome the audience values, the cost or decision risk it bears, the objection it is most likely to raise, and the evidence that would make the desired action reasonable. Open `## Feedback loop` only when the user brings back real reactions or outcomes.
2. **Build the value case.** Six fields, each marked `supported`, `plausible`, `missing` or `contradicted`: Problem, Audience stake, Gap, Insight / solution, Evidence, Boundary / cost. Beside it keep a claim ledger: every material claim gets exactly one state (`observed`, `inferred`, `hypothesized`, `unsupported`, `contradicted`) and an exact evidence pointer. Open `## 2. Build the value case` in the packaged skill for the question behind each field and the definition of each state when a field or a state is in doubt.
   - Evidence is preferred in this order: raw results, data, code output, figures and verified citations; then locatable project or manuscript material; then user-provided but unverified information; then agent inference. Label the last two.
   - Novelty, priority, state-of-the-art and comparisons with current work are external facts: verify them against external literature. Until verified, their state stays `unsupported` with `verification: unverified`, and they stay out of public copy.
   - The evidence burden is proportional to the claim: strong terms (*first*, *general*, *robust*, *low-cost*, *state of the art*) carry attached evidence or give way to a supported term; critical subgroup and failure behavior is inspected, not an average alone; added compute, data, labor, latency, memory and deployment cost is accounted for; causal language needs a design that excludes the main alternative explanations; scope matches the tested models, datasets, conditions and cases; comparative effectiveness needs fair baselines. When the evidence is narrower, narrow the claim.
3. **Apply the value gate.** Choose exactly one verdict; it fixes which deliverable is allowed next.
   - `ready-to-sell`: the value proposition and the material claims are supported.
   - `narrow-and-sell`: a useful case survives after narrowing or qualification.
   - `validate-first`: the value is plausible but a load-bearing claim lacks evidence. Produce a minimum discriminating validation plan (the claim, the cheapest informative test, success and failure criteria, how each outcome changes the message) and treat it as an internal validation brief, not public-ready copy.
   - `do-not-claim`: the core claim is unsupported, contradicted, or relies on a research-integrity breach. Run one salvage pass for a narrower phenomenon, a negative result, a failure mode, an engineering benefit, a cost advantage or a worthwhile research question; use what is recovered only if its own claim ledger passes the gate. If nothing survives, the Primary Deliverable is a concise no-case finding naming the evidence required to reopen the claim.

   The verdict measures readiness for honest communication, not the probability of acceptance, collaboration, publication or attention.
4. **Compose the message** (for `ready-to-sell` or `narrow-and-sell`). Follow this spine: audience-relevant problem → concrete gap → insight or solution → value → strongest evidence → boundary and cost → explicit next action. `observed` claims are written as facts, `inferred` ones with calibrated language, `hypothesized` ones only as research questions or future tests; `unsupported` and `contradicted` ones are replaced by the narrowest supported alternative. Emphasis, length and vocabulary vary with the audience; evidence, costs and scope do not. Produce one primary deliverable unless the user asks for more formats, with one clear takeaway and next action, and name the concrete contribution before any larger vision.
5. **Integrity pass and delivery.** Re-run the evidence rules of step 2 against every sentence of the draft and repair each mismatch by adding evidence, qualifying the sentence or replacing it with the narrowest supported claim. Return four sections: **Verdict** (status and decisive reason), **Value Case** (the six audited fields and the audience model), **Primary Deliverable** (one ready-to-use artifact allowed by the gate), **Integrity Notes** (claim ledger, required qualifiers, evidence gaps, next action).

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `value_verdict`, `value_deliverable` and `claim_ledger` as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Default to chat output and edit only files the user explicitly names. Draft PR plans, outreach and posts locally; publish, send or contact people only after the user authorizes that external action.
- Match the user's language unless the target artifact establishes another one.
- The playbooks' worked example is fictional: never reuse its facts as real evidence.
- No runtime dependency is installed by this capability.

## Checks

- **one_audience_one_action**: the research object, its maturity, a single audience, the desired action and the four audience-model fields are explicit.
- **every_claim_has_state_and_pointer**: each material claim in the deliverable maps to a ledger row with one state and an evidence pointer.
- **external_claims_verified_or_held**: every novelty, priority, state-of-the-art or comparative claim is verified against a source opened this session, or is `unsupported`, marked unverified and absent from public copy.
- **verdict_gates_deliverable**: the deliverable is the kind the verdict allows (message, validation brief, salvaged case or no-case finding).
- **nothing_sent_without_authorization**: nothing was published, posted or sent, and no unnamed file was edited.

## Sources

- AI intent mapping: sell-research-honestly → research.value-communication.
- Source: open-paper-skills (pengqianhan/open-paper-skills@f85fd3dc, head) — `skills/sell-research-honestly/SKILL.md` (packaged as `SKILL.source.md`) and `references/audience-playbooks.md`, packaged unchanged.
- Changes for coexistence (ADR-0017):
  - The source's frontmatter triggers and `agents/openai.yaml` are not applied: they would activate the original as a skill beside the coordinator, which classifies by meaning.
  - The source delivers in chat only; here the verdict, the deliverable and the claim ledger are also returned through the coordinator, which is the single owner of recorded outputs.
- Runtime dependency: none.
- Not adopted: `agents/openai.yaml`.
- Hooks: the selected files define none.
- Harmonized by: prompts/harmonizer.md — its own role. It differs from `explainer-fact-check`, which audits an explainer against its sources: this one audits research claims against the research's own evidence and gates what may be communicated.
