---
id: office-authoring
role: document-authoring
when: —
after: []
outputs: ["office_file", "office_review"]
checks: ["engine_check_clean", "office_render_reviewed", "uncached_values_disclosed", "content_from_user_material"]
intents: [{"id":"office.document-creation","description":"Produce a new Word document or PDF as a real file from written content such as Markdown, HTML or notes: a report, letter, contract, memo or similar.","excludes":["Prose wanted in the conversation or as a Markdown or README file is not a request for an Office file.","Turning an existing file into another format without changing its content is a format conversion.","A slide deck is a presentation, not a document."]},{"id":"office.spreadsheet-creation","description":"Produce a new Excel workbook as a real file from data, with live formulas, formats, tables or charts.","excludes":["Analysing data in the conversation, or delivering a plain CSV, does not require a workbook.","Fixing cells of a workbook that already exists is file editing."]}]
tools: [{"name":"genoffice-cli","purpose":"Run the user's installed genoffice command line (0.9.0 or later), or its one-to-one genoffice mcp tools, to create, refine, check and render the file. It writes only the requested output path and appends each command to ~/.genoffice/cli-audit.jsonl.","required":true},{"name":"file-access","purpose":"Write the Markdown, HTML, CSV or JSON input and the ops files, and read the user's source material.","required":true},{"name":"image-inspection","purpose":"Look at the rendered pages or sheets before reporting the file.","required":false}]
hooks: []
conflicts: []
---

# Office Authoring (new document, workbook or PDF)

Creates a new Word document, Excel workbook or PDF as a real file with the locally installed `genoffice` engine, then checks it and looks at it before reporting.

## Behavior

Read `<package_root>/scripts/genoffice/SKILL.source.md` whole before working. It is the method in the source's own words, and the steps below are an index into it. The sections that govern this capability are the `create`, `docs`, `sheet`, `render` and `guide` rows of "Commands", the rows "A workbook from data" and "A Word document from text" of "Which command", the Word, Excel and "Conversions in the app" items of "Behaviour to know", "Workflow", "Pitfalls", "When a command fails", the Workbook and Document rows of "Before you say "done"", "Reading the user's files", the workbook and Word "Examples", "Path rules" and "Limits". The deck sections belong to `office-deck`; reading, converting and editing a file that already exists, `merge`, `open` and `selection` belong to `office-files`; they are not run in this step. Where this body and the original differ, the original wins, except for the changes listed in the Sources section below under "Changes for coexistence".

1. **Check the engine.** Run `genoffice --version` first. If the command is not found, GenOffice writes the launcher directory to `~/.genoffice/launcher` (Windows: `%USERPROFILE%\.genoffice\launcher`) on every start: "read that one line and run `"<dir>/genoffice"` from bash or `"<dir>\genoffice.cmd"` from PowerShell / cmd, quoted, in place of `genoffice` below"; the default locations when that file is missing are in the original's first paragraph. If GenOffice is not installed, install it: say in one line what is installed and from where (the release for this platform from https://github.com/genspark-ai/genoffice/releases), run it, then confirm with `genoffice --version`. If the installer needs the user or fails, say which step is theirs and stop this delivery; do not simulate a file or build it another way. "Always add `--json` when a program reads the output"; read `status`, `error`, `suggestion` and `detail`, and "never parse `message`".
2. **Prepare the content** as a file the engine reads: "Markdown or a restricted-HTML fragment" for a document; "CSV or a 2-D array / `{sheets:[{name,rows}]}`; `"=..."` cells are formulas" for a workbook. Read the user's source material as "Reading the user's files" says and "Take figures and wording from that material; never `cat` or `unzip` the Office file itself."
3. **Create.**
   - Document: `genoffice create --type docx --from <text.md | fragment.html> --out <path>`. "`create --from x.md` embeds local images referenced by relative path."
   - Workbook: `genoffice create --type xlsx --from <data.csv | table.json> [--header] [--decimal ,] --out <path>`. "`--header` freezes row 1 and filters the range".
   - PDF: `genoffice create --type pdf --from <document> --out <path>`, from the md or html written in this step or from the docx or xlsx made in this step. A PDF of a file the user already has is a format conversion (`office-files`).
4. **Refine with ops.** The source's paths are "`create --type xlsx --from data.csv | table.json` → `sheet apply --ops` for formats/charts → `sheet check`" and "`create --type docx --from report.md | fragment.html` → `docs check` → `render`". Before writing ops: "`genoffice guide <domain>` for the op fields (`guide <domain> <op> --json` for one op's schema), then write the ops JSON yourself." "`genoffice <domain> apply --dry-run` when the batch is large; a rejected op comes back as `op_rejected` with the executor's usage line — fix that op and resend the whole batch. Atomic by default: on rejection the file is untouched".
5. **Check.** Workbook: "`sheet check book.xlsx --json` → no `formula_error`, `missing_sheet_ref`, `number_overflow` (apply the `set_col_width` suggests)". Document: "`docs check report.docx --json` → no `broken_ref`, `placeholder_left`, `field_not_evaluated` you can fix". "`check`/`audit` exit 0 whether or not they found something; the findings are in `detail.issues[]` with a stable `code`, a `path` and, when possible, a `suggest` op to pass to `apply` as is."
6. **Look.** Workbook: "`render book.xlsx --out shots --json`, look at the sheet PNG". Document: "`render report.docx --out shots --json`, look at page 1 and the last". Report "The `.xlsx` path; name uncached formulas if any" or "The `.docx` path".

