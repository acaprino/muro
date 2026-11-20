// Task 6 (plan 2): the Projects tab, the list and the project page with its steps 1 (Inputs) and 4 (Install), on the fake transport.
// Tasks 7 and 8 add their own sections below, under their own headings: the steps they build (Harmonize, Graph & simulator).
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Snapshot, Target, Plugin, Plan, ViewState, ProjectSummary, ProjectInfo } from '../src/types.ts';
import type { App } from '../src/context.ts';
import { frame, modules } from '../src/views.ts';
import * as projects from '../src/pages/projects.ts';
import * as inputs from '../src/pages/project/inputs.ts';
import * as install from '../src/pages/project/install.ts';
import * as graph from '../src/pages/project/graph.ts';
import { STEPS, blankProjects, fresh, recall, remember } from '../src/pages/project/state.ts';
import { createTransport } from './fake-transport.js';

// ---------- fixtures ----------
const target = (id: string, harness: string, name: string, extra: Partial<Target> = {}): Target => ({ id, harness, name, root: `D:/config/${harness}`, executable: harness, exclusive: false, enabled: true, ...extra });
const claude = target('t1', 'claude-code', 'Claude Code'), codex = target('t2', 'codex', 'Codex');
const build = (harness: string, version: string) => ({ harness, path: `D:/Muro/data/artifacts/${harness}-${version}`, version, origin: 'muro' as const });
const registryPlugin = (id: string, name: string, targets: string[], distributions: Plugin['distributions'], extra: Partial<Plugin> = {}): Plugin => ({ id, name, source: `github.com/example/${id}`, policy: 'stable', pinned_version: '', targets, distributions, upstream_version: 'v' + (distributions[0]?.version ?? ''), ...extra });
const snapshot = (over: { plugins?: Plugin[]; targets?: Target[]; installed?: Record<string, { id: string; registry_id?: string; name: string; version: string }[]>; sync?: Partial<Snapshot['sync']> } = {}): Snapshot => {
  const targets = over.targets ?? [claude, codex];
  return {
    registry: { schema: 1, revision: 1, plugins: over.plugins ?? [], targets, settings: { auto_sync: false, interval_minutes: 60, close_to_tray: true, agent: 'claude-code', python: 'python', factory_path: '' } },
    inventory: targets.map(t => ({ target_id: t.id, complete: true, supported: true, error: null, plugins: (over.installed?.[t.id] ?? []).map(i => ({ ...i, path: `D:/plugins/${i.id}`, managed: !!i.registry_id })) })),
    activity: [], sync: { last_check: null, last_sync: null, revision: null, pending: null, blockers: null, errors: null, targets: {}, ...over.sync },
  };
};
const meta = (over: Partial<ProjectInfo['project']> = {}): ProjectInfo['project'] => ({ schema: 1, name: 'Marionette', slug: 'marionette', version: '0.5.0', author: 'acaprino', created: '2026-11-10T09:00:00Z', changed: '2026-11-18T12:00:00Z', repository: { url: 'https://github.com/acaprino/marionette', branch: 'main', tag_prefix: 'marionette-v' }, builtin: true, ...over });
const summary = (over: Partial<ProjectSummary> = {}): ProjectSummary => ({ id: 'marionette', path: 'D:/Muro/data/projects/marionette.mp', included: true, project: meta(), plugin: { name: 'Marionette', slug: 'marionette', version: '0.5.0' }, inputs: 3, capabilities: 37, entries: 15, examples: 26, records: 12, runs: 4, digest: 'sha256:aaa', ...over });
const became = (capability = 0, always = 0, hook = 0, dropped = 0) => ({ capability, 'always-on': always, hook, dropped });
const info = (over: Partial<ProjectInfo> = {}): ProjectInfo => ({
  included: true, project: meta(), plugin: { name: 'Marionette', slug: 'marionette', version: '0.5.0', description: 'One plugin' },
  inputs: [
    { id: 'taste-skill', url: 'https://github.com/example/taste-skill', pin: 'release', release: 'v1.2.0', commit: 'abcdef1234567890', license: 'MIT', paths: ['skills'], became: became(11, 1, 0, 2) },
    { id: 'genoffice', url: 'https://github.com/example/genoffice', pin: 'head', release: null, commit: '0123456789abcdef', license: 'Apache-2.0', paths: ['skills'], became: became(4, 0, 1, 0) },
    { id: 'frozen-kit', url: null, pin: 'static', release: null, commit: null, license: null, paths: [], became: became() },
  ],
  decisions: [], records: [], history: [], changelog: '', prompts: [],
  graph: { entries: [{ name: 'marionette-design', description: 'Use when designing', capabilities: ['a', 'b'] }], capabilities: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }], examples: [{ id: 'x' }, { id: 'y' }] },
  files: [
    { part: 'Identity', path: 'sources.json · plugin', detail: 'The final plugin: Marionette, installed as marionette, version 0.5.0' },
    { part: 'Your instructions', path: 'custom-instructions/', detail: 'house-style.md, tone.md' },
    { part: 'Built plugin', path: 'release/', detail: 'Ready to install on every harness, with its guide' },
  ],
  digest: 'sha256:aaa', ...over,
});
const blank = (over: Partial<ViewState> = {}): ViewState => ({ page: 'projects', snapshot: null, discovered: [], discovering: false, plan: null, checking: false, applying: null, review: null, query: '', filter: 'all', afilter: 'all', busy: null, error: null, checkErrors: [], discoveryError: null, maintenance: null, autostart: null, setup: null, projects: blankProjects(), project: null, ...over });
const opened = (over: Partial<ViewState> = {}, step: ViewState['project'] extends infer P ? NonNullable<P>['step'] : never = 'inputs', held = info(), s = snapshot()): ViewState => {
  const { projects: given, ...rest } = over, state = blank({ snapshot: s, project: { ...fresh('marionette'), step }, ...rest });
  state.projects = { ...blankProjects(), list: [summary()], info: held, infoId: 'marionette', ...given };
  return state;
};
const plan = (operations: Plan['operations'], revision = 1): Plan => ({ id: 'p', revision, operations, blockers: [] });
const op = (plugin_id: string, kind: string, target_id = 't1', to = '0.5.0', from = ''): Plan['operations'][number] => ({ target_id, plugin_id, name: plugin_id, kind, from_version: from, to_version: to, reason: '' });
/** The visible words of a piece of markup, one space between them. */
const words = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const rowOf = (html: string, id: string) => html.match(new RegExp(`<li class="go"><button[^>]*data-id="${id}"[\\s\\S]*?</li>`))?.[0] ?? '';

