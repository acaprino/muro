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

Turns one research object into the strongest defensible case for one audience and one desired action. Facts stay fixed; emphasis changes. The audience playbooks are in `<package_root>/scripts/open-paper-skills/skills/sell-research-honestly/references/audience-playbooks.md`.

## Behavior

Establish three inputs: the **research object**, the **audience** (one), the **desired action**. Inspect the supplied materials and the repository before asking for facts; when an input is still missing, ask one blocking question per turn while doing the audit work already possible.

1. **Frame the case.** Classify the object as `idea`, `preliminary` or `evidenced`. Read the matching audience section of the playbooks and write the audience model: the outcome they value, the cost or decision risk they bear, the objection they will most likely raise, the evidence that would make the action reasonable. Read the playbooks' feedback section only when the user brings back real reactions.
2. **Build the value case.** Six fields, each marked `supported`, `plausible`, `missing` or `contradicted`: problem, audience stake, gap, insight or solution, evidence, boundary and cost. Beside it keep a **claim ledger**: every material claim gets one state (`observed`, `inferred`, `hypothesized`, `unsupported`, `contradicted`) and an exact evidence pointer. Prefer raw results, data, code output, figures and verified citations; then locatable project or manuscript material; label user-provided unverified information and your own inference as such. Novelty, priority, state-of-the-art and comparisons with current work are external facts: verify them against the literature, or keep them `unsupported` with `verification: unverified` and out of public copy.
3. **Match burden to claim.** Strong words (*first*, *general*, *robust*, *low-cost*, *state of the art*) need evidence or a weaker word. Look at critical subgroups and failures, not the average alone. Account for added compute, data, labor, latency, memory and deployment cost. Causal language needs a design that excludes the main alternatives. Scope matches the tested models, datasets and conditions. Comparisons need fair baselines. When the evidence is narrower, narrow the claim.
4. **Apply the value gate.** Exactly one verdict:
   - `ready-to-sell`: the value proposition and material claims are supported.
   - `narrow-and-sell`: a useful case survives after narrowing or qualification.
   - `validate-first`: a load-bearing claim lacks evidence. Deliver a minimum validation plan (claim, cheapest informative test, success and failure criteria, how each outcome changes the message) as an internal brief, not public copy.
   - `do-not-claim`: the core claim is unsupported, contradicted or rests on an integrity breach. Run one salvage pass for a narrower phenomenon, negative result, failure mode, engineering benefit, cost advantage or research question; use it only if its own ledger passes. Otherwise deliver a short no-case finding that names the evidence needed to reopen the claim.
   The verdict measures readiness for honest communication, not the odds of acceptance or attention.
5. **Compose.** For the first two verdicts follow: audience-relevant problem → concrete gap → insight or solution → value → strongest evidence → boundary and cost → explicit next action. `observed` claims are written as facts, `inferred` with calibrated language, `hypothesized` only as questions or future tests; `unsupported` and `contradicted` are replaced by the narrowest supported alternative. Name the concrete contribution before any larger vision. One primary deliverable unless the user asks for more formats.
6. **Integrity pass.** Re-run step 2 and 3 against every sentence of the draft; repair each mismatch by adding evidence, qualifying or narrowing.
7. **Deliver four sections:** Verdict (status and decisive reason), Value Case (six fields and audience model), Primary Deliverable, Integrity Notes (claim ledger, required qualifiers, evidence gaps, next action). Answer in the conversation by default and in the user's language unless the target artifact sets another.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `value_verdict`, `value_deliverable` and `claim_ledger` as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Draft outreach, posts and PR plans locally. Publish, send or contact anyone only after the user authorizes that external action.
- Edit only files the user explicitly names.
- No runtime dependency is installed by this capability.

## Checks

- **one_audience_one_action**: the research object, its maturity, a single audience, the desired action and the four audience-model fields are explicit.
- **every_claim_has_state_and_pointer**: each material claim in the deliverable maps to a ledger row with one state and an evidence pointer.
- **external_claims_verified_or_held**: every novelty, priority, state-of-the-art or comparative claim is verified against a source opened this session, or is `unsupported`, marked unverified and absent from public copy.
- **verdict_gates_deliverable**: the deliverable is the kind the verdict allows (message, validation brief, salvaged case or no-case finding).
- **nothing_sent_without_authorization**: nothing was published, posted or sent, and no unnamed file was edited.

## Sources

- AI intent mapping: sell-research-honestly → research.value-communication.
- Source: open-paper-skills (pengqianhan/open-paper-skills@f85fd3dc, head) — `skills/sell-research-honestly/SKILL.md` and `references/audience-playbooks.md`, packaged unchanged.
- Runtime dependency: none.
- Not adopted: `agents/openai.yaml`.
- Hooks: the selected files define none.
- Harmonized by: prompts/harmonizer.md — its own role. It differs from `explainer-fact-check`, which audits an explainer against its sources: this one audits research claims against the research's own evidence and gates what may be communicated.
