---
adr_id: ADR-0029
version: 1
title: Removals are confirmed, and a failed sync can be recovered
status: Proposed
author: Claude Code
scope:
  paths: [apps/desktop, crates/muro-registry, crates/muro-desktop-runtime, muro/sources.py, muro/cli.py, docs/desktop.md]
  modules: []
  domains: [desktop, sync, adaptation]
governs_symbols: []
depends_on: [ADR-0005, ADR-0023, ADR-0028]
created_from_task: sync-safety
proposed_on: 2026-11-21
accepted_on: null
---

# ADR-0029 — Removals are confirmed, and a failed sync can be recovered

Date: 2026-11-21. Status: records a review the owner asked for and the
implementation of its specification, both of the same day. The code was written
on 2026-11-21 and had not been compiled or run when this record was written.
The decisions below are implementation choices; neither they nor this
explanatory text have been separately approved.

## Context

The owner, on 2026-11-21, on the Sync page of Muro 0.5.6 refusing Marionette
("Claude Code / Marionette: no Claude Code build [...] It is left out of this
sync"): "è praticamente inutilizzabile". That refusal had its own cause and its
own fix (`docs/verification/2026-11-21-build-in-a-folder.md`). The owner then
asked for a review of how Sync installs, updates and removes plugins, a
specification of what it found, and its implementation.

The review read one installation, the owner's portable Muro 0.5.6, and the code.
Claude Code is an exclusive target there (the setting that makes the plan hold a
`remove` for every installed plugin the list does not hold). The list holds one
plugin, Marionette, and Claude Code holds 31 others, 25 of them records in
`plugins/installed_plugins.json` whose folder is gone. A plan without a blocker
would hold 1 install and 31 removals. The code facts, each with its journey in
the specification:

1. **Removal without consent.** `plan` (`service.rs`) emits a `remove` for every
   installed plugin outside the list of an exclusive target. The page's
   `applyAll` (`pages/sync.ts`) applies a fresh plan with no confirmation when
   it equals the plan shown, and the background worker (`check_and_apply`,
   `lib.rs`) applies any plan.
2. **Records without files.** `scan` (`native.rs`) copies every user-scope entry
   of `installed_plugins.json` without checking that its `installPath` exists.
3. **Wrong enabled state.** `scan` takes `enabled` from the first row of
   `claude plugin list --json` with that id, and the command returns one row per
   scope.
4. **Re-enabling.** `plan` emits `activate` for every disabled Claude Code
   plugin, including one the person installed and disabled themselves.
5. **An install that fails its check is not recorded.** `apply` writes
   `receipts.json` only after the inventory check that follows the install.
6. **A failed update cannot be undone.** On Claude Code an update uninstalls the
   old copy and then installs the new one. When the install fails, "Plan a
   reinstall" is refused because no copy is installed.
7. **Two copies.** When an update changes the native id, `native::install`
   uninstalls the old id only on Claude Code, and before the new copy is
   installed.
8. **Orphan receipts.** `remove_plugin` keeps the plugin's receipts, so the copy
   stays managed, hidden from "Installed, not in your list", and cannot be
   adopted again.
9. **Plugins that share a folder are merged.** `at_the_root` (`sources.rs`) adds
   a folder once, so a marketplace whose entries share a folder becomes its
   first entry. `anthropics/skills` lists four plugins with `"source": "./"`.
10. **One harness's unreadable file fails all five.** `resolve` propagates the
    error of `find`, `identity_in` or `canonicalize` for one harness.
11. **Adaptation runs that cannot succeed.** `jobs::start` runs the AI and then
    the factory's checks. Two failures are known before the run: a source
    folder in no Git repository, and a repository in which no license file is
    the complete MIT or Apache-2.0 text (`_license_matches`, `muro/sources.py`).
12. **A finished adaptation is discarded.** The job saves the plugin record it
    read at the start with the registry revision of the start, so any registry
    change during the run fails the save.
13. **One AI run per harness.** The factory build writes all five adapters; the
    job registers one.

The specification (`design_draft.md`, kept outside the repository with the
review reports) was reviewed with the method of google/elephant-goldfish-model
(commit 8e2a5ed): eight reviewers in fresh contexts (zoom out, inventive
catalyst, comprehension, design, structural, style, implementation readiness,
codebase details), then one more zoom out on the revised draft. The first draft
had six blockers once the findings were consolidated; the second review found
none. What the review changed in the design:

- The license check reads the repository root, not the `#folder` a source names,
  and refuses only a folder in no Git repository. The first draft would have
  refused every narrowed source, Marionette included.
- The adaptation result is merged under the writer lock by a new action, not
  saved from a record read thirty minutes earlier.
- A failed check records only a first install. The first draft wrote an
  "unverified" receipt that kept the old one inside it (`previous`). The second
  review showed that `receipts.json` is written only after the check, so the old
  receipt is still on disk when a check fails and only a first install has
  nothing recorded.
- Counting, locks and journal after a skipped removal are stated: the pending
  count is of executed operations.
- The review sheet, the settings texts and the types are in the work.

A review is not a test of the code.

## Owner statements and request

- "è praticamente inutilizzabile" (2026-11-21), on the Sync page refusing
  Marionette.
- The owner asked for a review of the mechanism, for the specification of what
  it found and for its implementation, in work packages written at the same time
  (A to G, each editing its own files). That is why one run of the `Tests`
  workflow after all of them is the single checkpoint.

Nothing else in this record is an owner decision.

## Implementation choices (not separately approved)

1. **A removal is confirmed by a number.** `apply` reads `skip_removals`
   (bool, default false) and `confirm_removals` (integer). Let `n` be the number
   of `remove` operations of the stored plan. With `skip_removals: true` the
   removals are not executed. Otherwise, when `n > 0`, `confirm_removals` must
   equal `n`, or `apply` fails before any target lock with "This plan uninstalls
   {n} plugins; review it and confirm the removals" ("1 plugin" when `n` is 1).
   Only targets that have an executed operation are locked, saved to `recovery/`
   and stamped as synced; the log line and `record_sync` count executed
   operations. When nothing is executed (`skip_removals` and a plan of removals
   only), `apply` takes no lock, writes no journal and returns the snapshot. The
   response always holds `skipped_removals` (`n` when skipped, else 0); `left_out`
   is as before. `apply` was already bound to one stored plan by `plan_id`,
   registry revision and inventory hash. The number adds that a caller cannot
   confirm removals without having read how many there are, and a caller that
   does not know the field removes nothing.

2. **The review sheet is where removals are confirmed.** **Apply all** opens the
   sheet, whatever plan was shown before, when the fresh plan has removals,
   blockers or no operations, or differs from the shown one (`mustReview`).
   With removals the primary button is labelled "Apply and uninstall 6 plugins",
   "Apply and clear 25 records without files" or "Apply, uninstall 6 and clear 25
   without files" (singular "1 plugin", "1 record") and sends `confirm_removals`.
   A second button, "Apply without uninstalling", sends `skip_removals: true`;
   the notice reads "1 change applied. 31 removals left out." It is absent when
   the plan has only removals.

3. **The background worker never uninstalls.** `check_and_apply` counts
   `removals` and the other operations, calls `apply` only when there is another
   operation, with `{"plan_id", "allow_blocked": true, "skip_removals": true}`,
   and returns `applied`, `pending` and `removals`. Its message adds "{n}
   removals wait for your confirmation" ("1 removal waits for your
   confirmation"), after the applied message when something was applied.

4. **Records without files are marked.** For Claude Code each inventory entry
   holds `present`, true when `installPath` is a non-empty path to an existing
   folder. Other harnesses do not set it and a reader treats a missing field as
   true. A `remove` operation carries `present: false` when the entry has it, so
   the sheet separates uninstalls from records without files. A managed, listed
   plugin whose entry has `present: false` and that would get no operation gets
   an `update` with the reason "Files missing". Adopting such an entry is
   refused: "{native_id} has no files on {name}; reinstall it there or remove
   it". The harness sheet's list of what is installed adds " · files missing".
   `enabled` is read from the row whose `scope` is `"user"`; with no such row,
   from the first row with the id, as before.

5. **`activate` follows ownership.** It is planned only for a copy with a
   receipt that is not `adopted`. A copy the person added with "Add to my list"
   and disabled stays disabled.

6. **A failed check records a first install only.** `receipts.json` is still
   written after the check passes. When the check fails and the plugin and
   target had no receipt before, the new receipt is written before the error is
   returned. When a receipt existed the file is not touched: the earlier receipt
   stays the record, and "Plan a reinstall" and `cleanup` work from it. After
   an update that changed the native id and failed its check, the new copy is
   therefore not managed; it shows as installed and not in the list.

7. **"Plan a reinstall" needs a receipt, not a copy.** The operation kind is
   `install` when no copy is installed and `reinstall` when one is, from the
   retained artifact of the unchanged receipt.

8. **Install before uninstall on an id change, on Claude Code and Codex.**
   `native::install` runs the install or add command for the new id and then the
   removal of the previous id (`plugin uninstall <previous> --scope user` on
   Claude Code, `plugin remove <previous>` on Codex), and ignores a failure of
   that removal: the install succeeds and the old copy shows as installed and
   not in the list. With an equal id the order is as before. The sequence is
   `install_commands`, a pure function with a test.

9. **Removing a plugin from the list deletes its receipts.** The `remove_plugin`
   arm of `request` removes every receipt of that plugin, writes
   `receipts.json` after the registry is saved, and returns a fresh scan.

10. **A marketplace with several plugins in one folder is refused.** In
    `at_the_root`, when a folder is named by two or more valid entries, `find`
    returns `Found::Shared` with the names of the entries of those folders, in
    marketplace order; `missing` says "the source's {Harness} marketplace
    defines {n} plugins in one folder ({names}); Muro cannot install one of them
    alone yet". An entry without a string `name` is named by its folder. A
    manifest at the root is found before the marketplace is read, as before.

11. **One harness's unreadable file stops only that harness.** In `resolve` an
    error of `find`, `identity_in` or `canonicalize` skips that harness, and
    `missing` calls `find` and reports its error: "the source's {Harness} files
    cannot be read: {error}".

12. **Adaptation is refused before a run that cannot succeed.** `jobs::start`
    calls `repository_root`, the nearest ancestor of the resolved source (itself
    included) that holds an entry named `.git`, and fails with "AI adaptation
    needs a Git repository: this source is a folder that is not in one". Then it
    runs the new factory subcommand `muro license-check REPOSITORY_ROOT`
    (`licenses_in`, `muro/sources.py`), which tests every file whose name starts,
    in any letter case, with `LICENSE`, `LICENCE` or `COPYING`, anywhere in the
    folder but `.git`, against `_license_matches` for MIT and Apache-2.0. It
    exits 0 with `{"licenses": [{"path", "license"}]}` when one passes and 1
    with "no file in the source is the complete MIT or Apache-2.0 text the
    factory accepts" on stderr otherwise; it runs no Git command and contacts
    nothing. `jobs::start` fails with "This source cannot be adapted: {that
    line}". No AI process starts and no job folder exists after either refusal.

