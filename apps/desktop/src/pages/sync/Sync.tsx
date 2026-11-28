// The Sync page (plan R1): is every plugin of the list in line with every managed harness? A port of the Imago window's pages/sync.ts (commit 5e33a82) on
// Sigrid. On top the note says what the last check found (model.ts `syncHeadline`, in words.ts `noteOf`): the plan of this window while it is of the registry's
// revision, else what the service recorded, else that nothing was checked; never "in sync" for a harness that cannot be read or a source that could not be
// resolved. Under it the sources the last check could not resolve, then the table (SyncTable.tsx), then what is installed outside the list (Unlisted.tsx). The
// action bar (`SyncActions`) sits in the frame's action region (App.tsx): Check now, Review and the one primary action. The page sends nothing itself: what it
// shows is the registry (useRegistry) and the sync state (useSync), and its buttons ask useSync; the dialogs of a plugin, a new plugin and a new harness are
// their own files, and the harness inspector is the frame's (App.tsx), so the table stays usable beside it.
import * as React from 'react';
import { Button, Card, Cluster, Column, Count, Heading, Icon, Section, Split, Text } from '@acaprino/sigrid/primitives';
import { Empty, Note, SettingRow } from '@acaprino/sigrid/components';
import type { Snapshot } from '../../types.ts';
import { harnessWarnings, syncHeadline } from '../../model.ts';
import { plural } from '../../words.ts';
import { useRegistry } from '../../state/registry.tsx';
import { indexProjectPlugins } from '../project/write/jobs.ts';
import { useCheckProgress, useSync } from './useSync.tsx';
import { nameList, noteOf, type NoteTone } from './words.ts';
import { SyncTable } from './SyncTable.tsx';
import { ReviewSheet } from './ReviewSheet.tsx';
import { PluginDialog } from './PluginDialog.tsx';
import { AddPluginDialog } from './AddPluginDialog.tsx';
import { AddHarnessDialog } from './AddHarnessDialog.tsx';
import { Unlisted } from './Unlisted.tsx';

export type SyncEntry = { pluginId: string } | { source: string; name: string };
export interface SyncProps {
  /** Opens a harness in the window's inspector, which the frame holds (App.tsx); `opener` is the button focus goes back to when it closes. */
  openHarness(targetId: string, opener: HTMLElement | null): void;
  entry?: SyncEntry;
}

