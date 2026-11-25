// Plan R0, Task 6: what the decision graph of a project is made of and how the answer of the runtime is read (src/pages/project/graph-model.ts). Pure data:
// the guide's data model (capabilities, entries, documented examples), the outcome an example or the AI's validated answer gives, and the steps that light the graph.
// The page never decides a branch: only a documented example and the AI's validated answer light one, and these tests feed it both. These tests were part of
// project-graph.test.ts, which tested the string window as well; the model stays, and so do they.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectInfo } from '../src/types.ts';
import { capsOf, entriesOf, examplesOf, outcomeOfExample, outputsOf, readAnswer, readOutcome, litOf } from '../src/pages/project/graph-model.ts';
import type { Outcome } from '../src/pages/project/graph-model.ts';


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
  { name: 'sample-design', description: 'Use when designing', capabilities: ['design-taste', 'design-review'] },
  { name: 'sample-office', description: 'Use when making files', capabilities: ['office-docs', 'office-pdf', 'office-fonts'] },
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
const meta = { schema: 1, name: 'Sample', slug: 'sample', version: '0.5.0', author: 'a', created: '2026-11-10T09:00:00Z', changed: '2026-11-18T12:00:00Z', repository: null, builtin: true };
const info = (over: Record<string, unknown> = {}, graphOver: Record<string, unknown> = {}): ProjectInfo => ({
  project: meta, plugin: { name: 'Sample', slug: 'sample', version: '0.5.0', description: 'One plugin' }, inputs: [], decisions: DECISIONS, records: [], history: [], changelog: '', prompts: [],
  graph: { entries: ENTRIES, capabilities: CAPS, examples: EXAMPLES, ...graphOver }, files: [], digest: 'sha256:a', ...over,
} as unknown as ProjectInfo);

const decision = (over: Record<string, unknown> = {}): Outcome => ({ kind: 'decision', asked: 'Write a letter', status: 'selected', steps: [{ step_id: 'office-docs', capability: 'office-docs', intent: 'office-docs-intent', reason: 'A Word file.', added_as_prerequisite: false }], reason: 'One document.', questions: [], stack: [], who: null, example: null, ...over } as Outcome);