// ---------- the tabs ----------
test('Projects is the first of four tabs, and the app bar still has one state button', () => {
  const html = frame(blank({ page: 'sync', snapshot: snapshot() }));
  assert.deepEqual([...html.matchAll(/data-action="page" data-id="(\w+)"[^>]*><svg[^>]*>.*?<\/svg><span class="label">([^<]+)<\/span>/g)].map(m => [m[1], m[2]]), [['projects', 'Projects'], ['sync', 'Sync'], ['activity', 'Activity'], ['settings', 'Settings']]);
  assert.match(html, /data-id="sync" aria-current="page"/, 'the app opens on Sync');
  assert.doesNotMatch(html, /data-id="projects" aria-current/);
  assert.equal(html.match(/data-action="page" data-id="[a-z]+"/g)?.length, 5, 'four tabs and the state button');
});
test('the Projects tab is current on its page, which is wide like Sync', () => {
  const html = frame(opened());
  assert.match(html, /data-id="projects" aria-current="page"/);
  assert.match(html, /<div class="page ">/, 'not the narrow column of Activity and Settings');
});
test('every action has one owner, with the project steps merged in', () => {
  const names = Object.values(modules).flatMap(m => Object.keys(m.actions));
  assert.equal(new Set(names).size, names.length, `duplicate: ${names.filter((n, i) => names.indexOf(n) !== i)}`);
  for (const name of ['open-project', 'close-project', 'step', 'open-project-file', 'open-folder', 'retry-projects', 'decisions-of', 'toggle-harness', 'install-again', 'remove-project']) assert.ok(name in modules.projects.actions, name);
});

// ---------- the list ----------
test('the list says for each project its name, version, file, counts, state and where it is installed', () => {
  const state = blank({ snapshot: snapshot(), projects: { ...blankProjects(), list: [summary()] } });
  const html = projects.view(state), row = rowOf(html, 'marionette');
  assert.match(html, /<h1>Projects<\/h1>/);
  assert.match(html, /A project turns plugins and skills into one plugin, harmonized by the AI, for every harness\./);
  assert.equal(words(row), 'MA Marionette 0.5.0 Included with Muro D:/Muro/data/projects/marionette.mp 3 inputs · 37 capabilities Harmonized Not installed anywhere');
  assert.match(row, /<span class="tag good">Harmonized<\/span>/);
});
test('a project that is not Muro\'s own has no Included with Muro tag', () => {
  const html = projects.view(blank({ snapshot: snapshot(), projects: { ...blankProjects(), list: [summary({ id: 'notes', included: false, project: meta({ name: 'Notes', builtin: false }) })] } }));
  assert.doesNotMatch(html, /Included with Muro/);
});
test('Included with Muro is what the runtime says, never what a project file says of itself', () => {
  // a foreign file that claims to be built in (`project.builtin`) and the runtime says is not Muro's own
  const claims = summary({ id: 'foreign', included: false, project: meta({ name: 'Foreign', builtin: true }) });
  const list = projects.view(blank({ snapshot: snapshot(), projects: { ...blankProjects(), list: [claims] } }));
  assert.doesNotMatch(list, /Included with Muro/, 'the list');
  assert.doesNotMatch(projects.view(opened({}, 'inputs', info({ included: false, project: meta({ name: 'Foreign', builtin: true }) }))), /Included with Muro/, 'the project page');
  // and the one the runtime flags wears it, whatever its own file says
  const shipped = summary({ project: meta({ builtin: false }) });
  assert.match(projects.view(blank({ snapshot: snapshot(), projects: { ...blankProjects(), list: [shipped] } })), /Included with Muro/);
  assert.match(projects.view(opened({}, 'inputs', info({ included: true, project: meta({ builtin: false }) }))), /Included with Muro/);
  // a runtime that says nothing (older than the window) does not make any project the shipped one
  const silent = { ...summary(), included: undefined };
  assert.doesNotMatch(projects.view(blank({ snapshot: snapshot(), projects: { ...blankProjects(), list: [silent] } })), /Included with Muro/);
});
test('one input and one capability read in the singular', () => {
  assert.match(words(rowOf(projects.view(blank({ snapshot: snapshot(), projects: { ...blankProjects(), list: [summary({ inputs: 1, capabilities: 1 })] } })), 'marionette')), /1 input · 1 capability/);
});
test('a count the runtime did not send is left out, never shown as zero', () => {
  const row = words(rowOf(projects.view(blank({ snapshot: snapshot(), projects: { ...blankProjects(), list: [summary({ inputs: undefined, capabilities: undefined })] } })), 'marionette'));
  assert.doesNotMatch(row, /input|capabilit/);
});
test('where a project is installed: its plugin in the list, on the harnesses it is switched on, and the changes waiting', () => {
  const p = registryPlugin('marionette', 'Marionette', ['t1', 't2'], [build('claude-code', '0.5.0'), build('codex', '0.5.0')], { project: 'marionette' });
  const installed = { t1: [{ id: 'n1', registry_id: 'marionette', name: 'Marionette', version: '0.5.0' }], t2: [] };
  const line = (s: Snapshot, held: Plan | null = null) => words(rowOf(projects.view(blank({ snapshot: s, plan: held, projects: { ...blankProjects(), list: [summary()] } })), 'marionette')).split('Harmonized ')[1];
  assert.equal(line(snapshot({ plugins: [p], installed })), 'On 2 harnesses · 1 change waiting', 'Codex has no installation yet');
  assert.equal(line(snapshot({ plugins: [p], installed: { ...installed, t2: [{ id: 'n2', registry_id: 'marionette', name: 'Marionette', version: '0.5.0' }] } })), 'On 2 harnesses · in sync');
  assert.equal(line(snapshot({ plugins: [{ ...p, targets: ['t1'] }], installed })), 'On 1 harness · in sync');
  assert.equal(line(snapshot({ plugins: [{ ...p, targets: [] }], installed })), 'Not installed anywhere', 'in the list, on no harness');
});
test('a project file that cannot be read is listed with its reason and no way in', () => {
  const html = projects.view(blank({ snapshot: snapshot(), projects: { ...blankProjects(), list: [{ id: 'gone', path: 'D:/old/gone.mp', error: 'The project file is missing: D:/old/gone.mp' }] } }));
  assert.match(html, /Cannot be read/);
  assert.match(html, /The project file is missing: D:\/old\/gone\.mp/);
  assert.doesNotMatch(html, /data-action="open-project"/, 'nothing to open');
});
test('the plugins Muro installs as published are listed apart, with the harnesses that have no version of them', () => {
  const published = registryPlugin('commit-helper', 'commit-helper', ['t1', 't2'], [build('claude-code', '2.1.0')], { upstream_version: 'v2.1.0' });
  const project = registryPlugin('marionette', 'Marionette', ['t1'], [build('claude-code', '0.5.0')], { project: 'marionette' });
  const html = projects.view(blank({ snapshot: snapshot({ plugins: [published, project] }), projects: { ...blankProjects(), list: [summary()] } }));
  const section = html.slice(html.indexOf('Installed as published'));
  assert.match(html, /<h2>Installed as published<\/h2><span class="count">1<\/span>/, 'the project plugin is not among them');
  assert.match(words(section), /commit-helper v2\.1\.0 github\.com\/example\/commit-helper No version for Codex/);
  assert.doesNotMatch(section, /Marionette/);
  assert.doesNotMatch(words(html.slice(0, html.indexOf('Installed as published'))), /No version for/);
});
test('without a plugin installed as published, there is no such section', () => {
  assert.doesNotMatch(projects.view(blank({ snapshot: snapshot(), projects: { ...blankProjects(), list: [summary()] } })), /Installed as published/);
});
test('the write actions of plan 3 are not on the page: no New project, no Create a project', () => {
  const published = registryPlugin('commit-helper', 'commit-helper', ['t1'], [build('claude-code', '2.1.0')]);
  const html = projects.view(blank({ snapshot: snapshot({ plugins: [published] }), projects: { ...blankProjects(), list: [summary()] } }));
  assert.doesNotMatch(html, /New project|Create a project|make-project|new-project/);
});
test('Open project file is offered while the shell can open a file dialog, and is gone once it said it cannot', () => {
  const state = blank({ snapshot: snapshot(), projects: { ...blankProjects(), list: [summary()] } });
  assert.match(projects.view(state), /<button[^>]*data-action="open-project-file"[^>]*>.*<span>Open project file…<\/span>/);
  state.projects.noPicker = true;
  assert.doesNotMatch(projects.view(state), /open-project-file/);
});
test('the list while it is read, after it failed, and when it is empty', () => {
  const s = snapshot();
  assert.match(projects.view(blank({ snapshot: s, projects: { ...blankProjects(), loading: true } })), /Reading your projects…/);
  const failed = projects.view(blank({ snapshot: s, projects: { ...blankProjects(), error: 'The factory did not answer' } }));
  assert.match(failed, /Projects could not be read/);
  assert.match(failed, /The factory did not answer/);
  assert.match(failed, /data-action="retry-projects"/);
  const none = projects.view(blank({ snapshot: s, projects: { ...blankProjects(), list: [] } }));
  assert.match(none, /No project yet/);
  assert.doesNotMatch(none, /New project/);
});
test('every value of the list goes through esc', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const html = projects.view(blank({ snapshot: snapshot({ plugins: [registryPlugin('x', evil, ['t1'], [], { source: evil })] }), projects: { ...blankProjects(), list: [summary({ id: 'a"b', path: evil, project: meta({ name: evil }), plugin: { name: evil, slug: 's', version: evil } }), { id: 'bad', path: evil, error: evil }] } }));
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /data-id="a&quot;b"/);
});

