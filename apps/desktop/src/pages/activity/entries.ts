// What the Activity page lists: the events the service and the shell wrote (`snapshot.activity`) and the AI runs that are over (`jobs`), newest first. Pure: no React, no toolkit.
import type { ActivityFilter, Job, Snapshot } from '../../types.ts';
import { harnessNames } from '../../model.ts';
import { isRunning, jobTitle, startedAt } from '../project/write/jobs.ts';

/** What the service and the shell record, in the words of the interface: the names of the actions the service writes, each with `[done, failed]`. An action this table does not know is shown as the
 * service named it. Nothing here reads a message. */
const TITLES: Readonly<Record<string, readonly [string, string]>> = {
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
/** The actions that make up a sync run, the background worker's included (a check that only looked, and one that applied). Every other action is only under All. */
const SYNC_ACTIONS: ReadonlySet<string> = new Set(['check', 'sync', 'resolve', 'Automatic sync', 'Background check']);
/** The filters, in order, with their words. An AI run is an adaptation of a plugin or a change of a project (ADR-0032 decision 7). */
export const FILTERS: readonly { id: ActivityFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'sync', label: 'Sync' },
  { id: 'ai', label: 'AI runs' },
  { id: 'problems', label: 'Problems' },
];
/** A status that is not a problem; anything else (failed, cancelled, interrupted, a status not known) is one. */
const OK: ReadonlySet<string> = new Set(['complete', 'completed', 'ok']);
export const isOk = (status: string): boolean => OK.has(status);
const humanize = (action: string): string => {
  const text = action.replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export interface Entry {
  /** Where it came from: stable across a re-read, and the key of its row. */
  key: string;
  /** Epoch seconds as text, or '' when the record has no time. */
  time: string;
  kind: 'sync' | 'ai' | 'other';
  title: string;
  message: string;
  status: string;
  /** The log of an AI run, when it kept one. */
  log: string;
}

const pluginName = (snapshot: Snapshot, id: string): string => snapshot.registry.plugins.find(p => p.id === id)?.name || id;
const harnessName = (id: string): string => harnessNames[id] || id;
const seconds = (value: string | number): number => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0; };

/** The runs that are over: what the window reads (`live`, the newer) over what the registry's snapshot carried, by id. A run that is going is not an entry, it has its card. */
export function finished(snapshot: Snapshot, live: readonly Job[]): Job[] {
  const byId = new Map<string, Job>();
  for (const job of snapshot.jobs ?? []) byId.set(job.id, job);
  for (const job of live) byId.set(job.id, job);
  return [...byId.values()].filter(job => !isRunning(job));
}

/** The list, newest first. An AI run is dated by its start, which is all its record keeps; events of one second keep the order they were written in, the later one first. */
export function entries(snapshot: Snapshot, live: readonly Job[] = []): Entry[] {
  const events = [...snapshot.activity].reverse().map((a): Entry => {
    const [done, failed] = TITLES[a.action] ?? [humanize(a.action), humanize(a.action)];
    return { key: `event:${a.id}`, time: a.time, kind: SYNC_ACTIONS.has(a.action) ? 'sync' : 'other', title: isOk(a.status) ? done : failed, message: a.message, status: a.status, log: '' };
  });
  const runs = finished(snapshot, live).map((job): Entry => {
    const began = startedAt(job);
    const title = job.kind === 'project' ? jobTitle(job) : `AI adaptation of ${pluginName(snapshot, job.plugin_id ?? '')}${job.harness ? ` for ${harnessName(job.harness)}` : ''}`;
    return { key: `job:${job.id}`, time: began ? String(Math.floor(began)) : '', kind: 'ai', title, message: job.message, status: job.status, log: job.log_path };
  });
  // Array.prototype.sort is stable: equal times keep the order of `events` then `runs`.
  return [...events, ...runs].sort((a, b) => seconds(b.time) - seconds(a.time));
}

export const matches = (entry: Entry, filter: ActivityFilter): boolean => filter === 'all' || (filter === 'problems' ? !isOk(entry.status) : entry.kind === filter);

/** The empty page: the first words when there is nothing at all, the second when the filter hides everything. */
export const emptyWords = (filter: ActivityFilter): { title: string; description: string } =>
  filter === 'all'
    ? { title: 'Nothing yet', description: 'Sync runs and AI runs show up here.' }
    : { title: 'Nothing here', description: 'No entry matches this filter.' };
