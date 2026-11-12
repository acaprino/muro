---
id: engineering-guidance
role: engineering-method-guide
when: "—"
after: []
outputs: ["engineering_guidance"]
checks: ["request_answered_without_mutation", "method_and_transport_distinguished", "benchmark_provenance_and_limits", "no_counterfactual_savings"]
intents: [{"id":"engineering.working-guidance","description":"Explain the Ponytail method, safeguards, review/audit/debt procedures and task-level simplification preferences.","excludes":["Executing a code change or producing a full code review.","Installing the original Ponytail plugin or promising its absent global mode toggles, statusline, band, dashboard or webhooks.","Changing the host's model, permission settings or system identity."]},{"id":"engineering.benchmark-evidence","description":"Explain Ponytail's published code, token, cost, time and testing benchmark, its method and limits.","excludes":["Claiming measured savings for Marionette or the current repository without a real comparison.","Running a paid benchmark or projecting provider prices.","Substituting published benchmark figures for actual TokenEconomizer session measurements."]}]
tools: [{"name":"file-access","purpose":"Read the packaged method and published benchmark reference when answering, without editing project files or source mode state.","required":true}]
hooks: []
conflicts: []
---

# Engineering Method and Evidence

Answers requests about the working method and its published evidence without changing project files, registering hooks or switching an upstream runtime mode.

## Behavior

0. **Read the originals first.** Read whole, before answering, the packaged originals of the requested intent. They are the content in the source's own words:
   - method help: `<package_root>/scripts/ponytail/skills/ponytail-help/SKILL.source.md` and `<package_root>/scripts/ponytail/skills/ponytail/SKILL.source.md`;
   - benchmark evidence: `<package_root>/scripts/ponytail/skills/ponytail-gain/SKILL.source.md` and `<package_root>/scripts/ponytail/benchmarks/results/2026-10-07-agentic.md`.
   Where this body and an original differ, the original wins, except for the changes listed under the Sources section below, "Changes for coexistence".
1. Method help. Show the help card's `## Levels` and `## Skills` tables in the source's words (the "What change" and "What it does" columns) and its `## More` link. Each "Trigger" cell is replaced by how the method is reached here: the working method through the package's permanent policy and work-map, review and audit through engineering-review, the shortcut ledger through engineering-debt, the scoreboard and this card through this capability. For the method itself, use `## Before you write`, `## The smallest complete change` and the "Never cut:" line of the ponytail skill file. Answer only the requested explanation; point to engineering-review or engineering-debt when the user wants that work done.
2. Levels, from the ponytail skill file's `## Levels`: lite "Build what was asked. Name the smaller option in one line and let the user pick."; full "The rules above. Default."; ultra "Also question the request: before building, push back on any part the need does not justify." Here a level is a preference the user states for a task; it is not a stored mode.
3. Be explicit about the adaptation: Marionette's declared permanent guidance is carried by its native adapter; this capability does not disable or rewrite it. The help card's `## Deactivate`, `## Band (Claude Code)`, `## Configure Default Mode` and `## Update` sections and "Level sticks until changed or session end." describe the original plugin and are not included in this curated integration. Do not suggest that invoking source command names activates them.
4. Benchmark evidence. "Display this scoreboard": render the `## Scoreboard` of the gain file as it is written ("Render plain ASCII bars"), with its figures: lines of code 47% (▼ 53%), output tokens 55% (▼ 45%), cost 74% (▼ 26%), time 59% (▼ 41%), "Hidden checks passed   97%  (no-skill 96%)", "Tests where the logic needs one   98%  (no-skill 68%)". Its two "This repo:" lines name engineering-debt (the shortcut ledger) and engineering-review (the repository audit) instead of the slash commands.
5. Attribute the figures as the gain file does: "the published agentic benchmark of Ponytail 5: headless Claude Code (Opus 5.5, default effort) on 39 tasks", "5 runs each, against the same agent without the skill. 18 of the tasks have hidden checks for correctness and safety. Each figure is the geometric mean of the per-task medians. They are measured, not computed from the current repo." The benchmark file dates it 2026-10-07, Claude Code CLI 2.1.288, "5 per task and arm, 585 sessions", three arms.
6. When the user asks for method or limits, use the benchmark file's `## Setup` (with its **Statistics** paragraph), `## Results`, `### Correctness and safety`, `### Tests`, `### Replies` and `## Per task`, in its words and with its numbers and intervals. Limits it states: "Bash is disabled for every arm"; "Only the 18 surgical tasks have hidden checks that run the code", where the result is 87/90 (96.7%) for Ponytail 5 against 86/90 (95.6%) for no skill; "The other 21 tasks are there to measure code size."
7. `## Honesty boundary` of the gain file: "These are benchmark averages, not this repo. NEVER print a per-repo savings number ("you saved X lines/tokens here"): the unbuilt version was never written, so there is no real baseline to subtract from in a live repo." The figures measure the published Ponytail plugin, not Marionette. Actual shortcut counts belong to engineering-debt; actual agent-session measurements belong to token-economy. "One-shot display. Edits nothing, changes no mode."

