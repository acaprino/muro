// The table of the Sync page: a row per plugin of the list, a column per managed harness. A port of the Imago window's `table`, `rows`, `cell` and `hstate`
// (pages/sync.ts of commit 5e33a82) on Sigrid's table parts. What a cell or a column says is model.ts's (`cellState`, `harnessState`), read with the plan of this
// window (useSync), which counts only for the registry revision it was made for: with none the cells say what the snapshot shows, and a column that the recorded
// check says has changes, with nothing of its own to show, says to check. A cell never reads as in sync for a harness that cannot be read or a plugin with no version for it:
// such a plugin is "Not available" there (nothing to install; Adapt with AI, in its dialog, can make one), and one whose instructions changed is to adapt again. A pair the current plan
// holds back is "Not ready" with the service's reason, never what the snapshot shows; and a column with neither a current plan nor a recorded check of this revision asks for a check.
// The name of a plugin opens its dialog and the name of a harness its inspector (the page decides where they open); a column only says how many changes wait there,
// and its inspector syncs that harness alone. The rows are one tab stop: the arrows, Home and End move between them.
import * as React from 'react';
import { NARROW, useMedia } from '@acaprino/sigrid';
import { ItemList, ItemRow } from '@acaprino/sigrid/components';
import { Badge, Button, Cluster, Column, Icon, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from '@acaprino/sigrid/primitives';
import type { Plan, Plugin, Snapshot, Target } from '../../types.ts';
import { cellState, harnessState, outsideList, versionOf, type CellStatus } from '../../model.ts';
import { plural } from '../../words.ts';
import { useSync } from './useSync.tsx';

/** The update policy of a plugin, as its row says it under the version. */
const POLICY: Record<string, string> = { stable: 'Latest release', pinned: 'Pinned version', head: 'Latest commit' };
/** "1 plugin not available", "2 plugins not available": selected for a harness they have no version for. */
const notAvailable = (n: number): string => `${plural(n, 'plugin')} not available`;
/** "1 plugin to adapt", "2 plugins to adapt": their build for the harness was made without the custom instructions they have now. */
const adaptAgain = (n: number): string => `${plural(n, 'plugin')} to adapt`;
/** "1 plugin not ready", "2 plugins not ready": the current plan holds them back. */
const notReady = (n: number): string => `${plural(n, 'plugin')} not ready`;
/** "1 plugin turned off", "2 plugins turned off": installed, and switched off in the harness. */
const turnedOff = (n: number): string => `${plural(n, 'plugin')} turned off`;

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

  // Below Sigrid's narrow width a grid of harness columns scrolls sideways and cuts its columns: the same facts become two lists, the harnesses and the plugins.
  const narrow = useMedia(NARROW);
  if (narrow) return <SyncList snapshot={snapshot} plan={sync.plan} resolving={sync.resolvingSources} onOpenPlugin={onOpenPlugin} onOpenHarness={onOpenHarness} />;

  return (
    <Table id="sync-table" aria-label="Your plugins on your harnesses">
      <TableHeader>
        <TableRow>
          <TableHead><Text>Plugin</Text></TableHead>
          <TableHead><Text>Version</Text></TableHead>
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
  const besides = (kind: string) => (state.kind === kind ? 0 : kinds.filter(k => k === kind).length);
  const held = besides('blocked'), adapt = besides('adapt-again'), missing = besides('unavailable');
  // A change of the plan that no row shows (a removal outside the list) is not this column's: it is said where it is.
  const outside = outsideList(snapshot, plan, target);
  const extra = [held ? notReady(held) : '', adapt ? adaptAgain(adapt) : '', missing ? notAvailable(missing) : '', outside ? `${plural(outside, 'removal')} outside your list` : ''].filter(Boolean).join(' · ');
  let line: React.ReactNode;
  switch (state.kind) {
    case 'paused':
      line = <Badge variant="outline"><Icon name="pause" />Paused</Badge>;
      break;
    case 'changes':
      line = state.count > outside ? <Badge tone="info">{plural(state.count - outside, 'change')} waiting</Badge> : <Badge tone="success">In sync</Badge>;
      break;
    case 'blocked':
      line = <Badge tone="warning">{notReady(state.count)}</Badge>;
      break;
    case 'adapt-again':
      line = <Badge tone="warning">{adaptAgain(state.count)}</Badge>;
      break;
    case 'disabled':
      line = <Badge variant="outline">{turnedOff(state.count)}</Badge>;
      break;
    case 'not-checked':
      line = <Badge variant="outline" title="No check of your list has read this harness yet">Not checked</Badge>;
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
        {/* What else is on this harness, in one quiet line under its state: one badge per head, so the names stay on one line. */}
        {extra ? <Text variant="note">{extra}</Text> : null}
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
          {plugin.targets.length ? null : <Text variant="note">No harness chosen: open it to choose</Text>}
        </Column>
      </TableCell>
      <TableCell>
        <Column gap="xs">
          <Text variant="strong" role={resolving ? 'status' : undefined}>{resolving ? 'Checking source…' : v.version || 'Not checked'}</Text>
          {/* The policy only when it is not the default (the latest release), so the column holds one line. */}
          {plugin.policy !== 'stable' || v.commit ? <Text variant="note">{plugin.policy !== 'stable' ? POLICY[plugin.policy] ?? '' : ''}{plugin.policy !== 'stable' && v.commit ? ' · ' : ''}{v.commit}</Text> : null}
        </Column>
      </TableCell>
      {targets.map(target => <TableCell key={target.id}>{resolving && target.enabled && plugin.targets.includes(target.id)
        ? <Text variant="muted">Checking builds…</Text>
        : <Cell state={cellState(plugin, target, snapshot, plan)} plugin={plugin} target={target} checked={harnessState(target, snapshot, plan).kind !== 'not-checked'} />}</TableCell>)}
    </TableRow>
  );
}

/** One plugin on one harness: the installed version, or the change a sync would make there, or why it cannot say. */
function Cell({ state, plugin, target, checked }: { state: CellStatus; plugin: Plugin; target: Target; checked: boolean }) {
  let action: string;
  switch (state.kind) {
    // The tick says in sync, which only a check of this list can say: until then the installed version alone.
    case 'ok': return checked
      ? <Cluster gap="xs" wrap={false}><Text tone="success"><Icon name="check" /></Text><Text variant="strong">{state.to}</Text></Cluster>
      : <Text variant="soft" title={`${state.to} is installed on ${target.name}; no check of your list has compared it yet`}>{state.to}</Text>;
    case 'update': action = state.reason && state.from === state.to ? `Restore ${state.to}` : `Update ${state.from} → ${state.to}`; break;
    case 'install': action = `Install ${state.to}`; break;
    case 'reinstall': action = `Reinstall ${state.to}`; break;
    case 'activate': action = `Activate ${state.to}`; break;
    case 'remove': return <Badge tone="danger">Remove {state.from}</Badge>;
    case 'unavailable': return <Badge variant="outline" title={state.reason ?? `${plugin.name} has no version for ${target.name}`}>Not available</Badge>;
    case 'adapt-again': return state.from === 'never'
      ? <Badge tone="warning" title={`${plugin.name} has custom instructions, and its build for ${target.name} was made without them: Adapt with AI uses them`}>Instructions not applied</Badge>
      : <Badge tone="warning" title={`The instructions of ${plugin.name} changed since it was adapted for ${target.name}`}>Adapt again</Badge>;
    case 'blocked': return <Column gap="xs" align="start"><Badge tone="warning">Not ready</Badge><Text variant="note" title={state.reason} truncate>{state.reason}</Text></Column>;
    case 'disabled': return <Badge variant="outline" title={`${plugin.name} ${state.to} is installed on ${target.name} and turned off there`}>Turned off</Badge>;
    case 'source-error': return <Column gap="xs" align="start"><Badge tone="warning">Check plugin source</Badge><Text variant="note" title={state.reason} truncate>{state.reason}</Text></Column>;
    case 'changes': action = `Review ${plural(state.count ?? 0, 'change')}`; break;
    case 'unscanned': action = 'Check installation'; break;
    case 'unknown': return <Text variant="muted">Unknown</Text>;
    case 'paused': return <Text variant="muted">Paused</Text>;
    default:
      // Not chosen here: a quiet dash, so the cell is not read as missing, and the words for a screen reader.
      if (plugin.project_source_error || !plugin.distributions.some(d => d.harness === target.harness && d.path)) return <Text variant="muted" title="Not selected for this harness"><span aria-hidden="true">–</span><Text srOnly>Not selected</Text></Text>;
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

// ---------- the narrow layout ----------

/** What a column head says, in words: its state, then what else is on that harness. The same facts as `HarnessHead`, for a list. */
function harnessWords(target: Target, snapshot: Snapshot, plan: Plan | null): string[] {
  const state = harnessState(target, snapshot, plan), outside = outsideList(snapshot, plan, target);
  const kinds = snapshot.registry.plugins.map(p => cellState(p, target, snapshot, plan).kind);
  const besides = (kind: string) => (state.kind === kind ? 0 : kinds.filter(k => k === kind).length);
  const main: Record<string, string> = {
    paused: 'Paused', 'adapt-again': adaptAgain(state.count), unavailable: notAvailable(state.count), blocked: notReady(state.count), disabled: turnedOff(state.count),
    'not-checked': 'Not checked', unscanned: 'Not checked yet', unknown: state.count ? `${plural(state.count, 'plugin')} to check` : 'Cannot be read',
    'source-error': `${plural(state.count, 'source')} to check`, unseen: 'Check to see the changes', ok: 'In sync',
    changes: state.count > outside ? `${plural(state.count - outside, 'change')} waiting` : 'In sync',
  };
  return [main[state.kind] ?? state.kind, besides('blocked') ? notReady(besides('blocked')) : '', besides('adapt-again') ? adaptAgain(besides('adapt-again')) : '',
    besides('unavailable') ? notAvailable(besides('unavailable')) : '', outside ? `${plural(outside, 'removal')} outside your list` : ''].filter(Boolean);
}

/** What a cell says, in words, or null for a harness the plugin is not on and cannot be selected for. The same states as `Cell`, for a fact of a row. */
function cellWords(state: CellStatus, plugin: Plugin, target: Target, checked: boolean): string | null {
  switch (state.kind) {
    case 'ok': return checked ? `In sync, ${state.to}` : `${state.to}, not checked`;
    case 'update': return state.reason && state.from === state.to ? `Restore ${state.to}` : `Update ${state.from} → ${state.to}`;
    case 'install': return `Install ${state.to}`;
    case 'reinstall': return `Reinstall ${state.to}`;
    case 'activate': return `Activate ${state.to}`;
    case 'remove': return `Remove ${state.from}`;
    case 'unavailable': return 'Not available';
    case 'adapt-again': return state.from === 'never' ? 'Instructions not applied' : 'Adapt again';
    case 'blocked': return `Not ready: ${state.reason}`;
    case 'disabled': return 'Turned off';
    case 'source-error': return 'Check plugin source';
    case 'changes': return plural(state.count ?? 0, 'change');
    case 'unscanned': return 'Check installation';
    case 'unknown': return 'Unknown';
    case 'paused': return 'Paused';
    default: return plugin.project_source_error || !plugin.distributions.some(d => d.harness === target.harness && d.path) ? null : 'Not selected';
  }
}

interface SyncListProps {
  snapshot: Snapshot;
  plan: Plan | null;
  resolving: readonly string[];
  onOpenPlugin(pluginId: string, opener: HTMLElement | null): void;
  onOpenHarness(targetId: string, opener: HTMLElement | null): void;
}

/** The table as two lists, for a narrow window: each harness with its state (it opens its inspector), then each plugin with its version and one fact per harness it is on (it opens its dialog,
 * where its changes are applied; Apply all is in the bar). Nothing scrolls sideways and no column is cut. */
function SyncList({ snapshot, plan, resolving, onOpenPlugin, onOpenHarness }: SyncListProps) {
  const { plugins, targets } = snapshot.registry;
  return (
    <Column gap="lg">
      <ItemList aria-label="Your harnesses">
        {targets.map(t => (
          <ItemRow key={t.id} title={t.name} facts={harnessWords(t, snapshot, plan).map((text, i) => ({ text, ...(i === 0 ? { tone: 'strong' as const } : {}) }))}
            onClick={(event: React.MouseEvent<HTMLElement>) => onOpenHarness(t.id, event.currentTarget)} />
        ))}
      </ItemList>
      <ItemList aria-label="Your plugins on your harnesses">
        {plugins.map(p => {
          const v = versionOf(p), checking = resolving.includes(p.id);
          const version = checking ? 'Checking source…' : [v.version || 'Not checked', p.policy !== 'stable' ? POLICY[p.policy] : ''].filter(Boolean).join(' · ');
          const facts = checking ? [] : targets.map(t => {
            const words = cellWords(cellState(p, t, snapshot, plan), p, t, harnessState(t, snapshot, plan).kind !== 'not-checked');
            return words ? { text: `${t.name}: ${words}` } : null;
          }).filter((f): f is { text: string } => f !== null);
          return (
            // The version is the row's first fact, not a meta at its end: at narrow widths a meta takes the room of the name.
            <ItemRow key={p.id} wrapTitle title={p.name} description={p.targets.length ? p.source : `${p.source} · No harness chosen`}
              facts={[{ text: version, tone: 'strong' as const }, ...facts]} onClick={(event: React.MouseEvent<HTMLElement>) => onOpenPlugin(p.id, event.currentTarget)} />
          );
        })}
      </ItemList>
    </Column>
  );
}
