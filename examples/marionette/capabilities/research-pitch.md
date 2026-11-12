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

`<SR>` is `<package_root>/scripts/open-paper-skills/skills/sell-research-honestly`.

## Behavior

0. **Read the originals first.** Read `<SR>/SKILL.source.md` whole before working. In `<SR>/references/audience-playbooks.md` read the section for the current audience ("Load only the section for the current audience"), and its `## Feedback loop` section "only when the user brings back real reactions or outcomes". These files are the method in the source's own words. The steps below are an index into them with the source's section titles; each section ends with a "Complete when" condition that must hold before the next step. Where this body and an original differ, the original wins, except for the changes listed under `## Sources` → "Changes for coexistence".

**Inputs.** Establish three inputs: the **research object** ("an idea, experiment, paper, codebase, talk, demo, or the files that contain it"), the **audience** ("one advisor, collaborator, reviewer, talk audience, or research community") and the **desired action** ("what that audience should understand, approve, discuss, accept, use, cite, or do next"). "Inspect supplied materials and repository evidence before requesting facts. If an input remains missing, ask one blocking question per turn while completing the audit work that is already possible."

1. **Frame the case.** "Classify the research object as `idea`, `preliminary`, or `evidenced`." Read the matching audience section of the playbooks, then write the four-part **audience model**: outcome the audience values; cost or decision risk they bear; objection they are most likely to raise; evidence that would make the desired action reasonable.
2. **Build the value case.** "Create a six-field **value case**. Mark every field `supported`, `plausible`, `missing`, or `contradicted`." The fields are Problem, Audience stake, Gap, Insight / solution, Evidence, Boundary / cost; the question for each is in the original's table. "Build a **claim ledger** beside the value case. Give every material claim one state and an exact evidence pointer": `observed`, `inferred`, `hypothesized`, `unsupported`, `contradicted`, as the original defines them. "Prefer evidence in this order: raw results, data, code output, figures, and verified citations; locatable project or manuscript material; user-provided but unverified information; agent inference. Label the last two categories. Treat novelty, priority, state-of-the-art, and comparisons with current work as external facts: verify them against external literature. Until verified, keep their claim state `unsupported`, add `verification: unverified`, and exclude them from public copy." Then: "Make the evidence burden proportional to the claim" with the original's six rules (strong terms, subgroup and failure behavior, added cost, causal language, scope, fair baselines). "When evidence is narrower, narrow the claim."
3. **Apply the value gate.** "Choose exactly one verdict":
   - "`ready-to-sell` — the value proposition and material claims are supported;"
   - "`narrow-and-sell` — a useful case survives after narrowing or qualification;"
   - "`validate-first` — the value is plausible but a load-bearing claim lacks evidence;"
   - "`do-not-claim` — the core claim is unsupported, contradicted, or relies on a research-integrity breach."

   "For `validate-first`, produce a minimum discriminating validation plan: claim, cheapest informative test, success and failure criteria, and how each outcome changes the message. Treat the result as an internal validation brief rather than public-ready copy." "For `do-not-claim`, run one **salvage pass** for a narrower phenomenon, negative result, failure mode, engineering benefit, cost advantage, or worthwhile research question. Use the recovered case only if its own claim ledger passes the gate. If nothing survives, make the Primary Deliverable a concise no-case finding that names the evidence required to reopen the claim." "The verdict measures readiness for honest communication, not the probability of acceptance, collaboration, publication, or attention."
4. **Compose the strongest defensible message.** "For `ready-to-sell` or `narrow-and-sell`, use this narrative spine: audience-relevant problem → concrete gap → insight or solution → value → strongest evidence → boundary and cost → explicit next action". "Write `observed` claims as facts. Mark `inferred` claims with calibrated language. Present `hypothesized` claims only as research questions or future tests. Replace `unsupported` and `contradicted` claims with the narrowest supported alternative." "Vary emphasis, length, and vocabulary for the audience; keep evidence, costs, and scope unchanged. Produce one primary deliverable unless the user requests additional formats. Name the concrete contribution before any larger vision."
5. **Run the integrity pass and deliver.** "Re-run the Step 2 evidence rules against every sentence in the draft. Repair each mismatch by adding evidence, qualifying the sentence, or replacing it with the narrowest supported claim." Return four sections: **Verdict** ("status and decisive reason"), **Value Case** ("the six audited fields and audience model"), **Primary Deliverable** ("one ready-to-use artifact allowed by the gate"), **Integrity Notes** ("claim ledger, required qualifiers, evidence gaps, and next action").

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `value_verdict`, `value_deliverable` and `claim_ledger` as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- "Default to chat output. Edit only files the user explicitly names. Draft PR plans, outreach, and posts locally; publish, send, or contact people only after the user authorizes that external action. Match the user's language unless the target artifact establishes another language."
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
  - The source's frontmatter (`name`, `description` with its "Use when" and "Do not use for" triggers) and `agents/openai.yaml` are not applied: they register and trigger the original as a skill, and the coordinator classifies by meaning.
  - "Default to chat output" stays for the user. In addition the verdict, the deliverable and the claim ledger are returned as outputs through the coordinator (`## Output handoff`): the factory contract hands outputs over through the coordinator.
- Runtime dependency: none.
- Not adopted: `agents/openai.yaml`.
- Hooks: the selected files define none.
- Harmonized by: prompts/harmonizer.md — its own role. It differs from `explainer-fact-check`, which audits an explainer against its sources: this one audits research claims against the research's own evidence and gates what may be communicated.
