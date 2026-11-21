import type { ViewState, ProjectInfo, Snapshot, Plugin, Target, InstalledPlugin } from '../../types.ts';
import type { App, Actions } from '../../context.ts';
import { cellState, currentPlan, CHANGES, stamp } from '../../model.ts';
import { esc, plural, mark, tag, sw, button, empty } from '../../ui.ts';
import { cell } from '../sync.ts';
import { stackListHtml, stackRowHtml, toolbarHtml } from '@acaprino/imago/ui';

/** The registry plugin that is the build of this project: the one that names it. It exists once the project was installed on a harness. */
const pluginOf = (state: ViewState, id: string): Plugin | undefined => state.snapshot?.registry.plugins.find(p => p.project === id);
const managed = (state: ViewState) => state.snapshot!.registry.targets.filter(t => t.enabled);
/** The ids of the harnesses a plugin is switched on for: its targets that are managed. A paused harness shows no switch, so no request names it. */
const switchedOn = (state: ViewState, plugin: Plugin | undefined): string[] => plugin ? managed(state).filter(t => plugin.targets.includes(t.id)).map(t => t.id) : [];

/** A copy of the project's plugin on a harness that is not this project's build: installed there under the plugin's own name (`plugin_name` of the harness's inventory; a project's id is its plugin's slug,
 * the name its builds declare), by the person or by another plugin of the list, where the project has no copy of its own. Switching the harness on (or installing again, on a harness that is on
 * and could not be read when it was switched on) takes it over: the next sync replaces it with this project's build instead of installing a second copy beside it. A harness that was not read completely shows none. */
function copyOf(state: ViewState, id: string, plugin: Plugin | undefined, t: Target): InstalledPlugin | undefined {
  const inventory = state.snapshot?.inventory.find(i => i.target_id === t.id && i.complete);
  if (!inventory || (plugin && inventory.plugins.some(i => i.registry_id === plugin.id))) return undefined;
  return inventory.plugins.find(i => i.plugin_name === id && i.present !== false);
}
/** Whose the copy is, in the words of the row: a plugin of the list, or the person's own installation. */
function copyWords(state: ViewState, copy: InstalledPlugin): string {
  const owner = copy.registry_id ? state.snapshot?.registry.plugins.find(p => p.id === copy.registry_id) : undefined;
  return `Installed${copy.version ? ` ${copy.version}` : ''}, not from this project${owner ? ` (${owner.name} in your list)` : ''}${copy.enabled === false ? ' · switched off' : ''}`;
}

/** What the service says of a build made from a project file that is not the file as it is now (`Currency::check` of the registry, which the plan words as a blocker of one plugin on one harness: `<harness> / <plugin>: Project file changed: ...`). */
const CHANGED = 'Project file changed';
/** Whether the plan holds this plugin back on this harness because its project file changed since the build the harness was given was made. The words are the registry's: nothing here judges what a file holds. */
const changed = (state: ViewState, plugin: Plugin, t: Target): boolean => !!state.snapshot && !!currentPlan(state.snapshot, state.plan)?.blockers.some(b => b.startsWith(`${t.name} / ${plugin.name}:`) && b.includes(CHANGED));

/** Where a project is installed and what waits, in a line: the harnesses its plugin is switched on for (a paused one does not count), those that hold a copy of it that is not
 * this project's build, and what the Sync table would show on them: changes waiting, a build older than its file (install again), a harness with no version of it, one that cannot
 * be read, a copy not from this project; "in sync" only when none of those. */
export function installLine(state: ViewState, id: string): string {
  const plugin = pluginOf(state, id), s = state.snapshot;
  if (!s) return 'Not installed anywhere';
  const on = plugin ? managed(state).filter(t => plugin.targets.includes(t.id)) : [], held = managed(state).filter(t => copyOf(state, id, plugin, t)), copies = held.length;
  const where = on.length + held.filter(t => !on.includes(t)).length;
  if (!where) return 'Not installed anywhere';
  const kinds = plugin ? managed(state).map(t => cellState(plugin, t, s, state.plan).kind) : [];
  const count = (wanted: (kind: string) => boolean) => kinds.filter(wanted).length, waiting = count(k => CHANGES.has(k)), missing = count(k => k === 'needs-build'), unknown = count(k => k === 'unknown');
  const stale = plugin ? on.filter(t => changed(state, plugin, t)).length : 0;
  const parts = [waiting ? `${plural(waiting, 'change')} waiting` : '', stale ? `${plural(stale, 'harness', 'harnesses')} to install again` : '', missing ? `no version for ${plural(missing, 'harness', 'harnesses')}` : '', unknown ? `${unknown} to check` : '', copies ? `${copies} not from this project` : ''].filter(Boolean);
  return `On ${plural(where, 'harness', 'harnesses')} · ${parts.join(' · ') || 'in sync'}`;
}

/** Step 4. A switch per managed harness; what is waiting is reviewed in the sheet of Sync, which lists the whole plan (the service plans per harness or for all, never for one plugin). A harness whose build is older than the project file reads "Changed since it was installed: install again", with the button that does it.
 * A harness that holds a copy of the plugin that is not this project's build shows it installed (where the project is not switched on, the switch is on and cannot be switched off here: the copy is not this project's to remove), says whose it is, and offers to replace it with this project's build. */
