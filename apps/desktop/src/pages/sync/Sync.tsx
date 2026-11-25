// The Sync page (plan R1): is every plugin of the list in line with every managed harness? A port of the Imago window's pages/sync.ts (commit 5e33a82) on
// Sigrid. On top the note says what the last check found (model.ts `syncHeadline`, in words.ts `noteOf`): the plan of this window while it is of the registry's
// revision, else what the service recorded, else that nothing was checked; never "in sync" for a harness that cannot be read or a source that could not be
// resolved. Under it the sources the last check could not resolve, then the table (SyncTable.tsx), then what is installed outside the list (Unlisted.tsx). The
// action bar (`SyncActions`) sits in the frame's action region (App.tsx): Check now, Review and the one primary action. The page sends nothing itself: what it
// shows is the registry (useRegistry) and the sync state (useSync), and its buttons ask useSync; the dialogs of a plugin, a new plugin and a new harness are
// their own files, and the harness inspector is the frame's (App.tsx), so the table stays usable beside it.
import * as React from 'react';
import { Button, Card, Cluster, Column, Heading, Icon, Split, Text } from '@acaprino/sigrid/primitives';
import { Empty, Note } from '@acaprino/sigrid/components';
import type { Snapshot } from '../../types.ts';
import { harnessWarnings, syncHeadline } from '../../model.ts';
import { plural } from '../../words.ts';
import { useRegistry } from '../../state/registry.tsx';
import { useSync } from './useSync.tsx';
import { nameList, noteOf, timesLine, type NoteTone } from './words.ts';
import { SyncTable } from './SyncTable.tsx';
import { ReviewSheet } from './ReviewSheet.tsx';
import { PluginDialog } from './PluginDialog.tsx';
import { AddPluginDialog } from './AddPluginDialog.tsx';
import { AddHarnessDialog } from './AddHarnessDialog.tsx';
import { Unlisted } from './Unlisted.tsx';

export interface SyncProps {
  /** Opens a harness in the window's inspector, which the frame holds (App.tsx); `opener` is the button focus goes back to when it closes. */
  openHarness(targetId: string, opener: HTMLElement | null): void;
}

export function Sync({ openHarness }: SyncProps) {
  const { snapshot } = useRegistry();
  // The plugin whose dialog is open, kept while it closes, and the row it was opened from, where focus goes back.
  const [plugin, setPlugin] = React.useState<{ id: string; open: boolean } | null>(null);
  const pluginOpener = React.useRef<HTMLElement | null>(null);
  const [addingPlugin, setAddingPlugin] = React.useState(false);
  const [addingHarness, setAddingHarness] = React.useState(false);
  if (!snapshot) return <Column pad="xl"><Text as="p" variant="muted" role="status">Reading your registry…</Text></Column>;

  const { plugins, targets } = snapshot.registry;
  const noHarness = targets.length === 0, noPlugin = plugins.length === 0;
  const addPlugin = <Button variant="outline" onClick={() => setAddingPlugin(true)}><Icon name="plus" />Add plugin</Button>;
  const addHarness = <Button variant="outline" onClick={() => setAddingHarness(true)}><Icon name="plus" />Add harness</Button>;
  // Each button once on the page: where an empty state offers it, the head does not.
  const listEmpty = noPlugin && !noHarness;
  return (
    <Column gap="lg" pad="xl">
      <Split>
        <Column gap="xs">
          <Heading level={1}>Sync</Heading>
          <Text as="p" variant="muted">Rows are your plugins, columns are your harnesses. Muro keeps each harness in line with this table.</Text>
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
      <CheckErrors snapshot={snapshot} />
      <HarnessWarnings snapshot={snapshot} />
      {listEmpty ? (
        <Card variant="quiet" pad="xl">
          <Empty title="Your list is empty" description="Add a plugin by its source, or take one that is already installed from the list below." action={addPlugin} />
        </Card>
      ) : noPlugin ? null : (
        <SyncTable snapshot={snapshot} onOpenPlugin={(id, opener) => { pluginOpener.current = opener; setPlugin({ id, open: true }); }} onOpenHarness={openHarness} />
      )}
      <Unlisted />
      <ReviewSheet />
      {/* One dialog for each plugin opened: another row starts a dialog of its own, with nothing of the last one's form. */}
      {plugin ? <PluginDialog key={plugin.id} pluginId={plugin.id} open={plugin.open} onOpenChange={open => setPlugin(p => (p ? { ...p, open } : p))} restoreFocusTo={pluginOpener} /> : null}
      <AddPluginDialog open={addingPlugin} onOpenChange={setAddingPlugin} />
      <AddHarnessDialog open={addingHarness} onOpenChange={setAddingHarness} />
    </Column>
  );
}

const TONE: Record<NoteTone, 'success' | 'info' | 'warning'> = { ok: 'success', info: 'info', warn: 'warning' };

/** The sync note: what the last check found, in a title and a sentence, and when it was checked, synced and is checked next. The status row repeats it as a chip, and is what is announced. */
function SyncNote({ snapshot }: { snapshot: Snapshot }) {
  const sync = useSync();
  const note = noteOf(snapshot, sync.plan, { checking: sync.checking, progress: sync.progress });
  return (
    <Note id="sync-state" data-kind={note.kind} tone={note.tone ? TONE[note.tone] : 'info'} announce={false} title={<Text id="sync-state-title">{note.title}</Text>}>
      <Column gap="xs">
        <Text id="sync-state-text">{note.text}</Text>
        <Text variant="note">{timesLine(snapshot)}</Text>
      </Column>
    </Note>
  );
}

/** The sources the last check could not resolve, each with the service's words. They stay until the next check. */
function CheckErrors({ snapshot }: { snapshot: Snapshot }) {
  const { errors } = useSync();
  if (!errors.length) return null;
  const nameOf = (id: string): string => snapshot.registry.plugins.find(p => p.id === id)?.name ?? id;
  return (
    <Note
      id="check-errors"
      tone="warning"
      announce={false}
      title={<Text>{plural(errors.length, 'source')} could not be checked</Text>}
      items={errors.map(e => <><Text variant="strong">{nameOf(e.plugin_id)}</Text>: {e.message}</>)}
    />
  );
}

/** What a harness holds that it cannot load itself (model.ts `harnessWarnings`: a marketplace of Codex whose folder is gone), in the service's words. Muro read around it, so the
 * harness is listed and managed and the sync note says its state; this says what to repair there, and stays until a check no longer finds it. */
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
      <Text>Muro read what is installed there from the harness's own files, and still installs, updates and removes its plugins. Repair or remove the entry in the harness to clear this.</Text>
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
