import test from 'node:test';
import assert from 'node:assert/strict';
import { listedPlugin, listing, inList } from '../src/model.ts';
import { sw } from '../src/ui.ts';
import * as setup from '../src/pages/setup.ts';
import { frame } from '../src/views.ts';
import { createTransport } from './fake-transport.js';
import type { Snapshot, Target, InstalledPlugin, Plugin, ViewState, Discovered } from '../src/types.ts';
import type { App } from '../src/context.ts';

const target: Target = { id: 't1', harness: 'claude-code', name: 'Claude Code', root: 'D:/config/claude-code', executable: 'claude', exclusive: false, enabled: true };
const installed: InstalledPlugin = { id: 'native-commit-helper', name: 'commit-helper', version: '2.1.0', path: 'D:/plugins/commit-helper', managed: false };
const snapshot = (plugins: Plugin[] = []): Snapshot => ({ registry: { schema: 1, revision: 3, plugins, targets: [target], settings: { auto_sync: false, interval_minutes: 60, close_to_tray: true, agent: 'claude-code', python: 'python', factory_path: '' } }, inventory: [], activity: [], sync: { last_check: null, last_sync: null, revision: null, pending: null, blockers: null, errors: null, targets: {} } });

test('an installed plugin becomes a list entry kept at the version it has, built from its own folder', () => {
  const plugin = listedPlugin(installed, target);
  assert.match(plugin.id, /^[0-9a-f-]{36}$/, 'a new id the service accepts (letters, digits, dashes)');
  assert.deepEqual({ ...plugin, id: '' }, { id: '', name: 'commit-helper', source: 'D:/plugins/commit-helper', policy: 'pinned', pinned_version: '2.1.0', targets: ['t1'], distributions: [{ harness: 'claude-code', path: 'D:/plugins/commit-helper', version: '2.1.0' }] });
  assert.notEqual(listedPlugin(installed, target).id, plugin.id, 'every entry has an id of its own');
});

test('an installed plugin that reports no version cannot be pinned, so it follows the stable policy', () => {
  const plugin = listedPlugin({ ...installed, version: '' }, target);
  assert.equal(plugin.policy, 'stable');
  assert.equal(plugin.pinned_version, '');
});

test('the list already holds a plugin Muro installed or one with a build in the folder it is installed in', () => {
  assert.equal(inList(snapshot(), target, installed), false, 'an empty list holds nothing');
  assert.equal(inList(snapshot(), target, { ...installed, managed: true }), true, 'Muro put it there');
  assert.equal(inList(snapshot([listedPlugin(installed, target)]), target, installed), true, 'an entry built from this folder');
  assert.equal(inList(snapshot([listedPlugin({ ...installed, path: 'D:/plugins/other' }, target)]), target, installed), false, 'another folder is another plugin');
  assert.equal(inList(snapshot([{ ...listedPlugin(installed, target), targets: ['t2'] }]), target, installed), false, 'an entry for another harness does not count');
  assert.equal(inList(snapshot([listedPlugin({ ...installed, path: '' }, target)]), target, { ...installed, path: '' }), false, 'no folder never matches by its emptiness');
});

test('a switch can be disabled', () => {
  assert.doesNotMatch(sw(true, 'Automatic sync', 'x'), /disabled/);
  assert.match(sw(false, 'Start Muro when Windows starts', 'x', '', true), /role="switch" aria-checked="false" aria-label="Start Muro when Windows starts" data-action="x" data-id="" disabled>/);
});