// ---------- the project page ----------
test('the project page: header, the file with its folder, repository, author, creation, and what the file holds', () => {
  const html = projects.view(opened());
  assert.match(html, /<button[^>]*data-action="close-project"[^>]*>.*<span>Projects<\/span>/, 'back to the list');
  const head = html.match(/<div class="projhead">[\s\S]*?<\/div>/)![0];
  assert.equal(words(head), 'MA Marionette 0.5.0 Harmonized Included with Muro');
  assert.match(head, /<h1>Marionette<\/h1>/);
  const file = html.match(/<div class="projfile">[\s\S]*?<\/details><\/div>/)![0];
  assert.match(file, /<code>D:\/Muro\/data\/projects\/marionette\.mp<\/code>/);
  assert.match(file, /<button[^>]*data-action="open-folder"[^>]*data-id="D:\/Muro\/data\/projects\/marionette\.mp"[^>]*>.*<span>Open folder<\/span>/);
  assert.match(words(file), /Repository github\.com\/acaprino\/marionette · main · by acaprino · created 2026-11-10/);
  assert.match(file, /<summary>What this project file holds<\/summary>/);
  const rows = [...file.matchAll(/<li><strong[^>]*>([^<]*)<\/strong><span[^>]*>([^<]*)<\/span>/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(rows, [['Identity', 'The final plugin: Marionette, installed as marionette, version 0.5.0'], ['Your instructions', 'house-style.md, tone.md'], ['Built plugin', 'Ready to install on every harness, with its guide'], ['Offline', 'The file carries everything: the project rebuilds and installs without the network.']]);
  assert.match(file, /<code class="muted">release\/<\/code>/);
});
test('a project with no repository says so, and one from the user is not marked as Muro\'s', () => {
  const held = info({ included: false, project: meta({ repository: null, builtin: false, author: 'you' }) });
  const html = projects.view(opened({}, 'inputs', held));
  assert.match(words(html), /No Git repository set · by you · created 2026-11-10/);
  assert.doesNotMatch(html, /Included with Muro/);
});
test('the four steps are a tablist: selected, labelled, with one tab in the tab order', () => {
  for (const [at, [id]] of STEPS.entries()) {
    const html = projects.view(opened({}, id));
    const list = html.match(/<div class="steps4" role="tablist" aria-label="Project steps">([\s\S]*?)<\/div><div role="tabpanel"/)?.[1] ?? '';
    const tabs = [...list.matchAll(/<button type="button" role="tab"([^>]*)>([\s\S]*?)<\/button>/g)];
    assert.equal(tabs.length, 4);
    assert.deepEqual(tabs.map(t => /aria-selected="true"/.test(t[1])), STEPS.map(([s]) => s === id), `${id} is the one selected`);
    assert.deepEqual(tabs.map(t => /tabindex="0"/.test(t[1])), STEPS.map(([s]) => s === id), 'roving tab index');
    assert.deepEqual(tabs.map(t => /tabindex="-1"/.test(t[1])), STEPS.map(([s]) => s !== id));
    assert.ok(tabs.every(t => /data-action="step"/.test(t[1]) && /aria-controls="step-panel"/.test(t[1]) && /id="step-tab-\w+"/.test(t[1])));
    assert.match(html, new RegExp(`<div role="tabpanel" id="step-panel" aria-labelledby="step-tab-${id}"`), `the panel is named by ${id}`);
    assert.equal(tabs[at][1].includes('aria-current="step"'), true);
  }
});
test('the tabs read: number, name and a line of what the step holds', () => {
  const p = registryPlugin('marionette', 'Marionette', ['t1'], [build('claude-code', '0.5.0')], { project: 'marionette' });
  const html = projects.view(opened({}, 'inputs', info(), snapshot({ plugins: [p], installed: { t1: [{ id: 'n1', registry_id: 'marionette', name: 'Marionette', version: '0.5.0' }] } })));
  const tabs = [...html.matchAll(/role="tab"[^>]*>([\s\S]*?)<\/button>/g)].map(m => words(m[1]));
  assert.deepEqual(tabs, ['1 Inputs 3 inputs', '2 Harmonize Harmonized', '3 Graph & simulator 3 capabilities · 2 examples', '4 Install On 1 harness · in sync']);
});
test('arrow keys move through the steps and wrap; Home and End go to the ends; other keys do nothing', () => {
  assert.equal(projects.nextStep('inputs', 'ArrowRight'), 'harmonize');
  assert.equal(projects.nextStep('install', 'ArrowRight'), 'inputs', 'wraps');
  assert.equal(projects.nextStep('inputs', 'ArrowLeft'), 'install', 'wraps');
  assert.equal(projects.nextStep('graph', 'ArrowLeft'), 'harmonize');
  assert.equal(projects.nextStep('graph', 'Home'), 'inputs');
  assert.equal(projects.nextStep('graph', 'End'), 'install');
  for (const key of ['ArrowDown', 'ArrowUp', 'Enter', ' ', 'a']) assert.equal(projects.nextStep('graph', key), null, key);
});
test('while the project is read, and when it cannot be, the page says so and offers to try again', () => {
  const loading = projects.view(blank({ snapshot: snapshot(), project: fresh('marionette'), projects: { ...blankProjects(), list: [summary()], infoId: 'marionette', infoLoading: true } }));
  assert.match(loading, /Reading the project…/);
  assert.match(loading, /data-action="close-project"/, 'the way back is there');
  assert.doesNotMatch(loading, /role="tablist"/);
  const failed = projects.view(blank({ snapshot: snapshot(), project: fresh('marionette'), projects: { ...blankProjects(), list: [summary()], infoId: 'marionette', infoError: 'The project file is not a Muro project file' } }));
  assert.match(failed, /This project could not be read/);
  assert.match(failed, /The project file is not a Muro project file/);
  assert.match(failed, /data-action="retry-projects"/);
});
test('the information of another project is never shown for this one', () => {
  const state = opened({}, 'inputs', info());
  state.projects.infoId = 'other';
  assert.match(projects.view(state), /Reading the project…/);
});
test('the project page escapes everything it shows', () => {
  const evil = '<script>alert(1)</script>';
  const held = info({ project: meta({ name: evil, author: evil, repository: { url: 'https://x/' + evil, branch: evil, tag_prefix: '' } }), plugin: { name: evil, slug: 's', version: evil, description: '' }, files: [{ part: evil, path: evil, detail: evil }], inputs: [{ id: evil, url: evil, pin: 'release', release: evil, commit: evil, license: evil, paths: [], became: became(1) }] });
  for (const step of ['inputs', 'install'] as const) assert.doesNotMatch(projects.view(opened({ projects: { ...blankProjects(), list: [summary({ path: evil })], info: held, infoId: 'marionette' } }, step, held)), /<script/);
});

// ---------- step 1, Inputs ----------
test('Inputs: a table of what goes in, pinned how, under which license, and what each input became', () => {
  const html = inputs.view(opened(), info());
  assert.match(html, /<h2>What goes in<\/h2><small>The plugins and skills this project absorbs, each pinned to a release or a commit\.<\/small>/);
  assert.deepEqual([...html.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map(m => m[1]), ['Input', 'Pinned to', 'License', 'What it became']);
  const rows = [...html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)][0][1].split('</tr>').filter(r => r.includes('<td>')).map(words);
  assert.deepEqual(rows, [
    'taste-skill https://github.com/example/taste-skill v1.2.0 published release MIT 11 capabilities · 1 always on · 2 dropped',
    'genoffice https://github.com/example/genoffice Latest commit @0123456 Apache-2.0 4 capabilities · 1 hook',
    'frozen-kit Local source Frozen commit not resolved yet — Not harmonized yet',
  ]);
});
test('Inputs: what an input became is a link to its choices, and counts of one read in the singular', () => {
  const html = inputs.view(opened(), info({ inputs: [{ id: 'one', url: 'https://x/y', pin: 'release', release: 'v1', commit: null, license: 'MIT', paths: [], became: became(1, 0, 1, 0) }] }));
  assert.match(html, /<button type="button" class="link" data-action="decisions-of" data-id="one">1 capability · 1 hook<\/button>/);
});
test('Inputs: the write actions of plan 3 are not offered', () => {
  const html = inputs.view(opened(), info({ inputs: [{ ...info().inputs[0], release: 'v0.0.1' }] }));
  assert.doesNotMatch(html, /Move pin|Add input|move-pin|add-input|open-custom-instructions/);
  assert.doesNotMatch(html, /Open folder/, 'the folder of the instructions is an edit: plan 3');
});
test('Inputs: the custom instructions are what the file holds, and none says so', () => {
  assert.match(words(inputs.view(opened(), info())), /Custom instructions house-style\.md, tone\.md Your own Markdown notes\. The AI reads them with the inputs and decides how they fit\./);
  assert.match(words(inputs.view(opened(), info({ files: [{ part: 'Your instructions', path: 'custom-instructions/', detail: 'None yet' }] }))), /Custom instructions None yet Your own Markdown notes/);
  assert.match(words(inputs.view(opened(), info({ files: [] }))), /Custom instructions None yet/, 'a file list without the row');
});
test('Inputs: a project without an input shows an empty table, not a broken one', () => {
  assert.match(inputs.view(opened(), info({ inputs: [] })), /No input yet\./);
});

// ---------- step 4, Install ----------
const live = (over: { targets?: Target[]; targetsOn?: string[]; installed?: Record<string, { id: string; registry_id?: string; name: string; version: string }[]>; plan?: Plan | null; builds?: Plugin['distributions'] } = {}) => {
  const p = registryPlugin('marionette', 'Marionette', over.targetsOn ?? ['t1'], over.builds ?? [build('claude-code', '0.5.0'), build('codex', '0.5.0')], { project: 'marionette' });
  return opened({ plan: over.plan ?? null }, 'install', info(), snapshot({ plugins: [p], targets: over.targets, installed: over.installed ?? { t1: [{ id: 'n1', registry_id: 'marionette', name: 'Marionette', version: '0.5.0' }], t2: [] } }));
};
test('Install: one switch per harness, on where the project is installed, with its last check and its state', () => {
  const html = install.view(live(), info());
  assert.match(html, /<h2>Where it is installed<\/h2><small>Switch a harness on to install this project there\. Nothing changes until you apply\.<\/small>/);
  const switches = [...html.matchAll(/<button[^>]*role="switch"[^>]*>/g)].map(m => m[0]);
  assert.equal(switches.length, 2);
  assert.match(switches[0], /aria-checked="true" aria-label="Install Marionette on Claude Code" data-action="toggle-harness" data-id="t1"/);
  assert.match(switches[1], /aria-checked="false" aria-label="Install Marionette on Codex" data-action="toggle-harness" data-id="t2"/);
  const rows = html.split('<li>').slice(1).map(words);
  assert.match(rows[0], /^CC Claude Code Checked never · last sync never 0\.5\.0$/, 'in sync here');
  assert.match(rows[1], /^CX Codex Checked never · last sync never —$/, 'switched off: not here');
});
test('Install: a harness the plan changes shows the change, and one with no version of the project says so', () => {
  const held = plan([op('marionette', 'install', 't2')]);
  const rows = install.view(live({ targetsOn: ['t1', 't2'], plan: held }), info()).split('<li>').slice(1).map(words);
  assert.match(rows[1], /Install 0\.5\.0$/);
  const none = install.view(live({ targetsOn: ['t1', 't2'], builds: [build('claude-code', '0.5.0')] }), info()).split('<li>').slice(1).map(words);
  assert.match(none[1], /No version$/);
});
test('Install: a harness that is paused has no switch', () => {
  const html = install.view(live({ targets: [claude, { ...codex, enabled: false }] }), info());
  assert.equal(html.match(/role="switch"/g)?.length, 1);
  assert.match(html, /<span class="tag ?">Paused<\/span>/);
});
test('Install: without a harness it sends to Sync', () => {
  const html = install.view(live({ targets: [] }), info());
  assert.match(html, /No harness managed yet/);
  assert.match(html, /Add one in Sync\./);
  assert.match(html, /data-action="page" data-id="sync"/);
  assert.doesNotMatch(html, /role="switch"/);
});
test('Install: the changes waiting for this project are reviewed in Sync\'s own sheet, which lists the whole plan', () => {
  const held = plan([op('marionette', 'install', 't2'), op('marionette', 'update', 't1', '0.6.0', '0.5.0'), op('other', 'install', 't1')]);
  const html = install.view(live({ targetsOn: ['t1', 't2'], plan: held }), info());
  assert.match(html, /<button[^>]*class="btn primary"[^>]*data-action="review"[^>]*>.*<span>Review 2 changes<\/span>/, 'only this project\'s changes count');
  assert.doesNotMatch(html.match(/<button[^>]*data-action="review"[^>]*>/)![0], /data-id/, 'the review of the whole plan, not of one harness');
  assert.match(html, /data-action="page" data-id="sync"[^>]*>.*<span>Open Sync<\/span>/);
  assert.doesNotMatch(install.view(live(), info()), /data-action="review"/, 'nothing waiting: no review');
});
test('Install: the line says where it is installed and what waits', () => {
  assert.equal(install.installLine(live(), 'marionette'), 'On 1 harness · in sync');
  assert.equal(install.installLine(live({ targetsOn: ['t1', 't2'] }), 'marionette'), 'On 2 harnesses · 1 change waiting', 'Codex has none yet');
  assert.equal(install.installLine(live({ targetsOn: [] }), 'marionette'), 'Not installed anywhere');
  assert.equal(install.installLine(opened(), 'marionette'), 'Not installed anywhere', 'not in the list at all');
  assert.equal(install.installLine(live({ targets: [claude, { ...codex, enabled: false }], targetsOn: ['t1', 't2'] }), 'marionette'), 'On 1 harness · in sync', 'a paused harness is not counted');
});

// ---------- what a project page keeps, across renders and a reload ----------
const memory = new Map<string, string>();
const newSession = () => { memory.clear(); (globalThis as any).sessionStorage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, String(v)), removeItem: (k: string) => void memory.delete(k) }; };
const it = (name: string, body: () => void | Promise<void>) => test(name, async () => { newSession(); await body(); });
it('the open project, its step and its filters survive a reload of the page, and closing it forgets them', () => {
  const held = { ...fresh('marionette'), step: 'graph' as const, view: 'choices' as const, dsrc: 'genoffice', dform: 'hook' };
  remember(held);
  const back = recall()!;
  assert.deepEqual({ ...back, sim: undefined }, { ...held, sim: undefined });
  remember(null);
  assert.equal(recall(), null);
});
it('a record the page did not write, or that names a step or a view it does not know, is ignored', () => {
  for (const bad of ['{', 'null', '[]', '{"id":7,"step":"inputs","view":"records","dsrc":"","dform":"all"}', '{"id":"m","step":"nope","view":"records","dsrc":"","dform":"all"}', '{"id":"m","step":"inputs","view":"nope","dsrc":"","dform":"all"}', '{"id":"m","step":"inputs","view":"records","dsrc":3,"dform":"all"}']) {
    memory.set('muro.project', bad);
    assert.equal(recall(), null, bad);
  }
  memory.set('muro.project', '{"id":"m","step":"install","view":"history","dsrc":"","dform":"all"}');
  assert.equal(recall()?.step, 'install', 'a record without a simulation is a record');
});
it('a session that keeps nothing still works', () => {
  delete (globalThis as any).sessionStorage;
  assert.equal(recall(), null);
  assert.doesNotThrow(() => remember(fresh('marionette')));
});
it('a new project opens on its first step, with no filter', () => {
  assert.deepEqual({ ...fresh('marionette'), sim: undefined }, { id: 'marionette', step: 'inputs', view: 'records', dsrc: '', dform: 'all', sim: undefined });
});

