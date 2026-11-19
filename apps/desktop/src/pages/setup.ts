import type { ViewState, SetupState, Snapshot, Target, Discovered, InstalledPlugin, Autostart } from '../types.ts';
import type { App, Actions } from '../context.ts';
import { inList, listedPlugin, intervalOptions } from '../model.ts';
import { esc, mark, sw, button, empty, spin } from '../ui.ts';

/** The first run: three steps in place of the tabs while Muro manages no harness, and while the person is still going through them.
 * Step 1 saves the chosen harnesses and scans them (Back keeps them), step 2 lists what is installed on them, step 3 asks for the two switches;
 * Finish adds the plugins kept, saves `auto_sync` and tells the shell about Start with Windows. Nothing here classifies a harness or a plugin:
 * what is offered is what the service found and what the inventory holds.
 * `state.setup` is the step and the choices; `sessionStorage` keeps a copy so a reload of the page does not send the person back to the start. */

/** What the first run keeps besides `SetupState`: the message of the step that failed, and whether the shell can start with Windows (asked once, on the way to step 3). */
type Held = SetupState & { err?: string; canAutostart?: boolean };
const KEY = 'muro.setup', CLOSED = 'muro.setup.closed';
const message = (e: unknown) => String(e instanceof Error ? e.message : e);

// --- what survives a render, and a reload of the page -----------------------------------------------------------------
const store = (): Storage | null => { try { return globalThis.sessionStorage ?? null; } catch { return null; } };
const isFlags = (v: unknown): v is Record<string, boolean> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(x => typeof x === 'boolean');
/** The record of a setup under way, or null when there is none or it is not one this page wrote. */
function recall(): Held | null {
  try {
    const raw = JSON.parse(store()?.getItem(KEY) ?? 'null');
    if (!raw || ![1, 2, 3].includes(raw.step) || !isFlags(raw.pick) || !isFlags(raw.keep) || typeof raw.auto !== 'boolean' || typeof raw.autostart !== 'boolean') return null;
    return { step: raw.step, pick: raw.pick, keep: raw.keep, auto: raw.auto, autostart: raw.autostart, canAutostart: typeof raw.canAutostart === 'boolean' ? raw.canAutostart : undefined };
  } catch { return null; }
}
const remember = (s: Held) => { try { store()?.setItem(KEY, JSON.stringify({ step: s.step, pick: s.pick, keep: s.keep, auto: s.auto, autostart: s.autostart, canAutostart: s.canAutostart })); } catch { /* a session that keeps nothing: the setup works until the page is reloaded */ } };
const fresh = (): Held => ({ step: 1, pick: {}, keep: {}, auto: true, autostart: true });
/** The setup under way: in the state, or brought back from the session after a reload (it is then kept in the state). */
const held = (state: ViewState): Held | null => (state.setup ??= recall()) as Held | null;
const begin = (state: ViewState): Held => held(state) ?? (state.setup = fresh());
/** Finished or set aside for this session: the first run does not come back while the person works, even if every harness is removed. */
const dismissed = new WeakSet<ViewState>();
const closed = (state: ViewState) => dismissed.has(state) || (() => { try { return store()?.getItem(CLOSED) === '1'; } catch { return false; } })();
function close(state: ViewState) {
  state.setup = null; dismissed.add(state);
  try { store()?.removeItem(KEY); store()?.setItem(CLOSED, '1'); } catch { /* as above */ }
}

/** Shown when the registry holds no harness and the person has not set the first run aside, and for as long as a setup is under way. */
export const needed = (state: ViewState): boolean => !!state.snapshot && (held(state) !== null || (state.snapshot.registry.targets.length === 0 && !closed(state)));

// --- what step 1 and step 2 list ----------------------------------------------------------------------------------------
/** A harness of step 1: found on this computer, or already saved (by an earlier Continue). `why` is what keeps it from being chosen; empty when it can be. */
interface Row { harness: string; name: string; root: string; target?: Target; found?: Discovered; why: string }
function rows(state: ViewState): Row[] {
  const targets = state.snapshot?.registry.targets ?? [];
  const seen = state.discovered.filter(d => d.available).map((d): Row => {
    const target = targets.find(t => t.harness === d.harness);
    return { harness: d.harness, name: d.name, root: target?.root ?? d.config_root ?? '', target, found: d, why: !d.supported ? 'Plugins are not supported yet' : target || d.config_root ? '' : 'Add it by hand from Sync, with its configuration folder' };
  });
  return [...seen, ...targets.filter(t => !seen.some(r => r.harness === t.harness)).map((t): Row => ({ harness: t.harness, name: t.name, root: t.root, target: t, why: '' }))];
}
/** A harness the person chose; one that is already saved counts as chosen until they say otherwise. */
const picked = (s: Held, r: Row) => !r.why && (s.pick[r.harness] ?? !!r.target);
/** What is installed on a chosen harness and not in the list yet; `why` is what keeps it from being added. */
interface Item { key: string; target: Target; plugin: InstalledPlugin; why: string }
function installed(state: ViewState, s: Held): { items: Item[]; unread: { name: string; error: string }[] } {
  const snapshot = state.snapshot!, items: Item[] = [], unread: { name: string; error: string }[] = [];
  for (const r of rows(state)) {
    if (!r.target || !picked(s, r)) continue;
    const inventory = snapshot.inventory.find(i => i.target_id === r.target!.id);
    if (!inventory?.complete) { unread.push({ name: r.target.name, error: inventory?.error || 'Its plugins have not been read yet.' }); continue; }
    for (const plugin of inventory.plugins) if (!inList(snapshot, r.target, plugin)) items.push({ key: `${r.target.id}:${plugin.id}`, target: r.target, plugin, why: plugin.path ? '' : 'No folder to add it from' });
  }
  return { items, unread };
}
const kept = (s: Held, item: Item) => !item.why && s.keep[item.key] !== false;
const newTarget = (found: Discovered): Target => ({ id: crypto.randomUUID(), harness: found.harness, name: found.name, root: found.config_root!, executable: found.executable, enabled: true, exclusive: false });

