# Catalog re-harmonization against the pinned sources — 2026-11-10

## Scope

The owner asked for the LLM harmonization of the whole catalog (option 1 after
the re-verification of `2026-11-10-llm-owned-factory.md`). The working tree
started at HEAD `77b7a76`. A concurrent session was adding the release
`GUIDE.html` (ADR-0010) in the same tree; its edits to `ROUTER.md`, `README.md`,
`prompts/harmonizer.md` and `tests/routing_helpers.py` were preserved. No commit,
installation, publication or `dist/` change was made.

Context was prepared with `muro.factory.harmonize_prompt` into
`.muro/factory/harmonization-llm-20261110b/PROMPT.md`, with GenOffice at the
release pin `4b55db9e`. Four LLM workers audited the capabilities against the
packaged pinned files (motion-design; gsap-scrolltrigger; wayfinder, to-spec and
to-tickets; taste-skill, landing-page-design, figma-designer and ui-ux-pro-max).
Their key citations were re-read in the sources before editing. The harmonization
decisions below were made in this session, not by a script.

## Defects found

- **Forced prerequisites.** `motion-principles` required `visual-direction`,
  so "describe hover timing" ran a full website direction, although
  `visual-direction` itself says a motion request does not require redesign.
  `gsap-scrolltrigger` required `motion-principles`, so a stated ScrollTrigger
  request ran three steps. `figma-design` required `visual-direction` even for
  a component state in an existing file. None of the sources asks for these:
  motion-design starts from purpose and context with a Corporate default,
  gsap-scrolltrigger "applies when implementing", and figma-designer starts by
  reusing the file's own variables.
- **Unpinned provenance.** `visual-direction`'s "3 of 20 directions", eyebrow,
  numbering, thin-rule, cream-and-terracotta, "one motion accent per view" and
  "honest code drawings" rules match an unpinned local copy of the skill
  (`~/.claude/skills/design-taste-frontend`, tasteskill v2), not the pinned
  v2.5.1. Several contradict the pinned files: for example, `palettes.json` ships
  `flour-terracotta`, and the pinned `start.mjs` deals three palettes and three pairings.
- **Unrecorded upstream hook.** The pinned taste-skill `SKILL.md` declares a
  `Stop` command hook that runs `gate.mjs`; provenance said no hook existed.
- **Direction without a build.** taste-skill and landing-page-design both build
  the page; the capability stopped at a direction while its checks tested code.
- **Invented or contradicted method text.** In motion-principles: easing names, duration bands,
  "never mix ease-out and spring" and the 150ms hover rule. In gsap-scrolltrigger:
  the easing map, a static `ScrollTrigger.kill()`, "avoid nested scroll
  containers", a 2px threshold and a `references/**` citation of an unselected
  path. css-scroll claimed motion-design provenance for CSS that motion-design
  does not describe, and listed browser versions.
- **work-map** described Muro runtime internals and checked Muro's own map. It
  omitted the wayfinder method: size gate, destination, decision tickets, spec
  template and vertical slices.
- **Overlap.** `office-authoring` printed PDFs of existing files, which the
  source's command choice sends to `convert` (`office-files`).

## Decisions

- No shipped capability declares `after`. Consumers read recorded outputs. The
  host AI selects producer and consumer in execution order when both are needed
  (`prompts/classify.md`). The `after` mechanism and its tests are unchanged.
- `visual-direction` keeps taste-skill + landing-page-design (both build; the
  taste brief/copy step is the landing strategy). It is rewritten to the pinned
  v2.5.1 run and adds the `page` output. It owns the look. landing-page-design's
  font list, one-typeface rule, hero gradient and fixed Tailwind scale are scoped
  out. A client brand wins over the sources' bans and is recorded in `constraints`.
- `design-guidance` is split out for ui-ux-pro-max. It serves any interface,
  app screens included; next to a dealt palette its results are candidates.
- `figma-design` keeps a recorded pairing as the user's choice of a pair. It stops
  landing-section planning without a recorded outline (the source's own
  dependency on landing-page-design). It no longer requires 768/390 frames on
  every screen.
- `motion-principles` and `gsap-scrolltrigger` use only their sources' rules. Reduced
  motion in the GSAP step is labelled a Muro implementation choice (the source is
  silent). A recorded motion budget overrides motion-design's three-layer rule.
