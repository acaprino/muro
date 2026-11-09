| id                 | role          | when                      | after                  | outputs                              |
|--------------------|---------------|---------------------------|------------------------|--------------------------------------|
| work-map           | coordinator   | —                      | —                      | task_map, step_sequence              |
| visual-direction   | art-direction | intent:ui                 | —                      | palette, typography, layout, constraints |
| motion-principles  | motion-spec   | intent:animation          | visual-direction       | motion-spec, reduced-motion          |
| gsap-scrolltrigger | scroll-code   | stack:gsap                | motion-principles      | code-patch, scroll-verified          |
| css-scroll         | scroll-code   | stack:css-only            | motion-principles      | code-patch, scroll-verified          |