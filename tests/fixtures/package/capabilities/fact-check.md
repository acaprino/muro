---
id: fact-check
role: verification
when: —
after: []
outputs: ["claims_table", "corrections"]
checks: ["claims_traced", "corrections_listed"]
check_conditions: {"corrections_listed": "At least one claim was not supported by its source."}
intents: [{"id": "story.fact-check", "description": "Check the factual claims of a draft one by one against the sources it cites or the user supplies, and report each as supported, unsupported or not checked.", "excludes": ["A review of style or structure is not a fact check.", "Do not correct the draft unless the user also asks for the corrections to be applied."]}]
tools: []
hooks: []
conflicts: []
---

# Fact check

Lists the claims of a draft and reports what each source supports.

## Behavior

1. **List the claims:** every number, name, date and quotation of the draft.
2. **Trace each claim** to the source it cites. A claim with no reachable source is not checked, and is reported so.
3. **Record** `claims_table` and, when a claim failed, `corrections` for the handoff below; with no failed claim `corrections` says that none is needed.

## Output handoff

Return every required output key as a JSON string. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`; for a direct step, run the `record --direct` line the step carries. Read earlier outputs from the step's `recorded_outputs`.

## Checks

- **claims_traced**: every listed claim has a verdict and the place in the source it rests on.
- **corrections_listed**: each unsupported claim has the corrected wording or the reason none exists.

## Sources

Source: editorial-desk
