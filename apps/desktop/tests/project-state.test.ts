// Plan R0, Task 5: what the workspace of an open project keeps across a reload (src/state/project.ts). Pure data under Node: the session is a Map.
// A bad record is no record, a simulation that was waiting for the AI never comes back as waiting, and a good record comes back as it was.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fresh, newSim, recall, remember, restoreSim, sameSelected, noteTold, tellNote, PANELS } from '../src/state/project.ts';
import type { ProjectView } from '../src/state/project.ts';

const memory = new Map<string, string>();
const newSession = () => { memory.clear(); (globalThis as any).sessionStorage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, String(v)), removeItem: (k: string) => void memory.delete(k) }; };
const it = (name: string, body: () => void | Promise<void>) => test(name, async () => { newSession(); await body(); });
const decision = { kind: 'decision', asked: 'Write a letter', status: 'selected', steps: [{ step_id: 'office-docs', capability: 'office-docs', intent: 'office-docs-intent', reason: 'A Word file.', added_as_prerequisite: false }], reason: 'One document.', questions: [], stack: [], who: null, example: null } as const;

it('a project opened from the list starts on its examples, with nothing selected and no simulation', () => {
  assert.deepEqual(fresh('marionette'), { id: 'marionette', panel: 'examples', selected: null, sim: newSim() });
  assert.deepEqual(newSim(), { task: '', example: null, run: null, error: '', result: null });
  assert.deepEqual(PANELS, ['inputs', 'examples', 'records', 'runs']);
});

it('a good record comes back as it was: the project, the panel, the selection and the simulation', () => {
  const held: ProjectView = { id: 'marionette', panel: 'inputs', selected: { kind: 'input', id: 'taste-skill' }, sim: { task: 'Write a letter', example: 1, run: null, error: '', result: structuredClone(decision) as any } };
  remember(held);
  assert.deepEqual(recall(), held);
  for (const selected of [{ kind: 'example', id: '0' }, { kind: 'capability', id: 'design-taste' }, null] as const) {
    remember({ ...held, selected });
    assert.deepEqual(recall()?.selected, selected);
  }
  remember(null);
  assert.equal(recall(), null, 'closing the project forgets it');
});

it('a simulation that was waiting for the AI is never brought back as waiting, and the error of the box is not kept', () => {
  remember({ ...fresh('marionette'), sim: { task: 'Write a letter', example: null, run: 'run-1', error: 'Write a request first.', result: null } });
  const kept = JSON.parse(memory.get('muro.project')!);
  assert.equal('run' in kept.sim, false, 'the run is not written');
  assert.equal('error' in kept.sim, false);
  assert.deepEqual(recall()?.sim, { task: 'Write a letter', example: null, run: null, error: '', result: null });
  // A record written by an older page, which kept the run: still not running.
  memory.set('muro.project', JSON.stringify({ id: 'm', panel: 'examples', selected: null, sim: { task: 't', example: 2, run: 'run-2', error: 'x', result: null } }));
  assert.deepEqual(recall()?.sim, { task: 't', example: 2, run: null, error: '', result: null });
  assert.deepEqual(restoreSim({ run: 'r', error: 'e' }), newSim());
});

it('a simulation read back keeps only what is valid: a bad example index or an outcome in an unknown shape is none', () => {
  assert.deepEqual(restoreSim(null), newSim());
  assert.deepEqual(restoreSim('x'), newSim());
  for (const example of [-1, 1.5, '1', null]) assert.equal(restoreSim({ example }).example, null, String(example));
  assert.equal(restoreSim({ result: { kind: 'decision', asked: 'x' } }).result, null, 'a decision with no steps is no outcome');
  assert.deepEqual(restoreSim({ result: decision }).result, decision);
  assert.deepEqual(restoreSim({ result: { kind: 'failed', asked: 'x', message: 'No key' } }).result, { kind: 'failed', asked: 'x', message: 'No key' });
});

it('a bad record is no record: not JSON, not an object, an unknown panel, no id, or a selection of a kind the page does not know', () => {
  const good = { id: 'm', panel: 'records', selected: null, sim: {} };
  for (const bad of ['{', 'null', '[]', '7', '"m"',
    JSON.stringify({ ...good, id: 7 }), JSON.stringify({ ...good, id: '' }), JSON.stringify({ ...good, panel: 'graph' }), JSON.stringify({ ...good, panel: undefined }),
    JSON.stringify({ ...good, selected: 'design-taste' }), JSON.stringify({ ...good, selected: { kind: 'entry', id: 'x' } }), JSON.stringify({ ...good, selected: { kind: 'capability', id: '' } }),
    JSON.stringify({ ...good, selected: { kind: 'capability', id: 3 } }), JSON.stringify({ ...good, selected: { kind: 'example', id: 'first' } })]) {
    memory.set('muro.project', bad);
    assert.equal(recall(), null, bad);
  }
  memory.set('muro.project', JSON.stringify({ id: 'm', panel: 'runs' }));
  assert.deepEqual(recall(), { id: 'm', panel: 'runs', selected: null, sim: newSim() }, 'a record with no selection and no simulation is a record');
});

it('a session that keeps nothing still works, and the engine note is then said every time', () => {
  delete (globalThis as any).sessionStorage;
  assert.equal(recall(), null);
  assert.doesNotThrow(() => remember(fresh('marionette')));
  assert.doesNotThrow(() => remember(null));
  assert.doesNotThrow(() => tellNote());
  assert.equal(noteTold(), false);
  (globalThis as any).sessionStorage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
  assert.equal(recall(), null, 'a session that refuses to be read');
  assert.doesNotThrow(() => remember(fresh('marionette')));
  assert.equal(noteTold(), false);
});

it('the engine note is said until the first free-text request of the session, then never again in it', () => {
  assert.equal(noteTold(), false);
  tellNote();
  assert.equal(noteTold(), true);
  newSession();
  assert.equal(noteTold(), false, 'a new session says it again');
});

it('two selections are the same when they name the same kind and id', () => {
  assert.equal(sameSelected(null, null), true);
  assert.equal(sameSelected({ kind: 'example', id: '1' }, { kind: 'example', id: '1' }), true);
  assert.equal(sameSelected({ kind: 'example', id: '1' }, { kind: 'capability', id: '1' }), false);
  assert.equal(sameSelected({ kind: 'input', id: 'a' }, null), false);
});
