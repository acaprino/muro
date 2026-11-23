// Plan R0, Task 4: what the decision graph of a project is made of for Sigrid's GraphCanvas. Pure data: the entries and capabilities of the guide data, and the steps a decision lights
// (a documented example or the AI's validated answer, never matched by words), become things, the lines between them and the entries that start closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectInfo } from '../src/types.ts';
import { capsOf, entriesOf, examplesOf, outcomeOfExample, litOf } from '../src/pages/project/graph-model.ts';
import { graphScene, capNodeId, capabilityOf } from '../src/pages/project/graphScene.ts';
import type { Scene } from '../src/pages/project/graphScene.ts';
import { createTransport } from './fake-transport.js';

// ---------- fixtures (the ones of project-graph.test.ts) ----------
const intent = (id: string, description = '', excludes = '') => ({ id, description, excludes });
const cap = (id: string, over: Record<string, unknown> = {}) => ({ id, title: id.toUpperCase(), role: 'worker', when: '—', after: [], outputs: [], intents: [intent(id + '-intent', 'When ' + id)], needs: [], conflicts: [], ...over });
const need = (capability: string, label: string) => ({ capability, label, when: label, reason: 'Because.' });
const pick = (capability: string, reason: string) => ({ capability, intent: capability + '-intent', reason });
const CAPS = [
  cap('design-taste', { outputs: ['design-brief', 'palette'], intents: [intent('design-taste-intent', 'Make a design', 'Reviewing one')] }),
  cap('design-review', { needs: [need('design-taste', 'A design exists')] }),
  cap('office-docs', { conflicts: ['office-pdf'], after: ['office-fonts'] }),
  cap('office-pdf'),
  cap('office-fonts'),
];
const ENTRIES = [
  { name: 'marionette-design', description: 'Use when designing', capabilities: ['design-taste', 'design-review'] },
  { name: 'marionette-office', description: 'Use when making files', capabilities: ['office-docs', 'office-pdf', 'office-fonts'] },
];
const EXAMPLES = [
  { title: 'A landing page', task: 'Design a landing page', stack_tokens: ['stack:react'], status: 'selected', selections: [pick('design-taste', 'It designs a page.'), pick('design-review', 'The design is checked.')], reason: 'Design, then review.', questions: [], path: ['design-taste', 'design-review'], steps: [{ step: 'design-taste', capability: 'design-taste', intent: 'design-taste-intent' }, { step: 'design-review', capability: 'design-review', intent: 'design-review-intent' }] },
  { title: 'A letter', task: 'Write a letter', stack_tokens: [], status: 'selected', selections: [pick('office-docs', 'A Word file.')], reason: 'One document.', questions: [], path: ['office-fonts', 'office-docs'], steps: [{ step: 'office-fonts', capability: 'office-fonts', intent: null }, { step: 'office-docs', capability: 'office-docs', intent: 'office-docs-intent' }] },
  { title: 'Hello', task: 'Say hello', stack_tokens: [], status: 'no_match', selections: [], reason: 'Nothing to build.', questions: [], path: [], steps: [] },
];
const meta = { schema: 1, name: 'Marionette', slug: 'marionette', version: '0.5.0', author: 'a', created: '2026-11-10T09:00:00Z', changed: '2026-11-18T12:00:00Z', repository: null, builtin: true };
const info = (graphOver: Record<string, unknown> = {}): ProjectInfo => ({
  project: meta, plugin: { name: 'Marionette', slug: 'marionette', version: '0.5.0', description: 'One plugin' }, inputs: [], decisions: [], records: [], history: [], changelog: '', prompts: [],
  graph: { entries: ENTRIES, capabilities: CAPS, examples: EXAMPLES, ...graphOver }, files: [], digest: 'sha256:a',
} as unknown as ProjectInfo);

