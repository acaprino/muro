import * as React from 'react';
import { Badge, Button, Count, Dialog, Empty, Icon, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@acaprino/sigrid';
import type { ProjectInfo, ProjectSummary, Snapshot } from '../types.ts';
import { cellState, versionOf } from '../model.ts';
import { useRegistry } from '../state/registry.tsx';
import { ProjectProvider, useProject } from '../state/useProject.tsx';
import { useNotify } from '../state/notices.tsx';
import { message, unknownTo } from '../words.ts';
import { Workspace } from './project/Workspace.tsx';
import { useJobs } from './project/write/useJobs.tsx';
import { countsOf } from './project/lines.ts';

/** The Projects tab: the list of project files, and the workspace of the open one. The list reads `projects`, a project `project {id}`; a file is added through the
 * shell's file dialog (`pick_file`, then `open_project`) and taken off the list with `remove_project` (the entry only, never the file). The open project is the
 * session's (`state/project.ts`): leaving the tab, or a reload, brings it back. The write side (new project, harmonize, add an input) is a later plan. Its notices
 * are the window's one stack (`NoticesProvider`, mounted above the window in mount.tsx). */
export function Projects() {
  return (
    <ProjectProvider>
      <ProjectsTab />
    </ProjectProvider>
  );
}

const nameOf = (p: ProjectSummary): string => p.project?.name || p.plugin?.name || p.id;
const fileOf = (path: string): string => path.split(/[\\/]/).pop() || path;
const flat = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

function ProjectsTab() {
  const { request } = useRegistry();
  const project = useProject();
  // `settled` counts the jobs that ended: the list is read again when one does (a new project, a deleted one, a version moved).
  const { settled } = useJobs();
  const sendRef = React.useRef(request);
  sendRef.current = request;
  const [list, setList] = React.useState<ProjectSummary[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  /** The list of project files. A failure is the page's own: it shows where the list would be. */
  const loadList = React.useCallback(async (): Promise<ProjectSummary[] | null> => {
    setError(null);
    try {
      const read = await sendRef.current<ProjectSummary[]>('projects');
      const rows = Array.isArray(read) ? read : [];
      setList(rows);
      return rows;
    } catch (e) { setError(message(e)); return null; }
  }, []);
  React.useEffect(() => { void loadList(); }, [loadList, settled]);
  const openId = project.view?.id ?? null;
  // A project the list no longer holds (removed by another window, its file gone from the list) is closed.
  React.useEffect(() => { if (list && openId !== null && !list.some(p => p.id === openId)) project.close(); }, [list, openId]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (openId !== null) return <OpenProject key={openId} id={openId} summary={list?.find(p => p.id === openId) ?? null} />;
  return <ProjectList list={list} error={error} loadList={loadList} />;
}

// ---------- the list ----------
function ProjectList({ list, error, loadList }: { list: ProjectSummary[] | null; error: string | null; loadList: () => Promise<ProjectSummary[] | null> }) {
  const { request, snapshot, adopt } = useRegistry();
  const project = useProject();
  const notify = useNotify();
  const [noPicker, setNoPicker] = React.useState(false);
  const [opening, setOpening] = React.useState(false);
  const [removal, setRemoval] = React.useState<{ open: boolean; target: ProjectSummary | null }>({ open: false, target: null });
  const [removing, setRemoving] = React.useState(false);
  const latest = React.useRef(snapshot);
  latest.current = snapshot;

  async function openFile(): Promise<void> {
    let picked: { path: string | null } | null;
    try { picked = await request<{ path: string | null } | null>('pick_file', { filter: 'Muro project (*.mp)' }); }
    catch (e) {
      if (unknownTo(e, 'pick_file')) { setNoPicker(true); notify('This version of Muro cannot open a file dialog yet.', 'error'); }
      else notify(message(e), 'error');
      return;
    }
    const path = picked?.path;
    if (!path) return;
    setOpening(true);
    try {
      await request('open_project', { path });
      const read = await loadList();
      const added = read?.find(p => flat(p.path) === flat(path));
      notify(`${added ? nameOf(added) : 'The project'} added to your list.`);
    } catch (e) { notify(message(e), 'error'); }
    finally { setOpening(false); }
  }

  /** The entry goes, never the file. A save the service refuses because the registry moved behind the page's back is sent once more with the revision read again; the
   * project Muro ships is refused by the service, whatever the page shows. */
  async function remove(p: ProjectSummary): Promise<void> {
    setRemoving(true);
    const send = (revision: number) => request<Snapshot>('remove_project', { id: p.id, revision });
    try {
      const revision = latest.current?.registry.revision ?? (await request<Snapshot>('snapshot')).registry.revision;
      let saved: Snapshot;
      try { saved = await send(revision); }
      catch (e) {
        if (!/Registry revision changed/.test(message(e))) throw e;
        const read = await request<Snapshot>('snapshot');
        adopt(read);
        saved = await send(read.registry.revision);
      }
      setRemoval(r => ({ ...r, open: false }));
      adopt(saved);
      await loadList();
      notify(`${nameOf(p)} removed from your list.`);
    } catch (e) {
      setRemoval(r => ({ ...r, open: false }));
      notify(message(e), 'error');
    } finally { setRemoving(false); }
  }

  const openButton = noPicker ? null : <Button loading={opening} loadingText="Opening the project file…" onClick={() => void openFile()}>Open project file…</Button>;
  let body: React.ReactNode;
  if (list === null && error) body = <Empty title="Projects could not be read" description={error} action={<Button variant="outline" onClick={() => void loadList()}>Try again</Button>} />;
  else if (list === null) body = <p role="status" className="text-sm text-ink-mute">Reading the projects…</p>;
  else if (!list.length) body = <Empty title="No project yet" description="Open a project file to add it here." action={openButton} />;
  else body = (
    <Table aria-label="Projects">
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead><span className="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.map(p => <ProjectRow key={p.id} p={p} onOpen={() => project.open(p.id)} onRemove={() => setRemoval({ open: true, target: p })} />)}
      </TableBody>
    </Table>
  );

  const asked = removal.target, installed = !!asked && !!snapshot?.registry.plugins.some(x => x.project === asked.id);
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl font-semibold text-ink">Projects</h1>
          <p className="text-sm text-ink-mute">A project turns plugins and skills into one plugin, harmonized by the AI, for every harness.</p>
        </div>
        {list && !list.length ? null : openButton}
      </header>
      {body}
      {snapshot ? <Published snapshot={snapshot} /> : null}
      <Dialog
        open={removal.open}
        onOpenChange={open => { if (!open && !removing) setRemoval(r => ({ ...r, open: false })); }}
        title={asked ? `Remove ${nameOf(asked)} from your list?` : 'Remove from your list?'}
        description={asked ? `Only the entry goes: the file stays where it is (${asked.path}) and you can open it again.${installed ? ' Its installed plugin stays as it is; Sync shows it as changed until the project is in your list again.' : ''}` : undefined}
        footer={asked ? (
          <>
            <Button variant="outline" disabled={removing} onClick={() => setRemoval(r => ({ ...r, open: false }))}>Cancel</Button>
            <Button variant="destructive" loading={removing} onClick={() => void remove(asked)}>Remove {nameOf(asked)}</Button>
          </>
        ) : null}
      />
    </div>
  );
}

/** One project file of the list: its name (which opens it), its version, whether Muro ships it, its file and what it holds; or, for a file that cannot be read, why.
 * "Remove from list" is on every project but the one Muro ships (`included`, which the runtime says: never a field of the file, which anyone can write). */
function ProjectRow({ p, onOpen, onRemove }: { p: ProjectSummary; onOpen: () => void; onRemove: () => void }) {
  const name = nameOf(p), counts = countsOf(p);
  return (
    <TableRow>
      <TableCell className="w-full max-w-0">
        <div className="flex min-w-0 flex-col gap-0.5 py-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {p.error
              ? <span className="truncate font-medium text-ink" title={p.path}>{fileOf(p.path)}</span>
              : <Button variant="link" className="h-auto max-w-full px-0" onClick={onOpen}><span className="truncate" title={name}>{name}</span></Button>}
            {!p.error && p.plugin?.version ? <span className="text-xs text-ink-mute tabular-nums">{p.plugin.version}</span> : null}
            {p.included ? <Badge variant="secondary">Included with Muro</Badge> : null}
            {p.error ? <Badge variant="destructive">Cannot be read</Badge> : null}
          </div>
          <span className="truncate text-xs text-ink-mute" title={p.path}>{p.path}</span>
          {p.error ? <span className="text-xs text-destructive">{p.error}</span> : counts ? <span className="text-xs text-ink-mute">{counts}</span> : null}
        </div>
      </TableCell>
      <TableCell className="text-end">
        {p.included ? null : <Button variant="outline" size="sm" aria-label={`Remove ${name} from the list`} onClick={onRemove}>Remove from list</Button>}
      </TableCell>
    </TableRow>
  );
}

/** The plugins of the list that are no project's: installed as their author ships them, with the harnesses that have no build of them. */
function Published({ snapshot }: { snapshot: Snapshot }) {
  const own = snapshot.registry.plugins.filter(p => !p.project);
  if (!own.length) return null;
  return (
    <section aria-labelledby="published-heading" className="flex flex-col gap-2">
      <h2 id="published-heading" className="flex items-center gap-2 text-base font-semibold text-ink">
        <Icon name="archive" />
        <span>Installed as published</span>
        <Count value={own.length} label={own.length === 1 ? 'plugin' : 'plugins'} />
      </h2>
      <p className="text-sm text-ink-mute">Plugins Muro installs as their author ships them.</p>
      <ul role="list" aria-label="Installed as published" className="flex flex-col">
        {own.map(p => {
          const missing = snapshot.registry.targets.filter(t => t.enabled && p.targets.includes(t.id) && cellState(p, t, snapshot, null).kind === 'needs-build');
          const version = versionOf(p).version;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-ink" title={p.name}>{p.name}{version ? <span className="font-normal text-ink-mute"> {version}</span> : null}</span>
                <span className="truncate text-xs text-ink-mute" title={p.source}>{p.source}</span>
              </div>
              {missing.length ? <span className="text-xs font-medium text-warning">Needs a build for {missing.map(t => t.name).join(', ')}</span> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------- the open project ----------
/** The open project, read from the service. An answer for a project that is no longer the open one is dropped; a failure says why, with Try again. */
function OpenProject({ id, summary }: { id: string; summary: ProjectSummary | null }) {
  const { request } = useRegistry();
  const project = useProject();
  const { settled } = useJobs();
  const sendRef = React.useRef(request);
  sendRef.current = request;
  const [attempt, setAttempt] = React.useState(0);
  const [read, setRead] = React.useState<{ info: ProjectInfo | null; error: string | null }>({ info: null, error: null });
  React.useEffect(() => {
    let live = true;
    setRead(r => ({ info: r.info, error: null }));
    sendRef.current<ProjectInfo>('project', { id }).then(
      info => { if (live) setRead({ info, error: null }); },
      e => { if (live) setRead({ info: null, error: message(e) }); },
    );
    return () => { live = false; };
  }, [id, attempt, settled]);
  const back = <Button variant="ghost" size="sm" onClick={() => project.close()}><Icon name="moveLeft" />All projects</Button>;
  if (read.error) return (
    <div className="flex flex-col gap-4 p-6">
      <div>{back}</div>
      <Empty title="This project could not be read" description={read.error} action={<Button variant="outline" onClick={() => setAttempt(n => n + 1)}>Try again</Button>} />
    </div>
  );
  if (!read.info) return (
    <div className="flex flex-col gap-4 p-6">
      <div>{back}</div>
      <p role="status" className="text-sm text-ink-mute">Reading the project…</p>
    </div>
  );
  return <Workspace info={read.info} file={summary?.path ?? null} />;
}
