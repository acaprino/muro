// Plan R0, final review: what the project workspace reads of a project and the lines it writes from it (src/pages/project/data.ts and lines.ts), as plain functions under
// Node. The assertions of the Imago window's project-graph.test.ts and project-harmonize.test.ts whose subjects the React window kept: the engine note on every branch, the
// runs and the one marked current, the tag of a run, the pin of an input, what an input became, and the counts of a listed project. And the rows a project file holds in
// a shape the page does not expect, which are read as text and never reach the page as objects.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectInfo, ProjectInput } from '../src/types.ts';
import { engineOf } from '../src/model.ts';
import { aboutLine, asking, countsOf, harnessName, noteText, whoLine } from '../src/pages/project/lines.ts';
import { becameParts, pinnedOf, projectData, releaseOf, runsOf, said, tagOf } from '../src/pages/project/data.ts';

// ---------- fixtures ----------
const ai = (over: Record<string, unknown> = {}) => ({ engine: 'harness', harness: 'claude-code', budget_usd: 0.5, api_base: 'https://api.openai.com/v1', model: '', api_key_env: 'MURO_API_KEY', ...over });
const note = (settings: Record<string, unknown>) => noteText(engineOf(settings));
const meta = (repository: unknown) => ({ schema: 1, name: 'Sample', slug: 'sample', version: '0.5.0', author: 'acaprino', created: '2026-11-10T09:00:00Z', changed: '2026-11-18T12:00:00Z', repository, builtin: true });
const REPO = { url: 'https://github.com/owner/sample', branch: 'main', tag_prefix: 'sample-v' };
const info = (over: Record<string, unknown> = {}): ProjectInfo => ({
  project: meta(REPO), plugin: { name: 'Sample', slug: 'sample', version: '0.5.0', description: 'One plugin' }, inputs: [], decisions: [], records: [], history: [], changelog: '', prompts: [],
  graph: { entries: [], capabilities: [], examples: [] }, files: [], digest: 'sha256:a', ...over,
} as unknown as ProjectInfo);
const data = (over: Record<string, unknown> = {}) => projectData(info(over));
const run = (id: string, time: string, version: string, over: Record<string, unknown> = {}) => ({ id, time, version, status: 'completed', budget_usd: null, engine: null, pins: {}, changelog: `Changes of ${version}.`, ...over });
const became = (capability = 0, always = 0, hook = 0, dropped = 0) => ({ capability, 'always-on': always, hook, dropped });
const input = (over: Record<string, unknown> = {}): ProjectInput => ({ id: 'taste-skill', url: 'https://github.com/example/taste-skill', pin: 'release', release: 'v1.2.0', commit: 'abcdef1234567890', license: 'MIT', paths: ['skills'], became: became(), ...over } as ProjectInput);

// ---------- the engine ----------
test('before the first free-text request the page says which engine it uses and what it may cost, on every branch, and that the examples cost nothing', () => {
  assert.equal(note({ ai: ai() }), 'Free-text requests use Claude Code on this computer, with its own credentials. Each costs up to $0.50 a request. Documented examples run no AI.');
  assert.match(note({ ai: ai({ budget_usd: 2 }) }), /up to \$2\.00 a request/);
  const codex = note({ ai: ai({ harness: 'codex' }) });
  assert.match(codex, /^Free-text requests use Codex on this computer/);
  assert.match(codex, /Muro sets no budget for Codex\./);
  assert.doesNotMatch(codex, /\$/);
  const api = note({ ai: ai({ engine: 'api', model: 'gpt-test', api_base: 'https://example.test/v1' }) });
  assert.equal(api, 'Free-text requests are sent to gpt-test through https://example.test/v1 and billed by your API provider. Documented examples run no AI.');
  assert.doesNotMatch(api, /Claude Code|\$/);
  assert.match(note({}), /^Free-text requests use Claude Code on this computer/, 'a service that has no AI settings yet still has its agent');
  assert.doesNotMatch(note({}), /\$/, 'and no budget to name');
  assert.match(note({ agent: 'codex' }), /Codex/, 'the old setting of the harness');
  assert.match(note({ ai: ai({ engine: 'api', model: '' }) }), /sent to the model set in Settings through/);
  assert.match(note({ ai: ai({ engine: 'api', model: 'm', api_base: '' }) }), /through the endpoint set in Settings/);
  for (const settings of [{ ai: ai() }, { ai: ai({ harness: 'codex' }) }, { ai: ai({ engine: 'api' }) }, {}]) assert.match(note(settings), /Documented examples run no AI\.$/);
});

