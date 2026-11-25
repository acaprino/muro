// Plan R0, Task 6: the fake of the registry service (fake-transport.js) keeps the rules of the real runtime that the browser tests lean on. This test was part of
// project-graph.test.ts; the fake stays, so does it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransport, ODD_TITLE } from './fake-transport.js';

test('the fake service ends a delayed run that is cancelled, and refuses a run that is not running or has no name', async () => {
  const fake = createTransport('projects');
  fake.flags.simulateDelay = 5000;
  const run = fake.request('simulate', { id: 'sample', task: 'x', run: 'r-1' });
  assert.deepEqual(await fake.request('cancel_simulation', { run: 'r-1' }), { status: 'cancelling' });
  await assert.rejects(run, /was cancelled/);
  await assert.rejects(fake.request('cancel_simulation', { run: 'r-1' }), /not running/);
  await assert.rejects(fake.request('simulate', { id: 'sample', task: 'x' }), /Invalid run ID/);
});

test('the flags that shape the next project answer: no graph, no entry, odd names, objects where text belongs; the stored project never changes', async () => {
  const fake = createTransport('projects');
  const project = () => fake.request('project', { id: 'sample' }) as Promise<any>;
  const plain = await project();
  fake.flags.emptyGraph = true;
  assert.deepEqual((await project()).graph, { entries: [], capabilities: [], examples: [] });
  fake.flags.emptyGraph = false;
  fake.flags.noEntries = true;
  const loose = await project();
  assert.deepEqual(loose.graph.entries, []);
  assert.deepEqual(loose.graph.capabilities, plain.graph.capabilities);
  fake.flags.noEntries = false;
  fake.flags.oddNames = true;
  assert.deepEqual((await project()).graph.examples.map((e: any) => e.title), ['A landing page', 'A letter', 'A letter', ODD_TITLE]);
  fake.flags.oddNames = false;
  fake.flags.objectFields = true;
  const objects = await project();
  assert.deepEqual(objects.records[0].text, { en: 'One owner per output.' });
  assert.deepEqual(objects.history[0].changelog, { en: 'Moved taste-skill to v1.2.0.' });
  fake.flags.objectFields = false;
  assert.deepEqual(await project(), plain);
});
