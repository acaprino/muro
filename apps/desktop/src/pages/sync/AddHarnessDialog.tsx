import * as React from 'react';
import { Button, Icon, RadioGroup, RadioGroupItem } from '@acaprino/sigrid/primitives';
import { Dialog } from '@acaprino/sigrid/components';
import type { Discovered, Target } from '../../types.ts';
import { useNotify } from '@acaprino/imago';
import { useRegistry } from '../../state/registry.tsx';
import { message } from '../../words.ts';
import { NotSaved } from '../project/write/DetailsDialog.tsx';
import { RefusalLine } from '../project/write/HarmonizeDialog.tsx';
import { HarnessFields, focusFirst, harnessProblems, useFieldRefs } from './HarnessInspector.tsx';
import type { HarnessValues } from './HarnessInspector.tsx';
import { registryWrite } from './registryWrite.ts';
import { useSync } from './useSync.tsx';

/** Add harness: what Mukade found on this computer (`discover`: name, folder, executable) to choose from, or one by hand. Choosing a harness fills the fields in, which the person may change for a custom
 * installation; the harness is saved as `save_target` (`registryWrite`: the revision, and the one retry when it moved), switched on and with the rule for plugins outside the list off (the inspector
 * changes either). A harness that cannot take plugins is listed with the reason and cannot be chosen. A harness already managed (the same kind in the same folder) is not offered again. The
 * search runs each time the dialog opens, and again on *Search again*; it holds no registry lock. What the person typed stays when the registry moves under the open dialog: the form starts from the
 * search once, when the dialog opens. A refusal is said inside the dialog, never in a notice (it would cover the buttons). */

export interface AddHarnessDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}

/** What a harness found is chosen by: its kind and its folder, so the choice holds when a search again puts the list in another order. `hand` is the other choice and is never a key. */
const keyOf = (d: Discovered): string => `${d.harness}|${d.config_root ?? ''}`;
const flat = (path: string): string => path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
/** The same folder, whatever the slashes, the case or a slash at the end. */
const samePath = (a: string, b: string): boolean => flat(a) === flat(b);

const BLANK: HarnessValues = { name: '', harness: 'codex', root: '', executable: '' };
/** One opening: which choice is made (`''` none, `hand`, or the key of a harness found), the fields, whether a save was tried and what the service refused. */
interface Session { open: boolean; pick: string; values: HarnessValues; tried: boolean; error: string | null }
const fresh = (open: boolean): Session => ({ open, pick: '', values: BLANK, tried: false, error: null });
interface Search { busy: boolean; found: Discovered[] | null; error: string | null }
const LOOKING: Search = { busy: true, found: null, error: null };

