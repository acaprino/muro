# Re-reading the 29 Marionette capabilities against their originals — 2026-11-12

Owner request, after the report that only the permanent policy followed the rule
"Muro non altera il contenuto": "falle tutte" (re-read every capability, verify
Hermes, open the pull request). Rule and its amendment: ADR-0017.

## What was done

- The 13 sources were fetched at their pinned commits (read only, nothing in
  them was executed).
- Nine delegated host-LLM agents re-read the 29 capabilities, each against its
  own originals, with one written brief. For every difference between body and
  original they decided: place only, weakened, lost, added, contradicted, or a
  change a collision requires. They edited bodies and `## Sources` only; no
  frontmatter field changed, so `ROUTER.md`, `entries.json`,
  `guide-examples.json` and `eval-cases.json` are untouched.
- Each body now: names the packaged originals the host reads whole and says the
  original wins; quotes the source where it states a rule; lists every
  difference with its collision under "Changes for coexistence (ADR-0017)".
- `sources.json`: `claude/system-prompt.md` and the six Ponytail skill files
  left `intake_only_paths`, so they travel and are read at run time.
- `delivery.json`: four reasons corrected (the prompt as a whole, the Ponytail
  on-demand skills and their review merge, landing-page-design's visual system,
  GenOffice's provider commands).

## What the re-read found (the main cases)

| Capability | Found | Now |
|---|---|---|
| work-map | grilled before naming the destination (the source names it first); "one 100K token agent session" had become "one session"; Ponytail's "Deletion beats addition" had become "helps only when required behavior survives" | source order and sentences |
| engineering-review | audit's "At most 20 findings" had become a display default; fixed opening and closing lines lost | as written |
| engineering-debt, engineering-guidance | row format, closing lines and the published scoreboard lost; level meanings paraphrased | quoted |
| token-economy | hook command dropped `--host codex` / `--host copilot`; Codex manifest has five events, the body said six; `status` rule applied to every command | fixed |
| visual-direction | "one or two moments at most" against the source's "every page carries one dealt moment, two on a long page"; a client's violet kept against "Never violet or lavender"; landing-page-design B8 to B10 in no decision | source words; B8 to B10 carried |
| design-guidance | a `--rtl` flag that does not exist; checklist applied "for any stack" while the source scopes it to native and mobile | removed; scoped |
| figma-design | "Never invent facts" against the source's "Use believable names, brands and numbers"; workflow step 6 lost | scoped to recorded proof; restored |
| design capabilities (7) | fonts to avoid had become "need a stated reason"; brand "always confirm" had become "only what is open"; many review items lost in condensed lists | read from the packaged skills and chapters |
| office (3) | error handling condensed to "retry once"; three privacy limits no source states | source table; limits removed (open point 1) |
| paper (3), research (2), handoff | completion conditions, numbers and several "do not" rules lost; rules added (forced preview, package folder read-only) | quoted; additions removed |
| explainers (2) | Quality Checklist of step 8 lost; "use system fonts on request" against "Don't remove. Don't add other fonts." | restored; removed |
| motion (3) | CRITICAL rule 2 lost; "80%" had become "most"; "none on mobile" stronger than "avoid on mobile" | quoted |

## Hermes

Hermes could not be installed here: the session's permission policy refused to
install and run external code, so there is **no live Hermes run**. Its source
was read instead (NousResearch/hermes-agent at `34ecc0fa`, 2026-11-12:
`hermes_cli/plugins_dispatch.py`, `hermes_cli/plugins_context.py`,
`agent/turn_context.py`, `tools/hook_output_spill.py`,
`website/docs/user-guide/features/hooks.md`).

- A system prompt section holds at most 4,000 characters, all sections together
  8,000, and `max_chars` above 4,000 raises `ValueError`. Marionette's policy is
  9,998 characters, so the adapter's `max_chars=len(policy)` would have been
  rejected at registration. This answers "how much text does a section accept".
- Fix: a policy up to 4,000 characters is still one section. A longer one is
  never cut: it registers `pre_llm_call`, whose return Hermes appends to the
  turn's user message, in pieces of at most 8,000 characters (Hermes spills a
  hook return over 10,000 to disk), on the first turn and again when the text
  is no longer in the conversation history.
- Cost on Hermes: about 2,500 tokens once per session in the first user
  message, again after a compression. It is the turn's context, not the system
  prompt, so its authority is lower than on the other four hosts.
- Not verified: that the history a hook receives still holds the text of
  earlier turns in `api_content` or `content` (if not, the policy is sent on
  every turn: more cost, no loss); model behaviour; an installed plugin.

## Commands and results