## Output handoff

Return `engineering_guidance` (the requested explanation, cited packaged references and material limits) as a JSON string. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- The packaged help, gain and benchmark files are reference material, not competing routing authority.
- There is no runtime dependency, model call, source plugin installation, telemetry or adopted hook for displaying these explanations.

## Checks

- **request_answered_without_mutation**: the requested help/evidence was answered without source edits, mode flags or host configuration changes.
- **method_and_transport_distinguished**: task preferences were not presented as native global toggles; unsupported original plugin controls were identified honestly.
- **benchmark_provenance_and_limits**: any numbers retain their source experiment, date, sample, calculation and relevant limits; they were not represented as newly verified measurements.
- **no_counterfactual_savings**: no invented per-repository or Marionette savings were claimed.

## Sources

- Source: ponytail (DietrichGebert/ponytail@7801d061243d7b753bad0e0b3c057cd250b11755, release v5.3.3, MIT) — `skills/ponytail-help/SKILL.md`, `skills/ponytail-gain/SKILL.md`, `skills/ponytail/SKILL.md` (Levels) and `benchmarks/results/2026-10-07-agentic.md` (Setup, Results, Correctness and safety, Tests). All four are packaged under `<package_root>/scripts/ponytail/` (each `SKILL.md` as `SKILL.source.md`) and read at run time.
- AI mapping: ponytail-help and requested level meanings → engineering.working-guidance; ponytail-gain and its benchmark reference → engineering.benchmark-evidence. Core behavior also becomes permanent guidance and enriches work-map; the original controller does not.
- Changes for coexistence (ADR-0017):
  - The frontmatter of the help and gain files (trigger phrases, `/ponytail-help`, `/ponytail-gain`), the "Trigger" column of both help tables and the Codex `$ponytail:` forms are not carried: slash and phrase activation competes with the coordinator, and the package registers no source command. The cells name the Marionette capability that does the work.
  - "Level sticks until changed or session end.", `## Deactivate`, `## Band (Claude Code)`, `## Configure Default Mode` and `## Update` are not applied: no supported host can run them from this package, because the source's hooks, band and plugin manifests are not selected, and installing or updating the source plugin is outside the factory contract. A level is a preference stated for a task.
  - The scoreboard's "This repo:  /ponytail-debt" and "/ponytail-audit" lines, and "The only real per-repo figures come from `/ponytail-debt`", name engineering-debt and engineering-review: same routing collision.
  - Added: "The figures measure the published Ponytail plugin, not Marionette", and actual session measurements are sent to token-economy. Marionette carries the rules in a scoped policy the benchmark did not run, and token-economy is the one owner of measured session costs.
  - The benchmark file's `## Reproduce` section is not run: `benchmarks/agentic/` is excluded from the package.
  - The explanation is also handed over as `engineering_guidance` through the coordinator (factory contract: output handoff).
- Original plugin installation/updating, own-skill routing, session/default state and optional host UI/telemetry were inspected and intentionally excluded from selection. Their mention in selected help does not mean Marionette exposes them.


Harmonized by: `prompts/harmonizer.md` (2026-11-12). Re-read against the pinned originals under ADR-0017: the body indexes the packaged original files, which are the content.
