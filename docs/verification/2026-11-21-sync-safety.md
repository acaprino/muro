# Confirmed removals, sync recovery and adaptation preflight (2026-11-21)

Decision record: `docs/adr/ADR-0029-confirmed-removals-and-sync-recovery.md`.
The specification, its review reports and the seven implementation plans are
kept outside the repository (plans are not committed).

## What was reviewed

The mechanism that resolves a plugin's source, reads what each harness has
installed, plans and applies a sync, and adapts a plugin with AI, against the
code and against one installation (Muro 0.5.6, portable). Observed there:

- one target, Claude Code, with the rule that uninstalls plugins outside the
  list turned on; one plugin in the list (Marionette), blocked;
- 31 user-scope plugins in Claude Code's `installed_plugins.json`, of which
  25 name an install folder that does not exist;
- `codex plugin list --json` exits 1 on this machine because one configured
  marketplace no longer exists (Codex's own configuration; not changed).

The specification was reviewed in fresh contexts with the reviewer prompts of
google/elephant-goldfish-model (commit 8e2a5ed): eight reviewers on the first
draft (6 blockers, 14 major findings), two on the second. Four findings were
not adopted, with the reason recorded beside each.

## What was changed

- `crates/muro-registry/src/service.rs`: `apply` needs `confirm_removals`
  equal to the plan's removals, or `skip_removals`; a first install whose
  check fails is recorded; `activate` only for copies Muro installed; a
  reinstall needs a receipt, not an installed copy; "Files missing";
  `remove_plugin` deletes the plugin's receipts; `register_distributions`.
- `crates/muro-registry/src/native.rs`: `present` and the user-scope row on
  Claude Code; install before uninstall when the native id changes.
- `crates/muro-registry/src/sources.rs`: a Muro build in a folder of the
  source; plugins that share a marketplace folder are refused by name; an
  unreadable file of one harness skips that harness.
- `crates/muro-desktop-runtime/src/jobs.rs`, `lib.rs`: the two refusals before
  an adaptation; every adapter registered; the worker never uninstalls.
- `muro/sources.py`, `muro/cli.py`: `muro license-check FOLDER`.
- `apps/desktop/src/`: the review sheet's removal buttons, the rule's texts,
  "files missing".

## Executed

| Command | Result |
| --- | --- |
| `npm test` | 369 passed, 0 failed |
| `python -m pytest -q tests/test_license_check.py` | 16 passed |
| `python -m pytest -q tests/test_cli.py tests/test_repository_marketplaces.py tests/test_apache_notice_gate.py tests/test_license_path_gate.py tests/test_muro_build.py` | 61 passed |
| `python muro_build.py license-check <this repository>` | exit 0, root `LICENSE` is Apache-2.0; 24 s, because every folder but `.git` is walked (the caller's limit is 120 s) |
| `python muro_build.py license-check <folder with a README only>` | exit 1, the refusal line on stderr |
| `node apps/desktop/tests/browser.mjs` | exit 1: `browser-harness.mjs` passed; `browser-settings.mjs` failed on the old label "Always uninstall" (corrected afterwards, not run again); `browser-background.mjs` timed out once in the full run and passed alone |

## Not executed

- **No Rust was compiled or tested.** Rust is built on GitHub Actions only.
  The changes to `service.rs`, `native.rs`, `sources.rs`, `jobs.rs`, `lib.rs`
  and their tests were written by reading the code; they wait for the `Tests`
  workflow.
- No install, uninstall, enable or adaptation on a real harness, and the
  desktop app was not run with the change.
- No test covers, because the service fixtures are OpenCode only: the
  `activate` rule for adopted copies; `present: false` in the plan ("Files
  missing", the removal marked without files) and in the adoption refusal.
  Their pure parts are tested in `native.rs` (`claude_entries`).
- That `claude plugin list --json` rows carry `scope` is not shown by any
  fixture; without it the first row is used, as before.
- The success path of the license preflight inside `jobs::start`, and the
  registration of the adapters at the end of a job, would need a real AI run.
- The full Python suite.

## Known limits

- `present` is not part of the inventory fingerprint: a folder that
  disappears between plan and apply does not make the plan stale.
- The footer of the review sheet still counts records without files among the
  plugins that "will be uninstalled"; the button separates them.
- The license preflight passes when any license-named file in the repository
  passes; the factory's gate still decides.
