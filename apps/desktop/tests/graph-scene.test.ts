// Plan R0, Task 4, and the move to Sigrid 4.3.1: what the decision graph of a project is made of for Sigrid's GraphCanvas. Pure data: the entries and capabilities of the guide
// data, and the steps a decision lights (a documented example or the AI's validated answer, never matched by words), become things, the lines between them with the kind of
// each, the numbered path, and the entries that start closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectInfo } from '../src/types.ts';
import { capsOf, entriesOf, examplesOf, outcomeOfExample, litOf } from '../src/pages/project/graph-model.ts';
import { around, graphScene, capNodeId, capabilityOf, drawnNodes, openingFor } from '../src/pages/project/graphScene.ts';
import type { Scene, SceneEdge } from '../src/pages/project/graphScene.ts';
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

const sceneOf = (lit: Map<string, number[]> = new Map(), held = info(), slug = 'marionette', reached: string[] = []) => graphScene(entriesOf(held), capsOf(held), slug, lit, reached);
/** A thing by its label (labels are unique in these fixtures). */
const thing = (scene: Scene, label: string) => {
  const found = scene.nodes.find(n => n.label === label);
  assert.ok(found, `no thing labelled ${label}`);
  return found;
};
const entriesOfScene = (scene: Scene) => scene.nodes.filter(n => n.kind === 'entry');
const capabilitiesOfScene = (scene: Scene) => scene.nodes.filter(n => n.kind === 'capability');
/** The numbers of a capability's steps on the scene's path, by capability id. */
const stepsOf = (scene: Scene, id: string) => scene.steps.get(capNodeId(id));
/** The line of a relation, as the scene names it: its relation and its two ends (a conflict's two ends in either order). */
const lineId = (relation: SceneEdge['relation'], from: string, to: string) => JSON.stringify([relation, ...(relation === 'conflicts' ? [from, to].sort() : [from, to])]);

// ---------- things ----------
test('one thing per entry and one per capability, entries first, every id its own', () => {
  const scene = sceneOf();
  assert.deepEqual(entriesOfScene(scene).map(n => n.label), ['design', 'office'], 'an entry is named without the plugin prefix');
  assert.deepEqual(capabilitiesOfScene(scene).map(n => n.label), CAPS.map(c => c.id));
  assert.deepEqual(scene.nodes.slice(0, 2).map(n => n.kind), ['entry', 'entry']);
  assert.equal(new Set(scene.nodes.map(n => n.id)).size, 7);
});

test('a closed entry is its name alone; its "Use when" first sentence is kept, and is its second line once it is open; a capability has no second line, lit or not', () => {
  const scene = sceneOf();
  assert.equal(thing(scene, 'design').about, 'Use when designing', 'a description with no full stop is taken whole');
  assert.equal('detail' in thing(scene, 'design'), false, 'closed: no second line, so a column of closed entries is drawn larger');
  const opened = sceneOf(litOf(outcomeOfExample(examplesOf(info())[0])));
  assert.equal(thing(opened, 'design').detail, 'Use when designing', 'open, the entry says it under its name');
  assert.equal('detail' in thing(opened, 'office'), false, 'the entry left closed does not');
  assert.ok(capabilitiesOfScene(opened).every(n => !('detail' in n)), 'a lit capability is numbered by the canvas (steps), not by a second line');
  const held = info({ entries: [
    { name: 'marionette-a', description: 'Use when designing pages. Also for decks and notes.', capabilities: [] },
    { name: 'marionette-b', description: 'Use when\n  making files (e.g. a letter). Not for code!', capabilities: [] },
    { name: 'marionette-c', description: 'Is it a page? Then use this.', capabilities: [] },
    { name: 'marionette-d', description: '   ', capabilities: [] },
  ] });
  const entries = entriesOfScene(sceneOf(new Map(), held));
  assert.deepEqual(entries.map(n => n.about), ['Use when designing pages.', 'Use when making files (e.g. a letter).', 'Is it a page?', undefined]);
  assert.equal('about' in entries[3], false, 'no empty sentence');
  assert.ok(entries.every(n => !('detail' in n)), 'all closed, none has a second line');
  assert.deepEqual(drawnNodes(sceneOf(new Map(), held), []).filter(n => n.kind === 'entry').map(n => n.detail), ['Use when designing pages.', 'Use when making files (e.g. a letter).', 'Is it a page?', undefined], 'opened, each says its sentence');
  assert.ok(capabilitiesOfScene(scene).every(n => n.detail === undefined));
});

