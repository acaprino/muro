import { stepNavigationHtml, stepPanelHtml } from '@acaprino/imago/ui';
import type { ViewState, ProjectSummary, ProjectInfo, ProjectStep, Snapshot } from '../types.ts';
import type { App, Actions, TextBox } from '../context.ts';
import { cellState, versionOf } from '../model.ts';
import { esc, plural, sym, tag, button, head, empty, icon } from '../ui.ts';
import { loadingPanel, failedPanel } from '../panels.ts';
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
/** "Remove from list" on every project but the one Muro ships (`included`, which the runtime says: never a field of the project file, which anyone can write). The file is not touched. */
const removal = (p: ProjectSummary) => p.included ? '' : button('Remove from list', 'remove-project', { sm: true, id: p.id, attrs: { 'aria-label': `Remove ${nameOf(p)} from the list` } });
function item(state: ViewState, p: ProjectSummary): string {
  if (p.error) return `<li>${sym(nameOf(p))}<div class="im-grow"><strong>${esc(p.path.split(/[\\/]/).pop() || p.id)}</strong><small class="im-wrap-text">${esc(p.error)}</small></div>${tag('Cannot be read', 'err')}${removal(p)}</li>`;
  const counts = [count(p.inputs, 'input'), count(p.capabilities, 'capability', 'capabilities')].filter(Boolean).join(' · ');
  return `<li class="im-list-link"><button type="button" data-action="open-project" data-id="${esc(p.id)}">${sym(nameOf(p))}<span class="im-grow"><strong>${esc(nameOf(p))}${p.plugin?.version ? ` <span class="im-muted">${esc(p.plugin.version)}</span>` : ''}${p.included ? ' <span class="im-chip">Included with Muro</span>' : ''}</strong><small class="im-ellipsis" title="${esc(p.path)}">${esc(p.path)}</small></span>${counts ? `<small class="im-nowrap">${esc(counts)}</small>` : ''}${tag(STATE.label, STATE.tone)}<small class="im-nowrap">${esc(install.installLine(state, p.id))}</small>${icon('chev')}</button>${removal(p)}</li>`;
}
/** The plugins of the list that are no project's: installed as their author ships them, with the harnesses that have no build of them. */
function published(state: ViewState): string {
  const s = state.snapshot!, own = s.registry.plugins.filter(p => !p.project);
  if (!own.length) return '';
  return `<div class="im-section-heading"><h2>Installed as published</h2><span class="im-count">${own.length}</span></div><p class="im-section-description im-muted">Plugins Muro installs as their author ships them.</p><ul class="im-panel im-surface im-stack-list" data-im-surface="sheet">${own.map(p => {
    const missing = s.registry.targets.filter(t => t.enabled && p.targets.includes(t.id) && cellState(p, t, s, state.plan).kind === 'needs-build');
    const version = versionOf(p).version;
    return `<li>${sym(p.name)}<div class="im-grow"><strong>${esc(p.name)}${version ? ` <span class="im-muted">${esc(version)}</span>` : ''}</strong><small title="${esc(p.source)}">${esc(p.source)}</small></div>${missing.length ? tag(`Needs a build for ${missing.map(t => t.name).join(', ')}`, 'warn') : ''}</li>`;
  }).join('')}</ul>`;
}
function listPage(state: ViewState): string {
  const pr = state.projects, open = pr.noPicker ? '' : button('Open project file…', 'open-project-file', { icon: 'folder' });
  const body = pr.list === null
    ? (pr.error ? failedPanel(`Projects could not be read. ${pr.error}`, button('Try again', 'retry-projects')) : loadingPanel(!!state.slow?.projects))
    : pr.list.length ? `<ul class="im-panel im-surface im-stack-list" data-im-surface="sheet">${pr.list.map(p => item(state, p)).join('')}</ul>` : empty('No project yet', 'Open a project file to add it here.', open);
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
  return `<details class="im-grow" id="project-files"><summary>What this project file holds</summary><ul class="im-panel im-surface im-file-list" data-im-surface="sheet">${info.files.map(f => `<li><strong>${esc(f.part)}</strong><span>${esc(f.detail)}</span><code class="im-muted">${esc(f.path)}</code></li>`).join('')}<li><strong class="im-muted">Offline</strong><span class="im-muted">The file carries everything: the project rebuilds and installs without the network.</span><span></span></li></ul></details>`;
}
function projectHead(state: ViewState, info: ProjectInfo): string {
  const p = info.project, file = state.projects.list?.find(x => x.id === state.project!.id)?.path, repo = p.repository;
  return `<div class="im-record-heading">${sym(p.name)}<h1>${esc(p.name)}</h1>${tag(info.plugin.version)}${tag(STATE.label, STATE.tone)}${info.included ? tag('Included with Muro') : ''}</div>`
    + `<div class="im-record-meta">${file ? `<code>${esc(file)}</code>${state.projects.noFolder ? '' : button('Open folder', 'open-folder', { sm: true, icon: 'folder', id: file })}` : ''}<span>${repo ? `Repository <code>${esc(repo.url.replace(/^https?:\/\//, ''))}</code> · ${esc(repo.branch)}` : 'No Git repository set'} · by ${esc(p.author)} · created ${esc(day(p.created))}</span>${holds(info)}</div>`;
}
function tabs(state: ViewState, info: ProjectInfo): string {
  return stepNavigationHtml(STEPS.map(([id,label])=>({id,label,detail:sub(state,info,id)})),state.project!.step,{label:'Project steps',action:'step',tabIdPrefix:'step-tab-',panelId:'step-panel'});
}
function projectPage(state: ViewState): string {
  const pv = state.project!, pr = state.projects, crumb = `<div class="im-breadcrumb-space">${button('Projects', 'close-project', { sm: true, icon: 'back' })}</div>`;
  if (pr.infoError && pr.infoId === pv.id) return crumb + failedPanel(`This project could not be read. ${pr.infoError}`, button('Try again', 'retry-projects'));
  const info = pr.infoId === pv.id ? pr.info : null;
  if (!info) return crumb + loadingPanel(!!state.slow?.project);
  return crumb + projectHead(state, info) + tabs(state, info) + stepPanelHtml(steps[pv.step].view(state,info),'step-panel',`step-tab-${pv.step}`);
}
export function view(state: ViewState): string {
  return state.project ? projectPage(state) : listPage(state);
}

// ---------- reading ----------
/** The list of project files. A failure is the page's own (it shows where the list would be), never the app's banner: nobody asked for it. */
async function loadList(app: App): Promise<void> {
  const pr = app.state.projects;
  pr.loading = true; pr.error = null; app.render();
  try { pr.list = await app.loading('projects', () => app.request<ProjectSummary[]>('projects')); }
  catch (e) { pr.error = message(e); }
  finally { pr.loading = false; app.render(); }
}
/** The open project. The old one stays on the page while it is read again; an answer for a project that is no longer the open one is dropped. */
async function loadInfo(app: App, id: string): Promise<void> {
  const pr = app.state.projects;
  if (pr.infoId !== id) pr.info = null;
  pr.infoId = id; pr.infoLoading = true; pr.infoError = null; app.render();
  try { const info = await app.loading('project', () => app.request<ProjectInfo>('project', { id })); if (app.state.project?.id === id && pr.infoId === id) pr.info = info; }
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
    app.state.projects[missing] = true; app.render(); app.notify(`This version of Muro cannot ${words} yet.`,'err');
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
    app.notify(`${added ? nameOf(added) : 'The project'} added to your list.`);
  });
}

// ---------- removing a project from the list ----------
/** The list without the project: the entry only, never the file. A save the service refuses because the registry moved behind the page's back reads it again and sends the request once more; the default project is refused by the service, whatever the page shows. */
async function removeRequest(app: App, id: string): Promise<Snapshot> {
  const send = () => app.request<Snapshot>('remove_project', { id, revision: app.state.snapshot!.registry.revision });
  try { return await send(); }
  catch (e) {
    if (!/Registry revision changed/.test(message(e))) throw e;
    app.adopt(await app.request<Snapshot>('snapshot'), { replan: false });
    return send();
  }
}
/** "Remove from list" asks first: what goes (the entry), what stays (the file, and its installed plugin as it is). */
function askRemoval(app: App, d: DOMStringMap): void {
  const p = app.state.projects.list?.find(x => x.id === d.id), s = app.state.snapshot;
  if (!p || !s) return;
  const installed = s.registry.plugins.some(x => x.project === p.id);
  app.confirm(`Remove ${nameOf(p)} from your list?`, `Only the entry goes: the file stays where it is (${p.path}) and you can open it again.${installed ? ' Its installed plugin stays as it is; Sync shows it as changed until the project is in your list again.' : ''}`, `Remove ${nameOf(p)}`,
    () => void app.run('Removing the project from your list…', () => removeRequest(app, p.id), async saved => { app.adopt(saved); await loadList(app); app.notify(`${nameOf(p)} removed from your list.`); }), true);
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
  'remove-project': askRemoval,
  'open-folder': async (app, d) => { if (d.id) await viaShell(app, 'open_folder', { path: d.id }, 'noFolder', 'open folders'); },
};
export const actions: Actions = merge(own, ...Object.values(steps).map(s => s.actions));

/** The action bar of the Projects page: on the Install step, Review the changes waiting for this project's plugin. */
export function bar(state: ViewState): string {
  const waiting = state.page === 'projects' && state.project?.step === 'install' && state.projects.info && state.projects.infoId === state.project.id ? install.waitingChanges(state) : 0;
  return waiting ? button(`Review ${plural(waiting, 'change')}`, 'review', { primary: true }) : '';
}
export function input(app: App, el: TextBox): boolean {
  return app.state.page === 'projects' && !!app.state.project && Object.values(steps).some(s => s.input?.(app, el));
}
export function change(app: App, el: TextBox): boolean {
  return app.state.page === 'projects' && !!app.state.project && Object.values(steps).some(s => s.change?.(app, el));
}
