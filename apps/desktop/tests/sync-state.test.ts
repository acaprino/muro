// Plan R1, Task 1: the pure parts of the Sync state (src/pages/sync/words.ts): what an apply sends and runs for each kind of plan, what it says afterwards, and the
// headline of the sync note, the chip of the status row and the lines of times for each state of the sync. Pure data under Node. What a plan means for a cell or a
// harness (cellState, harnessState, syncHeadline) is model.ts's and is tested in model.test.ts; the guards of the state (one plan at a time, a refused plan planned again)
// live in useSync.tsx and are run by the browser tests of the Sync page (tests/browser-sync.mjs, on the fake service).
import test from 'node:test';
import assert from 'node:assert/strict';
import { appliedMessage, applyRequest, checkedLine, chipOf, executedOf, nameList, noteOf, timesLine } from '../src/pages/sync/words.ts';
import type { SyncHeadline } from '../src/model.ts';
import type { Operation, Plan, Plugin, Snapshot, Target } from '../src/types.ts';

const target = (id: string, name: string, enabled = true): Target => ({ id, harness: 'codex', name, root: `/${id}`, executable: 'codex', exclusive: false, enabled });
const plugin: Plugin = { id: 'pkg', name: 'Package', source: 'owner/pkg', policy: 'stable', pinned_version: '', targets: ['t1'], distributions: [{ harness: 'codex', path: '/artifact', version: '2' }] };
const record = (over: Partial<Snapshot['sync']> = {}): Snapshot['sync'] => ({ last_check: null, last_sync: null, revision: null, pending: null, blockers: null, errors: null, targets: {}, ...over });
/** What the service recorded for revision 4, the registry revision of the fixture: a full check that found nothing (the fields are overridden per case). */
const recorded = (over: Partial<Snapshot['sync']> = {}): Snapshot['sync'] => record({ last_check: '1', last_sync: '1', revision: 4, pending: 0, blockers: 0, errors: 0, ...over });
const AI = { engine: 'harness', harness: 'claude-code', budget_usd: 0.5, api_base: 'https://api.openai.com/v1', model: '', api_key_env: 'MURO_API_KEY' } as const;
/** A registry at revision 4 with one plugin on `t1`, which every harness reads completely and has installed at the version the build says. */
function snapshot(sync: Snapshot['sync'] = record(), targets: Target[] = [target('t1', 'Codex')], auto = false): Snapshot {
  return {
    registry: { schema: 1, revision: 4, plugins: [plugin], targets, settings: { auto_sync: auto, interval_minutes: 60, close_to_tray: true, agent: 'claude-code', python: 'python', factory_path: '', ai: AI } },
    inventory: targets.map(t => ({ target_id: t.id, complete: true, supported: true, error: null, plugins: t.id === 't1' ? [{ id: 'pkg', name: 'Package', version: '2', path: '/plugin', managed: true }] : [] })),
    activity: [], sync,
  };
}
/** The harnesses whose installed plugins could not be read completely. */
const cannotRead = (s: Snapshot, ...ids: string[]): Snapshot => { for (const i of s.inventory) if (ids.includes(i.target_id)) { i.complete = false; i.error = 'Configuration folder not found'; } return s; };
const op = (kind: string, name = 'Package', plugin_id = 'pkg', target_id = 't1'): Operation => ({ target_id, plugin_id, name, kind, from_version: '1', to_version: '2', reason: 'The build is newer.' });
const plan = (operations: Operation[], blockers: string[] = [], revision = 4, id = 'plan-1'): Plan => ({ id, revision, operations, blockers });
const nothing = { checking: false, progress: null };

// ---------- what an apply sends and runs ----------
test('an apply of ready changes sends the plan alone, runs every operation and names its plugins once', () => {
  const p = plan([op('install'), op('update', 'Other')]);
  const sent = applyRequest(p, 'confirm')!;
  assert.deepEqual(sent.payload, { plan_id: 'plan-1' }, 'no allow_blocked without blockers, no removal field without removals');
  assert.deepEqual(sent.progress, { plan_id: 'plan-1', total: 2, names: 'Package, Other' });
  assert.deepEqual(applyRequest(p, 'skip')!.payload, { plan_id: 'plan-1' }, 'a plan without removals has nothing to skip');
  assert.equal(applyRequest(plan([op('install'), op('update')]), 'confirm')!.progress.names, 'Package', 'a plugin on two harnesses is one name');
  assert.deepEqual(executedOf(p, 'confirm'), p.operations);
});

