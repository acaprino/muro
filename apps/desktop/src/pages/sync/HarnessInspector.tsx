import * as React from 'react';
import { Button, Checkbox, Icon, Input, Select } from '@acaprino/sigrid/primitives';
import { Dialog, FormField } from '@acaprino/sigrid/components';
import { Inspector } from '@acaprino/sigrid/layout';
import type { InstalledPlugin, Snapshot, Target } from '../../types.ts';
import { filesMissing, harnessNames, inList, stamp } from '../../model.ts';
import { useNotify } from '@acaprino/imago';
import { useRegistry } from '../../state/registry.tsx';
import { message, plural } from '../../words.ts';
import { RefusalLine } from '../project/write/HarmonizeDialog.tsx';
import { NotSaved } from '../project/write/DetailsDialog.tsx';
import { registryWrite } from './registryWrite.ts';
import { NO_FOLDER, added, listable, useAddToList } from './Unlisted.tsx';
import { useSync } from './useSync.tsx';

/** The harness of a column header, in the inspector (Sigrid's `Inspector`: docked beside the content from 1000px, a panel over its end under it, never modal, so the table stays usable): its name,
 * the harness kind, the configuration folder, the executable, whether to keep it in sync (off pauses it), the rule for the plugins outside the list on this harness, what is installed there with
 * *Add to my list*, and *Stop managing*. Cancel and Save are its foot; leaving with changes asks once.
 *
 * What the person typed is theirs: the form holds only the fields they changed (`edits`), and every other field reads the registry as it is now, so the 30 s refresh, the tray or the worker moving the
 * registry under an open inspector changes nothing the person typed and brings the rest up to date. A save carries the target as the registry holds it with the fields of the form laid over it, so what
 * the form does not show stays as it was (`registryWrite`: the revision, and the one retry when it moved). Errors that belong to the inspector are said inside it, never in a notice. */

// ---------- the form of a harness, which Add harness shares ----------
/** The fields the inspector and Add harness both ask for. */
export interface HarnessValues { name: string; harness: string; root: string; executable: string }
export type HarnessProblems = Partial<Record<'name' | 'root' | 'executable', string>>;
/** The fields that can be wrong, in the order of the form: the first wrong one takes the focus. */
const ORDER = ['name', 'root', 'executable'] as const;
const KINDS = Object.entries(harnessNames).map(([value, label]) => ({ value, label }));

/** What is wrong with a harness the form describes, in the old window's words, in the order of the form. */
export function harnessProblems(values: HarnessValues): HarnessProblems {
  const problems: HarnessProblems = {};
  const root = values.root.trim();
  if (!values.name.trim()) problems.name = 'Give the harness a name.';
  if (!root) problems.root = 'Enter the configuration folder.';
  else if (!/^([A-Za-z]:[\\/]|[\\/~])/.test(root)) problems.root = 'Enter the full path of the folder, such as C:\\Users\\you\\.codex.';
  if (!values.executable.trim()) problems.executable = 'Enter the command or full path of the executable.';
  return problems;
}

export type FieldRefs = Record<(typeof ORDER)[number], React.RefObject<HTMLInputElement | null>>;
/** The fields' own elements, to give the focus to the first wrong one. */
export function useFieldRefs(): FieldRefs {
  const name = React.useRef<HTMLInputElement>(null), root = React.useRef<HTMLInputElement>(null), executable = React.useRef<HTMLInputElement>(null);
  return React.useMemo(() => ({ name, root, executable }), [name, root, executable]);
}
/** Gives the focus to the first field with a problem, in the order of the form. False when there is none. */
export function focusFirst(problems: HarnessProblems, refs: FieldRefs): boolean {
  const first = ORDER.find(key => problems[key]);
  if (!first) return false;
  refs[first].current?.focus();
  return true;
}

