---
id: office-authoring
role: document-authoring
when: —
after: []
outputs: ["office_file", "office_review"]
checks: ["engine_check_clean", "office_render_reviewed", "uncached_values_disclosed", "content_from_user_material"]
intent_checks: {"office.document-creation": ["engine_check_clean", "office_render_reviewed", "uncached_values_disclosed", "content_from_user_material"], "office.spreadsheet-creation": ["engine_check_clean", "office_render_reviewed", "uncached_values_disclosed", "content_from_user_material"]}
intents: [{"id":"office.document-creation","description":"Produce a new Word document or PDF as a real file from written content such as Markdown, HTML or notes: a report, letter, contract, memo or similar.","excludes":["Prose wanted in the conversation or as a Markdown or README file is not a request for an Office file.","Turning an existing file into another format without changing its content is a format conversion.","A slide deck is a presentation, not a document."]},{"id":"office.spreadsheet-creation","description":"Produce a new Excel workbook as a real file from data, with live formulas, formats, tables or charts.","excludes":["Analysing data in the conversation, or delivering a plain CSV, does not require a workbook.","Fixing cells of a workbook that already exists is file editing."]}]
tools: [{"name":"genoffice-cli","purpose":"Run the user's installed genoffice command line (0.9.0 or later), or its one-to-one genoffice mcp tools, to create, refine, check and render the file. It writes only the requested output path and appends each command to ~/.genoffice/cli-audit.jsonl.","required":true},{"name":"file-access","purpose":"Write the Markdown, HTML, CSV or JSON input and the ops files, and read the user's source material.","required":true},{"name":"image-inspection","purpose":"Look at the rendered pages or sheets before reporting the file.","required":false}]
hooks: []
conflicts: []
---

# Office Authoring (new document, workbook or PDF)

Creates a new Word document, Excel workbook or PDF as a real file with the locally installed `genoffice` engine, then checks it and looks at it before reporting.

## Behavior

The full version is `<package_root>/scripts/genoffice/SKILL.source.md`. It wins where this body differs, except for the changes listed in the Sources section. Open only the section a step points to.

1. **Check the engine.** Run `genoffice --version` first. If the command is not found, read the one line in `~/.genoffice/launcher` (Windows: `%USERPROFILE%\.genoffice\launcher`), which GenOffice writes on every start, and run `"<dir>/genoffice"` from bash or `"<dir>\genoffice.cmd"` from PowerShell / cmd, quoted, in place of `genoffice`; the default locations when that file is missing are in the original's opening paragraph. If GenOffice is not installed, install it: say in one line what is installed and from where (the release for this platform from https://github.com/genspark-ai/genoffice/releases), run it, then confirm with `genoffice --version`. If the installer needs the user or fails, say which step is theirs and stop this delivery; do not simulate a file or build it another way. Always add `--json` when a program reads the output; read `status`, `error`, `suggestion` and `detail`, never parse `message`.
2. **Prepare the content** as a file the engine reads: Markdown or a restricted-HTML fragment for a document; CSV or JSON (a 2-D array or `{sheets:[{name,rows}]}`) for a workbook, where `"=..."` cells are formulas. You read the user's source material yourself (md, txt, csv, pdf, images directly); when it is a docx, xlsx or pptx, open "Reading the user's files" in the original for the CLI command. Take figures and wording from that material; never `cat` or `unzip` an Office file.
3. **Create.**
   - Document: `genoffice create --type docx --from <text.md | fragment.html> --out <path>`. Local images a Markdown file references by relative path are embedded.
   - Workbook: `genoffice create --type xlsx --from <data.csv | table.json> [--header] [--decimal ,] --out <path>`. `--header` freezes row 1 and filters the range; without it the first row is data.
   - PDF: `genoffice create --type pdf --from <document> --out <path>`, from the md or html written in this step or from the docx or xlsx made in this step. A PDF of a file the user already has is a format conversion (`office-files`).
