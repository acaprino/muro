import * as React from 'react';
import { Badge, Button, Empty, Icon, Inspector, Sheet, SheetContent, SheetTitle, ToggleGroup, ToggleGroupItem, useAppShell } from '@acaprino/sigrid';
import { GraphCanvas } from '@acaprino/sigrid/graph';
import type { ProjectInfo } from '../../types.ts';
import { PANELS, sameSelected } from '../../state/project.ts';
import type { Panel, Selected } from '../../state/project.ts';
import { useProject } from '../../state/useProject.tsx';
import { plural } from '../../words.ts';
import { litOf, outcomeOfExample } from './graph-model.ts';
import type { Outcome } from './graph-model.ts';
import { capNodeId, capabilityOf, graphScene } from './graphScene.ts';
import { projectData, targetsOf } from './data.ts';
import type { ProjectData } from './data.ts';
import { Details, TITLES, resolve } from './Details.tsx';
import { ExamplesPanel } from './ExamplesPanel.tsx';
import { InputsPanel } from './InputsPanel.tsx';
import { RecordsPanel } from './RecordsPanel.tsx';
import { RunsPanel } from './RunsPanel.tsx';

/** The workspace of an open project, in the frame of the window: the panel at the left (inputs, examples, records, runs), the decision graph at the centre, the details
 * of what is selected in the inspector, and the actions of the project at the foot. The frame decides the widths (Sigrid's `AppShell`): under 1000px the inspector
 * is a panel over the end of the graph, and where the frame has no room for a sidebar (under 620px) the left panel opens as a drawer from a button.
 *
 * What lights the graph is the decision shown (a documented example, or the AI's answer to a free-text request: `sim`) or the input selected; what the inspector shows
 * is `selected`. The two are apart, so looking at a capability of a lit path keeps the path lit. The graph data is made in one place, `graphScene.ts`. */

const PANEL_LABELS: Record<Panel, string> = { inputs: 'Inputs', examples: 'Examples', records: 'Records', runs: 'Runs' };
/** What the write side of a project will do, here and disabled until the editor exists. */
const SOON = 'Coming with the editor';
const ACTIONS = ['Review decisions…', 'Harmonize again…', 'Install on harnesses…'];

