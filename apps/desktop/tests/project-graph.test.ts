// Plan 2, Task 8: step 3 of a project, the decision graph and the simulator. The model (what the graph and the examples are made of, and how an answer of the
// runtime is read), the layout and the drawing, the step's view and actions over the fake service, the capability sheet, and what the session keeps.
// The page never decides a branch: only a documented example and the AI's validated answer light one, and these tests feed it both.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Snapshot, ViewState, ProjectInfo } from '../src/types.ts';
import type { App } from '../src/context.ts';
import * as graph from '../src/pages/project/graph.ts';
import * as projects from '../src/pages/projects.ts';
import { blankProjects, fresh, recall, remember } from '../src/pages/project/state.ts';
import { capsOf, entriesOf, examplesOf, outcomeOfExample, readAnswer, readOutcome, litOf } from '../src/pages/project/graph-model.ts';
import type { Outcome } from '../src/pages/project/graph-model.ts';
import { layout, drawGraph, textWidth } from '../src/pages/project/graph-draw.ts';
import { createTransport } from './fake-transport.js';

// ---------- fixtures ----------
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
const DECISIONS = [
  { source: 'taste-skill', content: 'SKILL.md', form: 'capability', targets: ['design-taste'], reason: 'x' },
  { source: 'taste-skill', content: 'refs.md', form: 'capability', targets: ['design-taste'], reason: 'x' },
  { source: 'genoffice', content: 'skills/docx', form: 'capability', targets: ['design-taste', 'office-docs'], reason: 'x' },
  { source: 'superpowers', content: 'using', form: 'always-on', targets: [], reason: 'x' },
];
const meta = { schema: 1, name: 'Marionette', slug: 'marionette', version: '0.5.0', author: 'a', created: '2026-11-10T09:00:00Z', changed: '2026-11-18T12:00:00Z', repository: null, builtin: true };
const info = (over: Record<string, unknown> = {}, graphOver: Record<string, unknown> = {}): ProjectInfo => ({
  project: meta, plugin: { name: 'Marionette', slug: 'marionette', version: '0.5.0', description: 'One plugin' }, inputs: [], decisions: DECISIONS, records: [], history: [], changelog: '', prompts: [],
  graph: { entries: ENTRIES, capabilities: CAPS, examples: EXAMPLES, ...graphOver }, files: [], digest: 'sha256:a', ...over,
} as unknown as ProjectInfo);
const snapshot = (settings: Record<string, unknown> = {}): Snapshot => ({
  registry: { schema: 1, revision: 1, plugins: [], targets: [], settings: { auto_sync: false, interval_minutes: 60, close_to_tray: true, agent: 'claude-code', python: 'python', factory_path: '', ...settings } },
  inventory: [], activity: [], sync: { last_check: null, last_sync: null, revision: null, pending: null, blockers: null, errors: null, targets: {} },
} as unknown as Snapshot);
const blank = (over: Partial<ViewState> = {}): ViewState => ({ page: 'projects', snapshot: snapshot(), discovered: [], discovering: false, plan: null, checking: false, applying: null, review: null, query: '', filter: 'all', afilter: 'all', busy: null, error: null, checkErrors: [], discoveryError: null, maintenance: null, autostart: null, setup: null, projects: blankProjects(), project: null, ...over });
const opened = (sim: Partial<graph.SimState> = {}, held = info(), s: Snapshot = snapshot()): ViewState => {
  const state = blank({ snapshot: s, project: { ...fresh('marionette'), step: 'graph' } });
  Object.assign(state.project!.sim, sim);
  state.projects = { ...blankProjects(), info: held, infoId: 'marionette' };
  return state;
};
const show = (state: ViewState) => graph.view(state, state.projects.info!);
const words = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const ai = (over: Record<string, unknown> = {}) => ({ engine: 'harness', harness: 'claude-code', budget_usd: 0.5, api_base: 'https://api.openai.com/v1', model: '', api_key_env: 'MURO_API_KEY', ...over });
const decision = (over: Record<string, unknown> = {}): Outcome => ({ kind: 'decision', asked: 'Write a letter', status: 'selected', steps: [{ step_id: 'office-docs', capability: 'office-docs', intent: 'office-docs-intent', reason: 'A Word file.', added_as_prerequisite: false }], reason: 'One document.', questions: [], stack: [], who: null, example: null, ...over } as Outcome);

const memory = new Map<string, string>();
const newSession = () => { memory.clear(); (globalThis as any).sessionStorage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, String(v)), removeItem: (k: string) => void memory.delete(k) }; };
const it = (name: string, body: () => void | Promise<void>) => test(name, async () => { newSession(); await body(); });

