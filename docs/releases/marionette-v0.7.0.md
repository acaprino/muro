# Marionette 0.7.0

Marionette absorbs five of Charles Liu's design skills, from `charles-skills`, as five new capabilities. It can now finish an interface that already works, say with measurements whether its colours work, design or review a screen by the laws of UX, apply practical design tips, and build or review how an interface moves and responds.

| Skill | Capability | Found through |
|---|---|---|
| `charles-polish` | `interface-polish` | `marionette-polish` |
| `charles-color-analysis` | `color-critique` | `marionette-polish` |
| `charles-design-laws` | `ux-laws` | `marionette-ux` |
| `charles-design-tips` | `design-tips` | `marionette-ux` |
| `charles-ux-animation` | `interaction-motion` | `marionette-motion` |

**Interface polish**

- **Polish** (`ui.craft-polish`): renders the screen at its real size and at the smallest size it will be seen, scores it against fixed anchors and names the weakest thing on it. It then fixes structure and unhappy states, runs a table of details (hit areas, contrast, layout shift, type and tracking, optical alignment, radius, focus, hover and press), and makes each motion correct. It repeats until two passes in a row find nothing that changes the score.
- **Motion is checked frame by frame.** The source's scripts capture an animation on a virtual clock at 60 frames a second, plot how much each frame changes, and mark pops and dead stretches. Motion that could not be captured is reported as not verified.
- **Review** (`ui.craft-review`): the same reading without changing anything.

**Colour critique** (`ui.color-critique`)

- Works on a poster or hero, a landing page, an app screen or a bare palette. It first decides what the visual is for, because the same colour is right on a poster and wrong on a settings screen.
- Measures area shares against 60/30/10, lightness, hue gaps, chroma, temperature and text contrast, then walks eleven checks in a fixed order.
- Gives each fix as an exact OKLCH and hex value, ranked by impact, and previews the top two before and after. It changes no file.

**UX laws** (`ui.ux-laws`, `ui.ux-laws-review`)

- For a screen or flow that feels confusing, cluttered or hard to use: forms, settings, dashboards, checkout, onboarding.
- Twenty laws in one fixed order: cut what no task needs, let the product fill in what it can know, default to the free and private choice, group with the lightest signal, make one thing stand out, show progress, end on a screen that says what happened.
- It builds in the product's code, or reviews without changes and returns a table with severity, law, where, before and after.

**Design tips** (`ui.design-tips`, `ui.design-tips-review`)

- For a screen that works but looks thrown together.
- Twenty measured tips: line height and weight, the height and padding of buttons and fields, space around headings, Delete away from Save, tinted greys, text on colour, layered shadows, labels above fields, right-aligned table numbers, sentence case, button labels that say what they do, empty states with a next step.
- Fixes go into the project's own tokens. It has no rules on motion.

**Interaction motion** (`ui.interaction-motion`, `ui.interaction-review`)

- Writes, in the project's code, the animation and feedback people trigger: whether an interaction should animate at all, its duration, curve and origin, press and hover feedback, loading and optimistic states. Until now only scroll-linked animation had a step that implemented it.
- Has exact recipes for modals, drawers, popovers, tooltips, toasts, icon swaps, async buttons and sliders.
- Also covers target sizes, the number of choices, tolerant input, undo and the end of a flow.

**How these fit with what was already there**

- **A system you recorded wins.** The order is unchanged: your request, then a project `DESIGN.md`, then a Master or tokens in the repository, then a recorded direction or motion specification. Only after that does a step apply its own source's numbers. A value that comes from a recorded system is reported, not rewritten.
- **`ui-ux-pro-max` stays the lookup.** Asking which rules apply, with no code to change, or naming UI Pro Max, still goes to design guidance, and its results stay proposals.
- **Where sources give different numbers, none is rewritten.** Examples: body line height is 1.4–1.5 in the design tips and 1.5–1.75 in `ui-ux-pro-max`; an exit is 20–30% shorter than its entrance in one and about 30–40% in the other. A step names the value that satisfies both where there is one (1.5; 30%). Where there is none, such as confirming a destructive action against offering Undo, it follows its own method and names the difference in its report.
- The four reviews before shipping are still design review, and a screen that looks AI-generated goes there first. Deciding motion as a specification is still the motion specification. Choosing a palette or a look is still aesthetic direction or visual direction.

**What each needs**

- Colour critique: Python 3 with numpy and Pillow. Rendering a page needs Chrome or Chromium; reading the text inside an image works on macOS only.
- Polish: nothing for the rules. The capture scripts need Node 18 or newer, two npm packages (`playwright-core` and `sharp`, installed once beside the scripts), Chrome, and ffmpeg for recordings. On Windows, set `CHROME_PATH` to the Chrome executable. iOS Simulator captures need macOS.
- UX laws, design tips and interaction motion: nothing. A browser lets them run their checks on the rendered screen; without one they list the checks they could not run.
- No API key.

The catalog has 43 capabilities from 18 sources. Nothing new acts in every session. The upstream has no release or tag, so the pin follows its head (`83de509d`, MIT). Only these five skills are absorbed; the other skills of that repository are not.

Verification is recorded in `docs/verification/2026-11-25-charles-skills-intake.md` (the first two skills) and `docs/verification/2026-11-25-charles-drops-intake.md` (the other three), with what was run and what was not. No capability of this release has been run end to end on a real host, and the scripts were read, not executed.

Install the adapter for your host from the release archive to use the updated catalog.
