import type { ViewState, ProjectInfo, ProjectDecision, ProjectRecord, ProjectRun, ProjectViewKind, DecisionForm } from '../../types.ts';
import type { App, Actions } from '../../context.ts';
import { harnessNames } from '../../model.ts';
import { dlHead } from '../../sheets.ts';
import { esc, tag, seg, button, empty, icon, when } from '../../ui.ts';
import { VIEWS } from './state.ts';

/** Step 2, why the project is the way it is, read only: the state of the last harmonization, and four views of it (the decision records, the choices by part, the history, the
 * prompts). Writing any of it (harmonize, edit or add a record) is plan 3, so nothing here changes a project.
 *
 * What it reads (pages/projects.ts owns the page and the state): `state.project.view` (the view), `dsrc` (an input id, or '' for all inputs) and `dform` (a form, or 'all'); an
 * input the project does not have, or a form that is none, means all. The views and the form filter are radios (`hview`, `dform`), the input filter a select (`dsrc`):
 * `change` keeps what they say in the state and paints again. A link to a capability is the action `open-capability`, which pages/project/graph.ts owns. */

/** What the page says of the project's state until plan 3 computes the others: the same word as the tab (pages/projects.ts). */
const STATE = 'Harmonized';
/** The forms a decision can take, in the words of the interface, and the tone of each. */
const FORMS: [DecisionForm, string, string][] = [['capability', 'Capability', 'accent'], ['always-on', 'Always on', 'warn'], ['hook', 'Hook', 'good'], ['dropped', 'Dropped', '']];
/** What the factory's own prompts are for: a prompt that is not one of them is listed with no description. */
const ROLES: Record<string, string> = {
  'intake.md': 'Reads the inputs, classifies what they do and extracts capabilities with their provenance.',
  'harmonizer.md': 'Merges overlapping roles and defines alternatives and dependencies.',
  'delivery.md': 'Decides the form each part takes: capability, always on, hook or dropped.',
  'classify.md': 'How a harness picks capabilities for a request, at run time.',
};
const roleOf = (file: string) => Object.hasOwn(ROLES, file) ? ROLES[file] : '';
const RESULTS: Record<ProjectRun['status'], [string, string]> = { completed: ['Built and validated', 'good'], cancelled: ['Cancelled', ''], failed: ['Failed', 'bad'] };
const none = '—';

/** An ISO time in the words of the interface (the same as every other stamp); anything that is no time as it came. */
function at(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : when(String(Math.floor(ms / 1000)));
}
const newestFirst = (runs: ProjectRun[]): ProjectRun[] => [...runs].sort((a, b) => (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0));
const agent = (engine: string | null) => engine ? (harnessNames[engine] ?? engine) : '';

// ---------- the strip ----------
/** The state of the last harmonization: its time, the version of the plugin and the agent that ran it, when the run says. No button here: harmonizing again is plan 3. */
function strip(info: ProjectInfo): string {
  const last = newestFirst(info.history)[0], who = agent(last?.engine ?? null);
  return `<section class="strip good" aria-label="Harmonization state"><span class="sico">${icon('check')}</span><div class="grow"><strong>${STATE}</strong><small class="meta"><span>Last run <b>${last ? esc(at(last.time)) : 'never'}</b></span><span>Version <b>${esc(info.plugin.version)}</b></span>${who ? `<span>Agent <b>${esc(who)}</b></span>` : ''}</small></div></section>`;
}

// ---------- decision records ----------
function recordRow(r: ProjectRecord): string {
  const mine = r.author === 'you', subjects = (r.subjects ?? []).join(', ');
  return `<li>${tag(`${mine ? 'Yours' : 'By Muro'}${r.binding ? ' · binding' : ''}`, mine || r.binding ? 'accent' : '')}<div class="grow"><strong>${esc([r.date, subjects].filter(Boolean).join(' · '))}</strong><span>${esc(r.text)}</span></div></li>`;
}
function records(info: ProjectInfo): string {
  return `<div class="tools"><small class="grow">Why the project is the way it is. Muro writes a record when a harmonization takes a decision that shapes the project. A binding record is a rule the next harmonization has to follow.</small></div>`
    + (info.records.length ? `<ul class="card list dec">${info.records.map(recordRow).join('')}</ul>` : empty('No record yet', 'The first harmonization writes them.'));
}

// ---------- choices by part ----------
/** A link to the capability a part went to: the graph opens it. */
const target = (id: string) => `<button type="button" class="tag accent" data-action="open-capability" data-id="${esc(id)}" aria-label="Open capability ${esc(id)}"><span aria-hidden="true">→</span> ${esc(id)}</button>`;
function decisionRow(d: ProjectDecision): string {
  const [, label, tone] = FORMS.find(f => f[0] === d.form) ?? [d.form, d.form, ''], to = (d.targets ?? []).map(target).join('');
  return `<li>${tag(label, tone)}<div class="grow"><strong>${esc(d.source)}</strong><span>${esc(d.content)}</span><small>${esc(d.reason)}</small>${to ? `<span class="to">${to}</span>` : ''}</div></li>`;
}
function choices(pv: NonNullable<ViewState['project']>, info: ProjectInfo): string {
  if (!info.decisions.length) return empty('No choices yet', 'The harmonization decides what each part of each input became, and records why.');
  const src = info.inputs.some(i => i.id === pv.dsrc) ? pv.dsrc : '', form = FORMS.some(f => f[0] === pv.dform) ? pv.dform : 'all';
  const shown = info.decisions.filter(d => (!src || d.source === src) && (form === 'all' || d.form === form));
  return `<div class="tools"><small>What each part of each input became, and why. <strong>${shown.length} of ${info.decisions.length}</strong></small><div class="acts"><select name="dsrc" aria-label="Filter by input"><option value="">All inputs</option>${info.inputs.map(i => `<option value="${esc(i.id)}"${i.id === src ? ' selected' : ''}>${esc(i.id)}</option>`).join('')}</select>${seg('dform', form, [['all', 'All'], ...FORMS.map(([id, label]) => [id, label] as [string, string])], 'Filter by form')}</div></div>`
    + (shown.length ? `<ul class="card list dec">${shown.map(decisionRow).join('')}</ul>` : '<p class="muted">No choice matches this filter.</p>');
}