13. **The result of an adaptation is merged under the writer lock, and serves
    every harness.** A new action of `service::request`, `register_distributions`,
    takes no `revision`:
    `{id, source, upstream_revision, expected_custom_instructions_digest, asked,
    version, adapters: [{harness, path}]}`. It finds the plugin ("Plugin not
    found"), refuses a different `source` or `upstream_revision` ("The plugin's
    source changed during adaptation; adapt again"), applies the
    custom-instructions check `save_plugin` has, then, for each adapter in the
    order `claude-code`, `codex`, `opencode`, `pi`, `hermes`, replaces that
    harness's distribution with `{harness, path, version, origin: "muro",
    source_revision, custom_instructions_digest}` when the harness is `asked`,
    or the plugin has no distribution for it, or that distribution has
    `origin: "muro"`. Other distributions are untouched. `source` and
    `upstream_revision` are those of the plugin when the job started, so a rename
    or a settings save during the run is kept and the run is not discarded. The
    merge is `merged_distributions`, a public function with tests.

14. **The rule for plugins outside the list is worded for what it does.** The
    harness checkbox reads "Uninstall plugins that are not in my list" with the
    hint "Muro asks before it uninstalls. Only on this harness. The rule for all
    of them is in Settings."; the Settings segment option "Always uninstall"
    becomes "Uninstall, asking first"; the chip "Removed at the next sync"
    becomes "Removal waits for your confirmation"; the notice after saving is
    "Saved. Muro will ask before it uninstalls plugins outside your list."; the
    Settings note says the background sync never uninstalls.

Files written by Muro 0.5.6 are read without migration; every new field is
optional.

## Consequences

**What a person sees differently.**

- **Apply all** no longer uninstalls on its own authority: with removals in the
  plan it opens the review sheet, whose primary button says how many plugins it
  will uninstall and how many records without files it will clear, and whose
  second button applies the rest.
- A Claude Code record without files reads "files missing" in the harness
  sheet, cannot be adopted, and, when it is a listed, managed plugin, is planned
  as an update ("Files missing").
- After an update that failed, **Plan a reinstall** puts the previous version
  back.
- An update that changes a plugin's name on Claude Code or Codex installs the new
  copy first. If the old one then fails to uninstall, it stays and appears under
  "Installed, not in your list". The statement of ADR-0028 and of
  `docs/desktop.md` that Muro never installs a second copy beside an adopted one
  holds with this exception: a second copy exists for the length of an update
  that renames the plugin, and stays when the old one cannot be uninstalled.
- A plugin removed from the list shows under "Installed, not in your list" and
  can be added again.
- A plugin of a marketplace that puts several plugins in one folder is refused
  with a message that names them, not installed as the first of them.
- A harness whose files cannot be read blocks that harness only.
- "Adapt with AI" refuses a source in no Git repository, or in a repository
  without a complete MIT or Apache-2.0 license file, before any money is spent;
  a finished adaptation survives a rename or a settings save; one run gives the
  plugin an adapter for every harness that had none.

**What the background sync no longer does.** It never uninstalls, whatever the
rule says. It applies the other operations, leaves the removals, and says how
many wait. With a plan of removals only it does not call `apply`. The removals
stay in the sync state as pending until the person confirms them in the review
sheet.

**What stays out.** The specification's non-goals:

- standalone skills, plugins in project or local scope, OpenCode's `plugins/`
  folder;
- slash commands, subagents and MCP servers through adaptation;
- installing one of several plugins that share a marketplace folder;
- which licenses the factory accepts (ADR-0005);
- the `stable` policy's use of the GitHub API without authentication;
- Codex being unreadable when one of its own marketplaces is broken;
- a Hermes `plugin.yaml` whose version is a YAML number (`1.10` is read as 1.1,
  so the number's text is not the version): it stays refused;
- removing old source checkouts under `<data>/sources/`, deferred because it adds
  a recursive delete to a safety change and its prefix rule was undefined on
  Windows;
- version ordering: versions stay opaque strings.

Possible later work: standalone skills; adoption that follows the harness;
telling the person what an adapter could not carry; removing old checkouts; an
in-place update on Claude Code.

## Alternatives rejected

- **Turn `exclusive` off and keep one-click apply.** One change, no contract, but
  it does not protect the setting already on, and the worker would still
  uninstall for anyone who turns it on.
- **Roll back inside `native::install`.** The person would not see a missing
  plugin, but `install` would need the previous artifact, name and version, and a
  failure during rollback leaves two failures to report. The retained artifact
  and "Plan a reinstall" exist; the design makes them reachable.
- **Write the receipt before the check, always.** One write path, but it replaces
  the old receipt on every install, so a failed check loses the record recovery
  needs; keeping the old one inside the new (`previous`) adds a nested record
  that `retained_artifact` and `cleanup` must both read. The file on disk already
  holds the old receipt when a check fails; only a first install has nothing
  recorded.
- **Re-read the registry in the job and save with the new revision.** No new
  action, but a change between the re-read and the save still discards the run,
  and the job would overwrite fields edited meanwhile. The merge must happen
  under the writer lock.
- **A license warning the person confirms.** It never refuses a source the factory
  would accept, but it adds a sheet state and the person can still pay for a
  certain failure. The check refuses only when no license-named file passes.
- **Update in place with `claude plugin update <id>`.** Not adopted now:
  `AGENTS.md` asks for a host command to be run live before it is written, and
  this one has not been. See the open questions.
- **Drop "one adaptation, every harness".** The adapters are built and validated
  by the same factory run; registering one of five makes the person pay five
  times. The risk is stated below.
- **Journal the intended receipt before the install.** A reconciliation step
  could claim a copy Muro did not install.
- **Check the fixes one at a time in CI.** The consent fix could be checked alone
  first, but the owner asked for the packages to run in parallel.

## Risks

- **Rust is not compiled before CI.** Seven writers cannot build. The single
  checkpoint is one run of the `Tests` workflow after all packages; its failures
  are fixed before anything is released.
- **A license in a file with another name.** `license_path` may name any file; a
  repository licensed by `MIT.txt`, say, is refused by the preflight. Accepted:
  that source is adapted from the command line (`muro absorb`), which has no
  preflight.
- **The preflight is not the license gate.** It passes when any license-named file
  passes, a vendored dependency's included. It catches only "no acceptable text
  anywhere"; the factory's gate still decides.
- **Removals wait for as long as the person leaves them.** On an exclusive target
  the worker never uninstalls, so the removals stay pending, and counted as
  changes waiting, until the person confirms them. Intended; the settings text
  says so.
- **Unreviewed adapters.** One adaptation registers adapters for harnesses the
  person did not ask about. They pass the same factory validation and build as
  the asked one, and are installed only on targets the plugin is ticked for.
- **An adapter installed unattended.** With automatic sync on, a ticked target
  that was blocked for want of a build gets its `muro` adapter and the worker
  installs it at its next run, with no review. That is what automatic sync does
  for any new build; it is stated here because the person asked for another
  harness.
- **Existing tests.** Tests that apply a plan with a removal fail under the
  confirmation until they send the count.

## Not decided

- **Adopted plugins.** A plugin added with "Add to my list" is bound to the
  harness's cache folder of that day; after the harness updates it, Muro plans a
  move back, or blocks. It needs a product decision.
- **Same-id update on Claude Code.** Whether `claude plugin update <id>` replaces
  a copy in place has not been run live. Until it is, the order stays uninstall
  then install, and the way back is "Plan a reinstall".
- **Exclusive on Codex.** Codex lists its bundled plugins as installed, so on an
  exclusive Codex target they would be planned as removals. They are confirmed
  now, not decided.

## Verification

None run. The tests are written and wait for the `Tests` workflow: the registry
service, the Claude Code inventory and the install commands, the source
resolution, the desktop runtime, `tests/test_license_check.py`, and the pure
functions of the page. The Python and TypeScript parts can run locally; the
Rust parts only on GitHub. Three behaviours have no service test, because the
service tests' fixtures hold an OpenCode inventory and cannot produce a Claude
Code one: `activate` for an adopted copy, the receipt of a failed first install,
and `present`. The harness command lines (the install and the removal on an id
change, on both harnesses) were not run on a real Claude Code or Codex, and no
adaptation was run. The record `docs/verification/2026-11-21-sync-safety.md`
lists what was reviewed, what was changed and what was not executed; it is
written after the packages report.
