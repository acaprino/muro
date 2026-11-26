import * as React from 'react';
import { Button, Cell, Column, Text } from '@acaprino/sigrid/primitives';
import { Dialog } from '@acaprino/sigrid/components';
import type { Plugin, Snapshot, Target } from '../../types.ts';
import { useNotify } from '@acaprino/imago';
import { useRegistry } from '../../state/registry.tsx';
import { message } from '../../words.ts';
import { NotSaved } from '../project/write/DetailsDialog.tsx';
import { RefusalLine } from '../project/write/HarmonizeDialog.tsx';
import { BuildAvailability, DISCARD_NOTE, DiscardFooter, PluginFields, changed, fieldId, focusProblem, formOf, harnessList, newPlugin, nextForm, problemsOf, revisionOf } from './PluginDialog.tsx';
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
type SourceFields = Pick<PluginForm, 'source' | 'name'>;
const opened = (open: boolean, targets: readonly Target[], initial?: SourceFields): Session => {
  const form = formOf(null, targets);
  if (initial) Object.assign(form, initial, { named: true });
  return { open, id: crypto.randomUUID(), base: form, form, tried: false, asking: false, advanced: false, fault: null };
};
const NO_TARGETS: readonly Target[] = [];

interface SourceBuilds { harnesses: string[]; project_version: string | null }
/** Remounted for each source, policy, pin and form session so an earlier request cannot describe a new source. */
function SourcePreview({ plugin, disabled }: { plugin: Plugin; disabled: boolean }) {
  const { request } = useRegistry();
  const [builds, setBuilds] = React.useState<SourceBuilds | null>(null);
  const [failure, setFailure] = React.useState('');
  const [checking, setChecking] = React.useState(false);
  const pending = React.useRef(false);
  async function check(): Promise<void> {
    if (pending.current) return;
    pending.current = true;
    setChecking(true);
    setBuilds(null);
    setFailure('');
    try { setBuilds(await request<SourceBuilds>('inspect_plugin_source', { plugin })); }
    catch (e) { setFailure(message(e)); }
    finally { pending.current = false; setChecking(false); }
  }
  return <Column as="section" gap="xs" aria-label="Source preview">
    <Cell align="start"><Button type="button" variant="outline" size="sm" loading={checking} loadingText="Checking…"
      disabled={disabled || !plugin.source || (plugin.policy === 'pinned' && !plugin.pinned_version)} onClick={() => void check()}>Check source</Button></Cell>
    {builds ? <Column gap="xs" role="status">
      <Text variant="strong">{builds.project_version ? `Project file · ${builds.project_version}` : 'Published builds'}</Text>
      <BuildAvailability harnesses={builds.harnesses} />
    </Column> : null}
    {failure ? <RefusalLine>{failure}</RefusalLine> : null}
  </Column>;
}

function addedNotice(plugin: Plugin, targets: readonly Target[]): string {
  let notice = `${plugin.name} added to your list.`;
  const archive = plugin.resolved_project;
  if (!archive) return notice;
  notice += archive.harnesses.length ? ` The .mp includes ${harnessList(archive.harnesses)}.` : ' The .mp has no harness builds.';
  const selected = targets.filter(t => t.enabled && plugin.targets.includes(t.id));
  if (!selected.length) return notice + (targets.some(t => t.enabled && archive.harnesses.includes(t.harness))
    ? ' Choose Select for sync under the harness you want.' : ' Add a compatible harness in Sync.');
  if (!selected.some(t => archive.harnesses.includes(t.harness))) return notice + ' The selected harnesses need other builds.';
  return notice + ' The Sync table shows the next action for each harness.';
}

export interface AddPluginDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  initial?: SourceFields;
}

export function AddPluginDialog({ open, onOpenChange, initial }: AddPluginDialogProps) {
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
  const [held, setHeld] = React.useState<Session>(() => opened(open, targets, initial));
  let session = held;
  if (open && !held.open) {
    session = opened(true, targets, initial);
    opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    added.current = null;
  } else if (open !== held.open) session = { ...held, open };
  if (session !== held) setHeld(session);
  const { id, base, form, tried, asking, advanced, fault } = session;
  const patch = (p: Partial<Session>): void => setHeld(now => ({ ...now, ...p }));
  const change = (p: Partial<PluginForm>): void => setHeld(now => ({ ...now, form: nextForm(now.form, p) }));
  const dirty = changed(base, form);
  const problems = tried ? problemsOf(form) : {};

  const [saving, setSaving] = React.useState(false);
  const busy = React.useRef(false);
  const live = React.useRef(true);
  React.useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const latest = React.useRef({ snapshot, request, resolveAdded: sync.resolveAdded, notify });
  latest.current = { snapshot, request, resolveAdded: sync.resolveAdded, notify };

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
    setSaving(true);
    patch({ fault: null });
    const plugin = newPlugin(id, form, latest.current.snapshot?.registry.targets ?? targets);
    try {
      const now = latest.current;
      const saved = await registryWrite(now.request, await revisionOf(now.request, now.snapshot), 'save_plugin', { plugin });
      added.current = plugin.name;
      void now.resolveAdded(saved, plugin.id).then(
        after => now.notify(addedNotice(after.registry.plugins.find(p => p.id === plugin.id) ?? plugin, after.registry.targets)),
        e => now.notify(`${plugin.name} was added to your list, but its source could not be checked: ${message(e)}`, { kind: 'error' }),
      );
      if (live.current) onOpenChange(false);
    } catch (e) {
      if (live.current) patch({ fault: message(e) });
    } finally {
      busy.current = false;
      if (live.current) setSaving(false);
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
      description={asking ? DISCARD_NOTE : 'Choose a source and the harnesses you use. Muro checks the source for a build for each harness.'}
      footer={asking ? <DiscardFooter key="discard" onKeep={keep} onDiscard={() => onOpenChange(false)} /> : (
        <React.Fragment key="form">
          <Button variant="outline" disabled={saving} onClick={leave}>Cancel</Button>
          <Button type="submit" form={formId} loading={saving} loadingText="Adding…">Add plugin</Button>
        </React.Fragment>
      )}
    >
      {asking ? null : (
        <form key="form" id={formId} noValidate onSubmit={e => { e.preventDefault(); void add(); }}><Column gap="lg">
          <PluginFields ids={ids} form={form} onChange={change} problems={problems} targets={targets} saved={false} advanced={advanced} onAdvanced={value => patch({ advanced: value })}
            sourcePreview={<SourcePreview key={JSON.stringify([id, form.source.trim(), form.policy, form.pinned.trim()])} plugin={newPlugin(id, form, targets)} disabled={saving} />} />
          {fault ? <NotSaved text={fault} /> : null}
        </Column></form>
      )}
    </Dialog>
  );
}
