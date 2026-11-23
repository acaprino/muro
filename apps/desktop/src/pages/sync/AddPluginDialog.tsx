import * as React from 'react';
import { Button, Dialog } from '@acaprino/sigrid';
import type { Snapshot, Target } from '../../types.ts';
import { useNotify } from '../../state/notices.tsx';
import { useRegistry } from '../../state/registry.tsx';
import { message } from '../../words.ts';
import { NotSaved } from '../project/write/DetailsDialog.tsx';
import { DISCARD_NOTE, DiscardFooter, PluginFields, changed, fieldId, focusProblem, formOf, newPlugin, nextForm, problemsOf, revisionOf } from './PluginDialog.tsx';
import type { PluginForm } from './PluginDialog.tsx';
import { registryWrite } from './registryWrite.ts';
import { useSync } from './useSync.tsx';

/** Add plugin: a plugin by its source (a repository address or a folder on this computer), the harnesses it is installed on and how it is updated, in a drawer. It saves the plugin
 * (`save_plugin`, on the registry revision the window holds, once more on the new one when the registry moved) and then checks its source (`resolve`), so the row opens with the version the source
 * has and the builds it carries; Check now would have done it later. The fields, what is wrong with them and the way a form becomes a plugin are `PluginDialog.tsx`'s: one copy.
 *
 * The plugin is added once the save is answered. A source that cannot be resolved does not take it back: the notice says so, with the service's words, and Check for updates in the plugin's drawer
 * tries again. The id of the plugin is made when the drawer opens, so a second Add after a request that failed on the way replaces the plugin and never lists it twice.
 * What the person typed is asked about once when they leave; a refusal or a failure is said inside the drawer, never in a notice, which covers the drawer's buttons. */

/** A drawer's session: whether it is open, the id the plugin will have, the form, whether Add was tried (the problems show from then on), the question before leaving, and Advanced. */
interface Session { open: boolean; id: string; base: PluginForm; form: PluginForm; tried: boolean; asking: boolean; advanced: boolean; fault: string | null }
const opened = (open: boolean, targets: readonly Target[]): Session => {
  const form = formOf(null, targets);
  return { open, id: crypto.randomUUID(), base: form, form, tried: false, asking: false, advanced: false, fault: null };
};
const NO_TARGETS: readonly Target[] = [];

export interface AddPluginDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}

