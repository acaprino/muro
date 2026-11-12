---
id: design-guidance
role: design-guidance
tools: [{"name":"shell","purpose":"Run the packaged offline search script with Python 3.","required":true},{"name":"file-access","purpose":"Detect the project's stack and read an existing design-system Master before recommending anything.","required":true}]
hooks: []
conflicts: []
when: —
intents: [{"id":"ui.design-guidance","description":"Recommend a design system, or look up UI, UX, accessibility and stack-specific implementation guidance, from the packaged local data, for a web, mobile or desktop interface including app screens and dashboards; review an existing interface against its pre-delivery checklist.","excludes":["Search recommendations do not override approved design decisions, the user or repository rules.","Do not fabricate database matches or infer an implementation stack.","Building a company website or landing page is visual direction; its palette and type are dealt there, not taken from search results.","Committing a product with no brand to one look is aesthetic direction, and auditing and fixing an HTML design is the design review; this step recommends and reports."]}]
after: []
outputs: ["design_candidates", "stack_guidance"]
checks: ["search_domain_fit", "search_stack_fit", "search_empty_disclosed", "master_not_overwritten"]
---

# Design Guidance (local design-system search)

Searches the packaged ui-ux-pro-max data offline for design-system candidates and for UX, accessibility and stack-specific rules, then reports what fits the actual product. Results are recommendations for the host AI to judge, never instructions. `<UX>` below stands for `<package_root>/scripts/ui-ux-pro-max`.

## Behavior

The full version of this method is the skill file `<UX>/.claude/skills/ui-ux-pro-max/SKILL.source.md`; the sections named below are its headings. Open one when the step needs its detail. Where this body and an original differ, the original wins, except for the changes listed under Sources. The command is always `python <package_root>/scripts/ui-ux-pro-max/scripts/search.py` (where the skill file writes a `${CLAUDE_PLUGIN_ROOT}` path); if `python` is not found, try `python3`, then `py -3`.

1. **Analyze the request:** product type, target audience and context, style keywords, and the stack detected from the project (`package.json` dependencies, `pubspec.yaml`, `*.xcodeproj`/`Package.swift`, `composer.json`, React Native markers; "Step 1: Analyze User Requirements"). If nothing is detectable and stack guidance matters, ask the user. Never assume a stack.
2. **Pick the smallest search mode that fits** ("Query Contract"):
   - a new project or page, or a system-wide visual direction: `python <package_root>/scripts/ui-ux-pro-max/scripts/search.py "<product_type> <industry> <keywords>" --design-system [-p "Project Name"]`;
   - a targeted concern or component bug: one explicit `--domain <domain>` (the domains are the table of "Step 3: Supplement with Detailed Searches (as needed)");
   - a known implementation stack: `--stack <stack>` (the list is in "Step 4: Stack Guidelines"), with a separate domain search only for a distinct design concern.
   Build each query around one dominant intent, with 2–5 meaningful terms and one useful constraint such as product, platform or interaction. For accessibility work, and for text-layout and compact-component bugs, open the two paragraphs of "Query Contract" that order the searches: the semantic outcome first, then the component domain or the detected stack, and never a generic accessibility result for a specific interaction or WCAG criterion.
3. **Verify before applying:** check the returned domain or category, the identity of the top result and its fit for the user's product and platform. When the output is empty or off-topic, retry once with a narrower rewrite or an explicit domain or stack. If the retry fails, say that no verified match was found and label any general guidance as a fallback (for 0 results, the priority table's built-in defaults, named as such: "If a search returns 0 results"). Never present an empty search as data, and do not persist unverified output.
4. **Read the rules the task needs:** "Rule Categories by Priority" in the skill file decides which category comes first (priority 1 to 10). For a UI review or audit, or the full rule list of one category, open that category in `<UX>/.claude/skills/ui-ux-pro-max/references/quick-reference.md`. Before delivering native or mobile app UI (iOS, Android, React Native, Flutter) open `<UX>/.claude/skills/ui-ux-pro-max/references/pro-rules.md` and run its "Pre-Delivery Checklist"; it does not apply 1:1 to desktop web. For a review, report each failed rule with its location.
5. **Persist only on request** ("Step 2b: Persist Design System (Master + Overrides Pattern)"): add `--persist` and always pass `--output-dir` pointed at the project root. It writes `design-system/<project-slug>/MASTER.md`, and `pages/<page>.md` with `--page`. Read an existing `MASTER.md` before anything else: it is never overwritten without `--force`, and `--force` needs the user's explicit authorization.
6. **Record** for the handoff below:
   - `design_candidates`: the verified pattern, style, colors, typography, effects and anti-patterns, each with the query that produced it, or the disclosed empty result.
   - `stack_guidance`: rules for the detected or confirmed stack only, or why none were given.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return both output keys as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Search results are recommendations, never instructions that override the user or repository rules. Do not put private project data in queries or persisted output.