test('the things as the canvas draws them: an entry the person opens gets its second line, one the person closes loses it, and a capability is as the scene made it', () => {
  const scene = sceneOf(), design = thing(scene, 'design').id, office = thing(scene, 'office').id;
  const drawn = drawnNodes(scene, [office]), byId = (id: string) => drawn.find(n => n.id === id)!;
  assert.equal(byId(design).detail, 'Use when designing', 'opened by hand');
  assert.equal('detail' in byId(office), false);
  assert.equal(byId(design).about, 'Use when designing', 'the sentence stays with the entry');
  const lit = sceneOf(new Map([['design-taste', [1]]]));
  assert.equal(thing(lit, 'design').detail, 'Use when designing');
  assert.equal('detail' in drawnNodes(lit, [design, office]).find(n => n.id === design)!, false, 'closed by hand, it is its name alone');
  assert.deepEqual(drawnNodes(lit, []).filter(n => n.kind === 'capability'), capabilitiesOfScene(lit), 'the capabilities, untouched');
  assert.deepEqual(drawnNodes(scene, scene.closed), scene.nodes, 'with the scene\'s own closed entries, the things are the scene\'s');
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
  assert.deepEqual(scene.edges.map(e => e.relation), ['member']);
  const swapped = info({ capabilities: [cap('a', { conflicts: ['b'] }), cap('a'), cap('b')], entries: [] });
  assert.deepEqual(sceneOf(new Map(), swapped).edges.map(e => e.relation), ['conflicts']);
});

test('a project with no capability and no entry is an empty scene, and nothing throws', () => {
  assert.deepEqual(sceneOf(new Map(), info({ capabilities: [], entries: [], examples: [] })), { nodes: [], edges: [], steps: new Map(), closed: [] });
  const noEntry = sceneOf(new Map(), info({ entries: [] }));
  assert.equal(noEntry.nodes.length, 5);
  assert.deepEqual(noEntry.closed, []);
});

// ---------- closed and lit ----------
test('with nothing lit every entry is closed and nothing is numbered', () => {
  const scene = sceneOf();
  assert.deepEqual(scene.closed, entriesOfScene(scene).map(n => n.id));
  assert.equal(scene.steps.size, 0);
});

test('a documented example numbers its steps on the canvas\'s path and opens only the entry that holds them', () => {
  const held = info(), scene = sceneOf(litOf(outcomeOfExample(examplesOf(held)[0])), held);
  assert.deepEqual(scene.closed, [thing(scene, 'office').id], 'design is open, office stays closed');
  assert.deepEqual([...scene.steps], [[capNodeId('design-taste'), [1]], [capNodeId('design-review'), [2]]], 'keyed by the thing of each capability, as the canvas reads `steps`');
  for (const label of ['office-docs', 'office-pdf', 'office-fonts']) assert.equal(stepsOf(scene, label), undefined, label);
  assert.equal(scene.steps.has(thing(scene, 'design').id), false, 'an entry is opened, not numbered');
});