const sceneOf = (lit: Map<string, number[]> = new Map(), held = info(), slug = 'marionette') => graphScene(entriesOf(held), capsOf(held), slug, lit);
/** A thing by its label (labels are unique in these fixtures). */
const thing = (scene: Scene, label: string) => {
  const found = scene.nodes.find(n => n.label === label);
  assert.ok(found, `no thing labelled ${label}`);
  return found;
};
const entriesOfScene = (scene: Scene) => scene.nodes.filter(n => n.kind === 'entry');
const capabilitiesOfScene = (scene: Scene) => scene.nodes.filter(n => n.kind === 'capability');

// ---------- things ----------
test('one thing per entry and one per capability, entries first, every id its own', () => {
  const scene = sceneOf();
  assert.deepEqual(entriesOfScene(scene).map(n => n.label), ['design', 'office'], 'an entry is named without the plugin prefix');
  assert.deepEqual(capabilitiesOfScene(scene).map(n => n.label), CAPS.map(c => c.id));
  assert.deepEqual(scene.nodes.slice(0, 2).map(n => n.kind), ['entry', 'entry']);
  assert.equal(new Set(scene.nodes.map(n => n.id)).size, 7);
});

test('an entry says its "Use when" first sentence under its name, and a capability says nothing until a step lights it', () => {
  const scene = sceneOf();
  assert.equal(thing(scene, 'design').detail, 'Use when designing', 'a description with no full stop is taken whole');
  const held = info({ entries: [
    { name: 'marionette-a', description: 'Use when designing pages. Also for decks and notes.', capabilities: [] },
    { name: 'marionette-b', description: 'Use when\n  making files (e.g. a letter). Not for code!', capabilities: [] },
    { name: 'marionette-c', description: 'Is it a page? Then use this.', capabilities: [] },
    { name: 'marionette-d', description: '   ', capabilities: [] },
  ] });
  const entries = entriesOfScene(sceneOf(new Map(), held));
  assert.deepEqual(entries.map(n => n.detail), ['Use when designing pages.', 'Use when making files (e.g. a letter).', 'Is it a page?', undefined]);
  assert.equal('detail' in entries[3], false, 'no empty second line');
  assert.ok(capabilitiesOfScene(scene).every(n => n.detail === undefined));
});

test('prefix shortening affects only entry labels, never identity or an unrelated name', () => {
  const held = info({ capabilities: ['a', 'b', 'c'].map(id => cap(id)), entries: [
    { name: 'marionette-design', capabilities: ['a'] }, { name: 'other-marionette-x', capabilities: ['b'] }, { name: 'marionette', capabilities: ['c'] },
  ] });
  assert.deepEqual(entriesOfScene(sceneOf(new Map(), held)).map(n => n.label), ['design', 'other-marionette-x', 'marionette']);
  assert.deepEqual(entriesOfScene(sceneOf(new Map(), held, '')).map(n => n.label), ['marionette-design', 'other-marionette-x', 'marionette'], 'a project with no slug strips nothing');
});

test('a repeated capability id is one thing, the first one decides, and an id that looks like an entry\'s stays apart from it', () => {
  const held = info({ capabilities: [cap('a'), cap('a', { conflicts: ['b'] }), cap('b'), cap('entry:0:a')], entries: [{ name: 'a', description: '', capabilities: ['a', 'a'] }] });
  const scene = sceneOf(new Map(), held);
  assert.equal(scene.nodes.length, 4);
  assert.equal(new Set(scene.nodes.map(n => n.id)).size, 4, 'entry:0:a is the entry, cap:entry:0:a the capability');
  assert.equal(scene.edges.length, 1, 'the entry lists "a" twice and has one line to it; the second "a" brought no conflict');
  assert.deepEqual(scene.edges.map(e => e.kind), ['member']);
  const swapped = info({ capabilities: [cap('a', { conflicts: ['b'] }), cap('a'), cap('b')], entries: [] });
  assert.deepEqual(sceneOf(new Map(), swapped).edges.map(e => e.kind), ['conflicts']);
});