export function Workspace({ info, file }: { info: ProjectInfo; file: string | null }) {
  const project = useProject();
  const { sidebar } = useAppShell();
  const narrow = sidebar === 'drawer';
  const [drawer, setDrawer] = React.useState(false);
  const data = React.useMemo(() => projectData(info), [info]);
  const view = project.view;
  const sim = view?.sim ?? null, selected = view?.selected ?? null;

  // ---------- what lights the graph ----------
  const shown: Outcome | null = sim ? (sim.example !== null && data.examples[sim.example] ? outcomeOfExample(data.examples[sim.example]) : sim.result) : null;
  const input = selected?.kind === 'input' ? data.inputs.find(i => i.id === selected.id) ?? null : null;
  const pairs = input ? '[]' : JSON.stringify([...litOf(shown)]);
  const lit = React.useMemo(() => new Map<string, number[]>(JSON.parse(pairs)), [pairs]);
  const scene = React.useMemo(() => graphScene(data.entries, data.caps, data.slug, lit), [data, lit]);
  // The canvas draws every line as "hangs from": it gets the lines from an entry to its capabilities, and the rest (runs first, needs on a condition, never together) is said in words in the details.
  const edges = React.useMemo(() => scene.edges.filter(e => e.kind === 'member'), [scene]);
  const targets = React.useMemo(() => input ? targetsOf(data.decisions, input.id) : [], [data, input]);
  const wanted = React.useMemo(() => {
    const reached = new Set(targets), open = new Set(edges.filter(e => reached.has(capabilityOf(e.to) ?? '')).map(e => e.from));
    return scene.closed.filter(id => !open.has(id));
  }, [scene, edges, targets]);
  const litKey = input ? `input:${input.id}` : pairs === '[]' ? '' : `steps:${pairs}`;
  // The entries are closed until opened. A new light opens the entries that hold what it lights and closes the others; when the light goes, what is open stays open.
  const [canvas, setCanvas] = React.useState({ key: litKey, collapsed: wanted });
  let collapsed = canvas.collapsed;
  if (canvas.key !== litKey) {
    collapsed = litKey ? wanted : canvas.collapsed;
    setCanvas({ key: litKey, collapsed });
  }
  // A capability chosen from the details (a step, a branch, what an input went to) may sit in a closed entry: its entry opens, so the canvas shows what the inspector shows.
  const chosenCap = selected?.kind === 'capability' ? selected.id : null;
  const [opened, setOpened] = React.useState<string | null>(null);
  if (opened !== chosenCap) {
    setOpened(chosenCap);
    const holders = chosenCap === null ? [] : edges.filter(e => e.to === capNodeId(chosenCap)).map(e => e.from);
    if (holders.some(id => collapsed.includes(id))) {
      collapsed = collapsed.filter(id => !holders.includes(id));
      setCanvas(c => ({ ...c, collapsed: c.collapsed.filter(id => !holders.includes(id)) }));
    }
  }
  const setCollapsed = (next: string[] | ((now: string[]) => string[])) => setCanvas(c => ({ ...c, collapsed: typeof next === 'function' ? next(c.collapsed) : next }));

  if (!view || !sim) return null;
  const detail = resolve(selected, data);
  const select = (next: Selected) => project.select(next);
  /** The inspector was closed: what it showed is no longer selected. A press outside it that also chose another thing keeps the new choice. */
  const closeDetails = () => project.select(now => sameSelected(now, selected) ? null : now);
  /** A capability on the canvas shows its details; an entry opens or closes; a press on the empty canvas lets go of a capability. */
  const onNode = (id: string | null) => {
    if (id === null) { project.select(now => now?.kind === 'capability' ? null : now); return; }
    const cap = capabilityOf(id);
    if (cap !== null) project.select({ kind: 'capability', id: cap });
    else setCollapsed(now => now.includes(id) ? now.filter(x => x !== id) : [...now, id]);
  };
  const chosen = () => setDrawer(false);
  const name = info.project?.name || info.plugin?.name || view.id, version = info.plugin?.version ?? '';
  const summary = [plural(data.inputs.length, 'input'), plural(data.entries.length, 'entry', 'entries'), plural(data.caps.length, 'capability', 'capabilities'), plural(data.examples.length, 'example')].join(' · ');
  const panel = <LeftPanel data={data} panel={view.panel} onPanel={p => project.setPanel(p)} onChosen={chosen} />;
  const litLine = input ? `The entries that hold what ${input.id} became are open.`
    : shown?.kind === 'decision' && shown.steps.length ? (shown.example !== null ? `The steps of “${shown.example}” are numbered on the graph.` : 'The steps of the answer are numbered on the graph.') : '';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2">
        <Button variant="ghost" size="sm" onClick={() => project.close()}><Icon name="moveLeft" />All projects</Button>
        <h1 className="min-w-0 truncate text-base font-semibold text-ink" title={name}>{name}</h1>
        {version ? <span className="text-xs text-ink-mute tabular-nums">{version}</span> : null}
        {info.included ? <Badge variant="secondary">Included with Muro</Badge> : null}
        <span className="min-w-0 flex-1 truncate text-xs text-ink-mute" title={file ? `${summary} · ${file}` : summary}>{summary}{file ? ` · ${file}` : ''}</span>
        {narrow ? <Button variant="outline" size="sm" aria-expanded={drawer} onClick={() => setDrawer(true)}><Icon name="sidebarOpen" />Project panel</Button> : null}
      </header>
      <div className="flex min-h-0 flex-1">
        {narrow ? (
          <Sheet open={drawer} onOpenChange={open => setDrawer(open)}>
            <SheetContent side="left" className="gap-0 p-0">
              <SheetTitle className="sr-only">Project panel</SheetTitle>
              {panel}
            </SheetContent>
          </Sheet>
        ) : (
          <section aria-label="Project panel" className="flex w-80 shrink-0 flex-col border-e border-line">{panel}</section>
        )}
        <section aria-labelledby="graph-heading" className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3">
            <h2 id="graph-heading" className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name="structure" />Decision graph</h2>
            <span className="text-xs text-ink-mute">{plural(data.entries.length, 'entry', 'entries')} · {plural(data.caps.length, 'capability', 'capabilities')}</span>
            <span role="status" className="min-w-0 truncate text-xs text-ink" title={litLine}>{litLine}</span>
          </div>
          {data.caps.length ? (
            <>
              {data.entries.length ? null : <p className="px-4 pt-1 text-xs text-ink-mute">No entry groups these capabilities: each stands on its own.</p>}
              <div className="relative min-h-96 flex-1">
                <GraphCanvas
                  aria-label={`Decision graph of ${name}`}
                  nodes={scene.nodes}
                  edges={edges}
                  selected={selected?.kind === 'capability' ? capNodeId(selected.id) : null}
                  onSelect={onNode}
                  collapsed={collapsed}
                  onCollapsedChange={ids => setCollapsed(ids)}
                  search
                  minimap
                  className="absolute inset-3 h-auto"
                />
              </div>
            </>
          ) : (
            <Empty className="m-4" title="No decision graph" description="This project's plugin has no capabilities to choose between, so there is nothing to draw or to simulate." />
          )}
        </section>
        <Inspector title={detail ? TITLES[detail.kind] : 'Details'} open={detail !== null} onOpenChange={open => { if (!open) closeDetails(); }}>
          {detail ? <Details shown={detail} data={data} lit={lit} onSelect={select} /> : null}
        </Inspector>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-2">
        {ACTIONS.map(label => <span key={label} title={SOON}><Button variant="outline" disabled title={SOON}>{label}</Button></span>)}
        <span title={SOON}><Button disabled title={SOON}>Add input…</Button></span>
      </div>
    </div>
  );
}

/** The left panel: a segmented control of its four panels, and the panel chosen, which scrolls. */
function LeftPanel({ data, panel, onPanel, onChosen }: { data: ProjectData; panel: Panel; onPanel(p: Panel): void; onChosen(): void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 p-3">
        <ToggleGroup value={panel} onValueChange={onPanel} aria-label="Project panels" className="flex w-full">
          {PANELS.map(p => <ToggleGroupItem key={p} value={p} className="flex-1 px-(--pad-xs)">{PANEL_LABELS[p]}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>
      <section aria-label={PANEL_LABELS[panel]} className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {panel === 'inputs' ? <InputsPanel data={data} onChosen={onChosen} />
          : panel === 'examples' ? <ExamplesPanel data={data} onChosen={onChosen} />
          : panel === 'records' ? <RecordsPanel data={data} />
          : <RunsPanel data={data} />}
      </section>
    </div>
  );
}
