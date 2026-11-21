# Installed copies on the project page, and the Codex inventory (2026-11-21)

## What the owner saw

"Quando apro la schermata principale vedo che il plugin marionette è ok, ma se clicco poi sul progetto di
marionette, vedo che non risulta abilitata l'installazione né in Claude Code né in Codex, quando in realtà è
abilitata", and "non riconosce ancora codex bene".

## Causes found in the code

1. **The project page knew only its own build.** Step 4 (`apps/desktop/src/pages/project/install.ts`) found
   the project's plugin as the registry plugin whose `project` is the project's id. A copy of Marionette the
   person installed from its release, or added to the list from what was installed (a plugin with a new id
   and no `project`), was never looked at: every switch read off and every row "—", while Sync showed the
   copy up to date. Switching a harness on would then have planned a second copy (`marionette@muro-marionette`)
   beside the one there (`marionette@marionette`).
2. **Codex entries had no folder.** `native.rs` read `codex plugin list --json` and wrote `"path":""` for every
   entry, and dropped `enabled`. With no folder, the first run's "Start from what is installed" refused every
   Codex plugin ("No folder to add it from"), "Add to my list" made a plugin with no source, an adopted Codex
   copy had no digest (the next plan always updated it), and a repair could not compare its files.

## Read on the real hosts (this session, Linux container)

- `codex-cli 0.171.0` (npm `@openai/codex`, isolated `CODEX_HOME`): after `codex plugin marketplace add` and
  `codex plugin add demo@muro-demo`, `codex plugin list --json` gives under `installed` the fields
  `pluginId`, `name`, `marketplaceName`, `version`, `installed`, `enabled`, `source`, `marketplaceSource`,
  `installPolicy`, `authPolicy`, and no install folder. The command printed "Installed plugin root:
  `<CODEX_HOME>/plugins/cache/muro-demo/demo/1.2.3`", and `diff -r` found that folder identical to the
  plugin's source folder. With `enabled = false` in `config.toml` the row says `"enabled": false`; with the
  cache folder moved away the plugin is no longer listed at all.
- Claude Code (`claude plugin install demo@muro-demo --scope user`, isolated `CLAUDE_CONFIG_DIR`): the copy is
  in `plugins/cache/muro-demo/demo/1.2.3`, identical to the source folder; ids are `<name>@<marketplace>`.

## The change

- `native.rs`: Codex entries carry the folder `plugins/cache/<marketplaceName>/<name>/<version>` of the target
  root when it is there (each part a single folder name, no separator, no `..`; a symlink is not taken), and
  the row's `enabled`. Every inventory entry carries `plugin_name`: the part of a Claude Code or Codex id
  before `@`, Hermes' name, null for OpenCode and Pi (listed by folder or source).
- `service.rs`: new action `take_over {revision, plugin_id, target_id, name}`. The copy of that native name on
  the target becomes the plugin's through an adopted receipt (the same receipt `save_plugin` with `adopt`
  writes, now one function, `adopted_receipt`); a plugin of the list that held it loses that target and its
  receipt there. No change when the harness cannot be read, the plugin has its own copy there, or no copy of
  that name has its files. Receipts are restored when the registry save fails.
- `muro-desktop-runtime/src/projects.rs`: `install_project` calls `take_over` for each named target with the
  name the build's manifest declares (`build_identity`). The next plan then updates the copy that is there
  (install the build, uninstall the old id) instead of installing a second copy.
- Project page: a harness holding such a copy shows it installed ("Installed 0.6.0, not from this project",
  with the list plugin that holds it and "switched off" when the harness says so), the switch on and disabled
  where the project is not on, and **Use this project's build**, which switches the harness on (or installs
  again where it is on). The list line counts those harnesses: "On 2 harnesses · 2 not from this project".

## Results

- `npm test`: 373 pass, 0 fail (4 new tests in `apps/desktop/tests/projects.test.ts`).
- `npx tsc --noEmit -p .`: no error. `npm run build`: built.
- Rust: new unit tests `a_codex_entry_has_the_folder_codex_installed_it_in_and_its_enabled_state`,
  `the_plugin_name_of_an_entry_is_the_name_the_harness_installed_it_under` (`native.rs`) and
  `a_copy_of_the_same_name_is_taken_over_from_the_person_or_from_another_plugin_once` (`service.rs`).
  Not compiled or run here (owner rule). `Tests` workflow on `claude/beautiful-albattani-3vtozp`: run 105
  (commit 4fbd616) failed one assertion of the Codex test only, whose expected path joined
  `plugins/cache/...` with `/` on Windows; run 107 (commit 6d25971, the expected path built with `join`)
  passed both jobs: Python tests, validate, check sources and build on Ubuntu; Rust tests, frontend unit
  tests, type check, frontend build, shell tests and browser tests on Windows.

## Not executed

- No cargo command, no Tauri build, no browser test (Edge channel) on this machine.
- `take_over` through `install_project` against a real Claude Code or Codex: the runtime tests use OpenCode
  and Pi targets, which have no `plugin_name`, so there it is a no-op; the claim logic is unit-tested.
- The owner's own registry was not read: that the Marionette in their list is a plugin without `project` is
  inferred from the code, not observed.