// ---------- the model ----------
it('the graph is read from the guide data: capabilities, entries and what each example resolved to', () => {
  const held = info();
  assert.deepEqual(capsOf(held).map(c => c.id), CAPS.map(c => c.id));
  const review = capsOf(held).find(c => c.id === 'design-review')!;
  assert.deepEqual(review.needs, [{ capability: 'design-taste', label: 'A design exists', when: 'A design exists', reason: 'Because.' }]);
  assert.deepEqual(capsOf(held).find(c => c.id === 'office-docs')!.conflicts, ['office-pdf']);
  assert.deepEqual(capsOf(held).find(c => c.id === 'office-docs')!.after, ['office-fonts']);
  assert.deepEqual(entriesOf(held).map(e => [e.name, e.capabilities.length]), [['marionette-design', 2], ['marionette-office', 3]]);
});
it('a graph that is not what the factory writes is read for what is there, never trusted', () => {
  const held = info({}, { capabilities: [cap('ok'), { title: 'no id' }, null, 7, { id: 5 }, { id: 'half', title: 3, intents: 'x', needs: [{ label: 'no target' }, 'x'], conflicts: [1, 'ok'], outputs: 'x', after: [null] }], entries: [{ name: 'e', capabilities: ['ok', 3] }, 'x', { description: 'no name' }], examples: [null, { title: 7 }] });
  assert.deepEqual(capsOf(held).map(c => c.id), ['ok', 'half']);
  const half = capsOf(held)[1];
  assert.deepEqual({ title: half.title, intents: half.intents, needs: half.needs, conflicts: half.conflicts, outputs: half.outputs, after: half.after }, { title: 'half', intents: [], needs: [], conflicts: ['ok'], outputs: [], after: [] });
  assert.deepEqual(entriesOf(held), [{ name: 'e', description: '', capabilities: ['ok'] }]);
  assert.equal(examplesOf(held).length, 2, 'one per documented example, so an index means the same thing everywhere');
  assert.deepEqual(examplesOf(held).map(e => [e.title, e.steps.length]), [['Example 1', 0], ['Example 2', 0]]);
});
it('an example is its documented steps in order, each with the reason its selection gave, and a step nobody chose is a prerequisite', () => {
  const [page, letter, hello] = examplesOf(info());
  assert.deepEqual(page.steps.map(s => [s.step_id, s.capability, s.intent, s.reason, s.added_as_prerequisite]), [['design-taste', 'design-taste', 'design-taste-intent', 'It designs a page.', false], ['design-review', 'design-review', 'design-review-intent', 'The design is checked.', false]]);
  assert.deepEqual(page.stack, ['stack:react']);
  assert.deepEqual(letter.steps.map(s => [s.capability, s.intent, s.reason, s.added_as_prerequisite]), [['office-fonts', null, null, true], ['office-docs', 'office-docs-intent', 'A Word file.', false]]);
  assert.equal(hello.status, 'no_match');
  assert.deepEqual(hello.steps, []);
  const shown = outcomeOfExample(letter);
  assert.equal(shown.kind, 'decision');
  assert.deepEqual(shown.kind === 'decision' && [shown.example, shown.asked, shown.who], ['A letter', 'Write a letter', null]);
});
it('a repeated capability is told apart by its step id, and its reason follows the step', () => {
  const twice = { ...EXAMPLES[0], selections: [{ ...pick('design-taste', 'First.'), step_id: 'design-taste#1' }, { ...pick('design-taste', 'Again.'), step_id: 'design-taste#2' }], steps: [{ step: 'design-taste#1', capability: 'design-taste', intent: 'design-taste-intent' }, { step: 'design-taste#2', capability: 'design-taste', intent: 'design-taste-intent' }] };
  const [one] = examplesOf(info({}, { examples: [twice] }));
  assert.deepEqual(one.steps.map(s => [s.step_id, s.reason, s.added_as_prerequisite]), [['design-taste#1', 'First.', false], ['design-taste#2', 'Again.', false]]);
});
const valid = { valid: true, status: 'selected', steps: [{ step_id: 'office-docs', capability: 'office-docs', intent: 'office-docs-intent', reason: 'A Word file.', added_as_prerequisite: false }], reason: 'One document.', questions: [] };
it('the runtime\'s answer is read as a decision, with the engine that made it, its cost and its time', () => {
  const read = readAnswer({ ...valid, engine: 'harness', harness: 'claude-code', cost_usd: 0.12, duration_ms: 4200 }, ' Write a letter ');
  assert.deepEqual(read, { kind: 'decision', asked: ' Write a letter ', status: 'selected', steps: valid.steps, reason: 'One document.', questions: [], stack: [], who: { engine: 'harness', model: null, harness: 'claude-code', cost_usd: 0.12, duration_ms: 4200 }, example: null });
  assert.deepEqual(readAnswer({ ...valid, engine: 'api', model: 'gpt-test', cost_usd: null, duration_ms: 900 }, 't'), { ...read, asked: 't', who: { engine: 'api', model: 'gpt-test', harness: null, cost_usd: null, duration_ms: 900 } });
  assert.equal((readAnswer(valid, 't') as Extract<Outcome, { kind: 'decision' }>).who, null, 'an answer that names no engine has none');
});
it('no_match and needs_clarification are decisions with no step, the second with its questions', () => {
  const none = readAnswer({ valid: true, status: 'no_match', steps: [], reason: 'Nothing.', questions: [] }, 't');
  assert.deepEqual(none.kind === 'decision' && [none.status, none.steps, none.questions], ['no_match', [], []]);
  const ask = readAnswer({ valid: true, status: 'needs_clarification', steps: [], reason: 'Unclear.', questions: ['A page or a file?', 'For whom?'] }, 't');
  assert.deepEqual(ask.kind === 'decision' && [ask.status, ask.questions], ['needs_clarification', ['A page or a file?', 'For whom?']]);
});
it('a prerequisite keeps its null intent and reason, and is marked', () => {
  const read = readAnswer({ ...valid, steps: [{ step_id: 'office-fonts', capability: 'office-fonts', intent: null, reason: null, added_as_prerequisite: true }, ...valid.steps] }, 't');
  assert.deepEqual(read.kind === 'decision' && read.steps.map(s => [s.capability, s.intent, s.reason, s.added_as_prerequisite]), [['office-fonts', null, null, true], ['office-docs', 'office-docs-intent', 'A Word file.', false]]);
});
it('an answer with valid false is an invalid decision with its errors, whatever else it carries, and shows no step', () => {
  const read = readAnswer({ valid: false, errors: ['Unknown capability in AI classification: made-up', 7, 'AI classification requires a nonempty reason'], steps: valid.steps, status: 'selected', engine: 'api', model: 'm', cost_usd: 0.01 }, 't');
  assert.deepEqual(read, { kind: 'invalid', asked: 't', errors: ['Unknown capability in AI classification: made-up', 'AI classification requires a nonempty reason'], who: { engine: 'api', model: 'm', harness: null, cost_usd: 0.01, duration_ms: null } });
  assert.equal(litOf(read).size, 0);
});
it('an answer in a shape this version does not know is a failure, never repaired into a decision', () => {
  const bad = [null, 'text', 7, [], {}, { valid: 'yes' }, { ...valid, valid: undefined }, { ...valid, status: 'maybe' }, { ...valid, steps: 'x' }, { ...valid, steps: [{ capability: 'office-docs' }] }, { ...valid, steps: [{ ...valid.steps[0], added_as_prerequisite: 'no' }] }, { ...valid, steps: [{ ...valid.steps[0], capability: 5 }] }, { ...valid, steps: [{ ...valid.steps[0], intent: 5 }] }];
  for (const answer of bad) {
    const read = readAnswer(answer, 't');
    assert.equal(read.kind, 'failed', JSON.stringify(answer));
    assert.match(read.kind === 'failed' ? read.message : '', /not know|unknown/i);
  }
});
it('a cost or a time that is not a plain amount is not shown', () => {
  const who = (extra: Record<string, unknown>) => (readAnswer({ ...valid, engine: 'api', ...extra }, 't') as Extract<Outcome, { kind: 'decision' }>).who;
  assert.deepEqual([who({ cost_usd: -1, duration_ms: -5 })?.cost_usd, who({ cost_usd: -1, duration_ms: -5 })?.duration_ms], [null, null]);
  assert.deepEqual([who({ cost_usd: '0.1', duration_ms: Infinity })?.cost_usd, who({ cost_usd: '0.1', duration_ms: NaN })?.duration_ms], [null, null]);
  assert.equal(who({ cost_usd: 0 })?.cost_usd, 0, 'a free request is a known cost');
});
it('what the session keeps of an outcome is read again by the same rules', () => {
  const kept: Outcome[] = [readAnswer({ ...valid, engine: 'harness', harness: 'codex', cost_usd: null, duration_ms: 10 }, 't'), readAnswer({ valid: false, errors: ['x'] }, 't'), { kind: 'failed', asked: 't', message: 'No API key' }, outcomeOfExample(examplesOf(info())[0])];
  for (const outcome of kept) assert.deepEqual(readOutcome(JSON.parse(JSON.stringify(outcome))), outcome);
  for (const bad of [null, 'x', 4, [], {}, { kind: 'nope' }, { kind: 'failed', asked: 't' }, { kind: 'invalid', asked: 't', errors: 'x', who: null }, { ...kept[0], status: 'maybe' }, { ...kept[0], steps: [{}] }, { ...kept[0], asked: 7 }]) assert.equal(readOutcome(bad), null, JSON.stringify(bad));
});
it('the steps that light the graph are numbered in the order of the decision; an invalid or failed outcome lights nothing', () => {
  const twice = decision({ steps: [{ step_id: 'a#1', capability: 'a', intent: 'i', reason: 'r', added_as_prerequisite: false }, { step_id: 'b', capability: 'b', intent: null, reason: null, added_as_prerequisite: true }, { step_id: 'a#2', capability: 'a', intent: 'i', reason: 'r', added_as_prerequisite: false }] });
  assert.deepEqual([...litOf(twice)], [['a', [1, 3]], ['b', [2]]]);
  assert.equal(litOf(null).size, 0);
  assert.equal(litOf({ kind: 'failed', asked: 't', message: 'm' }).size, 0);
  assert.equal(litOf(decision({ status: 'no_match', steps: [] })).size, 0);
});