// ---------- the steps Tasks 7 and 8 build: until then each says so ----------
test('Graph & simulator is built (tests/project-graph.test.ts): the page shows the module of the step, and no step is a placeholder any more', () => {
  assert.match(projects.view(opened({}, 'graph')), /<div class="two"><div class="sim">/, 'the page shows the module of the step');
  assert.doesNotMatch(projects.view(opened({}, 'graph')), /Coming in this version/);
  assert.doesNotMatch(projects.view(opened({}, 'harmonize')), /Coming in this version/, 'Harmonize is no placeholder any more');
});
test('what a simulation keeps survives a reload through the graph module, and a run in progress does not', () => {
  assert.deepEqual(graph.restoreSim(graph.newSim()), graph.newSim());
  assert.deepEqual(graph.restoreSim('nonsense'), graph.newSim());
  assert.deepEqual(graph.restoreSim(null), graph.newSim());
});

// ---------- flows over the fake service ----------
async function session(scenario = 'projects', wrap: (r: (a: string, p?: any) => Promise<any>) => (a: string, p?: any) => Promise<any> = r => r) {
  const fake = createTransport(scenario), state = blank(), toasts: string[] = [];
  state.snapshot = await fake.request('snapshot'); fake.calls.length = 0;
  let renders = 0;
  const app = {
    state, request: wrap(fake.request), render: () => { renders++; },
    async run(label: string, work: () => Promise<unknown>, after?: (v: any) => unknown) { if (state.busy) return; state.busy = label; state.error = null; try { const value = await work(); await after?.(value); } catch (e) { state.error = String(e instanceof Error ? e.message : e); } finally { state.busy = null; } },
    notify: (text: string) => void toasts.push(text), reload: async () => {}, replan: async () => {}, adopt: (s: Snapshot) => { state.snapshot = s; }, discover: async () => {}, openDialog: () => { throw new Error('no dialog'); }, closeDialog: () => {}, confirm: () => {},
  } as unknown as App;
  const act = (name: string, data: Record<string, string> = {}) => Promise.resolve(modules.projects.actions[name](app, data as DOMStringMap, {} as HTMLElement));
  return { fake, state, app, toasts, act, actions: () => fake.calls.map(c => c.action), renders: () => renders };
}

