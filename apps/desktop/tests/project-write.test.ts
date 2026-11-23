// Plan W, Task 1: the write side of a project, as data. The checks of what a person types, the shapes of the requests the runtime reads (compared with the keys of
// crates/muro-desktop-runtime/src/project_jobs.rs), the words of the runs, and the fake service's write actions with the refusals of the runtime (fake-transport.js), which every later screen of the
// plan is tested on. Pure data under Node: nothing here renders.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Job } from '../src/types.ts';
import {
  AI_RUN_NOTE, CHANGED, CHANGE_OPERATIONS, DEFAULT_BUDGET, MAX_BUDGET, NEEDS_CLAUDE, REFUSALS, REPOSITORY_FIELDS, SHIPPED_ID, VERSION_STEPS,
  agentRefusal, busyReason, changePayload, checkBudget, checkFolder, checkInputs, checkInstructions, checkRecords, checkRepository, checkSlug, checkSource, checkText,
  creating, defaultStep, deletePayload, editPayload, endedBetween, inputLines, instructionDiff, isFullPath, lastFailure, lastOver, newProjectPayload, newRecordId,
  operationWords, outcomeOf, parseBudget, repositoryOf, runningJob, runningOn, slugOf, startedAt, upsertJob,
} from '../src/pages/project/write/jobs.ts';
import { createTransport } from './fake-transport.js';

const BAD_BUDGET = 'The AI budget must be above 0 and at most 100 USD';
const BAD_SLUG = 'The plugin id is lowercase letters and digits joined by dashes, such as my-plugin';
const NOT_A_SOURCE = 'An input is an https:// address or the full path of a folder on this computer';
const keys = (value: object): string[] => Object.keys(value).sort();
const DIGEST = 'a'.repeat(64);

// ---------- what a person types ----------
test('the constants are the runtime\'s: the shipped project, the default and the largest budget, and the agent it needs', () => {
  assert.equal(SHIPPED_ID, 'marionette');
  assert.equal(DEFAULT_BUDGET, 5);
  assert.equal(MAX_BUDGET, 100);
  assert.equal(NEEDS_CLAUDE, 'Making and changing a project needs Claude Code (the only agent Muro can hold to a budget). Choose Claude Code in Settings → AI.');
  assert.equal(CHANGED, 'The project file changed since it was opened: open it again and repeat the change');
  assert.deepEqual(VERSION_STEPS.map(s => s.value), ['patch', 'minor', 'major']);
  assert.deepEqual(CHANGE_OPERATIONS, ['harmonize', 'add_input', 'remove_input', 'move_pin', 'instructions']);
  assert.match(AI_RUN_NOTE, /Claude Code does it on this computer/);
});

test('a plugin id is kebab-case, not the shipped project\'s, and not one already listed, in the runtime\'s words', () => {
  for (const good of ['my-plugin', ' my-plugin ', 'x2-y3', 'a', 'a'.repeat(64)]) assert.equal(checkSlug(good), null, good);
  for (const bad of ['My Plugin', '', '   ', '-a', 'a-', 'a--b', 'a_b', 'a b', 'A', 'caffè', 'a'.repeat(65)]) assert.equal(checkSlug(bad), BAD_SLUG, JSON.stringify(bad));
  assert.equal(checkSlug('marionette'), 'The plugin id marionette is the project Muro ships: choose another');
  assert.equal(checkSlug('notes', ['notes']), 'A project for notes is already in your list');
  assert.equal(checkSlug('notes', { projects: ['other'], plugins: ['notes'] }), 'A plugin named notes is already in your list: choose another plugin id');
  assert.equal(checkSlug('notes', { projects: ['other'] }), null);
  assert.equal(checkSlug('notes', []), null);
});

test('the plugin id a name suggests: accents dropped, other runs of characters a dash, at most 64 characters', () => {
  assert.equal(slugOf('Docs Kit'), 'docs-kit');
  assert.equal(slugOf('Caffè Società!'), 'caffe-societa');
  assert.equal(slugOf('  --My_Plugin v2 '), 'my-plugin-v2');
  assert.equal(slugOf('???'), '');
  assert.equal(slugOf('a'.repeat(80)), 'a'.repeat(64));
  assert.equal(slugOf('a'.repeat(63) + ' b'), 'a'.repeat(63));
  assert.equal(checkSlug(slugOf('Docs Kit')), null);
});

test('a text of a field is one line (required, 200 characters, no control character) or a request in words (optional, 4000, plain)', () => {
  assert.equal(checkText('My plugin', 'The project name'), null);
  assert.equal(checkText('   ', 'The project name'), 'The project name is required');
  assert.equal(checkText('two\nlines', 'The project name'), 'The project name must be one line of at most 200 characters');
  assert.equal(checkText('tab\there', 'The author'), 'The author must be one line of at most 200 characters');
  assert.equal(checkText('x'.repeat(201), 'The author'), 'The author must be one line of at most 200 characters');
  assert.equal(checkText('x'.repeat(200), 'The author'), null);
  assert.equal(checkText('\u00e8'.repeat(200), 'The author'), null, 'characters, not bytes');
  assert.equal(checkText('\u{1F600}'.repeat(200), 'The author'), null, 'a character is a code point, not a UTF-16 unit');
  assert.equal(checkText('next\u0085line', 'The author'), 'The author must be one line of at most 200 characters', 'a C1 control character is a control character');
  assert.equal(checkText('', 'The request', true), null);
  assert.equal(checkText('a\nb\tc\r\nd', 'The request', true), null);
  assert.equal(checkText('x'.repeat(4000), 'The request', true), null);
  assert.equal(checkText('x'.repeat(4001), 'The request', true), 'The request must be at most 4000 characters');
  assert.equal(checkText('bell\u0007', 'The request', true), 'The request must be plain text');
});

test('an input is an https address without spaces or the full path of a folder: the runtime\'s source rule', () => {
  for (const good of ['https://github.com/a/b', 'https://github.com/a/b#skills', ' https://github.com/a/b ', 'C:\\Users\\x\\repo', 'C:/Users/x/repo', 'D:\\Progetti\\Caff\u00e8 Societ\u00e0\\skills',
    '\\\\server\\share\\repo']) assert.equal(checkSource(good), null, good);
  for (const bad of ['http://x', 'relative/folder', 'repo', 'C:foo', 'C:', '\\\\', 'HTTPS://github.com/a/b', 'github.com/a/b']) assert.equal(checkSource(bad), NOT_A_SOURCE, bad);
  assert.equal(checkSource(''), 'Where the input comes from is required');
  assert.equal(checkSource('   '), 'Where the input comes from is required');
  assert.equal(checkSource('https://'), "An input's address must be an https:// address without spaces");
  assert.equal(checkSource('https://a b'), "An input's address must be an https:// address without spaces");
  assert.equal(checkSource('https://a\tb'), 'Where the input comes from must be one line of at most 200 characters');
  assert.equal(checkSource('https://' + 'a'.repeat(200)), 'Where the input comes from must be one line of at most 200 characters');
  assert.equal(isFullPath('/usr/x'), true, 'a root passes: the runtime asks the machine it runs on');
  assert.equal(isFullPath('\\\\server\\x'), true);
  assert.equal(isFullPath('C:\\'), true);
  assert.equal(isFullPath('C:foo'), false);
});