- `css-scroll` is labelled Muro-authored. motion-design is cited only for its
  scroll limits, which the release provenance gate requires to name a source.
- `work-map` follows wayfinder, to-spec and to-tickets locally (no tracker, push or
  labels), adds `spec`, and labels build-and-review as the intake goal's extension.
- Logical tool names normalized: `image-view` → `image-inspection`,
  `browser-preview` → `browser`.

## Failure and success evidence

- After the catalog change and before the test update: `20 failed, 183 passed in
  97.26s`. All failures expected the old edges or outputs, for example
  `test_motion_spec_does_not_imply_scroll_implementation` (KeyError `plan`: the
  request is now a direct single step).
- Map-mechanics tests now use explicit multi-step selections. Prerequisite
  expansion and skip are still tested through the fixture edges of
  `routing_helpers.declare_prerequisite`. New tests:
  `tests/test_reharmonization.py` (7) and two runtime cases.
  `tests/test_reharmonization.py` failed twice first because provenance notes name
  the removed text; the checks now read only the operative instructions.
- The first fresh build failed: `ValueError: Invalid router: Capability css-scroll:
  no registered source provenance`. `--validate` had passed, because it does not
  apply the registered-source check. Fixed by citing motion-design for the limits
  that it does supply.
- Final: `python muro_build.py --validate` → `OK: capabilities and ROUTER.md valid`.
  `python -m pytest -q` → **212 passed in 100.50s** (TEMP/TMP in
  `.muro/tmp-verify-20261110`; includes the concurrent session's tests).
  `python muro_build.py --check-sources` → `OK: all sources and plugin identity valid`.
  Fresh build at `.muro/release-reharmonized-20261110/muro`.
- After the css-scroll provenance edit and the README update, the suite was run
  again: **218 passed in 113.95s**. The concurrent session had added tests in
  the meantime. `--validate` passed again, and `git diff --check` passed.
- Five packaged launchers (Claude Code, Codex, Hermes, OpenCode, Pi) ran outside
  the checkout with PYTHONPATH removed and explicit AI-decision fixtures:
  - motion-only: `direct` motion-principles;
  - stated ScrollTrigger: `direct` gsap-scrolltrigger;
  - landing + motion + GSAP: `confirm` with the plan in the selected order;
  - React Native accessibility: `direct` design-guidance.
  Each run returned exit code 0 and wrote no `.muro` state. The script is in this
  session's scratchpad, not the repository.

## LLM review of representative requests

These are self-authored cases, reviewed against the new graph. They are not a
held-out benchmark.

| Request | Path | Before |
|---|---|---|
| Describe hover timing, no code | motion-principles | visual-direction → motion |
| Pin the hero and scrub its image (GSAP project) | gsap-scrolltrigger | 3 steps |
| New landing page with scroll animation (GSAP) | visual-direction → motion → GSAP (AI order) | same, forced |
| Add focus states to a Figma component | figma-design | visual-direction → figma |
| New landing page in Figma | visual-direction → figma-design | same, forced |
| Accessibility rules for a React Native form | design-guidance | visual-direction with filler outputs |
| Redesign a SaaS dashboard screen | design-guidance (+ work-map to implement) | visual-direction page run |
| Our deck as PDF | office-files conversion | ambiguous with office-authoring |
| Explainer with animated figures | interactive-explainer only | scroll capabilities not excluded |
| Website whose brand accent is violet | visual-direction, brand kept, deviation recorded | violet banned |

## Open gaps (owner decisions)

1. taste-skill's run needs files that are not selected (hero and moment dealers,
   kit, photograph tools, checkers, `gate.mjs`, the `Stop` hook). Selecting them is
   a re-intake with license and asset review.
2. Node 22+ and a Chromium browser are needed by taste-skill but are absent from
   `runtime_deps`; the source gives no install method.
3. GSAP: the intake goal says not to install it, ADR-0007 says capabilities
   install missing dependencies, and the source gives no method. Until decided,
   the step does not install it.
4. No maintained upstream source for CSS scroll-driven animation.
5. ADR-0002 EX-001 (landing page with pinned hero → three ordered steps) now
   happens through the AI's ordered selection, not `after` edges; ADR-0002 itself
   is unchanged.

## Integration boundaries

Fixtures validate the protocol, not LLM authorship. No live host session, Figma,
GenOffice, GSAP or taste-skill run was performed; no dependency was installed and
no hook was activated.
