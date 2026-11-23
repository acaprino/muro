// The table of the Sync page: a row per plugin of the list, a column per managed harness. A port of the Imago window's `table`, `rows`, `cell` and `hstate`
// (pages/sync.ts of commit 5e33a82) on Sigrid's table parts. What a cell or a column says is model.ts's (`cellState`, `harnessState`), read with the plan of this
// window (useSync), which counts only for the registry revision it was made for: with none the cells say what the snapshot shows, and a column that the recorded
// check says has changes, with nothing of its own to show, says to check. A cell never reads as in sync for a harness that cannot be read or a plugin without a build.
// The name of a plugin opens its dialog and the name of a harness its inspector (the page decides where they open); "Sync N changes" under a harness opens the review
// sheet on the plan of that harness alone. The rows are one tab stop: the arrows, Home and End move between them.
import * as React from 'react';
import { Badge, Button, Icon, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@acaprino/sigrid';
import type { Plan, Plugin, Snapshot, Target } from '../../types.ts';
import { cellState, harnessState, stamp, versionOf, type CellStatus } from '../../model.ts';
import { plural } from '../../words.ts';
import { useSync } from './useSync.tsx';

/** The update policy of a plugin, as its row says it under the version. */
const POLICY: Record<string, string> = { stable: 'Latest release', pinned: 'Pinned version', head: 'Latest commit' };
/** "1 plugin needs a build", "2 plugins need a build". */
const needBuild = (n: number): string => `${plural(n, 'plugin')} need${n === 1 ? 's' : ''} a build`;

export interface SyncTableProps {
  snapshot: Snapshot;
  /** A plugin's name was pressed: its dialog opens. */
  onOpenPlugin(pluginId: string): void;
  /** A harness's name was pressed: its inspector opens, and focus comes back to `opener` when it closes. */
  onOpenHarness(targetId: string, opener: HTMLElement | null): void;
}

export function SyncTable({ snapshot, onOpenPlugin, onOpenHarness }: SyncTableProps) {
  const sync = useSync();
  const { plugins, targets } = snapshot.registry;
  // The row that holds the tab stop: the last one focused, or the first.
  const [active, setActive] = React.useState<string | null>(null);
  const current = plugins.some(p => p.id === active) ? active : plugins[0]?.id ?? null;
  // The harness whose own plan is being asked for ("Sync N changes"), so its button says it waits.
  const [asking, setAsking] = React.useState<string | null>(null);

  async function reviewHarness(targetId: string): Promise<void> {
    setAsking(targetId);
    try { await sync.openReview({ targetId }); } finally { setAsking(null); }
  }

  /** Up and Down move to the row above or below, Home and End to the first and the last; the focus stays on the names. */
  function move(event: React.KeyboardEvent<HTMLTableSectionElement>): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-row-button]'));
    const at = buttons.findIndex(b => b === document.activeElement);
    if (at < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.min(buttons.length - 1, Math.max(0, at + (event.key === 'ArrowDown' ? 1 : -1)));
    buttons[next]?.focus();
  }

  return (
    <Table id="sync-table" aria-label="Your plugins on your harnesses" containerClassName="rounded-md border border-line">
      <TableHeader>
        <TableRow>
          <TableHead className="py-2 align-top">
            <span className="block">Plugin</span>
            <span className="block font-normal">{plural(plugins.length, 'plugin')} in your list</span>
          </TableHead>
          <TableHead className="py-2 align-top">
            <span className="block">Latest version</span>
            <span className="block font-normal">Checked {stamp(snapshot.sync.last_check)}</span>
          </TableHead>
          {targets.map(t => (
            <HarnessHead key={t.id} target={t} snapshot={snapshot} plan={sync.plan} asking={asking === t.id} onOpen={onOpenHarness} onReview={id => void reviewHarness(id)} />
          ))}
        </TableRow>
      </TableHeader>
      <TableBody id="rows" onKeyDown={move}>
        {plugins.map(p => (
          <PluginRow key={p.id} plugin={p} targets={targets} snapshot={snapshot} plan={sync.plan} tabStop={p.id === current} onFocusRow={setActive} onOpen={onOpenPlugin} />
        ))}
      </TableBody>
    </Table>
  );
}

interface HarnessHeadProps {
  target: Target;
  snapshot: Snapshot;
  plan: Plan | null;
  asking: boolean;
  onOpen(targetId: string, opener: HTMLElement | null): void;
  onReview(targetId: string): void;
}

