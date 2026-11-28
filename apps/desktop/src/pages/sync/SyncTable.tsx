// The table of the Sync page: a row per plugin of the list, a column per managed harness. A port of the Imago window's `table`, `rows`, `cell` and `hstate`
// (pages/sync.ts of commit 5e33a82) on Sigrid's table parts. What a cell or a column says is model.ts's (`cellState`, `harnessState`), read with the plan of this
// window (useSync), which counts only for the registry revision it was made for: with none the cells say what the snapshot shows, and a column that the recorded
// check says has changes, with nothing of its own to show, says to check. A cell never reads as in sync for a harness that cannot be read or a plugin with no version for it:
// such a plugin is "Not available" there (nothing to install; Adapt with AI, in its dialog, can make one), and one whose instructions changed is to adapt again.
// The name of a plugin opens its dialog and the name of a harness its inspector (the page decides where they open); a column only says how many changes wait there,
// and its inspector syncs that harness alone. The rows are one tab stop: the arrows, Home and End move between them.
import * as React from 'react';
import { Badge, Button, Cluster, Column, Icon, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from '@acaprino/sigrid/primitives';
import type { Plan, Plugin, Snapshot, Target } from '../../types.ts';
import { cellState, harnessState, versionOf, type CellStatus } from '../../model.ts';
import { plural } from '../../words.ts';
import { useSync } from './useSync.tsx';

/** The update policy of a plugin, as its row says it under the version. */
const POLICY: Record<string, string> = { stable: 'Latest release', pinned: 'Pinned version', head: 'Latest commit' };
/** "1 plugin not available", "2 plugins not available": selected for a harness they have no version for. */
const notAvailable = (n: number): string => `${plural(n, 'plugin')} not available`;
/** "1 plugin to adapt again", "2 plugins to adapt again": their instructions changed since they were adapted for the harness. */
const adaptAgain = (n: number): string => `${plural(n, 'plugin')} to adapt again`;

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
          <TableHead><Text>Latest version</Text></TableHead>
          {targets.map(t => (
            <HarnessHead key={t.id} target={t} snapshot={snapshot} plan={sync.plan} onOpen={onOpenHarness} />
          ))}
        </TableRow>
      </TableHeader>
      <TableBody id="rows" onKeyDown={move}>
        {plugins.map(p => (
          <PluginRow key={p.id} plugin={p} targets={targets} snapshot={snapshot} plan={sync.plan} resolving={sync.resolvingSources.includes(p.id)} tabStop={p.id === current} onFocusRow={setActive} onOpen={onOpenPlugin} />
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
  onOpen(targetId: string, opener: HTMLElement | null): void;
}

/** The head of a harness column: its name (which opens it), its state, and how many plugins are to adapt again or not available there. When it was checked and synced is in its inspector. */
function HarnessHead({ target, snapshot, plan, onOpen }: HarnessHeadProps) {
  const state = harnessState(target, snapshot, plan);
  // The plugins with nothing to install here, counted even where changes come first: Apply all leaves them out.
  const kinds = snapshot.registry.plugins.map(p => cellState(p, target, snapshot, plan).kind);
  const adapt = state.kind === 'adapt-again' ? 0 : kinds.filter(k => k === 'adapt-again').length;
  const missing = state.kind === 'unavailable' ? 0 : kinds.filter(k => k === 'unavailable').length;
  let line: React.ReactNode;
  switch (state.kind) {
    case 'paused':
      line = <Badge variant="outline"><Icon name="pause" />Paused</Badge>;
      break;
    case 'changes':
      line = <Badge tone="info">{plural(state.count, 'change')} waiting</Badge>;
      break;
    case 'adapt-again':
      line = <Badge tone="warning">{adaptAgain(state.count)}</Badge>;
      break;
    case 'unavailable':
      line = <Badge variant="outline">{notAvailable(state.count)}</Badge>;
      break;
    case 'unscanned':
      line = <Text variant="muted">Not checked yet</Text>;
      break;
    case 'unknown':
      line = <Badge tone="warning">{state.count ? `${plural(state.count, 'plugin')} to check` : 'Cannot be read'}</Badge>;
      break;
    case 'source-error':
      line = <Badge tone="warning">{plural(state.count, 'source')} to check</Badge>;
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
        {adapt ? <Badge tone="warning">{adaptAgain(adapt)}</Badge> : null}
        {missing ? <Badge variant="outline">{notAvailable(missing)}</Badge> : null}
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
  resolving: boolean;
  onFocusRow(pluginId: string): void;
  onOpen(pluginId: string, opener: HTMLElement | null): void;
}

/** One plugin: its name (which opens it) and source, its latest version with the update policy, and one cell per harness. */
function PluginRow({ plugin, targets, snapshot, plan, resolving, tabStop, onFocusRow, onOpen }: PluginRowProps) {
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
          <Text variant="strong" role={resolving ? 'status' : undefined}>{resolving ? 'Checking source…' : v.version || 'Not checked'}</Text>
          <Text variant="note">{POLICY[plugin.policy] ?? ''}{v.commit ? ` · ${v.commit}` : ''}</Text>
        </Column>
      </TableCell>
      {targets.map(target => <TableCell key={target.id}>{resolving && target.enabled && plugin.targets.includes(target.id)
        ? <Text variant="muted">Checking builds…</Text>
        : <Cell state={cellState(plugin, target, snapshot, plan)} plugin={plugin} target={target} />}</TableCell>)}
    </TableRow>
  );
}

/** One plugin on one harness: the installed version, or the change a sync would make there, or why it cannot say. */
function Cell({ state, plugin, target }: { state: CellStatus; plugin: Plugin; target: Target }) {
  let action: string;
  switch (state.kind) {
    case 'ok': return <Cluster gap="xs" wrap={false}><Text tone="success"><Icon name="check" /></Text><Text variant="strong">{state.to}</Text></Cluster>;
    case 'update': action = `Update ${state.from} → ${state.to}`; break;
    case 'install': action = `Install ${state.to}`; break;
    case 'reinstall': action = `Reinstall ${state.to}`; break;
    case 'activate': action = `Activate ${state.to}`; break;
    case 'remove': return <Badge tone="danger">Remove {state.from}</Badge>;
    case 'unavailable': return <Badge variant="outline" title={`${plugin.name} has no version for ${target.name}`}>Not available</Badge>;
    case 'adapt-again': return <Badge tone="warning" title={`The instructions of ${plugin.name} changed since it was adapted for ${target.name}`}>Adapt again</Badge>;
    case 'source-error': return <Column gap="xs" align="start"><Badge tone="warning">Check plugin source</Badge><Text variant="note" title={state.reason} truncate>{state.reason}</Text></Column>;
    case 'changes': action = `Review ${plural(state.count ?? 0, 'change')}`; break;
    case 'unscanned': action = 'Check installation'; break;
    case 'unknown': return <Text variant="muted">Unknown</Text>;
    case 'paused': return <Text variant="muted">Paused</Text>;
    default:
      // Not chosen here: an empty cell, said to a screen reader.
      if (plugin.project_source_error || !plugin.distributions.some(d => d.harness === target.harness && d.path)) return <Text srOnly>Not selected</Text>;
      action = 'Select for sync';
  }
  return <CellAction label={action} state={state} plugin={plugin} target={target} />;
}

function CellAction({ label, state, plugin, target }: { label: string; state: CellStatus; plugin: Plugin; target: Target }) {
  const sync = useSync();
  const [working, setWorking] = React.useState(false);
  async function run(opener: HTMLButtonElement): Promise<void> {
    const cell = opener.closest('td');
    setWorking(true);
    try {
      if (state.kind === 'none') await sync.selectTarget(plugin.id, target.id);
      else await sync.syncPlugin(plugin.id, target.id, state);
    } finally {
      setWorking(false);
      if (cell?.isConnected && !opener.isConnected && document.activeElement === document.body) {
        (cell.querySelector<HTMLButtonElement>('button') ?? cell.closest('tr')?.querySelector<HTMLButtonElement>('[data-row-button]'))?.focus();
      }
    }
  }
  return <Button variant="outline" size="sm" aria-label={`${label} · ${plugin.name} on ${target.name}`} loading={working} loadingText="Working…"
    disabled={sync.busy && !working} onClick={e => void run(e.currentTarget)}>{label}</Button>;
}
