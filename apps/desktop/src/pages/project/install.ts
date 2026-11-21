import type { ViewState, ProjectInfo, Snapshot, Plugin, Target } from '../../types.ts';
import type { App, Actions } from '../../context.ts';
import { cellState, currentPlan, CHANGES, stamp } from '../../model.ts';
import { plural, mark, tag, sw, button, empty } from '../../ui.ts';
import { cell } from '../sync.ts';
import { stackListHtml, stackRowHtml, toolbarHtml } from '@acaprino/imago/ui';

/** The registry plugin that is the build of this project: the one that names it. It exists once the project was installed on a harness. */
const pluginOf = (state: ViewState, id: string): Plugin | undefined => state.snapshot?.registry.plugins.find(p => p.project === id);
const managed = (state: ViewState) => state.snapshot!.registry.targets.filter(t => t.enabled);
/** The ids of the harnesses a plugin is switched on for: its targets that are managed. A paused harness shows no switch, so no request names it. */
const switchedOn = (state: ViewState, plugin: Plugin | undefined): string[] => plugin ? managed(state).filter(t => plugin.targets.includes(t.id)).map(t => t.id) : [];

/** What the service says of a build made from a project file that is not the file as it is now (`Currency::check` of the registry, which the plan words as a blocker of one plugin on one harness: `<harness> / <plugin>: Project file changed: ...`). */
const CHANGED = 'Project file changed';
/** Whether the plan holds this plugin back on this harness because its project file changed since the build the harness was given was made. The words are the registry's: nothing here judges what a file holds. */
const changed = (state: ViewState, plugin: Plugin, t: Target): boolean => !!state.snapshot && !!currentPlan(state.snapshot, state.plan)?.blockers.some(b => b.startsWith(`${t.name} / ${plugin.name}:`) && b.includes(CHANGED));

/** Where a project is installed and what waits, in a line: the harnesses its plugin is switched on for (a paused one does not count) and what the Sync table would
 * show on them: changes waiting, a build older than its file (install again), a harness with no version of it, one that cannot be read; "in sync" only when none of those. */
export function installLine(state: ViewState, id: string): string {
  const plugin = pluginOf(state, id), s = state.snapshot;
  const on = plugin && s ? managed(state).filter(t => plugin.targets.includes(t.id)) : [];
  if (!plugin || !on.length) return 'Not installed anywhere';
  const kinds = managed(state).map(t => cellState(plugin, t, s!, state.plan).kind);
  const count = (wanted: (kind: string) => boolean) => kinds.filter(wanted).length, waiting = count(k => CHANGES.has(k)), missing = count(k => k === 'needs-build'), unknown = count(k => k === 'unknown');
  const stale = on.filter(t => changed(state, plugin, t)).length;
  const parts = [waiting ? `${plural(waiting, 'change')} waiting` : '', stale ? `${plural(stale, 'harness', 'harnesses')} to install again` : '', missing ? `no version for ${plural(missing, 'harness', 'harnesses')}` : '', unknown ? `${unknown} to check` : ''].filter(Boolean);
  return `On ${plural(on.length, 'harness', 'harnesses')} · ${parts.join(' · ') || 'in sync'}`;
}

/** Step 4. A switch per managed harness; what is waiting is reviewed in the sheet of Sync, which lists the whole plan (the service plans per harness or for all, never for one plugin). A harness whose build is older than the project file reads "Changed since it was installed: install again", with the button that does it. */
export function view(state: ViewState, info: ProjectInfo): string {
  const s = state.snapshot!, plugin = pluginOf(state, state.project!.id), targets = s.registry.targets;
  const waiting = plugin ? managed(state).filter(t => CHANGES.has(cellState(plugin, t, s, state.plan).kind)).length : 0;
  const row = (t: typeof targets[number]) => {
    const times = s.sync.targets[t.id], on = !!plugin?.targets.includes(t.id), stale = on && !!plugin && changed(state, plugin, t);
    const status = !t.enabled ? '' : !plugin ? '<span class="im-muted" aria-label="Not installed here">—</span>'
      : stale ? `<span class="im-text-warn">Changed since it was installed: install again</span>${button('Install again', 'install-again', { sm: true, id: t.id, attrs: { 'aria-label': `Install ${info.plugin.name} again on ${t.name}` } })}`
      : cell(state, plugin, t);
    return stackRowHtml({title:t.name,detail:`Checked ${stamp(times?.checked??null)} · last sync ${stamp(times?.synced??null)}`,
      leadingHtml:(t.enabled?sw(on,`Install ${info.plugin.name} on ${t.name}`,'toggle-harness',t.id):tag('Paused'))+mark(t.harness),trailingHtml:status});
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
 * Off: the harness leaves the plugin's targets and nothing is installed. */
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