test('the folder of a new project is one line and a full path; its inputs are one or more sources, at most 20, none twice', () => {
  assert.equal(checkFolder('D:\\Projects'), null);
  assert.equal(checkFolder('D:/Progetti/Caff\u00e8 Societ\u00e0'), null);
  assert.equal(checkFolder('relative/folder'), 'Choose the folder with its full path');
  assert.equal(checkFolder(''), 'The folder is required');
  assert.equal(checkInputs('https://github.com/a/b\n\nD:\\Skills\\writing\n'), null);
  assert.equal(checkInputs(['https://github.com/a/b', ' D:\\Skills\\writing ']), null);
  assert.equal(checkInputs(''), 'Add at least one input: a project is made from plugins and skills');
  assert.equal(checkInputs(['  ']), 'Add at least one input: a project is made from plugins and skills');
  assert.equal(checkInputs(['https://github.com/a/b', 'http://x']), NOT_A_SOURCE);
  assert.equal(checkInputs(['https://a/b', 'https://a/b']), 'The input https://a/b is named twice');
  assert.equal(checkInputs(Array.from({ length: 21 }, (_, n) => `https://example.org/${n}`)), 'At most 20 inputs at once');
  assert.deepEqual(inputLines('a\r\n\r\n  b  \n'), ['a', 'b']);
});

test('a budget is a plain number above 0 and at most 100', () => {
  for (const bad of ['0', '0.0', '101', '100.5', 'abc', '', ' ', '-1', '1e2', '0x10', '5,5', 'NaN', 'Infinity']) assert.equal(checkBudget(bad), BAD_BUDGET, JSON.stringify(bad));
  for (const good of ['0.5', '5', '100', ' 2 ', '.5', '5.', '0.01']) assert.equal(checkBudget(good), null, good);
  assert.equal(parseBudget(' 2.5 '), 2.5);
  assert.ok(Number.isNaN(parseBudget('abc')));
});

test('the repository of a project: none while the address is empty; else an https address, a branch (main when empty) and a prefix', () => {
  assert.deepEqual(checkRepository(null), {});
  assert.deepEqual(checkRepository({ url: '', branch: 'x\ny', tag_prefix: '' }), {}, 'nothing is checked while there is no repository');
  assert.deepEqual(checkRepository({ url: 'https://github.com/o/r', branch: '', tag_prefix: 'p-v' }), {});
  assert.deepEqual(checkRepository({ url: 'git@github.com:o/r', branch: '', tag_prefix: '' }), { url: 'The repository address must be an https:// address' });
  assert.deepEqual(checkRepository({ url: 'https://x.y/a b', branch: '', tag_prefix: '' }), { url: 'The repository address must be an https:// address' });
  assert.deepEqual(checkRepository({ url: 'https://github.com/o/r', branch: 'a\nb', tag_prefix: 'c\td' }),
    { branch: 'The branch must be one line of at most 200 characters', tag_prefix: 'The tag prefix must be one line of at most 200 characters' });
  assert.equal(repositoryOf(null), null);
  assert.equal(repositoryOf({ url: '  ', branch: 'main', tag_prefix: '' }), null);
  assert.deepEqual(repositoryOf({ url: ' https://github.com/o/r ', branch: '', tag_prefix: ' p-v ' }), { url: 'https://github.com/o/r', branch: 'main', tag_prefix: 'p-v' });
  assert.deepEqual(REPOSITORY_FIELDS.map(f => f.key), ['url', 'branch', 'tag_prefix']);
  assert.deepEqual(REPOSITORY_FIELDS.map(f => f.initial), ['', 'main', '']);
});

test('instruction files: Markdown under plain names, none twice, at most 256 KiB, at most 50; and what a sheet changes against the files held', () => {
  assert.equal(checkInstructions([{ path: 'rules.md', text: 'Keep it short.' }, { path: 'team/style.MD', text: null }]), null);
  assert.equal(checkInstructions([]), 'Change at least one instruction file');
  assert.equal(checkInstructions(Array.from({ length: 51 }, (_, n) => ({ path: `f${n}.md`, text: '' }))), 'At most 50 instruction files at once');
  assert.equal(checkInstructions([{ path: '  ', text: '' }]), 'An instruction file needs a name');
  assert.equal(checkInstructions([{ path: 'a'.repeat(198) + '.md', text: '' }]), 'An instruction file needs a name', 'the name is 200 bytes at most');
  assert.equal(checkInstructions([{ path: 'notes.txt', text: '' }]), 'An instruction file is Markdown: its name ends in .md (notes.txt)');
  for (const bad of ['../x.md', 'a\\b.md', 'c:x.md', '/a.md', 'a//b.md', 'dir./x.md', 'a?.md', './x.md']) {
    assert.equal(checkInstructions([{ path: bad, text: '' }]), `An instruction file's name is plain folder and file names separated by / (${bad})`, bad);
  }
  assert.equal(checkInstructions([{ path: 'a.md', text: '' }, { path: 'A.md', text: '' }]), 'The instruction file A.md is named twice');
  assert.equal(checkInstructions([{ path: 'a.md', text: 'x'.repeat(256 * 1024 + 1) }]), 'a.md is larger than 256 KiB');
  assert.equal(checkInstructions([{ path: 'a.md', text: 'x'.repeat(256 * 1024) }]), null);
  const held = [{ path: 'house-style.md', text: 'Short.\n' }, { path: 'old.md', text: 'x' }];
  assert.deepEqual(instructionDiff(held, held), [], 'nothing changed, nothing is sent');
  assert.deepEqual(instructionDiff(held, [{ path: 'house-style.md', text: 'Short and plain.\n' }, { path: ' team\\tone.md', text: 'Friendly.' }]),
    [{ path: 'old.md', text: null }, { path: 'house-style.md', text: 'Short and plain.\n' }, { path: 'team/tone.md', text: 'Friendly.' }]);
  assert.deepEqual(instructionDiff(held, [{ path: 'HOUSE-STYLE.md', text: 'Short.\n' }, { path: 'old.md', text: 'x' }]), [{ path: 'HOUSE-STYLE.md', text: 'Short.\n' }], 'another case is a write, not a removal');
});