test('with blockers the request allows them, and only the ready operations count: a blocker is never an operation', () => {
  const p = plan([op('install')], ['Codex isolated test: Inventory incomplete', 'Package: no build for Codex']);
  const sent = applyRequest(p, 'confirm')!;
  assert.deepEqual(sent.payload, { plan_id: 'plan-1', allow_blocked: true });
  assert.equal(sent.progress.total, 1, 'one ready operation, not three items');
});

test('a plan with nothing ready is not sent: only blockers, no operation, or removals that are left out', () => {
  assert.equal(applyRequest(plan([], ['Codex: no folder']), 'confirm'), null);
  assert.equal(applyRequest(plan([]), 'confirm'), null);
  const removalsOnly = plan([op('remove', 'old-a'), op('remove', 'old-b')]);
  assert.equal(applyRequest(removalsOnly, 'skip'), null, 'skipping every removal leaves nothing to run');
  assert.equal(applyRequest(removalsOnly, 'confirm')!.progress.total, 2, 'confirmed, they run');
});

test('removals are confirmed with their number or left out, and are counted only when they run', () => {
  const p = plan([op('install'), op('remove', 'old-a'), op('remove', 'old-b')]);
  const confirm = applyRequest(p, 'confirm')!;
  assert.deepEqual(confirm.payload, { plan_id: 'plan-1', confirm_removals: 2 }, 'the number the sheet named');
  assert.deepEqual(confirm.progress, { plan_id: 'plan-1', total: 3, names: 'Package, old-a, old-b' });
  const skip = applyRequest(p, 'skip')!;
  assert.deepEqual(skip.payload, { plan_id: 'plan-1', skip_removals: true });
  assert.deepEqual(skip.progress, { plan_id: 'plan-1', total: 1, names: 'Package' }, 'the removals are not in the run, nor in the names');
  assert.deepEqual(executedOf(p, 'skip').map(o => o.kind), ['install']);
  assert.deepEqual(executedOf(p, 'confirm').map(o => o.kind), ['install', 'remove', 'remove']);
});

test('blockers and removals together: allow_blocked and the removal choice both go', () => {
  const p = plan([op('update'), op('remove', 'old-a')], ['Codex: no folder']);
  assert.deepEqual(applyRequest(p, 'confirm')!.payload, { plan_id: 'plan-1', allow_blocked: true, confirm_removals: 1 });
  assert.deepEqual(applyRequest(p, 'skip')!.payload, { plan_id: 'plan-1', allow_blocked: true, skip_removals: true });
});

test('what an apply says: the changes applied, the removals left out and the blockers left out', () => {
  assert.equal(appliedMessage(plan([op('install')]), {}), '1 change applied.');
  assert.equal(appliedMessage(plan([op('install'), op('update')]), { skipped_removals: 0 }), '2 changes applied.');
  const many = plan([op('install'), ...Array.from({ length: 31 }, (_, i) => op('remove', `old-${i}`))]);
  assert.equal(appliedMessage(many, { skipped_removals: 31 }), '1 change applied. 31 removals left out.', 'the removals that were left out are not applied');
  assert.equal(appliedMessage(plan([op('install')], ['x']), { left_out: ['x'] }), '1 change applied. 1 left out.');
  assert.equal(appliedMessage(plan([op('install'), op('update'), op('remove')], ['x']), { skipped_removals: 1, left_out: ['x'] }), '2 changes applied. 1 removal left out. 1 left out.');
});

// ---------- the note ----------
test('the note before any check says so, and Check now is what to do', () => {
  const n = noteOf(snapshot(), null, nothing);
  assert.deepEqual(n, { kind: 'not-checked', tone: null, title: 'Not checked yet', text: 'Check now to compare your list with what is installed and to look for new versions. Nothing changes until you apply.', lead: true });
  assert.equal(noteOf(snapshot(), plan([op('update')], [], 3), nothing).kind, 'not-checked', 'a plan made for another revision is as good as none');
});

test('a check of an earlier revision: the note says the list changed since, never "Not checked yet" beside the time of the check', () => {
  const n = noteOf(snapshot(recorded({ revision: 3, pending: 2 })), null, nothing);
  assert.deepEqual(n, { kind: 'changed', tone: null, title: 'Your list changed since the last check', text: 'Check now to see what the change means for your harnesses. Nothing changes until you apply.', lead: true });
  assert.equal(noteOf(snapshot(recorded({ revision: 3, last_check: null })), null, nothing).kind, 'not-checked', 'with no check at all it is not checked');
});

