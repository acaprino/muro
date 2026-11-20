import type { ViewState, ProjectSummary, ProjectInfo, ProjectStep } from '../types.ts';
import type { App, Actions, TextBox } from '../context.ts';
import { cellState } from '../model.ts';
import { esc, plural, sym, tag, spin, button, head, empty, icon } from '../ui.ts';
import { STEPS, STATE, fresh } from './project/state.ts';
import * as inputs from './project/inputs.ts';
import * as install from './project/install.ts';
import * as harmonize from './project/harmonize.ts';
import * as graph from './project/graph.ts';

/** The Projects tab: the list of project files, and the page of the open one with its four steps. What each step shows and does is in pages/project/*.ts: this module
 * owns the list, the page's header, the tabs (a tablist with arrow keys), the reading of the list and of the project, and forwards a step's events to it. The write side
 * (new project, harmonize, add an input, move a pin, edit a record) is plan 3. A project's state is "Harmonized" until plan 3 computes the others. */
interface Step {
  view(state: ViewState, info: ProjectInfo): string;
  actions: Actions;
  input?(app: App, el: TextBox): boolean;
  change?(app: App, el: TextBox): boolean;
}
const steps: Record<ProjectStep, Step> = { inputs, harmonize, graph, install };
const message = (e: unknown) => String(e instanceof Error ? e.message : e);
const flat = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
const day = (iso: string) => /^\d{4}-\d{2}-\d{2}/.exec(iso)?.[0] ?? iso;
const count = (n: number | undefined, one: string, many?: string) => typeof n === 'number' ? plural(n, one, many) : '';

// ---------- the list ----------
const nameOf = (p: ProjectSummary) => p.project?.name || p.plugin?.name || p.id;
function item(state: ViewState, p: ProjectSummary): string {
  if (p.error) return `<li>${sym(nameOf(p))}<div class="grow"><strong>${esc(p.path.split(/[\\/]/).pop() || p.id)}</strong><small class="break">${esc(p.error)}</small></div>${tag('Cannot be read', 'bad')}</li>`;
  const counts = [count(p.inputs, 'input'), count(p.capabilities, 'capability', 'capabilities')].filter(Boolean).join(' · ');
  return `<li class="go"><button type="button" data-action="open-project" data-id="${esc(p.id)}">${sym(nameOf(p))}<span class="grow"><strong>${esc(nameOf(p))}${p.plugin?.version ? ` <span class="muted">${esc(p.plugin.version)}</span>` : ''}${p.project?.builtin ? ' <span class="tag">Included with Muro</span>' : ''}</strong><small class="pfile" title="${esc(p.path)}">${esc(p.path)}</small></span>${counts ? `<small class="nowrap">${esc(counts)}</small>` : ''}${tag(STATE.label, STATE.tone)}<small class="nowrap">${esc(install.installLine(state, p.id))}</small>${icon('chev')}</button></li>`;
}
/** The plugins of the list that are no project's: installed as their author ships them, with the harnesses that have no version of them. */
function published(state: ViewState): string {
  const s = state.snapshot!, own = s.registry.plugins.filter(p => !p.project);
  if (!own.length) return '';
  return `<div class="sec"><h2>Installed as published</h2><span class="count">${own.length}</span></div><p class="sub muted">Plugins Muro installs as their author ships them.</p><ul class="card list">${own.map(p => {
    const missing = s.registry.targets.filter(t => t.enabled && p.targets.includes(t.id) && cellState(p, t, s, state.plan).kind === 'needs-build');
    return `<li>${sym(p.name)}<div class="grow"><strong>${esc(p.name)}${p.upstream_version ? ` <span class="muted">${esc(p.upstream_version)}</span>` : ''}</strong><small title="${esc(p.source)}">${esc(p.source)}</small></div>${missing.length ? tag(`No version for ${missing.map(t => t.name).join(', ')}`, 'warn') : ''}</li>`;
  }).join('')}</ul>`;
}
function listPage(state: ViewState): string {
  const pr = state.projects, open = pr.noPicker ? '' : button('Open project file…', 'open-project-file', { icon: 'folder' });
  const body = pr.list === null
    ? (pr.error ? empty('Projects could not be read', pr.error, button('Try again', 'retry-projects')) : `<div class="card empty">${spin}<strong>Reading your projects…</strong></div>`)
    : pr.list.length ? `<ul class="card list">${pr.list.map(p => item(state, p)).join('')}</ul>` : empty('No project yet', 'Open a project file to add it here.', open);
  return head('Projects', 'A project turns plugins and skills into one plugin, harmonized by the AI, for every harness.', open) + body + (state.snapshot ? published(state) : '');
}

