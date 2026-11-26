import * as React from 'react';
import { Badge, Button, Cluster, Column, Count, Heading, Icon, Page, Section, Split, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from '@acaprino/sigrid/primitives';
import { Dialog, Empty, SettingRow } from '@acaprino/sigrid/components';
import type { ProjectInfo, ProjectSummary, Snapshot } from '../types.ts';
import { cellState, versionOf } from '../model.ts';
import { useRegistry } from '../state/registry.tsx';
import { useProject } from '../state/useProject.tsx';
import { useFocusKept, useNotify } from '@acaprino/imago';
import { message, unknownTo } from '../words.ts';
import { Workspace } from './project/Workspace.tsx';
import { DeleteDialog, atRevision, nameOf } from './project/write/DeleteDialog.tsx';
import { JobCard } from './project/write/JobCard.tsx';
import { busyReason, pickProjectFile, runningOn } from './project/write/jobs.ts';
import { NewProjectDialog } from './project/write/NewProjectDialog.tsx';
import { useJobs } from './project/write/useJobs.tsx';
import { countsOf } from './project/lines.ts';

const fileOf = (path: string): string => path.split(/[\\/]/).pop() || path;
/** The ids of a list of projects, in one order, as one string to compare. */
const idsOf = (projects: readonly { id: string }[]): string => projects.map(p => p.id).sort().join('\n');

/** The Projects tab: the list of project files, and the workspace of the open one. The list reads `projects`, a project `project {id}`; a file is added through the
 * shell's file dialog (`pick_file`, then `open_project`) and taken off the list with `remove_project` (the entry only, never the file). A new project is made by an AI run
 * (`NewProjectDialog`, followed by the job card above the list) and a project is deleted, file and all, after asking (`DeleteDialog`). The open project is the
 * session's (`state/project.ts`): leaving the tab, or a reload, brings it back. */
export function Projects() {
  const { request, snapshot } = useRegistry();
  const project = useProject();
  const leave = React.useRef(project.leave);
  leave.current = project.leave;
  React.useEffect(() => () => leave.current(), []);
  const openId = project.view?.id ?? null;
  const { settled } = useJobs();
  const { cache } = project;
  // The projects the registry lists: another window or the tray that adds or takes away a file moves them.
  const ids = idsOf(snapshot?.registry.projects ?? []);
  // The list the window last read, while nothing moved since: coming back to the tab reads nothing (each summary is a Python process).
  const kept = cache.list;
  const lastListRead = React.useRef<{ settled: number; ids: string } | null>(kept ? { settled: kept.settled, ids: kept.ids } : null);
  const [list, setList] = React.useState<ProjectSummary[] | null>(kept ? kept.rows : null);
  const [error, setError] = React.useState<string | null>(null);
  const keep = React.useCallback((rows: ProjectSummary[]) => {
    const at = lastListRead.current;
    cache.list = at ? { ...at, rows } : null;
  }, [cache]);
  const loadList = React.useCallback(async (): Promise<void> => {
    lastListRead.current = { settled, ids };
    setError(null);
    try {
      const rows = await request<ProjectSummary[]>('projects');
      const shown = Array.isArray(rows) ? rows : [];
      keep(shown);
      setList(shown);
    } catch (e) { setError(message(e)); }
  }, [request, settled, ids, keep]);
  // Keep the last list ready for Back. A job or edit invalidates its summaries, but those reads
  // can wait until the list is visible instead of delaying the open project's own refresh.
  // The registry's projects moved since the last reading and the list does not show them as they are now: read again, once for each such move.
  const shown = list ? idsOf(list) : null;
  React.useEffect(() => {
    const at = lastListRead.current;
    if (openId === null && (at?.settled !== settled || (at.ids !== ids && shown !== ids))) void loadList();
  }, [openId, loadList, settled, ids, shown]);
  async function showOpened(added: ProjectSummary): Promise<void> {
    if (!list) return loadList();
    setList(rows => {
      const current = rows ?? [];
      const next = current.some(p => p.id === added.id)
        ? current.map(p => p.id === added.id ? added : p)
        : [...current, added];
      keep(next);
      return next;
    });
  }
  // Opening a project takes its button away, and closing one takes "All projects".
  useFocusKept(openId);
  if (openId !== null) return <OpenProject key={openId} id={openId} onUnlisted={() => {
    lastListRead.current = null;
    project.close();
  }} />;
  return <ProjectList list={list} error={error} loadList={loadList} showOpened={showOpened} />;
}

// ---------- the list ----------
function ProjectList({ list, error, loadList, showOpened }: {
  list: ProjectSummary[] | null;
  error: string | null;
  loadList(): Promise<void>;
  showOpened(project: ProjectSummary): Promise<void>;
}) {
  const { request, snapshot, adopt, reload } = useRegistry();
  const project = useProject();
  const notify = useNotify();
  const { jobs, running } = useJobs();
  const [noPicker, setNoPicker] = React.useState(false);
  const [opening, setOpening] = React.useState(false);
  const [making, setMaking] = React.useState(false);
  const [removal, setRemoval] = React.useState<{ open: boolean; target: ProjectSummary | null }>({ open: false, target: null });
  const [removing, setRemoving] = React.useState(false);
  const [deletion, setDeletion] = React.useState<{ open: boolean; target: ProjectSummary | null }>({ open: false, target: null });
  const newButton = React.useRef<HTMLButtonElement>(null);
  /** The heading of the page: where focus goes when the button it was on is gone (a project deleted) or off (a run started). */
  const heading = React.useRef<HTMLSpanElement>(null);
  const latest = React.useRef(snapshot);
  latest.current = snapshot;
  // One AI run goes at a time: while one does, a new project is not offered, and the button says why.
  const busy = busyReason(running);

  async function openFile(): Promise<void> {
    setOpening(true);
    try {
      let path: string | null;
      try { path = await pickProjectFile(request); }
      catch (e) {
        if (!unknownTo(e, 'pick_file')) throw e;
        setNoPicker(true);
        notify('This version of Muro cannot open a file dialog yet.', { kind: 'error' });
        return;
      }
      if (!path) return;
      const added = await request<ProjectSummary>('open_project', { path });
      if (!latest.current?.registry.projects?.some(project => project.id === added.id)) void reload();
      await showOpened(added);
      notify(`${nameOf(added)} added to your list.`);
    } catch (e) { notify(message(e), { kind: 'error' }); }
    finally { setOpening(false); }
  }

  /** The entry goes, never the file. A save the service refuses because the registry moved behind the page's back is sent once more with the revision read again. */
  async function remove(p: ProjectSummary): Promise<void> {
    setRemoving(true);
    try {
      const saved = await atRevision(request, latest.current, adopt, revision => request<Snapshot>('remove_project', { id: p.id, revision }));
      setRemoval(r => ({ ...r, open: false }));
      adopt(saved);
      await loadList();
      notify(`${nameOf(p)} removed from your list.`);
    } catch (e) {
      setRemoval(r => ({ ...r, open: false }));
      notify(message(e), { kind: 'error' });
    } finally { setRemoving(false); }
  }

  // The one solid button of the list is New project; opening a file is the other way in, so it is an outline.
  const openButton = noPicker ? null : <Button variant="outline" loading={opening} loadingText="Opening the project file…" onClick={() => void openFile()}>Open project file…</Button>;
  let body: React.ReactNode;
  if (list === null && error) body = <Empty title="Projects could not be read" description={error} action={<Button variant="outline" onClick={() => void loadList()}>Try again</Button>} />;
  else if (list === null) body = <Text as="p" variant="muted" role="status">Reading the projects…</Text>;
  else if (!list.length) body = <Empty title="No project yet" description="Make one from the plugins and skills you want in it, or open a project file to add it here." action={openButton} />;
  else body = (
    <Table aria-label="Projects">
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead aria-label="Actions" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.map(p => (
          <ProjectRow
            key={p.id}
            p={p}
            deleteReason={busyReason(runningOn(jobs, p.id))}
            onOpen={() => project.open(p.id)}
            onRemove={() => setRemoval({ open: true, target: p })}
            onDelete={() => setDeletion({ open: true, target: p })}
          />
        ))}
      </TableBody>
    </Table>
  );

  const asked = removal.target, installed = !!asked && !!snapshot?.registry.plugins.some(x => x.project === asked.id);
  return (
    <Page>
      <Split>
        <Column gap="xs">
          <Heading level={1}><span ref={heading} tabIndex={-1}>Projects</span></Heading>
          <Text as="p" variant="muted">A project turns plugins and skills into one plugin, harmonized by the AI, for every harness.</Text>
        </Column>
        <Cluster>
          <span title={busy ?? undefined}>
            <Button ref={newButton} disabled={busy !== null} onClick={() => setMaking(true)}><Icon name="plus" />New project…</Button>
          </span>
          {list && !list.length ? null : openButton}
        </Cluster>
      </Split>
      <JobCard projectId={null} />
      {body}
      {snapshot ? <Published snapshot={snapshot} /> : null}
      <NewProjectDialog open={making} onOpenChange={setMaking} listed={list ?? []} restoreFocusTo={newButton} focusAfterStart={heading} />
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
      {deletion.target ? (
        <DeleteDialog
          project={deletion.target}
          open={deletion.open}
          onOpenChange={open => setDeletion(d => ({ ...d, open }))}
          onDeleted={() => loadList()}
          focusAfter={heading}
        />
      ) : null}
    </Page>
  );
}

