import type { ViewState, ProjectInfo } from '../../types.ts';
import type { App, Actions } from '../../context.ts';
import { esc, plural, tag, button, empty } from '../../ui.ts';
import { dlHead } from '../../sheets.ts';
import { harnessNames } from '../../model.ts';
import { obj, text, amount, capsOf, entriesOf, examplesOf, outcomeOfExample, readAnswer, readOutcome, litOf } from './graph-model.ts';
import type { Cap, Example, Outcome, Who } from './graph-model.ts';
import { drawGraph } from './graph-draw.ts';

/** Step 3, the decision graph of the project's plugin and the simulator.
 *
 * Contract with pages/projects.ts (which owns the page, the tabs and the state `state.project`):
 * - `view(state, info)`: the step's HTML for the tab panel; `state.project.sim` is this step's state.
 * - `actions`: the step's actions. Every name starts with `graph-`, except `open-capability` (`data-id` is a capability id): it opens the
 *   capability sheet from any step, and the Harmonize step's links to capabilities use it.
 * - `SimState`, `newSim()`, `restoreSim(raw)`: the simulation the page keeps in `state.project.sim` and in the session. `restoreSim` takes what
 *   a reload brings back (anything) and returns a valid state, never one that is running.
 * - `input(app, el)`, `keydown(app, e)`: the request's box; they return true when they handled the event; pages/projects.ts forwards them.
 *
 * What the simulator shows is one of three things, and the page decides none of them: a documented example (its own decision, resolved by the factory, no call), the
 * AI's decision for a free-text request (`simulate`, validated by the factory with the runtime's rules), or the reason there is none. Nothing is matched by words. */
export interface SimState {
  /** The request in the box. */
  task: string;
  /** The documented example shown (an index into `info.graph.examples`), or null. */
  example: number | null;
  /** The free-text request being waited for, or null: only this page's own count, never kept in the session. */
  run: number | null;
  /** What the box says is wrong (an empty request); never kept. */
  error: string;
  /** The last free-text outcome. */
  result: Outcome | null;
}
export const newSim = (): SimState => ({ task: '', example: null, run: null, error: '', result: null });
export function restoreSim(raw: unknown): SimState {
  const o = obj(raw) ?? {};
  return { task: text(o.task), example: typeof o.example === 'number' && Number.isInteger(o.example) && o.example >= 0 ? o.example : null, run: null, error: '', result: readOutcome(o.result) };
}

// ---------- the engine, in the words of the interface ----------
interface Engine { api: boolean; harness: string; budget: number | null; model: string; base: string }
/** The AI engine of the settings (`registry.settings.ai`); a service that has none yet has its agent (the old `agent` setting is the harness). */
function engineOf(state: ViewState): Engine {
  const settings = obj(state.snapshot?.registry.settings) ?? {}, ai = obj(settings.ai) ?? {};
  return { api: ai.engine === 'api', harness: text(ai.harness) || text(settings.agent) || 'claude-code', budget: amount(ai.budget_usd), model: text(ai.model).trim(), base: text(ai.api_base).trim() };
}
const asking = (e: Engine) => e.api ? e.model || 'the API' : harnessNames[e.harness] || e.harness;
const money = (n: number) => '$' + (n > 0 && n < 0.01 ? n.toFixed(4) : n.toFixed(2));
const took = (ms: number) => { const s = ms / 1000; if (s < 60) return `${s.toFixed(1)} s`; const t = Math.round(s); return `${Math.floor(t / 60)} min ${t % 60} s`; };
/** What the first free-text request will use and may cost. Documented examples run no AI. */
function noteText(e: Engine): string {
  if (e.api) return `Free-text requests are sent to ${e.model || 'the model set in Settings'} through ${e.base || 'the endpoint set in Settings'} and billed by your API provider. Documented examples run no AI.`;
  const name = harnessNames[e.harness] || e.harness;
  const cost = e.harness === 'codex' ? ` Muro sets no budget for ${name}.` : e.budget !== null ? ` Each costs up to ${money(e.budget)} a request.` : '';
  return `Free-text requests use ${name} on this computer, with its own credentials.${cost} Documented examples run no AI.`;
}
// The note is said until the first free-text request of the session starts, and then never again: after it, the result carries the engine and the cost.
const NOTE = 'muro.simulated';
const told = (): boolean => { try { return globalThis.sessionStorage?.getItem(NOTE) === '1'; } catch { return false; } };
const tell = (): void => { try { globalThis.sessionStorage?.setItem(NOTE, '1'); } catch { /* a session that keeps nothing says it each time */ } };
const settingsLink = '<button type="button" class="link" data-action="page" data-id="settings">Settings</button>';