// ---------- the layout and the drawing ----------
const wide = (caps: number, entries: number) => {
  const ids = Array.from({ length: caps }, (_, i) => `capability-number-${i + 1}`);
  return { caps: ids.map(id => capsOf(info({}, { capabilities: [cap(id)] }))[0]), entries: Array.from({ length: entries }, (_, i) => ({ name: `marionette-group-${i + 1}`, description: `Group ${i + 1}`, capabilities: ids.filter((_, j) => j % entries === i) })) };
};
it('the entries are on the left and the capabilities on the right, one row each, none over another', () => {
  const l = layout(entriesOf(info()), capsOf(info()), 'marionette');
  assert.equal(l.caps.length, 5);
  assert.deepEqual(new Set(l.caps.map(c => c.x)).size, 1, 'one column');
  assert.ok(l.entries.every(e => e.x + e.w < l.caps[0].x), 'the entries end before the capabilities start');
  const ys = l.caps.map(c => c.y);
  assert.deepEqual(ys, [...new Set(ys)].sort((a, b) => a - b), 'in the order the entries list them, none twice');
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 28, 'a row is at least a node and its gap');
  assert.ok(l.height >= ys[ys.length - 1] + 22 && l.width >= l.caps[0].x + l.caps[0].w, 'everything is inside the drawing');
  const design = l.entries[0], rows = l.caps.slice(0, 2).map(c => c.y);
  assert.equal(design.y, (rows[0] + rows[1]) / 2, 'an entry stands level with the middle of its capabilities');
});
it('a graph of 37 capabilities in 15 entries has every node once, inside the drawing, no two entries on one row', () => {
  const { caps, entries } = wide(37, 15), l = layout(entries, caps, 'marionette');
  assert.equal(l.caps.length, 37);
  assert.equal(l.entries.length, 15);
  assert.equal(new Set(l.caps.map(c => c.y)).size, 37);
  const ys = l.entries.map(e => e.y).sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 22, 'entry nodes do not overlap');
  assert.ok(l.caps.every(c => c.y + 22 <= l.height));
});
it('the fake service\'s big graph (the browser tests\') is the size the page must hold, laid out and drawn with every name inside its node', async () => {
  const fake = createTransport('projects');
  fake.flags.bigGraph = true;
  const held = await fake.request('project', { id: 'marionette' }) as ProjectInfo, l = layout(entriesOf(held), capsOf(held), 'marionette');
  assert.deepEqual([capsOf(held).length, entriesOf(held).length, l.caps.length, l.entries.length, examplesOf(held).length], [37, 15, 37, 15, 2]);
  assert.ok(l.caps.every(c => c.w >= textWidth(c.cap.id) + 10));
  assert.ok(Math.max(...l.caps.map(c => c.w)) > 600, 'one name is far longer than the rest');
  const svg = drawGraph(entriesOf(held), capsOf(held), 'marionette', litOf(outcomeOfExample(examplesOf(held)[0])));
  assert.equal(svg.match(/<foreignObject/g)?.length, 37);
  assert.equal(svg.match(/class="gnode on"/g)?.length, 2);
  assert.match(svg, /<path class="e need"/);
  assert.match(svg, /<path class="e conf"/);
});
it('a node is as wide as its name needs, so a long name is never cut by its box', () => {
  const id = 'x'.repeat(90) + '-design-taste-frontend-with-a-very-long-name', long = capsOf(info({}, { capabilities: [cap(id), cap('short')] }));
  const entries = [{ name: 'marionette-' + 'e'.repeat(70), description: 'd', capabilities: [id, 'short'] }], l = layout(entries, long, 'marionette');
  const node = l.caps.find(c => c.cap.id === id)!, short = l.caps.find(c => c.cap.id === 'short')!;
  assert.ok(node.w >= textWidth(id) + 10, `${node.w} must hold ${textWidth(id)} and the padding`);
  assert.equal(node.w, short.w, 'the column is as wide as its widest name');
  assert.ok(l.entries[0].w >= textWidth('e'.repeat(70)) + 10);
  assert.ok(l.width >= node.x + node.w);
  assert.ok(textWidth('mmmm') > textWidth('iiii') && textWidth('WWWW') > textWidth('llll'), 'wide letters are counted wider');
});
it('the entry\'s name loses the plugin\'s own prefix and nothing else', () => {
  const l = layout([{ name: 'marionette-design', description: '', capabilities: ['a'] }, { name: 'other-marionette-x', description: '', capabilities: ['b'] }, { name: 'marionette', description: '', capabilities: ['c'] }], ['a', 'b', 'c'].map(id => capsOf(info({}, { capabilities: [cap(id)] }))[0]), 'marionette');
  assert.deepEqual(l.entries.map(e => e.label), ['design', 'other-marionette-x', 'marionette']);
});
it('a capability no entry lists is still drawn, below the others, and an entry that lists only capabilities already placed stands among them', () => {
  const caps = ['a', 'b', 'c'].map(id => capsOf(info({}, { capabilities: [cap(id)] }))[0]);
  const l = layout([{ name: 'one', description: '', capabilities: ['a', 'b'] }, { name: 'two', description: '', capabilities: ['b'] }], caps, 'p');
  assert.deepEqual(l.caps.map(c => c.cap.id), ['a', 'b', 'c']);
  assert.ok(l.caps[2].y > l.caps[1].y);
  assert.equal(l.entries.length, 2);
  assert.ok(Math.abs(l.entries[1].y - l.entries[0].y) >= 22, 'the two entries do not sit on one another');
});
const draw = (lit: Map<string, number[]> = new Map(), held = info()) => drawGraph(entriesOf(held), capsOf(held), 'marionette', lit);
it('the drawing is one labelled SVG: a button for each capability, a plain node for each entry', () => {
  const svg = draw();
  assert.equal(svg.match(/<svg /g)?.length, 1);
  assert.match(svg, /<svg class="graph" [^>]*role="group" aria-label="Decision graph: entries on the left, capabilities on the right"/);
  assert.match(svg, /viewBox="0 0 \d+ \d+"/);
  const nodes = [...svg.matchAll(/<button type="button" id="([^"]+)" class="gnode[^"]*" data-action="open-capability" data-id="([^"]+)" aria-label="([^"]+)"/g)];
  assert.deepEqual(nodes.map(m => m[2]), CAPS.map(c => c.id));
  assert.equal(new Set(nodes.map(m => m[1])).size, 5, 'each opener has its own id, so the keyboard comes back to the one that was used');
  assert.equal(nodes[0][3], 'Capability design-taste, entry design');
  assert.equal(svg.match(/class="n ent/g)?.length, 2);
  assert.match(svg, /<g class="n ent"[^>]*><title>Use when designing<\/title>/);
  assert.equal(svg.match(/<button/g)?.length, 5, 'entries are not controls');
});
it('the edges: entry to capability, a dashed one for a condition, a dotted one for two that never run together, each pair once', () => {
  const svg = draw();
  assert.equal(svg.match(/<path class="e"/g)?.length, 5, 'one from its entry to each capability');
  assert.equal(svg.match(/<path class="e need"/g)?.length, 1);
  assert.match(svg, /<path class="e need"[^>]*><title>design-review needs design-taste when: A design exists<\/title>/);
  assert.equal(svg.match(/<path class="e conf"/g)?.length, 1);
  assert.match(svg, /<title>office-docs never runs with office-pdf<\/title>/);
  const both = info({}, { capabilities: [cap('office-docs', { conflicts: ['office-pdf'] }), cap('office-pdf', { conflicts: ['office-docs'] })], entries: [{ name: 'o', description: '', capabilities: ['office-docs', 'office-pdf'] }] });
  assert.equal(draw(new Map(), both).match(/class="e conf"/g)?.length, 1, 'declared by both, drawn once');
  const one = info({}, { capabilities: [cap('a'), cap('z', { conflicts: ['a'] })], entries: [{ name: 'o', description: '', capabilities: ['a', 'z'] }] });
  assert.equal(draw(new Map(), one).match(/class="e conf"/g)?.length, 1, 'declared by the later one only, still drawn');
  const lost = info({}, { capabilities: [cap('a', { needs: [need('gone', 'x')], conflicts: ['gone'] })], entries: [{ name: 'o', description: '', capabilities: ['a'] }] });
  assert.doesNotMatch(draw(new Map(), lost), /e need|e conf/, 'an edge to a capability the graph does not have is not drawn');
});
it('what a decision activates is lit and numbered in order, the rest dims, and nothing lit leaves the graph as it was', () => {
  const lit = new Map([['design-taste', [1]], ['design-review', [2]]]);
  const svg = draw(lit);
  assert.match(svg, /<svg class="graph sim" /);
  assert.equal(svg.match(/class="gnode on"/g)?.length, 2);
  assert.match(svg, /id="gnode-design-taste" class="gnode on" data-action="open-capability" data-id="design-taste" aria-label="Capability design-taste, entry design, step 1"[^>]*><span class="gname">design-taste<\/span><span class="gnum" aria-hidden="true">1<\/span>/);
  assert.match(svg, /aria-label="Capability design-review, entry design, step 2"/);
  assert.equal(svg.match(/<path class="e on"/g)?.length, 2, 'the entry\'s edge to each lit capability');
  assert.match(svg, /<path class="e need on"/, 'a condition between two lit steps');
  assert.match(svg, /<g class="n ent on"/);
  assert.equal(svg.match(/<g class="n ent"/g)?.length, 1, 'the entry of nothing lit stays dim');
  assert.doesNotMatch(draw(), /gnode on|class="graph sim"|gnum/);
  assert.match(draw(new Map([['office-docs', [1, 3]]])), /aria-label="Capability office-docs, entry office, steps 1 and 3"/);
  assert.match(draw(new Map([['nobody', [1]]])), /class="graph"/, 'a step of a capability the graph lacks lights nothing and dims nothing');
});
it('every value that goes into the drawing is escaped', () => {
  const evil = '"><img src=x onerror=alert(1)>', held = info({}, { capabilities: [cap(evil, { title: evil, needs: [need(evil, evil)], conflicts: [evil] })], entries: [{ name: 'marionette-' + evil, description: evil, capabilities: [evil] }] });
  const svg = drawGraph(entriesOf(held), capsOf(held), 'marionette', new Map([[evil, [1]]]));
  assert.doesNotMatch(svg, /<img/);
  assert.match(svg, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

// ---------- the step's view ----------
it('a project with no capability says there is no graph and offers no simulator', () => {
  const html = show(opened({}, info({}, { capabilities: [], entries: [], examples: [] })));
  assert.match(words(html), /No decision graph/);
  assert.doesNotMatch(html, /textarea|<svg/);
});
it('the step has the simulator on the left and the graph on the right, with what the graph holds said once', () => {
  const html = show(opened());
  assert.match(html, /^<div class="two"><div class="sim">/);
  assert.match(words(html), /Simulate a request See which branch of the graph a request activates, and in what order\./);
  assert.match(html, /<textarea name="simtask" rows="3" aria-label="Request to simulate" placeholder="Write a request as you would to your coding agent"/);
  assert.match(html, /<small class="err" id="err-simtask" role="alert"><\/small>/);
  assert.match(html, /<button type="button" class="btn" data-action="graph-simulate"><svg[^>]*>.*?<\/svg><span>Simulate<\/span><\/button>/);
  assert.match(words(html), /Documented examples 3/);
  assert.equal(html.match(/data-action="graph-example"/g)?.length, 3);
  assert.deepEqual([...html.matchAll(/data-action="graph-example" data-id="(\d)" aria-pressed="(\w+)"/g)].map(m => [m[1], m[2]]), [['0', 'false'], ['1', 'false'], ['2', 'false']]);
  assert.match(html, /<strong>A landing page<\/strong><small>Design a landing page<\/small>/);
  assert.match(html, /<div class="card graphcard"><div class="legend">/);
  assert.match(words(html), /entry → capability needs, on a condition never together 2 entries · 5 capabilities/);
  assert.doesNotMatch(words(html), /activated, in order/, 'the legend says it only when something is lit');
  assert.equal(html.match(/<svg class="graph/g)?.length, 1);
  assert.doesNotMatch(html, /role="status"|simres/, 'no result before there is one');
});
it('the text of the request is what the box holds, escaped', () => {
  assert.match(show(opened({ task: 'Make <b>"this"</b> & that' })), /<textarea[^>]*>Make &lt;b&gt;&quot;this&quot;&lt;\/b&gt; &amp; that<\/textarea>/);
});
it('a refused empty request is said under the box, which it describes', () => {
  const html = show(opened({ error: 'Write a request first.' }));
  assert.match(html, /<small class="err" id="err-simtask" role="alert">Write a request first\.<\/small>/);
  assert.match(html, /<textarea[^>]*aria-invalid="true"/);
  assert.match(html.match(/<textarea[^>]*>/)![0], /aria-describedby="[^"]*err-simtask/);
});
it('before the first free-text request the page says which engine it will use and what it may cost, with a link to Settings', () => {
  const note = (settings: Record<string, unknown>) => { const html = show(opened({}, info(), snapshot(settings))); return { html, text: words(html.match(/<p class="simnote"[\s\S]*?<\/p>/)?.[0] ?? '') }; };
  const harness = note({ ai: ai() });
  assert.match(harness.text, /Claude Code/);
  assert.match(harness.text, /up to \$0\.50 a request/);
  assert.match(harness.html, /<button type="button" class="link" data-action="page" data-id="settings">Settings<\/button>/);
  assert.match(harness.html.match(/<textarea[^>]*>/)![0], /aria-describedby="[^"]*sim-note/);
  assert.match(note({ ai: ai({ budget_usd: 2 }) }).text, /up to \$2\.00 a request/);
  const codex = note({ ai: ai({ harness: 'codex' }) }).text;
  assert.match(codex, /Codex/);
  assert.match(codex, /Muro sets no budget/);
  assert.doesNotMatch(codex, /\$/);
  const api = note({ ai: ai({ engine: 'api', model: 'gpt-test', api_base: 'https://example.test/v1' }) }).text;
  assert.match(api, /gpt-test/);
  assert.match(api, /example\.test/);
  assert.match(api, /billed by your API provider/);
  assert.doesNotMatch(api, /Claude Code|\$/);
  assert.match(note({}).text, /Claude Code/, 'a service that has no AI settings yet still has its agent');
  assert.match(note({ agent: 'codex' }).text, /Codex/);
  assert.match(note({ ai: ai({ engine: 'api', model: '' }) }).text, /the model set in Settings/);
  assert.match(note({ ai: ai() }).text, /examples.*no AI|no AI.*examples/i, 'the documented examples cost nothing');
});
it('the note is said once in a session: it is gone after the first free-text request, and back in a new session', async () => {
  const s = await session();
  assert.match(s.view(), /class="simnote"/);
  s.sim().task = 'Write a letter';
  await s.act('graph-simulate');
  assert.doesNotMatch(s.view(), /class="simnote"/);
  newSession();
  assert.match(s.view(), /class="simnote"/);
  (globalThis as any).sessionStorage = undefined;
  assert.match(s.view(), /class="simnote"/, 'a session that keeps nothing says it each time rather than never');
});
it('a documented example is shown as it was written: its steps in order, why each, what was added for it, and nothing called', () => {
  const html = show(opened({ example: 1 }));
  assert.match(html, /<button type="button" data-action="graph-example" data-id="1" aria-pressed="true">/);
  const card = html.match(/<div class="card simres"[\s\S]*?<\/ol>[\s\S]*?<\/div>\s*<h3>/)![0];
  assert.match(card, /role="status"/);
  assert.match(words(card), /2 steps Documented example/);
  assert.match(words(card), /“Write a letter”/);
  const steps = [...card.matchAll(/<li><b aria-hidden="true">(\d)<\/b><div>(.*?)<\/div><\/li>/g)].map(m => [m[1], words(m[2])]);
  assert.deepEqual(steps, [['1', 'office-fonts Prerequisite A prerequisite the plugin declares, added before the step that needs it.'], ['2', 'office-docs office-docs-intent A Word file.']]);
  assert.match(card, /<button type="button" class="link" id="sim-step-1" data-action="open-capability" data-id="office-fonts">office-fonts<\/button>/);
  assert.match(words(card), /One document\./);
  assert.match(card, /data-action="graph-clear"/);
  assert.doesNotMatch(card, /Asked /, 'no engine answered it');
  assert.match(html, /class="graph sim"/);
  assert.match(words(html), /activated, in order/);
  assert.match(html, /aria-label="Capability office-fonts, entry office, step 1"/);
});
it('an example with a stack says it, and one with no match says so and has no steps', () => {
  assert.match(words(show(opened({ example: 0 }))), /With stack:react/);
  const none = show(opened({ example: 2 }));
  assert.match(words(none), /No match/);
  assert.match(words(none), /Nothing to build\./);
  assert.doesNotMatch(none, /<ol>/);
  assert.doesNotMatch(none, /class="graph sim"/);
});
it('an example the project no longer has is not shown', () => {
  assert.doesNotMatch(show(opened({ example: 9 })), /simres/);
  assert.doesNotMatch(show(opened({ example: -1 })), /simres/);
});
it('while a request runs the button says which engine is asked, cannot be used again, and can be cancelled', () => {
  const asking = (settings: Record<string, unknown>) => show(opened({ run: 'r1', task: 'Write a letter' }, info(), snapshot(settings)));
  const html = asking({ ai: ai() });
  assert.match(html, /<button type="button" class="btn" data-action="graph-simulate" aria-busy="true" aria-disabled="true"><i class="spin" aria-hidden="true"><\/i><span>Asking Claude Code…<\/span><\/button>/);
  assert.match(html, /<button type="button" class="btn" data-action="graph-cancel"><span>Cancel<\/span><\/button>/);
  assert.match(words(asking({ ai: ai({ harness: 'codex' }) })), /Asking Codex…/);
  assert.match(words(asking({ ai: ai({ engine: 'api', model: 'gpt-test' }) })), /Asking gpt-test…/);
  assert.match(words(asking({ ai: ai({ engine: 'api', model: '' }) })), /Asking the API…/);
  assert.match(words(asking({})), /Asking Claude Code…/);
  assert.doesNotMatch(show(opened()), /graph-cancel|aria-busy/);
});
it('a decision of the AI is shown with its status, steps, reasons, the engine that answered and what it cost', () => {
  const who = { engine: 'harness', model: null, harness: 'claude-code', cost_usd: 0.1234, duration_ms: 4200 };
  const html = show(opened({ result: decision({ who, steps: [{ step_id: 'office-pdf', capability: 'office-pdf', intent: null, reason: null, added_as_prerequisite: true }, decision().steps[0]] } as any) }));
  const card = html.match(/<div class="card simres"[\s\S]*?<h3>/)![0];
  assert.match(card, /<span class="tag good">2 steps<\/span>/);
  assert.doesNotMatch(card, /Documented example/);
  assert.match(words(card), /“Write a letter”/);
  assert.match(words(card), /Prerequisite/);
  assert.match(words(card), /Asked Claude Code · \$0\.12 · 4\.2 s/);
  assert.match(html, /class="graph sim"/);
  assert.match(html, /aria-label="Capability office-docs, entry office, step 2"/);
  const api = show(opened({ result: decision({ who: { engine: 'api', model: 'gpt-test', harness: null, cost_usd: null, duration_ms: 65000 } } as any) }));
  assert.match(words(api), /Asked gpt-test · 1 min 5 s/);
  assert.doesNotMatch(words(api), /\$/, 'a cost that is not known is not shown');
  assert.match(words(show(opened({ result: decision({ who: { ...who, cost_usd: 0.0034, duration_ms: 90 } } as any) }))), /Asked Claude Code · \$0\.0034 · 0\.1 s/);
});
it('no_match and needs_clarification are said as they are, the second with the questions it asks', () => {
  const none = words(show(opened({ result: decision({ status: 'no_match', steps: [], reason: 'Nothing here is work for the plugin.' }) })));
  assert.match(none, /No match/);
  assert.match(none, /Nothing here is work for the plugin\./);
  const html = show(opened({ result: decision({ status: 'needs_clarification', steps: [], reason: 'It does not say what to make.', questions: ['A page or a file?', 'For whom?'] }) }));
  assert.match(words(html), /Needs clarification/);
  assert.deepEqual([...html.matchAll(/<li class="q">(.*?)<\/li>/g)].map(m => m[1]), ['A page or a file?', 'For whom?']);
  assert.doesNotMatch(html, /<ol>/);
  assert.doesNotMatch(html, /class="graph sim"/);
});
it('an answer that is not a valid decision is said so, with its errors, and shows no step and lights no branch', () => {
  const html = show(opened({ result: { kind: 'invalid', asked: 'Write a letter', errors: ['Unknown capability in AI classification: made-up', 'AI classification requires a nonempty reason'], who: { engine: 'harness', model: null, harness: 'claude-code', cost_usd: 0.02, duration_ms: 3000 } } }));
  const card = html.match(/<div class="card simres"[\s\S]*?<h3>/)![0];
  assert.match(words(card), /The AI's answer was not a valid decision/);
  assert.deepEqual([...card.matchAll(/<li class="q">(.*?)<\/li>/g)].map(m => m[1]), ['Unknown capability in AI classification: made-up', 'AI classification requires a nonempty reason']);
  assert.doesNotMatch(card, /<ol>|open-capability|steps?<\/span>/);
  assert.doesNotMatch(html, /class="graph sim"|gnode on/);
  assert.match(words(card), /Asked Claude Code · \$0\.02 · 3\.0 s/);
  assert.match(card, /role="status"/);
});
it('a call that failed is shown as such, in the runtime\'s words, with the way to Settings', () => {
  for (const message of ['No API key: the environment variable named by --api-key-env is not set (the key is never a command-line argument)', 'Could not reach https://example.test/v1: connection refused', 'claude was not found on this computer']) {
    const html = show(opened({ result: { kind: 'failed', asked: 'Write a letter', message } }));
    const card = html.match(/<div class="card simres"[\s\S]*?<h3>/)![0];
    assert.match(card, /role="alert"/);
    assert.match(words(card), /The simulation could not run/);
    assert.ok(words(card).includes(message), message);
    assert.match(card, /<button type="button" class="link" data-action="page" data-id="settings">Settings<\/button>/);
    assert.doesNotMatch(html, /class="graph sim"/);
  }
});
it('what the request or the runtime said is escaped everywhere it is shown', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const html = show(opened({ task: evil, result: decision({ asked: evil, reason: evil, steps: [{ step_id: evil, capability: 'office-docs', intent: evil, reason: evil, added_as_prerequisite: false }], who: { engine: 'api', model: evil, harness: null, cost_usd: null, duration_ms: null } } as any) }));
  assert.doesNotMatch(html, /<img/);
  for (const result of [{ kind: 'invalid', asked: evil, errors: [evil], who: null }, { kind: 'failed', asked: evil, message: evil }] as Outcome[]) assert.doesNotMatch(show(opened({ result })), /<img/);
  assert.doesNotMatch(show(opened({}, info(), snapshot({ ai: ai({ engine: 'api', model: evil, api_base: evil }) }))), /<img/);
  assert.doesNotMatch(show(opened({ example: 0 }, info({}, { examples: [{ ...EXAMPLES[0], title: evil, task: evil, reason: evil, stack_tokens: [evil] }] }))), /<img/);
});
it('every control that opens a capability has an id of its own, so the keyboard comes back to the one that was used', () => {
  const html = show(opened({ example: 0 }));
  const ids = [...html.matchAll(/<button[^>]*\bid="([^"]+)"[^>]*data-action="open-capability"/g)].map(m => m[1]);
  assert.equal(ids.length, 5 + 2, 'five nodes and two steps');
  assert.equal(new Set(ids).size, ids.length);
});
it('the page shows this step in the panel of the project page, and its tab keeps its line', () => {
  const html = projects.view(opened());
  assert.match(html, /role="tabpanel" id="step-panel" aria-labelledby="step-tab-graph"><div class="two">/);
  assert.match(words(html), /3 Graph & simulator 5 capabilities · 3 examples/);
});

// ---------- the actions, over the fake service ----------
async function session(over: { scenario?: string; wrap?: (r: (a: string, p?: any) => Promise<any>) => (a: string, p?: any) => Promise<any> } = {}) {
  const fake = createTransport(over.scenario ?? 'projects'), toasts: string[] = [], dialogs: { html: string; kind?: string }[] = [];
  const state = blank({ snapshot: await fake.request('snapshot') });
  state.project = { ...fresh('marionette'), step: 'graph' };
  state.projects = { ...blankProjects(), info: await fake.request('project', { id: 'marionette' }), infoId: 'marionette' };
  fake.calls.length = 0;
  let renders = 0;
  const app = { state, request: (over.wrap ?? ((r: any) => r))(fake.request), render: () => { renders++; }, notify: (text: string) => void toasts.push(text), openDialog: (html: string, kind?: string) => { dialogs.push({ html, kind }); return {}; }, closeDialog: () => {} } as unknown as App;
  const act = (name: string, data: Record<string, string> = {}, el: unknown = {}) => Promise.resolve(graph.actions[name](app, data as DOMStringMap, el as HTMLElement));
  return { fake, state, app, act, toasts, dialogs, sim: () => state.project!.sim, view: () => graph.view(state, state.projects.info!), calls: () => fake.calls.map(c => c.action), renders: () => renders };
}
const deferred = <T>() => { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

it('the step\'s actions are named for it, except the one that opens a capability from any step, and none is declared twice with the page\'s', () => {
  assert.deepEqual(Object.keys(graph.actions).sort(), ['graph-cancel', 'graph-clear', 'graph-example', 'graph-simulate', 'open-capability']);
  for (const name of Object.keys(graph.actions)) assert.ok(name in projects.actions, name + ' is merged into the page (which throws at once on a name two steps declare)');
});
it('an example is selected without any call, selecting it again clears it, and another replaces it', async () => {
  const s = await session();
  await s.act('graph-example', { id: '1' });
  assert.equal(s.sim().example, 1);
  await s.act('graph-example', { id: '0' });
  assert.equal(s.sim().example, 0);
  await s.act('graph-example', { id: '0' });
  assert.equal(s.sim().example, null);
  assert.deepEqual(s.calls(), [], 'the documented examples need no AI and no runtime');
  assert.equal(s.renders(), 3);
});
it('an example that is not one of the project\'s, or no number, selects nothing', async () => {
  const s = await session();
  for (const id of ['9', '-1', 'x', '', '1.5']) await s.act('graph-example', { id });
  await s.act('graph-example', {});
  assert.equal(s.sim().example, null);
  assert.equal(s.renders(), 0);
});
it('an example replaces a free-text result, and Clear removes whatever is shown', async () => {
  const s = await session();
  s.sim().result = decision();
  await s.act('graph-example', { id: '0' });
  assert.equal(s.sim().result, null);
  s.sim().result = decision(); s.sim().example = null;
  await s.act('graph-clear');
  assert.deepEqual([s.sim().example, s.sim().result], [null, null]);
  s.sim().example = 1;
  await s.act('graph-clear');
  assert.equal(s.sim().example, null);
  assert.equal(s.sim().task, '', 'the request stays where it was typed');
});
it('an empty request is refused inline, without a call, and the box takes the keyboard', async () => {
  const s = await session();
  let focused = 0;
  const box = { focus: () => { focused++; } }, el = { closest: (sel: string) => sel === '.two' ? { querySelector: (q: string) => q === 'textarea' ? box : null } : null };
  for (const task of ['', '   ', '\n\t ']) { s.sim().task = task; s.sim().error = ''; await s.act('graph-simulate', {}, el); assert.equal(s.sim().error, 'Write a request first.'); }
  assert.deepEqual(s.calls(), []);
  assert.equal(s.sim().run, null);
  assert.equal(focused, 3);
});
it('a request is sent to the runtime for this project, trimmed, and its answer is kept and shown', async () => {
  const s = await session();
  s.sim().task = '  Write a letter as a Word file \n';
  s.sim().example = 0;
  await s.act('graph-simulate');
  assert.deepEqual(s.calls(), ['simulate']);
  const { run, ...asked } = s.fake.calls[0].payload;
  assert.deepEqual(asked, { id: 'marionette', task: 'Write a letter as a Word file' });
  assert.equal(typeof run, 'string', 'the page names the run, so that it can be stopped');
  const result = s.sim().result as Extract<Outcome, { kind: 'decision' }>;
  assert.equal(result.kind, 'decision');
  assert.deepEqual(result.steps.map(x => [x.capability, x.added_as_prerequisite]), [['office-pdf', true], ['office-docs', false]]);
  assert.deepEqual(result.who, { engine: 'harness', model: null, harness: 'claude-code', cost_usd: 0.1234, duration_ms: 4200 });
  assert.equal(result.asked, 'Write a letter as a Word file');
  assert.deepEqual([s.sim().run, s.sim().example, s.sim().error], [null, null, '']);
  assert.equal(s.state.busy, null, 'a request that can last a minute does not lock the rest of the app');
  assert.equal(s.state.error, null);
  assert.match(words(s.view()), /office-pdf Prerequisite/);
  assert.match(s.view(), /class="graph sim"/);
});
it('while it runs the page is not busy for the rest of the app, and a second Simulate asks nothing more', async () => {
  const wait = deferred<unknown>();
  let asked = 0;
  const s = await session({ wrap: r => (a, p) => a === 'simulate' ? (asked++, wait.promise) : r(a, p) });
  s.sim().task = 'Write a letter';
  const first = s.act('graph-simulate');
  assert.notEqual(s.sim().run, null);
  assert.equal(s.state.busy, null);
  assert.match(words(s.view()), /Asking Claude Code…/);
  await s.act('graph-simulate');
  assert.equal(asked, 1, 'the runtime was asked once, by the first');
  wait.resolve({ ...valid, engine: 'harness', harness: 'claude-code', cost_usd: 0.1, duration_ms: 1 });
  await first;
  assert.equal(s.sim().run, null);
  assert.equal((s.sim().result as any).kind, 'decision');
});
it('cancelling stops waiting: nothing is shown for it, and its answer, when it comes, is dropped', async () => {
  const wait = deferred<unknown>();
  const s = await session({ wrap: r => (a, p) => a === 'simulate' ? wait.promise : r(a, p) });
  s.sim().task = 'Write a letter';
  const run = s.act('graph-simulate');
  await s.act('graph-cancel');
  assert.equal(s.sim().run, null);
  assert.equal(s.sim().result, null);
  assert.match(s.view(), /data-action="graph-simulate"><svg/, 'the button is Simulate again');
  assert.deepEqual(s.toasts, ['Stopped waiting for the answer.']);
  wait.resolve({ ...valid });
  await run;
  assert.equal(s.sim().result, null, 'a late answer is not what the person is looking at');
  assert.equal(s.sim().run, null);
});
it('a cancelled request that fails later shows no failure, and a new request is its own', async () => {
  const first = deferred<unknown>(), second = deferred<unknown>(), waits = [first, second];
  const s = await session({ wrap: r => (a, p) => a === 'simulate' ? waits.shift()!.promise : r(a, p) });
  s.sim().task = 'one';
  const one = s.act('graph-simulate');
  await s.act('graph-cancel');
  s.sim().task = 'two';
  const two = s.act('graph-simulate');
  first.reject(new Error('late failure'));
  await one;
  assert.notEqual(s.sim().run, null, 'the second request is still the one waited for');
  assert.equal(s.sim().result, null);
  second.resolve({ ...valid });
  await two;
  assert.equal((s.sim().result as any).kind, 'decision');
  assert.equal((s.sim().result as any).asked, 'two');
});
it('cancelling when nothing runs does nothing', async () => {
  const s = await session();
  await s.act('graph-cancel');
  assert.equal(s.renders(), 0);
  assert.deepEqual(s.toasts, []);
  assert.deepEqual(s.calls(), []);
});
it('a request names its run, in the form the runtime accepts, and no two runs share a name', async () => {
  const sent: string[] = [];
  const s = await session({ wrap: r => (a, p) => { if (a === 'simulate') sent.push(p.run); return r(a, p); } });
  s.sim().task = 'Write a letter';
  await s.act('graph-simulate');
  await s.act('graph-simulate');
  assert.equal(sent.length, 2);
  for (const run of sent) assert.match(run, /^[A-Za-z0-9_-]{1,64}$/);
  assert.notEqual(sent[0], sent[1]);
});
it('cancelling asks the runtime to stop that very run, and a runtime that cannot is no error of the page', async () => {
  const wait = deferred<unknown>(), seen: [string, string][] = [];
  const s = await session({ wrap: r => (a, p) => { seen.push([a, p?.run]); if (a === 'simulate') return wait.promise; if (a === 'cancel_simulation') return Promise.reject(new Error('Unknown registry action: cancel_simulation')); return r(a, p); } });
  s.sim().task = 'Write a letter';
  const run = s.act('graph-simulate');
  await s.act('graph-cancel');
  await new Promise(done => setTimeout(done, 0));
  assert.deepEqual(seen.map(x => x[0]), ['simulate', 'cancel_simulation']);
  assert.equal(seen[1][1], seen[0][1], 'the run it asks to stop is the run it started');
  assert.equal(s.state.error, null, 'a refusal to stop is not shown: the page has stopped waiting either way');
  assert.deepEqual(s.toasts, ['Stopped waiting for the answer.']);
  wait.resolve({ ...valid });
  await run;
  assert.equal(s.sim().result, null);
});
it('the fake service ends a delayed run that is cancelled, and refuses a run that is not running or has no name', async () => {
  const fake = createTransport('projects');
  fake.flags.simulateDelay = 5000;
  const run = fake.request('simulate', { id: 'marionette', task: 'x', run: 'r-1' });
  assert.deepEqual(await fake.request('cancel_simulation', { run: 'r-1' }), { status: 'cancelling' });
  await assert.rejects(run, /was cancelled/);
  await assert.rejects(fake.request('cancel_simulation', { run: 'r-1' }), /not running/);
  await assert.rejects(fake.request('simulate', { id: 'marionette', task: 'x' }), /Invalid run ID/);
});
it('choosing an example while a request runs stops waiting for it, and tells the runtime', async () => {
  const wait = deferred<unknown>(), asked: string[] = [];
  const s = await session({ wrap: r => (a, p) => { asked.push(a); return a === 'simulate' ? wait.promise : r(a, p); } });
  s.sim().task = 'Write a letter';
  const run = s.act('graph-simulate');
  await s.act('graph-example', { id: '1' });
  assert.deepEqual(asked, ['simulate', 'cancel_simulation']);
  assert.deepEqual([s.sim().run, s.sim().example], [null, 1]);
  wait.resolve({ ...valid });
  await run;
  assert.deepEqual([s.sim().example, s.sim().result], [1, null], 'the example the person chose stays');
});
it('an answer for a project that is no longer open is dropped', async () => {
  const wait = deferred<unknown>();
  const s = await session({ wrap: r => (a, p) => a === 'simulate' ? wait.promise : r(a, p) });
  s.sim().task = 'Write a letter';
  const run = s.act('graph-simulate');
  const left = s.sim();
  s.state.project = { ...fresh('marionette'), step: 'graph' };
  wait.resolve({ ...valid });
  await run;
  assert.equal(left.result, null);
  assert.equal(s.sim().result, null);
});
it('an answer that comes after the project was closed is dropped without a trace', async () => {
  const wait = deferred<unknown>();
  const s = await session({ wrap: r => (a, p) => a === 'simulate' ? wait.promise : r(a, p) });
  s.sim().task = 'Write a letter';
  const run = s.act('graph-simulate');
  const rendersBefore = s.renders();
  s.state.project = null;
  wait.resolve({ ...valid });
  await run;
  assert.equal(s.renders(), rendersBefore, 'nothing is painted for a page that is not there');
});
it('a call that fails is the result of the simulation, not the app\'s error, and the next request can be made', async () => {
  const s = await session();
  s.sim().task = 'Write a letter';
  s.fake.flags.simulateError = 'No API key: the environment variable named by --api-key-env is not set';
  await s.act('graph-simulate');
  assert.deepEqual(s.sim().result, { kind: 'failed', asked: 'Write a letter', message: 'No API key: the environment variable named by --api-key-env is not set' });
  assert.equal(s.state.error, null);
  assert.equal(s.sim().run, null);
  assert.match(words(s.view()), /The simulation could not run No API key/);
  s.fake.flags.simulateError = '';
  await s.act('graph-simulate');
  assert.equal((s.sim().result as any).kind, 'decision');
});
it('every kind of answer of the fake service is read: a selection, no match, a clarification and an invalid decision', async () => {
  const s = await session();
  s.sim().task = 'something';
  const kinds: [string, string][] = [['selected', 'decision'], ['no_match', 'decision'], ['clarify', 'decision'], ['invalid', 'invalid']];
  for (const [flag, kind] of kinds) {
    s.fake.flags.simulate = flag;
    await s.act('graph-simulate');
    assert.equal((s.sim().result as any).kind, kind, flag);
  }
  assert.deepEqual((s.sim().result as Extract<Outcome, { kind: 'invalid' }>).errors.length, 2);
  s.fake.flags.simulate = 'clarify';
  await s.act('graph-simulate');
  assert.deepEqual((s.sim().result as any).questions, ['Is it a web page or a document?', 'Who is it for?']);
});
it('an answer in a shape the page does not know is a failure with its own words', async () => {
  const s = await session({ wrap: r => (a, p) => a === 'simulate' ? Promise.resolve({ ok: true }) : r(a, p) });
  s.sim().task = 'x';
  await s.act('graph-simulate');
  assert.equal((s.sim().result as any).kind, 'failed');
  assert.match((s.sim().result as any).message, /does not know/);
});
it('the engine of the settings is the one the fake service answers for, and the page names it', async () => {
  const s = await session();
  s.state.snapshot!.registry.settings = { ...s.state.snapshot!.registry.settings, ai: ai({ engine: 'api', model: 'gpt-test' }) } as any;
  s.fake.behind.settings({ ai: ai({ engine: 'api', model: 'gpt-test' }) });
  s.sim().task = 'x';
  await s.act('graph-simulate');
  assert.match(words(s.view()), /Asked gpt-test/);
});
it('typing in the box keeps the text, clears the refusal and says it handled the event; any other box is not its', async () => {
  const s = await session();
  s.sim().error = 'Write a request first.';
  assert.equal(graph.input!(s.app, { name: 'simtask', value: 'Write a letter' } as any), true);
  assert.deepEqual([s.sim().task, s.sim().error], ['Write a letter', '']);
  assert.equal(graph.input!(s.app, { name: 'dsrc', value: 'x' } as any), false);
  assert.equal(s.sim().task, 'Write a letter');
  assert.equal(s.renders(), 0, 'a box that holds the caret is never painted over');
  s.state.project = null;
  assert.equal(graph.input!(s.app, { name: 'simtask', value: 'x' } as any), false);
});
it('the page forwards the box\'s typing to this step', async () => {
  const s = await session();
  assert.equal(projects.input(s.app, { name: 'simtask', value: 'Write a letter' } as any), true);
  assert.equal(s.sim().task, 'Write a letter');
  assert.equal(projects.input(s.app, { name: 'other', value: 'x' } as any), false);
});
it('a key typed in the box is read once it has done its work; the event is never claimed, and another box or a closed project is left alone', async () => {
  const s = await session(), box = { name: 'simtask', value: 'W' }, later = () => new Promise(done => setTimeout(done, 5));
  assert.equal(graph.keydown(s.app, { target: box } as any), false);
  assert.equal(s.sim().task, '', 'at the key the box does not have it yet');
  box.value = 'Wr';
  await later();
  assert.equal(s.sim().task, 'Wr');
  graph.keydown(s.app, { target: { name: 'dsrc', value: 'zzz' } } as any);
  graph.keydown(s.app, { target: null } as any);
  await later();
  assert.equal(s.sim().task, 'Wr');
  const left = s.sim();
  graph.keydown(s.app, { target: box } as any);
  s.state.project = { ...fresh('marionette'), step: 'graph' };
  box.value = 'Write';
  await later();
  assert.equal(left.task, 'Wr', 'a project that was left is not written to');
  assert.equal(s.sim().task, '');
});
it('what is typed and not yet kept is read from the box when the person acts, so a paint never loses it', async () => {
  const s = await session();
  const box = { value: 'typed, then pasted' }, el = { closest: (sel: string) => sel === '.two' ? { querySelector: (q: string) => q === 'textarea' ? box : null } : null };
  s.sim().task = 'typed';
  await s.act('graph-example', { id: '0' }, el);
  assert.equal(s.sim().task, 'typed, then pasted');
  box.value = 'and more';
  await s.act('graph-simulate', {}, el);
  assert.equal(s.fake.calls.find(c => c.action === 'simulate')?.payload.task, 'and more');
  box.value = 'after';
  await s.act('open-capability', { id: 'design-taste' }, el);
  assert.equal(s.sim().task, 'after');
});

// ---------- the capability sheet ----------
it('a capability opens a sheet with its role, entry, sources, intents, branches and what it produces', async () => {
  const s = await session();
  s.state.projects.info = info();
  await s.act('open-capability', { id: 'design-taste' });
  assert.equal(s.dialogs.length, 1);
  assert.equal(s.dialogs[0].kind, 'sheet');
  const html = s.dialogs[0].html, text = words(html);
  assert.match(html, /<h2 id="dlg-title">design-taste<\/h2>/);
  assert.match(text, /DESIGN-TASTE/);
  assert.match(text, /Role worker/);
  assert.match(text, /Entry marionette-design Use when designing/);
  assert.match(text, /Comes from taste-skill genoffice/);
  assert.match(text, /Activates when the request means design-taste-intent Make a design Not for: Reviewing one/);
  assert.match(text, /Produces design-brief palette/);
  assert.doesNotMatch(text, /Branches/, 'a capability with no branch has no section for it');
  assert.match(html, /<button type="button" class="btn" data-close autofocus>Close<\/button>/);
  assert.match(html, /class="dlhead"/);
});
it('the branches of a capability are its conditions, what never runs with it, and what always runs before it', async () => {
  const s = await session();
  s.state.projects.info = info();
  await s.act('open-capability', { id: 'design-review' });
  assert.match(words(s.dialogs[0].html), /Branches Runs design-taste first, on a condition A design exists/);
  await s.act('open-capability', { id: 'office-docs' });
  const text = words(s.dialogs[1].html);
  assert.match(text, /Never together with office-pdf/);
  assert.match(text, /Always runs office-fonts first/);
  assert.match(text, /Comes from genoffice/);
  assert.doesNotMatch(text, /Produces/, 'nothing declared, nothing said');
});
it('a capability that no entry lists and no decision names still opens, with a dash where the sheet has nothing to say', async () => {
  const s = await session();
  s.state.projects.info = info({ decisions: [] }, { entries: [] });
  await s.act('open-capability', { id: 'office-pdf' });
  const text = words(s.dialogs[0].html);
  assert.match(text, /Entry —/);
  assert.match(text, /Comes from —/);
});
it('everything the sheet says is escaped, and a capability the graph does not have is told, not opened', async () => {
  const evil = '<img src=x onerror=alert(1)>', s = await session();
  s.state.projects.info = info({ decisions: [{ source: evil, content: 'c', form: 'capability', targets: [evil], reason: 'r' }] }, { capabilities: [cap(evil, { title: evil, role: evil, outputs: [evil], after: [evil], conflicts: [evil], needs: [need(evil, evil)], intents: [intent(evil, evil, evil)] })], entries: [{ name: evil, description: evil, capabilities: [evil] }] });
  await s.act('open-capability', { id: evil });
  assert.doesNotMatch(s.dialogs[0].html, /<img/);
  await s.act('open-capability', { id: 'nobody' });
  assert.equal(s.dialogs.length, 1);
  assert.deepEqual(s.toasts, ['That capability is not in this project\'s graph.']);
  await s.act('open-capability', {});
  assert.equal(s.dialogs.length, 1);
});
it('a capability is not opened from information that belongs to another project', async () => {
  const s = await session();
  s.state.projects.infoId = 'other';
  await s.act('open-capability', { id: 'design-taste' });
  assert.equal(s.dialogs.length, 0);
  assert.equal(s.toasts.length, 1);
});

// ---------- what the session keeps ----------
it('a simulation the session kept comes back valid: the request, the example and the last result, never a run or a refusal', () => {
  const kept = { task: 'Write a letter', example: 1, run: 'r7', error: 'Write a request first.', result: JSON.parse(JSON.stringify(decision())) };
  assert.deepEqual(graph.restoreSim(kept), { task: 'Write a letter', example: 1, run: null, error: '', result: decision() });
  assert.deepEqual(graph.restoreSim(graph.newSim()), graph.newSim());
  assert.deepEqual(graph.newSim(), { task: '', example: null, run: null, error: '', result: null });
});
it('what a reload brings back that is not a simulation is an empty one', () => {
  for (const raw of [undefined, null, 'x', 5, [], {}, { task: 7 }, { example: 'a' }, { example: -1 }, { example: 1.5 }, { result: 'x' }, { result: { kind: 'decision' } }]) {
    const back = graph.restoreSim(raw);
    assert.equal(back.run, null);
    assert.equal(back.error, '');
    assert.ok(back.task === '' || typeof back.task === 'string');
    assert.ok(back.example === null || Number.isInteger(back.example));
  }
  assert.deepEqual(graph.restoreSim({ task: 7, example: 'a', result: { kind: 'decision' } }), graph.newSim());
  assert.equal(graph.restoreSim({ example: -1 }).example, null);
  assert.equal(graph.restoreSim({ example: 2 }).example, 2);
});
it('the project the session keeps carries its simulation through a reload, and a run in progress does not', () => {
  const held = { ...fresh('marionette'), step: 'graph' as const };
  held.sim = { task: 'Write a letter', example: null, run: 'r4', error: '', result: decision() };
  remember(held);
  const back = recall()!;
  assert.deepEqual(back.sim, { task: 'Write a letter', example: null, run: null, error: '', result: decision() });
  assert.equal(back.step, 'graph');
});