test('a project with no capability and no entry is an empty scene, and nothing throws', () => {
  assert.deepEqual(sceneOf(new Map(), info({ capabilities: [], entries: [], examples: [] })), { nodes: [], edges: [], closed: [] });
  const noEntry = sceneOf(new Map(), info({ entries: [] }));
  assert.equal(noEntry.nodes.length, 5);
  assert.deepEqual(noEntry.closed, []);
});

// ---------- closed and lit ----------
test('with nothing lit every entry is closed and no capability is numbered', () => {
  const scene = sceneOf();
  assert.deepEqual(scene.closed, entriesOfScene(scene).map(n => n.id));
  assert.ok(capabilitiesOfScene(scene).every(n => n.steps === undefined && n.detail === undefined));
});

test('a documented example numbers its steps and opens only the entry that holds them', () => {
  const held = info(), scene = sceneOf(litOf(outcomeOfExample(examplesOf(held)[0])), held);
  assert.deepEqual(scene.closed, [thing(scene, 'office').id], 'design is open, office stays closed');
  assert.deepEqual(thing(scene, 'design-taste').steps, [1]);
  assert.equal(thing(scene, 'design-taste').detail, 'step 1');
  assert.deepEqual(thing(scene, 'design-review').steps, [2]);
  assert.equal(thing(scene, 'design-review').detail, 'step 2');
  for (const label of ['office-docs', 'office-pdf', 'office-fonts']) assert.equal(thing(scene, label).steps, undefined, label);
  assert.equal(thing(scene, 'design').steps, undefined, 'an entry is opened, not numbered');
});

test('the other example opens the other entry, and a prerequisite the runtime added is numbered like any step', () => {
  const held = info(), scene = sceneOf(litOf(outcomeOfExample(examplesOf(held)[1])), held);
  assert.deepEqual(scene.closed, [thing(scene, 'design').id]);
  assert.deepEqual([thing(scene, 'office-fonts').steps, thing(scene, 'office-docs').steps], [[1], [2]]);
  assert.equal(thing(scene, 'office-pdf').steps, undefined);
});

test('an example with no match lights nothing, and a step that names a capability the graph lacks opens nothing', () => {
  const held = info(), none = sceneOf(litOf(outcomeOfExample(examplesOf(held)[2])), held);
  assert.equal(none.closed.length, 2);
  const lost = sceneOf(new Map([['nobody', [1]]]));
  assert.equal(lost.closed.length, 2);
  assert.ok(lost.nodes.every(n => n.steps === undefined));
});

test('a capability run twice carries both numbers, said in words', () => {
  const twice = sceneOf(new Map([['design-taste', [1, 3]], ['office-docs', [1, 2, 4]]]));
  assert.deepEqual(thing(twice, 'design-taste').steps, [1, 3]);
  assert.equal(thing(twice, 'design-taste').detail, 'steps 1 and 3');
  assert.equal(thing(twice, 'office-docs').detail, 'steps 1, 2 and 4');
  assert.deepEqual(twice.closed, [], 'both entries hold a lit capability');
});

test('the steps a scene carries are its own copy: changing them changes nothing of the decision', () => {
  const lit = new Map([['design-taste', [1]]]);
  const scene = sceneOf(lit);
  thing(scene, 'design-taste').steps!.push(9);
  assert.deepEqual(lit.get('design-taste'), [1]);
});

// ---------- lines ----------
test('each entry has a line to the capabilities it lists, and nothing else lists them', () => {
  const scene = sceneOf(), members = scene.edges.filter(e => e.kind === 'member');
  assert.equal(members.length, 5);
  assert.deepEqual(members.filter(e => e.from === thing(scene, 'design').id).map(e => e.to), [capNodeId('design-taste'), capNodeId('design-review')]);
  assert.deepEqual(members.filter(e => e.from === thing(scene, 'office').id).map(e => e.to), [capNodeId('office-docs'), capNodeId('office-pdf'), capNodeId('office-fonts')]);
});