test('the button that waits names the engine, and the answer says who answered, what it cost and how long it took', () => {
  assert.equal(asking(engineOf({ ai: ai() })), 'Claude Code');
  assert.equal(asking(engineOf({ ai: ai({ engine: 'api', model: 'gpt-test' }) })), 'gpt-test');
  assert.equal(asking(engineOf({ ai: ai({ engine: 'api' }) })), 'the API');
  assert.equal(whoLine({ engine: 'harness', model: null, harness: 'claude-code', cost_usd: 0.1234, duration_ms: 4200 }), 'Asked Claude Code · $0.12 · 4.2 s');
  assert.equal(whoLine({ engine: 'api', model: 'gpt-test', harness: null, cost_usd: null, duration_ms: 900 }), 'Asked gpt-test · 0.9 s');
  assert.equal(whoLine(null), '');
  assert.equal(harnessName('constructor'), 'constructor', 'a name of every object is no harness name');
  assert.equal(whoLine({ engine: 'harness', model: null, harness: 'toString', cost_usd: null, duration_ms: null }), 'Asked toString');
});

// ---------- the runs ----------
test('the runs are newest first, and current is the newest completed run of the plugin\'s version: once, never a newer run that was cancelled or failed', () => {
  const { runs, current } = runsOf(data({ history: [run('a', '2026-11-18T12:00:00Z', '0.5.0'), run('b', '2026-11-17T12:00:00Z', '0.5.0'), run('c', '2026-11-19T12:00:00Z', '0.5.0', { status: 'cancelled' }), run('d', '2026-11-20T08:00:00Z', '0.5.0', { status: 'failed' })] }));
  assert.deepEqual(runs.map(r => r.id), ['d', 'c', 'a', 'b']);
  assert.equal(runs[current]?.id, 'a', 'the newest completed one, not the cancelled or the failed run after it');
  // Deliberately not in order: the newest run is in the middle, and a newer run of another version failed.
  const mixed = runsOf(data({ history: [run('run-1', '2026-11-10T09:00:00Z', '0.4.0'), run('run-3', '2026-11-18T12:00:00Z', '0.5.0'), run('run-2', '2026-11-12T10:30:00Z', '0.4.1', { status: 'cancelled' }), run('run-4', '2026-11-20T08:00:00Z', '0.5.1', { status: 'failed' })] }));
  assert.deepEqual(mixed.runs.map(r => r.id), ['run-4', 'run-3', 'run-2', 'run-1']);
  assert.equal(mixed.runs[mixed.current]?.id, 'run-3');
  assert.equal(runsOf(data({ history: [run('x', '2026-11-18T12:00:00Z', '0.4.0')] })).current, -1, 'no run made the version the project is at: none is current');
});

test('the tag of a run comes from the repository\'s tag prefix, and a project with no repository has none', () => {
  assert.equal(tagOf(info(), '0.5.0'), 'sample-v0.5.0');
  assert.equal(tagOf(info({ project: meta({ url: 'https://example.com/x', branch: 'main', tag_prefix: 'v' }) }), '0.5.0'), 'v0.5.0');
  assert.equal(tagOf(info({ project: meta(null) }), '0.5.0'), '');
  assert.equal(tagOf(info(), ''), '', 'a run with no version has no tag');
});

test('what a release publishes is what the file says: its repository and branch, the file, the version and its tag; a project that names no repository has no release', () => {
  assert.deepEqual(releaseOf(info()), { repository: 'https://github.com/owner/sample', branch: 'main', file: 'sample.mp', version: '0.5.0', tag: 'sample-v0.5.0' });
  assert.deepEqual(releaseOf(info({ project: meta({ url: ' https://example.com/x ', branch: 'stable', tag_prefix: '' }) })), { repository: 'https://example.com/x', branch: 'stable', file: 'sample.mp', version: '0.5.0', tag: '0.5.0' });
  assert.equal(releaseOf(info({ project: meta(null) })), null);
  assert.equal(releaseOf(info({ project: meta({ url: '   ', branch: 'main', tag_prefix: 'v' }) })), null, 'an empty address is no repository');
  assert.equal(releaseOf(info({ project: meta({ url: { at: 'x' }, branch: 3 }) })), null, 'a field in another shape is not an address');
  assert.equal(releaseOf(info({ plugin: { name: 'Sample', slug: 'sample', version: '1.0.0' } }))?.tag, 'sample-v1.0.0', "the version is the plugin's");
});

// ---------- the inputs ----------
test('an input is pinned to its release, its latest commit or a frozen one, and a commit not resolved yet says so', () => {
  assert.deepEqual(pinnedOf(input()), { title: 'v1.2.0', line: 'published release' });
  assert.deepEqual(pinnedOf(input({ release: null })), { title: 'Release', line: 'published release' });
  assert.deepEqual(pinnedOf(input({ pin: 'head', release: null, commit: '0123456789abcdef' })), { title: 'Latest commit', line: '@0123456' });
  assert.deepEqual(pinnedOf(input({ pin: 'static', release: null, commit: 'fedcba9876543210' })), { title: 'Frozen commit', line: '@fedcba9' });
  assert.deepEqual(pinnedOf(input({ pin: 'static', release: null, commit: null })), { title: 'Frozen commit', line: 'not resolved yet' });
  assert.deepEqual(pinnedOf(input({ pin: 'head', release: null, commit: null })), { title: 'Latest commit', line: 'not resolved yet' });
});

