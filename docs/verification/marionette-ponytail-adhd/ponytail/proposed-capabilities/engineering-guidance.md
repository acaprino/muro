---
id: engineering-guidance
role: engineering-method-guide
when: -
after: []
outputs: ["engineering_guidance"]
checks: ["request_answered_without_mutation", "method_and_transport_distinguished", "benchmark_provenance_and_limits", "no_counterfactual_savings"]
intents: [{"id":"engineering.working-guidance","description":"Explain the package's smallest-complete-change method, its safety and verification boundaries, available review/audit/debt procedures, or requested task-level choices about how strongly to suggest simplifications.","excludes":["Executing a code change or producing a full code review.","Installing the original Ponytail plugin or promising its absent global mode toggles, statusline, band, dashboard or webhooks.","Changing the host's model, permission settings or system identity."]},{"id":"engineering.benchmark-evidence","description":"Explain Ponytail's published measured benchmark of its working method, including the reported code, token, cost, time and testing results and the experiment's scope and limitations.","excludes":["Claiming measured savings for Marionette or the current repository without a real comparison.","Running a paid benchmark or projecting provider prices.","Substituting published benchmark figures for actual TokenEconomizer session measurements."]}]
tools: [{"name":"file-access","purpose":"Read the packaged method and published benchmark reference when answering, without editing project files or source mode state.","required":true}]
hooks: []
conflicts: []
---

# Engineering Method and Evidence

Answers requests about the working method and its published evidence without changing project files, registering hooks or switching an upstream runtime mode.

## Behavior

1. Answer only the requested explanation. For method help, explain complete scope before simplification, reuse of existing project patterns, readable minimal changes, preserved safeguards, meaningful checks and honest limits. Point to engineering-review for a requested change review or repository audit and engineering-debt for a shortcut ledger.
2. Preserve the source's preference meanings as explicit choices for this task: lite performs the requested scope and names a smaller option; full applies the smallest complete method; ultra additionally examines whether proposed scope is justified before building. None permits skipping requested functionality or replacing an approved engine/design. A preference is not a fabricated persistent mode or permission to execute a different task.
3. Be explicit about the adaptation: Marionette's declared permanent guidance is carried by its native adapter; this capability does not disable or rewrite it. The original Ponytail off/default commands, session flags, installation/update commands, badge, band, dashboard/import/export and webhook controls are not included in this curated integration. Do not suggest that invoking source command names activates them.
4. For benchmark evidence, read `<package_root>/scripts/ponytail/benchmarks/results/2026-10-07-agentic.md`. Attribute results to the published Ponytail 5 experiment, dated 2026-10-07: Claude Code CLI 2.1.288, Opus 5.5/default effort, 39 tasks, five runs per task per arm, three arms (585 sessions).
5. Report the published comparison with no skill accurately: code lines -53%, output tokens -45%, cost -26%, time -41%; tests where the logic needs one 98% versus 68%. Hidden checks cover only 18 surgical tasks: 87/90 (96.7%) versus 86/90 (95.6%). Include confidence intervals or per-task evidence when relevant instead of overstating a rounded scoreboard.
6. State how figures were calculated (geometric mean of task-median ratios) and the key limits: shell was disabled during agent runs; the harness ran checks afterwards; most tasks did not supply hidden correctness checks; the study is published upstream evidence, not a rerun of Marionette. User-facing charts/tables may replace the source's fixed ASCII layout.
7. Never invent a current-repository baseline or say the user saved a counterfactual number of lines/tokens. Actual shortcut counts belong to engineering-debt; actual agent-session measurements belong to token-economy. Help/evidence display creates no file or mode state unless the user separately asks to save the explanation.

## Output handoff

Return `engineering_guidance` (the requested explanation, cited packaged references and material limits) as a JSON string. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- The packaged source help remains reference material, not competing routing authority. Use the user's language and requested level of detail.
- There is no runtime dependency, model call, source plugin installation, telemetry or adopted hook for displaying these explanations.

## Checks

- **request_answered_without_mutation**: the requested help/evidence was answered without source edits, mode flags or host configuration changes.
- **method_and_transport_distinguished**: task preferences were not presented as native global toggles; unsupported original plugin controls were identified honestly.
- **benchmark_provenance_and_limits**: any numbers retain their source experiment, date, sample, calculation and relevant limits; they were not represented as newly verified measurements.
- **no_counterfactual_savings**: no invented per-repository or Marionette savings were claimed.

## Sources

- Source: ponytail (DietrichGebert/ponytail@7801d061243d7b753bad0e0b3c057cd250b11755, release v5.3.3, MIT) — `skills/ponytail-help/SKILL.md`, `skills/ponytail-gain/SKILL.md`, `skills/ponytail/SKILL.md` (Levels) and `benchmarks/results/2026-10-07-agentic.md` (Setup, Results, Correctness and safety, Tests).
- AI mapping: ponytail-help and requested level meanings → engineering.working-guidance; ponytail-gain and its benchmark reference → engineering.benchmark-evidence. Core behavior also becomes permanent guidance and enriches work-map; the original persona and controller do not.
- Original plugin installation/updating, own-skill routing, session/default state and optional host UI/telemetry were inspected and intentionally excluded from selection. Their mention in selected help does not mean Marionette exposes them.

