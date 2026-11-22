import type { ViewState, Snapshot, Settings, AiSettings, AiEngine, AiHarness, Autostart, Maintenance } from '../types.ts';
import type { App, Actions, TextBox } from '../context.ts';
import type { Theme } from '../look.ts';
import { intervalOptions } from '../model.ts';
import { head, sw, seg, button } from '../ui.ts';
import { exclusiveSeg } from '../forms.ts';
import { currentTheme, saveTheme, currentLook, saveLook } from '../look.ts';
import { settingsRowHtml, settingsGroupHtml, settingsMessageHtml, statusTextHtml, settingInputHtml, inputHtml, selectHtml, type FormAttributes } from '@acaprino/imago/ui';

/** Settings are saved as they change: there is no Save button. A switch or a choice sends the whole settings object with the
 * one field changed, at the revision of the snapshot held; a text box sends when it is left. A save the service refuses puts
 * the control back to what is stored and shows the error (the page is painted from the stored snapshot, never from the control). */
const AUTO = 'Automatic sync', TRAY = 'Keep running when the window is closed', START = 'Start Muro when Windows starts';
const VERIFYING = 'Verifying…';
const THEMES: [Theme, string][] = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];
const ENGINES: [AiEngine, string][] = [['harness', 'Coding agent on this computer'], ['api', 'OpenAI-compatible API']];
const HARNESSES: [AiHarness, string][] = [['claude-code', 'Claude Code · dollar budget'], ['codex', 'Codex · no budget limit']];
const KEY_TITLE = 'Key from the environment variable';
const BUDGET_REFUSED = 'The budget is a number of US dollars above 0 and at most 100, such as 0.5.';
const message = (e: unknown) => String(e instanceof Error ? e.message : e);

/** What a setting save asks to change: any field of the settings, and of `ai` only the keys it names (the rest of `ai` is read when the request is sent). */
type Patch = Partial<Omit<Settings, 'ai'>> & { ai?: Partial<AiSettings> };

// ---------- what the page holds besides the registry ----------
/** What the page learned and the registry does not keep, for as long as the window shows the page: whether the variable that holds the key is set for the Muro
 * process (`set` is null when the runtime could not say), and the one field a value was last refused in, with the words. A refusal carries its message only, never
 * what was typed: it could be a key. */
const learned: { key: { name: string; set: boolean | null } | null; refused: { field: string; text: string } | null } = { key: null, refused: null };
export const forgetLearned = (): void => { learned.key = null; learned.refused = null; };
const refusal = (field: string) => learned.refused?.field === field ? learned.refused.text : '';