// ---- the first run: what the three steps show, and what their actions ask of the service -----------------------------
const memory = new Map<string, string>();
/** A new session of the webview: nothing is remembered. A "reload" inside a test is a new `blank()` without this call. */
const newSession = () => { memory.clear(); (globalThis as any).sessionStorage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, String(v)), removeItem: (k: string) => void memory.delete(k) }; };
const it = (name: string, body: () => void | Promise<void>) => test(name, async () => { newSession(); await body(); });
const blank = (over: Partial<ViewState> = {}): ViewState => ({ page: 'sync', snapshot: null, discovered: [], discovering: false, plan: null, checking: false, applying: null, review: null, query: '', filter: 'all', afilter: 'all', busy: null, error: null, checkErrors: [], discoveryError: null, maintenance: null, autostart: null, setup: null, ...over });
const found = (harness: string, name: string, over: Partial<Discovered> = {}): Discovered => ({ harness, name, executable: harness, version: '1.0.0', config_root: `D:/config/${harness}`, available: true, supported: true, ...over });
const noTargets = (): Snapshot => ({ ...snapshot(), registry: { ...snapshot().registry, targets: [] } });
const withInventory = (plugins: InstalledPlugin[], over: Partial<Snapshot['inventory'][0]> = {}): Snapshot => ({ ...snapshot(), inventory: [{ target_id: 't1', complete: true, error: null, supported: true, plugins, ...over }] });
const input = (name: string, value: string, checked = true) => ({ name, value, checked }) as unknown as HTMLInputElement;
const act = (app: App, action: string) => Promise.resolve(setup.actions[action](app, {}, {} as HTMLElement));
const box = (html: string, name: string, value: string) => html.match(new RegExp(`<input[^>]*name="${name}"[^>]*value="${value}"[^>]*>`))?.[0] ?? '';
const held = (state: ViewState) => state.setup as ViewState['setup'] & { err?: string; canAutostart?: boolean };
const stepped = (step: 1 | 2 | 3, over: Partial<NonNullable<ViewState['setup']>> = {}) => ({ step, pick: {}, keep: {}, auto: true, autostart: true, ...over });

/** The page's `App` over the fake service: `run` does what app.ts does (busy while it works, a failure in `state.error`), `adopt` keeps the snapshot. */
async function session(scenario = 'first-run', wrap: (request: (a: string, p?: any) => Promise<any>) => (a: string, p?: any) => Promise<any> = r => r) {
  const fake = createTransport(scenario), state = blank(), toasts: string[] = [];
  state.snapshot = await fake.request('snapshot'); state.discovered = await fake.request('discover'); fake.calls.length = 0;
  const app = {
    state, request: wrap(fake.request), render: () => {},
    async run(label: string, work: () => Promise<unknown>, after?: (v: any) => unknown) { if (state.busy) return; state.busy = label; state.error = null; try { const value = await work(); await after?.(value); } catch (e) { state.error = String(e instanceof Error ? e.message : e); } finally { state.busy = null; } },
    notify: (text: string) => void toasts.push(text), reload: async () => {}, replan: async () => {}, adopt: (s: Snapshot) => { state.snapshot = s; }, discover: async () => {}, openDialog: () => { throw new Error('no dialog'); }, closeDialog: () => {}, confirm: () => {},
  } as unknown as App;
  const actions = () => fake.calls.map(c => c.action);
  return { fake, state, app, toasts, actions };
}

it('the first run shows when no harness is managed and goes on while one is being set up', () => {
  assert.equal(setup.needed(blank()), false, 'nothing to show before the registry is read');
  assert.equal(setup.needed(blank({ snapshot: noTargets() })), true, 'no harness is managed');
  assert.equal(setup.needed(blank({ snapshot: snapshot() })), false, 'a harness is managed');
  assert.equal(setup.needed(blank({ snapshot: snapshot(), setup: stepped(2, { pick: { 'claude-code': true } }) })), true, 'step 1 saved the harness, the setup is not done');
});

it('a setup under way is found again after the page is reloaded, and a closed one stays closed', async () => {
  const { app, state } = await session();
  setup.change!(app, input('pick', 'codex'));
  const reloaded = blank({ snapshot: snapshot() });   // the registry now holds a harness; the webview starts again
  assert.equal(setup.needed(reloaded), true, 'the record of the session brings the setup back');
  assert.deepEqual(held(reloaded)?.pick, { codex: true });
  await act(app, 'setup-later');
  assert.equal(setup.needed(blank({ snapshot: noTargets() })), false, 'closed for this session');
  assert.equal(state.setup, null);
});

