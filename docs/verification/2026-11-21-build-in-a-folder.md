# A Muro build in a folder of its repository is found from the address (2026-11-21)

## What the owner saw

Muro 0.5.6 (portable, `D:\Software\Muro`), Sync, Review changes, with Marionette
added as `https://github.com/acaprino/marionette`:

> Claude Code / Marionette: no Claude Code build: the source has none of
> .claude-plugin/plugin.json, .claude-plugin/marketplace.json,
> adapters/claude-code. [...] It is left out of this sync.

Owner: "è praticamente inutilizzabile".

## Cause, read on this machine

- `data/registry.json`: source `https://github.com/acaprino/marionette`, policy
  `head`, resolved to commit `4ae20142bd43` (`marionette-v0.5.1`).
- That checkout holds `README.md`, `releases/` and `marionette/`; the builds are
  in `marionette/adapters/<harness>` (`claude-code` 0.5.1 and the other four).
  It has no `.claude-plugin/marketplace.json` and no
  `.agents/plugins/marketplace.json` at the root.
- `marionette-v0.5.1` was published at 07:26 UTC. The step that writes the root
  marketplaces (`muro marketplace`, commit `dbf6000`) was written at 11:10 UTC,
  so it has not run on any Marionette release yet. Muro 0.5.6 looks only at the
  root, so it found nothing, for any harness.
- Even with the root marketplaces, Pi, OpenCode and Hermes have none and would
  still have needed `#marionette`.

## Change

`crates/muro-registry/src/sources.rs`: a source that holds nothing at its root
for a harness is looked at one folder down for a Muro build
(`<folder>/adapters/<harness>` with a valid manifest; hidden folders are not
looked at). One such folder is used, for every harness; several are not chosen
from, and the plan names the sources that choose each. What the root holds
still comes first. The "no build" message also names
`<folder>/adapters/<harness>` among the places looked at.

## Not executed

- The Rust tests added with the change (`a_muro_build_in_a_folder_of_the_source_is_found_from_the_source_alone`,
  `muro_builds_in_several_folders_are_not_chosen_from`,
  `what_the_root_holds_comes_before_a_build_in_a_folder`) and the rest of the
  crate: Rust is built and tested on GitHub Actions only. They wait for CI.
- The desktop app with the change: it is built by the release workflow.
- No Marionette release and no change in `acaprino/marionette`.

## Until a Muro release carries the change

Muro 0.5.6 reaches Marionette with the source
`https://github.com/acaprino/marionette#marionette` (the folder was checked in
the checkout above: `marionette/adapters/claude-code/.claude-plugin/plugin.json`
is `marionette` 0.5.1).