export function Sync({ openHarness, entry }: SyncProps) {
  const { snapshot } = useRegistry();
  // The plugin whose dialog is open, kept while it closes, and the row it was opened from, where focus goes back.
  const [plugin, setPlugin] = React.useState<{ id: string; open: boolean } | null>(() => entry && 'pluginId' in entry ? { id: entry.pluginId, open: true } : null);
  const pluginOpener = React.useRef<HTMLElement | null>(null);
  const [initialSource, setInitialSource] = React.useState(() => entry && 'source' in entry ? entry : undefined);
  const [addingPlugin, setAddingPlugin] = React.useState(!!initialSource);
  const [addingHarness, setAddingHarness] = React.useState(false);
  const registry = snapshot?.registry;
  const availableProjects = React.useMemo(() => {
    if (!registry?.projects?.length) return [];
    const findPlugin = indexProjectPlugins(registry.plugins);
    return registry.projects.filter(project => !findPlugin(project));
  }, [registry]);
  if (!snapshot) return <Column pad="xl"><Text as="p" variant="muted" role="status">Reading your registry…</Text></Column>;

  const { plugins, targets } = snapshot.registry;
  const noHarness = targets.length === 0, noPlugin = plugins.length === 0;
  const addPlugin = <Button variant="outline" onClick={() => { setInitialSource(undefined); setAddingPlugin(true); }}><Icon name="plus" />Add plugin</Button>;
  const addHarness = <Button variant="outline" onClick={() => setAddingHarness(true)}><Icon name="plus" />Add harness</Button>;
  // Each button once on the page: where an empty state offers it, the head does not.
  const listEmpty = noPlugin && !noHarness && availableProjects.length === 0;
  return (
    <Column gap="lg" pad="xl">
      <Split>
        <Column gap="xs">
          <Heading level={1}>Sync</Heading>
          <Text as="p" variant="muted">Your plugins on each harness you use.</Text>
        </Column>
        <Cluster>
          {noHarness ? null : addHarness}
          {listEmpty ? null : addPlugin}
        </Cluster>
      </Split>
      {noHarness ? (
        <Card variant="quiet" pad="xl">
          <Empty
            title="No harness is managed"
            description="Muro needs at least one harness to install plugins into: add the coding agents whose plugins it keeps in line with your list."
            action={addHarness}
          />
        </Card>
      ) : <SyncNote snapshot={snapshot} />}
      <HarnessWarnings snapshot={snapshot} />
      {availableProjects.length > 0 ? (
        <Section title="Install from a project">
          <Column as="ul" gap="xs">
            {availableProjects.map(project => {
              const filename = project.path.split(/[\\/]/).pop() || project.id;
              return <li key={project.id}><SettingRow
                label={<Text variant="strong">{filename}</Text>}
                description={<Text truncate title={project.path}>{project.path}</Text>}
                control={<Button variant="outline" aria-label={`Choose harnesses for ${filename}`} onClick={() => {
                  setInitialSource({ source: project.path, name: filename.replace(/\.mp$/i, '') });
                  setAddingPlugin(true);
                }}>Choose harnesses…</Button>}
              /></li>;
            })}
          </Column>
        </Section>
      ) : null}
      {/* Two parts of equal rank, each named, with the space between sections that the space inside each does not reach: your list, and what is installed outside it. */}
      <Column gap="3xl">
        {listEmpty ? (
          <Card variant="quiet" pad="xl">
            <Empty title="Your list is empty" description="Add a plugin by its source, or take one that is already installed from the list below." action={addPlugin} />
          </Card>
        ) : noPlugin ? null : (
          <Section title="Your plugins" icon={<Icon name="package" />} end={<Count value={plugins.length} label={plugins.length === 1 ? 'plugin' : 'plugins'} />}>
            <SyncTable snapshot={snapshot} onOpenPlugin={(id, opener) => { pluginOpener.current = opener; setPlugin({ id, open: true }); }} onOpenHarness={openHarness} />
          </Section>
        )}
        <Unlisted />
      </Column>
      <ReviewSheet />
      {/* One dialog for each plugin opened: another row starts a dialog of its own, with nothing of the last one's form. */}
      {plugin ? <PluginDialog key={plugin.id} pluginId={plugin.id} open={plugin.open} onOpenChange={open => setPlugin(p => (p ? { ...p, open } : p))} restoreFocusTo={pluginOpener} /> : null}
      <AddPluginDialog open={addingPlugin} onOpenChange={setAddingPlugin} initial={initialSource} />
      <AddHarnessDialog open={addingHarness} onOpenChange={setAddingHarness} />
    </Column>
  );
}

const TONE: Record<NoteTone, 'success' | 'info' | 'warning'> = { ok: 'success', info: 'info', warn: 'warning' };

/** The sync note: what the last check found, in a title and a sentence, and under it the sources the last check could not resolve, each with the service's words (they stay until the
 * next check; the sentence already counts them). When it was checked, synced and is checked next is the status row's, over it. */