test('after, needs and conflicts are one line each, from what comes first to what hangs from it', () => {
  const scene = sceneOf(), id = (label: string) => thing(scene, label).id;
  assert.deepEqual(scene.edges.filter(e => e.kind === 'after'), [{ from: id('office-fonts'), to: id('office-docs'), kind: 'after' }]);
  assert.deepEqual(scene.edges.filter(e => e.kind === 'needs'), [{ from: id('design-taste'), to: id('design-review'), kind: 'needs', label: 'A design exists' }], 'a need carries the AI\'s own label');
  assert.deepEqual(scene.edges.filter(e => e.kind === 'conflicts'), [{ from: id('office-docs'), to: id('office-pdf'), kind: 'conflicts' }]);
  assert.equal(scene.edges.length, 8);
});

test('a conflict listed by both capabilities is one line', () => {
  const both = info({ capabilities: [cap('a', { conflicts: ['b'] }), cap('b', { conflicts: ['a'] })], entries: [] });
  const scene = sceneOf(new Map(), both);
  assert.deepEqual(scene.edges, [{ from: capNodeId('a'), to: capNodeId('b'), kind: 'conflicts' }]);
});

test('a line to a capability the graph does not have, or from a capability to itself, is left out; the capabilities stay', () => {
  const lost = info({ capabilities: [cap('a', { needs: [need('gone', 'x')], conflicts: ['gone', 'a'], after: ['gone', 'a'] })], entries: [{ name: 'e', description: '', capabilities: ['gone'] }] });
  const scene = sceneOf(new Map(), lost);
  assert.equal(scene.edges.length, 0);
  assert.deepEqual(scene.nodes.map(n => n.id).sort(), ['cap:a', 'entry:0:e']);
});

test('two relations between the same two capabilities are one line: after is kept before needs, needs before a conflict', () => {
  const held = info({ capabilities: [cap('a', { after: ['b'], needs: [need('b', 'x')], conflicts: ['b'] }), cap('b', { conflicts: ['a'] }), cap('c', { needs: [need('d', 'when d')], conflicts: ['d'] }), cap('d')], entries: [] });
  const scene = sceneOf(new Map(), held);
  assert.deepEqual(scene.edges, [
    { from: capNodeId('b'), to: capNodeId('a'), kind: 'after' },
    { from: capNodeId('d'), to: capNodeId('c'), kind: 'needs', label: 'when d' },
  ]);
});

test('a capability is never joined to the same neighbour twice, in either direction, so no line of the canvas shares its name with another', () => {
  const held = info({ capabilities: [cap('a', { after: ['b'] }), cap('b', { after: ['a'], needs: [need('a', 'x')] }), cap('c', { conflicts: ['a', 'b'] })], entries: [{ name: 'e', description: '', capabilities: ['a', 'b', 'c'] }] });
  const scene = sceneOf(new Map(), held);
  const pairs = scene.edges.map(e => e.from + '>' + e.to);
  assert.equal(new Set(pairs).size, pairs.length);
  assert.equal(scene.edges.filter(e => e.kind !== 'member').length, 3, 'a-b, c-a and c-b: one line for each pair');
});

// ---------- what hangs from no one ----------
test('a capability that no entry lists is kept, hangs from no one and is never closed away', () => {
  const held = info({ capabilities: [cap('listed'), cap('loose')], entries: [{ name: 'marionette-one', description: 'Use when one.', capabilities: ['listed', 'unknown'] }] });
  const scene = sceneOf(new Map(), held);
  assert.equal(scene.nodes.length, 3);
  assert.ok(scene.nodes.some(n => n.id === capNodeId('loose')));
  assert.deepEqual(scene.edges.map(e => [e.from, e.to]), [[thing(scene, 'one').id, capNodeId('listed')]], 'only the entry\'s own line; nothing leads to the loose one, and an unknown id is not a thing');
  assert.deepEqual(scene.closed, [thing(scene, 'one').id], 'only entries are ever closed');
  const lit = sceneOf(new Map([['loose', [1]]]), held);
  assert.equal(thing(lit, 'loose').steps?.[0], 1);
  assert.deepEqual(lit.closed, [thing(lit, 'one').id], 'a lit capability that no entry holds opens no entry, and stays in sight');
});

