import * as React from 'react';
import { Badge, Button, Empty, Icon, Inspector, Sheet, SheetContent, SheetTitle, ToggleGroup, ToggleGroupItem, useAppShell } from '@acaprino/sigrid';
import { GraphCanvas } from '@acaprino/sigrid/graph';
import type { ProjectInfo } from '../../types.ts';
import { text } from '../../model.ts';
import { PANELS, sameSelected } from '../../state/project.ts';
import type { Panel, Selected } from '../../state/project.ts';
import { useNotify } from '../../state/notices.tsx';
import { useRegistry } from '../../state/registry.tsx';
import { useProject } from '../../state/useProject.tsx';
import { message, plural, unknownTo } from '../../words.ts';
import { litOf, outcomeOfExample } from './graph-model.ts';
import type { Outcome } from './graph-model.ts';
import { capNodeId, capabilityOf, drawnNodes, graphScene } from './graphScene.ts';
import { projectData, targetsOf } from './data.ts';
import type { ProjectData } from './data.ts';
import { aboutLine } from './lines.ts';
import { Details, TITLES, resolve } from './Details.tsx';
import { ExamplesPanel } from './ExamplesPanel.tsx';
import { InputsPanel } from './InputsPanel.tsx';
import { RecordsPanel } from './RecordsPanel.tsx';
import { RunsPanel } from './RunsPanel.tsx';
import { busyReason, runningOn } from './write/jobs.ts';
import { useJobs } from './write/useJobs.tsx';
import { GatedButton, JobCard } from './write/JobCard.tsx';
import { AddInputDialog } from './write/AddInputDialog.tsx';
import { HarmonizeDialog } from './write/HarmonizeDialog.tsx';
import { PinDialog } from './write/PinDialog.tsx';
import { InstructionsDialog } from './write/InstructionsDialog.tsx';
import { DetailsDialog } from './write/DetailsDialog.tsx';

/** The workspace of an open project, in the frame of the window: the panel at the left (inputs, examples, records, runs), the decision graph at the centre, the details
 * of what is selected in the inspector, and the actions of the project at the foot. The frame decides the widths (Sigrid's `AppShell`): under 1000px the inspector
 * is a panel over the end of the graph, and where the frame has no room for a sidebar (under 620px) the left panel opens as a drawer from a button.
 *
 * What lights the graph is the decision shown (a documented example, or the AI's answer to a free-text request: `sim`) or the input selected; what the inspector shows
 * is `selected`. The two are apart, so looking at a capability of a lit path keeps the path lit. The graph data is made in one place, `graphScene.ts`.
 *
 * The changes of the project (write/): Add input and Harmonize again at the foot, Edit details in the header, Move pin, Remove and the instructions in the Inputs panel.
 * Each opens a dialog the workspace holds, so it outlives the drawer the panel may be in. A change of the package is an AI run of the runtime, one at a time: while any
 * run goes no other is offered, and the buttons and the foot say why; an edit by hand (the details) waits only for a run that changes this project. The run of this
 * project is the card at the top (JobCard). Review decisions has no operation in the runtime yet, and installing comes with the Sync page: both stay off, saying so. */

const PANEL_LABELS: Record<Panel, string> = { inputs: 'Inputs', examples: 'Examples', records: 'Records', runs: 'Runs' };
/** Why the two actions the runtime has no operation for here are off. */
const NO_REVIEW = 'Coming with the review';
const NO_INSTALL = 'Coming with the Sync page';
/** The dialog open over the workspace, if any. */
type Open = 'add' | 'harmonize' | 'pin' | 'instructions' | 'details' | null;
/** Whether the shell said it cannot open a folder ("Unknown ... open_folder"): then "Open folder" is gone, for every project, until the window is loaded again. */
let noFolderShell = false;