test('decision records are what the factory takes: a unique id, a real date, subjects, a text, muro or you, a true or false binding', () => {
  const record = { id: 'r1', date: '2026-11-10', subjects: ['design-taste'], text: 'One owner per output.', author: 'muro' as const, binding: false };
  assert.equal(checkRecords([record, { ...record, id: 'you-2026-11-21-1', author: 'you' as const, binding: true }]), null);
  assert.equal(checkRecords([]), null);
  assert.equal(checkRecords([{ ...record, id: '' }]), 'Record 1 needs an id of letters, digits, dots, dashes or underscores');
  assert.equal(checkRecords([{ ...record, id: '-x' }]), 'Record 1 needs an id of letters, digits, dots, dashes or underscores');
  assert.equal(checkRecords([record, record]), 'Two records have the id r1');
  assert.equal(checkRecords([{ ...record, date: '2026-1-1' }]), 'Record r1 needs a date as YYYY-MM-DD');
  assert.equal(checkRecords([{ ...record, date: '2026-02-30' }]), 'Record r1 needs a real date');
  assert.equal(checkRecords([{ ...record, date: '2028-02-29' }]), null, 'a leap day is real');
  assert.equal(checkRecords([{ ...record, subjects: [''] }]), 'Record r1: subjects must be a list of names');
  assert.equal(checkRecords([{ ...record, text: '  ' }]), 'Record r1 needs a text');
  assert.equal(checkRecords([{ ...record, text: 'x'.repeat(20001) }]), 'Record r1 is longer than 20000 characters');
  assert.equal(checkRecords([{ ...record, author: 'bot' as any }]), 'Record r1: the author is muro or you');
  assert.equal(checkRecords([{ ...record, binding: 'yes' as any }]), 'Record r1: binding must be true or false');
  assert.equal(newRecordId('2026-11-21', []), 'you-2026-11-21-1');
  assert.equal(newRecordId('2026-11-21', [{ id: 'you-2026-11-21-1' }, { id: 'you-2026-11-21-2' }, { id: 'r1' }]), 'you-2026-11-21-3');
});

test('the words of each operation, its default version step, the agent refusal and the list of refusals', () => {
  assert.deepEqual(['create', ...CHANGE_OPERATIONS].map(o => operationWords(o as any).submit), ['Create project', 'Harmonize', 'Add input', 'Remove input', 'Move pin', 'Save and harmonize']);
  assert.deepEqual(['create', ...CHANGE_OPERATIONS].map(o => operationWords(o as any).title), ['New project', 'Harmonize again', 'Add an input', 'Remove an input', 'Move a pin', 'Your instructions']);
  for (const operation of ['create', ...CHANGE_OPERATIONS]) {
    const words = operationWords(operation as any);
    assert.ok(words.does.endsWith('.') && words.about.endsWith('.'), operation);
  }
  assert.deepEqual(CHANGE_OPERATIONS.map(defaultStep), ['patch', 'minor', 'minor', 'patch', 'patch']);
  assert.equal(agentRefusal({ ai: { harness: 'codex' }, agent: 'claude-code' }), NEEDS_CLAUDE, 'the harness of the AI settings wins over the old agent');
  assert.equal(agentRefusal({ agent: 'codex' }), NEEDS_CLAUDE);
  assert.equal(agentRefusal({ ai: { harness: 'claude-code' }, agent: 'claude-code' }), null);
  assert.equal(agentRefusal({}), null);
  assert.equal(agentRefusal(undefined), null);
  assert.equal(new Set(REFUSALS.map(r => r.id)).size, REFUSALS.length, 'one line for each rule');
  assert.ok(REFUSALS.every(r => r.applies.length && r.rule && r.says));
  assert.equal(REFUSALS.find(r => r.id === 'agent')?.says, NEEDS_CLAUDE);
  assert.equal(REFUSALS.find(r => r.id === 'digest-stale')?.says, CHANGED);
});

// ---------- the requests ----------
test('a new project carries every key the runtime reads, each text trimmed as it trims it and sent as it was typed otherwise', () => {
  const payload = newProjectPayload({
    name: ' My <Plugin> & "co" ', slug: ' my-plugin ', author: 'me', folder: ' D:\\Progetti\\Caff\u00e8 Societ\u00e0 ', inputs: 'https://github.com/a/b\r\n\r\n  D:\\Skills\\writing  \n',
    request: ' Merge the two review steps.\r\nKeep it short. ', repository: { url: ' https://github.com/a/b ', branch: '', tag_prefix: '' }, budget: '2.5',
  });
  assert.deepEqual(payload, {
    name: 'My <Plugin> & "co"', slug: 'my-plugin', author: 'me', folder: 'D:\\Progetti\\Caff\u00e8 Societ\u00e0', inputs: [{ source: 'https://github.com/a/b' }, { source: 'D:\\Skills\\writing' }],
    request: 'Merge the two review steps.\nKeep it short.', repository: { url: 'https://github.com/a/b', branch: 'main', tag_prefix: '' }, budget_usd: 2.5,
  });
  // the keys of create(): name, slug, author, folder, inputs[].source, request, repository, budget_usd
  assert.deepEqual(keys(payload), ['author', 'budget_usd', 'folder', 'inputs', 'name', 'repository', 'request', 'slug']);
  const bare = newProjectPayload({ name: 'A', slug: 'a', author: 'me', folder: 'D:\\x', inputs: ['https://github.com/a/b', ' ', 'https://github.com/c/d'], request: '', budget: '5' });
  assert.deepEqual(bare.inputs, [{ source: 'https://github.com/a/b' }, { source: 'https://github.com/c/d' }]);
  assert.equal(bare.repository, null);
  assert.equal(bare.request, '');
  assert.equal(bare.budget_usd, DEFAULT_BUDGET);
});

