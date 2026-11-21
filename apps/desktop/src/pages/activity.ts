import type { ViewState, Snapshot, Job, ActivityFilter } from '../types.ts';
import type { App, Actions, TextBox } from '../context.ts';
import { harnessNames } from '../model.ts';
import { codeNoteHtml, taskCardHtml, timelineItemHtml, toolbarHtml, stackListHtml } from '@acaprino/imago/ui';
import { head, empty, seg, button, spin, tag, when, elapsed } from '../ui.ts';

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
const FILTERS: [ActivityFilter, string][] = [['all', 'All'], ['sync', 'Sync'], ['ai', 'AI runs'], ['problems', 'Problems']];
/** A status that is not a problem; anything else (failed, cancelled, interrupted, a status not known) is one. */
const OK = new Set(['complete', 'completed', 'ok']);
const humanize = (action: string) => { const text = action.replace(/[_-]+/g, ' ').trim(); return text.charAt(0).toUpperCase() + text.slice(1); };

export interface Entry { time: string; kind: 'sync' | 'ai' | 'other'; title: string; message: string; status: string; log?: string }

const pluginName = (s: Snapshot, id = '') => s.registry.plugins.find(p => p.id === id)?.name || id;
const harnessName = (id = '') => harnessNames[id] || id;
/** What an AI run was: a project made or changed (its own title, and the project's id for a change), or the adaptation of a plugin for a harness. */
const runTitle = (s: Snapshot, j: Job, running: boolean) => j.kind === 'project'
  ? `${j.title || 'Project change'}${j.operation !== 'create' && j.project_id ? ` · ${j.project_id}` : ''}`
  : running ? `Adapting ${pluginName(s, j.plugin_id)} for ${harnessName(j.harness)}` : `AI adaptation of ${pluginName(s, j.plugin_id)} for ${harnessName(j.harness)}`;
/** The list: the events the service wrote and the AI runs that are over (adaptations, and projects made or changed), newest first. A running run is
 * not an entry, it has its card; a run is dated by its start, which is all its record keeps. */
export function entries(s: Snapshot): Entry[] {
  const events = [...s.activity].reverse().map((a): Entry => {
    const [done, failed] = TITLES[a.action] || [humanize(a.action), humanize(a.action)];
    return { time: a.time, kind: SYNC_ACTIONS.has(a.action) ? 'sync' : 'other', title: OK.has(a.status) ? done : failed, message: a.message, status: a.status };
  });
  const jobs = (s.jobs || []).filter(j => j.status !== 'running').map((j): Entry => ({ time: j.time, kind: 'ai', title: runTitle(s, j, false), message: j.message, status: j.status, log: j.log_path }));
  // Stable: events of one second keep their order, newest first.
  return [...events, ...jobs].sort((a, b) => (Number(b.time) || 0) - (Number(a.time) || 0));
}
export const matches = (entry: Entry, filter: ActivityFilter) => filter === 'all' || (filter === 'problems' ? !OK.has(entry.status) : entry.kind === filter);

const outcome = (status: string) => OK.has(status) ? '' : status === 'failed' || status === 'error' ? tag('Failed', 'bad') : tag(humanize(status));
const money = (usd: number) => Number.isFinite(Number(usd)) ? `$${Number(usd).toFixed(2)}` : '';
const log = (path: string) => codeNoteHtml(path ? `Log: ${path}` : '');

/** A running adaptation: its phase as text, a progress bar and the time it has run. The agent reports no fraction, so the bar has no value
 * (`role="progressbar"` without `aria-valuenow` is indeterminate) and says the phase and the time instead. The time is read from the
 * clock at each paint; the jobs poll paints this page again, which is what moves it. */
function jobCard(s: Snapshot, job: Job, index: number, now: number): string {
  const budget = money(job.budget_usd), ran = elapsed(job.time, now);
  const said = [job.phase, ran && `running for ${ran}`].filter(Boolean).join(', ');
  const rest = [job.message, budget && `budget up to ${budget}`].filter(Boolean).join(' · ');
  return taskCardHtml({id:`job-${index}`,title:runTitle(s, job, true),leadingHtml:spin,
    actionsHtml:button('Cancel','cancel-job',{id:job.id,danger:true}),phase:job.phase,elapsed:ran?`Running for ${ran}`:'',
    progressLabel:job.kind === 'project' ? 'AI run in progress' : 'Adaptation in progress',progressText:said,description:rest,detailHtml:log(job.log_path)});
}
const item = (e: Entry) => timelineItemHtml({time:when(e.time),title:e.title,detail:e.message,detailHtml:log(e.log||''),trailingHtml:outcome(e.status)});

/** `now` is the clock, in milliseconds: the page reads it, and a test sets it. */
export function view(state: ViewState, now: number = Date.now()): string {
  const s = state.snapshot!, filter = state.afilter, list = entries(s).filter(e => matches(e, filter));
  return head('Activity', 'What Muro did, and why.')
    + (s.jobs || []).filter(j => j.status === 'running').map((j, i) => jobCard(s, j, i, now)).join('')
    + toolbarHtml(seg('afilter', filter, FILTERS, 'Filter activity'))
    + (list.length ? stackListHtml(list.map(item).join(''),'timeline') : empty(filter === 'all' ? 'Nothing yet' : 'Nothing here', 'Sync runs and AI runs show up here.'));
}

export const actions: Actions = {
  /** The job is stopped by the shell; the snapshot then carries its new state. */
  'cancel-job': (app, data) => data.id ? app.run('Cancelling…', async () => { await app.request('cancel_job', { id: data.id }); return app.request<Snapshot>('snapshot'); }, v => app.adopt(v)) : undefined,
};
export function change(app: App, el: TextBox): boolean {
  if (el.name !== 'afilter') return false;
  if (FILTERS.some(([id]) => id === el.value)) app.state.afilter = el.value as ActivityFilter;
  app.render();
  return true;
}
/** The page was opened: the events are read again, because the background sync writes them while the window is elsewhere. */
export const opened = (app: App) => app.reload();
