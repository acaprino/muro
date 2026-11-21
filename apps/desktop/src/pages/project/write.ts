import type { ViewState, ProjectInfo, ProjectRecord, Snapshot, Job, ProjectUpdates, ProjectUpdate } from '../../types.ts';
import type { App, Actions, TextBox } from '../../context.ts';
import { engineOf } from '../../model.ts';
import { dlHead } from '../../sheets.ts';
import { esc, button, field, seg, spin, tag, elapsed } from '../../ui.ts';
import { textArea, slugOf, SLUG, FULL_PATH, isInput, readRepository, repositoryErrors, repositoryFields, budgetError, showErrors, clearError, type Errors } from '../../forms.ts';
import { checkboxOptionHtml, codeNoteHtml, fieldErrorHtml, formFooterHtml, formGroupHtml, appendRepeatedFieldRow, removeRepeatedFieldRow, runFormOperation, taskCardHtml } from '@acaprino/imago/ui';

/** Making and changing a project (ADR-0030): the dialogs and the requests. What a change means is the host AI's: every change of the package (a new project, harmonizing
 * again, adding, removing or re-pinning an input, the custom instructions) is an AI run of the runtime (`create_project`, `project_job`), which the page starts and follows;
 * what a person edits by hand (the details, the records, the changelog) is `edit_project`, which the factory saves offline. Every change names the digest of the file the page
 * shows: the runtime refuses it when the file changed since, and the page says so. Nothing here installs anything on a harness. */

/** What the runtime says, and the page repeats, when the coding agent of the AI settings is not Claude Code. */
export const NEEDS_CLAUDE = 'Making and changing a project needs Claude Code (the only agent Muro can hold to a budget). Choose Claude Code in Settings → AI.';
/** The changes of a project an AI run makes, in the words of a dialog's heading and button. */
const OPERATIONS = { harmonize: ['Harmonize again', 'Harmonize'], add_input: ['Add an input', 'Add input'], remove_input: ['Remove an input', 'Remove input'], move_pin: ['Move a pin', 'Move pin'], instructions: ['Your instructions', 'Save and harmonize'] } as const;
export type Operation = keyof typeof OPERATIONS;
const STEP_DEFAULT: Record<Operation, 'patch' | 'minor'> = { harmonize: 'patch', add_input: 'minor', remove_input: 'minor', move_pin: 'patch', instructions: 'patch' };
const message = (e: unknown) => String(e instanceof Error ? e.message : e);
const errorSlot = fieldErrorHtml('form-error', '', 'div');

const infoOf = (state: ViewState): ProjectInfo | null => state.project && state.projects.infoId === state.project.id ? state.projects.info : null;
/** Whether an AI run would be refused for the agent: only Claude Code can be held to a budget. */
const blocked = (state: ViewState) => engineOf(state.snapshot?.registry.settings).harness === 'codex';
/** The AI run that is making or changing this project, if one is. */
export const runOf = (state: ViewState, id: string): Job | undefined => state.snapshot?.jobs?.find(j => j.status === 'running' && j.kind === 'project' && j.project_id === id);
/** The runs that are making a new project. */
export const creating = (state: ViewState): Job[] => (state.snapshot?.jobs ?? []).filter(j => j.status === 'running' && j.kind === 'project' && j.operation === 'create');
/** The last run of this project that is over, when it did not succeed: the page says so until a later run does. */
export const lastFailure = (state: ViewState, id: string): Job | undefined => {
  const runs = (state.snapshot?.jobs ?? []).filter(j => j.kind === 'project' && j.project_id === id && j.status !== 'running').sort((a, b) => (Number(b.time) || 0) - (Number(a.time) || 0));
  return runs[0] && runs[0].status !== 'completed' ? runs[0] : undefined;
};

// ---------- what a dialog says about the AI ----------
function aiNote(state: ViewState, words: string): string {
  if (blocked(state)) return `<p class="im-field-error" role="alert">${esc(NEEDS_CLAUDE)}</p>`;
  return `<p class="im-muted">${esc(words)} Claude Code does it on this computer with its own credentials, and spends at most the budget below. The project file is replaced only when the build succeeds; nothing is installed until you install it.</p>`;
}
const budgetField = (value = 5) => field('Maximum budget (USD)', 'budget', String(value), { type: 'number', hint: 'Checked between turns: the run can end slightly above it.', attrs: { min: '0', step: '0.5', inputmode: 'decimal' } });
const stepGroup = (selected: string) => formGroupHtml('Version', seg('step', selected, [['patch', 'Patch'], ['minor', 'Minor'], ['major', 'Major']], 'How the version moves'), 'Harnesses update an installed plugin by its version.');
const aiFooter = (state: ViewState, submit: string) => formFooterHtml({ submit, disabled: blocked(state), leadingHtml: blocked(state) ? button('Open Settings', 'page', { id: 'settings', cls: 'im-push-start' }) : '' });