test('a change carries the digest and only the keys of its operation, with the operation\'s own default step', () => {
  const form = { budget: '5' };
  assert.deepEqual(keys(changePayload('demo', DIGEST, 'harmonize', form)), ['budget_usd', 'digest', 'id', 'operation', 'request', 'step']);
  assert.deepEqual(keys(changePayload('demo', DIGEST, 'add_input', { ...form, source: 'https://github.com/a/b' })), ['budget_usd', 'digest', 'id', 'operation', 'request', 'source', 'step']);
  assert.deepEqual(keys(changePayload('demo', DIGEST, 'remove_input', { ...form, input: 'alpha' })), ['budget_usd', 'digest', 'id', 'input', 'operation', 'request', 'step']);
  assert.deepEqual(keys(changePayload('demo', DIGEST, 'move_pin', { ...form, input: 'alpha' })), ['budget_usd', 'digest', 'id', 'input', 'operation', 'request', 'step', 'to']);
  assert.deepEqual(keys(changePayload('demo', DIGEST, 'instructions', { ...form, instructions: [{ path: 'a.md', text: 'x' }] })), ['budget_usd', 'digest', 'id', 'instructions', 'operation', 'request', 'step']);
  assert.deepEqual(changePayload('demo', DIGEST, 'harmonize', { budget: '0.5', request: ' Merge the two review steps. ' }),
    { id: 'demo', digest: DIGEST, operation: 'harmonize', budget_usd: 0.5, step: 'patch', request: 'Merge the two review steps.' });
  assert.deepEqual(['harmonize', 'add_input', 'remove_input', 'move_pin', 'instructions'].map(o => changePayload('demo', DIGEST, o as any, form).step), ['patch', 'minor', 'minor', 'patch', 'patch']);
  assert.equal(changePayload('demo', DIGEST, 'add_input', { ...form, step: 'major' }).step, 'major');
  assert.equal(changePayload('demo', DIGEST, 'move_pin', { ...form, input: ' alpha ', to: ' v2.0.0 ' }).to, 'v2.0.0');
  assert.equal(changePayload('demo', DIGEST, 'move_pin', { ...form, input: 'alpha' }).to, '', 'empty is the newest release');
  assert.equal(changePayload('demo', DIGEST, 'add_input', { ...form, source: ' D:\\Skills\\Caff\u00e8 Societ\u00e0 ' }).source, 'D:\\Skills\\Caff\u00e8 Societ\u00e0');
  assert.deepEqual(changePayload('demo', DIGEST, 'instructions', { ...form, instructions: [{ path: ' team/tone.md ', text: 'Friendly.' }, { path: 'old.md', text: null }] }).instructions,
    [{ path: 'team/tone.md', text: 'Friendly.' }, { path: 'old.md', text: null }]);
});

test('a budget that is no budget stops the request: the runtime reads a missing or null one as the default and would run at a cost nobody chose', () => {
  assert.throws(() => changePayload('demo', DIGEST, 'harmonize', { budget: '0' }), { message: BAD_BUDGET });
  assert.throws(() => changePayload('demo', DIGEST, 'harmonize', { budget: 'abc' }), { message: BAD_BUDGET });
  assert.throws(() => newProjectPayload({ name: 'A', slug: 'a', author: 'me', folder: 'D:\\x', inputs: 'https://a/b', request: '', budget: '101' }), { message: BAD_BUDGET });
});

test('an edit carries the digest and only what changes; null takes the repository away, as an empty address does', () => {
  assert.deepEqual(editPayload('demo', DIGEST, {}), { id: 'demo', digest: DIGEST });
  assert.deepEqual(editPayload('demo', DIGEST, { name: ' Renamed ', author: ' me ' }), { id: 'demo', digest: DIGEST, name: 'Renamed', author: 'me' });
  assert.deepEqual(editPayload('demo', DIGEST, { repository: null }), { id: 'demo', digest: DIGEST, repository: null });
  assert.deepEqual(editPayload('demo', DIGEST, { repository: { url: ' ', branch: 'main', tag_prefix: '' } }), { id: 'demo', digest: DIGEST, repository: null });
  assert.deepEqual(editPayload('demo', DIGEST, { repository: { url: 'https://github.com/o/r', branch: '', tag_prefix: 'r-v' } }),
    { id: 'demo', digest: DIGEST, repository: { url: 'https://github.com/o/r', branch: 'main', tag_prefix: 'r-v' } });
  assert.deepEqual(editPayload('demo', DIGEST, { changelog: '' }), { id: 'demo', digest: DIGEST, changelog: '' }, 'an empty changelog is a change');
  const record = { id: 'mine-1', date: '2026-11-21', subjects: ['a', 'b'], text: 'A <b> & "c"', author: 'you' as const, binding: true, extra: 1 };
  const sent = editPayload('demo', DIGEST, { records: [record] }).records;
  assert.deepEqual(sent, [{ id: 'mine-1', date: '2026-11-21', subjects: ['a', 'b'], text: 'A <b> & "c"', author: 'you', binding: true }], 'the keys of a record, and the text as it is');
  assert.deepEqual(editPayload('demo', DIGEST, { records: [] }).records, [], 'every record deleted is a change too');
  assert.deepEqual(deletePayload('demo', 7), { id: 'demo', revision: 7 });
});

// ---------- the runs the runtime holds ----------
const run = (over: Partial<Job> = {}): Job => ({ id: 'j1', kind: 'project', project_id: 'demo', operation: 'harmonize', title: 'Harmonize again', status: 'running', phase: 'Opening the project', budget_usd: 5, log_path: 'D:/log/output.log', message: '', time: 100, ...over });

test('which run goes, on which project, and which new project is being made', () => {
  const adaptation = run({ id: 'a1', kind: undefined, title: undefined, project_id: undefined, operation: undefined, plugin_id: 'p1', harness: 'codex', phase: 'harmonization' });
  assert.equal(runningJob([]), null);
  assert.equal(runningJob([run({ status: 'completed' })]), null);
  assert.equal(runningJob([run({ id: 'x', status: 'failed' }), adaptation, run()])?.id, 'a1', 'an adaptation counts: one run goes at a time');
  assert.equal(runningOn([adaptation, run({ id: 'j2', project_id: 'other' })], 'demo'), null);
  assert.equal(runningOn([adaptation, run()], 'demo')?.id, 'j1');
  assert.deepEqual(creating([run({ id: 'c1', operation: 'create', project_id: 'new-one' }), run(), run({ id: 'c2', operation: 'create', status: 'failed' })]).map(j => j.id), ['c1']);
  assert.equal(busyReason(null), null);
  assert.equal(busyReason(run()), 'Harmonize again is running: one AI run goes at a time. Wait for it to finish, or cancel it.');
  assert.equal(busyReason(adaptation), 'The adaptation of p1 is running: one AI run goes at a time. Wait for it to finish, or cancel it.');
});