/** Name, harness, configuration folder and executable. `problems` are those to show now (the caller decides when: after a first try to save). */
export function HarnessFields({ values, problems, refs, onChange }: { values: HarnessValues; problems: HarnessProblems; refs: FieldRefs; onChange(patch: Partial<HarnessValues>): void }) {
  return (
    <>
      <FormField label="Name" required error={problems.name}>
        <Input ref={refs.name} name="name" autoComplete="off" value={values.name} onChange={e => onChange({ name: e.currentTarget.value })} />
      </FormField>
      <FormField label="Harness">
        <Select options={KINDS} value={values.harness} onValueChange={harness => onChange({ harness })} />
      </FormField>
      <FormField label="Configuration folder" required help="Where the harness keeps its settings. OpenCode: the folder of opencode.json. Pi: the folder of settings.json." error={problems.root}>
        <Input ref={refs.root} name="root" autoComplete="off" spellCheck={false} className="font-mono" value={values.root} onChange={e => onChange({ root: e.currentTarget.value })} />
      </FormField>
      <FormField label="Executable" required error={problems.executable}>
        <Input ref={refs.executable} name="executable" autoComplete="off" spellCheck={false} className="font-mono" value={values.executable} onChange={e => onChange({ executable: e.currentTarget.value })} />
      </FormField>
    </>
  );
}

// ---------- the inspector ----------
interface Form extends HarnessValues { enabled: boolean; exclusive: boolean }
const formOf = (t: Target): Form => ({ name: t.name, harness: t.harness, root: t.root, executable: t.executable, enabled: t.enabled, exclusive: t.exclusive });
const same = (a: unknown, b: unknown): boolean => (typeof a === 'string' && typeof b === 'string' ? a.trim() === b.trim() : a === b);
/** Whether the person changed something: a field they edited that differs from the registry now (typing a value back to what it was is no change). */
const dirtyOf = (edits: Partial<Form>, target: Target | undefined): boolean => {
  if (!target) return false;
  const base = formOf(target);
  return (Object.keys(edits) as (keyof Form)[]).some(key => !same(edits[key], base[key]));
};

type Confirm = 'discard' | 'stop' | null;
/** One opening of the inspector on one harness. `edits` are the fields the person changed; `declined` is the harness they asked to move to while the form had changes and chose to stay on this one. */
interface Session { open: boolean; id: string; edits: Partial<Form>; tried: boolean; declined: string | null; confirm: Confirm; saveError: string | null; listError: string | null; listNote: string | null; stopError: string | null }
const fresh = (open: boolean, id: string): Session => ({ open, id, edits: {}, tried: false, declined: null, confirm: null, saveError: null, listError: null, listNote: null, stopError: null });

export interface HarnessInspectorProps {
  /** The harness shown: the `id` of a target of the registry. */
  targetId: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}

/** A checkbox with its label and a sentence under it that says what it does (the checkbox waits for Save). */
function CheckRow({ id, label, help, checked, onChange }: { id: string; label: string; help: string; checked: boolean; onChange(next: boolean): void }) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox id={id} aria-describedby={`${id}-help`} checked={checked} onCheckedChange={next => onChange(next === true)} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
        <span id={`${id}-help`} className="text-xs text-ink-mute">{help}</span>
      </div>
    </div>
  );
}

