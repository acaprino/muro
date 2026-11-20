// The page's requests wait for each other. Found on the real executable (native.mjs): `adopt` plans in the background after a
// save, and the first run's next step sent `scan` two milliseconds later: "Registry is busy". The fake transport has no lock.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Transport } from '../src/types.ts';
import { serial, ALONE } from '../src/queue.ts';

/** A transport whose answers the test gives by hand, and which records what was sent and when. */
function manual() {
  const sent: string[] = [], waiting: { action: string; settle: (ok: boolean, value?: unknown) => void }[] = [];
  const send: Transport = <T>(action: string) => new Promise<T>((resolve, reject) => {
    sent.push(action);
    waiting.push({ action, settle: (ok, value) => (ok ? resolve(value as T) : reject(new Error(String(value)))) });
  });
  const answer = (action: string, ok = true, value: unknown = action) => { const i = waiting.findIndex(w => w.action === action); waiting.splice(i, 1)[0].settle(ok, value); };
  return { send, sent, answer };
}
const later = () => new Promise<void>(done => setTimeout(done, 5));

test('a request is sent only when the one before it has been answered, in the order they were made', async () => {
  const m = manual(), request = serial(m.send);
  const first = request('plan'), second = request('scan'), third = request('snapshot');
  await later();
  assert.deepEqual(m.sent, ['plan'], 'only the first one is on its way');
  m.answer('plan');
  assert.equal(await first, 'plan');
  await later();
  assert.deepEqual(m.sent, ['plan', 'scan']);
  m.answer('scan');
  await second;
  await later();
  assert.deepEqual(m.sent, ['plan', 'scan', 'snapshot']);
  m.answer('snapshot');
  assert.equal(await third, 'snapshot');
});

test('a request that fails reaches only its own caller and does not stop the ones behind it', async () => {
  const m = manual(), request = serial(m.send);
  const failing = request('check'), after = request('snapshot');
  const caught = failing.then(() => 'no error', e => (e as Error).message);
  await later();
  m.answer('check', false, 'Registry is busy');
  assert.equal(await caught, 'Registry is busy');
  await later();
  assert.deepEqual(m.sent, ['check', 'snapshot'], 'the next one is sent');
  m.answer('snapshot');
  assert.equal(await after, 'snapshot');
});

test('what the service answers, and the payload sent, pass through unchanged', async () => {
  const seen: unknown[] = [];
  const request = serial(<T>(action: string, payload?: Record<string, unknown>) => { seen.push([action, payload]); return Promise.resolve({ echoed: payload } as T); });
  assert.deepEqual(await request('settings', { revision: 3 }), { echoed: { revision: 3 } });
  assert.deepEqual(seen, [['settings', { revision: 3 }]]);
});

test('an action named as alone is sent at once, waits for nobody and holds nobody back', async () => {
  const m = manual(), request = serial(m.send, ['discover']);
  const plan = request('plan'), discover = request('discover'), scan = request('scan');
  await later();
  assert.deepEqual([...m.sent].sort(), ['discover', 'plan'], 'discover goes while plan is still on its way; scan waits for plan only');
  m.answer('plan');
  await plan;
  await later();
  assert.deepEqual(m.sent.slice(2), ['scan'], 'scan does not wait for discover, which is still unanswered');
  m.answer('scan');
  await scan;
  m.answer('discover');
  assert.equal(await discover, 'discover');
});

// A free-text simulation lasts as long as the AI takes (tens of seconds through a harness). The page's queue is `serial(transport, ALONE)`:
// the service serves each request on its own worker and `simulate` holds no registry lock, so nothing else of the window waits for it,
// and Cancel (`cancel_simulation`) reaches the service while the run it stops is still going.
test('while a simulation is pending, another request of the window is answered, and Cancel is answered before the simulation', async () => {
  const m = manual(), request = serial(m.send, ALONE);
  const simulation = request('simulate'), snapshot = request('snapshot'), cancel = request('cancel_simulation');
  const order: string[] = [];
  void simulation.then(() => order.push('simulate'), () => order.push('simulate'));
  void snapshot.then(() => order.push('snapshot'));
  void cancel.then(() => order.push('cancel_simulation'));
  await later();
  assert.deepEqual([...m.sent].sort(), ['cancel_simulation', 'simulate', 'snapshot'], 'all three are on their way: the simulation holds nobody back');
  m.answer('snapshot');
  assert.equal(await snapshot, 'snapshot');
  m.answer('cancel_simulation');
  assert.equal(await cancel, 'cancel_simulation');
  assert.deepEqual(order, ['snapshot', 'cancel_simulation'], 'the simulation is still unanswered');
  m.answer('simulate', false, 'Stopped');
  await simulation.catch(() => undefined);
  assert.deepEqual(order, ['snapshot', 'cancel_simulation', 'simulate']);
});

test('a request that takes the registry lock still waits for the one before it, simulation or not', async () => {
  const m = manual(), request = serial(m.send, ALONE);
  const simulation = request('simulate'), plan = request('plan'), scan = request('scan');
  await later();
  assert.deepEqual([...m.sent].sort(), ['plan', 'simulate'], 'scan waits for plan, which takes the lock; simulate takes none');
  m.answer('plan');
  await plan;
  await later();
  assert.deepEqual(m.sent.slice(2), ['scan']);
  m.answer('scan');
  await scan;
  m.answer('simulate');
  await simulation;
});

test('a request made while the queue is empty is sent at once', async () => {
  const m = manual(), request = serial(m.send);
  const one = request('registry');
  await later();
  assert.deepEqual(m.sent, ['registry']);
  m.answer('registry');
  await one;
  const two = request('registry');
  await later();
  assert.deepEqual(m.sent, ['registry', 'registry']);
  m.answer('registry');
  await two;
});