function SyncNote({ snapshot }: { snapshot: Snapshot }) {
  const sync = useSync();
  const progress = useCheckProgress();
  const note = noteOf(snapshot, sync.plan, { checking: sync.checking, progress: sync.progress });
  const detail = progress?.phase === 'source'
    ? `Checking source ${progress.index} of ${progress.total} · ${progress.name}`
    : progress?.phase === 'plan' ? 'Reading installed plugins and preparing changes.' : note.text;
  const nameOf = (id: string): string => snapshot.registry.plugins.find(p => p.id === id)?.name ?? id;
  const errors = sync.checking ? [] : sync.errors;
  return (
    <Note id="sync-state" data-kind={note.kind} tone={note.tone ? TONE[note.tone] : 'info'} announce={false} title={<Text id="sync-state-title">{note.title}</Text>}
      items={errors.length ? errors.map(e => <><Text variant="strong">{nameOf(e.plugin_id)}</Text>: {e.message}</>) : undefined}>
      <Text id="sync-state-text" aria-live={sync.checking ? 'polite' : 'off'}>{detail}</Text>
    </Note>
  );
}

/** What a harness holds that it cannot load itself (model.ts `harnessWarnings`: a marketplace of Codex whose folder is gone), in the service's words. Muro read around it, so the
 * harness is listed and managed and the sync note says its state. The plan holds the repair (a marketplace that is not in the list is removed, a plugin of the list is installed again); this stays until a check no longer finds it. */
function HarnessWarnings({ snapshot }: { snapshot: Snapshot }) {
  const warnings = harnessWarnings(snapshot);
  if (!warnings.length) return null;
  const names = [...new Set(warnings.map(w => w.target.name))];
  return (
    <Note
      id="harness-warnings"
      tone="warning"
      announce={false}
      title={<Text>{nameList(names)} {names.length > 1 ? 'hold' : 'holds'} {warnings.length > 1 ? 'entries' : 'an entry'} that cannot be loaded</Text>}
      items={warnings.map(w => <><Text variant="strong">{w.target.name}</Text>: {w.message}</>)}
    >
      <Text>Muro read what is installed there from the harness's own files, and still installs, updates and removes its plugins. The next sync repairs it: what is not in your list is removed from the harness, and what is in your list is installed again.</Text>
    </Note>
  );
}

/** The action bar of Sync, in the frame's action region (App.tsx): Check now always, then what the note offers. One solid button at most: Check now when checking
 * is what to do next, Apply all when changes are ready. Review and Apply all each make a fresh plan first (useSync); Apply all applies it at once only when it is the
 * plan the note showed and holds no blocker and no removal, else the review sheet opens. While an apply runs, Check now waits and nothing else is offered. */
export function SyncActions() {
  const { snapshot } = useRegistry();
  const sync = useSync();
  // The button whose request runs, so it says it waits and keeps the focus.
  const [pressed, setPressed] = React.useState<'review' | 'apply' | null>(null);
  // The words of Apply all while it runs: the note no longer says changes then.
  const allLabel = React.useRef('');
  if (!snapshot) return null;
  const note = noteOf(snapshot, sync.plan, { checking: sync.checking, progress: sync.progress });
  const headline = syncHeadline(snapshot, sync.plan);
  if (note.kind === 'changes') allLabel.current = `Apply all ${plural(headline.operations, 'change')}`;
  const review = note.kind === 'changes' || note.kind === 'blocked' || (note.kind === 'sources' && headline.blockers > 0);
  const applyAll = note.kind === 'changes' || pressed === 'apply';

  async function run(which: 'review' | 'apply', work: () => Promise<void>): Promise<void> {
    setPressed(which);
    try { await work(); } finally { setPressed(null); }
  }

  return (
    <Cluster justify="end">
      <Button variant={note.lead ? 'default' : 'outline'} loading={sync.checking} disabled={sync.progress !== null} onClick={() => void sync.check()}>
        <Icon name="refresh" />Check now
      </Button>
      {review || pressed === 'review' ? (
        <Button variant="outline" loading={pressed === 'review'} onClick={() => void run('review', () => sync.openReview())}>Review</Button>
      ) : null}
      {applyAll ? (
        <Button variant="default" loading={pressed === 'apply'} onClick={() => void run('apply', () => sync.applyAll())}>{allLabel.current}</Button>
      ) : null}
    </Cluster>
  );
}
