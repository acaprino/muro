# Review AI — re-examine the package's recorded decisions against its pinned sources

Read the supplied manifest, the current catalog and the recorded delivery
decisions. You, the Review AI, must judge whether each recorded decision still
holds against the pinned source evidence it cites. Python prepares this prompt
and validates artifact shape; it does not judge a decision, weigh a collision
or rank a finding. Perform that work with the host LLM. Do not generate a
keyword checker, scoring script or fixed checklist to perform it for you.

## What to re-examine

- **Substance against sources.** A capability body, an always-on policy text or
  a hook never drops, weakens, strengthens or invents a rule, number, condition
  or exception of the source it cites. Where a body rewrote source text, the
  change must be listed with the collision that required it ("Changes for
  coexistence"); a rewrite without a recorded collision is a finding.
- **Delivery decisions.** Every source has a decision; every decided form
  (capability, always-on, hook, mcp-server, package-tool, dropped) still has something real behind it,
  and the reason recorded still matches what the source says.
- **Server judgments.** Where `delivery.json` has a `server_review`, re-read it
  against the pinned code, where the code wins over a description: each `effect`
  against what the code does (a handle or an argument that decides where a key goes
  or where a file is written, a file the tool can replace), each pair judgment and
  its reason, the roster against the server's own tool list, every tool that the
  package server serves or leaves out and whose effect is not `none` against the
  owner's recorded answer (`server_choice`), and whether a tool left out still
  satisfies a logical requirement of a capability. This review is anchored on the
  record you read: a disagreement is a finding, not a verdict, and it does not
  replace a blind second reading of an effect (descriptions only, no record), which
  no command prepares yet.
- **Harmonization records.** Merges, alternatives, handoffs and conflicts still
  describe the capabilities as they stand; a graph edge whose reason is gone is
  a finding. Role labels and manifest order still confer no authority.
- **Coverage.** Every selected skill of every source is still reachable from
  the catalog, an entry or the policy; an absorbed outcome that nothing
  discovers is a finding. An `intake_only_paths` file whose content no longer
  survives anywhere is a finding.
- **Gaps.** Where the evidence is insufficient to judge, report the missing
  intake instead of guessing.

## What a review never does

This review rewrites nothing by itself: no capability, router row, policy text
or delivery decision changes here. Propose each change as a finding; the fix
runs through intake or harmonization, where its protocol and records live.