test('opening the Projects tab reads the list, and opening a project reads that project', async () => {
  const { act, state, actions, fake, app } = await session();
  await modules.projects.opened!(app);
  assert.deepEqual(actions(), ['projects']);
  assert.deepEqual(state.projects.list?.map(p => p.id), ['marionette']);
  assert.equal(state.projects.loading, false);
  await act('open-project', { id: 'marionette' });
  assert.deepEqual(state.project && { id: state.project.id, step: state.project.step }, { id: 'marionette', step: 'inputs' });
  assert.deepEqual(actions(), ['projects', 'project']);
  assert.deepEqual(fake.calls[1].payload, { id: 'marionette' });
  assert.equal(state.projects.info?.project.name, 'Marionette');
  assert.equal(state.projects.infoId, 'marionette');
});
test('the tab read again with a project open reads the list and the project again, and keeps showing the old one meanwhile', async () => {
  let heldWhileReading: unknown = null;
  const holder: { state?: ViewState } = {};
  const { act, state, actions, app, fake } = await session('projects', request => async (a, p) => { if (a === 'project') heldWhileReading = holder.state?.projects.info; return request(a, p); });
  holder.state = state;
  await act('open-project', { id: 'marionette' });
  fake.calls.length = 0;
  const before = state.projects.info;
  await modules.projects.opened!(app);
  assert.deepEqual(actions(), ['projects', 'project']);
  assert.ok(before, 'the first reading kept the project');
  assert.equal(heldWhileReading, before, 'the old one stays on the page while the new one is read');
  assert.deepEqual(state.projects.info, before);
});
test('a project that is no longer in the list is closed when the tab opens', async () => {
  const { state, app } = await session();
  state.project = fresh('vanished');
  await modules.projects.opened!(app);
  assert.equal(state.project, null);
});
test('a list that cannot be read is an error of the page, not of the app, and Try again reads it again', async () => {
  let fail = true;
  const { app, state, act } = await session('projects', request => (a, p) => a === 'projects' && fail ? Promise.reject(new Error('The factory did not answer')) : request(a, p));
  await modules.projects.opened!(app);
  assert.equal(state.projects.error, 'The factory did not answer');
  assert.equal(state.error, null, 'the banner of the app is for what a person did');
  assert.equal(state.projects.list, null);
  fail = false;
  await act('retry-projects');
  assert.equal(state.projects.error, null);
  assert.equal(state.projects.list?.length, 1);
});
test('a project that cannot be read stays on its error until Try again', async () => {
  let fail = true;
  const { state, act } = await session('projects', request => (a, p) => a === 'project' && fail ? Promise.reject(new Error('Not a Muro project file')) : request(a, p));
  await act('retry-projects');
  await act('open-project', { id: 'marionette' });
  assert.equal(state.projects.infoError, 'Not a Muro project file');
  assert.equal(state.projects.info, null);
  fail = false;
  await act('retry-projects');
  assert.equal(state.projects.infoError, null);
  assert.equal(state.projects.info?.project.name, 'Marionette');
});
test('an answer for a project the person has left is dropped', async () => {
  let release!: () => void;
  const gate = new Promise<void>(done => { release = done; });
  const { act, state, app } = await session('projects', request => async (a, p) => { const answer = await request(a, p); if (a === 'project') await gate; return answer; });
  await modules.projects.opened!(app);
  const opening = act('open-project', { id: 'marionette' });
  await act('close-project');
  assert.equal(state.project, null);
  release(); await opening;
  assert.equal(state.projects.info, null, 'nothing is kept for a project that is not open');
});
test('a step is chosen by its tab; a step that does not exist is ignored; closing the project goes back to the list', async () => {
  const { act, state } = await session();
  await act('open-project', { id: 'marionette' });
  await act('step', { id: 'install' });
  assert.equal(state.project?.step, 'install');
  await act('step', { id: 'nonsense' });
  assert.equal(state.project?.step, 'install');
  await act('close-project');
  assert.equal(state.project, null);
});
test('what an input became opens its choices in Harmonize, filtered to that input', async () => {
  const { act, state } = await session();
  await act('open-project', { id: 'marionette' });
  state.project!.dform = 'hook';
  await act('decisions-of', { id: 'taste-skill' });
  assert.deepEqual({ step: state.project?.step, view: state.project?.view, dsrc: state.project?.dsrc, dform: state.project?.dform }, { step: 'harmonize', view: 'choices', dsrc: 'taste-skill', dform: 'all' });
});
test('Open project file asks the shell for a file, adds it, reads the list again and says so', async () => {
  const { act, fake, state, toasts, actions } = await session();
  fake.flags.pickPath = 'D:/Notes/Notes.mp';
  await act('open-project-file');
  assert.deepEqual(actions(), ['pick_file', 'open_project', 'projects']);
  assert.deepEqual(fake.calls[0].payload, { filter: 'Muro project (*.mp)' });
  assert.deepEqual(fake.calls[1].payload, { path: 'D:/Notes/Notes.mp' });
  assert.deepEqual(state.projects.list?.map(p => p.id), ['marionette', 'notes']);
  assert.deepEqual(toasts, ['Notes added to your list.']);
});
test('a file dialog that is cancelled changes nothing', async () => {
  const { act, fake, state, actions } = await session();
  fake.flags.pickPath = null;
  await act('open-project-file');
  assert.deepEqual(actions(), ['pick_file']);
  assert.equal(state.error, null);
});
test('a file that is not a project is refused with the reason, and is not listed', async () => {
  const { act, fake, state } = await session();
  fake.flags.pickPath = 'D:/Notes/Notes.txt';
  await act('open-project-file');
  assert.match(state.error ?? '', /Not a Muro project file/);
  assert.equal(state.projects.list, null, 'the list was not read for a refusal');
});
test('a shell that cannot open a file dialog yet loses the button, and the person is told', async () => {
  const { act, fake, state, toasts } = await session();
  fake.flags.noShellActions = true;
  await act('open-project-file');
  assert.equal(state.projects.noPicker, true);
  assert.equal(state.error, null);
  assert.match(toasts[0], /cannot open a file dialog/);
});
test('Open folder asks the shell to open the folder of the file; a shell that cannot loses the button', async () => {
  const { act, fake, state, actions } = await session();
  await act('open-folder', { id: 'D:/Muro/data/projects/marionette.mp' });
  assert.deepEqual(actions(), ['open_folder']);
  assert.deepEqual(fake.calls[0].payload, { path: 'D:/Muro/data/projects/marionette.mp' });
  fake.flags.noShellActions = true;
  await act('open-folder', { id: 'D:/x.mp' });
  assert.equal(state.projects.noFolder, true);
});

