// Plan R0, Task 6: the fake of the registry service (fake-transport.js) keeps the rules of the real runtime that the browser tests lean on. This test was part of
// project-graph.test.ts; the fake stays, so does it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransport } from './fake-transport.js';

test('the fake service ends a delayed run that is cancelled, and refuses a run that is not running or has no name', async () => {
  const fake = createTransport('projects');
  fake.flags.simulateDelay = 5000;
  const run = fake.request('simulate', { id: 'marionette', task: 'x', run: 'r-1' });
  assert.deepEqual(await fake.request('cancel_simulation', { run: 'r-1' }), { status: 'cancelling' });
  await assert.rejects(run, /was cancelled/);
  await assert.rejects(fake.request('cancel_simulation', { run: 'r-1' }), /not running/);
  await assert.rejects(fake.request('simulate', { id: 'marionette', task: 'x' }), /Invalid run ID/);
});
