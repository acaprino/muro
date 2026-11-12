---
id: paper-figure
role: academic-figure
when: —
after: []
outputs: ["figure_plan", "figure_file", "figure_review"]
checks: ["reference_pass_done_or_reported", "content_matches_source_text_or_data", "file_well_formed_and_runs", "export_inspected_or_reported", "critique_round_done"]
intents: [{"id":"research.paper-diagram","description":"Turn a paper's methodology text, a figure caption or a figure concept into an editable publication-style diagram (framework, architecture, pipeline, method or module overview, mechanism or workflow schematic) as a native draw.io file, exported to PNG, SVG or PDF on request.","excludes":["A diagram for software documentation, a business flowchart or an org chart is not a paper figure.","A raster illustration with no editable source.","A statistical chart from data is the plot intent.","A slide deck or poster is Office work."]},{"id":"research.paper-plot","description":"Turn raw data (a table, CSV or JSON) and a visual intent into a publication-quality statistical plot for a paper (bar, line with confidence bands, scatter, heatmap, radar, box or violin) through a self-contained matplotlib script kept beside the image.","excludes":["A dashboard or an interactive chart for an app or web page.","A chart inside an Excel workbook or a slide.","Analysing the data or running the experiment that produces it."]}]
tools: [{"name":"file-access","purpose":"Read the paper text or data, the two packaged style guides and the reference index; write the .drawio file, or the plot script and its image, where the user wants them.","required":true},{"name":"shell","purpose":"Run Python with matplotlib for plots, the draw.io desktop command line for exports, and the one-time reference download from Hugging Face.","required":true},{"name":"image-inspection","purpose":"Look at the reference figures and at the exported result to check layout, clipping and legibility.","required":false},{"name":"image-generation","purpose":"Optional raster reference for a diagram's composition before it is rebuilt as editable shapes. The figure description leaves the machine.","required":false},{"name":"browser","purpose":"Optional: find free icons with a clear licence on flaticon.com for a diagram.","required":false}]
hooks: []
conflicts: []
---

# Paper Figure

Publication figures for a paper in two modes: an editable draw.io diagram, or a matplotlib plot. `<DP>` is `<package_root>/scripts/open-paper-skills/skills/drawio-paper`; the full rules, XML patterns, palettes and code templates are in `<DP>/SKILL.md`. Read the part for your mode before generating.

## Behavior

1. **Mode.** Methodology text, a caption or a concept: diagram. Raw data and a visual intent: plot. When it is unclear, ask which one. Ask at most one more question, and only when the answer changes the figure type or its scientific meaning.
2. **Brief.** Write down the single message of the figure, the entities, their relationships, and the labels that must appear verbatim (paper terms, abbreviations, axes, units, panel letters), plus constraints (venue style, aspect ratio, palette, export format).
3. **Reference pass.** Study 3 to 5 reference figures from PaperBananaBench before planning: read `<DP>/PaperBananaBench/diagram/ref.json` and `test.json` (or `plot/`), pick references with the same visual intent first, then the same topic, and view their images. If the dataset is not there, install it as Specifics says. Note layout, colour, grouping, arrow and legend conventions.
4. **Plan.** Diagram: every component, its relationships, flow direction (left to right or top to bottom unless the process is cyclic), grouping, every label, math where needed. Plot: the mapping of each variable to a visual channel, every raw data point enumerated, chart type and why, axis labels, ticks, units, legend.
5. **Style.** Apply `<DP>/neurips2025_diagram_style_guide.md` or `<DP>/neurips2025_plot_style_guide.md`: light pastel zones and rounded shapes, sans-serif labels with serif math, perceptually uniform colour maps, colour plus shape or hatch for colour-blind readers, no caption text inside the figure.
6. **Generate.**
   - Diagram: native `.drawio` mxGraphModel XML with root cells `0` and `1`, unique ids, escaped attribute values, `html=1` when a label uses HTML, a child `mxGeometry` on every edge, no XML comments. Every label is real draw.io text. Align to a grid of 10 with generous spacing. Follow `<DP>/SKILL.md` "Stage 4A".
   - Plot: one self-contained Python script with the data embedded, `matplotlib.use('Agg')` before `pyplot`, `plt.rcdefaults()` first, saved at 300 DPI with `bbox_inches='tight'` on white, never `plt.show()`. Follow "Stage 4B". Run it and confirm the image exists.