it('a record the page cannot trust is ignored, and a session that keeps nothing still works', () => {
  for (const bad of ['{', 'null', '{"step":4,"pick":{},"keep":{},"auto":true,"autostart":true}', '{"step":1,"pick":{"a":"yes"},"keep":{},"auto":true,"autostart":true}', '{"step":1,"pick":{},"keep":{},"auto":1,"autostart":true}']) {
    memory.set('muro.setup', bad);
    assert.equal(setup.needed(blank({ snapshot: snapshot() })), false, `ignored: ${bad}`);
  }
  delete (globalThis as any).sessionStorage;
  assert.equal(setup.needed(blank({ snapshot: noTargets() })), true);
  assert.match(setup.view(blank({ snapshot: noTargets() })), /Which coding agents/);
});

it('step 1 lists what is found, with the ones Muro cannot manage disabled and why', () => {
  const state = blank({ snapshot: noTargets(), discovered: [found('claude-code', 'Claude Code'), found('deepseek', 'DeepSeek', { supported: false }), found('pi', 'Pi', { config_root: null }), found('hermes', 'Hermes', { available: false }), found('opencode', 'Open<Code>')] });
  const html = frame(state);
  assert.doesNotMatch(html, /<nav/, 'the tabs wait for the setup to end');
  assert.match(html, /<h1 id="setup-title" tabindex="-1" aria-describedby="setup-step">Which coding agents does Muro manage\?<\/h1>/);
  assert.match(html, /<small id="setup-step">Step 1 of 3<\/small>/);
  assert.match(html, /<code>D:\/config\/claude-code<\/code>/);
  assert.doesNotMatch(box(html, 'pick', 'claude-code'), /checked|disabled/, 'nothing is chosen for the person');
  assert.match(box(html, 'pick', 'deepseek'), /disabled/);
  assert.match(html, /Plugins are not supported yet/);
  assert.match(box(html, 'pick', 'pi'), /disabled/);
  assert.match(html, /Add it by hand from Sync, with its configuration folder/);
  assert.equal(box(html, 'pick', 'hermes'), '', 'a harness that is not on this computer is not offered');
  assert.match(html, /Open&lt;Code&gt;/);
  assert.doesNotMatch(html, /Open<Code>/);
  assert.doesNotMatch(html, /Set up later/, 'something can be picked');
  assert.match(html, /data-action="setup-next"/);
});

it('step 1 says it is looking, and when nothing can be picked offers to look again or to set up later', () => {
  assert.match(setup.view(blank({ snapshot: noTargets(), discovering: true })), /Looking for harnesses on this computer…/);
  for (const discovered of [[], [found('deepseek', 'DeepSeek', { supported: false })]]) {
    const html = setup.view(blank({ snapshot: noTargets(), discovered }));
    assert.match(html, /data-action="setup-later"/);
    assert.match(html, /data-action="setup-next"/, 'Continue stays and says what is missing');
    if (!discovered.length) { assert.match(html, /No harness found/); assert.match(html, /data-action="setup-discover"/); }
  }
});

it('step 1 shows a harness already saved as chosen, from the registry', () => {
  const state = blank({ snapshot: snapshot(), discovered: [found('claude-code', 'Claude Code')], setup: stepped(1) });
  const html = setup.view(state);
  assert.match(box(html, 'pick', 'claude-code'), /checked/);
  assert.match(html, /<code>D:\/config\/claude-code<\/code>/);
  assert.match(box(setup.view(blank({ snapshot: snapshot(), setup: stepped(1) })), 'pick', 'claude-code'), /checked/, 'a saved harness that is no longer found stays in the list');
});