test('the note with no harness managed', () => {
  const n = noteOf(snapshot(record(), [target('t1', 'Codex', false)]), null, nothing);
  assert.deepEqual([n.kind, n.tone, n.title, n.text], ['no-harness', 'warn', 'No harness is managed', 'Muro needs at least one harness to install plugins into.']);
  assert.equal(n.lead, false, 'the page offers to add a harness instead');
});

test('N changes ready: the plan of the window says them by kind, and nothing changes until the person applies', () => {
  const one = noteOf(snapshot(), plan([op('update')]), nothing);
  assert.deepEqual(one, { kind: 'changes', tone: 'info', title: '1 change ready to apply', text: '1 update. Nothing changes until you apply.', lead: false });
  const four = noteOf(snapshot(), plan([op('install'), op('update'), op('update'), op('remove')]), nothing);
  assert.equal(four.title, '4 changes ready to apply');
  assert.equal(four.text, '1 install, 2 updates, 1 removal. Nothing changes until you apply.', 'kinds in the order of the sheet, with the word of each');
});

test('N changes ready from the record alone: the window made no plan, so the kinds are not said', () => {
  const n = noteOf(snapshot(recorded({ pending: 3 })), null, nothing);
  assert.deepEqual([n.kind, n.title, n.text], ['changes', '3 changes ready to apply', 'Nothing changes until you apply.']);
});

test('changes still lead, and say what else is wrong: blockers, a harness that cannot be read, sources that could not be checked', () => {
  const s = cannotRead(snapshot(recorded({ errors: 1 })), 't1');
  const n = noteOf(s, plan([op('install'), op('update'), op('update'), op('remove')], ['Package: no build for Codex']), nothing);
  assert.equal(n.kind, 'changes');
  assert.equal(n.title, '4 changes ready to apply');
  assert.equal(n.text, '1 install, 2 updates, 1 removal · 1 item not ready yet · Codex cannot be read · 1 source could not be checked. Nothing changes until you apply.');
});

test('some plugins are not ready: the first blocker and how many more, or the count from the record', () => {
  const one = noteOf(snapshot(), plan([], ['Codex: no folder']), nothing);
  assert.deepEqual(one, { kind: 'blocked', tone: 'warn', title: 'Some plugins are not ready', text: 'Codex: no folder. Muro leaves them out until they are fixed.', lead: true });
  assert.equal(noteOf(snapshot(), plan([], ['Codex: no folder', 'B', 'C']), nothing).text, 'Codex: no folder and 2 more. Muro leaves them out until they are fixed.');
  assert.equal(noteOf(snapshot(recorded({ blockers: 2 })), null, nothing).text, '2 items are not ready yet. Muro leaves them out until they are fixed.');
  assert.equal(noteOf(snapshot(recorded({ blockers: 1 })), null, nothing).text, '1 item is not ready yet. Muro leaves them out until they are fixed.');
});

test('a harness that cannot be read is never in sync: its name, and why it cannot say', () => {
  const s = cannotRead(snapshot(recorded()), 't1');
  const n = noteOf(s, plan([]), nothing);
  assert.deepEqual(n, { kind: 'unreadable', tone: 'warn', title: 'Codex cannot be read', text: 'Muro could not read what is installed there, so it cannot say whether it is in sync. Check the harness settings, then check again.', lead: true });
  const two = noteOf(cannotRead(snapshot(recorded(), [target('t1', 'Codex'), target('t2', 'Claude Code')]), 't1', 't2'), null, nothing);
  assert.equal(two.title, 'Codex and Claude Code cannot be read');
  const three = noteOf(cannotRead(snapshot(recorded(), [target('t1', 'Codex'), target('t2', 'Claude Code'), target('t3', 'OpenCode')]), 't1', 't2', 't3'), null, nothing);
  assert.equal(three.title, 'Codex and 2 more cannot be read');
  assert.notEqual(three.kind, 'ok');
});

test('instructions that cannot be read keep a harness from reading as in sync too, with their own words', () => {
  const s = snapshot(recorded());
  s.custom_instructions = [{ plugin_id: 'pkg', path: '/instructions', files: [], digest: '', stale_harnesses: [], error: 'Unreadable Markdown' }];
  const n = noteOf(s, null, nothing);
  assert.deepEqual([n.kind, n.title, n.lead], ['unreadable', 'Codex cannot be read', true]);
  assert.equal(n.text, 'The custom instructions of a plugin on it could not be read, so it cannot say whether it is in sync. Check the plugin, then check again.');
});

