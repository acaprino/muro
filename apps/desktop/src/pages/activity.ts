import type { ViewState, Snapshot, Job, ActivityFilter } from '../types.ts';
import type { App, Actions } from '../context.ts';
import { harnessNames } from '../model.ts';
import { esc, head, empty, seg, button, spin, tag, when } from '../ui.ts';

/** What the service and the shell record, in the words of the interface. These are the names of the actions the service writes
 * (`[done, failed]`); an action this table does not know is shown as the service named it. Nothing here reads a message. */
const TITLES: Record<string, [string, string]> = {
  check: ['Checked sources and harnesses', 'Check with problems'],
  sync: ['Synced your harnesses', 'Sync failed'],
  resolve: ['Checked a plugin source', 'Source check failed'],
  'Automatic sync': ['Automatic sync', 'Automatic sync failed'],
  'Background check': ['Background check', 'Background check failed'],
  save_plugin: ['Plugin saved', 'Plugin not saved'],
  remove_plugin: ['Plugin removed from your list', 'Plugin not removed'],
  save_target: ['Harness saved', 'Harness not saved'],
  remove_target: ['Harness removed', 'Harness not removed'],
  settings: ['Settings saved', 'Settings not saved'],
  maintenance: ['Maintenance', 'Maintenance failed'],
};
/** The actions that make up a sync run: the filter Sync shows them, the background worker's included (a check that only looked, and one that applied). Every other action is only under All. */
const SYNC_ACTIONS = new Set(['check', 'sync', 'resolve', 'Automatic sync', 'Background check']);
const FILTERS: [ActivityFilter, string][] = [['all', 'All'], ['sync', 'Sync'], ['ai', 'AI adaptation'], ['problems', 'Problems']];
/** A status that is not a problem; anything else (failed, cancelled, interrupted, a status not known) is one. */
const OK = new Set(['complete', 'completed', 'ok']);
const humanize = (action: string) => { const text = action.replace(/[_-]+/g, ' ').trim(); return text.charAt(0).toUpperCase() + text.slice(1); };

export interface Entry { time: string; kind: 'sync' | 'ai' | 'other'; title: string; message: string; status: string; log?: string }

const pluginName = (s: Snapshot, id: string) => s.registry.plugins.find(p => p.id === id)?.name || id;
const harnessName = (id: string) => harnessNames[id] || id;
/** The list: the events the service wrote and the adaptations that are over, newest first. A running adaptation is not an
 * entry, it has its card; an adaptation is dated by its start, which is all its record keeps. */
export function entries(s: Snapshot): Entry[] {
  const events = [...s.activity].reverse().map((a): Entry => {
    const [done, failed] = TITLES[a.action] || [humanize(a.action), humanize(a.action)];
    return { time: a.time, kind: SYNC_ACTIONS.has(a.action) ? 'sync' : 'other', title: OK.has(a.status) ? done : failed, message: a.message, status: a.status };
  });
  const jobs = (s.jobs || []).filter(j => j.status !== 'running').map((j): Entry => ({ time: j.time, kind: 'ai', title: `AI adaptation of ${pluginName(s, j.plugin_id)} for ${harnessName(j.harness)}`, message: j.message, status: j.status, log: j.log_path }));
  // Stable: events of one second keep their order, newest first.
  return [...events, ...jobs].sort((a, b) => (Number(b.time) || 0) - (Number(a.time) || 0));
}
export const matches = (entry: Entry, filter: ActivityFilter) => filter === 'all' || (filter === 'problems' ? !OK.has(entry.status) : entry.kind === filter);

const outcome = (status: string) => OK.has(status) ? '' : status === 'failed' || status === 'error' ? tag('Failed', 'bad') : tag(humanize(status));
const money = (usd: number) => Number.isFinite(Number(usd)) ? `$${Number(usd).toFixed(2)}` : '';
const log = (path: string) => path ? `<small class="mono break">Log: ${esc(path)}</small>` : '';

function jobCard(s: Snapshot, job: Job, index: number): string {
  const budget = money(job.budget_usd);
  return `<article class="card job" aria-labelledby="job-${index}"><div class="top">${spin}<h2 class="grow" id="job-${index}">Adapting ${esc(pluginName(s, job.plugin_id))} for ${esc(harnessName(job.harness))}</h2>${button('Cancel', 'cancel-job', { id: job.id, danger: true })}</div><small>${esc(job.phase)}${job.message ? ` · ${esc(job.message)}` : ''}${budget ? ` · budget up to ${esc(budget)}` : ''}</small>${log(job.log_path)}</article>`;
}
const item = (e: Entry) => `<li><time>${esc(when(e.time))}</time><div class="grow"><strong>${esc(e.title)}</strong>${e.message ? `<small>${esc(e.message)}</small>` : ''}${log(e.log || '')}</div>${outcome(e.status)}</li>`;

export function view(state: ViewState): string {
  const s = state.snapshot!, filter = state.afilter, list = entries(s).filter(e => matches(e, filter));
  return head('Activity', 'What Muro did, and why.')
    + (s.jobs || []).filter(j => j.status === 'running').map((j, i) => jobCard(s, j, i)).join('')
    + `<div class="tools">${seg('afilter', filter, FILTERS, 'Filter activity')}</div>`
    + (list.length ? `<ul class="card list act">${list.map(item).join('')}</ul>` : empty(filter === 'all' ? 'Nothing yet' : 'Nothing here', 'Sync runs and AI adaptations show up here.'));
}

export const actions: Actions = {
  /** The job is stopped by the shell; the snapshot then carries its new state. */
  'cancel-job': (app, data) => data.id ? app.run('Cancelling…', async () => { await app.request('cancel_job', { id: data.id }); return app.request<Snapshot>('snapshot'); }, v => app.adopt(v)) : undefined,
};
export function change(app: App, el: HTMLInputElement | HTMLSelectElement): boolean {
  if (el.name !== 'afilter') return false;
  if (FILTERS.some(([id]) => id === el.value)) app.state.afilter = el.value as ActivityFilter;
  app.render();
  return true;
}
/** The page was opened: the events are read again, because the background sync writes them while the window is elsewhere. */
export const opened = (app: App) => app.reload();
