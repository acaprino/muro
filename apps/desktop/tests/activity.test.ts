// The Activity page's list (src/pages/activity/entries.ts): events and finished AI runs in one list, newest first, the filters, the titles, and what an action or a status this window
// does not know becomes. Pure data under Node; the page itself is run by tests/browser-activity.mjs on the fake service.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FILTERS, emptyWords, entries, finished, matches } from '../src/pages/activity/entries.ts';
import type { Activity, Job, Snapshot } from '../src/types.ts';

const AI = { engine: 'harness', harness: 'claude-code', budget_usd: 0.5, api_base: '', model: '', api_key_env: 'KEY' } as const;
const event = (id: string, time: number, action: string, status = 'complete', message = ''): Activity => ({ id, time: String(time), action, status, message });
const run = (id: string, over: Partial<Job> = {}): Job => ({ id, plugin_id: 'docs', harness: 'opencode', status: 'completed', phase: 'done', budget_usd: 1, log_path: `/logs/${id}.txt`, message: 'Adapted.', time: 100, ...over });
function snapshot(activity: Activity[], jobs?: Job[]): Snapshot {
  const plugins = [{ id: 'docs', name: 'Docs Writer', source: 'o/d', policy: 'stable', pinned_version: '', targets: [], distributions: [] }] as Snapshot['registry']['plugins'];
  return { registry: { schema: 1, revision: 1, plugins, targets: [], settings: { auto_sync: false, interval_minutes: 60, close_to_tray: true, agent: 'claude-code', python: 'python', factory_path: '', ai: AI } }, inventory: [], activity, sync: { last_check: null, last_sync: null, revision: null, pending: null, blockers: null, errors: null, targets: {} }, ...(jobs ? { jobs } : {}) };
}

test('events and finished runs are one list, newest first', () => {
  const list = entries(snapshot([event('a', 300, 'check'), event('b', 200, 'sync')], [run('j1', { time: 250 })]));
  assert.deepEqual(list.map(e => e.key), ['event:a', 'job:j1', 'event:b']);
});

test('events of one second keep their order, the later one first', () => {
  const list = entries(snapshot([event('a', 5, 'check'), event('b', 5, 'sync')]));
  assert.deepEqual(list.map(e => e.key), ['event:b', 'event:a']);
});

test('the title says what happened: its words when done, others when it failed, the service\'s own for an action not known', () => {
  const list = entries(snapshot([event('a', 3, 'sync'), event('b', 2, 'sync', 'failed', 'x'), event('c', 1, 'some_new_action', 'failed')]));
  assert.deepEqual(list.map(e => e.title), ['Synced your harnesses', 'Sync failed', 'Some new action']);
});

test('a run that goes is not an entry; an adaptation names its plugin and harness, and carries its log', () => {
  const s = snapshot([], [run('j1'), run('j2', { status: 'running' })]);
  const list = entries(s);
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'AI adaptation of Docs Writer for OpenCode');
  assert.equal(list[0].log, '/logs/j1.txt');
  assert.equal(list[0].kind, 'ai');
});

test('a project run is titled by its own title; a time sent as text of digits is read', () => {
  const list = entries(snapshot([], [run('p1', { kind: 'project', title: 'Adding an input', time: '1700000000' })]));
  assert.equal(list[0].title, 'Adding an input');
  assert.equal(list[0].time, '1700000000');
});

test('the runs the window read win over the ones the snapshot carried, by id, and may show one that ended since', () => {
  const s = snapshot([], [run('j1', { status: 'running' })]);
  assert.equal(entries(s).length, 0);
  const live = [run('j1', { status: 'failed', message: 'Stopped.' }), run('j9', { time: 5 })];
  assert.deepEqual(finished(s, live).map(j => [j.id, j.status]), [['j1', 'failed'], ['j9', 'completed']]);
  assert.deepEqual(entries(s, live).map(e => e.key), ['job:j1', 'job:j9']);
});

test('a run with no start time is listed last, with no time', () => {
  const list = entries(snapshot([event('a', 1, 'check')], [run('j1', { time: 0 })]));
  assert.deepEqual(list.map(e => e.key), ['event:a', 'job:j1']);
  assert.equal(list[1].time, '');
});

test('the filters: All keeps everything, Sync the sync actions, AI runs the runs, Problems whatever did not end well', () => {
  const list = entries(snapshot(
    [event('a', 9, 'check'), event('b', 8, 'settings'), event('c', 7, 'Automatic sync', 'failed'), event('d', 6, 'Background check', 'ok')],
    [run('j1', { time: 5 }), run('j2', { status: 'cancelled', time: 4 }), run('j3', { status: 'interrupted', time: 3 })],
  ));
  const keys = (filter: Parameters<typeof matches>[1]) => list.filter(e => matches(e, filter)).map(e => e.key);
  assert.equal(keys('all').length, 7);
  assert.deepEqual(keys('sync'), ['event:a', 'event:c', 'event:d']);
  assert.deepEqual(keys('ai'), ['job:j1', 'job:j2', 'job:j3']);
  assert.deepEqual(keys('problems'), ['event:c', 'job:j2', 'job:j3']);
  assert.deepEqual(FILTERS.map(f => f.label), ['All', 'Sync', 'AI runs', 'Problems']);
});

test('an empty page says it is empty, or that the filter hides everything', () => {
  assert.equal(emptyWords('all').title, 'Nothing yet');
  assert.equal(emptyWords('problems').title, 'Nothing here');
});