// ---------- a new project ----------
/** The dialog of New project: the name and the plugin id, the author, the folder the file goes in, the inputs, the request in words, the repository and the budget. */
export function newProjectDialog(state: ViewState): string {
  const pick = state.projects.noFolderPicker ? '' : button('Choose folder…', 'pick-project-folder', { sm: true, icon: 'folder' });
  return `<form class="im-form" id="new-project-form" novalidate>${dlHead('New project', 'One plugin made from the plugins and skills you name, harmonized by the AI, for every harness.')}`
    + field('Name', 'name', '', { autofocus: true, placeholder: 'My plugin' })
    + field('Plugin id', 'slug', '', { mono: true, placeholder: 'my-plugin', hint: 'Lowercase letters and digits joined by dashes: how the harnesses name the plugin. It cannot change later.' })
    + field('Author', 'author', '')
    + field('Save in folder', 'folder', '', { mono: true, hint: 'The project is one file in this folder, named after the plugin id.' }) + pick
    + textArea('Inputs', 'inputs', '', { mono: true, rows: 4, hint: 'One per line: a repository address (https://…; a folder of it after #) or the full path of a folder on this computer. What the inputs do, the plugin does.' })
    + textArea('Your request', 'request', '', { optional: true, hint: 'In your words: what to take from the inputs, how to fit them together. The AI reads it with the inputs.' })
    + `<details id="new-project-repository"><summary>Repository</summary>${repositoryFields()}</details>`
    + budgetField() + aiNote(state, 'The AI reads each input, pins it, checks its license and makes one plugin of them.') + errorSlot + aiFooter(state, 'Create project') + '</form>';
}
export interface NewProject { name: string; slug: string; author: string; folder: string; inputs: { source: string }[]; request: string; repository: { url: string; branch: string; tag_prefix: string } | null; budget_usd: number }
export function readNewProject(form: HTMLFormElement): NewProject {
  const data = new FormData(form), text = (name: string) => String(data.get(name) || '').trim();
  return { name: text('name'), slug: text('slug'), author: text('author'), folder: text('folder'), inputs: text('inputs').split(/\r?\n/).map(v => v.trim()).filter(Boolean).map(source => ({ source })),
    request: text('request'), repository: readRepository(data), budget_usd: Number(data.get('budget')) };
}
export function newProjectErrors(p: NewProject, taken: string[] = []): Errors {
  const errors: Errors = {};
  if (!p.name) errors.name = 'Give the project a name.';
  if (!SLUG.test(p.slug)) errors.slug = 'Use lowercase letters and digits joined by dashes, such as my-plugin.';
  else if (taken.includes(p.slug)) errors.slug = 'A project or plugin with this id is already in your list.';
  if (!p.author) errors.author = 'Say who owns the project.';
  if (!p.folder) errors.folder = 'Choose the folder the project file goes in.';
  else if (!FULL_PATH.test(p.folder)) errors.folder = 'Enter the full path of the folder, such as D:\\Projects.';
  if (!p.inputs.length) errors.inputs = 'Add at least one input: a project is made from plugins and skills.';
  else if (p.inputs.some(i => !isInput(i.source))) errors.inputs = 'Each input is an https:// address or the full path of a folder.';
  else if (new Set(p.inputs.map(i => i.source)).size !== p.inputs.length) errors.inputs = 'An input is named twice.';
  return { ...errors, ...repositoryErrors(p.repository), ...budgetError(p.budget_usd) };
}
const inputErrors = (form: HTMLFormElement, errors: Errors) => showErrors(form, errors);