test('the last run of a project that is over, newest first; the page says so when it did not succeed', () => {
  const jobs = [
    run({ id: 'old-failed', status: 'failed', time: 100 }), run({ id: 'other', project_id: 'other', status: 'failed', time: 500 }),
    run({ id: 'newest', status: 'cancelled', time: '300' as any }), run({ id: 'mid', status: 'completed', time: 200 }), run({ id: 'going', time: 400 }),
  ];
  assert.equal(lastOver(jobs, 'demo')?.id, 'newest');
  assert.equal(lastFailure(jobs, 'demo')?.id, 'newest');
  assert.equal(lastFailure([...jobs, run({ id: 'later', status: 'completed', time: 600 })], 'demo'), null, 'a run that succeeded after it clears it');
  assert.equal(lastOver(jobs, 'nothing'), null);
  assert.equal(startedAt(run({ time: 1700000000 })), 1700000000);
  assert.equal(startedAt(run({ time: '1700000000' })), 1700000000, 'a text of digits is read the same');
  assert.equal(startedAt(run({ time: 'soon' })), 0);
});

test('what a reading of the runs tells that the one before did not: the project runs that were running and are over', () => {
  const adaptation = run({ id: 'a1', kind: undefined });
  const before = [run({ id: 'j1' }), adaptation, run({ id: 'j9', status: 'failed' })];
  const after = [run({ id: 'j1', status: 'completed' }), { ...adaptation, status: 'completed' }, run({ id: 'j9', status: 'failed' }), run({ id: 'j3', status: 'failed' })];
  assert.deepEqual(endedBetween(before, after).map(j => j.id), ['j1'], 'not an adaptation, not a run already over, not one first seen over');
  assert.deepEqual(endedBetween([], after), []);
  assert.deepEqual(endedBetween(before, before), []);
  assert.deepEqual(upsertJob([run({ id: 'a' }), run({ id: 'b' })], run({ id: 'b', status: 'completed' })).map(j => [j.id, j.status]), [['a', 'running'], ['b', 'completed']]);
  assert.deepEqual(upsertJob([run({ id: 'a' })], run({ id: 'n' })).map(j => j.id), ['n', 'a'], 'a new run goes first');
});

test('the outcome of a run is said in the runtime\'s words: its title and its message', () => {
  const saved = 'The project was saved. Install it again from its Install step to bring the change to the harnesses';
  assert.deepEqual(outcomeOf(run({ status: 'completed', message: saved })), { text: `Harmonize again: ${saved}`, error: false });
  assert.deepEqual(outcomeOf(run({ status: 'completed', message: '' })), { text: 'Harmonize again: done.', error: false });
  assert.deepEqual(outcomeOf(run({ status: 'failed', message: 'The AI run failed (exit code: 1); see output.log. The project file was not changed' })),
    { text: 'Harmonize again failed: The AI run failed (exit code: 1); see output.log. The project file was not changed', error: true });
  assert.deepEqual(outcomeOf(run({ status: 'cancelled', message: 'Job cancelled. The project file was not changed' })), { text: 'Harmonize again was cancelled: Job cancelled. The project file was not changed', error: false });
  assert.deepEqual(outcomeOf(run({ status: 'interrupted', message: 'Previous desktop session ended' })), { text: 'Harmonize again was interrupted: Previous desktop session ended', error: true });
  assert.deepEqual(outcomeOf(run({ status: 'failed', title: undefined, message: '' })), { text: 'The AI run failed.', error: true });
  assert.equal(outcomeOf(run()), null, 'a run that goes has no outcome');
  assert.equal(outcomeOf(run({ status: 'paused' })), null, 'a status this window does not know says nothing');
});

// ---------- the fake service: the runtime's writes and refusals ----------
const harmonize = (fake: any, over: Record<string, unknown> = {}) => ({ id: 'marionette', operation: 'harmonize', digest: fake.behind.digest('marionette'), budget_usd: 5, step: 'patch', request: '', ...over });
const NEW_PROJECT = { name: 'Docs Kit', slug: 'docs-kit', author: 'me', folder: 'D:/Projects', inputs: [{ source: 'https://github.com/example/docs' }, { source: 'D:/Skills/writing' }], request: '', repository: null, budget_usd: 5 };
const ids = async (fake: any) => (await fake.request('projects') as any[]).map(p => p.id);
const jobsOf = (fake: any) => fake.request('jobs') as Promise<any[]>;
const later = (ms: number) => new Promise(done => setTimeout(done, ms));

test('a change is refused as the runtime refuses it, before any run starts, and a project has a digest of 64 hex digits', async () => {
  const fake = createTransport('projects');
  const digest = fake.behind.digest('marionette');
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal((await fake.request('projects') as any[])[0].digest, digest);
  assert.equal((await fake.request('project', { id: 'marionette' }) as any).digest, digest);
  const refused = async (patch: Record<string, unknown>, said: RegExp | string) => {
    const attempt = fake.request('project_job', harmonize(fake, patch));
    await (typeof said === 'string' ? assert.rejects(attempt, { message: said }) : assert.rejects(attempt, said));
  };
  await refused({ operation: 'rename' }, /^Unknown change rename: it is one of harmonize, add_input, remove_input, move_pin, instructions$/);
  await refused({ id: 'nope' }, 'That project is not in your list');
  await refused({ digest: '0'.repeat(64) }, CHANGED);
  await refused({ digest: undefined }, 'Open the project again: the change names no version of its file');
  await refused({ digest: 'sha256:short' }, 'Open the project again: the change names no version of its file');
  await refused({ budget_usd: 0 }, BAD_BUDGET);
  await refused({ budget_usd: 101 }, BAD_BUDGET);
  await refused({ step: 'huge' }, 'The version step must be patch, minor or major, not huge');
  await refused({ request: 'x'.repeat(4001) }, 'The request must be at most 4000 characters');
  await refused({ operation: 'add_input', source: 'http://x' }, NOT_A_SOURCE);
  await refused({ operation: 'add_input', source: 'https://a b' }, "An input's address must be an https:// address without spaces");
  await refused({ operation: 'remove_input', input: 'nope' }, 'This project has no input nope');
  await refused({ operation: 'move_pin', input: 'nope' }, 'This project has no input nope');
  await refused({ operation: 'instructions', instructions: [] }, 'Change at least one instruction file');
  await refused({ operation: 'instructions', instructions: [{ path: 'notes.txt', text: '' }] }, 'An instruction file is Markdown: its name ends in .md (notes.txt)');
  assert.deepEqual(await jobsOf(fake), [], 'nothing was started');
  assert.equal(fake.behind.digest('marionette'), digest, 'and the file is as it was');
});