export function AddHarnessDialog({ open, onOpenChange }: AddHarnessDialogProps) {
  const { snapshot, request } = useRegistry();
  const { adopt } = useSync();
  const notify = useNotify();
  const formId = React.useId();
  const refs = useFieldRefs();
  const [held, setHeld] = React.useState<Session>(() => fresh(open));
  const [search, setSearch] = React.useState<Search>(LOOKING);
  const [saving, setSaving] = React.useState(false);
  const latest = React.useRef(snapshot);
  latest.current = snapshot;
  // The form starts empty each time the dialog opens, and is not made again while it is open: what the person typed is theirs.
  let session = held;
  if (open !== held.open) {
    session = fresh(open);
    setHeld(session);
  }
  const patch = (next: Partial<Session>): void => setHeld(now => ({ ...now, ...next }));

  // The search: one at a time is the latest. An answer that arrives after the dialog closed, or after another search began, is dropped.
  const round = React.useRef(0);
  const look = React.useCallback(async (): Promise<void> => {
    const mine = ++round.current;
    setSearch(now => ({ busy: true, found: now.found, error: null }));
    try {
      const found = await request<Discovered[]>('discover');
      if (round.current === mine) setSearch({ busy: false, found: Array.isArray(found) ? found : [], error: null });
    } catch (e) {
      if (round.current === mine) setSearch(now => ({ busy: false, found: now.found, error: message(e) }));
    }
  }, [request]);
  React.useEffect(() => {
    if (open) { setSearch(LOOKING); void look(); }
    else round.current++;
  }, [open, look]);

  const targets = snapshot?.registry.targets ?? [];
  const offered = (search.found ?? []).filter(d => d.available && !targets.some(t => t.harness === d.harness && !!d.config_root && samePath(t.root, d.config_root)));
  const chosen = offered.find(d => keyOf(d) === session.pick);

  /** A harness found fills the fields in. By hand empties them, unless nothing was chosen yet: what was typed first is kept. */
  function choose(pick: string): void {
    const found = offered.find(d => keyOf(d) === pick);
    if (pick !== 'hand' && !found) return;
    patch({ pick, values: found ? { name: found.name, harness: found.harness, root: found.config_root ?? '', executable: found.executable } : session.pick === '' ? session.values : BLANK, tried: false, error: null });
  }

  const shown = session.tried ? harnessProblems(session.values) : {};
  async function save(): Promise<void> {
    patch({ tried: true });
    const registry = latest.current;
    if (saving || !registry) return;
    if (focusFirst(harnessProblems(session.values), refs)) return;
    setSaving(true);
    patch({ error: null });
    try {
      const { name, harness, root, executable } = session.values;
      const target: Target = { id: crypto.randomUUID(), harness, name: name.trim(), root: root.trim(), executable: executable.trim(), enabled: true, exclusive: false };
      adopt(await registryWrite(request, registry.registry.revision, 'save_target', { target }));
      notify(`${target.name} saved.`);
      onOpenChange(false);
    } catch (e) { patch({ error: message(e) }); }
    finally { setSaving(false); }
  }

  return (
    <Dialog
      drawer
      open={open}
      onOpenChange={next => { if (!next && saving) return; onOpenChange(next); }}
      title="Add a harness"
      description="Muro keeps each harness you add in line with your list. Its plugins stay as they are until you apply."
      footer={(
        <>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form={formId} loading={saving} loadingText="Adding…">Add harness</Button>
        </>
      )}
    >
      <form id={formId} noValidate onSubmit={event => { event.preventDefault(); void save(); }} className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 className="min-w-0 flex-1 text-sm font-semibold text-ink">Found on this computer</h3>
            <Button variant="outline" size="sm" loading={search.busy} loadingText="Looking…" onClick={() => void look()}><Icon name="refresh" />Search again</Button>
          </div>
          {search.error ? <RefusalLine>{`Harness detection failed: ${search.error}`}</RefusalLine> : null}
          {search.busy && !offered.length ? <p role="status" className="text-xs text-ink-mute">Looking for harnesses…</p> : null}
          {!search.busy && !search.error && !offered.length ? <p role="status" className="text-xs text-ink-mute">No other harness found on this computer</p> : null}
          <RadioGroup aria-label="Harness to add" value={session.pick} onValueChange={choose}>
            {offered.map((d, i) => {
              const id = `${formId}-found-${i}`;
              return (
                <div key={keyOf(d)} className="flex min-w-0 items-start gap-3" title={d.supported ? undefined : 'Plugin installation is not supported by this harness'}>
                  <RadioGroupItem id={id} value={keyOf(d)} disabled={!d.supported} aria-describedby={`${id}-about`} />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <label htmlFor={id} className="text-sm font-medium text-ink">{d.name}</label>
                    <span id={`${id}-about`} className="min-w-0 text-xs break-all text-ink-mute">
                      {d.supported ? null : 'No plugin support yet. '}
                      <span className="font-mono">{[d.version, d.config_root ?? 'no configuration folder found', d.executable].filter(Boolean).join(' · ')}</span>
                    </span>
                  </div>
                </div>
              );
            })}
            <div className="flex min-w-0 items-start gap-3">
              <RadioGroupItem id={`${formId}-hand`} value="hand" aria-describedby={`${formId}-hand-about`} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <label htmlFor={`${formId}-hand`} className="text-sm font-medium text-ink">Another harness, by hand</label>
                <span id={`${formId}-hand-about`} className="text-xs text-ink-mute">For one Muro did not find, or one installed somewhere else.</span>
              </div>
            </div>
          </RadioGroup>
        </div>
        <p className="text-xs text-ink-mute">{chosen?.config_root ? 'Muro filled in the folder where this harness keeps its plugin configuration by default. Change it for a custom installation.' : 'Tell Muro where this harness keeps its plugin configuration.'}</p>
        <HarnessFields values={session.values} problems={shown} refs={refs} onChange={values => setHeld(now => ({ ...now, values: { ...now.values, ...values } }))} />
        {session.error ? <NotSaved text={session.error} /> : null}
      </form>
    </Dialog>
  );
}
