import type { ViewState, Snapshot, Settings, Autostart, Maintenance } from '../types.ts';
import type { App, Actions } from '../context.ts';
import type { Theme } from '../look.ts';
import { intervalOptions } from '../model.ts';
import { esc, head, icon, sw, seg, button } from '../ui.ts';
import { exclusiveSeg } from '../forms.ts';
import { currentTheme, saveTheme } from '../look.ts';

/** Settings are saved as they change: there is no Save button. A switch or a choice sends the whole settings object with the
 * one field changed, at the revision of the snapshot held; a text box sends when it is left. A save the service refuses puts
 * the control back to what is stored and shows the error (the page is painted from the stored snapshot, never from the control). */
const AUTO = 'Automatic sync', TRAY = 'Keep running when the window is closed', START = 'Start Muro when Windows starts';
const VERIFYING = 'Verifying…';
const THEMES: [Theme, string][] = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];
const AGENTS: [string, string][] = [['claude-code', 'Claude Code · USD budget']];
const message = (e: unknown) => String(e instanceof Error ? e.message : e);

/** Plain text of a hint, or the same as a warning; always escaped, the row takes markup. */
const note = (text: string, warn = false) => warn ? `<span class="warn">${esc(text)}</span>` : esc(text);
const row = (title: string, hint: string, control: string) => `<div class="row"><div><strong>${esc(title)}</strong>${hint ? `<small>${hint}</small>` : ''}</div>${control}</div>`;
const option = (value: string | number, label: string, current: string | number) => `<option value="${esc(value)}" ${String(value) === String(current) ? 'selected' : ''}>${esc(label)}</option>`;
/** The agents the select offers: a stored agent that is none of them stays an option, so saving another setting never changes it. */
const agentOptions = (current: string): [string, string][] => AGENTS.some(([id]) => id === current) ? AGENTS : [...AGENTS, [current, current === 'codex' ? 'Codex · USD budget not supported' : current]];

function startHint(autostart: Autostart | null, settings: Settings): string {
  if (autostart && !autostart.supported) return note('Available on Windows');
  if (autostart?.enabled && !settings.auto_sync) return note('Automatic sync is off: Muro starts and watches, but applies changes only when you ask.', true);
  return note('Starts in the notification area and keeps your harnesses in line with your list.');
}

export function view(state: ViewState): string {
  const registry = state.snapshot!.registry, s = registry.settings, a = state.autostart, m = state.maintenance, verifying = state.busy === VERIFYING;
  return head('Settings', 'Saved as you change them.')
    + `<section class="card set"><h2>Sync</h2>${row('Plugins that are not in my list', note('Always uninstall: at every sync Muro removes from each harness what is installed there but is not in your list. One harness can differ, in its own settings.'), exclusiveSeg(registry.targets))}</section>`
    + `<section class="card set"><h2>Background</h2><p>How Muro keeps your harnesses in sync without you opening it.</p>`
    + row(AUTO, note('Checks for changes and applies them by itself.'), sw(s.auto_sync, AUTO, 'toggle-setting', 'auto_sync'))
    + row('Check', s.auto_sync ? '' : note('Used when automatic sync is on.'), `<select name="interval_minutes" data-setting="interval_minutes" aria-label="Check interval" ${s.auto_sync ? '' : 'disabled'}>${intervalOptions(s.interval_minutes).map(([minutes, label]) => option(minutes, label, s.interval_minutes)).join('')}</select>`)
    + row(START, startHint(a, s), sw(!!a?.enabled, START, 'toggle-setting', 'autostart', !a?.supported))
    + row(TRAY, s.close_to_tray ? note('Closing the window leaves Muro in the notification area. Quit from its icon there.') : note('Closing the window quits Muro: nothing syncs until you open it again.', true), sw(s.close_to_tray, TRAY, 'toggle-setting', 'close_to_tray'))
    + `</section><section class="card set"><h2>Appearance</h2>${row('Theme', note('System follows Windows.'), seg('theme', currentTheme(), THEMES, 'Theme').replace(/name="theme"/g, 'name="theme" data-setting="theme"'))}</section>`
    + `<section class="card set"><h2>AI adaptation</h2><p>An agent rebuilds a plugin for a harness that has no native version of it.</p>`
    + row('Agent', note('Runs with a dollar budget need Claude Code.'), `<select name="agent" data-setting="agent" aria-label="Agent">${agentOptions(s.agent).map(([id, label]) => option(id, label, s.agent)).join('')}</select>`)
    + row('Python', note('The command or full path of the interpreter.'), `<input class="mono" name="python" data-setting="python" aria-label="Python" value="${esc(s.python)}" autocomplete="off" spellcheck="false">`)
    + row('Muro factory folder', note('Leave empty to use the one that ships with Muro.'), `<input class="mono" name="factory_path" data-setting="factory_path" aria-label="Muro factory folder" placeholder="Built in" value="${esc(s.factory_path)}" autocomplete="off" spellcheck="false">`)
    + `</section><section class="card set"><h2>Maintenance</h2>`
    + row('Verify', note('Check stored builds and installations against what Muro recorded.'), button(verifying ? VERIFYING : 'Verify', 'maintenance-verify', { busy: verifying, disabled: verifying }))
    + row('Clean up', note('Delete stored builds that nothing uses any more.'), button('Clean up…', 'maintenance-cleanup'))
    + (m ? `<div class="row" role="status"><div><span><span class="good">${icon('check')}</span> ${esc(m.message)}</span>${m.details.map(d => `<small class="break">${esc(d)}</small>`).join('')}</div></div>` : '')
    + '</section>';
}

