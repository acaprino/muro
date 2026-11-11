---
id: office-files
role: office-file-operations
when: —
after: []
outputs: ["file_reading", "file_result"]
checks: ["structure_read_before_edit", "batch_status_verified", "post_edit_check_clean", "original_preserved", "conversion_loss_reported"]
intents: [{"id":"office.file-editing","description":"Apply structured changes to a Word, Excel or PowerPoint file that already exists: text, cells, slides, formatting, charts, comments, tracked changes, template placeholders, or a redline between two versions.","excludes":["Building a whole new deck, document or workbook from a brief is creation, not editing.","A file the user supplied only as reference material must not be modified."]},{"id":"office.format-conversion","description":"Turn an existing file into another format among pdf, docx, xlsx, pptx, md, html and csv without changing its content.","excludes":["Content changes are an edit made before the conversion.","Writing new content straight into an Office file is creation."]},{"id":"office.content-extraction","description":"Read the structure, text, cell values, slides or pages of an existing Office or PDF file, to use it as source material or to answer a question about it.","excludes":["Plain md, txt and csv files are read directly, not through GenOffice.","Reading a file is not permission to change it."]},{"id":"office.editor-handoff","description":"Open a file in the GenOffice app at a given slide, block, range or page, or act on what the user has selected there.","excludes":["Do not open the app unless the user asks to see the file in GenOffice."]}]
tools: [{"name":"genoffice-cli","purpose":"Run the user's installed genoffice command line (0.9.0 or later), or its one-to-one genoffice mcp tools, to read, convert, edit, check and render files. Apply edits in place unless an output path is given; each command is appended to ~/.genoffice/cli-audit.jsonl.","required":true},{"name":"file-access","purpose":"Write ops, cells and data files and read converted text; the Office file itself is never unzipped.","required":true},{"name":"image-inspection","purpose":"Look at the rendered page after an edit.","required":false},{"name":"genoffice-cloud","purpose":"Describe or question an image, video or audio file through the provider configured in GenOffice. The referenced file leaves the machine.","required":false}]
hooks: []
conflicts: []
---

# Office Files (read, convert and edit existing files)

Works on Office and PDF files that already exist: reads their structure and text, converts formats and applies structured edits through the `genoffice` engine, keeping the file's own design.

## Behavior

