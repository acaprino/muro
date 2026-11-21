import type { ViewState, ProjectInfo, ProjectDecision, ProjectRecord, ProjectRun, ProjectViewKind, DecisionForm } from '../../types.ts';
import type { App, Actions, TextBox } from '../../context.ts';
import { harnessNames } from '../../model.ts';
import { dlHead } from '../../sheets.ts';
import { esc, tag, seg, button, empty, when } from '../../ui.ts';
import { actionChipHtml, codeViewHtml, stackRowHtml, stackListHtml, summaryHtml, tableHtml, tableRowHtml, toolbarHtml, selectHtml } from '@acaprino/imago/ui';
import { VIEWS, stateOf } from './state.ts';
import { runOf } from './write.ts';

/** Step 2, why the project is the way it is: the state of the last harmonization, and four views of it (the decision records, the choices by part, the history, the
 * prompts). Harmonize again, a record added or edited and the changelog edited are pages/project/write.ts's: this module only offers them, and none while an AI run changes the project.
 *
 * What it reads (pages/projects.ts owns the page and the state): `state.project.view` (the view), `dsrc` (an input id, or '' for all inputs) and `dform` (a form, or 'all'); an
 * input the project does not have, or a form that is none, means all. The views and the form filter are radios (`hview`, `dform`), the input filter a select (`dsrc`):
 * `change` keeps what they say in the state and paints again. A link to a capability is the action `open-capability`, which pages/project/graph.ts owns. */

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
/** The state of the last harmonization: its time, the version of the plugin and the agent that ran it, when the run says; and Harmonize again, unless a run is changing the project. */
function strip(state: ViewState, info: ProjectInfo, running: boolean): string {
  const last = newestFirst(info.history)[0], who = agent(last?.engine ?? null), now = stateOf(state, state.project!.id);
  return summaryHtml({label:'Harmonization state',title:now.label,tone:now.tone,icon:'check',metadata:[
    {label:'Last run',value:last?at(last.time):'never'},{label:'Version',value:info.plugin.version},...(who?[{label:'Agent',value:who}]:[])]})
    + (running ? '' : toolbarHtml('<small class="im-grow">The AI reads the inputs and the records again and fixes what no longer holds.</small>', button('Harmonize again…', 'harmonize-again', { primary: true, icon: 'sync' })));
}

// ---------- decision records ----------
function recordRow(r: ProjectRecord, running: boolean): string {
  const mine = r.author === 'you', subjects = (r.subjects ?? []).join(', ');
  return stackRowHtml({title:[r.date,subjects].filter(Boolean).join(' · '),message:r.text,
    leadingHtml:tag(`${mine?'Yours':'By Muro'}${r.binding?' · binding':''}`,mine||r.binding?'accent':''),
    trailingHtml:running?'':button('Edit','edit-record',{sm:true,id:r.id,attrs:{'aria-label':`Edit the record of ${r.date}`}})});
}
function records(info: ProjectInfo, running: boolean): string {
  return toolbarHtml('<small class="im-grow">Why the project is the way it is. Muro writes a record when a harmonization takes a decision that shapes the project. A binding record is a rule the next harmonization has to follow.</small>',
    running ? '' : button('Add record…', 'add-record', { icon: 'plus' }))
    + (info.records.length ? stackListHtml(info.records.map(r => recordRow(r, running)).join(''),'decisions') : empty('No record yet', 'The first harmonization writes them; you can add your own.'));
}

// ---------- choices by part ----------
/** A link to the capability a part went to: the graph opens it. */
const target = (id: string) => actionChipHtml(id,'open-capability',{id,accessibleLabel:`Open capability ${id}`,tone:'accent',icon:'arrow'});
function decisionRow(d: ProjectDecision): string {
  const [, label, tone] = FORMS.find(f => f[0] === d.form) ?? [d.form, d.form, ''], to = (d.targets ?? []).map(target).join('');
  return stackRowHtml({title:d.source,message:d.content,detail:d.reason,leadingHtml:tag(label,tone),relatedHtml:to});
}
function choices(pv: NonNullable<ViewState['project']>, info: ProjectInfo): string {
  if (!info.decisions.length) return empty('No choices yet', 'The harmonization decides what each part of each input became, and records why.');
  const src = info.inputs.some(i => i.id === pv.dsrc) ? pv.dsrc : '', form = FORMS.some(f => f[0] === pv.dform) ? pv.dform : 'all';
  const shown = info.decisions.filter(d => (!src || d.source === src) && (form === 'all' || d.form === form));
  return toolbarHtml(`<small>What each part of each input became, and why. <strong>${shown.length} of ${info.decisions.length}</strong></small>`,
    selectHtml({name:'dsrc',value:src,label:'Filter by input',options:[['','All inputs'],...info.inputs.map(i=>[i.id,i.id] as [string,string])]})
      + seg('dform',form,[['all','All'],...FORMS.map(([id,label])=>[id,label] as [string,string])],'Filter by form'))
    + (shown.length ? stackListHtml(shown.map(decisionRow).join(''),'decisions') : '<p class="im-muted">No choice matches this filter.</p>');
}