const open = async (scenario = 'projects') => { const s = await session(scenario); await s.act('retry-projects'); await s.act('open-project', { id: 'marionette' }); return s; };
test('switching a harness on installs the project there with one install_project, which sets the distributions and the targets: no second save', async () => {
  const { act, fake, state, actions } = await open();
  fake.calls.length = 0;
  await act('toggle-harness', { id: 't2' });
  assert.deepEqual(actions(), ['install_project', 'snapshot']);
  assert.deepEqual(fake.calls[0].payload, { id: 'marionette', targets: ['t2'] }, 'the id of the switch, not the kind of harness');
  const made = state.snapshot?.registry.plugins.find(p => p.project === 'marionette');
  assert.deepEqual(made?.targets, ['t2']);
  assert.deepEqual(made?.distributions.map(d => d.harness), ['codex']);
});
test('a runtime that built the plugin but left the harness out of its targets is an error shown in the banner; the page does not save the targets itself', async () => {
  const { act, fake, state, actions } = await open();
  fake.flags.installLeavesTargets = true;
  fake.calls.length = 0;
  await act('toggle-harness', { id: 't2' });
  assert.deepEqual(actions(), ['install_project', 'snapshot'], 'no save_plugin');
  assert.match(state.error ?? '', /marionette was not set up for Codex/);
});
test('a second harness names both switches that are on, so the first one keeps its build', async () => {
  const { act, fake } = await open();
  await act('toggle-harness', { id: 't1' });
  fake.calls.length = 0;
  await act('toggle-harness', { id: 't2' });
  assert.deepEqual(fake.calls[0].payload, { id: 'marionette', targets: ['t1', 't2'] });
});
test('two harnesses of one kind: switching one on names that one, and one that was switched off stays off when another kind is switched on', async () => {
  const { act, fake, state } = await open();
  await fake.request('save_target', { revision: state.snapshot!.registry.revision, target: { id: 't3', harness: 'claude-code', name: 'Claude Code (work)', root: 'D:/work/.claude', executable: 'claude', exclusive: false, enabled: true } });
  state.snapshot = await fake.request('snapshot');
  fake.calls.length = 0;
  await act('toggle-harness', { id: 't1' });
  assert.deepEqual(fake.calls[0].payload, { id: 'marionette', targets: ['t1'] }, 'the other Claude Code is not named: it was not switched on');
  assert.deepEqual(state.snapshot?.registry.plugins.find(p => p.project === 'marionette')?.targets, ['t1'], 'and it is not a target');
  await act('toggle-harness', { id: 't2' });
  assert.deepEqual(fake.calls.filter(c => c.action === 'install_project').map(c => c.payload.targets), [['t1'], ['t1', 't2']]);
  assert.deepEqual(state.snapshot?.registry.plugins.find(p => p.project === 'marionette')?.targets, ['t1', 't2'], 'switching Codex on left the Claude Code that is off still off');
});
test('a switch that is off for a paused harness is not named: a paused harness has no switch', async () => {
  const { act, fake, state } = await open();
  const t2 = state.snapshot!.registry.targets.find(t => t.id === 't2')!;
  await fake.request('save_target', { revision: state.snapshot!.registry.revision, target: { ...t2, enabled: false } });
  state.snapshot = await fake.request('snapshot');
  fake.calls.length = 0;
  await act('toggle-harness', { id: 't2' });
  assert.deepEqual(fake.calls, [], 'a paused harness cannot be switched on from here');
});
test('switching a harness off takes it out of the plugin\'s targets and installs nothing', async () => {
  const { act, fake, state, actions } = await open();
  await act('toggle-harness', { id: 't1' });
  await act('toggle-harness', { id: 't2' });
  fake.calls.length = 0;
  await act('toggle-harness', { id: 't1' });
  assert.deepEqual(actions(), ['save_plugin']);
  assert.deepEqual(state.snapshot?.registry.plugins.find(p => p.project === 'marionette')?.targets, ['t2']);
});
test('an install that fails says why, in the banner, and changes nothing', async () => {
  const { act, fake, state } = await open();
  fake.flags.rejectInstall = true;
  await act('toggle-harness', { id: 't2' });
  assert.match(state.error ?? '', /no build for codex/);
  assert.equal(state.snapshot?.registry.plugins.some(p => p.project === 'marionette'), false);
});
test('a harness the page does not know, or a project that is not open, is ignored', async () => {
  const { act, fake, state } = await session();
  await act('toggle-harness', { id: 't2' });
  assert.deepEqual(fake.calls, [], 'no project is open');
  await act('open-project', { id: 'marionette' });
  fake.calls.length = 0;
  await act('toggle-harness', { id: 'nope' });
  assert.deepEqual(fake.calls, []);
  assert.equal(state.error, null);
});