export function AddPluginDialog({ open, onOpenChange }: AddPluginDialogProps) {
  const { snapshot, request } = useRegistry();
  const sync = useSync();
  const notify = useNotify();
  const ids = React.useId();
  const formId = `${ids}-form`;
  const targets = snapshot?.registry.targets ?? NO_TARGETS;

  /** The control the drawer was opened from, and the name of the plugin it added (null until it did): when that control is gone with the empty list, the focus goes to the new row. */
  const opener = React.useRef<HTMLElement | null>(null);
  const added = React.useRef<string | null>(null);

  // A drawer that opens is a new form, and what was typed in the last one is not kept; one that closes keeps what it showed until it is gone.
  const [held, setHeld] = React.useState<Session>(() => opened(open, targets));
  let session = held;
  if (open && !held.open) {
    session = opened(true, targets);
    opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    added.current = null;
  } else if (open !== held.open) session = { ...held, open };
  if (session !== held) setHeld(session);
  const { id, base, form, tried, asking, advanced, fault } = session;
  const patch = (p: Partial<Session>): void => setHeld(now => ({ ...now, ...p }));
  const change = (p: Partial<PluginForm>): void => setHeld(now => ({ ...now, form: nextForm(now.form, p) }));
  const dirty = changed(base, form);
  const problems = tried ? problemsOf(form) : {};

  /** What the request is doing: saving the plugin, then checking its source. */
  const [phase, setPhase] = React.useState<'saving' | 'checking' | null>(null);
  const busy = React.useRef(false);
  const live = React.useRef(true);
  React.useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const latest = React.useRef({ snapshot, request, adopt: sync.adopt, notify });
  latest.current = { snapshot, request, adopt: sync.adopt, notify };

  /** Every way out of the drawer: Escape, the close button, a press outside and Cancel. With changes it asks once; asked, it is Keep editing. */
  function leave(): void {
    if (busy.current) return;
    if (asking) { keep(); return; }
    if (dirty) { patch({ asking: true, fault: null }); return; }
    onOpenChange(false);
  }
  function keep(): void {
    patch({ asking: false });
    requestAnimationFrame(() => document.getElementById(fieldId(ids, 'source'))?.focus());
  }

  async function add(): Promise<void> {
    patch({ tried: true });
    if (busy.current) return;
    const found = problemsOf(form);
    if (Object.keys(found).length) { focusProblem(ids, form, found); return; }
    busy.current = true;
    setPhase('saving');
    patch({ fault: null });
    const plugin = newPlugin(id, form, latest.current.snapshot?.registry.targets ?? targets);
    try {
      let saved: Snapshot;
      try {
        const now = latest.current;
        saved = await registryWrite(now.request, await revisionOf(now.request, now.snapshot), 'save_plugin', { plugin });
      } catch (e) {
        if (live.current) patch({ fault: message(e) });
        return;
      }
      // From here the plugin is in the list. Its source is checked now; the window takes one snapshot, the last, so it plans once.
      if (live.current) setPhase('checking');
      let after = saved, unresolved: string | null = null;
      try { after = await latest.current.request<Snapshot>('resolve', { id: plugin.id }); }
      catch (e) { unresolved = message(e); }
      added.current = plugin.name;
      latest.current.adopt(after);
      if (unresolved === null) latest.current.notify(`${plugin.name} added to your list.`);
      else latest.current.notify(`${plugin.name} was added to your list, but its source could not be checked: ${unresolved}`, 'error');
      if (live.current) onOpenChange(false);
    } finally {
      busy.current = false;
      if (live.current) setPhase(null);
    }
  }

  return (
    <Dialog
      drawer
      open={open}
      onOpenChange={next => { if (next) onOpenChange(true); else leave(); }}
      // The focus goes back to the button this drawer was opened from. The drawer cannot tell it by itself: its Source field takes the focus as it mounts, before Sigrid's sheet records
      // what had the focus, so the sheet would give it back to a field that is gone.
      restoreFocusTo={opener}
      onCloseAutoFocus={event => {
        if (opener.current?.isConnected) return;
        // That button is gone when the list was empty (its empty state went with the first plugin): the focus goes to the row of the plugin that was added, else to the page.
        event.preventDefault();
        const name = added.current;
        const main = document.querySelector<HTMLElement>('[data-slot="app-shell-content"]');
        const row = name !== null && main ? Array.from(main.querySelectorAll<HTMLElement>('button')).find(b => b.textContent?.trim() === name) : undefined;
        (row ?? main)?.focus();
      }}
      title={asking ? 'Discard changes to the new plugin?' : 'Add a plugin'}
      description={asking ? DISCARD_NOTE : 'A plugin installed as its author ships it.'}
      footer={asking ? <DiscardFooter key="discard" onKeep={keep} onDiscard={() => onOpenChange(false)} /> : (
        <React.Fragment key="form">
          <Button variant="outline" disabled={phase !== null} onClick={leave}>Cancel</Button>
          <Button type="submit" form={formId} loading={phase !== null} loadingText={phase === 'checking' ? 'Checking the source…' : 'Adding…'}>Add plugin</Button>
        </React.Fragment>
      )}
    >
      {asking ? null : (
        <form key="form" id={formId} noValidate className="flex flex-col gap-4" onSubmit={e => { e.preventDefault(); void add(); }}>
          <PluginFields ids={ids} form={form} onChange={change} problems={problems} targets={targets} saved={false} advanced={advanced} onAdvanced={value => patch({ advanced: value })} />
          {fault ? <NotSaved text={fault} /> : null}
        </form>
      )}
    </Dialog>
  );
}
