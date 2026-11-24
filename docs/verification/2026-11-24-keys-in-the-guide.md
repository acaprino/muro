# API keys in the release guide and in INSTALL.md (2026-11-24)

Owner request: "questo va nella guida chiaramente". A package whose tools call services with API keys had no place that
listed them: the guide showed a capability's `tools` and their purpose, `INSTALL.md` had no structured list, and a
package such as Supads names about 85 to 90 distinct variables. `delivery.json` gains an optional `credentials` list;
the release guide shows it at once in an "API keys" panel; every `INSTALL.md` carries a "Keys" section with the same
names in the same order. The work is task T8, steps 1 to 4, of the plan of 2026-11-24 (design, section 6). Step 5, the
quick start in the README of Supads, is another repository's and was not touched.

Nothing was committed, staged or pushed: the change sits uncommitted in the worktree `keys-in-guide` (created from
`develop` at `06a9539`). The ADR amendment is [ADR-0010, "Amendment of 2026-11-24"](../adr/ADR-0010-release-html-guide.md).

## What was built

| Where | What |
|---|---|
| `muro/credentials.py` (new) | `ENV_NAME` (the pattern of a variable's name, moved from `delivery.py`, which imports it back as `_ENV_NAME`: one copy), `credential_errors` (shape and references), `declared_credentials`, `in_order` (the one reordering: ranked first by `rank`, then the rest as declared), `USED_BY`. Standard library only, pure functions |
| `muro/delivery.py` | `credentials` joins `_DOCUMENT_KEYS` and the message that lists them; `validate_delivery` gains one line; `install_note` gains the "Keys" section, appended after every other note and counted when it decides whether there is anything to say |
| `muro/guide.py`, `muro/guide.html` | The panel: strings in both `_I18N` dictionaries (all prefixed `keys_`), `_keys_html`, the panel's style `_KEYS_STYLE`, two placeholders in the template |
| `prompts/intake.md`, `harmonizer.md`, `delivery.md` | A paragraph of evidence, a section "Credentials" for the Harmonizer, a section "Credentials" and the declaration in the Output block for the Delivery protocol |
| Documents | ADR-0010 amendment, one sentence in the guide paragraph of `AGENTS.md`, this record |
| Tests | `tests/test_credentials.py` (new, 96 tests), additions to `tests/test_release_guide.py` (11 tests) and `tests/test_package_server_delivery.py` (5), the pinned message of the allowed keys in `tests/test_delivery.py` |

The check: an entry has exactly `env`, `service`, `required`, `unlocks` and may add `rank`, `route`, `used_by`. `env` and
`rank` are unique, `rank` a positive whole number, `used_by` names sources and capabilities that exist; its tools are
checked only against a `server_review` whose `tools` is a list of objects with an `id`, and never fail without one (that
block does not exist yet: another track adds it). There is no field for a value. No message repeats anything an entry
holds, and an entry is named by its position, so a key pasted into the wrong field is not echoed (tested with a made-up
secret in every field).

## Findings while building

- **The guide's script data held every string of the language** (`'i18n': tr`). A string added to `_I18N` would have
  changed the page of every package, with or without credentials. The panel's strings all start with `keys_` and are
  left out of the data, which is therefore what it was; the script reads none of them.
- **The page's style is shared too**, so the panel's CSS is not in the template: it lives in `guide.py` and enters
  through a second placeholder, empty for a package that declares no credentials.
- **`delivery.json` is part of `catalog_digest`.** A package that declares credentials has a different digest from one
  that does not (a package with an empty list has a different digest from one without the key, though the page shows
  no panel in either). That is the cost the design accepted; the ADR states it.
- **Tension with the plan, not resolved here.** The brief says to reuse the existing name pattern (letters of any case,
  `[A-Za-z_][A-Za-z0-9_]*`); the design (section 6, check C9) says capitals only (`[A-Z_][A-Z0-9_]*`), and `muro/agent.py`
  keeps a stricter `_VARIABLE_NAME` for the variable that holds the factory's own key. The brief was followed. A real
  list with a lower-case variable name is accepted.
- **The unattended run is protected by the prompt only.** `rank` is the owner's order. The prompt says that with no owner
  to ask the AI writes no `rank` that is not already recorded; Python does not compare it to the file on disk, as it
  does for `package_server` and `server_choice` (that guard is another track's area, `muro/agent.py`).

## Commands and results (this machine, Python 3.13, Windows; targeted pytest, one ad hoc script and a few inline snippets)

| Command | Result |
|---|---|
| Before any change: `python -m pytest -q tests/test_release_guide.py tests/test_native_install.py tests/test_package_server_delivery.py tests/test_mcp_servers.py tests/test_delivery.py` | 199 passed, 87 s |
| New tests first: `tests/test_credentials.py`, then `tests/test_release_guide.py`, then the install-note tests | Red each time for the right reason (a missing module, a missing panel, a missing section, missing prompt text), then green |
| After the change: `python -m pytest -q tests/test_credentials.py tests/test_release_guide.py tests/test_package_server_delivery.py tests/test_mcp_servers.py tests/test_delivery.py tests/test_native_install.py` | 311 passed (96 + 26 + 94 + 47 + 43 + 5), 97 s; run again on the finished tree after the last edit of the documents and prompts |
| `tests/test_policy_original_wording.py tests/test_factory.py tests/test_source_coverage.py tests/test_intake_only_paths.py tests/test_lessons.py` (they read the prompts or the install notes) | 60 passed |
| `tests/test_audit_p1.py -k domain_leaks` (the prompts name no domain term) | 1 passed |
| `tests/test_audit_p2.py -k governance` (reads the front matter of every ADR, which `changes:` of ADR-0010 now touches) | 1 passed |
| `tests/test_native_policy.py tests/test_claude_policy.py tests/test_codex_policy.py tests/test_policy_only.py tests/test_project_file.py` (policy, install and project view next to the changed code) | 182 passed, 2 skipped (the skips are environment ones that were there before) |

### Byte comparison with the commit before the change

One ad hoc script (`guide_probe.py`, kept in the scratchpad and not committed) built the shared fixture project once (the
same files as `portable_project`) and rendered its guide with whichever `muro` the path put first, under a frozen clock
(`muro.guide.datetime` replaced), each run asserting which package it imported. The base commit's `muro/` was extracted
with `git archive 06a9539 muro` (read only). This is a script, not a pytest run; the brief's "only targeted pytest" was
read as a ban on the suite and on compiling, and the script only calls the library functions the tests call.

| Package | Base commit | This change |
|---|---|---|
| No `delivery.json` | 481,939 bytes, sha256 `e3fc0c50…c8485db` | **identical**, same hash |
| A `delivery.json` with a decision and always-on text, no credentials | 482,434 bytes | **identical** (compared with `cmp`) |
| The same, with five credentials (three ranked) | not applicable | 486,740 bytes: the panel's markup and style |

A permanent test (`test_a_package_without_credentials_gets_the_guide_it_always_had`) keeps what it can keep without the
base commit: none of the panel's markup, style or strings in the page or the data of a package without credentials, and
the two placeholders glued to the text that was there, with no byte of their own.

### A release, and the packaged launcher outside the checkout

An inline snippet built a release from the fixture project with the five credentials (`build_release`): the Claude Code
and the Hermes `INSTALL.md` carry the "Keys" section with the names in order, `credentials.py` is in the host skill's
`muro/`, and `python <skill>/muro.py session-context`, started from the home folder, prints the policy and exits 0 (the
packaged runtime loads a `delivery.json` that declares `credentials`). That the panel is in the `GUIDE.html` of the
release and of every host's skill folder is the pytest's, not this snippet's
(`test_a_release_with_credentials_carries_the_panel_in_every_host_copy`).

## What the tests prove and what they do not

- They prove shape and references of the declaration, that no message repeats a field, the order, the placement of the
  panel in the page as a tree (a child of `main`, before the graph, with no `details`, `only-js`, hidden or
  `reference-data` ancestor), the text of the panel in both languages, that text is escaped, the section of
  `INSTALL.md` and its place before `## Install`, and the phrases of the three prompts.
- They do not prove that a model, given the prompts, writes a good list, orders it with the owner's words or asks the
  owner when it should: no model was run. The prompts are written and pinned by phrase.
- They do not show the panel to a person.

## Not executed

- **The page was not opened in a browser.** Its look at desktop and narrow widths, the scroll box of the table, the
  keyboard (the scroll box is focusable and has a name), printing and the dark rendering are unchecked. The CSS was
  checked only for balanced braces. The panel sits above the graph, so on a package with a long list the graph starts
  lower on the first screen; that is the owner's request ("chiaramente") and has not been looked at. The graph's
  canvas takes the mouse wheel for zooming and is as tall as the window, so how a reader scrolls from the panel to the
  graph and back, with a wheel or a finger, is also unchecked (a skip link to the graph exists and was there before).
- **GitHub Actions did not run.** The `Tests` workflow, the Windows and Linux differences (the tests ran on Windows
  only), the whole suite and the Marionette workflow are untouched by this record. `python muro_build.py --manifest
  examples/marionette/sources.json --validate` was not run; `tests/test_delivery.py::test_marionette_records_a_decision_for_every_source`
  validates that package's `delivery.json` with the new code and passed.
- **No package declares credentials yet.** The real list of Supads, its ranks and its quick start are written at its
  next harmonization, with the owner, and in its own repository.
- **No model ran the new prompts**, and `prompts/review.md` does not mention credentials.
- **How a host passes a variable to a server is not described anywhere** (`INSTALL.md` says only that the tools read
  the variables), because no run has shown it (ADR-0033, "Not run").
