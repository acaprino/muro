import test from 'node:test';
import assert from 'node:assert/strict';
import type { Snapshot, ViewState, Job, Activity as Event, Target } from '../src/types.ts';
import { frame } from '../src/views.ts';
import { exclusiveSeg } from '../src/forms.ts';
import { view as settings } from '../src/pages/settings.ts';
import { view as activity, entries, matches } from '../src/pages/activity.ts';

const target = (id: string, exclusive: boolean): Target => ({ id, harness: 'codex', name: id, root: '/profile', executable: 'codex', exclusive, enabled: true });
const snapshot = (over: Partial<Snapshot> = {}, settingsOver: Partial<Snapshot['registry']['settings']> = {}): Snapshot => ({
  registry: { schema: 1, revision: 4, plugins: [{ id: 'docs', name: 'Docs <b>writer</b>', source: 'owner/docs', policy: 'stable', pinned_version: '', targets: [], distributions: [] }], targets: [target('one', false)], settings: { auto_sync: false, interval_minutes: 60, close_to_tray: true, agent: 'claude-code', python: 'python', factory_path: '', ...settingsOver } },
  inventory: [], activity: [], sync: { last_check: null, last_sync: null, revision: null, pending: null, blockers: null, errors: null, targets: {} }, ...over,
});
const viewState = (s: Snapshot | null, over: Partial<ViewState> = {}): ViewState => ({ page: 'sync', snapshot: s, discovered: [], discovering: false, plan: null, checking: false, applying: null, review: null, query: '', filter: 'all', afilter: 'all', busy: null, error: null, checkErrors: [], discoveryError: null, maintenance: null, autostart: null, setup: null, ...over });
const event = (id: string, time: string, action: string, status = 'complete', message = ''): Event => ({ id, time, action, status, message });
const job = (over: Partial<Job> = {}): Job => ({ id: 'job-1', plugin_id: 'docs', harness: 'opencode', status: 'running', phase: 'harmonization', budget_usd: 2, log_path: 'C:/data/jobs/job-1/log.txt', message: 'Working', time: '1700000500', ...over });
const switchOf = (html: string, label: string) => html.match(new RegExp(`<button[^>]*role="switch"[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? '';

test('Settings has the five sections of the mockup, every setting saved on change, and no Save button', () => {
  const html = settings(viewState(snapshot(), { autostart: { supported: true, enabled: false, current: false } }));
  assert.deepEqual([...html.matchAll(/<section class="card set"><h2>([^<]+)<\/h2>/g)].map(m => m[1]), ['Sync', 'Background', 'Appearance', 'AI adaptation', 'Maintenance']);
  assert.doesNotMatch(html, /<button[^>]*>(<[^>]*>)*\s*<span>Save/, 'no button reads Save');
  assert.doesNotMatch(html, /Save settings/);
  assert.match(html, /Saved as you change them\./);
  assert.doesNotMatch(html, /Reinstall a plugin/);
});

test('a switch is a role=switch with its label and its state', () => {
  const html = settings(viewState(snapshot({}, { auto_sync: true, close_to_tray: false }), { autostart: { supported: true, enabled: true, current: true } }));
  assert.match(switchOf(html, 'Automatic sync'), /aria-checked="true"/);
  assert.match(switchOf(html, 'Keep running when the window is closed'), /aria-checked="false"/);
  assert.match(switchOf(html, 'Start Muro when Windows starts'), /aria-checked="true"/);
  assert.doesNotMatch(switchOf(html, 'Start Muro when Windows starts'), /disabled/);
});

test('the hints of Start with Windows and of Keep running follow the settings', () => {
  const on = { supported: true, enabled: true, current: true };
  assert.match(settings(viewState(snapshot({}, { auto_sync: true }), { autostart: on })), /Starts in the notification area and keeps your harnesses in line with your list\./);
  const warned = settings(viewState(snapshot(), { autostart: on }));
  assert.match(warned, /<span class="warn">Automatic sync is off: Muro starts and watches, but applies changes only when you ask\.<\/span>/);
  assert.doesNotMatch(settings(viewState(snapshot(), { autostart: { ...on, enabled: false } })), /Automatic sync is off/, 'only when it starts');
  assert.match(settings(viewState(snapshot({}, { close_to_tray: false }))), /<span class="warn">Closing the window quits Muro: nothing syncs until you open it again\.<\/span>/);
  assert.doesNotMatch(settings(viewState(snapshot())), /quits Muro/);
});

test('Start with Windows is disabled until it is read and where it is not available', () => {
  assert.match(switchOf(settings(viewState(snapshot(), { autostart: null })), 'Start Muro when Windows starts'), /disabled/);
  const html = settings(viewState(snapshot(), { autostart: { supported: false, enabled: false, current: false } }));
  assert.match(switchOf(html, 'Start Muro when Windows starts'), /disabled/);
  assert.match(html, /<small>Available on Windows<\/small>/);
});

test('the interval is used only with automatic sync on, and a stored interval none of the options names stays selected', () => {
  const off = settings(viewState(snapshot()));
  assert.match(off, /<select name="interval_minutes"[^>]* disabled>/);
  assert.match(off, /Used when automatic sync is on\./);
  const on = settings(viewState(snapshot({}, { auto_sync: true, interval_minutes: 45 })));
  assert.doesNotMatch(on, /<select name="interval_minutes"[^>]* disabled>/);
  assert.match(on, /<option value="45" selected>Every 45 minutes<\/option>/);
});

test('a stored agent that is not listed stays an option', () => {
  assert.match(settings(viewState(snapshot({}, { agent: 'codex' }))), /<option value="codex" selected>Codex · USD budget not supported<\/option>/);
});

test('the rule for plugins outside the list is the Sync page\'s own control, none chosen when harnesses differ', () => {
  const group = (s: Snapshot) => settings(viewState(s)).match(/<div class="seg" role="radiogroup" aria-label="Plugins that are not in my list">.*?<\/div>/)![0];
  assert.ok(settings(viewState(snapshot())).includes(exclusiveSeg(snapshot().registry.targets)), 'one builder draws it on both pages');
  const keep = group(snapshot());
  assert.match(keep, /name="excl" value="keep" checked/);
  assert.match(keep, /name="excl" value="remove" >/);
  const all = snapshot(); all.registry.targets = [target('a', true), target('b', true)];
  assert.match(group(all), /value="remove"[^>]*checked/);
  const mixed = snapshot(); mixed.registry.targets = [target('a', true), target('b', false)];
  assert.doesNotMatch(group(mixed), /checked/);
  assert.match(settings(viewState(mixed)), /<small>Differs per harness<\/small>/);
  assert.doesNotMatch(settings(viewState(snapshot())), /Differs per harness/);
});

test('what the person typed and what the service returned is escaped on the Settings page', () => {
  const evil = '"><script>alert(1)</script>';
  const html = settings(viewState(snapshot({}, { python: evil, factory_path: evil, agent: evil }), { maintenance: { message: evil, details: [evil, '<img src=x onerror=alert(1)>'] }, autostart: null }));
  assert.doesNotMatch(html, /<script|<img/);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&lt;img src=x'));
});

test('a maintenance result is a status with what it removed', () => {
  const html = settings(viewState(snapshot(), { maintenance: { message: 'Removed 1 unused artifacts', details: ['old-build'] } }));
  assert.match(html, /<div class="row" role="status">.*Removed 1 unused artifacts.*<small class="break">old-build<\/small>/);
  assert.doesNotMatch(settings(viewState(snapshot())), /role="status"/);
});

test('Verify shows it is running and Clean up asks first', () => {
  const html = settings(viewState(snapshot(), { busy: 'Verifying…' }));
  assert.match(html, /data-action="maintenance-verify" [^>]*disabled>.*Verifying…/);
  assert.match(settings(viewState(snapshot())), /data-action="maintenance-cleanup"[^>]*>.*Clean up…/);
});

test('the Sync filter holds every run of the background worker, a check that only looked included', () => {
  const s = snapshot({ activity: [event('1', '10', 'Background check'), event('2', '11', 'Automatic sync', 'failed'), event('3', '12', 'settings')] });
  const kinds = entries(s).map(e => [e.title, e.kind]);
  assert.deepEqual(kinds, [['Settings saved', 'other'], ['Automatic sync failed', 'sync'], ['Background check', 'sync']]);
  assert.deepEqual(entries(s).filter(e => matches(e, 'sync')).map(e => e.title), ['Automatic sync failed', 'Background check']);
});

test('Activity: events newest first, an adaptation that is over among them, a running one not', () => {
  const s = snapshot({
    activity: [event('1', '1700000000', 'sync'), event('2', '1700000100', 'check'), event('3', '1700000100', 'settings')],
    jobs: [job({ id: 'j1', status: 'running' }), job({ id: 'j2', status: 'failed', time: '1700000050', message: 'The agent stopped' })],
  });
  assert.deepEqual(entries(s).map(e => [e.kind, e.title]), [
    ['other', 'Settings saved'], ['sync', 'Checked sources and harnesses'], ['ai', 'AI adaptation of Docs <b>writer</b> for OpenCode'], ['sync', 'Synced your harnesses'],
  ], 'the later of two events of one second comes first, and the running adaptation is no entry');
  assert.equal(entries(s).find(e => e.kind === 'ai')?.log, 'C:/data/jobs/job-1/log.txt');
});

test('Activity: a failed event is titled for its failure, an unknown action keeps the service\'s name', () => {
  const s = snapshot({ activity: [event('1', '10', 'sync', 'failed', 'The harness refused the change'), event('2', '11', 'save_plugin'), event('3', '12', 'apply'), event('4', '13', 'some_new_action', 'failed')] });
  assert.deepEqual(entries(s).map(e => e.title), ['Some new action', 'Apply', 'Plugin saved', 'Sync failed']);
});

test('Activity: the filters', () => {
  const s = snapshot({
    activity: [event('1', '10', 'sync'), event('2', '20', 'check', 'failed'), event('3', '30', 'save_target'), event('4', '35', 'x', 'cancelled')],
    jobs: [job({ id: 'a', status: 'completed', time: '40' }), job({ id: 'b', status: 'cancelled', time: '50' }), job({ id: 'c', status: 'interrupted', time: '60' }), job({ id: 'd', status: 'failed', time: '70' })],
  });
  const kinds = (f: Parameters<typeof matches>[1]) => entries(s).filter(e => matches(e, f)).length;
  assert.equal(kinds('all'), 8);
  assert.equal(kinds('sync'), 2, 'a sync run and a check');
  assert.equal(kinds('ai'), 4);
  assert.equal(kinds('problems'), 5, 'failed, cancelled and interrupted, and none that completed');
  assert.deepEqual(entries(s).filter(e => matches(e, 'problems')).map(e => e.status).sort(), ['cancelled', 'cancelled', 'failed', 'failed', 'interrupted']);
});

test('Activity: a running adaptation has its card with phase, budget, log and Cancel; the list and its filter come after', () => {
  const html = activity(viewState(snapshot({ jobs: [job()], activity: [event('1', '10', 'check', 'failed', 'Sources not resolved')] })));
  assert.match(html, /<article class="card job"[^>]*><div class="top"><i class="spin"[^>]*><\/i><h2 class="grow" id="job-0">Adapting Docs &lt;b&gt;writer&lt;\/b&gt; for OpenCode<\/h2><button[^>]*data-action="cancel-job"[^>]*data-id="job-1"/);
  assert.match(html, /harmonization · Working · budget up to \$2\.00/);
  assert.match(html, /Log: C:\/data\/jobs\/job-1\/log\.txt/);
  assert.ok(html.indexOf('class="card job"') < html.indexOf('role="radiogroup"') && html.indexOf('role="radiogroup"') < html.indexOf('class="card list act"'));
  assert.match(html, /aria-label="Filter activity"/);
  assert.match(html, /<span class="tag bad">Failed<\/span>/);
  assert.deepEqual([...html.matchAll(/<span>(All|Sync|AI adaptation|Problems)<\/span>/g)].map(m => m[1]), ['All', 'Sync', 'AI adaptation', 'Problems']);
});

test('Activity: empty states', () => {
  assert.match(activity(viewState(snapshot())), /Nothing yet/);
  assert.match(activity(viewState(snapshot(), { afilter: 'problems' })), /Nothing here/);
  assert.doesNotMatch(activity(viewState(snapshot())), /class="card job"/);
});

test('Activity: everything the service, a plugin or an agent wrote is escaped', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const s = snapshot({
    activity: [event(evil, evil, evil, evil, evil)],
    jobs: [job({ plugin_id: evil, harness: evil, phase: evil, message: evil, log_path: evil, id: evil }), job({ id: 'j2', status: 'failed', plugin_id: evil, harness: evil, message: evil, log_path: evil, time: evil })],
  });
  const html = activity(viewState(s));
  assert.doesNotMatch(html, /<img/);
  assert.ok(html.includes('&lt;img src=x'));
  assert.match(html, /data-id="&lt;img src=x onerror=alert\(1\)&gt;"/);
});

test('the frame shows Settings and Activity as the current tab', () => {
  const s = snapshot();
  for (const [page, title] of [['activity', 'Activity'], ['settings', 'Settings']] as const) {
    const html = frame(viewState(s, { page }));
    assert.match(html, new RegExp(`<h1>${title}</h1>`));
    assert.match(html, new RegExp(`data-id="${page}" aria-current="page"`));
  }
  assert.match(frame(viewState(s, { page: 'activity' })), /Nothing yet/);
});
