# Desktop registry verification — 2026-11-15

Implementation: Windows Tauri/TypeScript UI, Rust registry service, pinned Mukade discovery and private Python factory runtime. Existing factory source was not modified. Owner approved the mockup and requested implementation. No release, commit or personal harness plugin installation was performed.

## Passing checks

- `npm run build`: TypeScript checking and production Vite bundle.
- `npm test`: six model tests; browser smoke separately verifies CRUD, failed-save retention, metadata preservation, safe rendering and sync confirmation.
- `cargo test -p muro-registry -p muro-desktop-runtime`: 14 tests passed; three opt-in real-host tests are excluded from the default run.
- `cargo build -p muro-desktop --features custom-protocol`: Windows native executable produced.
- `node apps/desktop/tests/native.mjs`: actual WebView2 and Tauri IPC, no mocked bridge. Empty registry, target/plugin save, reload persistence, plan/apply into an isolated OpenCode config, second plan with zero operations, unrelated theme setting preserved.
- Same native test against a portable executable copied outside the checkout to `D:/Software/Shinatama/data/agents/codex/tmp/muro-desktop-portable-20261115/Muro.exe`: passed. Private embedded Python also ran factory `--validate` from that directory successfully.
- `python muro_build.py --manifest examples/marionette/sources.json --validate`: passed.
- Same command with `--check-sources`: all pinned sources and plugin identity valid.
- Fresh `--build --out .scratch/desktop-verification-release-20261115`: generated Marionette without replacing existing distribution output.

## Failures investigated

Initial native startup failed with WebView2 HRESULT `0x8007139F`: the launching Shinatama process exported its own live `WEBVIEW2_USER_DATA_FOLDER`. Muro now assigns a separate profile before Tauri starts. Native tests passed after the fix.

Initial Python suite: 517 passed, 16 failed, 8 skipped in 1082.58 seconds. Failures involved inherited `\\?\` temporary paths used by existing shell/Git/Node integration tests (including `[Errno 22] Invalid argument` and Git rejecting `file://%3F/...` remotes). A full rerun uses ordinary absolute paths: `TEMP`/`TMP=D:/Projects/Muro/.scratch/test-temp`, `--basetemp D:/Projects/Muro/.scratch/pytest-normal-1`. The result is recorded below when complete; the initial run is not represented as passing.

Full Python rerun completed: **535 passed, 8 skipped in 951.48 seconds** with ordinary temporary paths. No factory fix was needed for those environment-induced initial failures.

Explicit isolated Claude Code native round-trip passed (6.87 seconds): install, verified version, zero-op second plan, reinstall, exclusive removal. Hermes inventory exceeded its 120-second deadline before mutation. Codex native round-trip was not executed. Remote resolution is implemented and mechanically tested; a remote end-to-end download is not claimed by this record.

## Boundaries

Native IPC/configuration tests do not prove a real OpenCode agent loaded or executed the package. AI adaptation orchestration was tested mechanically; no paid end-to-end AI adaptation is claimed. Source classification remains host AI work. Codex budgeted adaptation is explicitly unsupported because its CLI has no equivalent dollar ceiling. DeepSeek discovery does not imply a plugin adapter. Native host round-trip results are reported separately from the default Rust suite.
