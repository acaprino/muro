import * as React from 'react';
import { Badge, Button, Cell, Cluster, Column, Heading, Icon, ScrollArea, Separator, Sheet, SheetContent, SheetHeader, SheetTitle, Spacer, Text, ToggleGroup, ToggleGroupItem } from '@acaprino/sigrid/primitives';
import { Empty } from '@acaprino/sigrid/components';
import { ContentSplit, Inspector, useAppShell } from '@acaprino/sigrid/layout';
import { GraphCanvas, type GraphCanvasHandle } from '@acaprino/sigrid/graph';
import type { ProjectInfo } from '../../types.ts';
import { text } from '../../model.ts';
import { PANELS, sameSelected } from '../../state/project.ts';
import type { Panel } from '../../state/project.ts';
import { useNotify } from '@acaprino/imago';
import { useRegistry } from '../../state/registry.tsx';
import { useProject } from '../../state/useProject.tsx';
import type { ProjectDialog } from '../../state/useProject.tsx';
import { message, plural, unknownTo } from '../../words.ts';
import { litOf, outcomeOfExample } from './graph-model.ts';
import type { Outcome } from './graph-model.ts';
import { around, capNodeId, capabilityOf, drawnNodes, graphScene, openingFor } from './graphScene.ts';
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
 * of what is selected in the window's inspector (`ProjectInspector`), and the actions of the project in the window's action bar (`ProjectActions`). The frame decides the widths (Sigrid's `AppShell`): under 1000px the inspector
 * is a panel over the end of the graph, and where the frame has no room for a sidebar (under 850px) the left panel opens as a drawer from a button.
 *
 * What lights the graph is the decision shown (a documented example, or the AI's answer to a free-text request: `sim`), whose steps the canvas numbers as its path, or
 * the input selected, whose capabilities (what its decisions went to) the canvas marks as chosen together; what the inspector shows is `selected`. The two are apart, so
 * looking at a capability of a lit path keeps the path lit. The graph data is made in one place, `graphScene.ts`.
 *
 * The changes of the project (write/): Add input and Harmonize again at the foot, Edit details in the header, Move pin, Remove and the instructions in the Inputs panel.
 * Each opens a dialog the workspace holds, so it outlives the drawer the panel may be in. A change of the package is an AI run of the runtime, one at a time: while any
 * run goes no other is offered, and the buttons and the foot say why; an edit by hand (the details) waits only for a run that changes this project. The run of this
 * project is the card at the top (JobCard). Review decisions has no operation in the runtime yet, and installing comes with the Sync page: both stay off, saying so. */

const PANEL_LABELS: Record<Panel, string> = { inputs: 'Inputs', examples: 'Examples', records: 'Records', runs: 'Runs' };
/** Why the two actions the runtime has no operation for here are off. */
const NO_REVIEW = 'Coming with the review';
const NO_INSTALL = 'Coming with the Sync page';
/** Whether the shell said it cannot open a folder ("Unknown ... open_folder"): then "Open folder" is gone, for every project, until the window is loaded again. */
let noFolderShell = false;

export function Workspace({ info, file }: { info: ProjectInfo; file: string | null }) {
  const project = useProject();
  const { request } = useRegistry();
  const notify = useNotify();
  const { sidebar } = useAppShell();
  const narrow = sidebar !== 'full';
  const [drawer, setDrawer] = React.useState(false);
  const [noFolder, setNoFolder] = React.useState(noFolderShell);
  const jobs = useJobs();
  const { dialog, setDialog } = project;
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
  // What the canvas draws, its numbered path and which entries start closed are the scene's (graphScene.ts): every line, each kind with its dash and its words, and
  // every entry closed that holds nothing lit and nothing the chosen input went to.
  const scene = React.useMemo(() => graphScene(data.entries, data.caps, data.slug, lit, targets), [data, lit, targets]);
  // The things of the capabilities the chosen input went to, which the canvas marks as chosen together (one of them is the choice screen readers hear, the others are
  // "chosen with" it); those the graph lacks are left out.
  const marked = React.useMemo(() => targets.map(capNodeId).filter(id => scene.nodes.some(n => n.id === id)), [targets, scene]);
  const litKey = input ? `input:${input.id}` : pairs === '[]' ? '' : `steps:${pairs}`;
  // The entries are closed until opened. A new light opens the entries that hold what it lights and closes the others, and asks the canvas to bring what it lights into
  // the view (`aim`, which the effect below hands to the canvas's `focus`): Sigrid's canvas fits its first view on the path, and after that only on a change of size,
  // its own button or its handle, so a lit step in an entry just opened would otherwise stay where the view is not. When the light goes, what is open stays open
  // and the view stays. `aim.n` counts the requests; 0 is none, so the first view is Sigrid's own.
  const [canvas, setCanvas] = React.useState({ key: litKey, collapsed: scene.closed, aim: { ids: [] as readonly string[], n: 0 } });
  let collapsed = canvas.collapsed;
  if (canvas.key !== litKey) {
    collapsed = litKey ? scene.closed : canvas.collapsed;
    const ids = input ? marked : [...scene.steps.keys()];
    setCanvas({ key: litKey, collapsed, aim: litKey && ids.length ? { ids, n: canvas.aim.n + 1 } : canvas.aim });
  }
  // A capability chosen (on the canvas, or from the details: a step, what an input went to) is drawn with its lines, which Sigrid draws while both ends are in sight:
  // when it or one it is joined to sits in a closed entry, that entry opens and the canvas is asked to bring them all into the view. The entries open here, in the
  // same draw, so the view is fitted on the places they have with their second line.
  const chosenCap = selected?.kind === 'capability' ? selected.id : null;
  const [looked, setLooked] = React.useState<string | null>(null);
  if (looked !== chosenCap) {
    setLooked(chosenCap);
    const ids = chosenCap === null ? [] : around(scene, chosenCap), opening = openingFor(scene, ids, collapsed);
    if (opening.length) {
      collapsed = collapsed.filter(id => !opening.includes(id));
      setCanvas(c => ({ ...c, collapsed: c.collapsed.filter(id => !opening.includes(id)), aim: { ids, n: c.aim.n + 1 } }));
    }
  }
  const graph = React.useRef<GraphCanvasHandle>(null);
  const aim = canvas.aim;
  React.useEffect(() => { if (aim.n > 0) graph.current?.focus(aim.ids); }, [aim]);
  // An open entry says its "Use when" sentence under its name, a closed one only its name.
  const nodes = React.useMemo(() => drawnNodes(scene, collapsed), [scene, collapsed]);
  const setCollapsed = (next: string[] | ((now: readonly string[]) => string[])) => setCanvas(c => ({ ...c, collapsed: typeof next === 'function' ? next(c.collapsed) : next }));

  if (!view || !sim) return null;
  /** A capability on the canvas shows its details; an entry opens or closes; a press on the empty canvas lets go of a capability. */
  const onNode = (id: string | null) => {
    if (id === null) { project.select(now => now?.kind === 'capability' ? null : now); return; }
    const cap = capabilityOf(id);
    if (cap !== null) project.select({ kind: 'capability', id: cap });
    else setCollapsed(now => now.includes(id) ? now.filter(x => x !== id) : [...now, id]);
  };
  const chosen = () => setDrawer(false);
  // An edit by hand waits only for a run of this project.
  const mine = runningOn(jobs.jobs, view.id);
  const editBusy = mine ? busyReason(mine) : null;
  /** A dialog opens over the workspace; a drawer that holds the panel closes first, so no two modal surfaces are open at once. */
  const show = (next: ProjectDialog) => { setDrawer(false); setDialog(next); };
  const showPin = (input: string, remove: boolean) => { setPin({ input, remove }); show('pin'); };
  const closed = (open: boolean) => { if (!open) setDialog(null); };
  /** The file manager on the folder of the project's file (`open_folder {path}`, answered by the runtime for a listed project only). A shell that does not know the
   * request yet says so in the service's words: the button is then gone for the session, as "Open project file…" is when the shell has no file dialog. */
  async function openFolder(): Promise<void> {
    if (!file) return;
    try { await request('open_folder', { path: file }); }
    catch (e) {
      if (unknownTo(e, 'open_folder')) { noFolderShell = true; setNoFolder(true); notify('This version of Muro cannot open folders yet.', { kind: 'error' }); }
      else notify(message(e), { kind: 'error' });
    }
  }
  const name = text(info.project?.name) || text(info.plugin?.name) || view.id, version = text(info.plugin?.version), about = aboutLine(info);
  const summary = [plural(data.inputs.length, 'input'), plural(data.entries.length, 'entry', 'entries'), plural(data.caps.length, 'capability', 'capabilities'), plural(data.examples.length, 'example')].join(' · ');
  const panel = <LeftPanel data={data} panel={view.panel} onPanel={p => project.setPanel(p)} onChosen={chosen} onPin={showPin} onInstructions={() => show('instructions')} />;
  const litLine = input ? (marked.length ? `The capabilities ${input.id} became are marked on the graph.` : `${input.id} became no capability on the graph.`)
    : shown?.kind === 'decision' && shown.steps.length ? (shown.example !== null ? `The steps of “${shown.example}” are numbered on the graph.` : 'The steps of the answer are numbered on the graph.') : '';

  const pane = (
    <Column fill as="section" aria-labelledby="graph-heading" pad="md">
      <Cluster>
        <Heading size="small" level={2} id="graph-heading" icon={<Icon name="structure" />}>Decision graph</Heading>
        <Text variant="note">{plural(data.entries.length, 'entry', 'entries')} · {plural(data.caps.length, 'capability', 'capabilities')}</Text>
        <Text variant="note" role="status">{litLine}</Text>
      </Cluster>
      {data.caps.length ? (
        <>
          {data.entries.length ? null : <Text as="p" variant="note">No entry groups these capabilities: each stands on its own.</Text>}
          {/* The first view, a change of size and the fit button keep names readable (Sigrid's `minFitZoom`, 0.8 by default: a 14px name at about 11px);
              a graph too large for that starts at its first entry, and the rest is a pan, the map or the find field away. */}
          <GraphCanvas
            ref={graph}
            fill
            aria-label={`Decision graph of ${name}`}
            nodes={nodes}
            edges={scene.edges}
            steps={scene.steps}
            selected={input ? marked : chosenCap !== null ? capNodeId(chosenCap) : null}
            onSelect={onNode}
            collapsed={collapsed}
            onCollapsedChange={ids => setCollapsed(ids)}
            search
            minimap
          />
        </>
      ) : (
        <Empty title="No decision graph" description="This project's plugin has no capabilities to choose between, so there is nothing to draw or to simulate." />
      )}
    </Column>
  );

  return (
    <Column fill gap="xs">
      <header>
        <Column pad="md" gap="xs">
          <Cluster>
            <Button variant="ghost" size="sm" onClick={() => project.close()}><Icon name="moveLeft" />All projects</Button>
            <Heading size="small" level={1}><Text pre>{name}</Text></Heading>
            {version ? <Text variant="note">{version}</Text> : null}
            {info.included ? <Badge variant="secondary">Included with Muro</Badge> : null}
            <Text variant="note">{summary}</Text>
            <Spacer />
            <GatedButton off={editBusy} variant="outline" size="sm" onClick={() => show('details')}>Edit details…</GatedButton>
            {narrow ? <Button variant="outline" size="sm" aria-expanded={drawer} onClick={() => setDrawer(true)}><Icon name="sidebarOpen" />Project panel</Button> : null}
          </Cluster>
          <Cluster>
            {file ? <Text variant="note" pre><code>{file}</code></Text> : null}
            {file && !noFolder ? <Button variant="outline" size="sm" onClick={() => void openFolder()}>Open folder</Button> : null}
            <Text variant="note" pre>{about}</Text>
          </Cluster>
        </Column>
      </header>
      <Separator decorative />
      <JobCard projectId={view.id} inset />
      {narrow ? (
        <>
          <Sheet open={drawer} onOpenChange={open => setDrawer(open)}>
            <SheetContent side="left">
              <SheetHeader><SheetTitle>Project panel</SheetTitle></SheetHeader>
              {panel}
            </SheetContent>
          </Sheet>
          {pane}
        </>
      ) : <Cell grow><ContentSplit aside={panel} asideLabel="Project panel" step={0}>{pane}</ContentSplit></Cell>}
      <AddInputDialog id={view.id} info={info} open={dialog === 'add'} onOpenChange={closed} />
      <HarmonizeDialog id={view.id} info={info} open={dialog === 'harmonize'} onOpenChange={closed} />
      <PinDialog id={view.id} info={info} open={dialog === 'pin'} onOpenChange={closed} input={pin.input} remove={pin.remove} />
      <InstructionsDialog id={view.id} info={info} open={dialog === 'instructions'} onOpenChange={closed} />
      <DetailsDialog id={view.id} info={info} open={dialog === 'details'} onOpenChange={closed} />
    </Column>
  );
}

/** The left panel: a segmented control of its four panels, and the panel chosen, which scrolls. */
function LeftPanel({ data, panel, onPanel, onChosen, onPin, onInstructions }: { data: ProjectData; panel: Panel; onPanel(p: Panel): void; onChosen(): void; onPin(input: string, remove: boolean): void; onInstructions(): void }) {
  return (
    <Column fill pad="md" gap="md">
      <ToggleGroup fill value={panel} onValueChange={onPanel} aria-label="Project panels">
        {PANELS.map(p => <ToggleGroupItem key={p} value={p}>{PANEL_LABELS[p]}</ToggleGroupItem>)}
      </ToggleGroup>
      <ScrollArea aria-label={PANEL_LABELS[panel]}>
        {panel === 'inputs' ? <InputsPanel data={data} onChosen={onChosen} onPin={onPin} onInstructions={onInstructions} />
          : panel === 'examples' ? <ExamplesPanel data={data} onChosen={onChosen} />
          : panel === 'records' ? <RecordsPanel data={data} />
          : <RunsPanel data={data} />}
      </ScrollArea>
    </Column>
  );
}

/** The actions of the open project, in the window's region for them. One AI run at a time, of any project or adaptation (the runtime's lock): while one goes, no change of the package is offered. */
export function ProjectActions() {
  const { setDialog } = useProject();
  const busy = busyReason(useJobs().running);
  return (
    <Cell grow>
      <Cluster justify="end">
        <Text variant="note" role="status">{busy ?? ''}</Text>
        <Spacer />
        <GatedButton off={NO_REVIEW} variant="outline">Review decisions…</GatedButton>
        <GatedButton off={busy} variant="outline" onClick={() => setDialog('harmonize')}>Harmonize again…</GatedButton>
        <GatedButton off={NO_INSTALL} variant="outline">Install on harnesses…</GatedButton>
        <GatedButton off={busy} onClick={() => setDialog('add')}>Add input…</GatedButton>
      </Cluster>
    </Cell>
  );
}

/** The details of what is selected in the open project, in the window's inspector: docked beside the content from 1000px, a panel over its end under it. */
export function ProjectInspector() {
  const { view, info, select } = useProject();
  const data = React.useMemo(() => (info ? projectData(info) : null), [info]);
  if (!view || !data) return null;
  const selected = view.selected, detail = resolve(selected, data);
  return (
    <Inspector
      title={detail ? TITLES[detail.kind] : 'Details'}
      open={detail !== null}
      // It was closed: what it showed is no longer selected. A press outside it that also chose another thing keeps the new choice.
      onOpenChange={open => { if (!open) select(now => sameSelected(now, selected) ? null : now); }}
    >
      {detail ? <Details shown={detail} data={data} onSelect={select} /> : null}
    </Inspector>
  );
}