// ---------- a build older than its project file ----------
const CHANGED_BY_THE_PLAN = (name: string) => `${name} / Marionette: Project file changed: open the project again`;
test('Install: a harness whose build is older than the project file says so and offers to install again; the others read as they did', () => {
  const held = { ...plan([]), blockers: [CHANGED_BY_THE_PLAN('Claude Code')] };
  const both = live({ targetsOn: ['t1', 't2'], plan: held, installed: { t1: [{ id: 'n1', registry_id: 'marionette', name: 'Marionette', version: '0.5.0' }], t2: [{ id: 'n2', registry_id: 'marionette', name: 'Marionette', version: '0.5.0' }] } });
  const html = install.view(both, info());
  const rows = html.split('<li>').slice(1);
  assert.match(words(rows[0]), /^CC Claude Code Checked never · last sync never Changed since it was installed: install again Install again$/);
  assert.match(rows[0], /<button[^>]*class="btn sm"[^>]*data-action="install-again"[^>]*data-id="t1"[^>]*aria-label="Install Marionette again on Claude Code"/);
  assert.doesNotMatch(rows[0], /class="cell ok"/, 'not shown as up to date');
  assert.match(words(rows[1]), /^CX Codex Checked never · last sync never 0\.5\.0$/, 'Codex is blocked by nothing');
  assert.doesNotMatch(rows[1], /install-again/);
  assert.equal(install.installLine(both, 'marionette'), 'On 2 harnesses · 1 harness to install again', 'the line of the tab and of the list says it too: not "in sync"');
});
test('Install: only the registry\'s own words for a changed project file mark a build, and only for a plan of the registry the page holds', () => {
  const other = { ...plan([]), blockers: ['Claude Code / Marionette: No version for this harness', 'Claude Code / Other: Project file changed: open the project again', 'Codex / Marionette: Project file changed: open the project again'] };
  assert.doesNotMatch(install.view(live({ plan: other }), info()), /install-again/, 'another reason, another plugin, a harness the project is not on');
  const old = { ...plan([], 7), blockers: [CHANGED_BY_THE_PLAN('Claude Code')] };
  assert.doesNotMatch(install.view(live({ plan: old }), info()), /install-again/, 'a plan of another revision is no plan of this snapshot');
  assert.equal(install.installLine(live({ plan: old }), 'marionette'), 'On 1 harness · in sync');
});
test('Install again installs the project on the harnesses that are on, from the file as it is now, and the harness is no longer marked', async () => {
  const { act, fake, state, actions } = await open();
  await act('toggle-harness', { id: 't1' });
  await act('toggle-harness', { id: 't2' });
  fake.flags.projectChanged = true;
  fake.calls.length = 0;
  await act('install-again', { id: 't1' });
  assert.deepEqual(actions(), ['install_project', 'snapshot']);
  assert.deepEqual(fake.calls[0].payload, { id: 'marionette', targets: ['t1', 't2'] }, 'every harness that is on: the ones not named would lose their build');
  assert.equal(fake.flags.projectChanged, false);
  assert.deepEqual(state.snapshot?.registry.plugins.find(p => p.project === 'marionette')?.targets, ['t1', 't2']);
  // a harness that is off, or a paused one, or no project open: nothing happens
  await act('toggle-harness', { id: 't2' });
  fake.calls.length = 0;
  await act('install-again', { id: 't2' });
  await act('install-again', { id: 'nope' });
  assert.deepEqual(fake.calls, []);
});

