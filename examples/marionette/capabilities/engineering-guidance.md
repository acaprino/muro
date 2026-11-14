---
id: engineering-guidance
role: engineering-method-guide
when: "—"
after: []
outputs: ["engineering_guidance"]
checks: ["request_answered_without_mutation", "method_and_transport_distinguished", "benchmark_provenance_and_limits", "no_counterfactual_savings"]
intent_checks: {"engineering.working-guidance": ["request_answered_without_mutation", "method_and_transport_distinguished", "no_counterfactual_savings"], "engineering.benchmark-evidence": ["request_answered_without_mutation", "benchmark_provenance_and_limits", "no_counterfactual_savings"]}
intents: [{"id":"engineering.working-guidance","description":"Explain the Ponytail method, safeguards, review/audit/debt procedures and task-level simplification preferences.","excludes":["Executing a code change or producing a full code review.","Installing the original Ponytail plugin or promising its absent global mode toggles, statusline, band, dashboard or webhooks.","Changing the host's model, permission settings or system identity."]},{"id":"engineering.benchmark-evidence","description":"Explain Ponytail's published code, token, cost, time and testing benchmark, its method and limits.","excludes":["Claiming measured savings for Marionette or the current repository without a real comparison.","Running a paid benchmark or projecting provider prices.","Substituting published benchmark figures for actual TokenEconomizer session measurements."]}]
tools: [{"name":"file-access","purpose":"Read the packaged method and published benchmark reference when answering, without editing project files or source mode state.","required":true}]
hooks: []
conflicts: []
---

# Engineering Method and Evidence

Answers requests about the working method and its published evidence. It is a one-shot answer: it edits nothing, registers no hook and changes no mode.

The packaged originals are the full version: where this body differs, the original wins, except for the changes listed in the Sources section. Open only the file and section the request needs.

## Behavior

Method help (engineering.working-guidance):

1. For an overview, open `<package_root>/scripts/ponytail/skills/ponytail-help/SKILL.source.md` and show its `## Levels` and `## Skills` tables with their "What change" and "What it does" columns and its `## More` link. Replace each "Trigger" cell with how the method is reached here: the working method through the package's permanent policy and work-map, review and audit through engineering-review, the shortcut ledger through engineering-debt, the scoreboard and this card through this capability.
2. For a question about the rules themselves, open `<package_root>/scripts/ponytail/SKILL.source.md`: `## Before you write`, `## The smallest complete change` and its "Never cut:" line.
3. Levels (`## Levels` of that file): lite builds what was asked, names the smaller option in one line and lets the user pick; full is the rules as written and the default; ultra also questions the request and pushes back, before building, on any part the need does not justify. Here a level is a preference the user states for a task, not a stored mode.
4. Be explicit about the adaptation. The permanent guidance is carried by Marionette's native adapter; this capability does not disable or rewrite it. The help card's `## Deactivate`, `## Band (Claude Code)`, `## Configure Default Mode` and `## Update` sections and its "Level sticks until changed or session end." describe the original plugin, which this package does not include: do not present them as available, and do not suggest that source command names activate anything.
5. Answer only what was asked; point to engineering-review or engineering-debt when the user wants that work done.

Benchmark evidence (engineering.benchmark-evidence):