// --- the view ------------------------------------------------------------------------------------------------------------
const card = (s: Held, body: string) => `<div class="setupwrap"><section class="setupcard" aria-labelledby="setup-title"><div class="steps" aria-hidden="true">${[1, 2, 3].map(n => `<i class="${n <= s.step ? 'on' : ''}"></i>`).join('')}</div><small id="setup-step">Step ${s.step} of 3</small>${body}</section></div>`;
const title = (s: Held, text: string, sub: string) => `<h1 id="setup-title" tabindex="-1" aria-describedby="setup-step${s.err ? ' setup-error' : ''}">${esc(text)}</h1><p class="muted">${esc(sub)}</p>`;
const failure = (s: Held) => `<p class="err" id="setup-error" role="alert">${esc(s.err)}</p>`;
const foot = (left: string, right: string) => `<div class="setupfoot">${left || '<span></span>'}${right}</div>`;
const row = (label: string, hint: string, control: string) => `<div class="row"><div><strong>${esc(label)}</strong><small>${esc(hint)}</small></div>${control}</div>`;
/** A row of step 1 or 2: a real checkbox wrapped by its label. `lead` and `note` are HTML the caller has escaped. */
const check = (name: string, value: string, on: boolean, off: boolean, lead: string, label: string, note: string) => `<li><label><input type="checkbox" name="${name}" value="${esc(value)}" ${on ? 'checked' : ''} ${off ? 'disabled' : ''}>${lead}<span><strong>${esc(label)}</strong><small>${note}</small></span></label></li>`;

function stepOne(state: ViewState, s: Held): string {
  const list = rows(state), nothing = !list.some(r => !r.why);
  const body = list.length ? `<ul class="card list pick">${list.map(r => check('pick', r.harness, picked(s, r), !!r.why || !!state.busy, mark(r.harness), r.name, r.why ? esc(r.why) : `<code>${esc(r.root)}</code>`)).join('')}</ul>`
    : state.discovering ? `<div class="card empty" role="status">${spin}<span>Looking for harnesses on this computer…</span></div>`
    : empty('No harness found', 'Muro looks for the coding agents installed on this computer. Add one by hand from Sync, with its configuration folder.', button('Look again', 'setup-discover'));
  const later = nothing && !state.discovering ? button('Set up later', 'setup-later') : '';
  return title(s, 'Which coding agents does Muro manage?', 'Found on this computer. You can add or remove harnesses later.') + body + failure(s) + foot(later, button('Continue', 'setup-next', { primary: true }));
}
function stepTwo(state: ViewState, s: Held): string {
  const { items, unread } = installed(state, s);
  const warn = unread.map(u => `<div class="banner warn" role="alert"><div><strong>${esc(u.name)} cannot be read</strong><p>${esc(u.error)}</p></div></div>`).join('');
  const list = items.length ? `<ul class="card list pick">${items.map(i => check('keep', i.key, kept(s, i), !!i.why || !!state.busy, '', i.plugin.name, `${esc(i.target.name)}${i.plugin.version ? ' ' + esc(i.plugin.version) : ''}${i.why ? ' · ' + esc(i.why) : ''}`)).join('')}</ul>`
    : unread.length ? '' : empty('Nothing installed yet', 'Your list starts empty. Add plugins from Sync afterwards.');
  return title(s, 'Start from what is installed', 'These plugins are already on the harnesses you picked. The ones you keep become your list.') + warn + list + failure(s) + foot(button('Back', 'setup-back'), button('Continue', 'setup-next', { primary: true }));
}
function stepThree(state: ViewState, s: Held): string {
  const minutes = state.snapshot?.registry.settings.interval_minutes ?? 60, every = intervalOptions(minutes).find(([m]) => m === minutes)![1], cannot = s.canAutostart === false;
  const rowsHtml = row('Automatic sync', `Checks ${every.charAt(0).toLowerCase() + every.slice(1)} and applies what changed.`, sw(s.auto, 'Automatic sync', 'setup-auto'))
    + row('Start Muro when Windows starts', cannot ? 'Available on Windows' : 'Starts in the notification area, without opening a window.', sw(cannot ? false : s.autostart, 'Start Muro when Windows starts', 'setup-autostart', '', cannot));
  return title(s, 'Keep them in sync by itself?', 'Muro can stay in the notification area and apply changes without you opening it.') + `<div class="card set">${rowsHtml}</div>` + failure(s) + foot(button('Back', 'setup-back'), button('Finish', 'setup-finish', { primary: true }));
}
export const view = (state: ViewState): string => { const s = held(state) ?? fresh(); return card(s, [stepOne, stepTwo, stepThree][s.step - 1](state, s)); };