export function Workspace({ info, file }: { info: ProjectInfo; file: string | null }) {
  const project = useProject();
  const { request } = useRegistry();
  const notify = useNotify();
  const { sidebar } = useAppShell();
  const narrow = sidebar === 'drawer';
  const [drawer, setDrawer] = React.useState(false);
  const [noFolder, setNoFolder] = React.useState(noFolderShell);
  const jobs = useJobs();
  const [dialog, setDialog] = React.useState<Open>(null);
  // The input of the pin dialog stays when it closes, so the dialog does not change while it goes.
  const [pin, setPin] = React.useState({ input: '', remove: false });
  const data = React.useMemo(() => projectData(info), [info]);
  const view = project.view;
  const sim = view?.sim ?? null, selected = view?.selected ?? null;

  // ---------- what lights the graph ----------
  const shown: Outcome | null = sim ? (sim.example !== null && data.examples[sim.example] ? outcomeOfExample(data.examples[sim.example]) : sim.result) : null;
  const input = selected?.kind === 'input' ? data.inputs.find(i => i.id === selected.id) ?? null : null;
  const pairs = input ? '[]' : JSON.stringify([...litOf(shown)]);
  const lit = React.useMemo(() => new Map<string, number[]>(JSON.parse(pairs)), [pairs]);
  const targets = React.useMemo(() => input ? targetsOf(data.decisions, input.id) : [], [data, input]);
  // What the canvas draws, and which entries start closed, is the scene's (graphScene.ts): the lines from an entry to its capabilities (`drawn`), and every entry
  // closed that holds nothing lit and nothing the chosen input went to.
  const scene = React.useMemo(() => graphScene(data.entries, data.caps, data.slug, lit, targets), [data, lit, targets]);
  const litKey = input ? `input:${input.id}` : pairs === '[]' ? '' : `steps:${pairs}`;
  // The entries are closed until opened. A new light opens the entries that hold what it lights and closes the others, and the canvas is made again (`fit` is its key):
  // Sigrid's canvas fits the view to what is open when it is made and has no prop that fits it again, so a lit step in an entry just opened is never out of sight.
  // When the light goes, what is open stays open, and the canvas is made again too: Sigrid's canvas does not redraw a node whose text changed while the
  // set of open entries did not, so a step number would stay on a node after its example was put out.
  const [canvas, setCanvas] = React.useState({ key: litKey, collapsed: scene.closed, fit: 0 });
  let collapsed = canvas.collapsed, fit = canvas.fit;
  if (canvas.key !== litKey) {
    collapsed = litKey ? scene.closed : canvas.collapsed;
    fit = canvas.fit + 1;
    setCanvas({ key: litKey, collapsed, fit });
  }
  // A capability chosen from the details (a step, a branch, what an input went to) may sit in a closed entry: its entry opens, so the canvas shows what the inspector shows.
  const chosenCap = selected?.kind === 'capability' ? selected.id : null;
  const [opened, setOpened] = React.useState<string | null>(null);
  if (opened !== chosenCap) {
    setOpened(chosenCap);
    const holders = chosenCap === null ? [] : scene.drawn.filter(e => e.to === capNodeId(chosenCap)).map(e => e.from);
    if (holders.some(id => collapsed.includes(id))) {
      collapsed = collapsed.filter(id => !holders.includes(id));
      setCanvas(c => ({ ...c, collapsed: c.collapsed.filter(id => !holders.includes(id)) }));
    }
  }
  // An open entry says its "Use when" sentence under its name, a closed one only its name.
  const nodes = React.useMemo(() => drawnNodes(scene, collapsed), [scene, collapsed]);
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
  // One AI run at a time, of any project or adaptation (the runtime's lock): while one goes, no change of the package is offered. An edit by hand waits only for a run of this project.
  const busy = busyReason(jobs.running);
  const mine = runningOn(jobs.jobs, view.id);
  const editBusy = mine ? busyReason(mine) : null;
  /** A dialog opens over the workspace; a drawer that holds the panel closes first, so no two modal surfaces are open at once. */
  const show = (next: Exclude<Open, null>) => { setDrawer(false); setDialog(next); };
  const showPin = (input: string, remove: boolean) => { setPin({ input, remove }); show('pin'); };
  const closed = (open: boolean) => { if (!open) setDialog(null); };
  /** The file manager on the folder of the project's file (`open_folder {path}`, answered by the runtime for a listed project only). A shell that does not know the
   * request yet says so in the service's words: the button is then gone for the session, as "Open project file…" is when the shell has no file dialog. */
  async function openFolder(): Promise<void> {
    if (!file) return;
    try { await request('open_folder', { path: file }); }
    catch (e) {
      if (unknownTo(e, 'open_folder')) { noFolderShell = true; setNoFolder(true); notify('This version of Muro cannot open folders yet.', 'error'); }
      else notify(message(e), 'error');
    }
  }
  const name = text(info.project?.name) || text(info.plugin?.name) || view.id, version = text(info.plugin?.version), about = aboutLine(info);
  const summary = [plural(data.inputs.length, 'input'), plural(data.entries.length, 'entry', 'entries'), plural(data.caps.length, 'capability', 'capabilities'), plural(data.examples.length, 'example')].join(' · ');
  const panel = <LeftPanel data={data} panel={view.panel} onPanel={p => project.setPanel(p)} onChosen={chosen} onPin={showPin} onInstructions={() => show('instructions')} />;
  const litLine = input ? `The entries that hold what ${input.id} became are open.`
    : shown?.kind === 'decision' && shown.steps.length ? (shown.example !== null ? `The steps of “${shown.example}” are numbered on the graph.` : 'The steps of the answer are numbered on the graph.') : '';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-col gap-1 border-b border-line px-4 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <Button variant="ghost" size="sm" onClick={() => project.close()}><Icon name="moveLeft" />All projects</Button>
          <h1 className="min-w-0 truncate text-base font-semibold text-ink" title={name}>{name}</h1>
          {version ? <span className="text-xs text-ink-mute tabular-nums">{version}</span> : null}
          {info.included ? <Badge variant="secondary">Included with Muro</Badge> : null}
          <span className="min-w-0 flex-1 truncate text-xs text-ink-mute" title={summary}>{summary}</span>
          <GatedButton off={editBusy} variant="outline" size="sm" onClick={() => show('details')}>Edit details…</GatedButton>
          {narrow ? <Button variant="outline" size="sm" aria-expanded={drawer} onClick={() => setDrawer(true)}><Icon name="sidebarOpen" />Project panel</Button> : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-mute">
          {file ? <span className="min-w-0 truncate font-mono" title={file}>{file}</span> : null}
          {file && !noFolder ? <Button variant="outline" size="sm" onClick={() => void openFolder()}>Open folder</Button> : null}
          <span className="min-w-0 truncate" title={about}>{about}</span>
        </div>
      </header>
      <JobCard projectId={view.id} className="mx-4 mt-3" />
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
                  key={fit}
                  aria-label={`Decision graph of ${name}`}
                  nodes={nodes}
                  edges={scene.drawn}
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
        <span role="status" className="me-auto min-w-0 truncate text-xs text-ink-mute" title={busy ?? undefined}>{busy ?? ''}</span>
        <GatedButton off={NO_REVIEW} variant="outline">Review decisions…</GatedButton>
        <GatedButton off={busy} variant="outline" onClick={() => show('harmonize')}>Harmonize again…</GatedButton>
        <GatedButton off={NO_INSTALL} variant="outline">Install on harnesses…</GatedButton>
        <GatedButton off={busy} onClick={() => show('add')}>Add input…</GatedButton>
      </div>
      <AddInputDialog id={view.id} info={info} open={dialog === 'add'} onOpenChange={closed} />
      <HarmonizeDialog id={view.id} info={info} open={dialog === 'harmonize'} onOpenChange={closed} />
      <PinDialog id={view.id} info={info} open={dialog === 'pin'} onOpenChange={closed} input={pin.input} remove={pin.remove} />
      <InstructionsDialog id={view.id} info={info} open={dialog === 'instructions'} onOpenChange={closed} />
      <DetailsDialog id={view.id} info={info} open={dialog === 'details'} onOpenChange={closed} />
    </div>
  );
}

/** The left panel: a segmented control of its four panels, and the panel chosen, which scrolls. */
function LeftPanel({ data, panel, onPanel, onChosen, onPin, onInstructions }: { data: ProjectData; panel: Panel; onPanel(p: Panel): void; onChosen(): void; onPin(input: string, remove: boolean): void; onInstructions(): void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 p-3">
        <ToggleGroup value={panel} onValueChange={onPanel} aria-label="Project panels" className="flex w-full">
          {PANELS.map(p => <ToggleGroupItem key={p} value={p} className="flex-1 px-(--pad-xs)">{PANEL_LABELS[p]}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>
      <section aria-label={PANEL_LABELS[panel]} className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {panel === 'inputs' ? <InputsPanel data={data} onChosen={onChosen} onPin={onPin} onInstructions={onInstructions} />
          : panel === 'examples' ? <ExamplesPanel data={data} onChosen={onChosen} />
          : panel === 'records' ? <RecordsPanel data={data} />
          : <RunsPanel data={data} />}
      </section>
    </div>
  );
}