/** One project file of the list: its name (which opens it), its version, its file and what it holds; or, for a file that cannot be read, why.
 * "Remove from list" and "Delete…" are on every project. "Delete…" is off while an AI run is changing the project (`deleteReason` says why). */
function ProjectRow({ p, deleteReason, onOpen, onRemove, onDelete }: { p: ProjectSummary; deleteReason: string | null; onOpen: () => void; onRemove: () => void; onDelete: () => void }) {
  const name = nameOf(p), counts = countsOf(p);
  return (
    <TableRow>
      <TableCell grow>
        <Column gap="xs">
          <Cluster wrap={false}>
            {p.error
              ? <Text variant="strong" truncate title={p.path}>{fileOf(p.path)}</Text>
              : <Button variant="link" size="inline" onClick={onOpen}><Text truncate>{name}</Text></Button>}
            {!p.error && p.plugin?.version ? <Text variant="note">{p.plugin.version}</Text> : null}
            {p.error ? <Badge tone="danger">Cannot be read</Badge> : null}
          </Cluster>
          <Text variant="note" truncate>{p.path}</Text>
          {p.error ? <Text tone="danger">{p.error}</Text> : counts ? <Text variant="note">{counts}</Text> : null}
        </Column>
      </TableCell>
      <TableCell align="end">
        <Cluster justify="end">
          <Button variant="outline" size="sm" aria-label={`Remove ${name} from the list`} onClick={onRemove}>Remove from list</Button>
          <span title={deleteReason ?? undefined}>
            <Button variant="outline" size="sm" aria-label={`Delete ${name}…`} disabled={deleteReason !== null} onClick={onDelete}>Delete…</Button>
          </span>
        </Cluster>
      </TableCell>
    </TableRow>
  );
}

