import test from 'node:test';
import assert from 'node:assert/strict';
import type { Snapshot, ViewState, Job, Activity as Event, Target, AiSettings } from '../src/types.ts';
import type { App } from '../src/context.ts';
import { frame } from '../src/views.ts';
import { exclusiveSeg } from '../src/forms.ts';
import { elapsed } from '../src/ui.ts';
import { view as settings, change, input as typed, opened, forgetLearned, endpointError, keyNameError, parseBudget, modelError, KEY_REFUSED } from '../src/pages/settings.ts';
import { view as activity, entries, matches } from '../src/pages/activity.ts';
import { createTransport } from './fake-transport.js';

const target = (id: string, exclusive: boolean): Target => ({ id, harness: 'codex', name: id, root: '/profile', executable: 'codex', exclusive, enabled: true });
/** The registry's default `ai`, as the service stores it for a registry that never changed it. */
const AI: AiSettings = { engine: 'harness', harness: 'claude-code', budget_usd: 0.5, api_base: 'https://api.openai.com/v1', model: '', api_key_env: 'MURO_API_KEY' };
const snapshot = (over: Partial<Snapshot> = {}, settingsOver: Partial<Snapshot['registry']['settings']> = {}, aiOver: Partial<AiSettings> = {}): Snapshot => ({
  registry: { schema: 1, revision: 4, plugins: [{ id: 'docs', name: 'Docs <b>writer</b>', source: 'owner/docs', policy: 'stable', pinned_version: '', targets: [], distributions: [] }], targets: [target('one', false)], settings: { auto_sync: false, interval_minutes: 60, close_to_tray: true, agent: 'claude-code', python: 'python', factory_path: '', ai: { ...AI, ...aiOver }, ...settingsOver } },
  inventory: [], activity: [], sync: { last_check: null, last_sync: null, revision: null, pending: null, blockers: null, errors: null, targets: {} }, ...over,
});
const viewState = (s: Snapshot | null, over: Partial<ViewState> = {}): ViewState => ({ page: 'sync', snapshot: s, discovered: [], discovering: false, plan: null, checking: false, applying: null, review: null, query: '', filter: 'all', afilter: 'all', busy: null, error: null, checkErrors: [], discoveryError: null, maintenance: null, autostart: null, setup: null, ...over });
const event = (id: string, time: string, action: string, status = 'complete', message = ''): Event => ({ id, time, action, status, message });
const job = (over: Partial<Job> = {}): Job => ({ id: 'job-1', plugin_id: 'docs', harness: 'opencode', status: 'running', phase: 'harmonization', budget_usd: 2, log_path: 'C:/data/jobs/job-1/log.txt', message: 'Working', time: '1700000500', ...over });
const switchOf = (html: string, label: string) => html.match(new RegExp(`<button[^>]*role="switch"[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? '';

test('Settings has the five sections of the mockup, every setting saved on change, and no Save button', () => {
  const html = settings(viewState(snapshot(), { autostart: { supported: true, enabled: false, current: false } }));
  assert.deepEqual([...html.matchAll(/<section class="card set"><h2>([^<]+)<\/h2>/g)].map(m => m[1]), ['Sync', 'Background', 'Appearance', 'AI', 'Maintenance']);
  assert.doesNotMatch(html, /<button[^>]*>(<[^>]*>)*\s*<span>Save/, 'no button reads Save');
  assert.doesNotMatch(html, /Save settings/);
  assert.match(html, /Saved as you change them\./);
  assert.doesNotMatch(html, /Reinstall a plugin/);
});

test('a switch is a role=switch with its label and its state', () => {
  const html = settings(viewState(snapshot({}, { auto_sync: true, close_to_tray: false }), { autostart: { supported: true, enabled: true, current: true } }));
  assert.match(switchOf(html, 'Automatic sync'), /aria-checked="true"/);
  assert.match(switchOf(html, 'Keep running when the window is closed'), /aria-checked="false"/);
  assert.match(switchOf(html, 'Start Muro when Windows starts'), /aria-checked="true"/);
  assert.doesNotMatch(switchOf(html, 'Start Muro when Windows starts'), /disabled/);
});

test('the hints of Start with Windows and of Keep running follow the settings', () => {
  const on = { supported: true, enabled: true, current: true };
  assert.match(settings(viewState(snapshot({}, { auto_sync: true }), { autostart: on })), /Starts in the notification area and keeps your harnesses in line with your list\./);
  const warned = settings(viewState(snapshot(), { autostart: on }));
  assert.match(warned, /<span class="warn">Automatic sync is off: Muro starts and watches, but applies changes only when you ask\.<\/span>/);
  assert.doesNotMatch(settings(viewState(snapshot(), { autostart: { ...on, enabled: false } })), /Automatic sync is off/, 'only when it starts');
  assert.match(settings(viewState(snapshot({}, { close_to_tray: false }))), /<span class="warn">Closing the window quits Muro: nothing syncs until you open it again\.<\/span>/);
  assert.doesNotMatch(settings(viewState(snapshot())), /quits Muro/);
});

test('Start with Windows is disabled until it is read and where it is not available', () => {
  assert.match(switchOf(settings(viewState(snapshot(), { autostart: null })), 'Start Muro when Windows starts'), /disabled/);
  const html = settings(viewState(snapshot(), { autostart: { supported: false, enabled: false, current: false } }));
  assert.match(switchOf(html, 'Start Muro when Windows starts'), /disabled/);
  assert.match(html, /<small>Available on Windows<\/small>/);
});

test('the interval is used only with automatic sync on, and a stored interval none of the options names stays selected', () => {
  const off = settings(viewState(snapshot()));
  assert.match(off, /<select name="interval_minutes"[^>]* disabled>/);
  assert.match(off, /Used when automatic sync is on\./);
  const on = settings(viewState(snapshot({}, { auto_sync: true, interval_minutes: 45 })));
  assert.doesNotMatch(on, /<select name="interval_minutes"[^>]* disabled>/);
  assert.match(on, /<option value="45" selected>Every 45 minutes<\/option>/);
});

test('a stored coding agent that is not listed stays an option, so the select never shows another one', () => {
  assert.match(settings(viewState(snapshot({}, {}, { harness: 'opencode' as AiSettings['harness'] }))), /<option value="opencode" selected>opencode<\/option>/);
});

test('the rule for plugins outside the list is the Sync page\'s own control, none chosen when harnesses differ', () => {
  const group = (s: Snapshot) => settings(viewState(s)).match(/<div class="seg" role="radiogroup" aria-label="Plugins that are not in my list">.*?<\/div>/)![0];
  assert.ok(settings(viewState(snapshot())).includes(exclusiveSeg(snapshot().registry.targets)), 'one builder draws it on both pages');
  const keep = group(snapshot());
  assert.match(keep, /name="excl" value="keep" checked/);
  assert.match(keep, /name="excl" value="remove" >/);
  const all = snapshot(); all.registry.targets = [target('a', true), target('b', true)];
  assert.match(group(all), /value="remove"[^>]*checked/);
  const mixed = snapshot(); mixed.registry.targets = [target('a', true), target('b', false)];
  assert.doesNotMatch(group(mixed), /checked/);
  assert.match(settings(viewState(mixed)), /<small>Differs per harness<\/small>/);
  assert.doesNotMatch(settings(viewState(snapshot())), /Differs per harness/);
});

test('what the person typed and what the service returned is escaped on the Settings page', () => {
  const evil = '"><script>alert(1)</script>';
  const html = settings(viewState(snapshot({}, { python: evil, factory_path: evil }, { engine: 'api', harness: evil as AiSettings['harness'], api_base: evil, model: evil, api_key_env: evil }), { maintenance: { message: evil, details: [evil, '<img src=x onerror=alert(1)>'] }, autostart: null }));
  assert.doesNotMatch(html, /<script|<img/);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&lt;img src=x'));
  assert.equal(html.split(evil).length, 1, 'not once as it was typed');
});

// ---- the AI section: the engine, its fields, the variable that holds the key ---------------------------------------------
/** Plain text of some HTML: the tags gone and the entities the page writes decoded. */
const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
/** The rows of the AI section by their titles. */
const aiRows = (html: string): Record<string, string> => Object.fromEntries(html.match(/<section class="card set"><h2>AI<\/h2>.*?<\/section>/)![0].split('<div class="row">').slice(1).map(r => [r.match(/<strong>([^<]*)<\/strong>/)![1], r]));
/** The tag of the input or select named `name`, or ''. */
const control = (html: string, name: string) => html.match(new RegExp(`<(?:input|select)[^>]*name="${name}"[^>]*>`))?.[0] ?? '';
const KEY_ROW = 'Key from the environment variable';
const edit = (app: App, setting: string, value: string) => change(app, { dataset: { setting }, value } as unknown as HTMLInputElement);
const settle = () => new Promise<void>(done => setTimeout(done, 0));
/** The page's `App` over the fake service (as setup.test.ts does): `run` is app.ts's (busy while it works, a failure in `state.error`), `adopt` keeps the snapshot. */
async function session(aiOver: Partial<AiSettings> = {}) {
  const fake = createTransport('default'), state = viewState(null, { page: 'settings' }), toasts: string[] = [];
  fake.behind.settings({ ai: { ...AI, ...aiOver } });
  state.snapshot = await fake.request('snapshot'); fake.calls.length = 0;
  let renders = 0;
  const app = {
    state, request: fake.request, render: () => { renders++; },
    async run(label: string, work: () => Promise<unknown>, after?: (v: any) => unknown) { if (state.busy) return; state.busy = label; state.error = null; try { const value = await work(); await after?.(value); } catch (e) { state.error = e instanceof Error ? e.message : String(e); } finally { state.busy = null; } },
    notify: (text: string) => void toasts.push(text), adopt: (s: Snapshot) => { state.snapshot = s; },
  } as unknown as App;
  forgetLearned();
  return { fake, state, app, toasts, renders: () => renders, html: () => settings(state), saves: () => fake.calls.filter(c => c.action === 'settings').map(c => c.payload), asked: () => fake.calls.filter(c => c.action === 'env_present').map(c => c.payload) };
}

test('AI: the engine is a radio group; a coding agent shows its harness and its budget, and none of the API\'s fields', () => {
  forgetLearned();
  const html = settings(viewState(snapshot()));
  const group = html.match(/<div class="seg" role="radiogroup" aria-label="Use">.*?<\/div>/)![0];
  assert.deepEqual([...group.matchAll(/<input type="radio" name="ai_engine" data-setting="ai_engine" value="(\w+)" (checked)?[^>]*><span>([^<]+)<\/span>/g)].map(m => [m[1], !!m[2], m[3]]), [['harness', true, 'Coding agent on this computer'], ['api', false, 'OpenAI-compatible API']]);
  const select = html.match(/<select name="ai_harness"[^>]*>.*?<\/select>/)![0];
  assert.match(select, /aria-label="Coding agent"/);
  assert.deepEqual([...select.matchAll(/<option value="([^"]+)" (selected)?>([^<]+)<\/option>/g)].map(m => [m[1], !!m[2], m[3]]), [['claude-code', true, 'Claude Code · dollar budget'], ['codex', false, 'Codex · no budget limit']]);
  const budget = control(html, 'ai_budget_usd');
  assert.match(budget, /aria-label="Budget per request in USD"/);
  assert.match(budget, /value="0\.5"/);
  assert.doesNotMatch(budget, / disabled/);
  assert.match(plain(aiRows(html)['Budget per request']), /In US dollars/);
  for (const name of ['ai_api_base', 'ai_model', 'ai_api_key_env']) assert.equal(control(html, name), '', `${name} belongs to the API`);
  assert.deepEqual(Object.keys(aiRows(html)), ['Use', 'Coding agent', 'Budget per request', 'Python', 'Muro factory folder']);
  assert.match(control(html, 'python'), /value="python"/, 'Python stays');
});

test('AI: with Codex the budget is disabled and says why, and the stored one stays', () => {
  const html = settings(viewState(snapshot({}, {}, { harness: 'codex', budget_usd: 2.5 })));
  assert.match(html, /<option value="codex" selected>Codex · no budget limit<\/option>/);
  assert.match(control(html, 'ai_budget_usd'), / disabled/);
  assert.match(control(html, 'ai_budget_usd'), /value="2\.5"/);
  assert.match(plain(aiRows(html)['Budget per request']), /Codex has no budget limit\./);
});

test('AI: with the API the page asks for an endpoint, a model and the name of the variable that holds the key, never for a key', () => {
  forgetLearned();
  const html = settings(viewState(snapshot({}, {}, { engine: 'api', api_base: 'https://api.example.com/v1', model: 'big-model', api_key_env: 'MY_API_KEY' })));
  const rows = aiRows(html);
  assert.deepEqual(Object.keys(rows), ['Use', 'Endpoint', 'Model', KEY_ROW, 'Python', 'Muro factory folder']);
  assert.match(html, /<input type="radio" name="ai_engine" data-setting="ai_engine" value="api" checked>/);
  assert.match(control(html, 'ai_api_base'), /aria-label="Endpoint"[^>]*value="https:\/\/api\.example\.com\/v1"/);
  assert.match(control(html, 'ai_model'), /aria-label="Model"[^>]*value="big-model"/);
  assert.match(control(html, 'ai_api_key_env'), /aria-label="Key from the environment variable"[^>]*value="MY_API_KEY"/);
  for (const name of ['ai_harness', 'ai_budget_usd']) assert.equal(control(html, name), '', `${name} belongs to the coding agent`);
  assert.match(plain(rows[KEY_ROW]), /Muro never stores the key\. Set it in Windows' environment variables, then restart Muro\./);
  assert.doesNotMatch(html, /type="(password|search)"|autocomplete="(current|new)-password"/, 'there is no box for a key');
  for (const name of ['ai_api_base', 'ai_model', 'ai_api_key_env']) {
    assert.match(control(html, name), new RegExp(`aria-describedby="hint-${name} err-${name}"`), `${name} is described by its hint and its error`);
    assert.ok(html.includes(`<small class="err" id="err-${name}" role="alert"></small>`), `${name} has its error slot, empty`);
  }
});

test('AI: an empty model is said to be required, a model that is set is not', () => {
  const empty = aiRows(settings(viewState(snapshot({}, {}, { engine: 'api' }))))['Model'];
  assert.match(plain(empty), /Required: a request cannot run without a model\./);
  assert.ok(empty.includes('<span class="warn">'), 'a warning');
  const named = aiRows(settings(viewState(snapshot({}, {}, { engine: 'api', model: 'big-model' }))))['Model'];
  assert.doesNotMatch(plain(named), /Required/);
});

test('AI: whether the variable is set for Muro comes from the runtime, which is asked the name and nothing else', async () => {
  const s = await session({ engine: 'api', api_key_env: 'MY_API_KEY' });
  assert.match(plain(aiRows(s.html())[KEY_ROW]), /Checking…/, 'before the answer');
  await opened(s.app);
  assert.deepEqual(s.asked(), [{ name: 'MY_API_KEY' }]);
  assert.match(plain(aiRows(s.html())[KEY_ROW]), /MY_API_KEY is not set for Muro\./);
  assert.ok(aiRows(s.html())[KEY_ROW].includes('<span class="warn">MY_API_KEY is not set for Muro.</span>'));
  s.fake.flags.envSet = ['MY_API_KEY'];
  await opened(s.app);
  assert.match(plain(aiRows(s.html())[KEY_ROW]), /MY_API_KEY is set for Muro\./);
  assert.ok(aiRows(s.html())[KEY_ROW].includes('<span class="good">MY_API_KEY is set for Muro.</span>'));
  s.fake.flags.noEnvCheck = true;
  await opened(s.app);
  assert.match(plain(aiRows(s.html())[KEY_ROW]), /Could not check whether MY_API_KEY is set\./, 'a runtime that cannot say is no error banner');
  assert.equal(s.state.error, null);
});

test('AI: with a coding agent the variable is never asked about', async () => {
  const s = await session();
  await opened(s.app);
  assert.deepEqual(s.fake.calls.map(c => c.action), ['autostart']);
});

test('the endpoint rule of the registry, in the page: https, or http on this computer, no credentials, and the message repeats nothing', () => {
  for (const good of ['https://api.openai.com/v1', 'https://example.com', 'https://localhost/v1', 'http://localhost:8080/v1', 'http://LOCALHOST/v1', 'http://127.0.0.1:11434/v1', 'http://[::1]:8000/v1']) assert.equal(endpointError(good), '', good);
  const bad: [string, RegExp][] = [
    ['', /Enter the address of the API\./],
    ['api.openai.com/v1', /must be an https URL/], ['localhost:8080/v1', /must be an https URL/], ['https://', /must be an https URL/], ['javascript:alert(1)', /must be an https URL/], ['ftp://example.com/v1', /must be an https URL/],
    ['http://example.com/v1', /Plain http is allowed only on localhost; use https\./], ['http://192.168.1.5/v1', /Plain http/], ['http://localhost.example.com/v1', /Plain http/], ['http://[::2]/v1', /Plain http/],
    ['https://user:hunter2@example.com/v1', /must not hold a user name or a password/], ['https://user@example.com/v1', /user name/],
    ['https://' + 'a'.repeat(2050), /too long/],
  ];
  for (const [value, expected] of bad) {
    const text = endpointError(value);
    assert.match(text, expected, value);
    assert.ok(!value || !text.includes(value), `the message for ${value.slice(0, 20)} does not repeat it`);
  }
  assert.ok(!endpointError('https://user:hunter2@example.com/v1').includes('hunter2'));
});

test('the key variable rule of the registry, in the page: a name, never a key, and the refusal repeats nothing', () => {
  assert.equal(KEY_REFUSED, 'The key setting must name an environment variable, not hold a key');
  for (const good of ['MURO_API_KEY', '_x', 'a1', 'OPENAI_API_KEY', 'x'.repeat(128)]) assert.equal(keyNameError(good), '', good);
  for (const bad of ['sk-proj-abc123', '1ABC', 'MY KEY', 'KEY=value', '$HOME', 'a.b', 'ünï', 'x'.repeat(129)]) assert.equal(keyNameError(bad), KEY_REFUSED, bad);
  assert.equal(keyNameError(''), 'Enter the name of the environment variable.');
});

test('the budget rule: dollars above 0 and at most 100, written as digits with a point', () => {
  assert.deepEqual(['0.5', '2', '100', '0.01', '12.75'].map(parseBudget), [0.5, 2, 100, 0.01, 12.75]);
  for (const bad of ['', '0', '0.0', '-1', '100.01', '101', '1e2', '0,5', '.5', ' 2', 'two', 'NaN', 'Infinity', '1.', '1..2']) assert.equal(parseBudget(bad), null, bad);
});

test('the model rule: up to 200 bytes, no control character, and none at all is allowed', () => {
  for (const good of ['', 'gpt-4.1', 'org/model:7b-q4', 'é'.repeat(100), 'x'.repeat(200)]) assert.equal(modelError(good), '', good);
  for (const bad of ['x'.repeat(201), 'é'.repeat(101), 'a\nb', 'a\tb', 'a\u0000b', 'a\u007fb', 'a\u0085b']) assert.equal(modelError(bad), 'The model name is not valid.', JSON.stringify(bad.slice(0, 8)));
});

test('AI: an endpoint that is not https or localhost is refused where it is typed: an error in its own field, nothing sent, the box back to what is stored', async () => {
  const s = await session({ engine: 'api' });
  assert.equal(edit(s.app, 'ai_api_base', 'http://example.com/v1'), true);
  await settle();
  assert.deepEqual(s.saves(), [], 'nothing was sent');
  const html = s.html();
  assert.ok(html.includes('<small class="err" id="err-ai_api_base" role="alert">Plain http is allowed only on localhost; use https.</small>'));
  assert.match(control(html, 'ai_api_base'), /aria-invalid="true"/);
  assert.match(control(html, 'ai_api_base'), /aria-describedby="hint-ai_api_base err-ai_api_base"/);
  assert.match(control(html, 'ai_api_base'), /value="https:\/\/api\.openai\.com\/v1"/, 'the stored address, not the typed one');
  assert.equal(s.state.error, null, 'the error is the field\'s own, not the banner');
  assert.doesNotMatch(control(html, 'ai_model'), /aria-invalid/, 'no other field is marked');
});

test('AI: an endpoint that passes is trimmed and saved with the whole ai object, only its own field changed', async () => {
  const s = await session({ engine: 'api', model: 'm1' });
  const { revision, settings: stored } = s.state.snapshot!.registry;
  assert.equal(edit(s.app, 'ai_api_base', '  http://localhost:11434/v1  '), true);
  await settle();
  assert.deepEqual(s.saves(), [{ revision, settings: { ...stored, ai: { ...stored.ai, api_base: 'http://localhost:11434/v1' } } }]);
  assert.equal(s.state.snapshot!.registry.settings.ai.api_base, 'http://localhost:11434/v1');
  assert.deepEqual(s.toasts, ['Saved.']);
  assert.match(control(s.html(), 'ai_api_base'), /value="http:\/\/localhost:11434\/v1"/);
  assert.ok(s.html().includes('id="err-ai_api_base" role="alert"></small>'), 'no error');
  edit(s.app, 'ai_api_base', ' http://localhost:11434/v1'); await settle();
  assert.equal(s.saves().length, 1, 'the same address, trimmed, saves nothing');
  edit(s.app, 'ai_api_base', ''); await settle();
  assert.equal(s.saves().length, 1, 'an empty address is refused for the API');
  assert.ok(s.html().includes('id="err-ai_api_base" role="alert">Enter the address of the API.</small>'));
});

test('AI: a key typed where the name of the variable goes is refused without being repeated, held nowhere, and the box goes back to the name', async () => {
  const s = await session({ engine: 'api' });
  const pasted = 'sk-proj-ABCDEF1234567890SECRET';
  assert.equal(edit(s.app, 'ai_api_key_env', pasted), true);
  await settle();
  assert.deepEqual(s.saves(), []);
  const html = s.html();
  assert.ok(html.includes('<small class="err" id="err-ai_api_key_env" role="alert">The key setting must name an environment variable, not hold a key</small>'));
  assert.match(control(html, 'ai_api_key_env'), /aria-invalid="true"/);
  assert.match(control(html, 'ai_api_key_env'), /value="MURO_API_KEY"/, 'the stored name is back');
  for (const where of [html, JSON.stringify(s.state), JSON.stringify(s.fake.calls), JSON.stringify(s.toasts)]) assert.equal(where.includes('SECRET'), false, 'the key is in none of the page, the state, the requests');
  assert.deepEqual(s.asked(), [], 'and nothing asks the runtime about it');
  edit(s.app, 'ai_api_key_env', '   '); await settle();
  assert.ok(s.html().includes('id="err-ai_api_key_env" role="alert">Enter the name of the environment variable.</small>'));
});

test('AI: a variable name is trimmed and saved, and the page asks whether it is set', async () => {
  const s = await session({ engine: 'api' });
  s.fake.flags.envSet = ['OPENAI_API_KEY'];
  edit(s.app, 'ai_api_key_env', ' OPENAI_API_KEY '); await settle();
  assert.deepEqual(s.saves().map(p => p.settings.ai.api_key_env), ['OPENAI_API_KEY']);
  assert.deepEqual(s.asked(), [{ name: 'OPENAI_API_KEY' }]);
  assert.match(plain(aiRows(s.html())[KEY_ROW]), /OPENAI_API_KEY is set for Muro\./);
  edit(s.app, 'ai_model', 'big-model'); await settle();
  assert.equal(s.asked().length, 1, 'a model that is saved does not ask again');
});

test('AI: a budget is dollars above 0 up to 100: refused in its own field otherwise, saved as a number', async () => {
  const s = await session();
  for (const bad of ['0', '-1', '101', 'abc', '0,5', '']) {
    assert.equal(edit(s.app, 'ai_budget_usd', bad), true);
    await settle();
    assert.ok(s.html().includes('<small class="err" id="err-ai_budget_usd" role="alert">The budget is a number of US dollars above 0 and at most 100, such as 0.5.</small>'), JSON.stringify(bad));
    assert.match(control(s.html(), 'ai_budget_usd'), /aria-invalid="true"/);
    assert.match(control(s.html(), 'ai_budget_usd'), /value="0\.5"/, 'the stored budget is back');
  }
  assert.deepEqual(s.saves(), []);
  edit(s.app, 'ai_budget_usd', ' 2.5 '); await settle();
  assert.deepEqual(s.saves().map(p => p.settings.ai.budget_usd), [2.5]);
  assert.ok(s.html().includes('id="err-ai_budget_usd" role="alert"></small>'), 'the error went with the value that passed');
});

test('AI: the model is trimmed and saved; one with a control character or over 200 bytes is refused in its field', async () => {
  const s = await session({ engine: 'api' });
  for (const bad of ['a\u0007b', 'x'.repeat(201)]) { edit(s.app, 'ai_model', bad); await settle(); assert.ok(s.html().includes('id="err-ai_model" role="alert">The model name is not valid.</small>')); }
  assert.deepEqual(s.saves(), []);
  edit(s.app, 'ai_model', '  org/model:7b  '); await settle();
  assert.deepEqual(s.saves().map(p => p.settings.ai.model), ['org/model:7b']);
  edit(s.app, 'ai_model', ''); await settle();
  assert.deepEqual(s.saves().map(p => p.settings.ai.model), ['org/model:7b', ''], 'no model is a value the registry keeps: it is asked for when a request is made');
});

test('AI: choosing the engine or the coding agent saves its field, and the API\'s key row is read when it appears', async () => {
  const s = await session();
  edit(s.app, 'ai_engine', 'api'); await settle();
  assert.equal(s.saves()[0].settings.ai.engine, 'api');
  assert.deepEqual(s.asked(), [{ name: 'MURO_API_KEY' }]);
  edit(s.app, 'ai_engine', 'harness'); await settle();
  edit(s.app, 'ai_harness', 'codex'); await settle();
  assert.deepEqual(s.saves().map(p => [p.settings.ai.engine, p.settings.ai.harness]), [['api', 'claude-code'], ['harness', 'claude-code'], ['harness', 'codex']]);
  assert.equal(s.saves()[2].settings.agent, 'claude-code', 'the page sends the old agent as it is stored: the registry keeps it equal to ai.harness');
  for (const [setting, value, text] of [['ai_engine', 'cloud', 'That engine is not available.'], ['ai_harness', 'gemini', 'That agent is not available.']]) {
    assert.equal(edit(s.app, setting, value), true);
    assert.equal(s.state.error, text);
  }
  assert.equal(s.saves().length, 3, 'a value the page does not list is never sent');
});

test('AI: a save that finds the registry moved reads it again and sends the change over what is stored now', async () => {
  const s = await session({ engine: 'api' });
  s.fake.behind.settings({ ai: { ...AI, engine: 'api', model: 'changed-behind' } });
  edit(s.app, 'ai_api_base', 'https://api.example.com/v1'); await settle();
  const saves = s.saves();
  assert.equal(saves.length, 2, 'refused once as stale, then sent again');
  assert.deepEqual(saves[1].settings.ai, { ...AI, engine: 'api', model: 'changed-behind', api_base: 'https://api.example.com/v1' }, 'the model that changed behind the page is not put back');
  assert.equal(s.state.error, null);
});

test('AI: a save the service refuses puts the control back and shows the service\'s words in the banner, not in the field', async () => {
  const s = await session({ engine: 'api' });
  s.fake.flags.rejectSettings = true;
  edit(s.app, 'ai_model', 'm'); await settle();
  assert.equal(s.state.error, 'Version conflict: settings not saved');
  assert.match(control(s.html(), 'ai_model'), /value=""/);
  assert.ok(s.html().includes('id="err-ai_model" role="alert"></small>'));
});

test('AI: typing in a field that holds a refusal takes the refusal away, without painting the page', async () => {
  const s = await session({ engine: 'api' });
  edit(s.app, 'ai_model', 'a\u0007b'); await settle();
  assert.ok(s.html().includes('id="err-ai_model" role="alert">The model name is not valid.</small>'));
  const slot = { textContent: 'The model name is not valid.' }, removed: string[] = [], painted = s.renders();
  const box = (setting: string) => ({ dataset: { setting }, removeAttribute: (name: string) => void removed.push(name), closest: () => ({ querySelector: () => slot }) }) as unknown as HTMLInputElement;
  assert.equal(typed(s.app, box('ai_api_base')), false, 'another field has no refusal to take away');
  assert.equal(typed(s.app, box('ai_model')), true);
  assert.equal(slot.textContent, '');
  assert.deepEqual(removed, ['aria-invalid']);
  assert.equal(s.renders(), painted, 'no paint: a paint would put the stored text in the box that holds the caret');
  assert.ok(s.html().includes('id="err-ai_model" role="alert"></small>'), 'and the next paint shows none');
});

test('a maintenance result is a status with what it removed', () => {
  const html = settings(viewState(snapshot(), { maintenance: { message: 'Removed 1 unused artifacts', details: ['old-build'] } }));
  assert.match(html, /<div class="row" role="status">.*Removed 1 unused artifacts.*<small class="break">old-build<\/small>/);
  assert.doesNotMatch(settings(viewState(snapshot())), /role="status"/);
});

test('Verify shows it is running and Clean up asks first', () => {
  const html = settings(viewState(snapshot(), { busy: 'Verifying…' }));
  assert.match(html, /data-action="maintenance-verify" [^>]*disabled>.*Verifying…/);
  assert.match(settings(viewState(snapshot())), /data-action="maintenance-cleanup"[^>]*>.*Clean up…/);
});

test('the Sync filter holds every run of the background worker, a check that only looked included', () => {
  const s = snapshot({ activity: [event('1', '10', 'Background check'), event('2', '11', 'Automatic sync', 'failed'), event('3', '12', 'settings')] });
  const kinds = entries(s).map(e => [e.title, e.kind]);
  assert.deepEqual(kinds, [['Settings saved', 'other'], ['Automatic sync failed', 'sync'], ['Background check', 'sync']]);
  assert.deepEqual(entries(s).filter(e => matches(e, 'sync')).map(e => e.title), ['Automatic sync failed', 'Background check']);
});

test('Activity: events newest first, an adaptation that is over among them, a running one not', () => {
  const s = snapshot({
    activity: [event('1', '1700000000', 'sync'), event('2', '1700000100', 'check'), event('3', '1700000100', 'settings')],
    jobs: [job({ id: 'j1', status: 'running' }), job({ id: 'j2', status: 'failed', time: '1700000050', message: 'The agent stopped' })],
  });
  assert.deepEqual(entries(s).map(e => [e.kind, e.title]), [
    ['other', 'Settings saved'], ['sync', 'Checked sources and harnesses'], ['ai', 'AI adaptation of Docs <b>writer</b> for OpenCode'], ['sync', 'Synced your harnesses'],
  ], 'the later of two events of one second comes first, and the running adaptation is no entry');
  assert.equal(entries(s).find(e => e.kind === 'ai')?.log, 'C:/data/jobs/job-1/log.txt');
});

test('Activity: a failed event is titled for its failure, an unknown action keeps the service\'s name', () => {
  const s = snapshot({ activity: [event('1', '10', 'sync', 'failed', 'The harness refused the change'), event('2', '11', 'save_plugin'), event('3', '12', 'apply'), event('4', '13', 'some_new_action', 'failed')] });
  assert.deepEqual(entries(s).map(e => e.title), ['Some new action', 'Apply', 'Plugin saved', 'Sync failed']);
});

test('Activity: the filters', () => {
  const s = snapshot({
    activity: [event('1', '10', 'sync'), event('2', '20', 'check', 'failed'), event('3', '30', 'save_target'), event('4', '35', 'x', 'cancelled')],
    jobs: [job({ id: 'a', status: 'completed', time: '40' }), job({ id: 'b', status: 'cancelled', time: '50' }), job({ id: 'c', status: 'interrupted', time: '60' }), job({ id: 'd', status: 'failed', time: '70' })],
  });
  const kinds = (f: Parameters<typeof matches>[1]) => entries(s).filter(e => matches(e, f)).length;
  assert.equal(kinds('all'), 8);
  assert.equal(kinds('sync'), 2, 'a sync run and a check');
  assert.equal(kinds('ai'), 4);
  assert.equal(kinds('problems'), 5, 'failed, cancelled and interrupted, and none that completed');
  assert.deepEqual(entries(s).filter(e => matches(e, 'problems')).map(e => e.status).sort(), ['cancelled', 'cancelled', 'failed', 'failed', 'interrupted']);
});

test('Activity: a running adaptation has its card with phase, budget, log and Cancel; the list and its filter come after', () => {
  const html = activity(viewState(snapshot({ jobs: [job()], activity: [event('1', '10', 'check', 'failed', 'Sources not resolved')] })));
  assert.match(html, /<article class="card job"[^>]*><div class="top"><i class="spin"[^>]*><\/i><h2 class="grow" id="job-0">Adapting Docs &lt;b&gt;writer&lt;\/b&gt; for OpenCode<\/h2><button[^>]*data-action="cancel-job"[^>]*data-id="job-1"/);
  assert.match(html, /<strong>harmonization<\/strong>/, 'its phase');
  assert.match(html, /<small>Working · budget up to \$2\.00<\/small>/);
  assert.match(html, /Log: C:\/data\/jobs\/job-1\/log\.txt/);
  assert.ok(html.indexOf('class="card job"') < html.indexOf('role="radiogroup"') && html.indexOf('role="radiogroup"') < html.indexOf('class="card list act"'));
  assert.match(html, /aria-label="Filter activity"/);
  assert.match(html, /<span class="tag bad">Failed<\/span>/);
  assert.deepEqual([...html.matchAll(/<span>(All|Sync|AI adaptation|Problems)<\/span>/g)].map(m => m[1]), ['All', 'Sync', 'AI adaptation', 'Problems']);
});

const START = 1700000500;
test('Activity: a running adaptation shows its phase as text, a progress bar with no value and the time it has run', () => {
  const html = activity(viewState(snapshot({ jobs: [job({ time: String(START) })] })), (START + 125) * 1000);
  const bar = html.match(/<div class="bar indeterminate"[^>]*>/)?.[0] ?? '';
  assert.match(bar, /role="progressbar"/);
  assert.match(bar, /aria-label="Adaptation in progress"/);
  assert.doesNotMatch(bar, /aria-value(now|min|max)=/, 'a bar without a value is indeterminate, whatever the page says about time');
  assert.match(bar, /aria-valuetext="harmonization, running for 2 min 5 s"/, 'what a screen reader reads when it reaches the bar');
  assert.match(html, /<strong>harmonization<\/strong>/);
  assert.match(html, /<span class="elapsed">Running for 2 min 5 s<\/span>/);
  assert.equal(html.match(/role="progressbar"/g)?.length, 1);
});

test('Activity: the elapsed time follows the clock, so each poll of the jobs moves it', () => {
  const s = snapshot({ jobs: [job({ time: String(START) })] });
  const at = (seconds: number) => activity(viewState(s), (START + seconds) * 1000);
  assert.match(at(3), /Running for 3 s</);
  assert.match(at(6), /Running for 6 s</);
  assert.match(at(61), /Running for 1 min 1 s</);
  assert.match(at(3725), /Running for 1 h 2 min</);
});

test('elapsed: seconds, minutes with seconds, hours with minutes; no time that is not a stamp, none before the start', () => {
  const at = (seconds: number) => elapsed(String(START), (START + seconds) * 1000);
  assert.deepEqual([0, 1, 59, 60, 125, 3599, 3600, 7260].map(at), ['0 s', '1 s', '59 s', '1 min 0 s', '2 min 5 s', '59 min 59 s', '1 h 0 min', '2 h 1 min']);
  assert.equal(at(-30), '0 s', 'a clock that is a little behind shows no negative time');
  assert.equal(elapsed(`${START}000`, (START + 10) * 1000), '10 s', 'a stamp in milliseconds');
  for (const value of ['', 'soon', '12', '<img>', null, undefined]) assert.equal(elapsed(value, START * 1000), '', String(value));
});

test('Activity: a running adaptation whose start is not a time still shows its bar, and says no time', () => {
  const html = activity(viewState(snapshot({ jobs: [job({ time: 'earlier' })] })), START * 1000);
  assert.match(html, /<div class="bar indeterminate" role="progressbar"[^>]*aria-valuetext="harmonization"/);
  assert.doesNotMatch(html, /Running for|class="elapsed"/);
  const noPhase = activity(viewState(snapshot({ jobs: [job({ time: String(START), phase: '' })] })), (START + 9) * 1000);
  assert.match(noPhase, /aria-valuetext="running for 9 s"/);
  assert.doesNotMatch(noPhase, /<strong><\/strong>/);
});

test('Activity: empty states', () => {
  assert.match(activity(viewState(snapshot())), /Nothing yet/);
  assert.match(activity(viewState(snapshot(), { afilter: 'problems' })), /Nothing here/);
  assert.doesNotMatch(activity(viewState(snapshot())), /class="card job"/);
});

test('Activity: everything the service, a plugin or an agent wrote is escaped', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const s = snapshot({
    activity: [event(evil, evil, evil, evil, evil)],
    jobs: [job({ plugin_id: evil, harness: evil, phase: evil, message: evil, log_path: evil, id: evil }), job({ id: 'j2', status: 'failed', plugin_id: evil, harness: evil, message: evil, log_path: evil, time: evil })],
  });
  const html = activity(viewState(s));
  assert.doesNotMatch(html, /<img/);
  assert.ok(html.includes('&lt;img src=x'));
  assert.match(html, /data-id="&lt;img src=x onerror=alert\(1\)&gt;"/);
});

test('the frame shows Settings and Activity as the current tab', () => {
  const s = snapshot();
  for (const [page, title] of [['activity', 'Activity'], ['settings', 'Settings']] as const) {
    const html = frame(viewState(s, { page }));
    assert.match(html, new RegExp(`<h1>${title}</h1>`));
    assert.match(html, new RegExp(`data-id="${page}" aria-current="page"`));
  }
  assert.match(frame(viewState(s, { page: 'activity' })), /Nothing yet/);
});