// ---------- the details ----------
export function detailsDialog(info: ProjectInfo): string {
  const p = info.project;
  return `<form class="im-form" id="project-details-form" novalidate>${dlHead('Project details', 'What the project file says about itself. The plugin id cannot change.')}`
    + field('Name', 'name', p.name, { autofocus: true }) + field('Author', 'author', p.author) + repositoryFields(p.repository) + errorSlot + formFooterHtml({ submit: 'Save' }) + '</form>';
}
export function readDetails(form: HTMLFormElement) {
  const data = new FormData(form);
  return { name: String(data.get('name') || '').trim(), author: String(data.get('author') || '').trim(), repository: readRepository(data) };
}
export function detailsErrors(d: ReturnType<typeof readDetails>): Errors {
  return { ...(d.name ? {} : { name: 'Give the project a name.' }), ...(d.author ? {} : { author: 'Say who owns the project.' }), ...repositoryErrors(d.repository) };
}

// ---------- a change the AI makes ----------
const updateOf = (state: ViewState, id: string): ProjectUpdate | undefined => state.projects.updates?.digest === infoOf(state)?.digest ? state.projects.updates?.inputs.find(u => u.id === id) : undefined;
/** The dialog of a change: what it does, the fields it needs, the request in words, the version step and the budget. `input` is the input it is about, for a pin or a removal. */
export function changeDialog(state: ViewState, info: ProjectInfo, operation: Exclude<Operation, 'instructions'>, input = ''): string {
  const [title, submit] = OPERATIONS[operation], name = info.project.name;
  const head = {
    harmonize: dlHead(title, `${name}: the AI reads the inputs and the decision records again and fixes what no longer holds.`),
    add_input: dlHead(title, `${name}: the AI pins the input, reads it and harmonizes it with the others.`),
    remove_input: dlHead(`Remove ${input}`, `What only ${input} brought leaves ${name}. The AI harmonizes what remains.`),
    move_pin: dlHead(`Move ${input}`, `The AI compares the pinned commit with the new one, reads the input again and reviews the choices the difference touches.`),
  }[operation];
  const upstream = operation === 'move_pin' ? updateOf(state, input) : undefined;
  const fields = {
    harmonize: '',
    add_input: field('Input', 'source', '', { mono: true, autofocus: true, placeholder: 'https://github.com/owner/repository', hint: 'A repository address (https://…; a folder of it after #) or the full path of a folder on this computer.' }),
    remove_input: '',
    move_pin: field('Move to', 'to', upstream?.status === 'behind' ? upstream.upstream ?? '' : '', { mono: true, autofocus: true, placeholder: 'v2.0.0', hint: 'A published release. Leave it empty for the newest one (the latest commit, for an input without releases).' }),
  }[operation];
  const words = { harmonize: 'The AI harmonizes the project again.', add_input: 'The AI adds the input.', remove_input: 'The AI removes the input.', move_pin: 'The AI moves the pin.' }[operation];
  return `<form class="im-form" id="change-form" data-operation="${esc(operation)}" data-input="${esc(input)}" novalidate>${head}${fields}`
    + textArea('Your request', 'request', '', { optional: true, autofocus: operation === 'harmonize' || operation === 'remove_input', hint: 'In your words. A binding record still wins: the AI stops rather than break one.' })
    + stepGroup(STEP_DEFAULT[operation]) + budgetField() + aiNote(state, words) + errorSlot + aiFooter(state, submit) + '</form>';
}