// ---------- the view ----------
const whoLine = (w: Who | null): string => {
  if (!w) return '';
  const name = w.engine === 'api' ? w.model || 'the API' : harnessNames[w.harness ?? ''] || w.harness || w.engine;
  return `<small class="simwho">${esc([`Asked ${name}`, w.cost_usd !== null ? money(w.cost_usd) : '', w.duration_ms !== null ? took(w.duration_ms) : ''].filter(Boolean).join(' · '))}</small>`;
};
const quote = (asked: string) => `<p class="simask">“${esc(asked)}”</p>`;
const bullets = (list: string[]) => list.length ? `<ul class="simlist">${list.map(x => `<li class="q">${esc(x)}</li>`).join('')}</ul>` : '';
const clear = `<div>${button('Clear', 'graph-clear', { sm: true })}</div>`;

function stepList(o: Extract<Outcome, { kind: 'decision' }>): string {
  if (!o.steps.length) return '';
  return `<ol>${o.steps.map((s, i) => {
    const why = s.reason ? `<br><small>${esc(s.reason)}</small>` : s.added_as_prerequisite ? '<br><small>A prerequisite the plugin declares, added before the step that needs it.</small>' : '';
    return `<li><b aria-hidden="true">${i + 1}</b><div><button type="button" class="link" id="sim-step-${i + 1}" data-action="open-capability" data-id="${esc(s.capability)}">${esc(s.capability)}</button>${s.intent ? ` <code>${esc(s.intent)}</code>` : ''}${s.added_as_prerequisite ? ' ' + tag('Prerequisite') : ''}${why}</div></li>`;
  }).join('')}</ol>`;
}
function card(o: Outcome): string {
  if (o.kind === 'failed') return `<div class="card simres" role="alert"><div class="simtags">${tag('Could not run', 'bad')}</div>${quote(o.asked)}<strong>The simulation could not run</strong><p class="break">${esc(o.message)}</p><small>Check the AI engine in ${settingsLink}.</small>${clear}</div>`;
  if (o.kind === 'invalid') return `<div class="card simres" role="status"><div class="simtags">${tag('Invalid answer', 'bad')}</div>${quote(o.asked)}<strong>The AI's answer was not a valid decision</strong>${o.errors.length ? bullets(o.errors) : '<small>No reason was given.</small>'}<small>Nothing from it is shown on the graph.</small>${whoLine(o.who)}${clear}</div>`;
  const status = o.status === 'selected' ? tag(plural(o.steps.length, 'step'), 'good') : tag(o.status === 'no_match' ? 'No match' : 'Needs clarification', 'warn');
  return `<div class="card simres" role="status"><div class="simtags">${status}${o.example !== null ? ' ' + tag('Documented example') : ''}${o.stack.length ? ` <small>With ${esc(o.stack.join(', '))}</small>` : ''}</div>${quote(o.asked)}${stepList(o)}<p class="simreason">${esc(o.reason)}</p>${bullets(o.questions)}${whoLine(o.who)}${clear}</div>`;
}
const shownOf = (sim: SimState, examples: Example[]): Outcome | null => sim.example !== null && examples[sim.example] ? outcomeOfExample(examples[sim.example]) : sim.result;

