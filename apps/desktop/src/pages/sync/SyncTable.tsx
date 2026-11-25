// The table of the Sync page: a row per plugin of the list, a column per managed harness. A port of the Imago window's `table`, `rows`, `cell` and `hstate`
// (pages/sync.ts of commit 5e33a82) on Sigrid's table parts. What a cell or a column says is model.ts's (`cellState`, `harnessState`), read with the plan of this
// window (useSync), which counts only for the registry revision it was made for: with none the cells say what the snapshot shows, and a column that the recorded
// check says has changes, with nothing of its own to show, says to check. A cell never reads as in sync for a harness that cannot be read or a plugin without a build.
// The name of a plugin opens its dialog and the name of a harness its inspector (the page decides where they open); "Sync N changes" under a harness opens the review
// sheet on the plan of that harness alone. The rows are one tab stop: the arrows, Home and End move between them.
import * as React from 'react';
import { Badge, Button, Cluster, Column, Icon, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from '@acaprino/sigrid/primitives';
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
  /** A plugin's name was pressed: its dialog opens, and focus comes back to `opener` when it closes. */
  onOpenPlugin(pluginId: string, opener: HTMLElement | null): void;
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
    <Table id="sync-table" aria-label="Your plugins on your harnesses">
      <TableHeader>
        <TableRow>
          <TableHead><TwoLines first="Plugin" second={`${plural(plugins.length, 'plugin')} in your list`} /></TableHead>
          <TableHead><TwoLines first="Latest version" second={`Checked ${stamp(snapshot.sync.last_check)}`} /></TableHead>
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

/** A heading of two lines: what the column holds, and a fact about it. */
const TwoLines = ({ first, second }: { first: string; second: string }) => <Column gap="xs"><Text>{first}</Text><Text variant="caption">{second}</Text></Column>;

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
      line = <Badge tone="warning">{needBuild(state.count)}</Badge>;
      break;
    case 'unknown':
      line = <Badge tone="warning">{state.count ? `${plural(state.count, 'plugin')} to check` : 'Cannot be read'}</Badge>;
      break;
    case 'unseen':
      line = <Text variant="strong">Check to see the changes</Text>;
      break;
    default:
      line = <Badge tone="success">In sync</Badge>;
  }
  return (
    <TableHead>
      <Column gap="xs" align="start">
        <Button variant="ghost" size="sm" onClick={event => onOpen(target.id, event.currentTarget)}><Text truncate>{target.name}</Text></Button>
        {line}
        {builds ? <Badge tone="warning">{needBuild(builds)}</Badge> : null}
        <Text variant="caption" title={`Last sync ${stamp(times?.synced ?? null)}`}>Checked {stamp(times?.checked ?? null)}</Text>
      </Column>
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
  onOpen(pluginId: string, opener: HTMLElement | null): void;
}

/** One plugin: its name (which opens it) and source, its latest version with the update policy, and one cell per harness. */
function PluginRow({ plugin, targets, snapshot, plan, tabStop, onFocusRow, onOpen }: PluginRowProps) {
  const v = versionOf(plugin);
  return (
    <TableRow>
      <TableCell grow>
        <Column gap="xs">
          <Button
            variant="link"
            size="inline"
            data-row-button=""
            tabIndex={tabStop ? 0 : -1}
            onFocus={() => onFocusRow(plugin.id)}
            onClick={event => onOpen(plugin.id, event.currentTarget)}
          >
            <Text truncate>{plugin.name}</Text>
          </Button>
          <Text variant="note" truncate>{plugin.source}</Text>
        </Column>
      </TableCell>
      <TableCell>
        <Column gap="xs">
          <Text variant="strong">{v.version || 'Not checked'}</Text>
          <Text variant="note">{POLICY[plugin.policy] ?? ''}{v.commit ? ` · ${v.commit}` : ''}</Text>
        </Column>
      </TableCell>
      {targets.map(t => <TableCell key={t.id}><Cell state={cellState(plugin, t, snapshot, plan)} /></TableCell>)}
    </TableRow>
  );
}

/** One plugin on one harness: the installed version, or the change a sync would make there, or why it cannot say. */
function Cell({ state }: { state: CellStatus }) {
  switch (state.kind) {
    case 'ok': return <Cluster gap="xs" wrap={false}><Text tone="success"><Icon name="check" /></Text><Text variant="strong">{state.to}</Text></Cluster>;
    case 'update': return <Badge tone="info">Update {state.from} → {state.to}</Badge>;
    case 'install': return <Badge tone="info">Install {state.to}</Badge>;
    case 'reinstall': return <Badge tone="info">Reinstall {state.to}</Badge>;
    case 'activate': return <Badge tone="info">Activate {state.to}</Badge>;
    case 'remove': return <Badge tone="danger">Remove {state.from}</Badge>;
    case 'needs-build': return <Badge tone="warning">Needs a build</Badge>;
    case 'unknown': return <Text variant="muted">Unknown</Text>;
    case 'paused': return <Text variant="muted">Paused</Text>;
    default: return <><Text variant="muted" aria-hidden="true">—</Text><Text srOnly>Not installed here</Text></>;
  }
}