// ---------- saving ----------
/** The request of a save: every setting as stored, the changed ones replaced. */
const saveRequest = (app: App, patch: Partial<Settings>) => {
  const { revision, settings } = app.state.snapshot!.registry;
  return app.request<Snapshot>('settings', { revision, settings: { ...settings, ...patch } });
};
/** Keeps the snapshot a save returned. Settings do not change what a sync would do, so the plan that was current stays current:
 * its revision follows the registry's (the service does the same with the recorded sync state) and `adopt`, which replans
 * only when the held plan is of another revision, asks for none. A plan that was already out of date stays out of date. */
function accept(app: App, saved: Snapshot): void {
  const { state } = app, held = state.plan;
  if (held && held.revision === state.snapshot!.registry.revision) state.plan = { ...held, revision: saved.registry.revision };
  app.adopt(saved);
}
/** Saves `patch` unless it changes nothing. Afterwards the page is painted from what is stored, so a refused or skipped save puts the control back. */
async function save(app: App, patch: Partial<Settings>): Promise<void> {
  const stored = app.state.snapshot!.registry.settings;
  if ((Object.keys(patch) as (keyof Settings)[]).some(key => stored[key] !== patch[key]))
    await app.run('Saving settings…', () => saveRequest(app, patch), saved => { accept(app, saved); app.notify('Saved.', 'good'); });
  app.render();
}
/** Refused where it enters: the message, and the control goes back to what is stored. */
function refuse(app: App, text: string): true {
  app.state.error = text;
  app.render();
  return true;
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
  }, saved => { if (saved) accept(app, saved); app.notify('Saved.', 'good'); });
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
  'maintenance-cleanup': app => app.confirm('Clean up unused builds?', 'Only stored builds that nothing uses are deleted.', 'Clean up', () => void maintain(app, 'cleanup', 'Cleaning up…'), true),
};

export function change(app: App, el: HTMLInputElement | HTMLSelectElement): boolean {
  const setting = el.dataset.setting;
  if (!setting) return false;
  const stored = app.state.snapshot!.registry.settings, value = el.value;
  switch (setting) {
    case 'theme':
      if (THEMES.some(([id]) => id === value)) saveTheme(value as Theme);
      app.render();
      return true;
    case 'interval_minutes': {
      const minutes = /^\d+$/.test(value) ? Number(value) : NaN;
      if (!(minutes >= 1 && minutes <= 1440)) return refuse(app, 'The interval goes from 1 to 1440 minutes.');
      void save(app, { interval_minutes: minutes });
      return true;
    }
    case 'agent':
      if (!agentOptions(stored.agent).some(([id]) => id === value)) return refuse(app, 'That agent is not available.');
      void save(app, { agent: value });
      return true;
    case 'python':
      if (!value.trim()) return refuse(app, 'Enter the Python command or its full path.');
      void save(app, { python: value.trim() });
      return true;
    case 'factory_path':
      void save(app, { factory_path: value.trim() });
      return true;
  }
  return false;
}

/** The page was opened: whether Muro starts with Windows is read now, because the shell owns it and it can change outside Muro. */
export async function opened(app: App): Promise<void> {
  try { app.state.autostart = await app.request<Autostart>('autostart'); } catch (e) { app.state.error = message(e); }
  app.render();
}
