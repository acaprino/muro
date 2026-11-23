# Marionette 0.6.0

Marionette can now set the layout of an interface in code, or review it, when the layout has to hold on a narrow phone screen, in a right-to-left language and with longer translated text. The new capability is `layout-structure`, from Jakub Krehel's `better-layout` skill.

- **Build or repair** (`ui.layout-structure`): grouping by space, shared alignment edges, logical properties so a layout mirrors for RTL, reading order that matches the page source, cues for hidden content, clearance between controls, insets and safe areas, container queries, breakpoints taken from the content, and room for longer translated text. It checks the code against the source's table of detection patterns (overflowing grid tracks, `100vw`, `100vh` on a mobile pane, fixed heights on text and others).
- **Review** (`ui.layout-review`): the same method, without changing the code. It reports each failure with a location, a severity and a `Block` or `Approve` verdict. Clipping or overlap at 320px or 200% zoom is always the highest severity.
- The source's numbers apply only where the project has no spacing scale of its own; otherwise the project's tokens govern. Anything it could not check without a browser is reported as `Not verified`.
- It is part of the `marionette-design-review` skill. Recording responsive limits as data in a `DESIGN.md` is still the design-file capability, and contrast, keyboard and touch-target checks are still the accessibility audit of design review. Both now say so.

The catalog has 38 capabilities from 17 sources. Nothing new acts in every session. The upstream has no release or tag, so the pin follows its head (`672ae44a`, MIT). Only `better-layout` is absorbed: the other skills of that repository are not, and the capability says which concerns it leaves out because of that (hit areas and focus, radius and shadows, animation, line length and text spacing, the words themselves).

Verification, on the commit just before these notes (`d53a3fe`): the Python suite for Marionette passed in GitHub Actions (864 passed, 2 skipped), as did the manifest validation, the source check against the pinned remotes, the package build and the project file pack. The routing benchmark now holds 97 cases; the three new ones are authored but were not scored by a host AI. The capability has not been run end to end on a real host.

Install the adapter for your host from the release archive to use the updated catalog.
