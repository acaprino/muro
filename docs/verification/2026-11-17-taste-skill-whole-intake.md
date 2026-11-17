# Marionette: taste-skill absorbed whole — 2026-11-17

## Status and authorization

The owner rejected a page that Marionette 0.3.0 built by hand in a real project
("marionette ha tutto!", "è l'unico motivo per cui avevamo creato marionette"),
approved the factory work ("ok"), asked how a source could ship images that the
gate refuses ("ma come può averle taste skill allora se non si potrebbero
usare?") and then said: "fai in modo che non accada mai più questa perdita di
tempo". This record covers what changed in the package. The factory changes are
in `2026-11-17-source-coverage-evidence.md`, ADR-0026 and ADR-0027.

Everything is in the working tree on `develop`. Nothing was committed, pushed,
released or installed, and `plugin.version` is still 0.3.0. The Marionette the
owner has installed is unchanged: it still carries 11 files of taste-skill.

## taste-skill

| | Before | After |
|---|---|---|
| Pin | `release` v2.5.1, `f6b76575` | the same |
| Selected | 11 files | `skills/taste-skill/**`: 1,631 files, 36.6 MB |
| Images | refused by the gate | 151, declared in `media_paths` |
| Credits | none | eight files in `notice_paths`, named in `NOTICE.md` |
| Left out, named by a selected file | 52 entries, unexplained | `README.md`, `install.sh`, each with a reason |
| Stop hook (finish gate) | dropped: nothing to run | active on Claude Code and Codex, timeout 600 s |

### What was read

Read whole: `SKILL.md` (381 lines). Read in part: `scripts/gate.mjs` (its
header, lines 1 to 98, and the no-build path around line 210),
`references/gate.md` ("As a hook" to the end), the top of four credit files,
`references/scenes.md` ("Check it"), `assets/scenes/_demo/shoot.mjs` (where it
writes its index), `assets/objects/product-render/README.md` (first lines).

Not read: the other twenty references, the other scripts and the kit's files.
The capability sends the host to them by file and section, as `SKILL.md` does.
So the rewritten steps restate `SKILL.md`; a rule that lives only in a
reference was not checked against the body.

### Images and their credits

A scratch script compared the 151 image files with the credit files:

- 127 are named in a credit file by file name or id.
- 24 are not: stills under `assets/objects/product-render/specs/`,
  `product-turntable/` and `print-globe/` named `fallback-*.png`. Their folders
  hold the code and the `make-posters`/`make-fallbacks` pages that render them.
  `assets/scenes/_demo/credits.json` calls two such stills "the skill's own
  object". They were judged the skill's own renders from that evidence; no
  upstream statement says so for each file.
- Licences the credit files state: Unsplash License, CC0, CC BY 2.0/3.0/4.0,
  CC BY-SA 2.0/3.0/4.0, Public Domain Mark 1.0; icons and logos CC0-1.0, MIT and
  ISC, with trademarks marked.

Not verified: no entry was checked against the page it names, and the library
file `photos.json` lists 413 photographs of which 66 are packaged as files.

### The capability

`visual-direction` follows `SKILL.md` "4. The run": it arms the gate, deals the
hero, palette, type and moments with the source's scripts, builds from the kit
(`assets/starter.html`), runs `copy-lint`, `consistency`, `check`, `shoot` and
`perf`, then the gate until `GATE: PASS` or `GATE: OPEN`.

Checks: `automated_gate_disclosed` is removed. `checks_run` and
`finish_gate_closed` are added; `finish_gate_closed` is `pass` only for
`GATE: PASS`. Four checks carry the condition "a page is built" so that a
direction without a build records them `not-applicable`.

Changes for coexistence, each with its collision in the capability's Sources:
the Stop hook's form, `shoot.mjs index` only with `--out`, and `gate.mjs --done`
when the step stops at the direction.

## The other sources

The gate refused ten more sources. A scratch script listed, for each named
entry, the lines that name it; each was judged from those lines and from what
the capabilities and `delivery.json` already record.

| Source | Result |
|---|---|
| wayfinder | `skills/engineering/research/SKILL.md` selected: wayfinder gives its research items to that skill; `work-map` now follows it. Two omissions. |
| ui-ux-pro-max | Two omissions: another skill of the repository, and second copies of three selected files (same Git blobs). |
| open-paper-skills | Three omissions. Open for the owner: the five viewer libraries, which the source ships and the package downloads at run time. |
| tokeneconomizer | Three omissions: what registers the original plugin, development files, presentation. |
| ponytail | Two omissions. |
| i-have-adhd | One omission. |
| egm | Four omissions. |
| superpowers | Four omissions. |
| zero-slop-design | Four omissions. |
| text-humanizer | One omission. |

Thirty omission entries in all, each with a reason in `sources.json`. Most
restate a decision already in `delivery.json`. Not done: the unselected files
were not opened, except wayfinder's research skill; an omission says why the
selected files name a path, not what the file holds.

Found and left open in `work-map`: wayfinder names its grilling,
domain-modeling, prototype and implement skills by skill name only. No path
names them, so the gate does not see them, and they were never read.

## motion-design re-pin

The source follows `head` and its upstream moved the same day, which stopped
the source check and the build.

| | |
|---|---|
| Old commit | `f9a8a041b85185ee4881b3471d3415e939aac772` |
| New commit | `2e1f3c052dd70c60b598413e2fc5d7704d9e9896` (2026-11-17T15:12:48Z), no release or tag upstream |
| Commits | 3: "Add Creator MCP handoff for file exports", its documentation fix, the merge |
| Selected paths changed | `skills/motion-design/SKILL.md` +17 lines; new `reference/export-and-render.md` (86 lines) |
| Not selected, changed | `README.md` +11 lines |
| `LICENSE`, `NOTICE` | not in the diff |

Both changed files were read whole. The handoff is carried in
`motion-principles` as step 0, a Specifics line and the optional tool
`creator-mcp`; the intent and the discovery entry name the rendered file.
`css-scroll` cites the same pin and relies on files that did not change.

## Commands and results

| Command | Result |
|---|---|
| `python muro_build.py --manifest examples/marionette/sources.json --validate` | `OK: capabilities and ROUTER.md valid` |
| `… --check-sources` | `OK: all sources and plugin identity valid`, 2 min 0 s, seventeen sources with the coverage gate |
| `… --prepare-intake taste-skill` | 28 s; `coverage.json`: 1,631 selected, 32 unselected, 2 referenced |
| `… --build --out <scratch>` | built in 3 min 24 s; release 283 MB |

In the staged release: 1,631 taste-skill files in the Claude Code adapter,
151 of them images; `hooks/hooks.json` holds one `Stop` entry with timeout 600;
`NOTICE.md` names the eight credit files.

## Packaged scripts, run outside the checkout

Run with Node 24.14.1 from the staged Claude Code adapter, in an empty scratch
folder. This proves the scripts run from the package; no model was involved.

| Step | Result |
|---|---|
| `gate.mjs --start index.html --kind software …` | build started, 3 rounds |
| `assets/layout/deal.mjs --type software --has ui` | dealt the `split` hero |
| `start.mjs deal --page software --trade saas` | three palettes and the type pairings printed |
| `moments.mjs pick --page software --count 1` | dealt `word-highlight` |
| copy `assets/` into the project, `starter.html` as `index.html` | 1,594 kit files |
| `copy-lint.mjs index.html --kind software` | 0 FAIL, 0 WARN |
| `shoot.mjs --w 1440` | screenshot written, 22 s |
| `consistency.mjs --quick --widths 1440,390` | 33 FAIL, 21 WARN on the untouched starter, 1 min 14 s |
| `gate.mjs index.html` | `GATE: FAIL 33 (round 1 of 3)`, 1 min 18 s |

The 33 FAILs are the starter's placeholders: the page was never filled in.

One failure not explained: the first gate run, given
`--profile .taste-skill/chrome-gate`, ended `GATE: ERROR (consistency.mjs gave
no report (exit 1: Error: Chrome exited early (21)))`. Without the flag, as the
capability calls it, it ran. The cause was not looked for.

`start.mjs deal --trade "task manager"` is refused: the trade is one of the
source's nineteen names (`saas` among them).

## The Stop hook, as the release registers it

The command of the staged `hooks/hooks.json` was run with `CLAUDE_PLUGIN_ROOT`
set, the hook's JSON on stdin.

| Folder | Result |
|---|---|
| A project with no build (4 runs) | exit 0, nothing printed, nothing written, 0.5 to 0.6 s |
| The scratch build with 33 open FAILs | exit 0 in 1.0 s, `{"decision":"block","reason":"tasteskill gate: nothing changed since round 1 of 3, and 33 FAILs remain. …"}` |

## Live host: Claude Code

Claude Code 2.1.325, model `claude-haiku-5-5`, the package alone
(`--setting-sources project,local --strict-mcp-config`), `--plugin-dir` on the
staged adapter, `--permission-mode dontAsk --allowedTools "Skill"`,
`--max-budget-usd 1 --no-session-persistence`. Two sessions, one at a time.

| Session | Folder | Result | Turns | Denials | Cost |
|---|---|---|---:|---:|---:|
| 1 | scratch project whose build was closed | plugin `marionette@inline` loaded; the model listed 17 skills (the umbrella and 16 entries); at the stop `gate.json` gained `{"mode":"hook","host":"claude","decision":"allow","reason":"no build is active here"}` | 1 | 0 | $0.0102 |
| 2 | scratch project, build armed, 33 FAILs | the model answered; the stop was blocked and the model received "Stop hook feedback: tasteskill gate: … 33 FAILs remain"; it read the files, was denied Bash, asked for the brief and stopped; that second stop was allowed ("allowed once without a round") | 7 | 1 | $0.0143 |

In session 2 the host also showed the notice "Stop hook error occurred": its
label for a stop that a hook blocks. No session folder was left under
`~/.claude/projects/`.

## After the live sessions

Three texts of the package changed after the staged build that the live
sessions used: the capability's commands were respelled from `node <TS>/…` to
`node <package_root>/scripts/taste-skill/…` (a test requires a helper command
to name its path from the package root), two lines of the router's record were
merged to stay under its cap, and the hook's measured cost was written into
`delivery.json` and the capability. The live sessions never opened the
capability body, so they say nothing about these. The final tree was built
once more by `tests/test_capabilities_read_originals.py` (43 passed), which
also checks that every packaged file a capability names is in the release.
The test results, and the local run the host stopped for lack of memory, are
in `2026-11-17-source-coverage-evidence.md`.

## Not executed

- **No model built a page with the new capability.** The live sessions prove
  that the plugin loads and that the hook allows and blocks. Whether a host
  follows the rewritten steps to a `GATE: PASS` is not shown. The first real
  build is the test.
- Codex, Pi, OpenCode and Hermes: nothing was run. The Codex wiring is built
  and never executed; Codex asks the user to review a plugin's hooks first.
- `photos.mjs` and `icons.mjs` (network), `perf.mjs`, `check.mjs`, the full
  `consistency.mjs` at five widths, and a gate run to PASS.
- The routing eval (`--prepare-eval`, `--score-eval`), although one intent
  description and one discovery entry changed.
- The full suite in the `Tests` workflow: nothing was pushed.
- Not re-read: the capabilities of the nine sources that only gained omissions.