4. **Refine with ops.** Workbook: `sheet apply --ops` for formats and charts. Before writing ops run `genoffice guide <domain>` (`guide <domain> <op> --json` for one op's schema), then write the ops JSON yourself. Run `genoffice <domain> apply --dry-run` when the batch is large. Apply is atomic by default: a rejected op comes back as `op_rejected` with the executor's usage line and the file is untouched; fix that op and resend the whole batch. Open the Word or Excel item of "Behaviour to know" and "Limits" in the original when the ops insert or delete blocks, rows or columns, or add fields, charts, pivots, sections or tables: they give the ordering and index rules inside a batch.
5. **Check.** Workbook: `sheet check book.xlsx --json` shows no `formula_error`, `missing_sheet_ref`, `number_overflow` (apply the `set_col_width` suggestions). Document: `docs check report.docx --json` shows no `broken_ref`, `placeholder_left`, `field_not_evaluated` that you can fix. Both exit 0 whether or not they found something: the findings are in `detail.issues[]` with a stable `code`, a `path` and, when possible, a `suggest` op to pass to `apply` as is.
6. **Look.** Workbook: `render book.xlsx --out shots --json` and look at the sheet PNG. Document: `render report.docx --out shots --json` and look at page 1 and the last. Report the `.xlsx` path, naming uncached formulas if any, or the `.docx` path.

## Output handoff

Return `office_file` (every path written) and `office_review` (check findings, what was looked at, warnings) as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- `create --type docx --from` is not for a real web page: that is `convert page.html --to docx` (html2docx). A restricted-HTML fragment with `<formula>` goes through `create --type docx --from fragment.html`. Tags outside the restricted set are stripped silently.
- CSV import: a `sep=;` first line is honoured and removed, ISO dates become real dates, `--decimal ,` reads `1.234,5` as 1234.5.
- Formulas the local engine cannot evaluate (FILTER, SORT, UNIQUE, LET, LAMBDA …) are written without a cached value: the `formulas_not_cached` warning lists them and `sheet read` shows the formula and no value until Excel opens the file. Not an error; name them in the report.
- PAGE / NUMPAGES / AUTHOR-style field results are placeholders Word recomputes on open (`docs check` reports them as info); say so when you hand over the file.
- `→pdf`, `docx→html`, `html→docx`, `create --type pdf` and `render` run a hidden GenOffice process per call (1–6 s, up to 180 s timeout, safe to run concurrently) and need GenOffice installed or `GENOFFICE_APP_BIN` pointing at it.
- `create`, `convert` and `image` never overwrite (exit 2, `output_exists`): pick another name, or `--force` when the user asked for replacement. If `GENOFFICE_ALLOWED_ROOTS` is set, genoffice reads and writes only inside those directories (exit 2 otherwise); stay within them.
- Every command runs headless on the app's own engines; only `search`, `image` and `media` send data off the machine, to the provider configured in GenOffice. This capability's paths do not use those three.
- Do not run `genoffice open` unless the user asks to see the file in GenOffice.
- When a command returns `status: "error"`: branch on `error`, do what `suggestion` says, then resend the whole batch. Open the table in "When a command fails" for the next command of that `error` value. A successful result may still carry `warnings[]`: read them, report what matters, do not retry.

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
- Changes for coexistence (ADR-0017): the frontmatter `name` and `description` are not carried (the coordinator classifies by meaning and this body is not registered as a skill); the commands that install or register the source itself (`skill list`, `skill install`, `skill path`, `mcp install`, `mcp uninstall`, `mcp list`, `install-cli`) are not followed (a capability never installs the source plugin); step 1 adds the install of a missing engine from the official releases and "do not simulate", where the source assumes GenOffice is installed and gives no method (ADR-0007); the source's "Report the path" goes through `## Output handoff` (the coordinator owns outputs); the render check may be recorded as not-tested on a host that cannot view images (a step that host cannot run); `create --type pdf` is limited to content written in this step, where the source prints "any md/html/docx/xlsx/pptx file" (a PDF of an existing file would have two owners, here and `office-files`); the deck pipeline and reading, converting, editing, `merge`, `open` and `selection` on existing files are run by `office-deck` and `office-files`, not in this step (one capability per step); `search`, `image` and `media` are not standalone uses (dropped in `delivery.json`) and no path of this capability calls them.