/** What a harness holds, as the snapshot's inventory says it: in the list or not, and a way to add what is not. */
function InstalledHere({ snapshot, target, adding, error, note, noteRef, onAdd }: { snapshot: Snapshot; target: Target; adding: string | null; error: string | null; note: string | null; noteRef: React.RefObject<HTMLParagraphElement | null>; onAdd(installed: InstalledPlugin): void }) {
  const inventory = snapshot.inventory.find(i => i.target_id === target.id);
  const plugins = inventory?.plugins ?? [];
  return (
    <section aria-labelledby={`${target.id}-installed`} className="flex flex-col gap-2">
      <h3 id={`${target.id}-installed`} className="text-sm font-semibold text-ink">Installed here</h3>
      {inventory && !inventory.complete && inventory.error ? <RefusalLine>{inventory.error}</RefusalLine> : null}
      {plugins.length ? (
        <ul className="flex flex-col divide-y divide-line">
          {plugins.map(p => {
            const listed = inList(snapshot, target, p), line = `${p.version} · ${listed ? 'in your list' : 'not in your list'}${filesMissing(p)}`, key = `${target.id}:${p.id}`;
            return (
              <li key={p.id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 py-2">
                <div className="min-w-0 flex-1 basis-32">
                  <p className="truncate text-sm font-medium text-ink" title={p.name}>{p.name}</p>
                  <p className="truncate text-xs text-ink-mute" title={line}>{line}</p>
                </div>
                {listed ? null : listable(p)
                  ? <Button variant="outline" size="sm" aria-label={`Add to my list: ${p.name}`} loading={adding === key} loadingText="Adding…" disabled={adding !== null && adding !== key} onClick={() => onAdd(p)}><Icon name="plus" />Add to my list</Button>
                  : <span className="min-w-0 basis-full text-xs text-ink-mute">{NO_FOLDER}</span>}
              </li>
            );
          })}
        </ul>
      ) : <p className="text-xs text-ink-mute">No plugins installed here.</p>}
      {error ? <RefusalLine>{error}</RefusalLine> : null}
      {note ? <p ref={noteRef} role="status" tabIndex={-1} className="text-xs text-ink-mute outline-none">{note}</p> : null}
    </section>
  );
}

export function HarnessInspector({ targetId, open, onOpenChange }: HarnessInspectorProps) {
  const { snapshot, request } = useRegistry();
  const { adopt } = useSync();
  const notify = useNotify();
  const { add, adding } = useAddToList();
  const formId = React.useId();
  const refs = useFieldRefs();
  const [held, setHeld] = React.useState<Session>(() => fresh(open, targetId));
  const [saving, setSaving] = React.useState(false);
  const [stopping, setStopping] = React.useState(false);
  const latest = React.useRef(snapshot);
  latest.current = snapshot;

  const find = (id: string): Target | undefined => snapshot?.registry.targets.find(t => t.id === id);
  // A new opening starts from the registry; so does another harness when the form has no changes. With changes the inspector stays on the harness it shows, and asks (`switching`).
  let session = held;
  if (open !== held.open || (open && targetId !== held.id && !dirtyOf(held.edits, find(held.id)))) {
    session = fresh(open, targetId);
    setHeld(session);
  }
  const target = find(session.id);
  const form: Form | null = target ? { ...formOf(target), ...session.edits } : null;
  const dirty = dirtyOf(session.edits, target);
  const switching = open && targetId !== session.id;
  const discarding = session.confirm === 'discard' || (switching && session.declined !== targetId);
  const patch = (next: Partial<Session>): void => setHeld(now => ({ ...now, ...next }));
  const edit = (values: Partial<Form>): void => setHeld(now => ({ ...now, edits: { ...now.edits, ...values } }));
  /** What is wrong with the form, shown from the first try to save on and kept up to date while the person types. */
  const shown: HarnessProblems = session.tried && form ? harnessProblems(form) : {};

  // The harness is gone (removed from here, from another window or by the worker): there is nothing to show, and the parent is told.
  React.useEffect(() => { if (open && snapshot && !target) onOpenChange(false); }, [open, snapshot, target, onOpenChange]);
  // On opening the keyboard goes to the name, and back to where it was when it closes (the header that opened it: a docked inspector only hides).
  const opener = React.useRef<HTMLElement | null>(null);
  const present = !!target;
  React.useEffect(() => {
    if (!session.open || !present) return;
    if (!opener.current && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) opener.current = document.activeElement;
    let frames = 0, frame = 0;
    const tick = (): void => {
      const field = refs.name.current;
      if (field?.isConnected && field.getClientRects().length > 0) field.focus();
      else if (frames++ < 20) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [session.open, session.id, present, refs]);
  const was = React.useRef(session.open);
  React.useEffect(() => {
    if (was.current && !session.open && opener.current?.isConnected) opener.current.focus();
    if (!session.open) opener.current = null;
    was.current = session.open;
  }, [session.open]);

  /** Closes, or asks once when there are changes. A save, a removal, or a confirm already open holds it back. */
  function requestClose(): void {
    if (saving || stopping || session.confirm !== null) return;
    if (dirty) patch({ confirm: 'discard' });
    else onOpenChange(false);
  }
  function keepEditing(): void { patch(switching ? { confirm: null, declined: targetId } : { confirm: null }); }
  function discard(): void {
    if (session.confirm === 'discard') onOpenChange(false);
    else if (switching) setHeld(fresh(true, targetId));
  }
  // Escape closes the inspector from wherever the focus is inside it, its foot too (Sigrid's docked one does not close itself; the drawer's own Esc asks the same). Not what a list open over it
  // took: that one's keys are in a layer of the page, outside the inspector.
  const closing = React.useRef(requestClose);
  closing.current = requestClose;
  const region = React.useRef<HTMLFormElement>(null);
  const note = React.useRef<HTMLParagraphElement>(null);
  React.useEffect(() => {
    if (!session.open) return;
    const listen = (event: KeyboardEvent): void => {
      const inspector = region.current?.closest('[data-inspector-form]');
      if (event.key !== 'Escape' || event.defaultPrevented || !inspector || !(event.target instanceof Node) || !inspector.contains(event.target)) return;
      event.preventDefault();
      closing.current();
    };
    document.addEventListener('keydown', listen);
    return () => document.removeEventListener('keydown', listen);
  }, [session.open, present]);

  async function save(): Promise<void> {
    patch({ tried: true });
    const registry = latest.current;
    if (saving || !target || !form || !registry || !dirty) return;
    if (focusFirst(harnessProblems(form), refs)) return;
    setSaving(true);
    patch({ saveError: null });
    try {
      const next: Target = { ...target, name: form.name.trim(), harness: form.harness, root: form.root.trim(), executable: form.executable.trim(), enabled: form.enabled, exclusive: form.exclusive };
      adopt(await registryWrite(request, registry.registry.revision, 'save_target', { target: next }));
      notify(`${next.name} saved.`);
      onOpenChange(false);
    } catch (e) { patch({ saveError: message(e) }); }
    finally { setSaving(false); }
  }

  /** The service refuses to remove a harness that a plugin still lists, so the plugins that list it are saved without it first, one after the other, each on the revision the one before returned; then
   * the harness goes. A failure says how many plugins were already taken off it, and those stay saved. The snapshot of the last write is adopted once, so the plan is asked for once. */
  async function stop(): Promise<void> {
    const registry = latest.current;
    if (stopping || !target || !registry) return;
    setStopping(true);
    patch({ stopError: null });
    let revision = registry.registry.revision, last: Snapshot | undefined, detached = 0;
    try {
      for (const p of registry.registry.plugins.filter(p => p.targets.includes(target.id))) {
        last = await registryWrite(request, revision, 'save_plugin', { plugin: { ...p, targets: p.targets.filter(id => id !== target.id) } });
        revision = last.registry.revision;
        detached++;
      }
      adopt(await registryWrite(request, revision, 'remove_target', { id: target.id }));
      notify(`Muro no longer manages ${target.name}.`);
      onOpenChange(false);
    } catch (e) {
      if (last) adopt(last);
      patch({ stopError: `${detached ? `${plural(detached, 'plugin')} no longer ${detached === 1 ? 'lists' : 'list'} ${target.name}. ` : ''}${target.name} was not removed: ${message(e)}` });
    } finally { setStopping(false); }
  }

  async function addToList(installed: InstalledPlugin): Promise<void> {
    if (!target) return;
    patch({ listError: null, listNote: null });
    const result = await add(installed, target, true);
    if (!result) return;
    patch(result.error ? { listError: result.error } : { listNote: added(installed) });
    // The button that was pressed is gone with the line it was on: the keyboard goes to what says it was done.
    if (!result.error) requestAnimationFrame(() => note.current?.focus());
  }

  const times = target ? snapshot?.sync.targets[target.id] : undefined;
  return (
    <>
      <Inspector
        title={target?.name ?? 'Harness'}
        open={open && !!target}
        // Sigrid's docked inspector answers Escape in React's handler and asks here. The question it opens would hear that same Escape (Base UI's dialog listens on the document, which
        // the key has not reached yet) and close at once: so the question waits until the key is dispatched.
        onOpenChange={next => { if (!next) setTimeout(() => closing.current(), 0); }}
        footer={target ? (
          <div className="flex w-full flex-wrap items-center gap-2">
            <Button variant="outline" className="text-destructive" disabled={saving} onClick={() => patch({ confirm: 'stop', stopError: null })}>Stop managing</Button>
            <div className="ms-auto flex items-center gap-2">
              <Button variant="outline" onClick={requestClose}>Cancel</Button>
              <Button variant="secondary" type="submit" form={formId} loading={saving} loadingText="Saving…" disabled={!dirty}>Save</Button>
            </div>
          </div>
        ) : undefined}
      >
        {target && form && snapshot ? (
          <form ref={region} id={formId} noValidate onSubmit={event => { event.preventDefault(); void save(); }} className="flex flex-col gap-4">
            <p className="text-xs text-ink-mute">{`Checked ${stamp(times?.checked ?? null)} · last sync ${stamp(times?.synced ?? null)}`}</p>
            <HarnessFields values={form} problems={shown} refs={refs} onChange={values => edit(values)} />
            <CheckRow id={`${formId}-enabled`} label="Keep this harness in sync" help="Switch off to pause: Muro leaves it alone." checked={form.enabled} onChange={enabled => edit({ enabled })} />
            <CheckRow id={`${formId}-exclusive`} label="Uninstall plugins that are not in my list" help="Muro asks before it uninstalls. Only on this harness." checked={form.exclusive} onChange={exclusive => edit({ exclusive })} />
            <InstalledHere snapshot={snapshot} target={target} adding={adding} error={session.listError} note={session.listNote} noteRef={note} onAdd={installed => void addToList(installed)} />
            {session.saveError ? <NotSaved text={session.saveError} /> : null}
          </form>
        ) : null}
      </Inspector>
      <Dialog
        open={discarding}
        onOpenChange={next => { if (!next) keepEditing(); }}
        title={`Discard changes to ${target?.name ?? 'this harness'}?`}
        description="What you changed is not saved yet."
        footer={(
          <>
            <Button variant="outline" onClick={keepEditing}>Keep editing</Button>
            <Button variant="destructive" onClick={discard}>Discard changes</Button>
          </>
        )}
      />
      <Dialog
        open={session.confirm === 'stop'}
        onOpenChange={next => { if (!next && !stopping) patch({ confirm: null, stopError: null }); }}
        title={`Stop managing ${target?.name ?? 'this harness'}?`}
        description="Its plugins stay installed. Muro only stops syncing it."
        footer={(
          <>
            <Button variant="outline" disabled={stopping} onClick={() => patch({ confirm: null, stopError: null })}>Cancel</Button>
            <Button variant="destructive" loading={stopping} loadingText="Stopping…" onClick={() => void stop()}>{`Stop managing ${target?.name ?? 'this harness'}`}</Button>
          </>
        )}
      >
        {session.stopError ? <RefusalLine>{session.stopError}</RefusalLine> : null}
      </Dialog>
    </>
  );
}