// ---------- the custom instructions ----------
/** One file of the sheet: its name and its text, and the name it had (empty for a new one), so a rename is a removal and a new file. */
const instructionRow = (path = '', text = '') => formGroupHtml(path || 'New file', `<input type="hidden" name="ins_original" value="${esc(path)}">${field('File name', 'ins_path', path, { mono: true, error: false, placeholder: 'house-style.md' })}${textArea('Text', 'ins_text', text, { rows: 8 })}${button('Remove file', 'remove-instruction', { sm: true, danger: true, attrs: { 'aria-label': `Remove ${path || 'this new file'}` } })}`);
/** The owner's Markdown files, each with its name and text, to change, add or remove; saving them harmonizes them with the inputs. */
export function instructionsSheet(state: ViewState, info: ProjectInfo): string {
  const files = info.instructions ?? [];
  return `<form class="im-form" id="instructions-form" novalidate>${dlHead('Your instructions', `Your own Markdown notes for ${info.project.name}. The AI decides how each one fits with the inputs and records why; it never changes them.`)}`
    + `<div id="instruction-files">${files.map(f => instructionRow(f.path, f.text)).join('')}</div>${fieldErrorHtml('err-instructions')}${button('Add file', 'add-instruction', { icon: 'plus' })}`
    + textArea('Your request', 'request', '', { optional: true, hint: 'In your words, for the AI.' }) + stepGroup('patch') + budgetField()
    + aiNote(state, 'The AI harmonizes the instructions with the inputs.') + errorSlot + aiFooter(state, 'Save and harmonize') + '</form>';
}
/** What the sheet changes, against the files the project holds: each file written (new, renamed or changed) with its text, each one removed with null. */
export function readInstructions(form: HTMLFormElement, held: { path: string; text: string }[]): { edits: { path: string; text: string | null }[]; errors: Errors } {
  const rows = Array.from(form.querySelectorAll<HTMLElement>('#instruction-files > fieldset')).map(row => ({
    original: row.querySelector<HTMLInputElement>('[name=ins_original]')!.value, path: row.querySelector<HTMLInputElement>('[name=ins_path]')!.value.trim().replace(/\\/g, '/').replace(/^\/+/, ''),
    text: row.querySelector<HTMLTextAreaElement>('[name=ins_text]')!.value }));
  const errors: Errors = {}, edits: { path: string; text: string | null }[] = [], kept = new Set(rows.map(r => r.path.toLowerCase()));
  if (rows.some(r => !/\.md$/i.test(r.path) || r.path.split('/').some(part => !part || part === '.' || part === '..'))) errors.instructions = 'Each file needs a name that ends in .md, such as house-style.md or team/tone.md.';
  else if (kept.size !== rows.length) errors.instructions = 'Two files have the same name.';
  for (const file of held) if (!kept.has(file.path.toLowerCase())) edits.push({ path: file.path, text: null });
  for (const row of rows) {
    const before = held.find(f => f.path === row.path);
    if (!before || before.text !== row.text) edits.push({ path: row.path, text: row.text });
  }
  if (!errors.instructions && !edits.length) errors.instructions = 'Nothing changed: edit, add or remove a file first.';
  return { edits, errors };
}

// ---------- decision records ----------
const today = () => new Date().toISOString().slice(0, 10);
export function recordDialog(record?: ProjectRecord): string {
  return `<form class="im-form" id="record-form" data-id="${esc(record?.id ?? '')}" novalidate>${dlHead(record ? 'Decision record' : 'Add a record', 'Why the project is the way it is. A binding record is a rule the next harmonization has to follow.')}`
    + field('Date', 'date', record?.date ?? today(), { type: 'date' })
    + field('About', 'subjects', (record?.subjects ?? []).join(', '), { mono: true, placeholder: 'capability or input ids, separated by commas' })
    + textArea('Decision', 'text', record?.text ?? '', { rows: 6, autofocus: true })
    + checkboxOptionHtml({ name: 'binding', checked: !!record?.binding, label: 'Binding', hint: 'The next harmonization follows it, and stops rather than break it.', top: true })
    + errorSlot + formFooterHtml({ submit: 'Save', leadingHtml: record ? button('Delete record', 'delete-record', { id: record.id, danger: true, cls: 'im-push-start' }) : '' }) + '</form>';
}
/** The records after the dialog: the one edited in place (its words are the owner's from then on), or a new one of the owner's at the end. */
export function readRecord(form: HTMLFormElement, records: ProjectRecord[]): { records: ProjectRecord[]; errors: Errors } {
  const data = new FormData(form), id = form.dataset.id || '', text = String(data.get('text') || '').trim(), date = String(data.get('date') || '').trim();
  const subjects = String(data.get('subjects') || '').split(',').map(s => s.trim()).filter(Boolean), binding = data.has('binding');
  const errors: Errors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.date = 'Enter the date as YYYY-MM-DD.';
  if (!text) errors.text = 'Write the decision and its reason.';
  const old = records.find(r => r.id === id);
  if (old) return { errors, records: records.map(r => r === old ? { ...r, date, subjects, text, binding, author: r.text === text ? r.author : 'you' } : r) };
  let n = 1;
  while (records.some(r => r.id === `you-${date}-${n}`)) n++;
  return { errors, records: [...records, { id: `you-${date}-${n}`, date, subjects, text, author: 'you', binding }] };
}

