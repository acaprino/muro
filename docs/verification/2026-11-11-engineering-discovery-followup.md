# Engineering discovery: resumed verification, 2026-11-11

## Scope and recovered stopping point

The owner's `riprendi` resumes the last exchange: challenge the claimed cause of
Marionette's missing engineering discovery, then test with Superpowers disabled
for that session only. The earlier live runs had finished; their transcripts
were summarized in `2026-11-11-claude-code-host-test.md`. The pending work was
the ablation, not waiting for those runs or implementing the suggested hook.

The prior record now carries an additive correction. No routing, capability,
source pin, hook, installation or user configuration was changed in this follow-up.
Existing uncommitted work is preserved. No commit or push was made.

## Exact recovered request and comparison

The command was recovered from the previous local Claude Code session transcript:

> Voglio aggiungere a questa app gli account con login e i carrelli salvati tra una visita e l'altra. Non ho ancora deciso come gestire le sessioni né dove salvare i dati, ed è un lavoro di più giorni. Organizzalo.

The historical invocation used `--permission-mode dontAsk`,
`--allowedTools "Skill,Read,Glob,Grep"`, `--output-format stream-json`, `--verbose`,
`--max-budget-usd 2`, `--no-session-persistence`, and a temporary `--plugin-dir`.
The installed CLI still answers `2.1.322 (Claude Code)`. Its current default
model settings differ from the earlier conversation, so a future comparison
must hold one explicit model/effort constant in both arms and record the actual
model from each init event rather than treating the earlier run as its control.

The intended diagnostic holds the release, request, initial Express project and
tool permissions constant. The session settings differ only in
`enabledPlugins["superpowers@claude-plugins-official"]` (true versus false).
Other plugins, including absorbed originals, stay constant. This does not edit
the owner's installed configuration. Verify effective loading, the requested
entry's availability, invoked skills, runtime calls, permission denials, actual
output, model, token usage, cost and duration in both transcripts.

Interpretation boundaries:

- Marionette invoked only without Superpowers: consistent with interference in
  this pair; repeat and broaden requests before generalizing.
- Marionette absent in both: disabling Superpowers is insufficient in that
  setup; do not identify it as the sole cause.
- Marionette invoked in both: the earlier absence is not reproduced in the
  control; the old causal claim remains unsupported.
- Plugin still loaded in the off arm, missing entry, startup failure, changed
  fixtures/model or missing final result: inconclusive comparison.

These compare discovery. A `plan` call and a validated classification are
separate routing observations; successful delivery needs its own evidence.

## Preparation attempted here

The required fresh build was attempted through the normal factory command:

```powershell
$env:TEMP = 'C:\Users\alfio\AppData\Local\Temp'
$env:TMP = $env:TEMP
python muro_build.py --manifest examples/marionette/sources.json --build --out C:\Users\alfio\AppData\Local\Temp\muro-discovery-ablation-20261111-2135\release
```

It failed during the first pinned source fetch:

```text
Build failed: fatal: unable to access 'https://github.com/Leonxlnx/taste-skill.git/': Could not resolve host: github.com
```

No staged release was produced and no existing `dist/` output was replaced.
The live ablation was therefore **not started**, and its result is unknown.
There are no new live-model observations, token counts or charges to report.
The historical observations are not recounted as new trials.

The default sandbox temporary directory also rejected pytest's temporary-folder
creation (13 tests passed, 15 setup errors). Retrying with a fresh `--basetemp`
under the writable user Temp directory resolved that environment issue: the
28 targeted tests passed in 9.19 seconds.

## Verification results

- `python -m pytest -q tests/test_lessons.py tests/test_discovery_entries.py tests/test_audit_host.py --basetemp <fresh-user-Temp-path>`: **28 passed in 9.19s**.
- `python muro_build.py --manifest examples/marionette/sources.json --validate`: **OK**.
- `python -m pytest -q --basetemp C:\Users\alfio\AppData\Local\Temp\muro-resume-full-bb14978c9ede44e08bc386ffb7805c9c`, with `TEMP` and `TMP` set to the writable user Temp directory: **261 passed, 10 failed in 137.88s**. The suite is not green in this environment.
- `python muro_build.py --manifest examples/marionette/sources.json --check-sources`, with the same Temp override: all eight HTTPS source checks failed with `Could not resolve host: github.com`. A first attempt without that override stopped on temporary-directory access errors instead; neither attempt verified the remotes.
- `git diff --check -- README.md`: **OK**.

Failure breakdown:

| Area | Count | Observed failure |
| --- | ---: | --- |
| Live source tests (`test_ai_design_intake.py`, `test_ui_ux_pro_max_intake.py`) | 2 | Cannot resolve `github.com`. |
| Remote parameterizations in `test_pin_modes.py` | 6 | Git cannot fetch the local fixture through its `file://` URL. |
| `test_remote_commit_fetch_and_glob_validate_files`, `test_release_copies_verified_remote_license` | 2 | The same local Git transport fails before source validation. |

The local transport error reproduces without importing or running Muro:

