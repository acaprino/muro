# Marionette 0.7.0

Marionette can now finish an interface that already works, and say with measurements whether its colours work. Both come from Charles Liu's `charles-skills`: `charles-polish` became the capability `interface-polish`, and `charles-color-analysis` became `color-critique`. They are found through a new skill, `marionette-polish`.

**Interface polish**

- **Polish** (`ui.craft-polish`): renders the screen at its real size and at the smallest size it will be seen, scores it against fixed anchors and names the weakest thing on it. It then fixes structure and unhappy states, runs a table of details (hit areas, contrast, layout shift, type and tracking, optical alignment, radius, focus, hover and press), and makes each motion correct: whether it should animate at all, its curve, its duration, and that it can be interrupted. It repeats until two passes in a row find nothing that changes the score.
- **Motion is checked frame by frame.** The source's scripts capture an animation on a virtual clock at 60 frames a second, plot how much each frame changes, and mark pops and dead stretches. Motion that could not be captured is reported as not verified.
- **Review** (`ui.craft-review`): the same reading without changing anything. Each finding has a severity, the evidence (a frame, a number, or a file and line) and the fix.
- A design system you recorded is not changed. Values that come from a project `DESIGN.md`, recorded tokens, palette or direction are reported, not rewritten; a recorded motion specification decides durations and easing where it differs from the source's.

**Colour critique** (`ui.color-critique`)

- Works on a poster or hero, a landing page, an app screen or a bare palette. It first decides what the visual is for, because the same colour is right on a poster and wrong on a settings screen.
- Measures area shares against 60/30/10, lightness, hue gaps, chroma, temperature and text contrast, then walks eleven checks in a fixed order.
- Gives each fix as an exact OKLCH and hex value, ranked by impact, and previews the top two before and after. It can also tell you whether someone else's colour critique is right, point by point.
- It changes no file. Boards and previews go to a scratch folder, and the palettes it proposes are candidates.

**What each needs**

- Colour critique: Python 3 with numpy and Pillow. Rendering a page needs Chrome or Chromium; reading the text inside an image works on macOS only, and elsewhere contrast is checked from colours you sample.
- Polish: nothing for the rules. The capture scripts need Node 18 or newer, two npm packages (`playwright-core` and `sharp`, installed once beside the scripts), Chrome, and ffmpeg for recordings. On Windows, set `CHROME_PATH` to the Chrome executable: the scripts look for Chrome only in the macOS and Linux locations. iOS Simulator captures need macOS.
- No API key.

**Boundaries with what was already there**

- The four reviews before shipping (accessibility, generic look, hierarchy and rhythm, missing states) are still design review. A screen that looks AI-generated goes there first.
- Deciding how an interface should move, as a specification with no code to correct, is still the motion specification.
- Choosing a palette or a look is still aesthetic direction or visual direction.

The catalog has 40 capabilities from 18 sources. Nothing new acts in every session. The upstream has no release or tag, so the pin follows its head (`83de509d`, MIT). Only these two skills are absorbed: the other skills of that repository are not.

Verification: on this machine the manifest validation, the source check against the pinned remotes, a staged build and the targeted Python tests passed (details in `docs/verification/2026-11-25-charles-skills-intake.md`). The full suite in GitHub Actions has not run on this change. The routing benchmark now holds 105 cases; the eight new ones are authored but were not scored by a host AI. Neither capability has been run end to end on a real host, and the scripts were read, not executed.

Install the adapter for your host from the release archive to use the updated catalog.