// ---------- the model ----------
test('the graph is read from the guide data: capabilities, entries and what each example resolved to', () => {
  const held = info();
  assert.deepEqual(capsOf(held).map(c => c.id), CAPS.map(c => c.id));
  const review = capsOf(held).find(c => c.id === 'design-review')!;
  assert.deepEqual(review.needs, [{ capability: 'design-taste', label: 'A design exists', when: 'A design exists', reason: 'Because.' }]);
  assert.deepEqual(capsOf(held).find(c => c.id === 'office-docs')!.conflicts, ['office-pdf']);
  assert.deepEqual(capsOf(held).find(c => c.id === 'office-docs')!.after, ['office-fonts']);
  assert.deepEqual(entriesOf(held).map(e => [e.name, e.capabilities.length]), [['sample-design', 2], ['sample-office', 3]]);
});
test('a graph that is not what the factory writes is read for what is there, never trusted', () => {
  const held = info({}, { capabilities: [cap('ok'), { title: 'no id' }, null, 7, { id: 5 }, { id: 'half', title: 3, intents: 'x', needs: [{ label: 'no target' }, 'x'], conflicts: [1, 'ok'], outputs: 'x', after: [null] }], entries: [{ name: 'e', capabilities: ['ok', 3] }, 'x', { description: 'no name' }], examples: [null, { title: 7 }] });
  assert.deepEqual(capsOf(held).map(c => c.id), ['ok', 'half']);
  const half = capsOf(held)[1];
  assert.deepEqual({ title: half.title, intents: half.intents, needs: half.needs, conflicts: half.conflicts, outputs: half.outputs, after: half.after }, { title: 'half', intents: [], needs: [], conflicts: ['ok'], outputs: [], after: [] });
  assert.deepEqual(entriesOf(held), [{ name: 'e', description: '', capabilities: ['ok'] }]);
  assert.equal(examplesOf(held).length, 2, 'one per documented example, so an index means the same thing everywhere');
  assert.deepEqual(examplesOf(held).map(e => [e.title, e.steps.length]), [['Example 1', 0], ['Example 2', 0]]);
});
test('an example is its documented steps in order, each with the reason its selection gave, and a step nobody chose is a prerequisite', () => {
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
test('a repeated capability is told apart by its step id, and its reason follows the step', () => {
  const twice = { ...EXAMPLES[0], selections: [{ ...pick('design-taste', 'First.'), step_id: 'design-taste#1' }, { ...pick('design-taste', 'Again.'), step_id: 'design-taste#2' }], steps: [{ step: 'design-taste#1', capability: 'design-taste', intent: 'design-taste-intent' }, { step: 'design-taste#2', capability: 'design-taste', intent: 'design-taste-intent' }] };
  const [one] = examplesOf(info({}, { examples: [twice] }));
  assert.deepEqual(one.steps.map(s => [s.step_id, s.reason, s.added_as_prerequisite]), [['design-taste#1', 'First.', false], ['design-taste#2', 'Again.', false]]);
});
test('outputsOf lists what the steps of an example produce, once each, in order', () => {
  const held = info();
  assert.deepEqual(outputsOf(examplesOf(held)[0], capsOf(held)), ['design-brief', 'palette']);
});
test('outputsOf is empty for an example with no step or no output', () => {
  const held = info(), [, letter, hello] = examplesOf(held);
  assert.deepEqual(outputsOf(hello, capsOf(held)), []);
  assert.deepEqual(outputsOf(letter, capsOf(held)), []);
});
test('outputsOf skips a step whose capability is not in the graph and keeps the first-seen order of a repeated output', () => {
  const steps = ['a', 'ghost', 'b'].map(id => ({ step: id, capability: id, intent: null }));
  const held = info({}, { capabilities: [cap('a', { outputs: ['x', 'y'] }), cap('b', { outputs: ['y', 'z'] })], examples: [{ title: 't', task: 't', stack_tokens: [], status: 'selected', selections: [], reason: '', questions: [], path: [], steps }] });
  assert.deepEqual(outputsOf(examplesOf(held)[0], capsOf(held)), ['x', 'y', 'z']);
});
const valid = { valid: true, status: 'selected', steps: [{ step_id: 'office-docs', capability: 'office-docs', intent: 'office-docs-intent', reason: 'A Word file.', added_as_prerequisite: false }], reason: 'One document.', questions: [] };
test('the runtime\'s answer is read as a decision, with the engine that made it, its cost and its time', () => {
  const read = readAnswer({ ...valid, engine: 'harness', harness: 'claude-code', cost_usd: 0.12, duration_ms: 4200 }, ' Write a letter ');
  assert.deepEqual(read, { kind: 'decision', asked: ' Write a letter ', status: 'selected', steps: valid.steps, reason: 'One document.', questions: [], stack: [], who: { engine: 'harness', model: null, harness: 'claude-code', cost_usd: 0.12, duration_ms: 4200 }, example: null });
  assert.deepEqual(readAnswer({ ...valid, engine: 'api', model: 'gpt-test', cost_usd: null, duration_ms: 900 }, 't'), { ...read, asked: 't', who: { engine: 'api', model: 'gpt-test', harness: null, cost_usd: null, duration_ms: 900 } });
  assert.equal((readAnswer(valid, 't') as Extract<Outcome, { kind: 'decision' }>).who, null, 'an answer that names no engine has none');
});
test('no_match and needs_clarification are decisions with no step, the second with its questions', () => {
  const none = readAnswer({ valid: true, status: 'no_match', steps: [], reason: 'Nothing.', questions: [] }, 't');
  assert.deepEqual(none.kind === 'decision' && [none.status, none.steps, none.questions], ['no_match', [], []]);
  const ask = readAnswer({ valid: true, status: 'needs_clarification', steps: [], reason: 'Unclear.', questions: ['A page or a file?', 'For whom?'] }, 't');
  assert.deepEqual(ask.kind === 'decision' && [ask.status, ask.questions], ['needs_clarification', ['A page or a file?', 'For whom?']]);
});
test('a prerequisite keeps its null intent and reason, and is marked', () => {
  const read = readAnswer({ ...valid, steps: [{ step_id: 'office-fonts', capability: 'office-fonts', intent: null, reason: null, added_as_prerequisite: true }, ...valid.steps] }, 't');
  assert.deepEqual(read.kind === 'decision' && read.steps.map(s => [s.capability, s.intent, s.reason, s.added_as_prerequisite]), [['office-fonts', null, null, true], ['office-docs', 'office-docs-intent', 'A Word file.', false]]);
});
test('an answer with valid false is an invalid decision with its errors, whatever else it carries, and shows no step', () => {
  const read = readAnswer({ valid: false, errors: ['Unknown capability in AI classification: made-up', 7, 'AI classification requires a nonempty reason'], steps: valid.steps, status: 'selected', engine: 'api', model: 'm', cost_usd: 0.01 }, 't');
  assert.deepEqual(read, { kind: 'invalid', asked: 't', errors: ['Unknown capability in AI classification: made-up', 'AI classification requires a nonempty reason'], who: { engine: 'api', model: 'm', harness: null, cost_usd: 0.01, duration_ms: null } });
  assert.equal(litOf(read).size, 0);
});
test('an answer in a shape this version does not know is a failure, never repaired into a decision', () => {
  const bad = [null, 'text', 7, [], {}, { valid: 'yes' }, { ...valid, valid: undefined }, { ...valid, status: 'maybe' }, { ...valid, steps: 'x' }, { ...valid, steps: [{ capability: 'office-docs' }] }, { ...valid, steps: [{ ...valid.steps[0], added_as_prerequisite: 'no' }] }, { ...valid, steps: [{ ...valid.steps[0], capability: 5 }] }, { ...valid, steps: [{ ...valid.steps[0], intent: 5 }] }];
  for (const answer of bad) {
    const read = readAnswer(answer, 't');
    assert.equal(read.kind, 'failed', JSON.stringify(answer));
    assert.match(read.kind === 'failed' ? read.message : '', /not know|unknown/i);
  }
});
test('a cost or a time that is not a plain amount is not shown', () => {
  const who = (extra: Record<string, unknown>) => (readAnswer({ ...valid, engine: 'api', ...extra }, 't') as Extract<Outcome, { kind: 'decision' }>).who;
  assert.deepEqual([who({ cost_usd: -1, duration_ms: -5 })?.cost_usd, who({ cost_usd: -1, duration_ms: -5 })?.duration_ms], [null, null]);
  assert.deepEqual([who({ cost_usd: '0.1', duration_ms: Infinity })?.cost_usd, who({ cost_usd: '0.1', duration_ms: NaN })?.duration_ms], [null, null]);
  assert.equal(who({ cost_usd: 0 })?.cost_usd, 0, 'a free request is a known cost');
});
test('what the session keeps of an outcome is read again by the same rules', () => {
  const kept: Outcome[] = [readAnswer({ ...valid, engine: 'harness', harness: 'codex', cost_usd: null, duration_ms: 10 }, 't'), readAnswer({ valid: false, errors: ['x'] }, 't'), { kind: 'failed', asked: 't', message: 'No API key' }, outcomeOfExample(examplesOf(info())[0])];
  for (const outcome of kept) assert.deepEqual(readOutcome(JSON.parse(JSON.stringify(outcome))), outcome);
  for (const bad of [null, 'x', 4, [], {}, { kind: 'nope' }, { kind: 'failed', asked: 't' }, { kind: 'invalid', asked: 't', errors: 'x', who: null }, { ...kept[0], status: 'maybe' }, { ...kept[0], steps: [{}] }, { ...kept[0], asked: 7 }]) assert.equal(readOutcome(bad), null, JSON.stringify(bad));
});
test('the steps that light the graph are numbered in the order of the decision; an invalid or failed outcome lights nothing', () => {
  const twice = decision({ steps: [{ step_id: 'a#1', capability: 'a', intent: 'i', reason: 'r', added_as_prerequisite: false }, { step_id: 'b', capability: 'b', intent: null, reason: null, added_as_prerequisite: true }, { step_id: 'a#2', capability: 'a', intent: 'i', reason: 'r', added_as_prerequisite: false }] });
  assert.deepEqual([...litOf(twice)], [['a', [1, 3]], ['b', [2]]]);
  assert.equal(litOf(null).size, 0);
  assert.equal(litOf({ kind: 'failed', asked: 't', message: 'm' }).size, 0);
  assert.equal(litOf(decision({ status: 'no_match', steps: [] })).size, 0);
});
