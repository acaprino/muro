import type { ViewState, ProjectInfo, Snapshot, Plugin } from '../../types.ts';
import type { App, Actions } from '../../context.ts';
import { cellState, CHANGES, stamp } from '../../model.ts';
import { esc, plural, mark, tag, sw, button, empty } from '../../ui.ts';
import { cell } from '../sync.ts';

/** The registry plugin that is the build of this project: the one that names it. It exists once the project was installed on a harness. */
const pluginOf = (state: ViewState, id: string): Plugin | undefined => state.snapshot?.registry.plugins.find(p => p.project === id);
const managed = (state: ViewState) => state.snapshot!.registry.targets.filter(t => t.enabled);

/** Where a project is installed and what waits, in a line: the harnesses its plugin is switched on for (a paused one does not count) and what the Sync table would
 * show on them: changes waiting, a harness with no version of it, one that cannot be read; "in sync" only when none of those. */
export function installLine(state: ViewState, id: string): string {
  const plugin = pluginOf(state, id), s = state.snapshot;
  const on = plugin && s ? managed(state).filter(t => plugin.targets.includes(t.id)) : [];
  if (!plugin || !on.length) return 'Not installed anywhere';
  const kinds = managed(state).map(t => cellState(plugin, t, s!, state.plan).kind);
  const count = (wanted: (kind: string) => boolean) => kinds.filter(wanted).length, waiting = count(k => CHANGES.has(k)), missing = count(k => k === 'needs-build'), unknown = count(k => k === 'unknown');
  const parts = [waiting ? `${plural(waiting, 'change')} waiting` : '', missing ? `no version for ${plural(missing, 'harness', 'harnesses')}` : '', unknown ? `${unknown} to check` : ''].filter(Boolean);
  return `On ${plural(on.length, 'harness', 'harnesses')} · ${parts.join(' · ') || 'in sync'}`;
}

/** Step 4. A switch per managed harness; what is waiting is reviewed in the sheet of Sync, which lists the whole plan (the service plans per harness or for all, never for one plugin). */
export function view(state: ViewState, info: ProjectInfo): string {
  const s = state.snapshot!, plugin = pluginOf(state, state.project!.id), targets = s.registry.targets;
  const waiting = plugin ? managed(state).filter(t => CHANGES.has(cellState(plugin, t, s, state.plan).kind)).length : 0;
  const row = (t: typeof targets[number]) => {
    const times = s.sync.targets[t.id], on = !!plugin?.targets.includes(t.id);
    return `<li>${t.enabled ? sw(on, `Install ${info.plugin.name} on ${t.name}`, 'toggle-harness', t.id) : tag('Paused')}${mark(t.harness)}<div class="grow"><strong>${esc(t.name)}</strong><small>Checked ${esc(stamp(times?.checked ?? null))} · last sync ${esc(stamp(times?.synced ?? null))}</small></div>${t.enabled ? (plugin ? cell(state, plugin, t) : '<span class="muted" aria-label="Not installed here">—</span>') : ''}</li>`;
  };
  return `<div class="tools"><div><h2>Where it is installed</h2><small>Switch a harness on to install this project there. Nothing changes until you apply.</small></div><div class="acts">${waiting ? button(`Review ${plural(waiting, 'change')}`, 'review', { primary: true }) : ''}${button('Open Sync', 'page', { id: 'sync' })}</div></div>`
    + (targets.length ? `<ul class="card list">${targets.map(row).join('')}</ul>` : empty('No harness managed yet', 'Add one in Sync.', button('Open Sync', 'page', { id: 'sync', primary: true })));
}

/** A harness switched on: the project's build for it is put in the list (`install_project`, which gets every harness the plugin is on, so a build that is there stays), and
 * the harness is set as a target of the plugin when the runtime did not already. Off: the harness leaves the plugin's targets and nothing is installed. The runtime's answer to
 * `install_project` is not relied on: the snapshot is read again. Nothing reaches a harness until the review sheet applies it. */
async function toggle(app: App, d: DOMStringMap): Promise<void> {
  const { state } = app, pv = state.project, s = state.snapshot, t = s?.registry.targets.find(x => x.id === d.id);
  if (!pv || !s || !t || !t.enabled) return;
  const plugin = pluginOf(state, pv.id), on = !!plugin?.targets.includes(t.id);
  await app.run(on ? `Taking ${pv.id} off ${t.name}…` : `Preparing ${pv.id} for ${t.name}…`, async () => {
    if (plugin && on) return app.request<Snapshot>('save_plugin', { plugin: { ...plugin, targets: plugin.targets.filter(x => x !== t.id) }, revision: s.registry.revision });
    const kinds = [...new Set([...(plugin?.targets ?? []).map(id => s.registry.targets.find(x => x.id === id)?.harness).filter((h): h is string => !!h), t.harness])];
    await app.request('install_project', { id: pv.id, harnesses: kinds });
    const read = await app.request<Snapshot>('snapshot'), made = read.registry.plugins.find(p => p.project === pv.id);
    if (!made) throw new Error(`${pv.id} was not added to your list`);
    return made.targets.includes(t.id) ? read : app.request<Snapshot>('save_plugin', { plugin: { ...made, targets: [...made.targets, t.id] }, revision: read.registry.revision });
  }, v => app.adopt(v));
}
export const actions: Actions = { 'toggle-harness': toggle };
