// Plan 2, Task 7: step 2 of the project page, Harmonize: the state strip and the four read-only views (decision records, choices by part, history, prompts).
// Nothing here writes a project: no Edit, no Add a record, no Harmonize button (plan 3).
import test from 'node:test';
import assert from 'node:assert/strict';
import type { ViewState, ProjectInfo, ProjectDecision, ProjectRecord, ProjectRun } from '../src/types.ts';
import type { App } from '../src/context.ts';
import { modules } from '../src/views.ts';
import * as projects from '../src/pages/projects.ts';
import * as harmonize from '../src/pages/project/harmonize.ts';
import { blankProjects, fresh, STATE } from '../src/pages/project/state.ts';

process.env.TZ = 'UTC';

// ---------- fixtures ----------
const became = (capability = 0, always = 0, hook = 0, dropped = 0) => ({ capability, 'always-on': always, hook, dropped });
const decision = (source: string, content: string, form: ProjectDecision['form'], targets: string[], reason: string): ProjectDecision => ({ source, content, form, targets, reason });
const DECISIONS: ProjectDecision[] = [
  decision('taste-skill', 'SKILL.md', 'capability', ['design-taste'], 'Its method is a design capability.'),
  decision('taste-skill', 'references/anti-slop.md', 'capability', ['design-taste', 'design-review'], 'Read by the capability on demand.'),
  decision('taste-skill', 'README.md', 'dropped', [], 'Describes the repository, not a method.'),
  decision('genoffice', 'skills/docx', 'capability', ['office-docs'], 'Produces Word files.'),
  decision('genoffice', 'hooks/guard.json', 'hook', ['office-docs'], 'The source declares it for every session.'),
  decision('superpowers', 'skills/using-superpowers', 'always-on', [], 'Acts in every session.'),
  decision('custom-instructions/house-style.md', 'house-style.md', 'always-on', [], 'The owner\'s own words.'),
];
const record = (id: string, date: string, subjects: string[], text: string, author: ProjectRecord['author'] = 'muro', binding = false): ProjectRecord => ({ id, date, subjects, text, author, binding });
const RECORDS = [
  record('r1', '2026-11-10', ['design-taste', 'ai-design-skills'], 'One owner per output.'),
  record('r2', '2026-11-12', [], 'Documents keep the source\'s limits.', 'you', true),
  record('r3', '2026-11-19', ['office-docs'], 'Never <b>bold</b> & "quoted"', 'muro', true),
];
const run = (id: string, time: string, version: string, over: Partial<ProjectRun> = {}): ProjectRun => ({ id, time, version, status: 'completed', budget_usd: null, engine: null, pins: {}, changelog: `Changes of ${version}.`, ...over });
// Deliberately not in order: the newest run is in the middle.
const RUNS = [
  run('run-1', '2026-11-10T09:00:00Z', '0.4.0', { changelog: 'First harmonization.' }),
  run('run-3', '2026-11-18T12:00:00Z', '0.5.0', { budget_usd: 2, engine: 'claude-code', changelog: 'Moved taste-skill to v1.2.0.\nThe Figma step works in any tool.' }),
  run('run-2', '2026-11-12T10:30:00Z', '0.4.1', { status: 'cancelled', budget_usd: 0.5, engine: 'codex', changelog: '' }),
];
const PROMPTS = [['intake.md', '# Intake\n\nRead <everything> first & "decide".'], ['harmonizer.md', '# Harmonizer'], ['delivery.md', '# Delivery'], ['classify.md', '# Classify'], ['custom.md', '# Own']].map(([file, text]) => ({ file, text }));
const info = (over: Partial<ProjectInfo> = {}): ProjectInfo => ({
  project: { schema: 1, name: 'Marionette', slug: 'marionette', version: '0.5.0', author: 'acaprino', created: '2026-11-10T09:00:00Z', changed: '2026-11-18T12:00:00Z', repository: { url: 'https://github.com/acaprino/marionette', branch: 'main', tag_prefix: 'marionette-v' }, builtin: true },
  plugin: { name: 'Marionette', slug: 'marionette', version: '0.5.0', description: 'One plugin' },
  inputs: [
    { id: 'taste-skill', url: 'https://github.com/example/taste-skill', pin: 'release', release: 'v1.2.0', commit: 'abcdef1234567890', license: 'MIT', paths: ['skills'], became: became(2, 0, 0, 1) },
    { id: 'genoffice', url: 'https://github.com/example/genoffice', pin: 'head', release: null, commit: '0123456789abcdef', license: 'Apache-2.0', paths: ['skills'], became: became(1, 0, 1, 0) },
    { id: 'superpowers', url: 'https://github.com/example/superpowers', pin: 'static', release: null, commit: 'fedcba9876543210', license: 'MIT', paths: ['skills'], became: became(0, 1, 0, 0) },
  ],
  decisions: DECISIONS, records: RECORDS, history: RUNS, changelog: '## 0.5.0\n', prompts: PROMPTS,
  graph: { entries: [], capabilities: [{ id: 'design-taste', title: 'Design taste' }, { id: 'design-review', title: 'Design review' }, { id: 'office-docs', title: 'Office documents' }], examples: [] },
  files: [], digest: 'sha256:aaa', ...over,
});
const blank = (over: Partial<ViewState> = {}): ViewState => ({ page: 'projects', snapshot: null, discovered: [], discovering: false, plan: null, checking: false, applying: null, review: null, query: '', filter: 'all', afilter: 'all', busy: null, error: null, checkErrors: [], discoveryError: null, maintenance: null, autostart: null, setup: null, projects: blankProjects(), project: null, ...over });
/** The page open on step 2 with the given view and filters, and the project read. */
const opened = (view: 'records' | 'choices' | 'history' | 'prompts' = 'records', filters: { dsrc?: string; dform?: string } = {}, held = info()): ViewState => {
  const state = blank({ project: { ...fresh('marionette'), step: 'harmonize', view, ...filters } });
  state.projects = { ...blankProjects(), list: [], info: held, infoId: 'marionette' };
  return state;
};
const panel = (state: ViewState, held = state.projects.info!) => harmonize.view(state, held);
const words = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const items = (html: string) => [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => words(m[1]));
function fakeApp(state: ViewState) {
  const dialogs: { html: string; kind?: string }[] = [];
  let renders = 0;
  const app = { state, render: () => { renders++; }, openDialog: (html: string, kind?: string) => { dialogs.push({ html, kind }); return {} as HTMLDialogElement; }, closeDialog: () => {}, notify: () => {} } as unknown as App;
  return { app, dialogs, renders: () => renders };
}
const control = (name: string, value: string) => ({ name, value }) as unknown as HTMLInputElement;
const WRITES = /\b(Edit|Add a record|Add input|Harmonize|Harmonize again|Move pin|Cancel)\b/;