// ---------- removing a project from the list ----------
const NOTES = 'D:/Notes/Notes.mp';
const withNotes = async (wrap?: Parameters<typeof session>[1]) => {
  const s = await session('projects', wrap);
  const asked: { title: string; text: string; ok: string; danger: boolean }[] = [];
  let confirmed: (() => void) | null = null;
  (s.app as unknown as { confirm: (...a: any[]) => void }).confirm = (title: string, text: string, ok: string, then: () => void, danger = false) => { asked.push({ title, text, ok, danger }); confirmed = then; };
  s.fake.flags.pickPath = NOTES;
  await s.act('open-project-file');
  s.fake.calls.length = 0;
  return { ...s, asked, confirm: async () => { confirmed?.(); await new Promise(done => setTimeout(done, 0)); await new Promise(done => setTimeout(done, 0)); } };
};
test('the list has Remove from list on every project but the one Muro ships, and a project that cannot be read has it too', () => {
  const list = [summary(), summary({ id: 'notes', path: NOTES, included: false, project: meta({ name: 'Notes', builtin: false }) }), { id: 'gone', path: 'D:/old/gone.mp', error: 'The project file is missing: D:/old/gone.mp', included: false }, { id: 'broken-default', path: 'D:/Muro/data/projects/marionette.mp', error: 'Not a Muro project file', included: true }];
  const html = projects.view(blank({ snapshot: snapshot(), projects: { ...blankProjects(), list } }));
  const buttons = [...html.matchAll(/<button[^>]*data-action="remove-project"[^>]*>/g)].map(m => m[0]);
  assert.equal(buttons.length, 2, 'the shipped project has none, readable or not');
  assert.match(buttons[0], /data-id="notes"[^>]*aria-label="Remove Notes from the list"|aria-label="Remove Notes from the list"[^>]*data-id="notes"/);
  assert.match(buttons[1], /data-id="gone"/);
  assert.match(rowOf(html, 'notes'), /<\/button><button[^>]*data-action="remove-project"[^>]*>.*<span>Remove from list<\/span><\/button><\/li>$/, 'beside the button that opens the row, never inside it');
  assert.doesNotMatch(rowOf(html, 'marionette'), /remove-project/);
});
test('Remove from list asks first, says the file stays, and removes only the entry; the list is read again', async () => {
  const { act, fake, state, asked, confirm, toasts } = await withNotes();
  assert.deepEqual(state.projects.list?.map(p => p.id), ['marionette', 'notes']);
  await act('remove-project', { id: 'notes' });
  assert.deepEqual(fake.calls, [], 'nothing is sent before the person confirms');
  assert.equal(asked.length, 1);
  assert.equal(asked[0].title, 'Remove Notes from your list?');
  assert.match(asked[0].text, /Only the entry goes: the file stays where it is \(D:\/Notes\/Notes\.mp\) and you can open it again\./);
  assert.deepEqual([asked[0].ok, asked[0].danger], ['Remove from list', true]);
  const revision = state.snapshot!.registry.revision;
  await confirm();
  assert.deepEqual(fake.calls.map(c => c.action), ['remove_project', 'projects']);
  assert.deepEqual(fake.calls[0].payload, { id: 'notes', revision }, 'at the revision the page held');
  assert.equal(state.snapshot!.registry.revision, revision + 1, 'and the snapshot the service answered is kept');
  assert.deepEqual(state.projects.list?.map(p => p.id), ['marionette']);
  assert.deepEqual(toasts.slice(1), ['Notes removed from your list.'], 'after the one that said it was added');
  assert.equal(state.error, null);
});
test('Remove from list says when its installed plugin stays, and a revision that moved behind the page is read again and sent once more', async () => {
  let refused = 1;
  const { act, fake, state, asked, confirm } = await withNotes(request => (a, p) => { if (a === 'remove_project' && refused-- > 0) return Promise.reject(new Error('Registry revision changed; refresh before saving')); return request(a, p); });
  await fake.request('save_plugin', { revision: state.snapshot!.registry.revision, plugin: { id: 'notes', name: 'Notes', source: 'project:notes', policy: 'head', pinned_version: '', targets: ['t1'], distributions: [], project: 'notes' } });
  state.snapshot = await fake.request('snapshot');
  fake.calls.length = 0;
  await act('remove-project', { id: 'notes' });
  assert.match(asked[0].text, /Its installed plugin stays as it is; Sync shows it as changed until the project is in your list again\./);
  await confirm();
  assert.deepEqual(fake.calls.map(c => c.action), ['snapshot', 'remove_project', 'projects'], 'the refused request never reached the service: the registry was read, the request sent again');
  assert.deepEqual(state.projects.list?.map(p => p.id), ['marionette']);
  assert.equal(state.error, null);
});
test('the service\'s refusal to remove the default project reaches the banner, and the list is not read again', async () => {
  const { act, fake, state, confirm } = await withNotes();
  state.projects.list = [summary({ included: false })];       // a page that did not know the project is the shipped one
  await act('remove-project', { id: 'marionette' });
  await confirm();
  assert.equal(state.error, 'The default project stays in the list');
  assert.deepEqual(fake.calls.map(c => c.action), ['remove_project']);
  assert.ok(fake.calls.length === 1 && (await fake.request('projects')).some((p: ProjectSummary) => p.id === 'marionette'));
});
test('Remove from list for a project the page does not list, or before the registry was read, does nothing', async () => {
  const { act, fake, asked } = await withNotes();
  await act('remove-project', { id: 'nobody' });
  await act('remove-project', {});
  assert.deepEqual([asked.length, fake.calls.length], [0, 0]);
});