it('step 2 lists what is installed on the chosen harnesses, kept unless the person unticks it', () => {
  const plugins: InstalledPlugin[] = [installed, { id: 'b', name: 'Tool <b>', version: '', path: 'D:/plugins/b', managed: false }, { id: 'c', name: 'In list', version: '1', path: 'D:/plugins/c', managed: true }, { id: 'd', name: 'No folder', version: '3', path: '', managed: false }];
  const state = blank({ snapshot: withInventory(plugins), setup: stepped(2, { pick: { 'claude-code': true }, keep: { 't1:b': false } }) });
  const html = frame(state);
  assert.match(html, /Start from what is installed/);
  assert.match(html, /<small id="setup-step">Step 2 of 3<\/small>/);
  assert.match(box(html, 'keep', 't1:native-commit-helper'), /checked/);
  assert.doesNotMatch(box(html, 'keep', 't1:b'), /checked/, 'unticked');
  assert.equal(box(html, 'keep', 't1:c'), '', 'Muro put it there: it is already in the list');
  assert.match(box(html, 'keep', 't1:d'), /disabled/);
  assert.doesNotMatch(box(html, 'keep', 't1:d'), /checked/);
  assert.match(html, /No folder to add it from/);
  assert.match(html, /Codex\b.*|Claude Code 2\.1\.0/);
  assert.match(html, /Tool &lt;b&gt;/);
  assert.doesNotMatch(html, /Tool <b>/);
  assert.match(html, /data-action="setup-back"/);
  assert.match(html, /data-action="setup-next"/);
});

it('step 2 names a harness it could not read and says when nothing is installed', () => {
  const unread = setup.view(blank({ snapshot: withInventory([], { complete: false, error: 'Configuration <folder> not found' }), setup: stepped(2, { pick: { 'claude-code': true } }) }));
  assert.match(unread, /Claude Code cannot be read/);
  assert.match(unread, /Configuration &lt;folder&gt; not found/);
  const none = setup.view(blank({ snapshot: withInventory([]), setup: stepped(2, { pick: { 'claude-code': true } }) }));
  assert.match(none, /Nothing installed yet/);
  assert.match(none, /Your list starts empty/);
});

it('step 3 offers two switches, on by default, and disables the one the shell cannot honour', () => {
  const html = setup.view(blank({ snapshot: snapshot(), setup: stepped(3) }));
  assert.match(html, /Keep them in sync by itself\?/);
  assert.match(html, /<small id="setup-step">Step 3 of 3<\/small>/);
  assert.match(html, /role="switch" aria-checked="true" aria-label="Automatic sync" data-action="setup-auto"/);
  assert.match(html, /role="switch" aria-checked="true" aria-label="Start Muro when Windows starts" data-action="setup-autostart" data-id="" >/);
  assert.match(html, /Checks every hour and applies what changed\./);
  assert.match(html, /Starts in the notification area, without opening a window\./);
  assert.match(html, /data-action="setup-finish"/);
  const off = setup.view(blank({ snapshot: snapshot(), setup: { ...stepped(3), auto: false, canAutostart: false } as any }));
  assert.match(off, /aria-checked="false" aria-label="Automatic sync"/);
  assert.match(off, /aria-checked="false" aria-label="Start Muro when Windows starts" data-action="setup-autostart" data-id="" disabled>/);
  assert.match(off, /Available on Windows/);
  assert.doesNotMatch(off, /Starts in the notification area/);
});

it('step 3 reads the interval the registry has, never a fixed hour', () => {
  const s = snapshot(); s.registry.settings.interval_minutes = 45;
  assert.match(setup.view(blank({ snapshot: s, setup: stepped(3) })), /Checks every 45 minutes and applies what changed\./);
});

