---
id: office-deck
role: deck-authoring
when: —
after: []
outputs: ["deck_outline", "deck_file", "deck_review"]
checks: ["outline_and_pages_checked", "deck_audit_clean", "deck_render_reviewed", "deck_facts_sourced"]
intents: [{"id":"office.presentation-creation","description":"Produce a new slide deck as a real PowerPoint file from a brief or from source material, designed through a style sheet, a checked outline and one specification per page.","excludes":["Changing text, pictures or single slides of a deck that already exists is file editing, not a new deck.","A web page, app screen, Figma design or HTML slideshow is not a PowerPoint file.","An outline or talking points wanted only in the conversation do not require building a file."]}]
tools: [{"name":"genoffice-cli","purpose":"Run the user's installed genoffice command line (0.9.0 or later), or its one-to-one genoffice mcp tools, to check, build, render and audit the deck. It writes only the requested output path and appends each command to ~/.genoffice/cli-audit.jsonl.","required":true},{"name":"file-access","purpose":"Create the deck folder with its style sheet, outline and one page specification per slide, and read the user's source material.","required":true},{"name":"image-inspection","purpose":"Look at the rendered slide images and contact sheet before reporting the deck.","required":false},{"name":"genoffice-cloud","purpose":"Web search, image search and image generation through the provider configured in GenOffice. The query or the referenced file leaves the machine.","required":false}]
hooks: []
conflicts: []
---

# Office Deck (new presentation)

Builds a new PowerPoint deck with GenOffice's staged pipeline: the host AI writes design and content as files, and the `genoffice` engine checks each stage before the next one starts. In the source's words: "Whenever the user wants a presentation, however short, do not hand-place ops: follow the staged pipeline the GenOffice app itself uses."

## Behavior

Read `<package_root>/scripts/genoffice/skills/genoffice/SKILL.source.md` whole before working. It is the method in the source's own words, and the steps below are an index into it. The sections that govern this capability are "Designing a deck", the first row of "Which command", "Reading the user's files", "Pitfalls", "When a command fails", the Deck row of "Before you say "done"" and "Path rules". The other sections ("Editing an existing deck", the workbook and document rows, `merge`, `open`, `selection`) belong to `office-files` and `office-authoring` and are not run in this step. Where this body and the original differ, the original wins, except for the changes listed in the Sources section below under "Changes for coexistence".

1. **Check the engine.** Run `genoffice --version` first. If the command is not found, GenOffice writes the launcher directory to `~/.genoffice/launcher` (Windows: `%USERPROFILE%\.genoffice\launcher`) on every start: "read that one line and run `"<dir>/genoffice"` from bash or `"<dir>\genoffice.cmd"` from PowerShell / cmd, quoted, in place of `genoffice` below"; the default locations when that file is missing are in the original's first paragraph. If GenOffice is not installed, install it: say in one line what is installed and from where (the release for this platform from https://github.com/genspark-ai/genoffice/releases), run it, then confirm with `genoffice --version`. If the installer needs the user or fails, say which step is theirs and stop this delivery; do not simulate a deck or build it another way. "Always add `--json` when a program reads the output"; read `status`, `error`, `suggestion` and `detail`, and "never parse `message`".
2. **Load the references.** "`genoffice guide slides design` once per session, then `genoffice guide slides spec`." Do not guess op or spec fields from the original: "the guide is generated from the validator and is always current". "Run `genoffice capabilities --json` once: it says whether search, image search and image generation are configured in GenOffice; use them for facts and photos only when they are, and plan photo-free pages otherwise."
3. **Read the user's material.** Source material "is read by you, not by genoffice: md, txt, csv, pdf and images you open directly. Office files are zipped XML, so go through the CLI first" (`convert --to md`, `convert --to csv --sheet <name>`, `sheet read --range ... --json`, `slides read --full --json`, `pdf read`; the exact commands and limits are in "Reading the user's files"). "Take figures and wording from that material; never `cat` or `unzip` the Office file itself."
4. **Style and outline.** "Make a folder for the deck. Write the style sheet to `deck/style.md` (colors, fonts, layout variants, one sentence of style). Then the outline to `deck/outline.json` (core hook + one entry per page: title, type, layout, brief with real figures, image_queries) and run `genoffice slides check deck/outline.json --json`; fix every error before going on. Show the outline to the user only if they asked to review it."
5. **One page per step.** "re-read `deck/style.md` and the page's outline entry, resolve its photos, write `deck/pages/NN.json` (one page object echoing the entry's `title`, `type`, `layout`), run `genoffice slides check deck/pages/NN.json --json`; it finds `outline.json` and `style.md` one folder up and checks the page against entry N and the palette. Fix until `detail.audit`, `detail.outline.findings` and `detail.style.offPalette` are empty (a disagreement with the outline exits 1), then the next page. Never write several pages in one file or one step."
6. **Build.** `genoffice create --type pptx --spec deck/pages --outline deck/outline.json --out deck/deck.pptx --json` "(refuses to run while an outline page has no file or a page disagrees with its entry)".
7. **Look and audit.** "Then `genoffice slides render deck/deck.pptx --out deck/shots --json` and look at the PNGs; `genoffice slides audit deck/deck.pptx --json` for the geometry findings. Fix a page in its file and `genoffice slides replace deck/deck.pptx --slide n --spec deck/pages/NN.json --json`. At most two fix rounds." Before reporting, the Deck row of "Before you say "done"": `slides audit deck.pptx --json` → "`detail.issues` empty (apply `suggest` ops otherwise)"; `render deck.pptx --out shots --grid --json`, "open the contact sheet"; report "The `.pptx` path and anything you left as is".