test('an entry with nothing in it is a thing too, closed', () => {
  const scene = sceneOf(new Map(), info({ entries: [{ name: 'marionette-empty', description: 'Use when empty.', capabilities: [] }] }));
  assert.deepEqual(entriesOfScene(scene).map(n => n.label), ['empty']);
  assert.equal(scene.closed.length, 1);
});

// ---------- identifiers ----------
test('a capability is named on the canvas by an id that gives its own name back, whatever it is called', () => {
  assert.equal(capNodeId('design-taste'), 'cap:design-taste');
  for (const id of ['design-taste', 'x y', '<odd>:identifier', 'entry:0:a', '']) assert.equal(capabilityOf(capNodeId(id)), id);
  assert.equal(capabilityOf('entry:0:design'), null);
  assert.equal(capabilityOf('capability'), null);
  const scene = sceneOf();
  assert.deepEqual(capabilitiesOfScene(scene).map(n => capabilityOf(n.id)), CAPS.map(c => c.id));
  assert.ok(entriesOfScene(scene).every(n => capabilityOf(n.id) === null));
});

// ---------- at the size of Marionette ----------
test('37 capabilities in 15 entries are 52 things with every entry closed, and the lines are never doubled', async () => {
  const fake = createTransport('projects');
  fake.flags.bigGraph = true;
  const held = await fake.request('project', { id: 'marionette' }) as ProjectInfo;
  const scene = sceneOf(new Map(), held);
  assert.equal(scene.nodes.length, 52);
  assert.equal(entriesOfScene(scene).length, 15);
  assert.equal(capabilitiesOfScene(scene).length, 37);
  assert.equal(scene.closed.length, 15);
  assert.equal(new Set(scene.nodes.map(n => n.id)).size, 52);
  const entryIds = new Set(entriesOfScene(scene).map(n => n.id));
  assert.ok(scene.closed.every(id => entryIds.has(id)));
  assert.equal(scene.edges.filter(e => e.kind === 'member').length, 37, 'every capability hangs from the one entry that lists it');
  assert.ok(scene.edges.some(e => e.kind === 'needs'));
  assert.ok(scene.edges.some(e => e.kind === 'conflicts'));
  const pairs = scene.edges.map(e => e.from + '>' + e.to);
  assert.equal(new Set(pairs).size, pairs.length);
  const ids = new Set(scene.nodes.map(n => n.id));
  assert.ok(scene.edges.every(e => ids.has(e.from) && ids.has(e.to)), 'no line ends at a thing that is not there');
});

test('an example of the large graph opens the entries of its capabilities and no others', async () => {
  const fake = createTransport('projects');
  fake.flags.bigGraph = true;
  const held = await fake.request('project', { id: 'marionette' }) as ProjectInfo;
  const example = examplesOf(held)[0], lit = litOf(outcomeOfExample(example));
  assert.equal(lit.size, 2);
  const scene = sceneOf(lit, held);
  assert.equal(scene.closed.length, 13, 'two entries hold the two lit capabilities');
  const holding = entriesOf(held).filter(e => e.capabilities.some(c => lit.has(c))).map(e => e.name);
  assert.equal(holding.length, 2);
  for (const name of holding) assert.ok(!scene.closed.some(id => id.endsWith(':' + name)), name + ' is open');
  assert.deepEqual(capabilitiesOfScene(scene).filter(n => n.steps).map(n => capabilityOf(n.id)).sort(), example.steps.map(s => s.capability).sort());
});