## Output handoff

Return `office_file` (every path written) and `office_review` (check findings, what was looked at, warnings) as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- "A Word document from text" is not for "a real web page (`convert page.html --to docx`)". "`html→docx` is html2docx for real web pages; a restricted-HTML fragment with `<formula>` goes through `create --type docx --from fragment.html` instead." "Tags outside the restricted set are stripped silently."
- "CSV import: a `sep=;` first line is honoured and removed, ISO dates become real dates, `--decimal ,` for `1.234,5`": "`--header` freezes row 1 and adds a filter; without it the first row is data."
- "Formulas the local engine cannot evaluate (FILTER, SORT, UNIQUE, LET, LAMBDA …) are written without a cached value": "`formulas_not_cached` warning lists them; `sheet read` shows the formula and no value until Excel opens the file. Not an error." Name them in the report.
- "PAGE / NUMPAGES / AUTHOR-style results are placeholders Word recomputes on open (`docs check` reports them as info), so say so when you hand over the file."
- "**Conversions in the app** (`→pdf`, `docx→html`, `html→docx`, `create --type pdf`, `render`): a hidden GenOffice process per call, 1–6 s, up to 180 s timeout, safe to run concurrently." They "need GenOffice installed, or `GENOFFICE_APP_BIN` pointing at it".
- "`create`/`convert`/`image` never overwrite (exit 2, `output_exists`)": "Pick another name, or `--force` when the user asked for replacement." "If `GENOFFICE_ALLOWED_ROOTS` is set in the environment, genoffice only reads and writes inside those directories (exit 2 otherwise); stay within them."
- "Every command runs headless on the app's own engines; only `search`, `image` and `media` send data off the machine, to the provider configured in GenOffice." This capability's paths do not use those three commands.
- "Do not run `genoffice open` unless the user asks to see the file in GenOffice."
- On an error: "Branch on `error`, do what `suggestion` says, then resend the **whole** batch (atomic apply wrote nothing)." The next command for each `error` value is in the table of "When a command fails". A successful result may still carry `warnings[]`: "Read them, report what matters, do not retry."

## Checks

- **engine_check_clean**: `sheet check` shows no `formula_error`, `missing_sheet_ref` or `number_overflow`, or `docs check` shows no `broken_ref`, `placeholder_left` or `field_not_evaluated` that can be fixed; each remaining finding is listed in `office_review`.
- **office_render_reviewed**: the file was rendered to images and actually looked at; a host that cannot view images records this as not-tested.
- **uncached_values_disclosed**: uncached formulas and fields that the Office app recomputes on open are named in the report.
- **content_from_user_material**: figures, names and dates trace to the user's material; nothing is invented.

## Sources

- AI intent mapping: genoffice skill → office.document-creation and office.spreadsheet-creation, from its "Commands", "Which command", "Behaviour to know" and "Before you say done" sections.
- Source: genoffice (genspark-ai/genoffice@4b55db9e, release v0.12.852) — `skills/genoffice/SKILL.md` (skill 2.68.0, cli >=0.9.0)
- Runtime dependency: the GenOffice app and its `genoffice` command line (Apache-2.0), not bundled by Muro; the capability installs it from the official releases when it is missing.
- Hooks: the selected SKILL.md defines none. The rest of the repository was not inspected for hooks.
- Harmonized by: prompts/harmonizer.md — document and workbook creation share one role because they share the create → check → render flow; deck creation is a separate role with its own pipeline.
- Re-harmonization 2026-11-10: `create --type pdf` accepts any md/html/docx/xlsx/pptx file (`SKILL.md` Commands), but the source's command choice sends "Change the file format" to `convert` (`SKILL.md` "Which command"). A PDF of an existing file is therefore left to `office-files` (office.format-conversion), so the two capabilities never both claim it; this step prints only content it wrote.
- Changes for coexistence (ADR-0017): the source's frontmatter `name` and `description` ("Use whenever the user asks for ...") are not carried: the coordinator classifies by meaning and this body is not registered as a skill; the rows and commands that install or register the source itself (`skill list`, `skill install`, `skill path`, `mcp install`, `mcp uninstall`, `mcp list`, `install-cli`, the "Give another agent (or a fresh machine) this skill" row) are not followed: a capability never installs the source plugin; the source assumes "`genoffice` is installed with GenOffice" and gives no install method, step 1 adds the install of a missing engine from the official releases and "do not simulate" (factory rule on missing runtime dependencies, ADR-0007); the source's "Report the path" goes through `## Output handoff` (outputs are handed over through the coordinator); the render check may be recorded as not-tested on a host that cannot view images (a step that host cannot run); `create --type pdf` is limited to content written in this step, where the source prints "any md/html/docx/xlsx/pptx file": a PDF of an existing file would have two owners, here and `office-files` (see the re-harmonization line above); the deck sections, and reading, converting, editing, `merge`, `open` and `selection` on existing files, are in the same original but are run by `office-deck` and `office-files`, not in this step (one capability per step); `search`, `image` and `media` are not standalone uses (dropped in `delivery.json`) and no path of this capability calls them.
