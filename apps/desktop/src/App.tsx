// The window: Imago's (`AppWindow`), with the four pages as its views, the status row, the page of the view, and the foot. On Sync it
// also holds the page's action bar and the harness inspector, beside the table.
// The pages that are not in the new window yet say so (pages/Moved.tsx); the window opens on Sync.
import { useCallback, useRef, useState } from 'react';
import { AppWindow, ScreenBoundary, focusContent, type AppView } from '@acaprino/imago';
import { useMedia } from '@acaprino/sigrid';
import { Badge, Button, Icon, Spacer, Text } from '@acaprino/sigrid/primitives';
import { Empty } from '@acaprino/sigrid/components';
import { useCommand } from '@acaprino/sigrid/assemblies';
import type { Page, Snapshot } from './types.ts';
import { stamp, syncHeadline } from './model.ts';
import { plural } from './words.ts';
import { useRegistry } from './state/registry.tsx';
import { ProjectJobsProvider } from './pages/project/write/useJobs.tsx';
import { SyncProvider, useSync } from './pages/sync/useSync.tsx';
import { checkedLine, chipOf } from './pages/sync/words.ts';
import { Sync, SyncActions } from './pages/sync/Sync.tsx';
import { HarnessInspector } from './pages/sync/HarnessInspector.tsx';
import { Moved } from './pages/Moved.tsx';
import { Projects } from './pages/Projects.tsx';

/** The four pages, in the order of the bar. */
const PAGES: readonly AppView<Page>[] = [
  { id: 'projects', label: 'Projects', command: 'Go to Projects', icon: 'structure' },
  { id: 'sync', label: 'Sync', command: 'Go to Sync', icon: 'refresh' },
  { id: 'activity', label: 'Activity', command: 'Go to Activity', icon: 'history' },
  { id: 'settings', label: 'Settings', command: 'Go to Settings', icon: 'settings' },
];

/** The status row: the state of the sync in a few words, when it was checked and when it is next (the record the service keeps; a narrow window has no room for it), and how many harnesses are managed.
 * The state is the sync state of the window (useSync): a check or an apply under way says so; else the plan this window made, which counts only for the registry revision it was made for, and with
 * none what the service recorded. */
function StatusLine({ snapshot, error }: { snapshot: Snapshot | null; error: string | null }) {
  const sync = useSync();
  const narrow = useMedia('(width < 620px)');
  if (!snapshot) return <Text>{error ? 'Registry not available' : 'Reading your registry…'}</Text>;
  const chip = chipOf(syncHeadline(snapshot, sync.plan));
  const doing = sync.progress ? `Applying ${plural(sync.progress.total, 'change')}…` : sync.checking ? 'Checking…' : null;
  return (
    <>
      <Badge tone={doing ? 'info' : chip.tone === 'ok' ? 'success' : 'warning'}>{doing ?? chip.text}</Badge>
      {narrow ? null : <Text>{checkedLine(snapshot)}</Text>}
      <Spacer />
      <Text>{plural(snapshot.registry.targets.length, 'harness', 'harnesses')}</Text>
    </>
  );
}

/** The foot: the automatic sync, the last sync and the size of the list. */
const footLine = (snapshot: Snapshot): string =>
  `Automatic sync ${snapshot.registry.settings.auto_sync ? 'on' : 'off'} · last sync ${stamp(snapshot.sync.last_sync)} · ${plural(snapshot.registry.plugins.length, 'plugin')} in your list`;

/** The window with the page of the view. */
function Muro() {
  const { snapshot, error, reload } = useRegistry();
  const { busy, check } = useSync();
  const [page, setPage] = useState<Page>('sync');
  // The harness open in the inspector (Sync's column heads open it), kept while it closes, and the button it was opened from, where focus goes back.
  const [harness, setHarness] = useState<{ id: string; open: boolean } | null>(null);
  const harnessOpener = useRef<HTMLElement | null>(null);
  const openHarness = useCallback((id: string, opener: HTMLElement | null) => {
    harnessOpener.current = opener;
    setHarness({ id, open: true });
  }, []);
  const harnessOpenChange = useCallback((open: boolean) => {
    setHarness(now => (now ? { ...now, open } : now));
    if (open) return;
    // Once the frame has drawn it closed: back to its column, or, for a harness Muro no longer manages (its column is gone), to the content. Only when the focus was lost
    // with it (on the page's body, in the inspector, or in a question asked over it): a press elsewhere that closed the drawer keeps the focus it gave.
    setTimeout(() => {
      const now = document.activeElement;
      if (now && now !== document.body && !now.closest('[data-inspector-form], [role="dialog"], [role="alertdialog"]')) return;
      const back = harnessOpener.current;
      if (back?.isConnected) back.focus();
      else focusContent();
    }, 0);
  }, []);
  const go = useCallback((to: Page) => {
    setPage(to);
    // The inspector is Sync's: another page closes it.
    if (to !== 'sync') setHarness(null);
  }, []);
  // From any page: the status row says what it found. Dimmed while another request about the sync runs.
  useCommand({ id: 'muro.check', label: 'Check now', group: 'Sync', keywords: 'sync refresh', icon: <Icon name="refresh" />, when: !busy, run: () => { void check(); } });

  const onSync = page === 'sync';
  return (
    <AppWindow
      views={PAGES}
      view={page}
      onView={go}
      status={<StatusLine snapshot={snapshot} error={error} />}
      footer={snapshot ? <Text>{footLine(snapshot)}</Text> : undefined}
      // Sync's action bar and harness inspector are regions of the frame: the bar under the content, the inspector beside it (docked from 1000px, a drawer under).
      actions={onSync && snapshot ? <SyncActions /> : undefined}
      inspector={onSync && harness ? (
        // One inspector for every harness: another column changes its `targetId`, and the inspector decides what becomes of a form with changes.
        <ScreenBoundary of={harness.id}>
          <HarnessInspector targetId={harness.id} open={harness.open} onOpenChange={harnessOpenChange} />
        </ScreenBoundary>
      ) : undefined}
    >
      {!snapshot && error ? (
        <Empty fill title="Registry not available" description={error} action={<Button onClick={() => { void reload(); }}>Try again</Button>} />
      ) : page === 'projects' ? <Projects /> : onSync ? <Sync openHarness={openHarness} /> : <Moved page={page === 'activity' ? 'Activity' : 'Settings'} />}
    </AppWindow>
  );
}

/** The window, with the sync state (`useSync`) and the AI runs of the runtime (`useJobs`) available to every page of it. */
export function App() {
  return <SyncProvider><ProjectJobsProvider><Muro /></ProjectJobsProvider></SyncProvider>;
}
