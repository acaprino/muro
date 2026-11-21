# Desktop migration to Imago

The desktop uses `@acaprino/imago` for tokens, Smooth/ONI appearance, native form
controls, buttons, segmented radios, switches, chips, tables, lists, workflow
steps, settings groups, status surfaces and progress. Menu, dialog/drawer,
notification, keyboard command, focus and shell behaviour comes from Imago's
TypeScript modules. The Windows frame uses `imago-shell`: glass and persisted
native theme, caption controls/Snap Layouts, navigation guard, browser shortcut
guard and WebView2 failure handling. Registry operations, the tray, the background
worker and project decisions remain Muro's.

`styles.css` contains only the Imago import. All components, typography, layout
primitives and visual behaviours belong to Imago. Muro retains domain schemas,
labels, operations and screen composition. Its `ui.ts` is only a compatibility
re-export of shared components plus domain formatting; it implements no UI.
Extend Imago whenever a component is missing; do not add local components or CSS.
See Imago's `docs/native-forms.md` and `docs/content-composition.md`.

The decision graph uses Imago's `graphView` component. Imago owns grouped layout, nodes,
edge routing, pan/zoom/fit, keyboard navigation, legend, focus and camera APIs.
Muro's `graph-scene.ts` only maps capabilities, entries, prerequisites, conflicts
and simulation results to the shared scene model. The old SVG renderer is deleted.
Viewport state (camera plus automatic-fit mode) is retained per project across paints and tab changes; graph controls
respect application transactions and modal state.

The app retains a stable shell body while repainting its children, so a render
cannot remove the inert boundary of an open dialog. Native forms retain their
submission and FormData behaviour. Dismissal is refused during saves/applies;
successful completion may close the form programmatically. Imago's operation guard
locks the complete form, restores each button's original disabled state and rejects
late UI callbacks when the form was replaced or detached. Error retries keep
the form values. Native title-bar controls stay available under dialogs; page
navigation does not bypass modality. Unmount disposes listeners, layers, notices
and timers. Ctrl+K opens commands, Ctrl+F or `/` finds plugins. Navigation commands
wait for registry initialization and completion of the first-run wizard.

## Pending Imago helpers

The project dialogs (ADR-0030) need a multi-line field, which Imago draws (`im-native-textarea`) but has no markup helper
for yet. `textArea` in `apps/desktop/src/forms.ts` writes it once, with the label, hint and error slot of
`textFieldHtml`; it moves into Imago as a `textAreaFieldHtml` with its next release, and the Muro copy is then deleted.

## Shared dependency

The npm package and Rust crate are pinned to the same released Imago tag.
`package-lock.json` and `Cargo.lock` record its immutable commit. The package's
Git `prepare` script builds the public JavaScript modules during installation.
The npm lock includes the complete resolved D3 runtime dependency tree.

When extending Imago, integrate and verify it first, release it through its
develop-to-main pull request, then update both Muro dependencies and lockfiles
together. A standalone Muro checkout must never depend on a sibling directory.
The desktop CI uses `npm ci` and Cargo `--locked` to verify those pins.

## Verification status

- Targeted frontend tests cover forms, sync, setup, settings/activity, projects,
  harmonization and graph/simulation. Browser tests use the new component selectors.
- `browser-imago.mjs` adds a native-browser contract for menu/focus, validation,
  rejected saves and retries, modality, appearance, commands and teardown.
- Imago adds `tests/gallery/content-dialog.mjs` for both looks and themes,
  native FormData, locked dismissal, native close, reuse and wrapped inputs.
  `dialog-repaint.mjs` covers focus restoration and component CSS specificity;
  the graph gallery covers automatic-fit and manual-camera state across remounts.
- CI verifies Rust compilation, the production Vite build and browser execution.
  Source review and compatibility checks alone do not prove native-window behaviour.

The [verification report](imago-verification.md) records preparation evidence and
the CI gates required before merging the migration into main.