/** The plugins of the list that are no project's: installed as their author ships them, with the harnesses that have no build of them. */
function Published({ snapshot }: { snapshot: Snapshot }) {
  const own = snapshot.registry.plugins.filter(p => !p.project);
  if (!own.length) return null;
  return (
    <Section title="Installed as published" icon={<Icon name="archive" />} end={<Count value={own.length} label={own.length === 1 ? 'plugin' : 'plugins'} />}>
      <Text as="p" variant="note">Plugins Muro installs as their author ships them.</Text>
      <Column as="ul" gap="xs" aria-label="Installed as published">
        {own.map(p => {
          const missing = snapshot.registry.targets.filter(t => t.enabled && p.targets.includes(t.id) && cellState(p, t, snapshot, null).kind === 'needs-build');
          const version = versionOf(p).version;
          return (
            <li key={p.id}>
              <SettingRow
                label={<Text truncate title={p.name}><Text variant="strong">{p.name}</Text>{version ? <Text variant="muted"> {version}</Text> : null}</Text>}
                description={<Text truncate>{p.source}</Text>}
                control={missing.length ? <Badge tone="warning">Needs a build for {missing.map(t => t.name).join(', ')}</Badge> : undefined}
              />
            </li>
          );
        })}
      </Column>
    </Section>
  );
}

// ---------- the open project ----------
/** The open project, read from the service. An answer for a project that is no longer the open one is dropped; a failure says why, with Try again. */
function OpenProject({ id, onUnlisted }: { id: string; onUnlisted(): void }) {
  const { request } = useRegistry();
  const project = useProject();
  const { settled } = useJobs();
  const { cache } = project;
  const sendRef = React.useRef(request);
  sendRef.current = request;
  const [attempt, setAttempt] = React.useState(0);
  // The project as the window last read it, while no run or edit has ended since: opening it again, or coming back to the tab, reads nothing (a Python process).
  const kept = (): (ProjectInfo & { file: string }) | null => cache.info?.id === id && cache.info.settled === settled ? cache.info.info : null;
  const [read, setRead] = React.useState<{ info: (ProjectInfo & { file: string }) | null; error: string | null }>(() => ({ info: kept(), error: null }));
  const closeUnlisted = React.useRef(onUnlisted);
  closeUnlisted.current = onUnlisted;
  React.useEffect(() => {
    const held = attempt === 0 ? kept() : null;
    if (held) { setRead({ info: held, error: null }); return undefined; }
    let live = true;
    const at = settled;
    setRead(r => ({ info: r.info, error: null }));
    sendRef.current<ProjectInfo & { file: string }>('project', { id }).then(
      info => {
        cache.info = { id, settled: at, info };
        if (live) setRead({ info, error: null });
      },
      e => {
        if (!live) return;
        const reason = message(e);
        if (reason === 'That project is not in your list') closeUnlisted.current();
        else setRead({ info: null, error: reason });
      },
    );
    return () => { live = false; };
  }, [id, attempt, settled]);
  const { setInfo } = project;
  React.useEffect(() => {
    setInfo(read.info);
    return () => setInfo(null);
  }, [setInfo, read.info]);
  const back = <Button variant="ghost" size="sm" onClick={() => project.close()}><Icon name="moveLeft" />All projects</Button>;
  if (read.error) return (
    <Column gap="lg" pad="xl">
      <Cluster>{back}</Cluster>
      <Empty title="This project could not be read" description={read.error} action={<Button variant="outline" onClick={() => setAttempt(n => n + 1)}>Try again</Button>} />
    </Column>
  );
  if (!read.info) return (
    <Column gap="lg" pad="xl">
      <Cluster>{back}</Cluster>
      <Text as="p" variant="muted" role="status">Reading the project…</Text>
    </Column>
  );
  return <Workspace info={read.info} file={read.info.file} />;
}