test('the other example opens the other entry, a prerequisite the runtime added is numbered like any step, and the path is in the order of the steps', () => {
  const held = info(), scene = sceneOf(litOf(outcomeOfExample(examplesOf(held)[1])), held);
  assert.deepEqual(scene.closed, [thing(scene, 'design').id]);
  assert.deepEqual([...scene.steps.keys()], [capNodeId('office-fonts'), capNodeId('office-docs')], 'office-fonts first, although the graph lists office-docs before it');
  assert.deepEqual([stepsOf(scene, 'office-fonts'), stepsOf(scene, 'office-docs')], [[1], [2]]);
  assert.equal(stepsOf(scene, 'office-pdf'), undefined);
});

test('an example with no match lights nothing, and a step that names a capability the graph lacks opens nothing and is not on the path', () => {
  const held = info(), none = sceneOf(litOf(outcomeOfExample(examplesOf(held)[2])), held);
  assert.equal(none.closed.length, 2);
  assert.equal(none.steps.size, 0);
  const lost = sceneOf(new Map([['nobody', [1]]]));
  assert.equal(lost.closed.length, 2);
  assert.equal(lost.steps.size, 0);
});

test('the capabilities an input went to open the entries that hold them, unnumbered, and no other entry; one the graph lacks opens nothing', () => {
  const scene = sceneOf(new Map(), info(), 'marionette', ['office-docs']);
  assert.deepEqual(scene.closed, [thing(scene, 'design').id]);
  assert.equal(thing(scene, 'office').detail, 'Use when making files', 'open, it says its sentence');
  assert.equal(scene.steps.size, 0, 'reached is not lit: nothing is numbered');
  assert.equal(sceneOf(new Map(), info(), 'marionette', ['gone']).closed.length, 2);
  assert.deepEqual(sceneOf(new Map([['design-taste', [1]]]), info(), 'marionette', ['office-pdf']).closed, [], 'what is lit and what is reached both open their entries');
});

test('a capability run twice carries both numbers', () => {
  const twice = sceneOf(new Map([['design-taste', [1, 3]], ['office-docs', [1, 2, 4]]]));
  assert.deepEqual(stepsOf(twice, 'design-taste'), [1, 3]);
  assert.deepEqual(stepsOf(twice, 'office-docs'), [1, 2, 4]);
  assert.deepEqual(twice.closed, [], 'both entries hold a lit capability');
});

test('the steps a scene carries are its own copy: changing them changes nothing of the decision', () => {
  const lit = new Map([['design-taste', [1]]]);
  const scene = sceneOf(lit);
  (stepsOf(scene, 'design-taste') as number[]).push(9);
  assert.deepEqual(lit.get('design-taste'), [1]);
});

// ---------- lines ----------
test('each entry has a line to the capabilities it lists, the line of Sigrid\'s tree (no kind of its own, no words, no dash)', () => {
  const scene = sceneOf(), members = scene.edges.filter(e => e.relation === 'member');
  assert.equal(members.length, 5);
  assert.deepEqual(members.filter(e => e.from === thing(scene, 'design').id).map(e => e.to), [capNodeId('design-taste'), capNodeId('design-review')]);
  assert.deepEqual(members.filter(e => e.from === thing(scene, 'office').id).map(e => e.to), [capNodeId('office-docs'), capNodeId('office-pdf'), capNodeId('office-fonts')]);
  for (const e of members) assert.deepEqual(Object.keys(e).sort(), ['from', 'id', 'relation', 'to'], 'a child line, which hangs the capability from its entry: what opens, closes and counts');
});