## Output handoff

Return `deck_outline` (outline path and page count), `deck_file` (the .pptx path) and `deck_review` (audit result, rendered shots, anything left as is) as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- "Deck specs are px on a 1280×720 canvas; ops are EMU": "Never mix the two in one file."
- "`slides read/audit/render/replace --slide n` and op targets `{ "slide": n }` are **0-based**; `render --page n` is **1-based**": "`s_0` is page 1 of the PNGs."
- "Photos come from `genoffice search --images` results, `genoffice image`, or local files the user gave you; never draw a grey box in place of a photo. Figures come from the user's material or `genoffice search`; say so when a number is illustrative."
- **Data leaving the machine:** "Every command runs headless on the app's own engines; only `search`, `image` and `media` send data off the machine, to the provider configured in GenOffice." They send the query or the referenced file.
- "`create`/`convert`/`image` never overwrite (exit 2, `output_exists`)": "Pick another name, or `--force` when the user asked for replacement." "If `GENOFFICE_ALLOWED_ROOTS` is set in the environment, genoffice only reads and writes inside those directories (exit 2 otherwise); stay within them."
- "Do not run `genoffice open` unless the user asks to see the file in GenOffice."
- On an error: "Branch on `error`, do what `suggestion` says, then resend the **whole** batch (atomic apply wrote nothing)." The next command for each `error` value is in the table of "When a command fails". A successful result may still carry `warnings[]`: "Read them, report what matters, do not retry."

## Checks

- **outline_and_pages_checked**: `slides check` reported no errors for the outline and for every page file.
- **deck_audit_clean**: `slides audit` returns no `detail.issues`, or every remaining issue is listed in `deck_review`.
- **deck_render_reviewed**: the slides were rendered to images and actually looked at; a host that cannot view images records this as not-tested.
- **deck_facts_sourced**: every figure traces to the user's material or a search result, and illustrative numbers are labelled.

## Sources

- AI intent mapping: genoffice skill → office.presentation-creation, from its "Designing a deck", "Which command" and "Before you say done" sections. The same skill also yields the intents of `office-authoring` and `office-files`.
- Source: genoffice (genspark-ai/genoffice@4b55db9e, release v0.12.852) — `skills/genoffice/SKILL.md` (skill 2.68.0, cli >=0.9.0)
- Runtime dependency: the GenOffice app and its `genoffice` command line (Apache-2.0), not bundled by Muro; the capability installs it from the official releases when it is missing.
- Not adopted: `search`, `image` and `media` give no standalone intent; they are optional, data-leaving steps of this pipeline. The skill, MCP and CLI installation or registration commands are dropped.
- Hooks: the selected SKILL.md defines none. The rest of the repository (app, packaging, CLAUDE.md, .github) was not inspected for hooks.
- Harmonization 2026-11-12 (claude-design-system-prompt intake): `html-deck` builds a presentation as a web page. The two are alternatives by wanted format with different outputs; a request that names no format stays here, and this intent already excludes an HTML slideshow.
- Harmonized by: prompts/harmonizer.md — pipeline kept as written.
- Changes for coexistence (ADR-0017): the source's frontmatter `name` and `description` ("Use whenever the user asks for ...") are not carried: the coordinator classifies by meaning and this body is not registered as a skill; the rows and commands that install or register the source itself (`skill list`, `skill install`, `skill path`, `mcp install`, `mcp uninstall`, `mcp list`, `install-cli`, the "Give another agent (or a fresh machine) this skill" row) are not followed: a capability never installs the source plugin; the source assumes "`genoffice` is installed with GenOffice" and gives no install method, step 1 adds the install of a missing engine from the official releases and "do not simulate" (factory rule on missing runtime dependencies, ADR-0007); the source's "Report the path" goes through `## Output handoff` (outputs are handed over through the coordinator); the render check may be recorded as not-tested on a host that cannot view images (a step that host cannot run); "Editing an existing deck", the workbook and document paths, `merge`, `open` with a target and `selection` are in the same original but are run by `office-files` and `office-authoring`, not in this step (one capability per step); `search`, `image` and `media` are followed only as steps of this pipeline, not as standalone uses (dropped in `delivery.json`); the "Deck from ops" example is the source's fixture path and is not this capability's method, as the source itself says.
