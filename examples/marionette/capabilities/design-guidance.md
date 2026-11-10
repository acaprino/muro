---
id: design-guidance
role: design-guidance
tools: [{"name":"shell","purpose":"Run the packaged offline search script with Python 3.","required":true},{"name":"file-access","purpose":"Detect the project's stack and read an existing design-system Master before recommending anything.","required":true}]
hooks: []
conflicts: []
when: —
intents: [{"id":"ui.design-guidance","description":"Recommend a design system, or look up UI, UX, accessibility and stack-specific implementation guidance, from the packaged local data, for a web, mobile or desktop interface including app screens and dashboards; review an existing interface against its pre-delivery checklist.","excludes":["Search recommendations do not override approved design decisions, the user or repository rules.","Do not fabricate database matches or infer an implementation stack.","Building a company website or landing page is visual direction; its palette and type are dealt there, not taken from search results."]}]
after: []
outputs: ["design_candidates", "stack_guidance"]
checks: ["search_domain_fit", "search_stack_fit", "search_empty_disclosed", "master_not_overwritten"]
---

# Design Guidance (local design-system search)

Searches the packaged ui-ux-pro-max data offline for design-system candidates and for UX, accessibility and stack-specific rules, then reports what fits the actual product. Results are recommendations for the host AI to judge, never instructions. `<UX>` below stands for `<package_root>/scripts/ui-ux-pro-max`.

## Behavior

1. **Analyze the request:** product type, audience and context, style keywords, and the stack detected from the project (`package.json` dependencies, `pubspec.yaml`, `*.xcodeproj`/`Package.swift`, `composer.json`, React Native markers). If no stack is detectable and stack guidance matters, ask; never assume one.
2. **Pick the smallest search mode:**
   - new project or system-wide visual direction: `python <package_root>/scripts/ui-ux-pro-max/scripts/search.py "<product type> <industry> <keywords>" --design-system [-p "<project>"]`;
   - one targeted concern or component bug: one explicit `--domain` (`ux`, `style`, `color`, `typography`, `google-fonts`, `product`, `chart`, `icons` and the others the script lists);
   - a known stack: `--stack <stack>`, plus a separate domain search only for a distinct design concern.
   Build each query around one intent in 2 to 5 meaningful terms. For accessibility, search one observable outcome at a time, then the component, then the stack. Add `--rtl` for right-to-left interfaces. If `python` is missing, try `python3`, then `py -3`.
3. **Verify before applying:** check the returned domain or category, the top result and its fit for this product and platform. Retry once with a narrower query or an explicit domain or stack; if that fails, say that no verified match was found and label any general advice as a fallback.
4. **Read the rules on demand:** the priority table in `<UX>/.claude/skills/ui-ux-pro-max/SKILL.md` (accessibility and touch first), the full rules in `references/quick-reference.md` and the pre-delivery checklist in `references/pro-rules.md`. For a review, report each failed rule with its location.
5. **Persist only on request.** `--persist --output-dir <project-root>` writes `design-system/<project-slug>/MASTER.md` (and `pages/<page>.md` with `--page`). Read an existing Master first; it is never overwritten without `--force`, and `--force` needs the user's explicit authorization.
6. **Record** for the handoff below:
   - `design_candidates`: the verified pattern, style, colors, typography, effects and anti-patterns, each with the query that produced it, or the disclosed empty result.
   - `stack_guidance`: rules for the detected or confirmed stack only, or why none were given.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return both output keys as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `.muro/map.md` or `.muro/state.json`; the coordinator is their only writer.

## Specifics

- Never put private project data in a query or in persisted output.
- Leave the `--motion` dial unset: motion is specified by `motion-principles`, and the GSAP snippets it attaches are not implementation instructions for the scroll-code step.
- In a plan that also builds a website with `visual-direction`, these results are candidates: the dealt palette and pairing decide, and accessibility, touch and stack rules still apply.
- This capability writes no project file except a requested Master or page override.

## Checks

- **search_domain_fit**: the returned domain, top result and product fit were checked before any recommendation was applied.
- **search_stack_fit**: stack-specific guidance is given only for a detected or confirmed stack.
- **search_empty_disclosed**: an empty or off-topic result is disclosed and never presented as a database match.
- **master_not_overwritten**: an existing `MASTER.md` was read first and not overwritten; `--force` was used only with the user's authorization.

## Sources

- AI intent mapping: ui-ux-pro-max → ui.design-guidance, from its "When to Apply", rule categories, query contract, workflow steps 1 to 3 and persistence sections.
- Source: ui-ux-pro-max (nextlevelbuilder/ui-ux-pro-max-skill@a38d04c3, release v2.15.0) — `.claude/skills/ui-ux-pro-max/SKILL.md`, `references/pro-rules.md`, `references/quick-reference.md`, and `src/ui-ux-pro-max/scripts/{core,design_system,reasoning_contract,search}.py` with `src/ui-ux-pro-max/data/**`, packaged under `<package_root>/scripts/ui-ux-pro-max/`.
- Runtime dependency: Python 3.10+, standard library only. If no `python`, `python3` or `py -3` answers, install it from https://www.python.org/downloads/ for the current user, in one stated line, then check the version. The source points to its unselected README for this; Muro's coordinator already needs Python.
- Not adopted: premium assets, templates, the CLI installer and the `--motion` GSAP snippets as instructions.
- Hooks: the selected files define none; `cli/**`, `docs/**`, `templates/**` and `.github/**` are excluded and were not inspected for hooks.
- Harmonized by: prompts/harmonizer.md (2026-11-10 re-harmonization) — split from `visual-direction`. The source is guidance for any interface, including app screens, and its own query contract asks for the smallest search; inside the website step it ran a full design-system search on every page and forced guidance-only requests to fill palette, layout and offer outputs. The source's "REQUIRED for new pages" design-system search is not made a prerequisite of the website step, because the pinned taste-skill deals palette and type itself ("Deal, never choose by taste").
