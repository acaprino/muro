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

1. **Check the engine.** Run `genoffice --version`. If the command is missing, read the launcher directory from `~/.genoffice/launcher` (Windows: `%USERPROFILE%\.genoffice\launcher`) and call the launcher there. If GenOffice is not installed, install it: say in one line what is installed and from where (the release for this platform from https://github.com/genspark-ai/genoffice/releases), run it, then confirm with `genoffice --version`. If the installer needs the user or fails, say which step is theirs and stop this delivery; do not simulate a file or build it another way. Add `--json` to every command and read `status`, `error`, `suggestion` and `detail`, never `message`.
2. **Prepare the content** as a file the engine reads: Markdown or a restricted-HTML fragment for a document; CSV, a 2-D JSON array or `{sheets:[{name,rows}]}` for a workbook, where a `"=..."` cell is a live formula. Take figures and wording from the user's material, never from memory.
3. **Create.**
   - Document: `genoffice create --type docx --from <text.md|fragment.html> --out <path> --json`. Local images referenced by relative path are embedded.
   - Workbook: `genoffice create --type xlsx --from <data.csv|table.json> [--header] [--decimal ,] --out <path> --json`. `--header` freezes row 1 and filters the range.
   - PDF: `genoffice create --type pdf --from <md|html, or the docx|xlsx made in this step> --out <path> --json`. A PDF of a file the user already has is a format conversion (`office-files`).
4. **Refine with ops when needed.** Read `genoffice guide docs` or `genoffice guide sheets` (`guide <domain> <op> --json` for one schema) before writing ops; then `genoffice docs apply` or `genoffice sheet apply <file> --ops <file>` for styles, headers and footers, formats, charts, tables and validation. Use `--dry-run` for a large batch; a rejected batch wrote nothing, so fix the op and resend all of it.
5. **Check.** `genoffice docs check <docx> --json` or `genoffice sheet check <xlsx> --json`. Findings are in `detail.issues[]` even when the exit code is 0; apply the `suggest` ops they carry.
6. **Look.** `genoffice render <file> --out <dir> --json` and look at the images: page 1 and the last page of a document, each sheet of a workbook.

## Output handoff

Return `office_file` (every path written) and `office_review` (check findings, what was looked at, warnings) as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- A real web page becomes a document with `genoffice convert page.html --to docx`; `create --from fragment.html` is for a restricted-HTML fragment, and tags outside the restricted set are stripped silently.
- CSV import: a `sep=;` first line is honoured, ISO dates become real dates, `--decimal ,` reads `1.234,5` as 1234.5; without `--header` the first row is data.
- Formulas the local engine cannot evaluate (FILTER, SORT, UNIQUE, LET, LAMBDA) are written without a cached value and Excel computes them on open. The `formulas_not_cached` warning names the cells: not an error, but name them in the report.
- In a document, PAGE, NUMPAGES and AUTHOR-style fields are placeholders Word recomputes on open; say so when handing over the file.
- PDF creation and `render` run in a hidden GenOffice process (1–6 s each, up to 180 s) and need the app installed.
- `create` and `convert` never overwrite: on `output_exists` choose another name, or pass `--force` only when the user asked to replace the file. Stay inside `GENOFFICE_ALLOWED_ROOTS` when it is set.
- Documents are processed locally. Do not use the provider-backed `search`, `image` or `media` commands here unless the user asks for them: they send the query or the referenced file off the machine.
- Do not run `genoffice open` unless the user asks to see the file in GenOffice.

## Checks

- **engine_check_clean**: `docs check` or `sheet check` shows no `formula_error`, `missing_sheet_ref`, `number_overflow`, `broken_ref` or `placeholder_left`, or each remaining finding is listed in `office_review`.
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