export function view(state: ViewState, info: ProjectInfo): string {
  const caps = capsOf(info), entries = entriesOf(info), examples = examplesOf(info);
  if (!caps.length) return empty('No decision graph', 'This project\'s plugin has no capabilities to choose between, so there is nothing to simulate.');
  const sim = state.project!.sim, engine = engineOf(state), shown = shownOf(sim, examples), lit = litOf(shown), running = sim.run !== null, explain = !told();
  const box = `<textarea name="simtask" rows="3" aria-label="Request to simulate" placeholder="Write a request as you would to your coding agent"${sim.error ? ' aria-invalid="true"' : ''} aria-describedby="err-simtask${explain ? ' sim-note' : ''}">${esc(sim.task)}</textarea>`;
  const go = running ? button(`Asking ${asking(engine)}…`, 'graph-simulate', { busy: true, attrs: { 'aria-busy': 'true', 'aria-disabled': 'true' } }) : button('Simulate', 'graph-simulate', { icon: 'play' });
  const list = examples.length ? `<h3>Documented examples <span class="count">${examples.length}</span></h3><ul class="card exlist">${examples.map((e, i) => `<li><button type="button" data-action="graph-example" data-id="${i}" aria-pressed="${sim.example === i}"><strong>${esc(e.title)}</strong><small>${esc(e.task)}</small></button></li>`).join('')}</ul>` : '';
  const legend = `<div class="legend"><span><i></i>entry → capability</span><span><i class="need"></i>needs, on a condition</span><span><i class="conf"></i>never together</span>${lit.size ? '<span><i class="on"></i>activated, in order</span>' : ''}<span class="grow"></span><span>${plural(entries.length, 'entry', 'entries')} · ${plural(caps.length, 'capability', 'capabilities')}</span></div>`;
  return `<div class="two"><div class="sim"><div><h2>Simulate a request</h2><small>See which branch of the graph a request activates, and in what order.</small></div>`
    + `<div class="simbox">${box}<small class="err" id="err-simtask" role="alert">${esc(sim.error)}</small><div class="acts">${go}${running ? button('Cancel', 'graph-cancel') : ''}</div></div>`
    + `${explain ? `<p class="simnote" id="sim-note">${esc(noteText(engine))} Change this in ${settingsLink}.</p>` : ''}${shown ? card(shown) : ''}${list}</div>`
    + `<div class="card graphcard">${legend}${drawGraph(entries, caps, text(info.plugin?.slug), lit)}</div></div>`;
}

// ---------- the capability sheet ----------
/** A capability as its sheet tells it: role, entry, which inputs it comes from (the decisions that name it), the intents it answers, its branches and what it produces. */
function sheet(info: ProjectInfo, c: Cap): string {
  const entry = entriesOf(info).find(e => e.capabilities.includes(c.id));
  const decisions = Array.isArray(info.decisions) ? info.decisions : [];
  const from = [...new Set(decisions.filter(d => d && Array.isArray(d.targets) && d.targets.includes(c.id) && typeof d.source === 'string').map(d => d.source))];
  const branches = [
    ...c.after.map(id => `<li><div><span>Always runs <strong>${esc(id)}</strong> first</span></div></li>`),
    ...c.needs.map(n => `<li><div><span>Runs <strong>${esc(n.capability)}</strong> first, on a condition</span>${n.label ? `<small>${esc(n.label)}</small>` : ''}</div></li>`),
    ...c.conflicts.map(id => `<li><div><span>Never together with <strong>${esc(id)}</strong></span></div></li>`),
  ];
  return `<div class="dl">${dlHead(c.id, c.title)}`
    + `<dl class="kv"><dt>Role</dt><dd>${esc(c.role || '—')}</dd><dt>Entry</dt><dd class="stack">${entry ? `<span>${esc(entry.name)}</span>${entry.description ? `<small>${esc(entry.description)}</small>` : ''}` : '—'}</dd><dt>Comes from</dt><dd class="tags">${from.map(s => tag(s)).join('') || '—'}</dd></dl>`
    + (c.intents.length ? `<section class="ops"><h3>Activates when the request means</h3><ul>${c.intents.map(i => `<li><div><code>${esc(i.id)}</code>${i.description ? `<small>${esc(i.description)}</small>` : ''}${i.excludes ? `<small>Not for: ${esc(i.excludes)}</small>` : ''}</div></li>`).join('')}</ul></section>` : '')
    + (branches.length ? `<section class="ops"><h3>Branches</h3><ul>${branches.join('')}</ul></section>` : '')
    + (c.outputs.length ? `<section><h3>Produces</h3><div class="tags">${c.outputs.map(o => tag(o)).join('')}</div></section>` : '')
    + `<footer><button type="button" class="btn" data-close autofocus>Close</button></footer></div>`;
}

// ---------- the actions ----------
const held = (app: App): ProjectInfo | null => { const pv = app.state.project, pr = app.state.projects; return pv && pr.infoId === pv.id ? pr.info : null; };
/** The request's box, from any control of the step. */
const boxOf = (el: HTMLElement): HTMLTextAreaElement | null => el.closest?.('.two')?.querySelector<HTMLTextAreaElement>('textarea') ?? null;
/** What was typed and no event told us (the app does not hand a text area's `input` to a page): read from the box when the person acts, so the paint that follows never
 * puts the old text back. */