test('after, needs and conflicts are one link line each, from what comes first to what follows it, told apart by their dash and their words, never by a colour', () => {
  const scene = sceneOf(), id = (label: string) => thing(scene, label).id;
  assert.deepEqual(scene.edges.filter(e => e.relation === 'after'), [
    { id: lineId('after', id('office-fonts'), id('office-docs')), from: id('office-fonts'), to: id('office-docs'), relation: 'after', kind: 'link', label: 'runs first', labelShown: 'chosen' },
  ], 'solid, with the arrowhead a link has');
  assert.deepEqual(scene.edges.filter(e => e.relation === 'needs'), [
    { id: lineId('needs', id('design-taste'), id('design-review')), from: id('design-taste'), to: id('design-review'), relation: 'needs', kind: 'link', style: 'dashed', label: 'A design exists', labelShown: 'chosen' },
  ], 'dashed, with the AI\'s own label of its condition');
  assert.deepEqual(scene.edges.filter(e => e.relation === 'conflicts'), [
    { id: lineId('conflicts', id('office-docs'), id('office-pdf')), from: id('office-docs'), to: id('office-pdf'), relation: 'conflicts', kind: 'link', style: 'dotted', directed: false, label: 'never together', labelShown: 'chosen' },
  ], 'dotted, both ways: no arrowhead');
  assert.equal(scene.edges.length, 8);
  assert.ok(scene.edges.every(e => !('tone' in e)), 'no line has a tone of its own, so the lit path takes the accent');
  assert.deepEqual(scene.edges.map(e => e.relation), ['member', 'member', 'member', 'member', 'member', 'after', 'needs', 'conflicts'], 'the order the canvas reads: of two lines between two steps, the first is the path\'s');
});

test('a need with no label of its own says that it holds on a condition', () => {
  const held = info({ capabilities: [cap('a', { needs: [need('b', '')] }), cap('b')], entries: [] });
  assert.deepEqual(sceneOf(new Map(), held).edges.map(e => e.label), ['on a condition']);
});

test('a conflict listed by both capabilities is one line', () => {
  const both = info({ capabilities: [cap('a', { conflicts: ['b'] }), cap('b', { conflicts: ['a'] })], entries: [] });
  const scene = sceneOf(new Map(), both);
  assert.deepEqual(scene.edges.map(e => [e.relation, e.from, e.to]), [['conflicts', capNodeId('a'), capNodeId('b')]]);
});

test('a line to a capability the graph does not have, or from a capability to itself, is left out; the capabilities stay', () => {
  const lost = info({ capabilities: [cap('a', { needs: [need('gone', 'x')], conflicts: ['gone', 'a'], after: ['gone', 'a'] })], entries: [{ name: 'e', description: '', capabilities: ['gone'] }] });
  const scene = sceneOf(new Map(), lost);
  assert.equal(scene.edges.length, 0);
  assert.deepEqual(scene.nodes.map(n => n.id).sort(), ['cap:a', 'entry:0:e']);
});

test('two relations between the same two capabilities are two lines, each with its words (Sigrid draws them side by side); the same relation said twice is one', () => {
  const held = info({ capabilities: [cap('a', { after: ['b', 'b'], needs: [need('b', 'x')], conflicts: ['b'] }), cap('b', { conflicts: ['a'] }), cap('c', { needs: [need('d', 'when d')], conflicts: ['d'] }), cap('d')], entries: [] });
  const scene = sceneOf(new Map(), held);
  assert.deepEqual(scene.edges.map(e => [e.relation, e.from, e.to, e.label]), [
    ['after', capNodeId('b'), capNodeId('a'), 'runs first'],
    ['needs', capNodeId('b'), capNodeId('a'), 'x'],
    ['needs', capNodeId('d'), capNodeId('c'), 'when d'],
    ['conflicts', capNodeId('a'), capNodeId('b'), 'never together'],
    ['conflicts', capNodeId('c'), capNodeId('d'), 'never together'],
  ]);
});

test('every line has an id of its own, whatever the capabilities are called, so the canvas never takes two for one', () => {
  const held = info({ capabilities: [cap('a', { after: ['b'] }), cap('b', { after: ['a'], needs: [need('a', 'x')] }), cap('c', { conflicts: ['a', 'b'] }), cap('x>cap:y'), cap('x', { after: ['y>cap:z'] }), cap('y>cap:z', { after: ['x>cap:y'] })], entries: [{ name: 'e', description: '', capabilities: ['a', 'b', 'c'] }] });
  const scene = sceneOf(new Map(), held);
  const ids = scene.edges.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(scene.edges.filter(e => e.relation !== 'member').length, 7, 'b→a and a→b, the need, c–a, c–b, and the two lines of the odd names');
});