// ---------- the project page ----------
/** What a tab says under its name. */
function sub(state: ViewState, info: ProjectInfo, step: ProjectStep): string {
  if (step === 'inputs') return plural(info.inputs.length, 'input');
  if (step === 'harmonize') return STATE.label;
  if (step === 'graph') return `${plural(info.graph.capabilities.length, 'capability', 'capabilities')} · ${plural(info.graph.examples.length, 'example')}`;
  return install.installLine(state, state.project!.id);
}
function holds(info: ProjectInfo): string {
  return `<details class="grow" id="project-files"><summary>What this project file holds</summary><ul class="card pfiles">${info.files.map(f => `<li><strong>${esc(f.part)}</strong><span>${esc(f.detail)}</span><code class="muted">${esc(f.path)}</code></li>`).join('')}<li><strong class="muted">Offline</strong><span class="muted">The file carries everything: the project rebuilds and installs without the network.</span><span></span></li></ul></details>`;
}
function projectHead(state: ViewState, info: ProjectInfo): string {
  const p = info.project, file = state.projects.list?.find(x => x.id === state.project!.id)?.path, repo = p.repository;
  return `<div class="projhead">${sym(p.name)}<h1>${esc(p.name)}</h1>${tag(info.plugin.version)}${tag(STATE.label, STATE.tone)}${p.builtin ? tag('Included with Muro') : ''}</div>`
    + `<div class="projfile">${file ? `<code>${esc(file)}</code>${state.projects.noFolder ? '' : button('Open folder', 'open-folder', { sm: true, icon: 'folder', id: file })}` : ''}<span>${repo ? `Repository <code>${esc(repo.url.replace(/^https?:\/\//, ''))}</code> · ${esc(repo.branch)}` : 'No Git repository set'} · by ${esc(p.author)} · created ${esc(day(p.created))}</span>${holds(info)}</div>`;
}
function tabs(state: ViewState, info: ProjectInfo): string {
  const now = state.project!.step;
  return `<div class="steps4" role="tablist" aria-label="Project steps">${STEPS.map(([id, label], i) => `<button type="button" role="tab" id="step-tab-${id}" aria-selected="${now === id}" aria-controls="step-panel" tabindex="${now === id ? 0 : -1}" ${now === id ? 'aria-current="step" ' : ''}data-action="step" data-id="${id}"><span class="num" aria-hidden="true">${i + 1}</span><span class="t"><strong>${label}</strong><small>${esc(sub(state, info, id))}</small></span></button>`).join('')}</div>`;
}
function projectPage(state: ViewState): string {
  const pv = state.project!, pr = state.projects, crumb = `<div class="crumb">${button('Projects', 'close-project', { sm: true, icon: 'back' })}</div>`;
  if (pr.infoError && pr.infoId === pv.id) return crumb + empty('This project could not be read', pr.infoError, button('Try again', 'retry-projects'));
  const info = pr.infoId === pv.id ? pr.info : null;
  if (!info) return crumb + `<div class="card empty">${spin}<strong>Reading the project…</strong></div>`;
  return crumb + projectHead(state, info) + tabs(state, info) + `<div role="tabpanel" id="step-panel" aria-labelledby="step-tab-${pv.step}">${steps[pv.step].view(state, info)}</div>`;
}
export function view(state: ViewState): string {
  return state.project ? projectPage(state) : listPage(state);
}

// ---------- reading ----------
/** The list of project files. A failure is the page's own (it shows where the list would be), never the app's banner: nobody asked for it. */
async function loadList(app: App): Promise<void> {
  const pr = app.state.projects;
  pr.loading = true; pr.error = null; app.render();
  try { pr.list = await app.request<ProjectSummary[]>('projects'); }
  catch (e) { pr.error = message(e); }
  finally { pr.loading = false; app.render(); }
}
/** The open project. The old one stays on the page while it is read again; an answer for a project that is no longer the open one is dropped. */
async function loadInfo(app: App, id: string): Promise<void> {
  const pr = app.state.projects;
  if (pr.infoId !== id) pr.info = null;
  pr.infoId = id; pr.infoLoading = true; pr.infoError = null; app.render();
  try { const info = await app.request<ProjectInfo>('project', { id }); if (app.state.project?.id === id && pr.infoId === id) pr.info = info; }
  catch (e) { if (app.state.project?.id === id && pr.infoId === id) pr.infoError = message(e); }
  finally { if (pr.infoId === id) pr.infoLoading = false; app.render(); }
}
/** The tab was opened (and Try again): the list is read again, then the open project, which is closed when the list no longer holds it. */
export async function opened(app: App): Promise<void> {
  await loadList(app);
  const pv = app.state.project, pr = app.state.projects;
  if (!pv || !pr.list) return;
  if (!pr.list.some(p => p.id === pv.id)) { app.state.project = null; app.render(); return; }
  await loadInfo(app, pv.id);
}

// ---------- the shell ----------
/** A request only the shell answers (a file dialog, a folder). A shell that does not know it yet says so in the service's words: the control is then hidden for this session. */
async function viaShell<T>(app: App, action: string, payload: Record<string, unknown>, missing: 'noPicker' | 'noFolder', words: string): Promise<T | undefined> {
  try { return await app.request<T>(action, payload); }
  catch (e) {
    if (!(/unknown/i.test(message(e)) && message(e).includes(action))) throw e;
    app.state.projects[missing] = true; app.render(); app.notify(`This version of Muro cannot ${words} yet.`, 'bad');
    return undefined;
  }
}
async function openFile(app: App): Promise<void> {
  const picked = await viaShell<{ path: string | null } | null>(app, 'pick_file', { filter: 'Muro project (*.mp)' }, 'noPicker', 'open a file dialog');
  const path = picked?.path;
  if (!path) return;
  await app.run('Opening the project file…', () => app.request('open_project', { path }), async () => {
    await loadList(app);
    const added = app.state.projects.list?.find(p => flat(p.path) === flat(path));
    app.notify(`${added ? nameOf(added) : 'The project'} added to your list.`, 'good');
  });
}

// ---------- the page's actions and events ----------
function merge(...sets: Actions[]): Actions {
  const all: Actions = {};
  for (const set of sets) for (const [name, fn] of Object.entries(set)) { if (name in all) throw new Error(`The action "${name}" is declared twice in the project page`); all[name] = fn; }
  return all;
}
const own: Actions = {
  'open-project': (app, d) => { if (!d.id) return; app.state.project = fresh(d.id); return loadInfo(app, d.id); },
  'close-project': app => { const pr = app.state.projects; app.state.project = null; pr.info = null; pr.infoId = null; pr.infoLoading = false; pr.infoError = null; app.render(); },
  step: (app, d) => { const pv = app.state.project, id = STEPS.find(([s]) => s === d.id)?.[0]; if (pv && id) { pv.step = id; app.render(); } },
  'retry-projects': app => opened(app),
  'open-project-file': openFile,
  'open-folder': async (app, d) => { if (d.id) await viaShell(app, 'open_folder', { path: d.id }, 'noFolder', 'open folders'); },
};
export const actions: Actions = merge(own, ...Object.values(steps).map(s => s.actions));

/** The step a key moves to from the one it is pressed on: arrows wrap around, Home and End go to the ends; any other key moves nowhere. */
export function nextStep(step: ProjectStep, key: string): ProjectStep | null {
  const ids = STEPS.map(([id]) => id), at = ids.indexOf(step);
  if (at < 0) return null;
  return key === 'ArrowRight' ? ids[(at + 1) % ids.length] : key === 'ArrowLeft' ? ids[(at + ids.length - 1) % ids.length] : key === 'Home' ? ids[0] : key === 'End' ? ids[ids.length - 1] : null;
}
/** The tablist: the arrow keys select the neighbouring step and bring the keyboard with them. The keyboard goes to the new tab first, so the render that follows finds it there. */
export function keydown(app: App, e: KeyboardEvent): boolean {
  const pv = app.state.project;
  if (app.state.page !== 'projects' || !pv || e.ctrlKey || e.metaKey || e.altKey) return false;
  const tab = e.target instanceof Element ? e.target.closest<HTMLElement>('[role=tab][data-action=step]') : null;
  if (!tab) return false;
  const next = nextStep(tab.dataset.id as ProjectStep, e.key);
  if (!next) return false;
  e.preventDefault(); tab.parentElement?.querySelector<HTMLElement>(`[data-id="${next}"]`)?.focus(); pv.step = next; app.render();
  return true;
}
export function input(app: App, el: TextBox): boolean {
  return app.state.page === 'projects' && !!app.state.project && Object.values(steps).some(s => s.input?.(app, el));
}
export function change(app: App, el: TextBox): boolean {
  return app.state.page === 'projects' && !!app.state.project && Object.values(steps).some(s => s.change?.(app, el));
}