// ---------- the changelog ----------
export function changelogSheet(info: ProjectInfo): string {
  return `<form class="im-form" id="changelog-form" novalidate>${dlHead('Changelog', 'One entry per version. Muro writes one at each harmonization; you can edit it.')}`
    + textArea('CHANGELOG.md', 'changelog', info.changelog, { rows: 20, mono: true, autofocus: true }) + errorSlot + formFooterHtml({ submit: 'Save' }) + '</form>';
}

// ---------- the run of a project ----------
/** A run making or changing a project: its title, phase and time, and Cancel. The agent reports no fraction, so the bar says the phase and the time. */
export function runCard(job: Job, now: number = Date.now()): string {
  const ran = elapsed(job.time, now), budget = Number.isFinite(Number(job.budget_usd)) ? `budget up to $${Number(job.budget_usd).toFixed(2)}` : '';
  return taskCardHtml({ id: `run-${job.id}`, title: job.title || 'Changing the project', leadingHtml: spin, actionsHtml: button('Cancel', 'cancel-job', { id: job.id, danger: true }),
    phase: job.phase, elapsed: ran ? `Running for ${ran}` : '', progressLabel: 'AI run in progress', progressText: [job.phase, ran && `running for ${ran}`].filter(Boolean).join(', '),
    description: [job.message, budget].filter(Boolean).join(' · '), detailHtml: codeNoteHtml(job.log_path ? `Log: ${job.log_path}` : '') });
}
/** The last run of the open project, when it failed: what it said, and where its log is. */
export function failureNote(job: Job): string {
  return `<p class="im-text-err" role="status">${esc(`${job.title || 'The last change'} ${job.status === 'cancelled' ? 'was cancelled' : 'failed'}: ${job.message}`)}</p>${codeNoteHtml(job.log_path ? `Log: ${job.log_path}` : '')}`;
}
/** How an input's pin stands against its upstream, from the last update check of this file. */
export function upstreamCell(state: ViewState, id: string): string {
  const u = updateOf(state, id);
  if (!u) return '<span class="im-muted">—</span>';
  if (u.status === 'behind') return tag(`${u.upstream} available`, 'warn');
  if (u.status === 'current') return tag('Up to date', 'good');
  if (u.status === 'frozen') return tag('Frozen');
  return `<span class="im-text-warn" title="${esc(u.note)}">${esc(u.status === 'drifted' ? 'Pin moved upstream' : u.note || 'Not checked')}</span>`;
}

// ---------- the requests ----------
/** The project's list and its page are read again: what a change wrote is on the file. */
type Reload = (app: App, id?: string) => Promise<void>;
let reload: Reload = async () => {};
/** pages/projects.ts owns the reading; it lends it here once. */
export function readsWith(fn: Reload): void { reload = fn; }

