// The window: Sigrid's frame (`AppShell`) with the title bar (Muro's mark and name, the four pages as tabs, the button
// of the command palette and the window's three buttons), the status row, the page of the tab, and the footer. On Sync the
// frame also holds the page's action bar and the harness inspector, beside the table.
// The pages that are not in the new window yet say so (pages/Moved.tsx); the window opens on Sync, as before.
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { NARROW, useMedia } from '@acaprino/sigrid';
import { Button, Icon, type IconName } from '@acaprino/sigrid/primitives';
import { Empty } from '@acaprino/sigrid/components';
import {
  AppShell, TitleBar, Toolbar, ToolbarBrand, ToolbarButton, ToolbarSpacer, ToolbarTab, ToolbarTabs, WindowControls, type TitleBarDragProps,
} from '@acaprino/sigrid/layout';
import { CommandPalette, useCommandKey, type Command } from '@acaprino/sigrid/assemblies';
import type { Page, Snapshot } from './types.ts';
import { stamp, syncHeadline } from './model.ts';
import { plural } from './words.ts';
import { useRegistry } from './state/registry.tsx';
import { useNotify } from './state/notices.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { ProjectJobsProvider } from './pages/project/write/useJobs.tsx';
import { SyncProvider, useSync } from './pages/sync/useSync.tsx';
import { checkedLine, chipOf } from './pages/sync/words.ts';
import { Sync, SyncActions } from './pages/sync/Sync.tsx';
import { HarnessInspector } from './pages/sync/HarnessInspector.tsx';
import { Moved } from './pages/Moved.tsx';
import { Projects } from './pages/Projects.tsx';
import { THEME_LABELS, otherChoices } from './theme.ts';
import { paintScheme, useScheme } from './sigridTheme.ts';
import { useWindowFrame, useWindowTheme } from './window.ts';