test('N sources could not be checked is never in sync, and says what to do', () => {
  const many = noteOf(snapshot(recorded({ errors: 2 })), null, nothing);
  assert.deepEqual(many, { kind: 'sources', tone: 'warn', title: '2 sources could not be checked', text: 'Muro could not resolve them, so it cannot say they are up to date. Check again when they answer.', lead: true });
  const one = noteOf(snapshot(recorded({ errors: 1, blockers: 2 })), null, nothing);
  assert.equal(one.title, '1 source could not be checked');
  assert.equal(one.text, 'Muro could not resolve it, so it cannot say it is up to date. 2 items not ready yet. Check again when it answers.', 'blockers do not hide a source that was not checked');
  assert.equal(noteOf(snapshot(recorded({ errors: 3 })), plan([]), nothing).kind, 'sources', 'the plan of the window finds nothing, the sources are still not read');
});

test('everything in sync only when nothing is left to say', () => {
  const expected = { kind: 'ok', tone: 'ok', title: 'Everything is in sync', text: 'What is installed on your harnesses matches your list.', lead: false };
  assert.deepEqual(noteOf(snapshot(), plan([]), nothing), expected);
  assert.deepEqual(noteOf(snapshot(recorded()), null, nothing), expected, 'from the record of a check made by the worker');
});

test('a check or an apply under way is what the note says, the apply first', () => {
  const checking = noteOf(snapshot(recorded({ errors: 2 })), null, { checking: true, progress: null });
  assert.deepEqual(checking, { kind: 'checking', tone: null, title: 'Checking sources and harnesses…', text: 'Reading what is installed and looking for new versions.', lead: false });
  const progress = { plan_id: 'plan-1', total: 3, names: 'Package, Other' };
  const applying = noteOf(snapshot(), plan([op('update')]), { checking: true, progress });
  assert.deepEqual(applying, { kind: 'applying', tone: 'info', title: 'Applying 3 changes…', text: 'Package, Other', lead: false });
  assert.equal(noteOf(snapshot(), null, { checking: false, progress: { plan_id: 'p', total: 1, names: 'Package' } }).title, 'Applying 1 change…');
});

// ---------- the chip, the lines of times, the names ----------
const headline = (kind: SyncHeadline['kind'], over: Partial<SyncHeadline> = {}): SyncHeadline => ({ kind, operations: 0, blockers: 0, errors: 0, byKind: {}, unreadable: [], ...over });

test('the chip of the status row says each state in a few words, and is ok only when in sync', () => {
  assert.deepEqual(chipOf(headline('no-harness')), { text: 'No harness', tone: 'warn' });
  assert.deepEqual(chipOf(headline('not-checked')), { text: 'Not checked yet', tone: 'warn' });
  assert.deepEqual(chipOf(headline('changed')), { text: 'List changed', tone: 'warn' });
  assert.deepEqual(chipOf(headline('changes', { operations: 1 })), { text: '1 change waiting', tone: 'warn' });
  assert.deepEqual(chipOf(headline('changes', { operations: 5 })), { text: '5 changes waiting', tone: 'warn' });
  assert.deepEqual(chipOf(headline('blocked')), { text: 'Needs attention', tone: 'warn' });
  assert.deepEqual(chipOf(headline('unreadable')), { text: 'A harness cannot be read', tone: 'warn' });
  assert.deepEqual(chipOf(headline('sources')), { text: 'Sources not checked', tone: 'warn' });
  assert.deepEqual(chipOf(headline('ok')), { text: 'In sync', tone: 'ok' });
});

test('the lines of times: the last check, the last sync, and the next check or that the automatic sync is off', () => {
  const never = snapshot();
  assert.equal(checkedLine(never), 'Last check never');
  assert.equal(timesLine(never), 'Last check never · Last sync never · Automatic sync off');
  const automatic = snapshot(record({ last_check: 'May 5', last_sync: 'May 4' }), [target('t1', 'Codex')], true);
  assert.equal(checkedLine(automatic), 'Last check May 5 · next check soon', 'a time the service wrote in words stays as it is, and the next one is soon');
  assert.equal(timesLine(automatic), 'Last check May 5 · Last sync May 4 · Next check soon');
  assert.equal(checkedLine(snapshot(record(), [target('t1', 'Codex')], true)), 'Last check never · next check soon');
});

test('a list of names: one or two as they are, more as the first and how many are left', () => {
  assert.equal(nameList(['Codex']), 'Codex');
  assert.equal(nameList(['Codex', 'Pi']), 'Codex and Pi');
  assert.equal(nameList(['Codex', 'Pi', 'Hermes']), 'Codex and 2 more');
  assert.equal(nameList(['A', 'B', 'C', 'D']), 'A and 3 more');
});