function lockedForm(app: App, dialog: HTMLDialogElement, form: HTMLFormElement, work: () => Promise<unknown>, done: () => void | Promise<void>): Promise<void> {
  return runFormOperation(form, work, { error: dialog.querySelector<HTMLElement>('#form-error'), lockFields: true, current: () => dialog.open && dialog.contains(form), after: async () => { app.closeDialog(); await done(); } }).then(() => undefined);
}
/** An AI run started: the snapshot carries it (its card on the page, in Activity), and the poll follows it. */
async function started(app: App): Promise<void> {
  app.adopt(await app.request<Snapshot>('snapshot'), { replan: false });
  app.render();
  app.notify('Started. Follow it here or in Activity.');
}
function newProject(app: App): void {
  const dialog = app.openDialog(newProjectDialog(app.state)), form = dialog.querySelector<HTMLFormElement>('#new-project-form')!;
  form.onsubmit = e => {
    e.preventDefault();
    if (blocked(app.state)) return;
    const next = readNewProject(form), s = app.state.snapshot!;
    const taken = [...(app.state.projects.list ?? []).map(p => p.id), ...s.registry.plugins.map(p => p.id)];
    if (!inputErrors(form, newProjectErrors(next, taken))) return;
    void lockedForm(app, dialog, form, () => app.request('create_project', { ...next }), () => started(app));
  };
}
function change(app: App, operation: Exclude<Operation, 'instructions'>, input = ''): void {
  const info = infoOf(app.state), pv = app.state.project;
  if (!info || !pv) return;
  const dialog = app.openDialog(changeDialog(app.state, info, operation, input)), form = dialog.querySelector<HTMLFormElement>('#change-form')!;
  form.onsubmit = e => {
    e.preventDefault();
    if (blocked(app.state)) return;
    const data = new FormData(form), budget = Number(data.get('budget')), source = String(data.get('source') || '').trim();
    const errors: Errors = { ...budgetError(budget), ...(operation === 'add_input' && !isInput(source) ? { source: 'Enter an https:// address or the full path of a folder.' } : {}) };
    if (!showErrors(form, errors)) return;
    const payload: Record<string, unknown> = { id: pv.id, digest: info.digest, operation, budget_usd: budget, step: String(data.get('step') || STEP_DEFAULT[operation]), request: String(data.get('request') || '').trim() };
    if (operation === 'add_input') payload.source = source;
    if (operation === 'remove_input' || operation === 'move_pin') payload.input = input;
    if (operation === 'move_pin') payload.to = String(data.get('to') || '').trim();
    void lockedForm(app, dialog, form, () => app.request('project_job', payload), () => started(app));
  };
}
function instructions(app: App): void {
  const info = infoOf(app.state), pv = app.state.project;
  if (!info || !pv) return;
  const dialog = app.openDialog(instructionsSheet(app.state, info), 'sheet'), form = dialog.querySelector<HTMLFormElement>('#instructions-form')!;
  form.onsubmit = e => {
    e.preventDefault();
    if (blocked(app.state)) return;
    const data = new FormData(form), budget = Number(data.get('budget')), { edits, errors } = readInstructions(form, info.instructions ?? []);
    if (!showErrors(form, { ...errors, ...budgetError(budget) })) return;
    void lockedForm(app, dialog, form, () => app.request('project_job', { id: pv.id, digest: info.digest, operation: 'instructions', instructions: edits, budget_usd: budget, step: String(data.get('step') || 'patch'), request: String(data.get('request') || '').trim() }), () => started(app));
  };
}
/** An edit by hand: the factory saves it on the file the page shows, and the list and the project are read again. */
function saveEdit(app: App, dialog: HTMLDialogElement, form: HTMLFormElement, changes: Record<string, unknown>, done: string): Promise<void> {
  const info = infoOf(app.state), pv = app.state.project;
  if (!info || !pv) return Promise.resolve();
  return lockedForm(app, dialog, form, () => app.request('edit_project', { id: pv.id, digest: info.digest, ...changes }), async () => { await reload(app, pv.id); app.notify(done, 'good'); });
}
function details(app: App): void {
  const info = infoOf(app.state);
  if (!info) return;
  const dialog = app.openDialog(detailsDialog(info)), form = dialog.querySelector<HTMLFormElement>('#project-details-form')!;
  form.onsubmit = e => { e.preventDefault(); const next = readDetails(form); if (showErrors(form, detailsErrors(next))) void saveEdit(app, dialog, form, next, 'Details saved.'); };
}
function record(app: App, id?: string): void {
  const info = infoOf(app.state);
  if (!info) return;
  const held = info.records.find(r => r.id === id);
  const dialog = app.openDialog(recordDialog(held)), form = dialog.querySelector<HTMLFormElement>('#record-form')!;
  form.onsubmit = e => { e.preventDefault(); const { records, errors } = readRecord(form, info.records); if (showErrors(form, errors)) void saveEdit(app, dialog, form, { records }, 'Record saved.'); };
}
function deleteRecord(app: App, id: string, el: HTMLElement): void {
  const info = infoOf(app.state), dialog = el.closest('dialog'), form = el.closest('form');
  if (!info || !dialog || !form) return;
  void saveEdit(app, dialog, form, { records: info.records.filter(r => r.id !== id) }, 'Record deleted.');
}
function changelog(app: App): void {
  const info = infoOf(app.state);
  if (!info) return;
  const dialog = app.openDialog(changelogSheet(info), 'sheet'), form = dialog.querySelector<HTMLFormElement>('#changelog-form')!;
  form.onsubmit = e => { e.preventDefault(); void saveEdit(app, dialog, form, { changelog: String(new FormData(form).get('changelog') ?? '') }, 'Changelog saved.'); };
}
/** Delete project: it leaves the list and its file is deleted, after a confirmation that says so. */
function deleteProject(app: App): void {
  const info = infoOf(app.state), pv = app.state.project, file = app.state.projects.list?.find(p => p.id === pv?.id)?.path;
  if (!info || !pv) return;
  app.confirm(`Delete ${info.project.name}?`, `The project leaves your list and its file is deleted${file ? ` (${file})` : ''}. This cannot be undone. Its plugin stays installed where it is, as it is.`, 'Delete project',
    () => void app.run('Deleting the project…', () => app.request<Snapshot>('delete_project', { id: pv.id, revision: app.state.snapshot!.registry.revision }), async saved => {
      app.adopt(saved);
      app.state.project = null;
      await reload(app);
      app.notify(`${info.project.name} deleted.`, 'good');
    }), true);
}
/** Check for updates: how each input's pin stands against its upstream, for the file the page shows. */
async function checkUpdates(app: App): Promise<void> {
  const pv = app.state.project, pr = app.state.projects;
  if (!pv || pr.checkingUpdates) return;
  pr.checkingUpdates = true; app.render();
  try {
    pr.updates = await app.request<ProjectUpdates>('project_updates', { id: pv.id });
    const behind = pr.updates.inputs.filter(u => u.status === 'behind').length;
    app.notify(behind ? `${behind} ${behind === 1 ? 'input has' : 'inputs have'} a newer version.` : 'Every input is at its newest version.', behind ? undefined : 'good');
  } catch (e) { app.state.error = message(e); }
  finally { pr.checkingUpdates = false; app.render(); }
}
/** The shell's folder dialog fills a field of the open form; a shell that does not know it yet loses the button. */
async function pickFolder(app: App, el: HTMLElement, name: string): Promise<void> {
  const box = el.closest('form')?.querySelector<HTMLInputElement>(`[name=${name}]`);
  try {
    const picked = await app.request<{ path: string | null }>('pick_folder');
    if (picked?.path && box) { box.value = picked.path; clearError(box); }
  } catch (e) {
    if (!/unknown/i.test(message(e))) throw e;
    app.state.projects.noFolderPicker = true; el.remove(); app.notify('This version of Muro cannot open a folder dialog yet: type the path.', 'bad');
  }
}

