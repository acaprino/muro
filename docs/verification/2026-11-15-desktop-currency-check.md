# Desktop currency check — 2026-11-15

Request: check that the desktop exe, CLI and UI are up to date, that every function is implemented, and that the documentation and README are correct and complete. This follows `2026-11-15-desktop-full-review.md`.

## Review findings

All 10 findings in the full review are fixed in code, each with a regression test except #10 (documentation) and #2/#9, whose only tests need an installed Claude CLI and are ignored by default. Remaining gaps:

- ~~The check after apply compares installed versions, not repaired file content (#2).~~ Fixed later the same day: after a `reinstall` operation, the service hashes the installed folder and compares it with the verified artifact digest (`reinstalled_files_match`, `crates/muro-registry/src/service.rs`). Unit test `service::tests::reinstall_check_compares_installed_files_with_the_artifact` covers match, corrupted file, missing folder and the skipped hosts. With the real Claude CLI in isolated profiles, `native::tests::claude_reinstall_repairs_files_and_reenables` (now also asserting that the installed tree hashes like the artifact) and `claude_native_round_trip` both passed. Not compared: Codex reports no install path, and Hermes installs a Git clone whose `.git` is not part of the artifact.
- Activation state is reconciled for Claude only; Hermes reports it without reconciling it, and Codex reports none (#9).

## Staleness found and fixed

- `target/debug/muro-desktop.exe` was built at 13:20, before source changes up to 15:43. Rebuilt with `--features custom-protocol`, after `npm run build`, together with `muroctl.exe` and `mukade.exe`.
- `apps/desktop/src-tauri/resources/factory` was an old factory copy: 13 files differed and 8 were missing, including `muro/custom_instructions.py`, `muro/agent.py`, `muro/mcp.py` and `prompts/review.md`. AI adaptation in the app ran that copy. Restaged with `python scripts/desktop_resources.py --out .scratch/resources-new` (hash-verified Python 3.13.17 embed), then swapped in. The old copy is kept at `.scratch/resources-old-20261115`. After the swap, every `muro/*.py` and `prompts/*.md` matches the repository, and the private Python imports `muro` 0.2.0 with `custom_instructions`.
- `muroctl request --help` failed with `Unknown registry action: --help`. `--help`/`-h` is now accepted anywhere in the arguments, and the usage points at the action reference (`crates/muro-desktop-runtime/src/cli.rs`, `main_args`).

## Function coverage

Every action the UI sends (`adapt`, `apply`, `cancel_job`, `maintenance`, `open_custom_instructions`, `plan`, `remove_plugin`, `remove_target`, `resolve`, `save_plugin`, `save_target`, `scan`, `settings`, `snapshot`, `discover`, `jobs`) has a handler in `crates/muro-desktop-runtime/src/lib.rs` or `crates/muro-registry/src/service.rs`. No `todo!`, `unimplemented!`, `TODO` or `FIXME` exists in `crates/`, `apps/desktop/src` or `apps/desktop/src-tauri/src`.

## Documentation corrected

- `docs/desktop-cli.md`: new "Request actions" table (every action, payload and constraint), complete portable layout, path rebasing and settings rewrite on start, name restrictions for instruction files.
- `docs/desktop.md`: auto-sync applies plans without a review step, including exclusive removals; `Muro.exe --request` diagnostics; reinstall uses the retained artifact; cleanup invalidates earlier plans; resource staging must be swapped in when the factory changes; `--archive`; build order before packaging.
- `docs/cli.md`: the `muro agent` section opens with its purpose again; the mid-run custom-instructions abort is documented.
- `docs/custom-instructions.md`: forbidden characters in names.
- `docs/adr/README.md`: manual notes for ADR-0021, ADR-0022 and ADR-0023, outside the historical generated index.
- `README.md`: no portable release is published yet, with a link to the build steps; links to ADR-0023 and ADR-0024.
- `examples/desktop/README.md`: its pointer now names what the CLI reference actually contains.

Unchanged and checked: no broken relative links in the nine docs; the README logo line is present.

## Results

Rust commands ran with `TMP`/`TEMP` set to `.scratch/tmp`: the session's `TMP` carried a `\\?\` prefix that `link.exe` cannot open (LNK1104).

| Check | Result |
|---|---|
| `cargo test --workspace` | 36 passed, 0 failed, 4 ignored (native Claude/Codex/Hermes round trips) |
| `npm test` | 11 passed |
| `npm run build` | passed |
| `node apps/desktop/tests/browser.mjs` | PASS: empty state, CRUD, failed-save retention, metadata preservation, source-change invalidation, custom folder persistence, explicit open, external Markdown edits, escaping, search, explicit root, blocked apply, activity, keyboard labels |
| `node apps/desktop/tests/native.mjs` | pass: native WebView2 + real Tauri IPC, save, reload persistence, plan/apply to an isolated OpenCode config, second plan zero mutations, unrelated config preserved |
| `python -m pytest -q` | 609 passed, 8 skipped (27 min 56 s) |
| `python muro_build.py --manifest examples/marionette/sources.json --validate` | `OK: capabilities and ROUTER.md valid` |

## Not executed

The ignored native round trips (real Claude, Codex, Hermes), a paid AI adaptation job, `desktop_package.py` producing a complete portable folder, the optimized `npm run desktop:build`, and `--check-sources`. No personal harness configuration was touched; nothing was committed, installed or published.