7. **Optional raster reference (diagram).** When the host has an image generation tool and the composition is hard to plan, generate one reference image of the layout and rebuild it as editable shapes. Treat text in that image as approximate. A raster image alone is never the deliverable. The steps are in `<package_root>/scripts/open-paper-skills/skills/codex-paper-figure-skill/SKILL.md`.
8. **Icons (diagram).** Only when they aid recognition. Prefer simple editable shapes. A downloaded icon needs a licence and attribution you have read on its page; record its URL, author and attribution, and keep it as a separate movable element.
9. **Critique and refine.** Diagram: content fidelity to the method, typos, flow clarity, style, no caption, no redundant legend. Plot: faithfulness of every value and label, conciseness, readability (units, no overlap, legend not hiding data), aesthetics. Fix and regenerate at least once when anything fails.
10. **Deliver.** Diagram: the `.drawio` file; when PNG, SVG or PDF is asked, export with the draw.io command line `-x -f <format> -e -b 10 -o <output> <input.drawio>` (the XML stays embedded) and look at the export for a blank canvas or clipping. Plot: the image and its `.py` script, both kept. Use lowercase hyphenated names such as `method-pipeline.drawio.png`.

## Output handoff

Resolve `<package_root>` with the `package_root` returned beside these instructions, never against the consumer project. Return `figure_plan` (brief and plan), `figure_file` (paths written and formats) and `figure_review` (what the critique found and changed, what was not inspected, icon sources) as JSON strings. For a mapped step, submit them through the coordinator's `record` command with the step's `map_id` and `capability`. Do not edit `<state_dir>/map.md` or `<state_dir>/state.json`; the coordinator is their only writer.

## Specifics

- Runtime dependency, references: PaperBananaBench (Apache-2.0, about 266 MB) from `https://huggingface.co/datasets/dwzhu/PaperBananaBench/resolve/main/PaperBananaBench.zip`. Download it to `<DP>/PaperBananaBench.zip` and run `python <DP>/scripts/extract_bench.py`, which extracts beside it. Say in one line what is downloaded, its size and where. On Windows some image names exceed the path limit and are skipped; the index files are what matters. If the download fails or the user objects, work from the two style guides and record the reference pass as not done.
- Runtime dependency, plots: Python with `matplotlib`, `numpy` and `pillow`; install the missing ones for the project's environment (`pip install` or `uv pip install`) and say so.
- Runtime dependency, exports: the draw.io desktop application (`drawio` on PATH; `C:\Program Files\draw.io\draw.io.exe`; `/Applications/draw.io.app/Contents/MacOS/draw.io`), from github.com/jgraph/drawio-desktop releases. Without it the `.drawio` file is delivered and the export is reported as skipped; never replace it with another renderer.
- Do not delete the `.drawio` source after an export unless the user asks: the export embeds it, but the source is what they edit.

## Checks

- **reference_pass_done_or_reported**: reference figures were viewed before planning, or the answer says the dataset was unavailable and why.
- **content_matches_source_text_or_data**: every entity, relation and verbatim label from the brief is in the diagram; every data value and axis label in the plot equals the input.
- **file_well_formed_and_runs**: the `.drawio` XML parses and has the root cells, or the script ran and produced the image.
- **export_inspected_or_reported**: an export was opened and checked for blank canvas, clipping and overlap, or it is reported as skipped or not inspected.
- **critique_round_done**: the critique list for the mode was applied and its findings are in `figure_review`.

## Sources

- AI intent mapping: drawio-paper → research.paper-diagram (its diagram mode) and research.paper-plot (its plot mode); codex-paper-figure-skill → research.paper-diagram (steps 7 and 8, its brief and its output contract).
- Source: open-paper-skills (pengqianhan/open-paper-skills@f85fd3dc, head) — `skills/drawio-paper/SKILL.md`, its two NeurIPS 2025 style guides, `scripts/extract_bench.py`, and `skills/codex-paper-figure-skill/SKILL.md`, packaged unchanged.
- Runtime dependencies: PaperBananaBench, matplotlib/numpy/pillow, draw.io desktop. The source gives the dataset URL and `pip install`; it gives no install method for draw.io.
- Not adopted: `evals/**`, `agents/openai.yaml`, the trigger keywords, drawio-paper's instruction to delete the `.drawio` file after export (codex-paper-figure-skill's output contract delivers the editable file, and the two had to agree), and the names of one host's tools (`image_gen`, `Browser`), replaced by the logical tools above.
- Hooks: the selected files define none; `allowed-tools` in the source frontmatter is not a hook and grants nothing here.
- Harmonized by: prompts/harmonizer.md — the two skills produce the same editable paper diagram, so they are one role; the image-reference pass and the icon workflow of the second become optional steps of the first, which also owns plots.