6. Open `<package_root>/scripts/ponytail/skills/ponytail-gain/SKILL.source.md` and render its `## Scoreboard` as written, in plain ASCII bars where the bar length is Ponytail's share of the no-skill baseline. Header `benchmark · 39 tasks × 5 runs · Opus 5.5`; no-skill 100%; Lines of code 47% (▼ 53%); Output tokens 55% (▼ 45%); Cost 74% (▼ 26%); Time 59% (▼ 41%); `Hidden checks passed   97%  (no-skill 96%)`; `Tests where the logic needs one   98%  (no-skill 68%)`. Its two "This repo:" lines name engineering-debt (shortcuts you deferred) and engineering-review (what's still cuttable).
7. Attribute the figures: the published agentic benchmark of Ponytail 5, headless Claude Code (Opus 5.5, default effort) on 39 tasks (feature tickets in a real FastAPI + React repo, bug fixes, security and privacy cases, small apps), 5 runs each, against the same agent without the skill; 18 of the tasks have hidden checks for correctness and safety; each figure is the geometric mean of the per-task medians. They are measured, not computed from the current repo. The benchmark file dates the run 2026-10-07, Claude Code CLI 2.1.288, 5 runs per task and arm, 585 sessions, three arms.
8. When the user asks about method, intervals, limits or single tasks, open `<package_root>/scripts/ponytail/benchmarks/results/2026-10-07-agentic.md` at the section that answers: `## Setup` (with its **Statistics** paragraph), `## Results`, `### Correctness and safety`, `### Tests`, `### Replies`, `## Per task`. Give its numbers and intervals unchanged. Limits it states: Bash is disabled for every arm; only the 18 surgical tasks have hidden checks that run the code, where Ponytail 5 passed 87/90 (96.7%) against 86/90 (95.6%) for no skill; the other 21 tasks only measure code size.
9. Honesty boundary: these are benchmark averages, not this repo. NEVER print a per-repo savings number ("you saved X lines/tokens here"): the unbuilt version was never written, so there is no real baseline to subtract from. The figures measure the published Ponytail plugin, not Marionette. The only real per-repo figure is the counted ledger of engineering-debt; actual agent-session measurements belong to token-economy.

## Output handoff

Return `engineering_guidance` (the requested explanation, cited packaged references and material limits) as a JSON string. For a mapped step, submit it through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- The packaged help, gain and benchmark files are reference material, not competing routing authority.
- There is no runtime dependency, model call, source plugin installation, telemetry or adopted hook for these explanations.

## Checks

- **request_answered_without_mutation**: the requested help/evidence was answered without source edits, mode flags or host configuration changes.
- **method_and_transport_distinguished**: task preferences were not presented as native global toggles; unsupported original plugin controls were identified honestly.
- **benchmark_provenance_and_limits**: any numbers retain their source experiment, date, sample, calculation and relevant limits; they were not represented as newly verified measurements.
- **no_counterfactual_savings**: no invented per-repository or Marionette savings were claimed.

## Sources

- Source: ponytail (DietrichGebert/ponytail@7801d061243d7b753bad0e0b3c057cd250b11755, release v5.3.3, MIT) — `skills/ponytail-help/SKILL.md`, `skills/ponytail-gain/SKILL.md`, `skills/ponytail/SKILL.md` and `benchmarks/results/2026-10-07-agentic.md`, all packaged under `<package_root>/scripts/ponytail/` (each `SKILL.md` as `SKILL.source.md`).
- AI mapping: ponytail-help and requested level meanings → engineering.working-guidance; ponytail-gain and its benchmark reference → engineering.benchmark-evidence. Core behavior also becomes permanent guidance and enriches work-map; the original controller does not.
- Changes for coexistence (ADR-0017):
  - The trigger phrases, `/ponytail-help`, `/ponytail-gain`, the "Trigger" column of both help tables and the Codex `$ponytail:` forms are replaced by the Marionette capability that does the work: slash and phrase activation competes with the coordinator, and the package registers no source command.
  - "Level sticks until changed or session end.", `## Deactivate`, `## Band (Claude Code)`, `## Configure Default Mode` and `## Update` are not applied: no host can run them from this package, whose selection has no source hooks, band or plugin manifests. A level is a preference stated for a task.
  - The scoreboard's `/ponytail-debt` and `/ponytail-audit` lines, and the honesty boundary's `/ponytail-debt`, name engineering-debt and engineering-review: same routing collision.
  - Added: the figures measure the published Ponytail plugin, not Marionette, and session measurements go to token-economy, the one owner of measured session costs; Marionette carries the rules in a scoped policy the benchmark did not run.
  - The benchmark file's `## Reproduce` commands cannot run: no host has `benchmarks/agentic/` in this package.
  - The explanation is also handed over as `engineering_guidance` through the coordinator (output handoff).
- Original plugin installation/updating, own-skill routing, session/default state and optional host UI/telemetry were inspected and intentionally excluded from selection. Their mention in selected help does not mean Marionette exposes them.

Harmonized by: `prompts/harmonizer.md` (2026-11-12). Compared with the pinned originals under ADR-0017; second pass the same day: an entry prompt in the package's words with pointers to the packaged originals.