| Command | Result |
|---|---|
| `python -m pytest -q` on `e8d757d`, before any change | `436 passed, 15 skipped` (the green run the earlier session could not get on a full disk) |
| `tests/test_hermes_policy.py` with the three new long-policy cases, before the fix | `3 failed, 9 passed, 2 skipped` |
| same, after | `12 passed, 2 skipped` |
| new `tests/test_capabilities_read_originals.py`, first run | `2 failed, 29 passed`: `work-map`, `engineering-guidance` and the three office bodies named a skill file at `scripts/<id>/skills/<id>/`, where the factory writes `scripts/<id>/SKILL.source.md` |
| same, after correcting the five bodies | passed |
| `python muro_build.py --manifest examples/marionette/sources.json --validate` | `OK: capabilities and ROUTER.md valid` |
| same with `--check-sources` (contacts the pinned remotes) | `OK: all sources and plugin identity valid` |
| same with `--build --out <scratch>` | built; `scripts/claude-design-system-prompt/claude/system-prompt.md` and the six Ponytail skill files are in the release, `ponytail.md` is not |
| `python -m pytest -q`, final tree | `471 passed, 15 skipped in 195.21s` |

The 15 skips are 12 Windows shell-boundary tests, 2 installed-Hermes registry
checks and 1 installed-Pi check. Linux, Python 3.13.

## Not executed

- No host session on any harness after the re-read: nothing shows that a model
  reads the originals a body names, or follows them.
- The routing eval was not rerun. No intent, role, output, check name or
  `needs` changed; bodies are longer, which a focused plan now carries.
- Quotes were compared with the pinned files by throwaway scripts, per agent;
  a few short or nested quotes were checked by eye only. Several long reference
  files were read by headings, not line by line (named in each agent's report:
  taste-skill `system.md`, `motion.md`, `layout-v4.md`, `sections.md`;
  explain-this `figure-archetypes.md`; ui-ux-pro-max `pro-rules.md`,
  `quick-reference.md`; the TokenEconomizer engine code).

## Cost

- Capability bodies: 239,833 to about 376,000 characters in total (+57%).
- A step also reads its originals: for `ui-prototype` 13 chapters and two
  skills, roughly 25,000 characters (estimate from line ranges); most steps
  read one skill file.
- Release size grows by the prompt (35,565 bytes) and six skill files.

## Open points for the owner

1. **GenOffice provider commands — decided.** The limits "no user files or
   confidential content to `search`, `image`, `media` unless asked" were
   Muro's, with no source and no collision, so they were removed. Owner, same
   day: "io eliminerei in generale questo limite per tutto muro". It is now a
   factory rule (AGENTS.md, `prompts/intake.md`, `prompts/harmonizer.md`,
   ADR-0017 amendment). A search of the factory and of the 29 capabilities
   found no other limit of this kind: what remains are statements of what
   leaves the machine, in the source's words or in a tool's purpose.
2. **The design system prompt travels again as a file**, read by chapter. It
   reverses "non ha senso" of the ADR-0016 amendment, because seven
   capabilities now read it. The alternative is to quote the chapters inside
   the bodies (larger bodies, no file).
3. **Ponytail's English templates and persona are back** in the on-demand
   skills. A user writing in another language gets the source's English labels
   unless they ask otherwise.
4. **Remaining differences that rest on an intake goal, not on a collision:**
   wayfinder's pushed `research/<name>` branch (not pushed), work-map limited
   to engineering although the source calls the map "domain-agnostic".
5. **Recorded palette against a contrast blocker** (design-review): reported,
   not fixed, where the source fixes every blocker.
6. **Content that still does not travel:** taste-skill's kit, dealers, checkers
   and seventeen references (among them `copy-voice.md`, which the source
   orders read "in full before the first page"); research-bible's essay and
   notes (other authors' texts, reached by public address); TokenEconomizer's
   slash commands, root README and `repomap` commands. Changing this means
   changing `selected_paths`.
7. **Frontmatter the re-read found inexact, left unchanged** because it is
   mirrored in the router and the JSON files: token-economy's shell tool says
   "The commands make no model call" (`toolprune measure` makes two on Claude
   Code) and lists `PostToolUseFailure` without saying Codex has no such event;
   design-guidance's intent names a pre-delivery checklist the source scopes to
   native and mobile; paper-figure's plot intent omits chart kinds the source
   has; `design-options` has no question-form tool; `html-deck` no subagents
   tool.
8. **css-scroll** allows linear timing wherever progress tracks the scroll one
   to one; the recorded collision covers only horizontal scroll.
9. **paper-wiki** saves a custom profile in the package folder, as the source
   says, and tells the user that a new release replaces that file.
