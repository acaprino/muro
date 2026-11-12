# Proposed work-map enrichment

This is an AI-authored amendment proposal, not another capability or a new mandatory plan step.

Add to build/review step 6:

- Before editing, read the affected paths and follow every changed function's callers, callees, tests, fixtures, configuration and exports. Establish compatibility, data-loss and exposure risks as part of the approved scope.
- Stop at the first solution that fully works: reuse the project's component/helper/service/pattern, then the standard library or platform if the project has no established choice, then installed dependencies, then the least new readable implementation. Keep the approved architecture, design authority and named engines; this does not authorize replacing GSAP, GenOffice or another selected capability's required tool.
- Complete every consequential change, including broken callers/tests/fixtures. Fix a bug once in the shared cause. Preserve validation, data-loss error handling, security, accessibility and required hardware calibration when moving or merging code.
- Avoid speculative abstractions, wrappers, configuration, conversions and future features. Prefer deletion only when required behavior survives. A compressed one-liner that needs decoding is not simpler.
- At the already agreed test seam, add or run one focused check for non-trivial logic; respect existing required verification gates. Trivial edits need no ceremonial test. Comments explain reasons that code cannot show; record a deliberate shortcut as `shortcut: <limit>, <upgrade trigger>`, unless the user/project chooses another convention.
- In per-slice evidence, disclose actual checks, unchecked work and material risk. An explicitly requested independent code review can use engineering-review; do not inject it automatically as a prerequisite.

Add provenance:

- Source: ponytail (DietrichGebert/ponytail@7801d061243d7b753bad0e0b3c057cd250b11755, release v5.3.3, MIT), `skills/ponytail/SKILL.md` and `.agents/rules/ponytail.md`, Before you write / The smallest complete change.
- The code-specific method enriches the current implementation owner. Its domain-neutral summary is synthesized once into the combined permanent policy. The source's persona, own slash routing, plugin controls and optional native UI/state mechanisms are excluded.
- Wayfinder still owns destination, decisions, spec, vertical slices and approvals. Ponytail does not introduce another writer, bypass internal user gates or require a map for small direct work.