```powershell
git ls-remote 'file:///C:/Users/alfio/AppData/Local/Temp/muro-resume-full-bb14978c9ede44e08bc386ffb7805c9c/test_release_copies_verified_r0/source'
git -C 'C:\Users\alfio\AppData\Local\Temp\muro-resume-full-bb14978c9ede44e08bc386ffb7805c9c\test_release_copies_verified_r0\source' rev-parse HEAD
```

The first command fails with `Could not read from remote repository`; the second
reads commit `46c929272324b16129cf801448be45a7e74a684f` successfully. `GIT_TRACE=1`
shows the failing path spawning Git's `sh.exe`/`git-upload-pack`. This isolates the
observed failure to the local Git transport; the underlying Windows/sandbox
cause was not established. No test, pin or source verifier was weakened to make
the run pass.

## Reconnection check

After the owner's next `resume`, the workspace was accessible again and this
previously interrupted results update was saved. A new read-only
`git ls-remote https://github.com/Leonxlnx/taste-skill.git refs/tags/v2.5.1`
still failed with `Could not resolve host: github.com`. Reconnection did not
remove the network blocker, and no second full-suite run was needed for this
documentation-only update.

No new runtime safeguard or protocol call was added. This documentation correction
adds no per-task calls, tokens or permission prompts to generated packages.

## Ablation executed after the network returned (same day, later session)

`git ls-remote` against the pinned remotes answered again, so the build and the
live runs were executed. Host: Claude Code 2.1.322, `--model claude-fable-5-2
--effort medium` in every run, init event checked for model and plugins. Request,
Express fixture, tool limits (`Skill,Read,Glob,Grep`, `dontAsk`) and release held
constant within each round; the only difference between arms is
`enabledPlugins["superpowers@claude-plugins-official"]` in a `--settings` file.
The owner's configuration was not changed.

### Round 0: invalid, kept as an observation

Four sessions started in parallel loaded none of the marketplace plugins in
either arm (init listed only `marionette`, `i-have-adhd` and four `cc-plugin-*`).
Probes started one at a time loaded them and honoured the settings file. The four
runs are not an ablation. In all four the host invoked no skill.

### Round 1: sequential, release as it was

| Arm | Superpowers loaded | Skills invoked | Marionette |
|---|---|---|---|
| on, 2 runs | yes | `superpowers:brainstorming` (2 of 2) | not invoked |
| off, 2 runs | no | none (2 of 2) | not invoked |

Removing Superpowers did not bring Marionette in, so the earlier claim that it
lost to that skill was not supported. A further probe asked a session to list
the skills whose name contains `marionette`: it listed five, and
`marionette:marionette-engineering` was not among them.

### Cause

The entry's description contained `open decisions: agreeing the destination`.
`muro/adapters.py` wrote it as a plain YAML scalar, which makes the frontmatter
invalid; Claude Code dropped the skill silently. The entry had never been
available in any earlier engineering run.

Fix, test first: two tests added to `tests/test_discovery_entries.py` failed
(2 failed, 15 passed), then `_yaml_scalar` in `muro/adapters.py` writes a
double-quoted string when a plain scalar is unsafe (17 passed). The authored
text is not altered. After the rebuild the same probe listed all six skills.

### Round 2: sequential, fixed release

| Run | Superpowers loaded | Skills invoked | Runtime calls and modes | Cost / time |
|---|---|---|---|---|
| on-1 | yes | `superpowers:brainstorming` | none | $0.75 / 11 s |
| on-2 | yes | `marionette:marionette-engineering` | `plan --compact`, `plan --classification` -> `direct` | $1.19 / 50 s |
| off-1 | no | `marionette:marionette-engineering` | same -> `direct` | $1.08 / 46 s |
| off-2 | no | `marionette:marionette-engineering` | same -> `direct` | $1.19 / 58 s |

Engineering entry chosen in 3 of 4: 2 of 2 without Superpowers, 1 of 2 with it.
Each time it was chosen the protocol ran with no denial of a runtime call, and
the step opened with the capability's first move (agree the destination). The
denials recorded were the test's own tool limits (a read-only shell command, a
write under `.scratch/`). Two samples per arm: consistent with Superpowers
taking some first turns, not a measured rate.

The classification returned `direct` for `work-map`. Declaring it `resumable`
was tried and withdrawn: three existing tests failed, and they were right.
work-map keeps its own map under `.scratch/` when the work needs one and runs
small work without any, so a coordinator map on top would add calls and checks
to every small engineering task for no evidence of need (ADR-0015, principle 5).
`interactive-explainer` stays a direct step for the same reason.

Cost of this session's live runs, probes included: about $11.

### Checks after the changes

- `python -m pytest -q` with `TEMP`/`TMP` and `--basetemp` on drive C: (drive D:
  had 407 MB free): **273 passed in 105.53s**.
- `--validate`: OK. `--check-sources`: OK, all eight remotes answered.
- The ten failures listed above did not reproduce once the network and a
  writable temporary directory were available.
