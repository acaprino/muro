# Imago migration verification

Updated on 21 November 2026.

## Integration bases

| Repository | Develop base |
| --- | --- |
| acaprino/muro | `458d9195f130715be0b86452c31b276adba3c764` |
| acaprino/imago | `1e1a48ce090cf59f09cb2fc94f5ddc0c6aa84bce` |

The migration was reconciled with both current develop branches. It preserves
the concurrent routing changes in Muro and workspace/inspection controls in
Imago. The shared icon registry is consolidated; application composition and
inspection-page CSS use distinct layout classes. The old `graph-draw.ts` is
removed and Muro's stylesheet contains only the Imago import.

## Local evidence

| Check | Result |
| --- | --- |
| Muro forms, model/sync, settings/activity, setup, projects, harmonization, graph and ownership tests | 343 passed, including the corrected harmonization rerun |
| Imago JavaScript unit and capture-rule tests | 347 passed, including the corrected token assertion rerun |
| Muro, Imago package and gallery TypeScript compatibility checks | Passed with cached TypeScript 5.9.3 |
| Changed Muro Rust files | Formatted; no local Rust compilation or tests |

The compatibility checks used temporary D3 declarations and Vite environment
declarations outside product source. The pinned TypeScript/Vite/Playwright set
and D3 runtime were unavailable in the offline preparation environment. No local
browser execution or native-window behaviour is claimed as verified.

Muro targeted test command:

```sh
node --test apps/desktop/tests/forms.test.ts apps/desktop/tests/model.test.ts apps/desktop/tests/settings-activity.test.ts apps/desktop/tests/setup.test.ts apps/desktop/tests/projects.test.ts apps/desktop/tests/project-harmonize.test.ts apps/desktop/tests/project-graph.test.ts apps/desktop/tests/imago-ownership.test.ts
```

Imago unit test command, after compiling the package:

```sh
node --test tests/*.test.ts examples/demo/capture-rules.test.mjs
```

## Release gates

Imago's [Verify run 44849331406](https://github.com/acaprino/imago/actions/runs/44849331406)
passed on `818f200c640341de1eb9748688640ae477ae130b`: all 347 JavaScript tests,
the pinned production build, gallery browser regressions, Rust checks and demo
build. [Release PR #4](https://github.com/acaprino/imago/pull/4) was merged after
those checks passed.

Both Muro dependency manifests pin Imago `v0.1.3`; both lockfiles resolve
`81da040065bd502013adbd1b0dd8a40cfcf11a7d`. The Imago
[release run 44849919599](https://github.com/acaprino/imago/actions/runs/44849919599)
completed successfully before the consumer pin was written. Offline npm
Arborist validation found 95 packages and no missing required dependency edges.

Imago's Verify workflow runs the pinned package/gallery builds, all unit and
browser regressions, Rust formatting/lint/tests and a native demo build.
The release uses its develop-to-main PR; Muro depends on the resulting tag.

Muro's Tests workflow runs the factory suite that does not name Marionette and the desktop jobs: reproducible
npm installation, frontend unit tests, TypeScript/Vite, browser tests, registry
and runtime Rust tests, and the desktop shell tests with Cargo `--locked`.
The npm lock is composed from Imago's resolved runtime entries and checked with
npm Arborist; Cargo lock entries use Imago's exact existing dependency versions.
The CI installs and checks both locks against the real immutable Git revision.

Browser regressions cover automatic-fit versus manual graph viewports, keyboard
navigation, dialog modality, native form locking and retries, late results,
focus after repaint, intentional titlebar focus and CSS layout coexistence.
Rust tests cover the recovery gate; caption/Snap Layouts, theme/glass, tray and
actual WebView failure recovery still require interactive native-app validation.

Do not infer an interactive Windows visual check from a successful compile or
headless browser test. Do not merge the release while required CI checks fail.