// ---------- the rules of the AI settings, as the registry has them (crates/muro-registry/src/ai.rs): the page refuses where the value is typed, the service refuses again ----------
const bytes = (text: string) => new TextEncoder().encode(text).length;
/** What the registry says of a key setting that is not a variable's name. It never repeats the value: it may be a key pasted by mistake. */
export const KEY_REFUSED = 'The key setting must name an environment variable, not hold a key';
/** '' when `name` is the name of an environment variable in capitals (`^[A-Z_][A-Z0-9_]{0,63}$`: the rule of the registry and of the factory, one in all three places), else the words that refuse it. A looser rule read as a name the keys of providers that carry no hyphen (`gsk_...`, `hf_...`, plain letters and digits). */
export function keyNameError(name: string): string {
  if (!name) return 'Enter the name of the environment variable.';
  return /^[A-Z_][A-Z0-9_]{0,63}$/.test(name) ? '' : KEY_REFUSED;
}
/** '' when `base` is https, or http on this computer (localhost, 127.0.0.1, ::1), with no user name or password in it; else the words that refuse it, none of which repeats what was typed (it could hold a key). */
export function endpointError(base: string): string {
  if (!base) return 'Enter the address of the API.';
  if (bytes(base) > 2048) return 'The API address is too long.';
  const refused = 'The API address must be an https URL (http only on localhost).';
  let url: URL;
  try { url = new URL(base); } catch { return refused; }
  if (url.username || url.password) return 'The API address must not hold a user name or a password.';
  if (url.protocol === 'https:') return url.hostname ? '' : 'The API address has no host.';
  if (url.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ? '' : 'Plain http is allowed only on localhost; use https.';
  return refused;
}
/** The budget of a request in dollars: digits with an optional point, above 0 and at most 100; null for anything else. */
export function parseBudget(text: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const budget = Number(text);
  return budget > 0 && budget <= 100 ? budget : null;
}
/** '' when `model` is a name the registry keeps (at most 200 bytes, no control character; none at all is kept: it is asked for when a request is made). */
export const modelError = (model: string): string => bytes(model) <= 200 && !/\p{Cc}/u.test(model) ? '' : 'The model name is not valid.';

// ---------- the page ----------
/** Plain text of a hint, or the same as a warning; always escaped, the row takes markup. */
const note = (text: string, warn = false) => statusTextHtml(text, warn ? 'warn' : '');
/** A row: its title, a hint (markup the caller escaped) and the control. A row with a `field` is a field of the AI section: its hint and its error slot carry the ids its control is described by, and the slot holds the field's refusal. */
const row = (title: string, hint: string, control: string, field = '') => settingsRowHtml({ title, hintHtml: hint, controlHtml: control, field, error: refusal(field) });
/** A segmented choice of a setting: its radios say which setting they change, as every other control of the page does. */
const segSetting = (name: string, value: string, options: [string, string][], label: string) => seg(name, value, options, label, { attrs: { 'data-setting': name } });
/** The coding agents the select offers: a stored one that is none of them stays an option, so the select never shows another. */
const harnessOptions = (current: string): [string, string][] => HARNESSES.some(([id]) => id === current) ? HARNESSES : [...HARNESSES, [current, current]];
/** A text box of a field of the AI section: described by its hint and its error slot, and marked invalid while the field holds a refusal. `attrs` are the code's own attributes. */
const textBox = (field: string, label: string, value: string, attrs: FormAttributes = {}) => settingInputHtml({ name: field, label, value, attrs, invalid: !!refusal(field) });

function startHint(autostart: Autostart | null, settings: Settings): string {
  if (autostart && !autostart.supported) return note('Available on Windows');
  if (autostart?.enabled && !settings.auto_sync) return note('Automatic sync is off: Muro starts and watches, but applies changes only when you ask.', true);
  return note('Starts in the notification area and keeps your harnesses in line with your list.');
}

/** Whether the variable that holds the key is set for Muro, as the runtime said; the name is the one stored, and nothing else about the key is ever shown. */
function keyState(name: string): string {
  const known = learned.key?.name === name ? learned.key : null;
  if (!known) return note('Checking…');
  if (known.set === null) return note(`Could not check whether ${name} is set.`);
  return known.set ? statusTextHtml(`${name} is set for Muro.`, 'ok') : note(`${name} is not set for Muro.`, true);
}

/** What the AI section says it is for. Adapting a plugin runs Claude Code (the only agent Muro can hold to a budget) whatever engine answers simulations, so with Codex chosen as the coding agent the line says so, as the Adapt with AI dialog does. */
export function aiLead(ai: AiSettings): string {
  if (ai.harness !== 'codex') return 'How Muro reaches an AI when it needs one, to adapt a plugin or to simulate a request.';
  return ai.engine === 'api'
    ? 'How Muro reaches an AI when it needs one. The API simulates requests; adapting needs Claude Code.'
    : 'How Muro reaches an AI when it needs one. Codex simulates requests; adapting needs Claude Code.';
}

/** The AI engine: a coding agent on this computer (its harness and its budget) or an OpenAI-compatible API (its endpoint, its model and the name of the variable that holds the key). Python and the factory folder serve both. */
function aiSection(s: Settings): string {
  const ai = s.ai, api = ai.engine === 'api', codex = ai.harness === 'codex';
  const engine = api ? [
    row('Endpoint', note('Use https. Plain http is accepted only on localhost.'), textBox('ai_api_base', 'Endpoint', ai.api_base, { class: 'im-mono', placeholder: 'https://api.openai.com/v1' }), 'ai_api_base'),
    row('Model', ai.model ? note('The model name as the API knows it.') : note('Required: a request cannot run without a model.', true), textBox('ai_model', 'Model', ai.model, { class: 'im-mono' }), 'ai_model'),
    row(KEY_TITLE, `<span class="im-block" role="status">${keyState(ai.api_key_env)}</span><span class="im-block">${note("Muro never stores the key. Set it in Windows' environment variables, then restart Muro.")}</span>`, textBox('ai_api_key_env', KEY_TITLE, ai.api_key_env, { class: 'im-mono', placeholder: 'MURO_API_KEY' }), 'ai_api_key_env'),
  ] : [
    row('Coding agent', note('It signs in as it does when you use it yourself.'), selectHtml({ name: 'ai_harness', value: ai.harness, options: harnessOptions(ai.harness), label: 'Coding agent', attrs: { 'data-setting': 'ai_harness' } })),
    row('Budget per request', note(codex ? 'Codex has no budget limit.' : 'In US dollars, checked between turns: a request can end slightly above it.'), textBox('ai_budget_usd', 'Budget per request in USD', String(ai.budget_usd), { inputmode: 'decimal', disabled: codex }), 'ai_budget_usd'),
  ];
  return settingsGroupHtml(row('Use', note(api ? 'Muro calls the service itself, with a key it reads from the environment.' : "Claude Code or Codex, as installed on this computer. It reaches Muro's factory over MCP."), segSetting('ai_engine', ai.engine, ENGINES, 'Use'))
    + engine.join('')
    + row('Python', note('The command or full path of the interpreter.'), inputHtml({ name: 'python', label: 'Python', value: s.python, attrs: { class: 'im-mono', 'data-setting': 'python', autocomplete: 'off', spellcheck: 'false' } }), 'python')
    + row('Muro factory folder', note('Leave empty to use the one that ships with Muro.'), inputHtml({ name: 'factory_path', label: 'Muro factory folder', value: s.factory_path, attrs: { class: 'im-mono', 'data-setting': 'factory_path', placeholder: 'Built in', autocomplete: 'off', spellcheck: 'false' } }))
    , { title: 'AI', description: aiLead(ai) });
}

export function view(state: ViewState): string {
  const registry = state.snapshot!.registry, s = registry.settings, a = state.autostart, m = state.maintenance, verifying = state.busy === VERIFYING;
  return head('Settings', 'Saved as you change them.')
    + settingsGroupHtml(row('Plugins that are not in my list', note('Uninstall: Muro plans the removal of what is installed on a harness but is not in your list, and asks you to confirm it. The background sync never uninstalls. One harness can differ, in its own settings.'), exclusiveSeg(registry.targets)), { title: 'Sync' })
    + settingsGroupHtml(row(AUTO, note('Checks for changes and applies them by itself.'), sw(s.auto_sync, AUTO, 'toggle-setting', 'auto_sync'))
    + row('Check', s.auto_sync ? '' : note('Used when automatic sync is on.'), selectHtml({ name: 'interval_minutes', value: s.interval_minutes, options: intervalOptions(s.interval_minutes), label: 'Check interval', attrs: { 'data-setting': 'interval_minutes', disabled: !s.auto_sync } }), 'interval_minutes')
    + row(START, startHint(a, s), sw(!!a?.enabled, START, 'toggle-setting', 'autostart', !a?.supported))
    + row(TRAY, s.close_to_tray ? note('Closing the window leaves Muro in the notification area. Quit from its icon there.') : note('Closing the window quits Muro: nothing syncs until you open it again.', true), sw(s.close_to_tray, TRAY, 'toggle-setting', 'close_to_tray'))
    , { title: 'Background', description: 'How Muro keeps your harnesses in sync without you opening it.' })
    + settingsGroupHtml(row('Theme', note('System follows Windows.'), segSetting('theme', currentTheme(), THEMES, 'Theme')) + row('Look', note('Smooth or angular window styling.'), segSetting('look', currentLook(), [['smooth','Smooth'],['oni','ONI']], 'Look')), { title: 'Appearance' })
    + aiSection(s)
    + settingsGroupHtml(row('Verify', note('Check stored builds and installations against what Muro recorded.'), button(verifying ? VERIFYING : 'Verify', 'maintenance-verify', { busy: verifying, disabled: verifying }))
    + row('Clean up', note('Delete stored builds that nothing uses any more.'), button('Clean up…', 'maintenance-cleanup'))
    + (m ? settingsMessageHtml(m.message, m.details, { icon: 'check', tone: 'ok' }) : ''), { title: 'Maintenance' });
}

// ---------- saving ----------
/** The settings a request sends: those as stored, the patch laid over them, and `ai` whole with only the keys the patch names changed. */
const merged = (settings: Settings, patch: Patch): Settings => ({ ...settings, ...patch, ai: { ...settings.ai, ...patch.ai } });
/** The request of a save: every setting as stored, the changed ones replaced. A save the service refuses because the registry moved behind the page's back (the background worker, the tray) reads the registry again and sends the same change once more, over what is stored now; only a second refusal reaches the person. */
async function saveRequest(app: App, patch: Patch): Promise<Snapshot> {
  const send = () => { const { revision, settings } = app.state.snapshot!.registry; return app.request<Snapshot>('settings', { revision, settings: merged(settings, patch) }); };
  try { return await send(); }
  catch (e) {
    if (!/Registry revision changed/.test(message(e))) throw e;
    app.adopt(await app.request<Snapshot>('snapshot'), { replan: false });
    return send();
  }
}
/** Keeps the snapshot a save returned. Settings do not change what a sync would do, so the plan that was current stays
 * current: its revision follows the registry's (the service does the same with the recorded sync state), and `adopt` is
 * told not to replan, so no save of a setting asks for a plan, not even the first of a session in which nothing was checked.
 * A plan that was already out of date stays out of date, and counts as none. */
function accept(app: App, saved: Snapshot): void {
  const { state } = app, held = state.plan;
  if (held && held.revision === state.snapshot!.registry.revision) state.plan = { ...held, revision: saved.registry.revision };
  app.adopt(saved, { replan: false });
}
/** Whether the patch changes anything stored: of `ai` the keys it names are compared one by one. */
const differs = (stored: Settings, patch: Patch) => (Object.keys(patch) as (keyof Patch)[]).some(key => key === 'ai'
  ? (Object.keys(patch.ai ?? {}) as (keyof AiSettings)[]).some(k => stored.ai[k] !== patch.ai![k])
  : stored[key] !== patch[key]);
/** Saves `patch` unless it changes nothing. Afterwards the page is painted from what is stored, so a refused or skipped save puts the control back. A new engine or a new key variable is asked about, because the key row shows it. */
async function save(app: App, patch: Patch): Promise<void> {
  const stored = app.state.snapshot!.registry.settings;
  if (differs(stored, patch))
    await app.run('Saving settings…', () => saveRequest(app, patch), saved => { accept(app, saved); app.notify('Saved.'); if (patch.ai && ('engine' in patch.ai || 'api_key_env' in patch.ai)) void readKey(app); });
  app.render();
}
/** Refused where there is no field to say it in: a notice, and the control goes back to what is stored. */
function refuse(app: App, text: string): true {
  app.notify(text, 'err');
  app.render();
  return true;
}
/** Refused in a field of the AI section: the words go into the field's own slot (the field is marked invalid and described by it), and the control goes back to what is stored. What was typed is not kept anywhere. */
function refuseField(app: App, field: string, text: string): true {
  learned.refused = { field, text };
  app.render();
  return true;
}

/** Asks the runtime whether the variable that holds the key is set for the Muro process: a name goes out, `set` comes back, never a value. Only the API engine shows the answer. An answer for a name that is no longer the stored one is dropped. */
async function readKey(app: App): Promise<void> {
  const ai = app.state.snapshot?.registry.settings.ai;
  if (ai?.engine !== 'api') return;
  const name = ai.api_key_env;
  let set: boolean | null;
  try { set = (await app.request<{ set: boolean }>('env_present', { name })).set === true; } catch { set = null; }
  if (app.state.snapshot?.registry.settings.ai.api_key_env !== name) return;
  learned.key = { name, set };
  if (app.state.page === 'settings') app.render();
}

/** Start with Windows is the shell's, not a registry setting. Switched on it also turns automatic sync on when it was off (a
 * start that does nothing would be no use); switched off it leaves automatic sync as it is. */
async function startWithWindows(app: App): Promise<void> {
  const { state } = app, a = state.autostart;
  if (!a?.supported) { app.render(); return; }
  const on = !a.enabled, alsoSync = on && !state.snapshot!.registry.settings.auto_sync;
  await app.run('Saving settings…', async () => {
    state.autostart = await app.request<Autostart>('set_autostart', { enabled: on });
    return alsoSync ? await saveRequest(app, { auto_sync: true }) : null;
  }, saved => { if (saved) accept(app, saved); app.notify('Saved.'); });
}

async function maintain(app: App, kind: 'verify' | 'cleanup', label: string): Promise<void> {
  await app.run(label, () => { app.state.maintenance = null; return app.request<Maintenance>('maintenance', { kind }); }, result => { app.state.maintenance = result; });
}

export const actions: Actions = {
  'toggle-setting': (app, data) => {
    const stored = app.state.snapshot!.registry.settings;
    if (data.id === 'autostart') return startWithWindows(app);
    if (data.id === 'auto_sync') return save(app, { auto_sync: !stored.auto_sync });
    if (data.id === 'close_to_tray') return save(app, { close_to_tray: !stored.close_to_tray });
  },
  'maintenance-verify': app => maintain(app, 'verify', VERIFYING),
  'maintenance-cleanup': app => app.confirm('Clean up unused builds?', 'Only stored builds that nothing uses are deleted.', 'Delete unused builds', () => void maintain(app, 'cleanup', 'Cleaning up…'), true),
};

export function change(app: App, el: TextBox): boolean {
  const setting = el.dataset.setting;
  if (!setting) return false;
  const value = el.value;
  learned.refused = null;
  switch (setting) {
    case 'look':
      saveLook(el.value === 'oni' ? 'oni' : 'smooth'); app.render(); return true;
    case 'theme':
      if (THEMES.some(([id]) => id === value)) saveTheme(value as Theme);
      app.render();
      return true;
    case 'interval_minutes': {
      const minutes = /^\d+$/.test(value) ? Number(value) : NaN;
      if (!(minutes >= 1 && minutes <= 1440)) return refuseField(app, 'interval_minutes', 'The interval goes from 1 to 1440 minutes.');
      void save(app, { interval_minutes: minutes });
      return true;
    }
    case 'ai_engine':
      if (!ENGINES.some(([id]) => id === value)) return refuse(app, 'That engine is not available.');
      void save(app, { ai: { engine: value as AiEngine } });
      return true;
    case 'ai_harness':
      if (!HARNESSES.some(([id]) => id === value)) return refuse(app, 'That agent is not available.');
      void save(app, { ai: { harness: value as AiHarness } });
      return true;
    case 'ai_budget_usd': {
      const budget = parseBudget(value.trim());
      if (budget === null) return refuseField(app, setting, BUDGET_REFUSED);
      void save(app, { ai: { budget_usd: budget } });
      return true;
    }
    case 'ai_api_base': {
      const base = value.trim(), bad = endpointError(base);
      if (bad) return refuseField(app, setting, bad);
      void save(app, { ai: { api_base: base } });
      return true;
    }
    case 'ai_model': {
      const model = value.trim(), bad = modelError(model);
      if (bad) return refuseField(app, setting, bad);
      void save(app, { ai: { model } });
      return true;
    }
    case 'ai_api_key_env': {
      const name = value.trim(), bad = keyNameError(name);
      if (bad) return refuseField(app, setting, bad);
      void save(app, { ai: { api_key_env: name } });
      return true;
    }
    case 'python':
      if (!value.trim()) return refuseField(app, 'python', 'Enter the Python command or its full path.');
      void save(app, { python: value.trim() });
      return true;
    case 'factory_path':
      void save(app, { factory_path: value.trim() });
      return true;
  }
  return false;
}

/** Typing in a field of the AI section that holds a refusal takes the refusal away. The page is not painted: a paint would put the stored text back in the box that holds the caret. */
export function input(_app: App, el: TextBox): boolean {
  const field = el.dataset.setting;
  if (!field || learned.refused?.field !== field) return false;
  learned.refused = null;
  el.removeAttribute('aria-invalid');
  const slot = el.closest('.im-setting-row')?.querySelector('.im-field-error');
  if (slot) slot.textContent = '';
  return true;
}

/** The page was opened: whether Muro starts with Windows is read now, because the shell owns it and it can change outside Muro; so is whether the key's variable is set, when the API is the engine. Nothing held from an earlier visit is kept. */
export async function opened(app: App): Promise<void> {
  forgetLearned();
  try { app.state.autostart = await app.request<Autostart>('autostart'); } catch (e) { app.notify(message(e), 'err'); }
  app.render();
  await readKey(app);
}