/** The head of a harness column: its name (which opens it), its state, how many plugins need a build there, and when it was checked and synced. */
function HarnessHead({ target, snapshot, plan, asking, onOpen, onReview }: HarnessHeadProps) {
  const state = harnessState(target, snapshot, plan);
  // The plugins without a build here, counted even where changes come first: Apply all leaves them out.
  const builds = state.kind === 'needs-build' ? 0 : snapshot.registry.plugins.filter(p => cellState(p, target, snapshot, plan).kind === 'needs-build').length;
  const times = snapshot.sync.targets[target.id];
  let line: React.ReactNode;
  switch (state.kind) {
    case 'paused':
      line = <Badge variant="outline"><Icon name="pause" />Paused</Badge>;
      break;
    case 'changes':
      line = <Button variant="outline" size="sm" loading={asking} onClick={() => onReview(target.id)}><Icon name="refresh" />Sync {plural(state.count, 'change')}</Button>;
      break;
    case 'needs-build':
      line = <span className="inline-flex items-center gap-1 text-warning"><Icon name="alert" />{needBuild(state.count)}</span>;
      break;
    case 'unknown':
      line = <span className="inline-flex items-center gap-1 text-warning"><Icon name="alert" />{state.count ? `${plural(state.count, 'plugin')} to check` : 'Cannot be read'}</span>;
      break;
    case 'unseen':
      line = <span className="text-ink">Check to see the changes</span>;
      break;
    default:
      line = <span className="inline-flex items-center gap-1 text-ink-soft"><span className="text-success"><Icon name="check" /></span>In sync</span>;
  }
  return (
    <TableHead className="py-2 align-top">
      <div className="flex flex-col items-start gap-1 font-normal">
        <Button variant="ghost" size="sm" className="max-w-48" title={target.name} onClick={event => onOpen(target.id, event.currentTarget)}>
          <span className="min-w-0 truncate">{target.name}</span>
        </Button>
        {line}
        {builds ? <span className="inline-flex items-center gap-1 text-warning"><Icon name="alert" />{needBuild(builds)}</span> : null}
        <span title={`Last sync ${stamp(times?.synced ?? null)}`}>Checked {stamp(times?.checked ?? null)}</span>
      </div>
    </TableHead>
  );
}

interface PluginRowProps {
  plugin: Plugin;
  targets: Target[];
  snapshot: Snapshot;
  plan: Plan | null;
  tabStop: boolean;
  onFocusRow(pluginId: string): void;
  onOpen(pluginId: string): void;
}

/** One plugin: its name (which opens it) and source, its latest version with the update policy, and one cell per harness. */
function PluginRow({ plugin, targets, snapshot, plan, tabStop, onFocusRow, onOpen }: PluginRowProps) {
  const v = versionOf(plugin);
  return (
    <TableRow>
      <TableCell className="w-full min-w-40 max-w-0">
        <div className="flex min-w-0 flex-col items-start">
          <Button
            variant="link"
            className="h-auto max-w-full justify-start px-0"
            data-row-button=""
            tabIndex={tabStop ? 0 : -1}
            onFocus={() => onFocusRow(plugin.id)}
            onClick={() => onOpen(plugin.id)}
          >
            <span className="truncate" title={plugin.name}>{plugin.name}</span>
          </Button>
          <span className="max-w-full truncate text-xs text-ink-mute" title={plugin.source}>{plugin.source}</span>
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <div className="flex flex-col">
          <span className="font-medium text-ink">{v.version || 'Not checked'}</span>
          <span className="text-xs text-ink-mute">{POLICY[plugin.policy] ?? ''}{v.commit ? ` · ${v.commit}` : ''}</span>
        </div>
      </TableCell>
      {targets.map(t => <TableCell key={t.id} className="whitespace-nowrap"><Cell state={cellState(plugin, t, snapshot, plan)} /></TableCell>)}
    </TableRow>
  );
}

/** One plugin on one harness: the installed version, or the change a sync would make there, or why it cannot say. */
function Cell({ state }: { state: CellStatus }) {
  switch (state.kind) {
    case 'ok': return <span className="inline-flex items-center gap-1 text-ink tabular-nums"><span className="text-success"><Icon name="check" /></span>{state.to}</span>;
    case 'update': return <Badge variant="outline">Update {state.from} → {state.to}</Badge>;
    case 'install': return <Badge variant="secondary">Install {state.to}</Badge>;
    case 'reinstall': return <Badge variant="secondary">Reinstall {state.to}</Badge>;
    case 'activate': return <Badge variant="secondary">Activate {state.to}</Badge>;
    case 'remove': return <Badge variant="destructive">Remove {state.from}</Badge>;
    case 'needs-build': return <span className="inline-flex items-center gap-1 text-warning"><Icon name="alert" />Needs a build</span>;
    case 'unknown': return <span className="text-ink-mute">Unknown</span>;
    case 'paused': return <span className="text-ink-mute">Paused</span>;
    default: return <><span aria-hidden="true" className="text-ink-mute">—</span><span className="sr-only">Not installed here</span></>;
  }
}