// ---------- history ----------
function runRow(r: ProjectRun, info: ProjectInfo, current: boolean): string {
  const repo = info.project.repository, [result, tone] = RESULTS[r.status] ?? [r.status, ''];
  const version = r.version ? `<strong>${esc(r.version)}</strong>${current ? ' <span class="im-chip" data-im-tone="ok">current</span>' : ''}${repo ? `<br><small>${esc(repo.tag_prefix)}${esc(r.version)}</small>` : ''}` : none;
  return tableRowHtml([{html:esc(at(r.time)),className:'im-nowrap'},version,{html:esc(r.changelog||none),className:'im-log-note'},tag(result,tone),
    typeof r.budget_usd==='number'?`$${r.budget_usd.toFixed(2)}`:none,esc(agent(r.engine)||none)]);
}
function history(info: ProjectInfo, running: boolean): string {
  const tools = toolbarHtml('<small class="im-grow">Every harmonization, with its version and its changelog entry.</small>', running ? '' : button('Edit changelog…', 'edit-changelog'));
  if (!info.history.length) return tools + empty('No run yet', 'Every harmonization is listed here with its version and its changelog entry.');
  const runs = newestFirst(info.history), now = runs.findIndex(r => r.status === 'completed' && r.version === info.plugin.version);
  return tools + tableHtml(['When','Version','Changelog','Result','Budget','Engine'],runs.map((r,i)=>runRow(r,info,i===now)).join(''),{label:'Runs',variant:'log'});
}

// ---------- prompts ----------
function prompts(info: ProjectInfo): string {
  if (!info.prompts.length) return empty('No prompt', 'The prompts the harmonization reads are listed here.');
  return stackListHtml(info.prompts.map(p=>stackRowHtml({title:p.file,titleMono:true,detail:roleOf(p.file),
    trailingHtml:button('Open','harmonize-prompt',{sm:true,id:p.file,attrs:{'aria-label':`Open ${p.file}`}})})).join(''));
}

// ---------- the step ----------
const LABELS: Record<ProjectViewKind, string> = { records: 'Decision records', choices: 'Choices by part', history: 'History', prompts: 'Prompts' };
export function view(state: ViewState, info: ProjectInfo): string {
  const pv = state.project;
  if (!pv) return '';
  const now: ProjectViewKind = VIEWS.includes(pv.view) ? pv.view : 'records', counts = { records: info.records.length, choices: info.decisions.length, history: info.history.length, prompts: 0 };
  const label = (kind: ProjectViewKind) => kind === 'history' || counts[kind] ? `${LABELS[kind]} · ${counts[kind]}` : LABELS[kind];
  const running = !!runOf(state, pv.id);
  const body = { records: () => records(info, running), choices: () => choices(pv, info), history: () => history(info, running), prompts: () => prompts(info) }[now]();
  return strip(state, info, running)
    + toolbarHtml(seg('hview', now, VIEWS.map(kind => [kind, label(kind)] as [string, string]), 'Harmonization views'))
    + `<section aria-label="${LABELS[now]}">${body}</section>`;
}

/** The text of a prompt, whole, in a sheet: the file's name is its heading, and the text can be scrolled with the keyboard. It is the text of the open project's own file. */
function openPrompt(app: App, d: DOMStringMap): void {
  const { state } = app, info = state.projects.infoId === state.project?.id ? state.projects.info : null, found = info?.prompts.find(p => p.file === d.id);
  if (!found) return;
  app.openDialog(`<div class="im-form">${dlHead(found.file, roleOf(found.file))}${codeViewHtml(found.text,`Text of ${found.file}`)}</div>`, 'sheet');
}
export const actions: Actions = { 'harmonize-prompt': openPrompt };

/** A view, an input or a form was chosen. */
export function change(app: App, el: TextBox): boolean {
  const pv = app.state.project;
  if (!pv) return false;
  if (el.name === 'hview' && (VIEWS as readonly string[]).includes(el.value)) pv.view = el.value as ProjectViewKind;
  else if (el.name === 'dsrc') pv.dsrc = el.value;
  else if (el.name === 'dform') pv.dform = el.value;
  else return false;
  app.render();
  return true;
}