1. **Check the engine.** Run `genoffice --version`. If the command is missing, read the launcher directory from `~/.genoffice/launcher` (Windows: `%USERPROFILE%\.genoffice\launcher`) and call the launcher there. If GenOffice is not installed, install it: say in one line what is installed and from where (the release for this platform from https://github.com/genspark-ai/genoffice/releases), run it, then confirm with `genoffice --version`. If the installer needs the user or fails, say which step is theirs and stop this delivery; do not simulate a result or produce it another way. Add `--json` to every command and read `status`, `error`, `suggestion` and `detail`, never `message`.
2. **Read first.** `genoffice info <file> --json`, then the domain reader: `docs read` (block indexes; `--comments`, `--revisions`, `--styles`, `--full`), `sheet read` (`--stats` to size a workbook, then `--range`, `--cols`, `--max-rows`, `--where formula`), `slides read` (`s_<n>` and `e_*` ids, geometry; `--slide n --full`) or `pdf read --range a-b`. Never `cat` or `unzip` an Office file.
3. **Pick the route.**
   - *Source material or a question:* `convert --to md`, `convert --to csv --sheet <name>` or `<domain> read --full --json`. Nothing is written to the file.
   - *Format change:* `genoffice convert <file> --to <fmt> [--out <path>] --json`. Edit content first, convert last.
   - *Edit:* `genoffice guide <slides|docs|sheets>` for the op fields, write the ops JSON, then `genoffice <domain> apply <file> --ops <file> [--out <copy>] --json`. Single cells: `sheet apply --cells`.
   - *Fill a template:* `genoffice merge <template> --data <values.json> --out <path> [--strict]`.
   - *Redline two Word versions:* `genoffice docs compare <original> <revised> --out <redline.docx>`.
   - *Show or point in the editor:* `genoffice open <file> --slide|--block|--range|--page`; `genoffice selection <file> --json` resolves "this one" from what the user selected.
4. **Apply safely.** Use `--dry-run` for a large batch. Apply is atomic by default: on `op_rejected` nothing was written, so fix that op and resend the whole batch. With `--best-effort` or `--stop-on-error` the answer is `status: "partial"` with exit code 0: read `status`, `detail.batch` and `detail.failures`.
5. **Verify.** `slides audit` (apply its `suggest` ops when a longer text overflows), `sheet check` or `docs check`; then `render` the changed page and look at it.

## Output handoff

Return `file_reading` (what was read: structure, ids, sizes) and `file_result` (paths written, batch status and warnings, or that the request was read-only and no file changed) as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Structural edits renumber: new `e_*` ids after `addElement`, `s_*` after adding slides, block indexes after `insert_content` or `delete_blocks`. Inside one batch later ops see earlier results; read again before the next batch. Revision ids are positional: read again before `accept_changes` or `reject_changes`.
- `slides ... --slide n` and document block indexes are 0-based; `render --page n` is 1-based. `sheet apply` addresses sheets by the current tab name.
- **Keep the original.** `apply` edits in place unless `--out` is given: write to a copy when the user wants the original kept. Pass `--force` only when the user asked to replace a file, or accepts that the open editor may overwrite the change (`output_exists`, `file_open_in_gui`).
- Losses to report: `convert pptx→pdf` has no text layer; `convert docx→md` drops images (`detail.skipped`); `docs findReplace` skips table cells (use `replace_blocks`); scanned PDF pages have empty text (`convert --to docx` runs OCR).
- Excel ops that need the live editor (`refresh_pivot`, session tables and shapes) are refused: report it instead of working around it.
- Restyling a whole deck the user brought is an `applyTheme` edit; `slides replace --spec` is only for decks built from page specs.
- `selection` and `open --el` need the file open in a GenOffice tab.
- `resource_limit` and `outside_allowed_roots` are final: do not retry or try another location; tell the user.
- **Data leaving the machine:** files are processed locally, but `media` sends the referenced file, and `search` and `image` the query, to the provider configured in GenOffice. Never pass the user's file to `media` unless the user asked for that analysis.

## Checks

- **structure_read_before_edit**: ids, block indexes, sheet names or ranges used by the ops come from a read of the current file, repeated after any structural edit.
- **batch_status_verified**: the result's `status` was read; a `partial` batch lists its lost ops in `file_result`.
- **post_edit_check_clean**: `slides audit`, `sheet check` or `docs check` after the edit shows no new issue, or each one is listed.
- **original_preserved**: no file was overwritten or forced without the user's request; a read-only request changed nothing.
- **conversion_loss_reported**: dropped images, a missing text layer, uncached formulas and other `warnings[]` are reported to the user.

## Sources

- AI intent mapping: genoffice skill → office.file-editing, office.format-conversion, office.content-extraction and office.editor-handoff, from its "Commands", "Which command", "Workflow", "Pitfalls", "Reading the user's files", "Editing an existing deck" and "Path rules" sections.
- Source: genoffice (genspark-ai/genoffice@4b55db9e, release v0.12.852) — `skills/genoffice/SKILL.md` (skill 2.68.0, cli >=0.9.0)
- Runtime dependency: the GenOffice app and its `genoffice` command line (Apache-2.0), not bundled by Muro; the capability installs it from the official releases when it is missing.
- Not adopted: `skill list|install|path`, `mcp install|uninstall|list` and `install-cli` (installation and registration). The `genoffice mcp` server is only an equivalent way to reach the same commands; the app's own MCP server for documents open in the editor is not used.
- Hooks: the selected SKILL.md defines none. The rest of the repository was not inspected for hooks. Side effects of the tool itself: an audit log line per command and the launcher path file written by the app.
- Harmonized by: prompts/harmonizer.md — reading, converting and editing share one role because each starts from an existing file and the same read step; the upstream rule for `media` is narrowed to an explicit user request.
