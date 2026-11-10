# Pin modes and release pins — 2026-11-10

Owner decisions: "solo release pubblicate", "no HEAD di commit a caso", "ogni
intake ha una modalità, o release o head commit, o static version". Contract in
ADR-0009 (Proposed).

## Pins

| Source | Mode | Release | Commit | Change of selected content |
|---|---|---|---|---|
| taste-skill | release | v2.5.1 (2026-11-07) | `f6b76575` | none: the tag is the commit already pinned |
| wayfinder | release | v1.3.2 (2026-10-29) | `d1478fcb` | none: 3 commits back, no selected path differs |
| ui-ux-pro-max | release | v2.15.0 (2026-08-13) | `a38d04c3` | 80 commits back, see below |
| genoffice | release | v0.12.852 (2026-11-04) | `4b55db9e` | 59 commits back, see below |
| motion-design | head | none published | `f9a8a041` | none |
| gsap-scrolltrigger | head | none published | `aed9cfd3` | none |
| ai-design-skills | head | none published | `456d9e0d` | none |
| explain-this | head | none published | `f64dab45` | none |

Releases were read from the GitHub releases list on 2026-11-10: each tag above
is the newest non-draft, non-prerelease release of its repository. The four
`head` upstreams have no release and no tag; the owner chose `head` for them
after a first assignment to `static`. All four pins equalled their remote HEAD
when checked.

## What the two older snapshots lack

- **genoffice v0.12.852** (skill 2.68.0, `cli >=0.9.0`) against the reviewed
  `d8eb53ba` (2.69.0): the `--no-generator-fields` option of
  `create --type docx`. Against `8dc3bd16` (2.70.0) also two tools of the app's
  own MCP server. No Office capability uses any of them. `LICENSE` and `NOTICE`
  unchanged.
- **ui-ux-pro-max v2.15.0** against the reviewed `4f2dbb67`: the `--rtl` search
  filter, one UX guideline (`ime-composition-enter`), one style, later data
  corrections in `products.csv`, `styles.csv` and three stack files, and the
  explicit `sys.path` line in `search.py` for embedded Python builds.
  `visual-direction` uses none of the missing options. The data rows were not
  compared one by one.

## Evidence

- `tests/test_pin_modes.py`: **26 passed**: each mode through a local
  repository and through a `file://` remote, lightweight and annotated tags,
  wrong commit, unknown tag, malformed tag names, missing or invalid `pin`, and
  the modes of the eight manifest sources.
- Existing fixtures now declare `"pin": "head"`; their expectations are
  unchanged.
- `python -m pytest -q -p no:cacheprovider`: **197 passed**.
- `python muro_build.py --validate`: catalog and router valid.
- `python muro_build.py --check-sources`: OK against the eight real remotes,
  four of them resolving a release tag to the pinned commit.
- Fresh `build_release` from the repository manifest into a temporary directory
  outside the repository: five host folders; packaged GenOffice `SKILL.md` is
  2.68.0. `claude plugin validate`: Validation passed (structural only).
  Repository `dist/` was not replaced.
- Packaged `scripts/ui-ux-pro-max/scripts/search.py` from that release, run from
  a directory outside the checkout with
  `"internal operations dashboard" --design-system --json`: exit 0, JSON with
  `design_system` and `persistence`, no file written. Real offline execution of
  the v2.15.0 helper; not a review of its recommendations.

## Limits

- Git proves the tag and its commit. That a tag is a published release was read
  from GitHub once, today; the gate does not re-check it.
- Nothing reports a newer upstream release. Re-pinning is manual.
- No deck, document, explainer or design was produced with the older snapshots.
- No commit, push, installation or publication was made.