// ---------- history ----------
function runRow(r: ProjectRun, info: ProjectInfo, current: boolean): string {
  const repo = info.project.repository, [result, tone] = RESULTS[r.status] ?? [r.status, ''];
  const version = r.version ? `<strong>${esc(r.version)}</strong>${current ? ' <span class="tag good">current</span>' : ''}${repo ? `<br><small>${esc(repo.tag_prefix)}${esc(r.version)}</small>` : ''}` : none;
  return `<tr><td class="nowrap">${esc(at(r.time))}</td><td>${version}</td><td class="note">${r.changelog ? esc(r.changelog) : none}</td><td>${tag(result, tone)}</td><td>${typeof r.budget_usd === 'number' ? `$${r.budget_usd.toFixed(2)}` : none}</td><td>${esc(agent(r.engine) || none)}</td></tr>`;
}
function history(info: ProjectInfo): string {
  if (!info.history.length) return empty('No run yet', 'Every harmonization is listed here with its version and its changelog entry.');
  const runs = newestFirst(info.history), now = runs.findIndex(r => r.status === 'completed' && r.version === info.plugin.version);
  return `<div class="card tablewrap" role="region" aria-label="Runs" tabindex="0"><table class="runs"><thead><tr><th scope="col">When</th><th scope="col">Version</th><th scope="col">Changelog</th><th scope="col">Result</th><th scope="col">Budget</th><th scope="col">Engine</th></tr></thead><tbody>${runs.map((r, i) => runRow(r, info, i === now)).join('')}</tbody></table></div>`;
}

// ---------- prompts ----------
function prompts(info: ProjectInfo): string {
  if (!info.prompts.length) return empty('No prompt', 'The prompts the harmonization reads are listed here.');
  return `<ul class="card list">${info.prompts.map(p => `<li><div class="grow"><strong><code>${esc(p.file)}</code></strong>${roleOf(p.file) ? `<small>${esc(roleOf(p.file))}</small>` : ''}</div>${button('Open', 'harmonize-prompt', { sm: true, id: p.file, attrs: { 'aria-label': `Open ${p.file}` } })}</li>`).join('')}</ul>`;
}

// ---------- the step ----------
const LABELS: Record<ProjectViewKind, string> = { records: 'Decision records', choices: 'Choices by part', history: 'History', prompts: 'Prompts' };
export function view(state: ViewState, info: ProjectInfo): string {
  const pv = state.project;
  if (!pv) return '';
  const now: ProjectViewKind = VIEWS.includes(pv.view) ? pv.view : 'records', counts = { records: info.records.length, choices: info.decisions.length, history: info.history.length, prompts: 0 };
  const label = (kind: ProjectViewKind) => kind === 'history' || counts[kind] ? `${LABELS[kind]} · ${counts[kind]}` : LABELS[kind];
  const body = { records: () => records(info), choices: () => choices(pv, info), history: () => history(info), prompts: () => prompts(info) }[now]();
  return strip(info)
    + `<div class="tools">${seg('hview', now, VIEWS.map(kind => [kind, label(kind)] as [string, string]), 'Harmonization views')}</div>`
    + `<section aria-label="${LABELS[now]}">${body}</section>`;
}

/** The text of a prompt, whole, in a sheet: the file's name is its heading, and the text can be scrolled with the keyboard. It is the text of the open project's own file. */
function openPrompt(app: App, d: DOMStringMap): void {
  const { state } = app, info = state.projects.infoId === state.project?.id ? state.projects.info : null, found = info?.prompts.find(p => p.file === d.id);
  if (!found) return;
  app.openDialog(`<div class="dl">${dlHead(found.file, roleOf(found.file))}<pre class="prompt" tabindex="0" aria-label="Text of ${esc(found.file)}">${esc(found.text)}</pre></div>`, 'sheet');
}
export const actions: Actions = { 'harmonize-prompt': openPrompt };

/** A view, an input or a form was chosen. */
export function change(app: App, el: HTMLInputElement | HTMLSelectElement): boolean {
  const pv = app.state.project;
  if (!pv) return false;
  if (el.name === 'hview' && (VIEWS as readonly string[]).includes(el.value)) pv.view = el.value as ProjectViewKind;
  else if (el.name === 'dsrc') pv.dsrc = el.value;
  else if (el.name === 'dform') pv.dform = el.value;
  else return false;
  app.render();
  return true;
}
