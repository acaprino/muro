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

Builds a new PowerPoint deck with GenOffice's staged pipeline: the host AI writes design and content as files, and the `genoffice` engine checks each stage before the next one starts. Never hand-place slide ops for a new deck.

## Behavior

1. **Check the engine.** Run `genoffice --version`. If the command is missing, read the launcher directory from `~/.genoffice/launcher` (Windows: `%USERPROFILE%\.genoffice\launcher`) and call the launcher there. If GenOffice is not installed, install it: say in one line what is installed and from where (the release for this platform from https://github.com/genspark-ai/genoffice/releases), run it, then confirm with `genoffice --version`. If the installer needs the user or fails, say which step is theirs and stop this delivery; do not simulate a deck or build it another way. Add `--json` to every command and read `status`, `error`, `suggestion` and `detail`, never `message`.
2. **Load the references once.** Run `genoffice guide slides design`, then `genoffice guide slides spec`; they are generated from the validator and override anything remembered. Run `genoffice capabilities --json` to learn whether search, image search and image generation are configured.
3. **Read the user's material.** Open md, txt, csv, pdf and images directly. Office files go through the engine (`convert --to md`, `sheet read --json`, `slides read --full --json`); never unzip them.
4. **Style and outline.** In a new deck folder write `style.md` (colors, fonts, layout variants, one sentence of style) and `outline.json` (core hook plus one entry per page: title, type, layout, brief with real figures, image_queries). Run `genoffice slides check <deck>/outline.json --json` and fix every error. Show the outline to the user only if they asked to review it.
5. **One page per step.** Re-read `style.md` and the page's outline entry, resolve its photos, write `<deck>/pages/NN.json` and run `genoffice slides check <deck>/pages/NN.json --json` until `detail.audit`, `detail.outline.findings` and `detail.style.offPalette` are empty. Never write several pages in one file or one step.
6. **Build.** `genoffice create --type pptx --spec <deck>/pages --outline <deck>/outline.json --out <deck>/deck.pptx --json`.
7. **Look and audit.** `genoffice slides render <deck>/deck.pptx --out <deck>/shots --json` (or `render --grid` for one contact sheet) and look at the images; then `genoffice slides audit <deck>/deck.pptx --json`. Fix a page in its file and rebuild it with `genoffice slides replace <deck>/deck.pptx --slide n --spec <deck>/pages/NN.json --json`. At most two fix rounds.

## Output handoff

Return `deck_outline` (outline path and page count), `deck_file` (the .pptx path) and `deck_review` (audit result, rendered shots, anything left as is) as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `.muro/map.md` or `.muro/state.json`; the coordinator is their only writer.

## Specifics

- Deck specs are px on a 1280×720 canvas; ops are EMU. Never mix the two in one file.
- `slides ... --slide n` is 0-based; `render --page n` is 1-based.
- Photos come from the user's files, `genoffice search --images` or `genoffice image`, and only when `capabilities` reports them configured; otherwise plan photo-free pages. Never draw a grey box in place of a photo.
- **Data leaving the machine:** documents are processed locally, but `search`, `image` and `media` send the query or the referenced file to the provider configured in GenOffice. Use them for public facts and pictures; do not pass the user's own files or confidential content to them unless the user asked for that.
- Figures come from the user's material or a search result; say so when a number is illustrative.
- `create` never overwrites: on `output_exists` choose another name, or pass `--force` only when the user asked to replace the file. Stay inside `GENOFFICE_ALLOWED_ROOTS` when it is set.
- Do not run `genoffice open` unless the user asks to see the deck in GenOffice.
- On an error, branch on `error` and follow `suggestion`; retry `conversion_failed` or `app_crashed` once, then tell the user.

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
- Harmonized by: prompts/harmonizer.md — pipeline kept as written; the upstream "use them when configured" rule for cloud commands is narrowed to public content unless the user asks otherwise.