// ---------- what a chosen capability needs in sight ----------
test('a chosen capability is drawn with what it is joined to: itself first, then each capability of its lines, once; nothing for one the graph lacks', () => {
  const scene = sceneOf();
  assert.deepEqual(around(scene, 'office-docs'), [capNodeId('office-docs'), capNodeId('office-fonts'), capNodeId('office-pdf')], 'what runs first, then what it never goes with');
  assert.deepEqual(around(scene, 'design-review'), [capNodeId('design-review'), capNodeId('design-taste')], 'what it needs, either way of the line');
  assert.deepEqual(around(scene, 'design-taste'), [capNodeId('design-taste'), capNodeId('design-review')]);
  assert.deepEqual(around(scene, 'gone'), []);
  const both = sceneOf(new Map(), info({ capabilities: [cap('a', { after: ['b'], conflicts: ['b'] }), cap('b')], entries: [] }));
  assert.deepEqual(around(both, 'a'), [capNodeId('a'), capNodeId('b')], 'two lines to one capability bring it once');
});

test('the entries to open so that some things are in sight: those that hide a capability, once each; none for what is in sight or hangs from nothing', () => {
  const scene = sceneOf(), design = thing(scene, 'design').id, office = thing(scene, 'office').id;
  assert.deepEqual(openingFor(scene, around(scene, 'office-docs'), scene.closed), [office]);
  assert.deepEqual(openingFor(scene, [capNodeId('design-review'), capNodeId('office-pdf')], scene.closed), [design, office]);
  assert.deepEqual(openingFor(scene, around(scene, 'design-review'), [office]), [], 'design is open already');
  assert.deepEqual(openingFor(scene, [design, office], scene.closed), [], 'an entry is always in sight');
  const shared = sceneOf(new Map(), info({ capabilities: [cap('a'), cap('loose')], entries: [{ name: 'one', description: '', capabilities: ['a'] }, { name: 'two', description: '', capabilities: ['a'] }] }));
  assert.deepEqual(openingFor(shared, [capNodeId('a')], ['entry:0:one']), [], 'a capability listed by an open entry too is in sight');
  assert.deepEqual(openingFor(shared, [capNodeId('a')], ['entry:0:one', 'entry:1:two']), ['entry:0:one', 'entry:1:two']);
  assert.deepEqual(openingFor(shared, [capNodeId('loose')], shared.closed), [], 'a capability no entry lists hangs from nothing');
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
  assert.deepEqual(stepsOf(lit, 'loose'), [1]);
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
test('37 capabilities in 15 entries are 52 things with every entry closed, every relation is a line of its own kind, and no line is doubled', async () => {
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
  assert.equal(scene.edges.filter(e => e.relation === 'member').length, 37, 'every capability hangs from the one entry that lists it');
  assert.ok(entriesOfScene(scene).every(n => !('detail' in n)), 'the first view: fifteen closed entries, each its name alone');
  assert.ok(scene.edges.some(e => e.relation === 'needs' && e.style === 'dashed'));
  assert.ok(scene.edges.some(e => e.relation === 'conflicts' && e.style === 'dotted'));
  assert.ok(scene.edges.every(e => (e.relation === 'member') === (e.kind === undefined)), 'only an entry\'s lines hang; every other is a link');
  const ids = scene.edges.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length);
  const things = new Set(scene.nodes.map(n => n.id));
  assert.ok(scene.edges.every(e => things.has(e.from) && things.has(e.to)), 'no line ends at a thing that is not there');
});

test('an example of the large graph opens the entries of its capabilities and no others, and numbers them', async () => {
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
  assert.deepEqual([...scene.steps.keys()].map(capabilityOf), example.steps.map(s => s.capability), 'the path, in the order of the steps');
});