export function view(state: ViewState, info: ProjectInfo): string {
  const s = state.snapshot!, id = state.project!.id, plugin = pluginOf(state, id), targets = s.registry.targets;
  const waiting = plugin ? managed(state).filter(t => CHANGES.has(cellState(plugin, t, s, state.plan).kind)).length : 0;
  const row = (t: typeof targets[number]) => {
    const times = s.sync.targets[t.id], on = !!plugin?.targets.includes(t.id), stale = on && !!plugin && changed(state, plugin, t), copy = t.enabled ? copyOf(state, id, plugin, t) : undefined;
    const status = !t.enabled ? ''
      : copy ? `<span class="im-text-warn">${esc(copyWords(state, copy))}</span>${button("Use this project's build", on ? 'install-again' : 'toggle-harness', { sm: true, id: t.id, attrs: { 'aria-label': `Replace the copy on ${t.name} with this project's build of ${info.plugin.name}` } })}`
      : !plugin ? '<span class="im-muted" aria-label="Not installed here">—</span>'
      : stale ? `<span class="im-text-warn">Changed since it was installed: install again</span>${button('Install again', 'install-again', { sm: true, id: t.id, attrs: { 'aria-label': `Install ${info.plugin.name} again on ${t.name}` } })}`
      : cell(state, plugin, t);
    const toggle = !t.enabled ? tag('Paused') : copy && !on ? sw(true, `${info.plugin.name} is installed on ${t.name}, not from this project`, 'toggle-harness', t.id, true) : sw(on, `Install ${info.plugin.name} on ${t.name}`, 'toggle-harness', t.id);
    return stackRowHtml({title:t.name,detail:`Checked ${stamp(times?.checked??null)} · last sync ${stamp(times?.synced??null)}`,leadingHtml:toggle+mark(t.harness),trailingHtml:status});
  };
  return toolbarHtml('<div><h2>Where it is installed</h2><small>Switch a harness on to install this project there. Nothing changes until you apply.</small></div>',
    (waiting?button(`Review ${plural(waiting,'change')}`,'review',{primary:true}):'')+button('Open Sync','page',{id:'sync'}))
    + (targets.length ? stackListHtml(targets.map(row).join('')) : empty('No harness managed yet', 'Add one in Sync.', button('Open Sync', 'page', { id: 'sync', primary: true })));
}

/** The project's build put on the targets named (`install_project {id, targets}`): the runtime makes exactly those ids the plugin's targets and a build for each kind of them, from the file as it is now. The page saves nothing itself. The runtime's answer is not relied on: the snapshot is read again, and says so when the plugin is not there or lacks a target it was asked for. Nothing reaches a harness until the review sheet applies it. */
async function put(app: App, id: string, targets: string[]): Promise<Snapshot> {
  await app.request('install_project', { id, targets });
  const read = await app.request<Snapshot>('snapshot'), made = read.registry.plugins.find(p => p.project === id);
  if (!made) throw new Error(`${id} was not added to your list`);
  for (const wanted of targets) if (!made.targets.includes(wanted)) throw new Error(`${id} was not set up for ${read.registry.targets.find(x => x.id === wanted)?.name ?? wanted}`);
  return read;
}
/** A harness switched on: `install_project` gets the ids of every switch that is on, this one with them, so a build that is there stays and a harness that was switched off stays off.
 * A copy of the plugin that is there and not this project's is taken over by the runtime, which says so in the review of the next sync (an update of that copy). Off: the harness leaves the plugin's targets and nothing is installed. */
async function toggle(app: App, d: DOMStringMap): Promise<void> {
  const { state } = app, pv = state.project, s = state.snapshot, t = s?.registry.targets.find(x => x.id === d.id);
  if (!pv || !s || !t || !t.enabled) return;
  const plugin = pluginOf(state, pv.id), on = !!plugin?.targets.includes(t.id);
  await app.run(on ? `Taking ${pv.id} off ${t.name}…` : `Preparing ${pv.id} for ${t.name}…`, async () => {
    if (plugin && on) return app.request<Snapshot>('save_plugin', { plugin: { ...plugin, targets: plugin.targets.filter(x => x !== t.id) }, revision: s.registry.revision });
    return put(app, pv.id, [...switchedOn(state, plugin), t.id]);
  }, v => app.adopt(v));
}
/** "Install again" on a harness whose build is older than the project file: the same request, for the harnesses that are on, which takes the file as it is now. */
async function again(app: App, d: DOMStringMap): Promise<void> {
  const { state } = app, pv = state.project, t = state.snapshot?.registry.targets.find(x => x.id === d.id);
  if (!pv || !t || !t.enabled) return;
  const targets = switchedOn(state, pluginOf(state, pv.id));
  if (!targets.includes(t.id)) return;
  await app.run(`Installing ${pv.id} again for ${t.name}…`, () => put(app, pv.id, targets), v => app.adopt(v));
}
export const actions: Actions = { 'toggle-harness': toggle, 'install-again': again };