// --- the actions ---------------------------------------------------------------------------------------------------------
/** A new step starts at its heading, so a screen reader reads where the person is; the same step keeps the focus where it was. */
function arrive() {
  const doc = globalThis.document; if (!doc) return;
  doc.getElementById('main')?.scrollTo(0, 0); doc.getElementById('setup-title')?.focus();
}
async function go(app: App, label: string, work: (s: Held) => Promise<void>) {
  const s = begin(app.state), before = s.step;
  await app.run(label, async () => { try { await work(s); s.err = ''; } catch (e) { s.err = message(e); } if (app.state.setup === s) remember(s); });
  if (s.step !== before) arrive();
}
/** Step 1 → 2: harnesses ticked off after a Back are removed, the ones chosen are saved (each once), and a scan reads what is installed on them. */
async function chooseHarnesses(app: App, s: Held) {
  const all = rows(app.state), chosen = all.filter(r => picked(s, r));
  if (!chosen.length) { s.err = 'Pick at least one harness.'; remember(s); app.render(); return; }
  await go(app, 'Saving your harnesses…', async () => {
    const revision = () => app.state.snapshot!.registry.revision;
    for (const r of all) if (r.target && !picked(s, r)) app.adopt(await app.request<Snapshot>('remove_target', { id: r.target.id, revision: revision() }));
    for (const r of chosen) if (!r.target) app.adopt(await app.request<Snapshot>('save_target', { revision: revision(), target: newTarget(r.found!) }));
    app.adopt(await app.request<Snapshot>('scan'));
    s.step = 2;
  });
}
/** Step 2 → 3: asks the shell whether it can start with Windows, once, so step 3 can say so. */
const chooseKept = (app: App, s: Held) => go(app, 'Reading what this computer supports…', async () => {
  s.canAutostart ??= (await app.request<Autostart>('autostart')).supported;
  s.step = 3;
});
/** Finish: the plugins kept join the list (one that is there already is skipped, so a retry adds nothing twice), then the settings, then Start with Windows. */
const finish = (app: App, s: Held) => go(app, 'Setting up Muro…', async () => {
  const revision = () => app.state.snapshot!.registry.revision;
  for (const item of installed(app.state, s).items) if (kept(s, item)) app.adopt(await app.request<Snapshot>('save_plugin', { revision: revision(), plugin: listedPlugin(item.plugin, item.target) }));
  app.adopt(await app.request<Snapshot>('settings', { revision: revision(), settings: { ...app.state.snapshot!.registry.settings, auto_sync: s.auto } }));
  s.canAutostart ??= (await app.request<Autostart>('autostart')).supported;
  if (s.canAutostart) await app.request<Autostart>('set_autostart', { enabled: s.autostart });
  close(app.state); app.state.page = 'sync'; app.notify('Muro is set up.', 'good');
});
const toggle = (key: 'auto' | 'autostart') => (app: App) => { const s = begin(app.state); s[key] = !s[key]; remember(s); app.render(); };

export const actions: Actions = {
  'setup-next': (app) => { const s = begin(app.state); return s.step === 1 ? chooseHarnesses(app, s) : chooseKept(app, s); },
  'setup-back': (app) => { const s = begin(app.state); if (s.step > 1) { s.step = (s.step - 1) as 1 | 2; s.err = ''; remember(s); app.render(); arrive(); } },
  'setup-finish': (app) => finish(app, begin(app.state)),
  'setup-auto': toggle('auto'),
  'setup-autostart': toggle('autostart'),
  'setup-discover': (app) => app.discover(),
  /** For a person with nothing to pick (no harness found, or none Muro can manage): Sync opens with its own way to add one by hand. */
  'setup-later': (app) => { close(app.state); app.state.page = 'sync'; app.render(); },
};

/** A tick of step 1 or 2. Nothing else on the page is this module's. */
export const change = (app: App, el: HTMLInputElement | HTMLSelectElement): boolean => {
  if (el.name !== 'pick' && el.name !== 'keep') return false;
  const s = begin(app.state);
  (el.name === 'pick' ? s.pick : s.keep)[el.value] = (el as HTMLInputElement).checked;
  s.err = ''; remember(s); app.render();
  return true;
};