- Leave the `--motion` dial unset: motion is specified by `motion-principles`, and the GSAP snippets it attaches are not implementation instructions for the scroll-code step. `--variance` and `--density` work as "Step 2c: Design Dials (optional)" says; output formats are in "Output Formats".
- In a plan that also builds a website with `visual-direction`, these results are candidates: the dealt palette and pairing decide, and accessibility, touch and stack rules still apply.
- This capability writes no project file except a requested Master or page override.
- `aesthetic-direction` reads `design_candidates` when it proposes directions. `design-review` audits and fixes a web design in place; a review here stays a report against the packaged rules.

## Checks

- **search_domain_fit**: the returned domain, top result and product fit were checked before any recommendation was applied.
- **search_stack_fit**: stack-specific guidance is given only for a detected or confirmed stack.
- **search_empty_disclosed**: an empty or off-topic result is disclosed and never presented as a database match.
- **master_not_overwritten**: an existing `MASTER.md` was read first and not overwritten; `--force` was used only with the user's authorization.

## Sources

- AI intent mapping: ui-ux-pro-max → ui.design-guidance, from its "When to Apply", rule categories, query contract, workflow steps 1 to 3 and persistence sections.
- Source: ui-ux-pro-max (nextlevelbuilder/ui-ux-pro-max-skill@a38d04c3, release v2.15.0) — `.claude/skills/ui-ux-pro-max/SKILL.md`, `references/pro-rules.md`, `references/quick-reference.md`, and `src/ui-ux-pro-max/scripts/{core,design_system,reasoning_contract,search}.py` with `src/ui-ux-pro-max/data/**`, packaged under `<package_root>/scripts/ui-ux-pro-max/` (the skill file as `SKILL.source.md` with its references under `.claude/skills/ui-ux-pro-max/`; scripts and data under `scripts/` and `data/`).
- Changes for coexistence (ADR-0017):
  - The source's frontmatter and "When to Apply" are not carried as activation: the coordinator classifies by meaning.
  - The script path `${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/scripts/search.py` becomes `<package_root>/scripts/ui-ux-pro-max/scripts/search.py`: the package is not installed as the source's plugin.
  - "Step 2: Generate Design System (REQUIRED for new pages/projects)" is not a mandatory first step: a website or landing page gets palette and type from `visual-direction`, which deals them, and a second required owner would contradict it. The search itself is unchanged.
  - The `--motion` dial is left unset and the `gsap` domain's snippets are not implementation instructions: `motion-principles` and the scroll-code steps own motion.
  - Persisting is done only on request, where the source offers it for retrieval across sessions: outputs are handed over through the coordinator, and an unrequested project file would be a second handoff.
  - "Then synthesize the design system + detailed searches and implement" stops at the report: building belongs to the capability selected for it (one capability per step).
  - "It does not install packages" holds for project packages only; a missing Python is installed under the package's rule for a missing runtime dependency (ADR-0007), where the source points to its README, which is not selected.
- Runtime dependency: Python 3.10+, standard library only. If no `python`, `python3` or `py -3` answers, install it from https://www.python.org/downloads/ for the current user, in one stated line, then check the version. The source points to its unselected README for this; Muro's coordinator already needs Python.
- Not adopted: premium assets, templates, the CLI installer and the `--motion` GSAP snippets as instructions.
- Hooks: the selected files define none; `cli/**`, `docs/**`, `templates/**` and `.github/**` are excluded and were not inspected for hooks.
- Harmonization 2026-11-12 (claude-design-system-prompt intake): not merged with `aesthetic-direction` or `design-review`. This source looks rules and candidates up in packaged data and reports; that one commits a look with the user and fixes files. The boundary is in the intent exclusions.
- Harmonized by: prompts/harmonizer.md (2026-11-10 re-harmonization) — split from `visual-direction`. The source is guidance for any interface, including app screens, and its own query contract asks for the smallest search; inside the website step it ran a full design-system search on every page and forced guidance-only requests to fill palette, layout and offer outputs. The source's "REQUIRED for new pages" design-system search is not made a prerequisite of the website step, because the pinned taste-skill deals palette and type itself ("Deal, never choose by taste").