test('Codex is refused before a run, for a change and for a new project', async () => {
  const fake = createTransport('projects');
  fake.behind.settings({ ai: { engine: 'harness', harness: 'codex', budget_usd: 0.5, api_base: '', model: '', api_key_env: 'MURO_API_KEY' }, agent: 'codex' });
  await assert.rejects(fake.request('project_job', harmonize(fake)), { message: NEEDS_CLAUDE });
  await assert.rejects(fake.request('create_project', NEW_PROJECT), { message: NEEDS_CLAUDE });
  assert.deepEqual(await jobsOf(fake), []);
});

test('one AI run goes at a time, an adaptation counts, and the project that is being changed is not edited or deleted', async () => {
  const fake = createTransport('projects');
  const started: any = await fake.request('project_job', harmonize(fake, { request: 'Merge the two review steps.' }));
  assert.match(started.id, /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  assert.deepEqual(
    [started.kind, started.status, started.project_id, started.operation, started.title, started.phase, started.budget_usd, started.file, typeof started.time],
    ['project', 'running', 'marionette', 'harmonize', 'Harmonize again', 'Opening the project', 5, 'D:/Muro/data/projects/marionette.mp', 'number']);
  assert.match(started.log_path, /output\.log$/);
  const second = /^Another AI run is in progress \(Harmonize again\): wait for it to finish, or cancel it in Activity$/;
  await assert.rejects(fake.request('project_job', harmonize(fake)), second);
  await assert.rejects(fake.request('create_project', NEW_PROJECT), second);
  await assert.rejects(fake.request('edit_project', { id: 'marionette', digest: fake.behind.digest('marionette'), name: 'X' }), { message: 'An AI run is changing this project: wait for it to finish' });
  assert.equal((await jobsOf(fake)).length, 1);
  fake.behind.finish();
  const [done] = await jobsOf(fake);
  assert.deepEqual([done.status, done.phase, done.message], ['completed', 'Finished', 'The project was saved. Install it again from its Install step to bring the change to the harnesses']);
  // an adaptation of a plugin is a run too
  await fake.request('adapt', { id: 'commit-helper', harness: 'codex', budget_usd: 2 });
  await assert.rejects(fake.request('project_job', harmonize(fake)), { message: 'Another AI run is in progress (harmonization): wait for it to finish, or cancel it in Activity' });
  fake.behind.finish('failed');
  assert.ok(await fake.request('project_job', harmonize(fake)), 'it goes once the other is over');
});

test('a run that completes writes the file as the factory does: the version, the history, the changelog and a new digest, and the old digest is stale', async () => {
  const fake = createTransport('projects');
  const before: any = await fake.request('project', { id: 'marionette' });
  const oldDigest = before.digest;
  await fake.request('project_job', harmonize(fake));
  assert.equal(fake.behind.digest('marionette'), oldDigest, 'the file is not written while the run goes');
  fake.behind.finish();
  const after: any = await fake.request('project', { id: 'marionette' });
  assert.notEqual(after.digest, oldDigest);
  assert.equal(after.digest, fake.behind.digest('marionette'));
  assert.deepEqual([after.plugin.version, after.project.version], ['0.5.1', '0.5.1']);
  assert.equal(after.history.length, before.history.length + 1);
  assert.deepEqual([after.history[0].id, after.history[0].version, after.history[0].operation, after.history[0].engine, after.history[0].budget_usd], ['marionette-v0.5.1', '0.5.1', 'Harmonize again', 'claude-code', 5]);
  assert.ok(after.changelog.startsWith('# Marionette 0.5.1\n\n- Harmonize again.\n\n## 0.5.0'));
  await assert.rejects(fake.request('project_job', harmonize(fake, { digest: oldDigest })), { message: CHANGED });
  assert.ok(await fake.request('project_job', harmonize(fake)), 'on the digest the answer left it goes');
});

test('each operation does its mechanical part when it completes, and a minor or major step moves the version as asked', async () => {
  const fake = createTransport('projects');
  const go = async (patch: Record<string, unknown>): Promise<any> => {
    await fake.request('project_job', harmonize(fake, patch));
    fake.behind.finish();
    return fake.request('project', { id: 'marionette' });
  };
  let info = await go({ operation: 'add_input', source: 'https://github.com/example/new-skills#skills', step: undefined });
  assert.equal(info.plugin.version, '0.6.0', 'an input added is a minor step by default');
  assert.deepEqual(info.inputs.map((i: any) => i.id), ['taste-skill', 'genoffice', 'superpowers', 'new-skills']);
  info = await go({ operation: 'remove_input', input: 'genoffice', step: undefined });
  assert.equal(info.plugin.version, '0.7.0');
  assert.deepEqual(info.inputs.map((i: any) => i.id), ['taste-skill', 'superpowers', 'new-skills']);
  assert.ok(!info.decisions.some((d: any) => d.source === 'genoffice'), 'what only that input decided leaves with it');
  info = await go({ operation: 'move_pin', input: 'taste-skill', to: 'v2.0.0' });
  assert.equal(info.plugin.version, '0.7.1');
  assert.equal(info.inputs.find((i: any) => i.id === 'taste-skill').release, 'v2.0.0');
  info = await go({ operation: 'move_pin', input: 'taste-skill', to: '' });
  assert.equal(info.inputs.find((i: any) => i.id === 'taste-skill').release, 'v9.9.9', 'empty is the newest release');
  info = await go({ operation: 'instructions', instructions: [{ path: 'house-style.md', text: 'Short.\n' }, { path: 'team/tone.md', text: 'Friendly.' }] });
  assert.deepEqual(info.instructions, [{ path: 'house-style.md', text: 'Short.\n' }, { path: 'team/tone.md', text: 'Friendly.' }]);
  info = await go({ operation: 'harmonize', step: 'major' });
  assert.equal(info.plugin.version, '1.0.0');
  assert.equal(info.history.length, 2 + 6);
  assert.equal(info.history[0].id, 'marionette-v1.0.0');
  // the only input of a project is not removed
  await go({ operation: 'remove_input', input: 'superpowers' });
  await go({ operation: 'remove_input', input: 'new-skills' });
  await assert.rejects(fake.request('project_job', harmonize(fake, { operation: 'remove_input', input: 'taste-skill' })), { message: 'A project needs at least one input: add another before removing taste-skill' });
  // a file to remove that is not there fails the run, and the file is as it was
  const digest = fake.behind.digest('marionette');
  await fake.request('project_job', harmonize(fake, { operation: 'instructions', instructions: [{ path: 'gone.md', text: null }] }));
  fake.behind.finish();
  const [failed] = await jobsOf(fake);
  assert.deepEqual([failed.status, failed.message], ['failed', 'The instruction file gone.md is not in the project. The project file was not changed']);
  assert.equal(fake.behind.digest('marionette'), digest);
});

test('a run ends by itself when a flag says so, a run that failed says why and leaves the file as it was, and a file written meanwhile fails the run', async () => {
  const fake = createTransport('projects');
  const digest = fake.behind.digest('marionette');
  Object.assign(fake.flags, { runEnds: 'failed', runDelay: 5, runMessage: 'The factory build failed' });
  const started: any = await fake.request('project_job', harmonize(fake));
  assert.equal(started.status, 'running', 'the answer that starts it says it goes');
  await later(60);
  const [failed] = await jobsOf(fake);
  assert.deepEqual([failed.id, failed.status, failed.phase, failed.message], [started.id, 'failed', 'Finished', 'The factory build failed. The project file was not changed']);
  assert.equal(fake.behind.digest('marionette'), digest);
  fake.flags.runEnds = 'completed';
  await fake.request('project_job', harmonize(fake));
  await later(60);
  assert.equal((await jobsOf(fake))[0].status, 'completed');
  assert.notEqual(fake.behind.digest('marionette'), digest);
  fake.flags.runEnds = '';
  await fake.request('project_job', harmonize(fake));
  fake.behind.touch('marionette');
  fake.behind.finish();
  const [stale] = await jobsOf(fake);
  assert.deepEqual([stale.status, stale.message], ['failed', `${CHANGED}. The project file was not changed`]);
  await fake.request('project_job', harmonize(fake));
  fake.behind.phase('Building and saving the project');
  assert.equal((await jobsOf(fake))[0].phase, 'Building and saving the project');
});

test('a run is cancelled as the runtime does: the request says so at once and the run ends, unless it holds', async () => {
  const fake = createTransport('projects');
  const digest = fake.behind.digest('marionette');
  const started: any = await fake.request('project_job', harmonize(fake));
  assert.deepEqual(await fake.request('cancel_job', { id: started.id }), { message: 'Cancellation requested; registry remains unchanged until validation completes' });
  const [cancelled] = await jobsOf(fake);
  assert.deepEqual([cancelled.status, cancelled.phase, cancelled.message], ['cancelled', 'Finished', 'Job cancelled. The project file was not changed']);
  assert.equal(fake.behind.digest('marionette'), digest);
  await assert.rejects(fake.request('cancel_job', { id: 'nope' }), { message: 'Job not found' });
  fake.flags.cancelHolds = true;
  const held: any = await fake.request('project_job', harmonize(fake));
  await fake.request('cancel_job', { id: held.id });
  assert.equal((await jobsOf(fake))[0].status, 'running', 'it goes on until it ends');
  fake.behind.finish('cancelled');
  assert.equal((await jobsOf(fake))[0].status, 'cancelled');
});

test('the runs are listed newest first, whatever their kind', async () => {
  const fake = createTransport('projects');
  await fake.request('project_job', harmonize(fake));
  fake.behind.finish();
  const second: any = await fake.request('project_job', harmonize(fake));
  assert.equal((await jobsOf(fake))[0].id, second.id);
  assert.equal((await fake.request('snapshot') as any).jobs.length, 2);
});

test('a new project is refused before the run for what the runtime refuses, listed when its run completes, and never written over a file', async () => {
  const fake = createTransport('projects');
  fake.flags.missingFolders = ['D:/Missing'];
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ slug: 'My Plugin' }, /lowercase letters and digits joined by dashes/], [{ slug: 'marionette' }, /is the project Muro ships/], [{ name: '  ' }, /^The project name is required$/],
    [{ author: '' }, /^The author is required$/], [{ folder: 'relative/folder' }, /^Choose the folder with its full path$/], [{ folder: 'D:/Missing' }, /^The folder is missing: D:\/Missing$/],
    [{ inputs: [] }, /^Add at least one input: a project is made from plugins and skills$/], [{ inputs: [{ source: 'http://github.com/o/r' }] }, /^An input is an https:\/\/ address or the full path/],
    [{ inputs: [{ source: 'D:/Missing' }] }, /^The folder is missing: D:\/Missing$/], [{ inputs: [{ source: 'https://a/b' }, { source: 'https://a/b' }] }, /^The input https:\/\/a\/b is named twice$/],
    [{ budget_usd: 0 }, /^The AI budget must be above 0 and at most 100 USD$/], [{ repository: { url: 'git@github.com:o/r' } }, /^The repository address must be an https:\/\/ address$/],
    [{ request: 'x'.repeat(4001) }, /^The request must be at most 4000 characters$/],
  ];
  for (const [patch, said] of cases) await assert.rejects(fake.request('create_project', { ...NEW_PROJECT, ...patch }), said, JSON.stringify(patch));
  // a file that is there is never written over, whatever the slashes and the case
  fake.flags.existingFiles = ['d:\\projects\\docs-kit.mp'];
  await assert.rejects(fake.request('create_project', NEW_PROJECT), { message: 'D:/Projects/docs-kit.mp already exists: choose another folder or plugin id' });
  fake.flags.existingFiles = [];
  assert.deepEqual(await jobsOf(fake), [], 'no run was started');
  const started: any = await fake.request('create_project', NEW_PROJECT);
  assert.deepEqual([started.operation, started.title, started.project_id, started.phase, started.file, started.budget_usd], ['create', 'New project Docs Kit', 'docs-kit', 'Starting the project', 'D:/Projects/docs-kit.mp', 5]);
  assert.deepEqual(await ids(fake), ['marionette'], 'listed when it ends, not before');
  fake.behind.finish();
  assert.deepEqual(await ids(fake), ['marionette', 'docs-kit']);
  assert.equal((await jobsOf(fake))[0].message, 'The project was created and added to your list. Install it from its Install step');
  const made: any = await fake.request('project', { id: 'docs-kit' });
  assert.deepEqual([made.project.name, made.project.author, made.project.version, made.plugin.version, made.inputs.map((i: any) => i.id), made.history.length], ['Docs Kit', 'me', '0.1.0', '0.1.0', ['docs', 'writing'], 1]);
  assert.match(made.digest, /^[0-9a-f]{64}$/);
  await assert.rejects(fake.request('create_project', NEW_PROJECT), { message: 'D:/Projects/docs-kit.mp already exists: choose another folder or plugin id' }, 'the file of a listed project is a file that is there');
  await assert.rejects(fake.request('create_project', { ...NEW_PROJECT, folder: 'D:/Elsewhere' }), { message: 'A project for docs-kit is already in your list' });
  // a run that failed leaves nothing
  fake.flags.runEnds = 'failed';
  await fake.request('create_project', { ...NEW_PROJECT, slug: 'second', folder: 'D:/Elsewhere' });
  await later(30);
  assert.deepEqual(await ids(fake), ['marionette', 'docs-kit']);
});

