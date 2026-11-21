# Claude Code plugins without a manifest or a version in it (2026-11-21)

## Request

The record of the same day, `2026-11-21-source-structures.md`, left this
limit: Muro refused a Claude Code plugin without `.claude-plugin/plugin.json`,
or whose manifest declares no version, though Claude Code installs both. The
owner: "fixalo".

## Claude Code's behaviour, read and run

- Documentation (marketplace reference, plugin manifest and loading pages,
  read 2026-11-21): the manifest is optional; without it the marketplace entry
  is the manifest. The version is the manifest's, else the marketplace entry's,
  else derived from the source: a Git source's commit, 12 characters; a local
  folder outside Git gives `unknown`.
- Run live the same day, Claude Code with `CLAUDE_CONFIG_DIR` set to an empty
  scratch folder, a local marketplace shaped like the one Muro installs from
  (`releases/<folder>` entries): an entry `ay` with version `0123456789ab` and
  no manifest installed as `ay@muro-test`, version `0123456789ab`; a manifest
  `{"name":"bee"}` with entry version `ba9876543210` installed at
  `ba9876543210`; an entry with no version and no manifest installed at
  `unknown`. `installed_plugins.json`, which Muro's inventory reads, recorded
  those versions.

## Change

- Resolution (`sources::identity_in`): for Claude Code, the name and version are
  the manifest's, else the marketplace entry's, else the version is the first
  12 characters of the source revision (the folder's tree hash for a folder on
  this computer, so a change still reads as a new version, where Claude Code
  would say `unknown`). A folder without a manifest is a Claude Code plugin only
  when a Claude Code marketplace lists it under a valid name. The distribution
  records `name` beside `version`.
- `native::distribution_identity` is the one rule for preparing and for
  reinstalling a retained copy: a version the manifest declares must still match
  the recorded one; what the manifest lacks comes from the distribution or the
  receipt. Other harnesses still need their manifest and its version.
- The artifact and the receipt carry `name`; `native::install` takes the name
  and the version the plan resolved and writes them in the entry of the
  marketplace Muro installs from (`market_document`). A plan made before
  artifacts carried the name falls back to the manifest's.

## Verification

- Rust, on GitHub Actions, branch `fix/claude-plugin-identity`: the resolution
  tests alone first (commit dcebcb3), then the implementation with the unit
  tests of `distribution_identity`, `market_document` and `prepare` /
  `retained_artifact`. Results: see the commit that adds this record.
- The live run above checks the host protocol. The Rust install path
  (`native::install` against a real Claude Code) is covered only by the ignored
  tests that need `MURO_CLAUDE_TEST_EXE`, not run: there is no cargo on this
  machine.

## Not executed

- The desktop app on this change, and a sync of such a plugin end to end.
- Codex: unchanged, it still needs `.codex-plugin/plugin.json` and a version.