function keep(sim: SimState, el: HTMLElement): void { const v = boxOf(el)?.value; if (typeof v === 'string') sim.task = v; }
/** A change of the box: the text is kept, and a refusal that was about the old text goes. */
function typed(sim: SimState, box: HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement): void {
  sim.task = box.value;
  if (sim.error) { sim.error = ''; box.removeAttribute?.('aria-invalid'); box.closest?.('.two')?.querySelector('#err-simtask')?.replaceChildren(); }
}
let runs = 0;
/** A free-text request. It does not take the app's one-at-a-time lock (which would disable every button, Cancel too, for as long as an AI takes): the page waits for it
 * by itself. The answer is shown only when it is still the one waited for: cancelled, replaced by another request, or left with the project, it is dropped. */
async function simulate(app: App, _d: DOMStringMap, el: HTMLElement): Promise<void> {
  const pv = app.state.project;
  if (!pv || pv.sim.run !== null) return;
  const sim = pv.sim;
  keep(sim, el);
  const task = sim.task.trim();
  if (!task) { sim.error = 'Write a request first.'; boxOf(el)?.focus(); app.render(); return; }
  const mine = ++runs;
  Object.assign(sim, { run: mine, error: '', example: null, result: null });
  tell();
  app.render();
  let outcome: Outcome;
  try { outcome = readAnswer(await app.request<unknown>('simulate', { id: pv.id, task }), task); }
  catch (e) { outcome = { kind: 'failed', asked: task, message: String(e instanceof Error ? e.message : e) }; }
  if (app.state.project?.sim !== sim || sim.run !== mine) return;
  sim.run = null; sim.result = outcome;
  app.render();
}

export const actions: Actions = {
  'graph-simulate': simulate,
  /** The runtime has no way to stop the AI yet: the page stops waiting, and what comes later is dropped. */
  'graph-cancel': (app, _d, el) => {
    const sim = app.state.project?.sim;
    if (!sim || sim.run === null) return;
    sim.run = null;
    el.closest?.('.two')?.querySelector<HTMLElement>('[data-action="graph-simulate"]')?.focus();
    app.notify('Stopped waiting for the answer.');
    app.render();
  },
  'graph-example': (app, d, el) => {
    const pv = app.state.project, info = held(app), i = /^\d+$/.test(d.id ?? '') ? Number(d.id) : -1;
    if (!pv || !info || i < 0 || i >= (Array.isArray(info.graph?.examples) ? info.graph.examples.length : 0)) return;
    keep(pv.sim, el);
    // Looking at an example instead is the end of waiting for the AI.
    Object.assign(pv.sim, { run: null, example: pv.sim.example === i ? null : i, result: null });
    app.render();
  },
  'graph-clear': (app, _d, el) => {
    const sim = app.state.project?.sim;
    if (!sim) return;
    keep(sim, el);
    Object.assign(sim, { example: null, result: null });
    boxOf(el)?.focus();
    app.render();
  },
  'open-capability': (app, d, el) => {
    const sim = app.state.project?.sim;
    if (sim) keep(sim, el);
    if (!d.id) return;
    const info = held(app), c = info && capsOf(info).find(x => x.id === d.id);
    if (!info || !c) { app.notify('That capability is not in this project\'s graph.', 'bad'); return; }
    app.openDialog(sheet(info, c), 'sheet');
  },
};

export function input(app: App, el: HTMLInputElement | HTMLSelectElement): boolean {
  const sim = app.state.project?.sim;
  if (!sim || el.name !== 'simtask') return false;
  typed(sim, el);
  return true;
}
/** The key of a letter reaches the page before the box has it: the text is read once the key has done its work. (A shortcut with Ctrl never gets here, and a paste is read at the
 * next action; `input` is the exact way, once the app hands it a text area's events.) */
export function keydown(app: App, e: KeyboardEvent): boolean {
  const box = e.target as HTMLTextAreaElement | null, sim = app.state.project?.sim;
  if (sim && box?.name === 'simtask') setTimeout(() => { if (app.state.project?.sim === sim) typed(sim, box); });
  return false;
}