test('what an input became says only the forms it used, and one of a form in the singular', () => {
  assert.deepEqual(becameParts(input({ became: became(11, 1, 0, 2) })), ['11 capabilities', '1 always on', '2 dropped']);
  assert.deepEqual(becameParts(input({ became: became(4, 0, 1, 0) })), ['4 capabilities', '1 hook']);
  assert.deepEqual(becameParts(input({ became: became(1, 0, 1, 0) })), ['1 capability', '1 hook']);
  assert.deepEqual(becameParts(input({ became: became(0, 0, 2, 0) })), ['2 hooks']);
  assert.deepEqual(becameParts(input({ became: became() })), [], 'not harmonized yet');
});

// ---------- the list ----------
test('a listed project says its inputs and its capabilities, one in the singular, and leaves out a count the runtime did not send, never shown as zero', () => {
  assert.equal(countsOf({ inputs: 3, capabilities: 37 }), '3 inputs · 37 capabilities');
  assert.equal(countsOf({ inputs: 1, capabilities: 1 }), '1 input · 1 capability');
  assert.equal(countsOf({ inputs: undefined, capabilities: undefined }), '');
  assert.equal(countsOf({ capabilities: 4 }), '4 capabilities');
  assert.equal(countsOf({ inputs: 0 }), '0 inputs', 'a zero the runtime sent is said');
});

test('the details of an open project: its repository and branch, who made it and when; with no repository, that it has none', () => {
  assert.equal(aboutLine(info()), 'Repository github.com/owner/sample · main · by acaprino · created 2026-11-10');
  assert.equal(aboutLine(info({ project: meta(null) })), 'No Git repository set · by acaprino · created 2026-11-10');
  assert.equal(aboutLine(info({ project: { ...meta({ url: { at: 'x' }, branch: 3 }), author: null, created: '' } })), 'No Git repository set', 'a field in another shape is left out');
});

// ---------- rows in a shape the page does not expect ----------
test('a record, a run, a choice or an input with an object where the file should hold text is read as text, and a row that is no object is left out', () => {
  const d = data({
    records: [{ id: 'r1', date: 20261110, subjects: { a: 1 }, text: { en: 'One owner per output.' }, author: 'someone', binding: 'yes' }, 'not a row', null],
    history: [{ id: 'x', time: { at: 1 }, version: 5, status: 'odd', budget_usd: -1, engine: { name: 'e' }, pins: { a: 'v1', b: 2 }, changelog: ['a', 'b'] }],
    decisions: [{ source: 'taste-skill', content: { path: 'SKILL.md' }, form: 'capability', targets: ['a', 3], reason: null }],
    inputs: [{ id: 'taste-skill', url: { u: 1 }, pin: 'release', release: 7, commit: false, license: ['MIT'], became: { capability: '2', hook: 1 } }, { id: 9 }],
  });
  assert.deepEqual(d.records, [{ id: 'r1', date: '', subjects: [], text: '{"en":"One owner per output."}', author: 'muro', binding: false }]);
  assert.deepEqual(d.history, [{ id: 'x', time: '', version: '', status: 'odd', budget_usd: null, engine: null, pins: { a: 'v1' }, changelog: '["a","b"]' }]);
  assert.deepEqual(d.decisions, [{ source: 'taste-skill', content: '{"path":"SKILL.md"}', form: 'capability', targets: ['a'], reason: '' }]);
  assert.deepEqual(d.inputs, [{ id: 'taste-skill', url: null, pin: 'release', release: null, commit: null, license: null, paths: [], became: { capability: 0, 'always-on': 0, hook: 1, dropped: 0 } }]);
  const none = projectData(info({ records: 'x', history: {}, decisions: 3, inputs: null }));
  assert.deepEqual([none.records, none.history, none.decisions, none.inputs], [[], [], [], []], 'a list that is not a list is an empty one');
  assert.deepEqual([said('text'), said(null), said(undefined), said(4), said(true)], ['text', '', '', '4', 'true']);
});
test('systemPrompt reads the composed system prompt from project info and stays empty when absent or malformed', () => {
  assert.equal(projectData(info({ system_prompt: '# Muro system: Sample\n\nRules.' })).systemPrompt, '# Muro system: Sample\n\nRules.');
  assert.equal(projectData(info()).systemPrompt, '');
  assert.equal(projectData(info({ system_prompt: { text: 'bad' } })).systemPrompt, '');
});