export const actions: Actions = {
  'new-project': app => newProject(app),
  'pick-project-folder': (app, _d, el) => pickFolder(app, el, 'folder'),
  'edit-project-details': app => details(app),
  'delete-project': app => deleteProject(app),
  'harmonize-again': app => change(app, 'harmonize'),
  'add-input': app => change(app, 'add_input'),
  'remove-input': (app, d) => { if (d.id) change(app, 'remove_input', d.id); },
  'move-pin': (app, d) => { if (d.id) change(app, 'move_pin', d.id); },
  'check-updates': app => checkUpdates(app),
  'edit-instructions': app => instructions(app),
  'add-instruction': (_app, _d, el) => { const rows = el.closest('form')?.querySelector<HTMLElement>('#instruction-files'); if (rows) appendRepeatedFieldRow(rows, instructionRow(), { focusSelector: 'input:not([type=hidden])' }); },
  'remove-instruction': (_app, _d, el) => { const row = el.closest('#instruction-files > fieldset'), add = el.closest('form')?.querySelector<HTMLElement>('[data-action=add-instruction]'); if (row) removeRepeatedFieldRow(row, { focusSelector: 'input:not([type=hidden])', fallback: add }); },
  'add-record': app => record(app),
  'edit-record': (app, d) => record(app, d.id),
  'delete-record': (app, d, el) => { if (d.id) deleteRecord(app, d.id, el); },
  'edit-changelog': app => changelog(app),
};

/** The plugin id follows the name of a new project until it is typed; a field typed in loses its error. */
export function input(_app: App, el: TextBox): boolean {
  if (typeof el.closest !== 'function' || !el.closest('dialog')) return false;
  const form = el.closest<HTMLFormElement>('#new-project-form');
  clearError(el);
  // The files of the instructions sheet share one message, under them.
  if (el.name.startsWith('ins_')) { const slot = el.closest('form')?.querySelector('#err-instructions'); if (slot) slot.textContent = ''; }
  if (!form) return false;
  if (el.name === 'slug') form.dataset.slugged = '1';
  else if (el.name === 'name' && !form.dataset.slugged) { const slug = form.querySelector<HTMLInputElement>('[name=slug]'); if (slug) { slug.value = slugOf(el.value); clearError(slug); } }
  return false;
}