/** The four pages, in the order of the tabs, with the icon of each (R6 of Sigrid's rules: every place has one). */
const PAGES: readonly { id: Page; label: string; icon: IconName }[] = [
  { id: 'projects', label: 'Projects', icon: 'structure' },
  { id: 'sync', label: 'Sync', icon: 'refresh' },
  { id: 'activity', label: 'Activity', icon: 'history' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
/** The mark of the parts of the bar that move the window: Tauri drags from an element that carries it. */
const DRAG: TitleBarDragProps = { 'data-tauri-drag-region': '' };
/** Sigrid draws a window button only for an action it is given; the click is the window glue's (window.ts), so these do nothing. */
const inert = (): void => {};

/** The status row: the state of the sync in a few words (the chip of the Imago window), when it was checked and when it is next (the record the service keeps), and how many harnesses are managed.
 * The state is the sync state of the window (useSync): a check or an apply under way says so; else the plan this window made, which counts only for the registry revision it was made for, and with
 * none what the service recorded. */
function StatusLine({ snapshot, error }: { snapshot: Snapshot | null; error: string | null }) {
  const sync = useSync();
  if (!snapshot) return <span>{error ? 'Registry not available' : 'Reading your registry…'}</span>;
  const checked = checkedLine(snapshot);
  const chip = chipOf(syncHeadline(snapshot, sync.plan));
  const doing = sync.progress ? `Applying ${plural(sync.progress.total, 'change')}…` : sync.checking ? 'Checking…' : null;
  const ink = doing ? 'text-ink-mute' : chip.tone === 'ok' ? 'text-success' : 'text-warning';
  return (
    <>
      <span className="inline-flex shrink-0 items-center gap-1 font-medium text-ink-soft">
        <span className={ink}><Icon name={doing ? 'refresh' : chip.tone === 'ok' ? 'check' : 'alert'} /></span>{doing ?? chip.text}
      </span>
      <span className="min-w-0 truncate" title={checked}>{checked}</span>
      <span className="flex-1" />
      <span className="shrink-0">{plural(snapshot.registry.targets.length, 'harness', 'harnesses')}</span>
    </>
  );
}

/** The footer: the automatic sync, the last sync and the size of the list, and the key of the palette. */
function FooterLine({ snapshot }: { snapshot: Snapshot | null }) {
  const text = snapshot ? `Automatic sync ${snapshot.registry.settings.auto_sync ? 'on' : 'off'} · last sync ${stamp(snapshot.sync.last_sync)} · ${plural(snapshot.registry.plugins.length, 'plugin')} in your list` : '';
  return (
    <>
      <span className="min-w-0 truncate" title={text}>{text}</span>
      <span className="flex-1" />
      <span className="shrink-0">Commands Ctrl K</span>
    </>
  );
}

function PageTabs({ page, go }: { page: Page; go: (value: string) => void }) {
  return (
    <ToolbarTabs aria-label="Pages" value={page} onValueChange={go}>
      {PAGES.map(p => <ToolbarTab key={p.id} value={p.id} icon={<Icon name={p.icon} />}>{p.label}</ToolbarTab>)}
    </ToolbarTabs>
  );
}

/** The window: the frame, the page of the tab and the surfaces over it. */
function AppFrame() {
  const { snapshot, error, reload } = useRegistry();
  const sync = useSync();
  const { choice, resolved, set: setChoice } = useScheme();
  const [page, setPage] = useState<Page>('sync');
  const [palette, setPalette] = useState(false);
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
      else document.querySelector<HTMLElement>('main[data-slot="app-shell-content"]')?.focus();
    }, 0);
  }, []);
  const bar = useRef<HTMLElement>(null);
  // Under 860px (Sigrid's `NARROW`) the bar has no room for the tabs beside the brand and the palette's button: they go
  // to the row under it, across the whole window, with their words.
  const narrow = useMedia(NARROW);

  // What the window glue could not do (a button, the zoom) is an error in the window's one stack of notices (mount.tsx).
  const notify = useNotify();
  const windowError = useCallback((text: string) => notify(text, 'error'), [notify]);
  const frame = useWindowFrame(bar, windowError);
  useWindowTheme(choice, resolved);
  // Before the frame is painted: the page never shows another theme first.
  useLayoutEffect(() => { paintScheme(document.documentElement, resolved); }, [resolved]);
  useCommandKey(() => setPalette(true));

  const go = useCallback((value: string) => {
    const to = PAGES.find(p => p.id === value);
    if (!to) return;
    setPage(to.id);
    // The inspector is Sync's: another page closes it.
    if (to.id !== 'sync') setHarness(null);
  }, []);
  const current = PAGES.find(p => p.id === page) ?? PAGES[1]!;

  const { busy, check } = sync;
  const commands = useMemo<Command[]>(() => [
    // From any page: the status row says what it found. Dimmed while another request about the sync runs.
    { id: 'check', label: 'Check now', keywords: 'sync refresh', disabled: busy, onSelect: () => { void check(); } },
    ...PAGES.map(p => ({ id: `go-${p.id}`, label: p.label, group: 'Go to', keywords: 'go open page', icon: <Icon name={p.icon} />, onSelect: () => go(p.id) })),
    ...otherChoices(choice).map(other => ({ id: `theme-${other}`, label: THEME_LABELS[other], group: 'Appearance', keywords: 'theme appearance', onSelect: () => setChoice(other) })),
  ], [go, choice, setChoice, busy, check]);

  const titleBar = (
    <TitleBar
      ref={bar}
      dragProps={DRAG}
      windowControls={<WindowControls maximized={frame.maximized} maximizeState={frame.maximizeState} onMinimize={inert} onMaximizeToggle={inert} onClose={inert} />}
    >
      <Toolbar aria-label="Muro">
        <ToolbarBrand name="Muro" />
        {narrow ? null : <PageTabs page={page} go={go} />}
        <ToolbarSpacer />
        <ToolbarButton label="Commands" shortcut="Ctrl K" icon={<Icon name="now" />} onClick={() => setPalette(true)}>Commands</ToolbarButton>
      </Toolbar>
    </TitleBar>
  );
  // In the row under the bar the tabs scroll sideways where even it is too narrow (a window at 200% zoom), never the page.
  const tabsRow = narrow ? <Toolbar aria-label="Views" className="overflow-x-auto"><PageTabs page={page} go={go} /></Toolbar> : undefined;
  // Sync's action bar and harness inspector are regions of the frame: the bar under the content, the inspector beside it (docked from 1000px, a drawer under).
  const onSync = current.id === 'sync';

  return (
    // As tall as the window by itself (Sigrid 4.3's `--app-height`): nothing sets a height around it.
    <AppShell
      desktop
      contentLabel={current.label}
      titleBar={titleBar}
      tabs={tabsRow}
      status={<StatusLine snapshot={snapshot} error={error} />}
      footer={<FooterLine snapshot={snapshot} />}
      actions={onSync && snapshot ? <SyncActions /> : undefined}
      inspector={onSync && harness ? (
        // One inspector for every harness: another column changes its `targetId`, and the inspector decides what becomes of a form with changes.
        <ErrorBoundary>
          <HarnessInspector targetId={harness.id} open={harness.open} onOpenChange={harnessOpenChange} />
        </ErrorBoundary>
      ) : undefined}
    >
      {/* A page that fails while it is drawn says so in its own place; the frame, the palette and the notices stay. Another tab starts it afresh. */}
      <ErrorBoundary key={current.id}>
        {!snapshot && error ? (
          <Empty
            className="h-full px-4 py-6"
            title="Registry not available"
            description={error}
            action={<Button onClick={() => { void reload(); }}>Try again</Button>}
          />
        ) : current.id === 'projects' ? <Projects /> : onSync ? <Sync openHarness={openHarness} /> : <Moved page={current.label} />}
      </ErrorBoundary>
      <CommandPalette open={palette} onOpenChange={setPalette} commands={commands} label="Search commands" />
    </AppShell>
  );
}

/** The window, with the sync state (`useSync`) and the AI runs of the runtime (`useJobs`) available to every page of it. */
export function App() {
  return <SyncProvider><ProjectJobsProvider><AppFrame /></ProjectJobsProvider></SyncProvider>;
}