test('an edit by hand changes only what it names, on the digest the last write left, and is refused in the factory\'s words', async () => {
  const fake = createTransport('projects');
  const first = fake.behind.digest('marionette');
  const record = { id: 'mine-1', date: '2026-11-21', subjects: [' office-docs '], text: ' Keep the Word output first. ', author: 'you', binding: true };
  const done: any = await fake.request('edit_project', { id: 'marionette', digest: first, name: 'Marionette Plus', repository: null, records: [record], changelog: '# 1.0' });
  assert.deepEqual([done.path, done.digest], ['D:/Muro/data/projects/marionette.mp', fake.behind.digest('marionette')]);
  assert.notEqual(done.digest, first);
  const info: any = await fake.request('project', { id: 'marionette' });
  assert.deepEqual([info.project.name, info.project.repository, info.project.author], ['Marionette Plus', null, 'acaprino']);
  assert.deepEqual(info.records, [{ id: 'mine-1', date: '2026-11-21', subjects: ['office-docs'], text: 'Keep the Word output first.', author: 'you', binding: true }]);
  assert.equal(info.changelog, '# 1.0\n', 'the file ends with a line break');
  await assert.rejects(fake.request('edit_project', { id: 'marionette', digest: first, name: 'Stale' }), { message: CHANGED });
  const second: any = await fake.request('edit_project', { id: 'marionette', digest: done.digest, repository: { url: 'https://github.com/o/r', branch: '', tag_prefix: 'r-v' } });
  assert.notEqual(second.digest, done.digest);
  assert.deepEqual(((await fake.request('project', { id: 'marionette' })) as any).project.repository, { url: 'https://github.com/o/r', branch: 'main', tag_prefix: 'r-v' });
  const digest = second.digest;
  const refused = async (patch: Record<string, unknown>, said: string | RegExp) => {
    const attempt = fake.request('edit_project', { id: 'marionette', digest, ...patch });
    await (typeof said === 'string' ? assert.rejects(attempt, { message: said }) : assert.rejects(attempt, said));
  };
  await refused({}, 'Nothing to change');
  await refused({ name: 'two\nlines' }, /^The project name must be one line of at most 200 characters$/);
  await refused({ name: '  ' }, 'The project name is required');
  await refused({ author: '' }, 'The author is required');
  await refused({ repository: { url: 'ftp://x' } }, 'The repository address must be an https:// address');
  await refused({ records: 'no' }, 'The records must be a list');
  await refused({ records: [{ ...record, date: '2026-02-30' }] }, 'Record mine-1 needs a real date');
  await refused({ records: [record, record] }, 'Two records have the id mine-1');
  await refused({ records: [{ ...record, author: 'bot' }] }, 'Record mine-1: the author is muro or you');
  await refused({ changelog: 5 }, 'The changelog must be text');
  await assert.rejects(fake.request('edit_project', { id: 'marionette', name: 'X' }), { message: 'Open the project again: the edit names no version of its file' });
  await assert.rejects(fake.request('edit_project', { id: 'nope', digest, name: 'X' }), { message: 'That project is not in your list' });
  assert.equal(fake.behind.digest('marionette'), digest, 'a refused edit writes nothing');
  assert.deepEqual(((await fake.request('edit_project', { id: 'marionette', digest, records: [] })) as any).path, 'D:/Muro/data/projects/marionette.mp');
  assert.deepEqual(((await fake.request('project', { id: 'marionette' })) as any).records, [], 'every record deleted');
});

