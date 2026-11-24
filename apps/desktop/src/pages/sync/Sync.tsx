// The Sync page (plan R1): is every plugin of the list in line with every managed harness? A port of the Imago window's pages/sync.ts (commit 5e33a82) on
// Sigrid. On top the note says what the last check found (model.ts `syncHeadline`, in words.ts `noteOf`): the plan of this window while it is of the registry's
// revision, else what the service recorded, else that nothing was checked; never "in sync" for a harness that cannot be read or a source that could not be
// resolved. Under it the sources the last check could not resolve, then the table (SyncTable.tsx), then what is installed outside the list (Unlisted.tsx). The
// action bar (`SyncActions`) sits in the frame's action region (App.tsx): Check now, Review and the one primary action. The page sends nothing itself: what it
// shows is the registry (useRegistry) and the sync state (useSync), and its buttons ask useSync; the dialogs of a plugin, a new plugin and a new harness are
// their own files, and the harness inspector is the frame's (App.tsx), so the table stays usable beside it.
import * as React from 'react';
import { Button, Icon } from '@acaprino/sigrid/primitives';
import { Empty } from '@acaprino/sigrid/components';
import type { Snapshot } from '../../types.ts';
import { syncHeadline } from '../../model.ts';
import { plural } from '../../words.ts';
import { useRegistry } from '../../state/registry.tsx';
import { useSync } from './useSync.tsx';
import { noteOf, timesLine, type NoteTone } from './words.ts';
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
  if (!snapshot) return <p role="status" className="p-4 text-sm text-ink-mute sm:p-6">Reading your registry…</p>;

  const { plugins, targets } = snapshot.registry;
  const noHarness = targets.length === 0, noPlugin = plugins.length === 0;
  const addPlugin = <Button variant="outline" onClick={() => setAddingPlugin(true)}><Icon name="plus" />Add plugin</Button>;
  const addHarness = <Button variant="outline" onClick={() => setAddingHarness(true)}><Icon name="plus" />Add harness</Button>;
  // Each button once on the page: where an empty state offers it, the head does not.
  const listEmpty = noPlugin && !noHarness;
  return (
    <div className="flex w-full min-w-0 flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl font-semibold text-ink">Sync</h1>
          <p className="text-sm text-ink-mute">Rows are your plugins, columns are your harnesses. Muro keeps each harness in line with this table.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {noHarness ? null : addHarness}
          {listEmpty ? null : addPlugin}
        </div>
      </header>
      {noHarness ? (
        <Empty
          className="rounded-md border border-line px-4 py-8"
          title="No harness is managed"
          description="Muro needs at least one harness to install plugins into: add the coding agents whose plugins it keeps in line with your list."
          action={addHarness}
        />
      ) : <SyncNote snapshot={snapshot} />}
      <CheckErrors snapshot={snapshot} />
      {listEmpty ? (
        <Empty className="rounded-md border border-line px-4 py-8" title="Your list is empty" description="Add a plugin by its source, or take one that is already installed from the list below." action={addPlugin} />
      ) : noPlugin ? null : (
        <SyncTable snapshot={snapshot} onOpenPlugin={(id, opener) => { pluginOpener.current = opener; setPlugin({ id, open: true }); }} onOpenHarness={openHarness} />
      )}
      <Unlisted />
      <ReviewSheet />
      {/* One dialog for each plugin opened: another row starts a dialog of its own, with nothing of the last one's form. */}
      {plugin ? <PluginDialog key={plugin.id} pluginId={plugin.id} open={plugin.open} onOpenChange={open => setPlugin(p => (p ? { ...p, open } : p))} restoreFocusTo={pluginOpener} /> : null}
      <AddPluginDialog open={addingPlugin} onOpenChange={setAddingPlugin} />
      <AddHarnessDialog open={addingHarness} onOpenChange={setAddingHarness} />
    </div>
  );
}

const TONE_ICON: Record<NoteTone, 'check' | 'info' | 'alert'> = { ok: 'check', info: 'info', warn: 'alert' };
const TONE_SURFACE: Record<NoteTone, string> = { ok: 'bg-success-soft', info: 'bg-raised', warn: 'bg-warning-soft' };
const TONE_INK: Record<NoteTone, string> = { ok: 'text-success', info: 'text-ink-soft', warn: 'text-warning' };

/** The sync note: what the last check found, in a title and a sentence, and when it was checked, synced and is checked next. The status row repeats it as a chip. */
function SyncNote({ snapshot }: { snapshot: Snapshot }) {
  const sync = useSync();
  const note = noteOf(snapshot, sync.plan, { checking: sync.checking, progress: sync.progress });
  return (
    <section
      id="sync-state"
      data-kind={note.kind}
      aria-labelledby="sync-state-title"
      aria-describedby="sync-state-text"
      className={`flex min-w-0 items-start gap-3 rounded-md border border-line px-4 py-3 ${note.tone ? TONE_SURFACE[note.tone] : 'bg-raised'}`}
    >
      <span className={`mt-0.5 shrink-0 ${note.tone ? TONE_INK[note.tone] : 'text-ink-mute'}`}><Icon name={note.tone ? TONE_ICON[note.tone] : 'refresh'} /></span>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id="sync-state-title" className="break-words text-sm font-semibold text-ink">{note.title}</h2>
        <p id="sync-state-text" className="break-words text-sm text-ink-soft">{note.text}</p>
        <p className="text-xs text-ink-mute">{timesLine(snapshot)}</p>
      </div>
    </section>
  );
}

/** The sources the last check could not resolve, each with the service's words. They stay until the next check. */
function CheckErrors({ snapshot }: { snapshot: Snapshot }) {
  const { errors } = useSync();
  if (!errors.length) return null;
  const nameOf = (id: string): string => snapshot.registry.plugins.find(p => p.id === id)?.name ?? id;
  return (
    <section id="check-errors" aria-labelledby="check-errors-title" className="flex min-w-0 flex-col gap-2 rounded-md border border-line bg-warning-soft px-4 py-3">
      <h2 id="check-errors-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="text-warning"><Icon name="alert" /></span>{plural(errors.length, 'source')} could not be checked
      </h2>
      <ul className="flex flex-col gap-1 text-sm">
        {errors.map((e, i) => (
          <li key={`${e.plugin_id}-${i}`} className="min-w-0 break-words"><span className="font-medium text-ink">{nameOf(e.plugin_id)}</span><span className="text-ink-soft">: {e.message}</span></li>
        ))}
      </ul>
    </section>
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
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
      <Button variant={note.lead ? 'default' : 'outline'} loading={sync.checking} disabled={sync.progress !== null} onClick={() => void sync.check()}>
        <Icon name="refresh" />Check now
      </Button>
      {review || pressed === 'review' ? (
        <Button variant="outline" loading={pressed === 'review'} onClick={() => void run('review', () => sync.openReview())}>Review</Button>
      ) : null}
      {applyAll ? (
        <Button variant="default" loading={pressed === 'apply'} onClick={() => void run('apply', () => sync.applyAll())}>{allLabel.current}</Button>
      ) : null}
    </div>
  );
}