it('a failure is announced in its step and tied to the heading', () => {
  const html = setup.view(blank({ snapshot: snapshot(), setup: { ...stepped(3), err: 'Version conflict: <x>' } as any }));
  assert.match(html, /<p class="err" id="setup-error" role="alert">Version conflict: &lt;x&gt;<\/p>/);
  assert.match(html, /aria-describedby="setup-step setup-error"/);
  assert.doesNotMatch(setup.view(blank({ snapshot: snapshot(), setup: stepped(3) })), /setup-error"[^>]*>[^<]/, 'no message, no text');
});

it('Continue with nothing picked says so, asks nothing of the service and stays on step 1', async () => {
  const { app, state, actions } = await session();
  await act(app, 'setup-next');
  assert.equal(held(state)?.err, 'Pick at least one harness.');
  assert.equal(held(state)?.step, 1);
  assert.deepEqual(actions(), []);
  setup.change!(app, input('pick', 'codex'));
  assert.equal(held(state)?.err, '', 'choosing clears the message');
});

it('picking one harness saves it once, scans, and moves to step 2 with the real inventory', async () => {
  const { app, state, fake, actions } = await session();
  assert.equal(setup.change!(app, input('pick', 'claude-code')), true);
  assert.equal(setup.change!(app, input('other', 'x')), false, 'an element of another page is not its business');
  await act(app, 'setup-next');
  assert.deepEqual(actions(), ['save_target', 'scan']);
  const save = fake.calls[0].payload;
  assert.equal(save.revision, 1);
  assert.deepEqual({ ...save.target, id: '' }, { id: '', harness: 'claude-code', name: 'Claude Code', root: 'D:/config/claude-code', executable: 'claude-code', enabled: true, exclusive: false });
  assert.match(save.target.id, /^[0-9a-f-]{36}$/);
  assert.equal(held(state)?.step, 2);
  assert.equal(state.snapshot!.registry.targets.length, 1);
  assert.deepEqual(JSON.parse(memory.get('muro.setup')!), { step: 2, pick: { 'claude-code': true }, keep: {}, auto: true, autostart: true });
  assert.match(setup.view(state), /commit-helper/);
});

it('a rejected save stays on step 1 with the choice kept, and Continue tries again', async () => {
  const { app, state, fake, actions } = await session();
  setup.change!(app, input('pick', 'claude-code')); setup.change!(app, input('pick', 'codex'));
  fake.flags.rejectSave = true;
  await act(app, 'setup-next');
  assert.equal(held(state)?.step, 1);
  assert.equal(held(state)?.err, 'Version conflict: reload registry');
  assert.deepEqual(held(state)?.pick, { 'claude-code': true, codex: true });
  assert.deepEqual(actions(), ['save_target'], 'it stopped at the failure');
  assert.equal(state.error, null, 'the failure is the step\'s, not a banner');
  fake.flags.rejectSave = false;
  await act(app, 'setup-next');
  assert.equal(held(state)?.step, 2);
  assert.equal(held(state)?.err, '');
});

it('a failed scan stays on step 1, and the retry does not save the harness twice', async () => {
  let fail = true;
  const { app, state, fake, actions } = await session('first-run', request => (a, p) => a === 'scan' && fail ? Promise.reject(new Error('The harness folder could not be read')) : request(a, p));
  setup.change!(app, input('pick', 'claude-code'));
  await act(app, 'setup-next');
  assert.equal(held(state)?.step, 1);
  assert.equal(held(state)?.err, 'The harness folder could not be read');
  assert.equal(held(state)?.pick['claude-code'], true);
  fail = false;
  await act(app, 'setup-next');
  assert.equal(held(state)?.step, 2);
  assert.deepEqual(actions(), ['save_target', 'scan']);   // the failed scan never reached the fake; the registry has the harness once
  assert.equal(state.snapshot!.registry.targets.length, 1);
});

it('Back keeps the saved harnesses, and ticking one off removes it when the person goes on', async () => {
  const { app, state, fake, actions } = await session();
  setup.change!(app, input('pick', 'claude-code'));
  await act(app, 'setup-next');
  await act(app, 'setup-back');
  assert.equal(held(state)?.step, 1);
  assert.equal(state.snapshot!.registry.targets.length, 1, 'Back removes nothing');
  assert.ok(!actions().includes('remove_target'));
  assert.match(box(setup.view(state), 'pick', 'claude-code'), /checked/, 'the saved harness is chosen');
  await act(app, 'setup-next');
  assert.deepEqual(actions().slice(2), ['scan'], 'nothing is saved twice');
  await act(app, 'setup-back');
  setup.change!(app, input('pick', 'claude-code', false)); setup.change!(app, input('pick', 'codex'));
  await act(app, 'setup-next');
  assert.deepEqual(actions().slice(3), ['remove_target', 'save_target', 'scan']);
  assert.deepEqual(state.snapshot!.registry.targets.map(t => t.harness), ['codex']);
  assert.match(setup.view(state), /Nothing installed yet/);
});

it('Finish with the plugin kept saves it, the settings and the start-up choice, and opens Sync', async () => {
  const { app, state, fake, actions, toasts } = await session();
  setup.change!(app, input('pick', 'claude-code'));
  await act(app, 'setup-next'); await act(app, 'setup-next');
  assert.equal(held(state)?.step, 3);
  assert.equal(held(state)?.canAutostart, true);
  fake.calls.length = 0;
  await act(app, 'setup-finish');
  assert.deepEqual(actions(), ['save_plugin', 'settings', 'set_autostart']);
  const [plugin, settings, autostart] = fake.calls;
  assert.deepEqual({ ...plugin.payload.plugin, id: '' }, { id: '', name: 'commit-helper', source: 'D:/plugins/commit-helper', policy: 'pinned', pinned_version: '2.1.0', targets: [state.snapshot!.registry.targets[0].id], distributions: [{ harness: 'claude-code', path: 'D:/plugins/commit-helper', version: '2.1.0' }] });
  assert.equal(settings.payload.settings.auto_sync, true);
  assert.equal(settings.payload.settings.interval_minutes, 60, 'the rest of the settings go with it');
  assert.equal(settings.payload.revision, plugin.payload.revision + 1, 'each save uses the revision the last one made');
  assert.deepEqual(autostart.payload, { enabled: true });
  // The plugin is the installation the person already has: the service binds it, so the first sync installs nothing over it.
  assert.deepEqual(plugin.payload.adopt, { target_id: state.snapshot!.registry.targets[0].id, native_id: 'native-commit-helper' });
  assert.equal(state.setup, null);
  assert.equal(state.page, 'sync');
  assert.equal(setup.needed(state), false, 'the tabs are back');
  assert.deepEqual(toasts, ['Muro is set up.']);
  assert.equal(state.snapshot!.registry.plugins.length, 1);
});

it('Finish with every plugin unticked imports nothing; the two switches decide the settings', async () => {
  const { app, state, fake, actions } = await session();
  setup.change!(app, input('pick', 'claude-code'));
  await act(app, 'setup-next');
  setup.change!(app, input('keep', `${state.snapshot!.registry.targets[0].id}:native-commit-helper`, false));
  await act(app, 'setup-next');
  await act(app, 'setup-auto'); await act(app, 'setup-autostart');
  assert.equal(held(state)?.auto, false); assert.equal(held(state)?.autostart, false);
  fake.calls.length = 0;
  await act(app, 'setup-finish');
  assert.deepEqual(actions(), ['settings', 'set_autostart'], 'no save_plugin');
  assert.equal(fake.calls[0].payload.settings.auto_sync, false);
  assert.deepEqual(fake.calls[1].payload, { enabled: false });
  assert.equal(state.snapshot!.registry.plugins.length, 0);
});

it('where the shell cannot start with Windows the second switch is off and Finish never asks it', async () => {
  const { app, state, fake, actions } = await session();
  fake.flags.autostartUnsupported = true;
  setup.change!(app, input('pick', 'codex'));
  await act(app, 'setup-next'); await act(app, 'setup-next');
  assert.equal(held(state)?.canAutostart, false);
  assert.match(setup.view(state), /aria-checked="false" aria-label="Start Muro when Windows starts"[^>]*disabled/);
  fake.calls.length = 0;
  await act(app, 'setup-finish');
  assert.deepEqual(actions(), ['settings']);
  assert.equal(state.setup, null);
});

it('a rejected settings save stays on step 3 with the switches as they were, and a retry saves nothing twice', async () => {
  const { app, state, fake, actions } = await session();
  setup.change!(app, input('pick', 'claude-code'));
  await act(app, 'setup-next'); await act(app, 'setup-next');
  await act(app, 'setup-auto');
  fake.flags.rejectSettings = true;
  fake.calls.length = 0;
  await act(app, 'setup-finish');
  assert.equal(held(state)?.step, 3);
  assert.equal(held(state)?.err, 'Version conflict: settings not saved');
  assert.equal(held(state)?.auto, false, 'the choice is kept');
  assert.deepEqual(actions(), ['save_plugin', 'settings']);
  assert.ok(setup.needed(state), 'still the setup');
  fake.flags.rejectSettings = false; fake.calls.length = 0;
  await act(app, 'setup-finish');
  assert.deepEqual(actions(), ['settings', 'set_autostart'], 'the plugin is in the list already');
  assert.equal(fake.calls[0].payload.settings.auto_sync, false);
  assert.equal(state.snapshot!.registry.plugins.length, 1);
  assert.equal(state.setup, null);
});

it('a plugin the service refuses is named in the message, and unticking it lets Finish go through', async () => {
  const { app, state, fake, actions } = await session();
  setup.change!(app, input('pick', 'claude-code'));
  await act(app, 'setup-next'); await act(app, 'setup-next');
  fake.flags.rejectSave = true; fake.calls.length = 0;
  await act(app, 'setup-finish');
  assert.equal(held(state)?.step, 3);
  assert.equal(held(state)?.err, 'commit-helper on Claude Code was not added: Version conflict: reload registry');
  assert.deepEqual(actions(), ['save_plugin'], 'it stopped at the plugin; nothing else was saved');
  await act(app, 'setup-back');
  setup.change!(app, input('keep', `${state.snapshot!.registry.targets[0].id}:native-commit-helper`, false));
  await act(app, 'setup-next');
  fake.calls.length = 0;
  await act(app, 'setup-finish');
  assert.deepEqual(actions(), ['settings', 'set_autostart']);
  assert.equal(state.setup, null);
});

it('Back from step 3 and a reload keep the person where they were', async () => {
  const { app, state } = await session();
  setup.change!(app, input('pick', 'codex'));
  await act(app, 'setup-next'); await act(app, 'setup-next');
  await act(app, 'setup-auto');
  const reloaded = blank({ snapshot: state.snapshot });
  assert.equal(setup.needed(reloaded), true);
  assert.deepEqual({ step: held(reloaded)?.step, auto: held(reloaded)?.auto, can: held(reloaded)?.canAutostart }, { step: 3, auto: false, can: true });
  await act(app, 'setup-back');
  assert.equal(held(state)?.step, 2);
});

it('Set up later closes the first run for the session without touching the registry', async () => {
  const { app, state, actions } = await session('first-run');
  state.discovered = [];
  await act(app, 'setup-later');
  assert.deepEqual(actions(), []);
  assert.equal(state.page, 'sync');
  assert.equal(setup.needed(state), false);
});

it('every action of the first run is named for it, so no other page can own one', () => {
  assert.deepEqual(Object.keys(setup.actions).sort(), ['setup-auto', 'setup-autostart', 'setup-back', 'setup-discover', 'setup-finish', 'setup-later', 'setup-next']);
});
