---
id: visual-direction
role: art-direction
tools: [{"name":"shell","purpose":"Run the packaged taste-skill dealer (start.mjs) and screenshot script (shoot.mjs) with Node 22 or later.","required":true},{"name":"file-access","purpose":"Read the brief's material and the project's stack, and write the page in it.","required":true},{"name":"browser","purpose":"Chrome, Edge or Chromium, run headless by shoot.mjs for the screenshot review.","required":true}]
hooks: []
resumable: true
conflicts: []
when: —
intents: [{"id":"ui.visual-direction","description":"Design and build, or restyle, a company website or landing page with one dealt visual system (palette, type pairing, radius, layout by screens, hero and moments) fitted to the kind of business, in the project's own stack or as a static page; or stop at the recorded direction when only that is asked.","excludes":["A motion request does not by itself require redesign.","A static hero does not imply animation.","An app screen, dashboard, settings view or component library is interface work for design guidance, not a website page.","Slide decks, Office files, Figma files and interactive explainer articles have their own style steps."]},{"id":"ui.landing-strategy","description":"Define a landing page's offer, audience, one primary action, risk reversal, proof beside each claim, objections and a conversion-oriented outline and copy, alone or before the page is built.","excludes":["App screens do not require a sales funnel.","Copy for an email, an ad or a social post is not a landing page."]}]
after: []
outputs: ["offer", "page_outline", "palette", "typography", "layout", "constraints", "page"]
checks: ["single_primary_action", "proof_supported", "palette_applied", "typography_consistent", "house_rules_met", "screens_reviewed", "automated_gate_disclosed"]
---

# Visual Direction (website and landing page)

Plans, deals and builds a company website or landing page the way the pinned taste-skill does: the kind of business decides the plan, the copy comes first, palette and type are dealt rather than chosen by taste, and the built page is looked at in screenshots before it is reported. Landing strategy from landing-page-design feeds the brief and the copy. `<TS>` below stands for `<package_root>/scripts/taste-skill`.

## Behavior

0. **Scope by the selected intent.** Landing strategy alone stops after step 2. A direction without a build stops after step 4. Record every output not produced as `not requested: <reason>`.
1. **Read the brief.** Write the kind of business on the plan's first line (software, gaming, tech, product, service or place; `<TS>/SKILL.source.md` section 1), what is sold, who buys, the one main action and the real material: logo, screens, photographs, prices, address, hours. For a landing page also record the offer, audience, traffic source, objections and at least one risk reducer (free trial, free plan, no card, cancel anytime, money back). Ask for missing essentials in one batch; otherwise state the assumption and continue.
2. **Write the copy first** with `<TS>/references/copy.md`: the h1 names the category and the buyer or the place, one hard fact on the first screen, a noun in every heading, buttons as a verb and an object. A landing outline adds hero copy, three to five benefits, how it works in three steps, proof directly beside each claim, an FAQ of six to twelve questions (earlier for high-friction offers), an index or noindex recommendation and a final call to action identical to the top one. Never invent proof, reviews, customers, prices or figures.
3. **Plan the page as screens** with `<TS>/references/layout-v4.md` and `<TS>/references/sections.md`: the hero alone on the first screen, every section one or two screens tall at 1440×900, one idea and one picture per section.
4. **Deal palette and type.** Run from the project folder:
   - `node <package_root>/scripts/taste-skill/scripts/start.mjs deal --page <kind> --trade <trade> --history .taste-skill/history.json`; take the first palette and the first pairing, the next only when the first clashes with the client's logo or photographs, and say why the palette fits the trade;
   - `node <package_root>/scripts/taste-skill/scripts/start.mjs css --page <kind> --palette <id> --type <id> --radius <sharp|soft|round>` (sharp for fintech and developer tools, soft by default, round for consumer apps, square on a place), or `start.mjs brand ...` with the client's own colours;
   - keep the printed `:root` block and fonts link as printed.
   Hero composition and moments are chosen from the references for this brief, and the plan says they were chosen, not dealt (their dealers are not packaged).
5. **Build** in the project's own stack, or as a static page in an empty folder, with the dealt `:root` block and the system in `<TS>/references/system.md`. The stylesheet links that `start.mjs css` prints point to the source's kit, which is not packaged: do not add them. Keep the hover layer, the hero entrance and at most one or two moments (`<TS>/references/motion.md`).
6. **Look.** `node <package_root>/scripts/taste-skill/scripts/shoot.mjs --url <page> --w <width> --out shots/<width>.png --profile .taste-skill/chrome-check` at 1440, 1024, 768 and 390, then read every screenshot against the checklist and the "Never" list in `<TS>/SKILL.source.md` sections 5 and 6. Fix and shoot again, three rounds at most.
7. **Record** for the handoff below:
   - `offer`, `page_outline`: the strategy and outline (for a non-landing website, the main action and the screen plan).
   - `palette`, `typography`: the dealt or brand values and ids.
   - `layout`: the hero, the sections by screen and the moments.
   - `constraints`: the rules later steps must keep, including the motion budget, and any deviation from the source with its reason.
   - `page`: the files written and the screenshots, or `not requested`.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return every required output key as a JSON string. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- **House rules (pinned taste-skill):** no caption under any picture; every visual renders at every width; one section per screen; equal left and right edges; the hover micro-animations, one hero entrance and one or two moments; real photographs where they fit; real full-colour icons; shader effects and scenes only for a technical trade; addresses as street and district only. No gradient, print or effect on a non-technical page. Never violet or lavender in the page's own design. Never fade cards in on scroll, parallax text or scroll-jack.