// ---------- the state strip ----------
test('the strip says Harmonized, when the last run was, its version and its agent', () => {
  const html = panel(opened());
  const strip = html.match(/<section class="im-summary"[^>]* aria-label="Harmonization state">[\s\S]*?<\/section>/)![0];
  assert.match(strip, /class="im-summary" data-im-tone="ok"/);
  assert.match(words(strip), /^Harmonized Last run 18 Nov 2026, 12:00 Version 0\.5\.0 Agent Claude Code$/, 'the newest run, wherever it is in the file');
});
test('the strip leaves the agent out when the last run names none, and says never when there is no run', () => {
  const noAgent = words(panel(opened('records', {}, info({ history: [run('r', '2026-11-18T12:00:00Z', '0.5.0')] }))).match(/<section class="im-summary[\s\S]*?<\/section>/)![0]);
  assert.equal(noAgent, 'Harmonized Last run 18 Nov 2026, 12:00 Version 0.5.0');
  const none = words(panel(opened('records', {}, info({ history: [] }))).match(/<section class="im-summary[\s\S]*?<\/section>/)![0]);
  assert.equal(none, 'Harmonized Last run never Version 0.5.0');
});
test('an agent the page has no name for is shown as it came, a time that is no date too', () => {
  const html = panel(opened('records', {}, info({ history: [run('r', 'sometime', '0.5.0', { engine: '<local>' })] })));
  assert.match(words(html.match(/<section class="im-summary[\s\S]*?<\/section>/)![0]), /Last run sometime .* Agent <local>/);
  assert.match(html, /&lt;local&gt;/, 'escaped');
});
test('step 2 offers Harmonize again, records to add and edit and the changelog to edit, and none of them while an AI run changes the project', () => {
  assert.match(panel(opened('records')), /data-action="harmonize-again"[^>]*>.*<span>Harmonize again…<\/span>/);
  assert.match(panel(opened('records')), /data-action="add-record"/);
  assert.equal([...panel(opened('records')).matchAll(/data-action="edit-record"/g)].length, 3, 'one Edit per record');
  assert.match(panel(opened('history')), /data-action="edit-changelog"/);
  for (const view of ['records', 'choices', 'history', 'prompts'] as const) {
    const state = opened(view);
    state.snapshot = { ...state.snapshot!, jobs: [{ id: 'run-1', kind: 'project', project_id: state.project!.id, operation: 'harmonize', title: 'Harmonize again', status: 'running', phase: 'AI intake and harmonization', budget_usd: 5, log_path: '', message: '', time: '1700000000' }] };
    const html = panel(state);
    assert.doesNotMatch(html, /data-action="(harmonize-again|add-record|edit-record|edit-changelog)"/, view);
    assert.match(words(html), /^Changing/, `${view}: the strip says the project is changing`);
  }
});

// ---------- the four views ----------
test('the views are a labelled radio group named hview, with their counts, and the current one is checked', () => {
  const html = panel(opened('choices'));
  const group = html.match(/<div class="im-seg im-seg--native" role="radiogroup" aria-label="Harmonization views">[\s\S]*?<\/div>/)![0];
  assert.deepEqual([...group.matchAll(/<input type="radio" name="hview" value="(\w+)"( checked)?[^>]*><span>([^<]+)<\/span>/g)].map(m => [m[1], !!m[2], m[3]]), [
    ['records', false, 'Decision records · 3'], ['choices', true, 'Choices by part · 7'], ['history', false, 'History · 3'], ['prompts', false, 'Prompts'],
  ]);
});
test('a view with nothing in it has no count, except History', () => {
  const html = panel(opened('records', {}, info({ records: [], decisions: [], history: [] })));
  assert.match(html, /<span>Decision records<\/span>/);
  assert.match(html, /<span>Choices by part<\/span>/);
  assert.match(html, /<span>History · 0<\/span>/);
});
test('a view the state does not know shows the records', () => {
  const state = opened(); state.project!.view = 'nonsense' as never;
  const html = panel(state);
  assert.match(html, /value="records" checked/);
  assert.match(words(html), /One owner per output\./);
});

// ---------- decision records ----------
test('Decision records: who wrote each, its date, its subjects and its text, in the file\'s order', () => {
  const html = panel(opened('records'));
  assert.match(words(html), /Why the project is the way it is\. Muro writes a record when a harmonization takes a decision that shapes the project\. A binding record is a rule the next harmonization has to follow\./);
  assert.deepEqual(items(html.slice(html.indexOf('<ul class="im-panel im-surface im-stack-list im-decision-list" data-im-surface="sheet">'))), [
    'By Muro 2026-11-10 · design-taste, ai-design-skills One owner per output. Edit',
    'Yours · binding 2026-11-12 Documents keep the source\'s limits. Edit',
    'By Muro · binding 2026-11-19 · office-docs Never <b>bold</b> & "quoted" Edit',
  ]);
  assert.match(html, /<span class="im-chip" data-im-tone="accent">Yours · binding<\/span>/);
  assert.match(html, /<span class="im-chip" data-im-tone="">By Muro<\/span>/, 'a record of Muro that does not bind is not highlighted');
});
test('Decision records: every value is escaped', () => {
  const html = panel(opened('records'));
  assert.match(html, /Never &lt;b&gt;bold&lt;\/b&gt; &amp; &quot;quoted&quot;/);
  assert.doesNotMatch(html, /<b>bold<\/b>/);
});
test('Decision records: none yet is said, not an empty list', () => {
  const html = panel(opened('records', {}, info({ records: [] })));
  assert.match(words(html), /No record yet/);
  assert.doesNotMatch(html, /<ul class="im-panel im-surface im-stack-list im-decision-list" data-im-surface="sheet">/);
});

// ---------- choices by part ----------
test('Choices by part: each decision with its form, its source, the part, the reason and its capabilities as links', () => {
  const html = panel(opened('choices'));
  const list = html.slice(html.indexOf('<ul class="im-panel im-surface im-stack-list im-decision-list" data-im-surface="sheet">'));
  assert.deepEqual(items(list), [
    'Capability taste-skill SKILL.md Its method is a design capability. design-taste',
    'Capability taste-skill references/anti-slop.md Read by the capability on demand. design-taste design-review',
    'Dropped taste-skill README.md Describes the repository, not a method.',
    'Capability genoffice skills/docx Produces Word files. office-docs',
    'Hook genoffice hooks/guard.json The source declares it for every session. office-docs',
    'Always on superpowers skills/using-superpowers Acts in every session.',
    'Always on custom-instructions/house-style.md house-style.md The owner\'s own words.',
  ]);
  assert.match(words(html), /What each part of each input became, and why\. 7 of 7/);
  assert.deepEqual([...list.matchAll(/<span class="im-chip" data-im-tone="(\w*)">(Capability|Always on|Hook|Dropped)<\/span>/g)].map(m => [m[2], m[1]]).slice(0, 4), [['Capability', 'accent'], ['Capability', 'accent'], ['Dropped', ''], ['Capability', 'accent']]);
  assert.match(list, /<span class="im-chip" data-im-tone="warn">Always on<\/span>/);
  assert.match(list, /<span class="im-chip" data-im-tone="ok">Hook<\/span>/);
});
test('Choices by part: a capability is opened through the action of the graph, and is named for assistive tech', () => {
  const html = panel(opened('choices'));
  assert.match(html, /<button type="button" class="im-chip" data-im-tone="accent" data-action="open-capability" data-id="design-review" aria-label="Open capability design-review"><svg class="im-icon"[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/svg>design-review<\/button>/);
  assert.equal(html.match(/data-action="open-capability"/g)?.length, 5, 'one link for each target of each decision');
});
test('Choices by part: the input filter is a labelled select with every input, and the form filter a labelled radio group', () => {
  const html = panel(opened('choices'));
  const select = html.match(/<select name="dsrc" aria-label="Filter by input">([\s\S]*?)<\/select>/)![1];
  assert.deepEqual([...select.matchAll(/<option value="([^"]*)"([^>]*)>([^<]*)<\/option>/g)].map(m=>[m[1],/\bselected\b/.test(m[2]),m[3]]), [
    ['',true,'All inputs'],['taste-skill',false,'taste-skill'],['genoffice',false,'genoffice'],['superpowers',false,'superpowers'],
  ]);
  const group = html.match(/<div class="im-seg im-seg--native" role="radiogroup" aria-label="Filter by form">[\s\S]*?<\/div>/)![0];
  assert.deepEqual([...group.matchAll(/name="dform" value="([\w-]+)"( checked)?[^>]*><span>([^<]+)</g)].map(m => [m[1], !!m[2], m[3]]), [
    ['all', true, 'All'], ['capability', false, 'Capability'], ['always-on', false, 'Always on'], ['hook', false, 'Hook'], ['dropped', false, 'Dropped'],
  ]);
});
test('Choices by part: one input only', () => {
  const html = panel(opened('choices', { dsrc: 'genoffice' }));
  assert.match(html, /<option value="genoffice" selected>/);
  assert.deepEqual(items(html.slice(html.indexOf('<ul class="im-panel im-surface im-stack-list im-decision-list" data-im-surface="sheet">'))).map(t => t.split(' ').slice(0, 3).join(' ')), ['Capability genoffice skills/docx', 'Hook genoffice hooks/guard.json']);
  assert.match(words(html), /2 of 7/);
});
test('Choices by part: one form only, and both filters together', () => {
  const byForm = items(panel(opened('choices', { dform: 'always-on' })).split('<ul class="im-panel im-surface im-stack-list im-decision-list" data-im-surface="sheet">')[1]).map(t => t.split(' ').slice(0, 4).join(' '));
  assert.deepEqual(byForm, ['Always on superpowers skills/using-superpowers', 'Always on custom-instructions/house-style.md house-style.md']);
  const both = panel(opened('choices', { dsrc: 'taste-skill', dform: 'capability' }));
  assert.match(both, /value="capability" checked/);
  assert.equal(items(both.split('<ul class="im-panel im-surface im-stack-list im-decision-list" data-im-surface="sheet">')[1]).length, 2);
  assert.match(words(both), /2 of 7/);
});
test('Choices by part: a filter that leaves nothing says so and keeps the filters', () => {
  const html = panel(opened('choices', { dsrc: 'superpowers', dform: 'hook' }));
  assert.match(words(html), /No choice matches this filter\./);
  assert.match(words(html), /0 of 7/);
  assert.doesNotMatch(html, /<ul class="im-panel im-surface im-stack-list im-decision-list" data-im-surface="sheet">/);
  assert.match(html, /<select name="dsrc"/, 'the person can change the filter');
});
test('Choices by part: a filter for an input the project does not have means all inputs, and so does an unknown form', () => {
  const html = panel(opened('choices', { dsrc: 'vanished', dform: 'nonsense' }));
  assert.match(words(html), /7 of 7/);
  assert.deepEqual([...html.matchAll(/<option value="([^"]*)"[^>]*selected/g)].map(m=>m[1]), [''], 'All inputs is selected');
  assert.match(html, /name="dform" value="all" checked/);
});
test('Choices by part: a decision of a custom instruction is in "All inputs" and not under an input', () => {
  assert.match(panel(opened('choices')), /house-style\.md/);
  assert.doesNotMatch(panel(opened('choices', { dsrc: 'taste-skill' })), /house-style\.md/);
});
test('Choices by part: nothing decided yet is said, with no filter to use', () => {
  const html = panel(opened('choices', {}, info({ decisions: [] })));
  assert.match(words(html), /No choices yet/);
  assert.doesNotMatch(html, /<select|name="dform"/);
});
test('Choices by part: every value is escaped', () => {
  const html = panel(opened('choices', {}, info({ decisions: [decision('<src>', '"a" & <u>', 'capability', ['<cap>'], '<i>why</i>')], inputs: [{ ...info().inputs[0], id: '<src>' }] })));
  for (const raw of ['<src>', '<u>', '<i>', '<cap>']) assert.equal(html.includes(raw), false, raw);
  assert.match(html, /&lt;src&gt;/);
  assert.match(html, /data-id="&lt;cap&gt;"/);
});

// ---------- history ----------
test('History: one row a run, newest first, with the version, its tag, the changelog, the result, the budget and the engine', () => {
  const html = panel(opened('history'));
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].slice(1).map(m => words(m[1]));
  assert.deepEqual(rows, [
    '18 Nov 2026, 12:00 0.5.0 current marionette-v0.5.0 Moved taste-skill to v1.2.0. The Figma step works in any tool. Built and validated $2.00 Claude Code',
    '12 Nov 2026, 10:30 0.4.1 marionette-v0.4.1 — Cancelled $0.50 Codex',
    '10 Nov 2026, 09:00 0.4.0 marionette-v0.4.0 First harmonization. Built and validated — —',
  ]);
  assert.deepEqual([...html.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map(m => m[1]), ['When', 'Version', 'Changelog', 'Result', 'Budget', 'Engine']);
});
test('History: the changelog keeps its lines, and the results have their own tones', () => {
  const html = panel(opened('history', {}, info({ history: [...RUNS, run('run-4', '2026-11-20T08:00:00Z', '0.5.1', { status: 'failed' })] })));
  assert.match(html, /<td class="im-log-note">Moved taste-skill to v1\.2\.0\.\nThe Figma step works in any tool\.<\/td>/);
  assert.match(html, /<span class="im-chip" data-im-tone="ok">Built and validated<\/span>/);
  assert.match(html, /<span class="im-chip" data-im-tone="">Cancelled<\/span>/);
  assert.match(html, /<span class="im-chip" data-im-tone="err">Failed<\/span>/);
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].slice(1).map(m => words(m[1]));
  assert.equal(rows[0], '20 Nov 2026, 08:00 0.5.1 marionette-v0.5.1 Changes of 0.5.1. Failed — —', 'a newer run that failed is not the current one');
  assert.match(rows[1], /^18 Nov 2026, 12:00 0\.5\.0 current /);
});
test('History: current marks the completed run of the plugin\'s version, once', () => {
  const html = panel(opened('history', {}, info({ history: [run('a', '2026-11-18T12:00:00Z', '0.5.0'), run('b', '2026-11-17T12:00:00Z', '0.5.0'), run('c', '2026-11-19T12:00:00Z', '0.5.0', { status: 'cancelled' })] })));
  assert.equal(html.match(/>current</g)?.length, 1);
  assert.match(words(html.split('<tbody>')[1].split('</tr>')[1]), /^18 Nov 2026, 12:00 0\.5\.0 current/, 'the newest completed one, not the cancelled run after it');
});
test('History: the tag comes from the repository\'s tag prefix, and a project with no repository has no tag', () => {
  const prefixed = panel(opened('history', {}, info({ project: { ...info().project, repository: { url: 'https://example.com/x', branch: 'main', tag_prefix: 'v' } } })));
  assert.match(words(prefixed), /0\.5\.0 current v0\.5\.0/);
  const local = panel(opened('history', {}, info({ project: { ...info().project, repository: null } })));
  assert.doesNotMatch(words(local), /marionette-v|current v0/);
  assert.match(words(local), /0\.5\.0 current Moved taste-skill/);
});
test('History: the table is a labelled, keyboard-scrollable region, and every value is escaped', () => {
  const html = panel(opened('history', {}, info({ history: [run('x', '2026-11-18T12:00:00Z', '<0.5>', { changelog: '<img src=x>', engine: '<e>' })] })));
  assert.match(html, /<div class="im-panel im-surface im-table-scroll" data-im-surface="sheet" role="region" aria-label="Runs" tabindex="0">/);
  assert.equal(/<img|<0\.5>|<e>/.test(html), false);
  assert.match(html, /&lt;img src=x&gt;/);
});
test('History: no run yet is said', () => {
  const html = panel(opened('history', {}, info({ history: [] })));
  assert.match(words(html), /No run yet/);
  assert.doesNotMatch(html, /<table/);
});

// ---------- prompts ----------
test('Prompts: each file with what it is for, and an Open that is named for its file', () => {
  const html = panel(opened('prompts'));
  assert.deepEqual(items(html), [
    'intake.md Reads the inputs, classifies what they do and extracts capabilities with their provenance. Open',
    'harmonizer.md Merges overlapping roles and defines alternatives and dependencies. Open',
    'delivery.md Decides the form each part takes: capability, always on, hook or dropped. Open',
    'classify.md How a harness picks capabilities for a request, at run time. Open',
    'custom.md Open',
  ]);
  assert.match(html, /<button type="button" class="im-btn im-btn--sm" data-action="harmonize-prompt" data-id="intake\.md" aria-label="Open intake\.md"><span>Open<\/span><\/button>/);
});
test('Prompts: none is said', () => {
  assert.match(words(panel(opened('prompts', {}, info({ prompts: [] })))), /No prompt/);
});
test('Open shows the prompt, whole, in a sheet named for its file; the text is escaped and can be reached with the keyboard', async () => {
  const { app, dialogs } = fakeApp(opened('prompts'));
  await harmonize.actions['harmonize-prompt'](app, { id: 'intake.md' } as unknown as DOMStringMap, {} as HTMLElement);
  assert.equal(dialogs.length, 1);
  assert.equal(dialogs[0].kind, 'sheet');
  const html = dialogs[0].html;
  assert.match(html, /<h2 id="dlg-title">intake\.md<\/h2>/, 'the heading names the dialog');
  assert.match(html, /Reads the inputs, classifies what they do/);
  assert.match(html, /data-close/, 'a way to close it');
  assert.match(html, /<pre class="im-code-view" tabindex="0" aria-label="Text of intake\.md"># Intake\n\nRead &lt;everything&gt; first &amp; &quot;decide&quot;\.<\/pre>/);
  assert.equal(html.includes('<everything>'), false);
});
test('Open for a prompt the project does not hold, or with no prompt named, opens nothing', async () => {
  const { app, dialogs } = fakeApp(opened('prompts'));
  await harmonize.actions['harmonize-prompt'](app, { id: 'vanished.md' } as unknown as DOMStringMap, {} as HTMLElement);
  await harmonize.actions['harmonize-prompt'](app, {} as unknown as DOMStringMap, {} as HTMLElement);
  assert.equal(dialogs.length, 0);
});
test('Open reads the prompts of the project that is open, not of one read before', async () => {
  const state = opened('prompts'); state.projects.infoId = 'other';
  const { app, dialogs } = fakeApp(state);
  await harmonize.actions['harmonize-prompt'](app, { id: 'intake.md' } as unknown as DOMStringMap, {} as HTMLElement);
  assert.equal(dialogs.length, 0);
});

// ---------- events ----------
test('a view chosen, an input chosen and a form chosen are kept in the state and painted again', () => {
  const state = opened('records'), { app, renders } = fakeApp(state);
  assert.equal(harmonize.change!(app, control('hview', 'choices')), true);
  assert.equal(harmonize.change!(app, control('dsrc', 'genoffice')), true);
  assert.equal(harmonize.change!(app, control('dform', 'hook')), true);
  assert.deepEqual({ view: state.project!.view, dsrc: state.project!.dsrc, dform: state.project!.dform }, { view: 'choices', dsrc: 'genoffice', dform: 'hook' });
  assert.equal(renders(), 3);
  assert.equal(harmonize.change!(app, control('dsrc', '')), true, 'All inputs');
  assert.equal(state.project!.dsrc, '');
});
test('a control that is not step 2\'s, a view that does not exist and a closed project are not handled', () => {
  const state = opened('records'), { app, renders } = fakeApp(state);
  assert.equal(harmonize.change!(app, control('interval', '60')), false);
  assert.equal(harmonize.change!(app, control('hview', 'nonsense')), false);
  assert.equal(state.project!.view, 'records');
  assert.equal(renders(), 0);
  state.project = null;
  assert.equal(harmonize.change!(app, control('hview', 'choices')), false);
});
test('the page paints what the events kept: choose a view, then filter it', () => {
  const state = opened('records'), { app } = fakeApp(state);
  harmonize.change!(app, control('hview', 'choices'));
  harmonize.change!(app, control('dsrc', 'superpowers'));
  const html = projects.view(state);
  assert.match(html, /id="step-panel"/);
  assert.match(words(html), /What each part of each input became, and why\. 1 of 7/);
  assert.match(html, /<option value="superpowers" selected>/);
});

// ---------- in the page ----------
test('the page puts the step in its tab panel, and the tab still says Harmonized', () => {
  const html = projects.view(opened('records'));
  assert.match(html, /<div role="tabpanel" id="step-panel" aria-labelledby="step-tab-harmonize"><section class="im-summary" data-im-tone="ok"/);
  assert.match(html, /id="step-tab-harmonize" aria-selected="true"[^>]*>[\s\S]*?<small>Harmonized<\/small>/);
  assert.doesNotMatch(html, /Coming in this version/);
});
test('the state of the harmonization is one value: the page\'s head, its tab and the strip of the step all read it', () => {
  const before = { ...STATE };
  Object.assign(STATE, { label: 'Waiting', tone: 'warn' });
  try {
    const html = projects.view(opened('records'));
    assert.match(html, /<span class="im-chip" data-im-tone="warn">Waiting<\/span>/, 'the head');
    assert.match(html, /id="step-tab-harmonize"[^>]*>[\s\S]*?<small>Waiting<\/small>/, 'the tab');
    assert.match(html, /<section class="im-summary" data-im-tone="warn" aria-label="Harmonization state"><span class="im-summary-icon">[\s\S]*?<strong>Waiting<\/strong>/, 'the strip');
    assert.doesNotMatch(html, /Harmonized/, 'no second copy of the word');
  } finally { Object.assign(STATE, before); }
});
test('every action of the step is named harmonize-, and has one owner in the app', () => {
  assert.deepEqual(Object.keys(harmonize.actions), ['harmonize-prompt']);
  const names = Object.values(modules).flatMap(m => Object.keys(m.actions));
  assert.equal(new Set(names).size, names.length, 'no name is declared twice');
  assert.ok('harmonize-prompt' in modules.projects.actions);
});
test('what an input became opens its choices here, filtered to that input', async () => {
  const state = opened('records'), { app } = fakeApp(state);
  await modules.projects.actions['decisions-of'](app, { id: 'genoffice' } as unknown as DOMStringMap, {} as HTMLElement);
  assert.deepEqual({ step: state.project!.step, view: state.project!.view, dsrc: state.project!.dsrc, dform: state.project!.dform }, { step: 'harmonize', view: 'choices', dsrc: 'genoffice', dform: 'all' });
  assert.match(words(projects.view(state)), /What each part of each input became, and why\. 2 of 7/);
});
test('the page forwards the events of step 2 to it only while a project is open on the Projects page', () => {
  const state = opened('records'), { app } = fakeApp(state);
  assert.equal(projects.change(app, control('hview', 'history')), true);
  assert.equal(state.project!.view, 'history');
  state.page = 'sync';
  assert.equal(projects.change(app, control('hview', 'prompts')), false);
  assert.equal(state.project!.view, 'history');
});