test('a project is deleted with the registry revision the page read; the shipped one and one that is being changed are not', async () => {
  const fake = createTransport('projects');
  fake.flags.pickPath = 'D:/Notes/Notes.mp';
  await fake.request('open_project', { path: 'D:/Notes/Notes.mp' });
  assert.deepEqual(await ids(fake), ['marionette', 'notes']);
  const revision = ((await fake.request('snapshot')) as any).registry.revision;
  await assert.rejects(fake.request('delete_project', { id: 'marionette', revision }), { message: 'The project Muro ships cannot be deleted' });
  await assert.rejects(fake.request('delete_project', { id: 'nope', revision }), { message: 'That project is not in your list' });
  await assert.rejects(fake.request('delete_project', { id: 'notes', revision: revision + 5 }), { message: 'Registry revision changed; refresh before saving' });
  await assert.rejects(fake.request('delete_project', { id: 'notes' }), { message: 'Registry revision changed; refresh before saving' });
  await fake.request('project_job', harmonize(fake, { id: 'notes', digest: fake.behind.digest('notes') }));
  await assert.rejects(fake.request('delete_project', { id: 'notes', revision }), { message: 'An AI run is changing this project: wait for it to finish, or cancel it' });
  fake.behind.finish('cancelled');
  const saved: any = await fake.request('delete_project', { id: 'notes', revision });
  assert.equal(saved.registry.revision, revision + 1, 'the answer is the registry, saved');
  assert.deepEqual(await ids(fake), ['marionette']);
  assert.ok(await fake.request('create_project', { ...NEW_PROJECT, slug: 'notes', folder: 'D:/Notes' }), 'its file is gone: a new project may take the name');
});

test('the update check says which input is behind, and fails as the upstream does; the folder dialog answers a folder, null or "unknown"', async () => {
  const fake = createTransport('projects');
  const report: any = await fake.request('project_updates', { id: 'marionette' });
  assert.equal(report.id, 'marionette');
  assert.equal(report.digest, fake.behind.digest('marionette'), 'the check names the file it was made on');
  assert.deepEqual(report.inputs.map((i: any) => i.status), ['behind', 'current', 'current']);
  assert.deepEqual([report.inputs[0].id, report.inputs[0].upstream], ['taste-skill', 'v9.9.9']);
  await assert.rejects(fake.request('project_updates', { id: 'nope' }), { message: 'That project is not in your list' });
  fake.flags.updatesError = 'Could not reach github.com';
  await assert.rejects(fake.request('project_updates', { id: 'marionette' }), { message: 'Could not reach github.com' });
  assert.deepEqual(await fake.request('pick_folder'), { path: 'D:/Projects' });
  fake.flags.pickFolder = null;
  assert.deepEqual(await fake.request('pick_folder'), { path: null }, 'a dialog closed without a folder');
  fake.flags.noShellActions = true;
  await assert.rejects(fake.request('pick_folder'), { message: 'Unknown registry action: pick_folder' });
});