- **Client and brand win.** The client's own colours go through `start.mjs brand`, and real logos keep their colours. When the client's brand itself uses a colour or device the source bans (a violet accent, a brand gradient), keep the client's and record it in `constraints`; the source's own violet shift does not override a client brand.
- **One owner of the look.** This step owns palette, typography and layout. landing-page-design's fixed font list, one-typeface rule, mandatory hero text gradient and universal Tailwind scale are not applied: they would be a second visual system. Use Tailwind's named scales only when the project uses Tailwind. Later steps consume these outputs and do not restyle independently.
- **Not packaged from the source:** the hero and moment dealers (`deal.mjs`, `moments.mjs`), the kit (`assets/` stylesheets, layouts, UI fragments, icons), the photograph tools, and the automated checks (`copy-lint.mjs`, `consistency.mjs`, `check.mjs`, `perf.mjs`, `gate.mjs`). Do not call them and do not claim their results.
- `start.mjs deal` writes `.taste-skill/` in the project (history and the finish-gate marker); tell the user. Nothing is written outside the project unless `TASTE_SKILL_RECENT` is set.

## Checks

- **single_primary_action**: one offer or main action is explicit, with no competing primary action on the first screen.
- **proof_supported**: every claim, price, figure and testimonial comes from the user's material or is left out.
- **palette_applied**: the page uses the dealt or brand `:root` block as printed; the plan states the palette and why it fits the trade.
- **typography_consistent**: one heading scale from the dealt pairing; its faces are loaded.
- **house_rules_met**: the house rules and the "Never" list above hold on the page, or each deviation is recorded in `constraints` with the client's reason.
- **screens_reviewed**: screenshots at 1440, 1024, 768 and 390 were taken with shoot.mjs and read against the checklist; only a browser that could not be installed makes this not-tested.
- **automated_gate_disclosed**: the report says that the source's automated checker and finish gate are not packaged and were not run.

## Sources

- AI intent mapping: taste-skill → ui.visual-direction, from its house rules, sections 1 to 6 and references; landing-page-design → ui.landing-strategy, from its intake, conversion, proof, FAQ and output-format sections. Both sources build the page after planning it (taste-skill "The run", steps 5 and 6; landing-page-design "Output format"), so this step builds too.
- Source: taste-skill (Leonxlnx/taste-skill@f6b76575, release v2.5.1) — `skills/taste-skill/SKILL.md`, `references/{system,sections,layout-v4,motion,copy}.md`, `library/{type,palettes}.json`, `assets/effects/fx.js`, `scripts/start.mjs`, `scripts/shoot.mjs`, packaged under `<package_root>/scripts/taste-skill/`.
- Source: ai-design-skills (elayadesign/ai-design-skills@456d9e0d) — `skills/landing-page-design/SKILL.md`; its visual mandates are scoped out (see Specifics). Its own rule "when the user's explicit prompt conflicts with a rule, the user wins" supports the brand rule.
- Runtime dependencies: Node.js 22+ and a Chrome, Edge or Chromium browser, both named by `SKILL.md` ("It needs Node 22+ and Chrome, Edge or Chromium"). Before step 4, check each; install a missing one from its official source (nodejs.org; an installed Edge or Chrome first, else google.com/chrome) for the current user, in one stated line, then check it answers. The source gives no install method. ffmpeg is optional upstream and serves only unselected film moments.
- Hooks: the pinned taste-skill SKILL.md declares a `Stop` command hook that runs `gate.mjs` (the finish gate) when the agent stops, and logs a missing-gate note in `.taste-skill/`. Not adopted: `gate.mjs` is not selected, and hooks are never installed or activated. landing-page-design defines none.
- Open intake gap: the source's run depends on files that are not selected (dealers, kit, photograph tools, checkers, gate). Selecting them, with their licenses, assets and the hook, is a re-intake decision for the owner.
- Harmonized by: prompts/harmonizer.md (2026-11-10 re-harmonization). The earlier version's "3 of 20 directions", "no eyebrow labels", "no numbering", "no thin rules", "no cream-and-terracotta", "one motion accent per view" and "honest code drawings" matched an unpinned local copy of the skill (tasteskill v2), not the pinned v2.5.1, and are removed or replaced by the pinned rules. The local design search moved to `design-guidance`, so a website build no longer runs it on every page.
