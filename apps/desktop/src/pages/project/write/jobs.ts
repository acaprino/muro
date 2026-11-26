import type {
  ChangeOperation, InstructionEdit, InstructionFile, Job, ProjectOperation, ProjectRecord, ProjectRelease, ProjectRepository, Transport, VersionStep,
} from '../../../types.ts';

/** The write side of a project, as plain data (ADR-0032): the shapes of the requests the runtime reads (`crates/muro-desktop-runtime/src/project_jobs.rs`), the checks of what a person typed
 * that the runtime makes again, and the words of the operations and of the runs. Pure (no React, no toolkit), so it is tested under Node and the dialogs, the job card and the
 * hook share one copy of every rule. The runtime's own refusals are not repeated here: a dialog shows the sentence the runtime sends.
 *
 * The runtime is the authority: a check here only lets a dialog say what is wrong before the request leaves, with the runtime's own words. What the runtime cannot be asked without
 * paying for a run (that a folder or a file is there) is not checked here; the runtime says it after the dialog is submitted, and the dialog shows that text as it is.
 * Nothing here judges what a project, an input or a request means: that stays the AI's. A text that is sent is sent as it was typed, trimmed as the runtime trims it and nothing else. */

// ---------- what the runtime says ----------

/** The budget of an AI run, in US dollars, when the person says nothing (the runtime's own default), and the most it accepts. */
export const DEFAULT_BUDGET = 5;
export const MAX_BUDGET = 100;
/** What the runtime says (and the page repeats before the run) when the coding agent of Settings is not Claude Code. */
export const NEEDS_CLAUDE = 'Making and changing a project needs Claude Code (the only agent Muro can hold to a budget). Choose Claude Code in Settings → AI.';
/** What the runtime and the factory say when the file changed after the page read it. */
export const CHANGED = 'The project file changed since it was opened: open it again and repeat the change';
const BAD_BUDGET = 'The AI budget must be above 0 and at most 100 USD';
const BAD_SLUG = 'The plugin id is lowercase letters and digits joined by dashes, such as my-plugin';
const NOT_A_SOURCE = 'An input is an https:// address or the full path of a folder on this computer';
const MAX_LINE = 200;
const MAX_TEXT = 4000;
const MAX_INSTRUCTION = 256 * 1024;
const MAX_INSTRUCTION_FILES = 50;
const MAX_RECORD = 20_000;

/** How long the runtime lets an AI run go before it stops it (`jobs::run`): a run of a project 120 minutes, the adaptation of a plugin 30. The page only says the numbers; the runtime keeps them. */
export const PROJECT_RUN_MINUTES = 120;
export const ADAPTATION_RUN_MINUTES = 30;
/** What a dialog that starts an AI run says under its fields: who does it, with what, at most what it costs, how long it may last, what it can reach, and what it does not do. */
export const AI_RUN_NOTE = `Claude Code does it on this computer with its own credentials, and spends at most the budget below. It works in a folder of its own, but it can read and write whatever you can, and it stops after ${PROJECT_RUN_MINUTES} minutes. The project file is replaced only when the build succeeds; nothing is installed until you install it.`;
/** The hint under the budget field: what the budget counts, and what a small one runs into. */
export const BUDGET_HINT = 'Checked between turns: the run can end slightly above it. Your Claude Code settings (plugins, hooks, instructions) load into every turn, so a small budget can run out before the work is done.';
/** Why Move pin is off for an input pinned to a frozen commit (`static`): it is held at the commit that was reviewed, on purpose. */
export const FROZEN_PIN = 'A frozen commit is held at the commit that was reviewed: its pin is not moved from here.';
/** The hint under the version step: why it matters. */
export const STEP_HINT = 'Harnesses update an installed plugin by its version.';
/** The steps the version can move by, with the label of each. */
export const VERSION_STEPS: readonly { value: VersionStep; label: string }[] = [
  { value: 'patch', label: 'Patch' }, { value: 'minor', label: 'Minor' }, { value: 'major', label: 'Major' },
];

/** The fields of a project's repository, in the order a dialog shows them: the key of `ProjectRepository`, its label, a placeholder, the value it starts with and a hint. */
export const REPOSITORY_FIELDS: readonly { key: keyof ProjectRepository; label: string; placeholder: string; initial: string; hint: string }[] = [
  { key: 'url', label: 'Repository', placeholder: 'https://github.com/owner/repository', initial: '', hint: 'Optional. The Git repository the project is published from. Leave it empty for a project that lives on this computer only.' },
  { key: 'branch', label: 'Branch', placeholder: 'main', initial: 'main', hint: 'Empty means main.' },
  { key: 'tag_prefix', label: 'Release tag prefix', placeholder: 'my-plugin-v', initial: '', hint: 'Releases are tagged with this prefix and the version.' },
];

export interface OperationWords {
  /** The heading of the dialog. */
  title: string;
  /** The button that starts the run. */
  submit: string;
  /** What the AI does, in one sentence. */
  does: string;
  /** What the dialog says about the change, under its heading. */
  about: string;
}
const WORDS: Record<ProjectOperation, OperationWords> = {
  create: { title: 'New project', submit: 'Create project', does: 'The AI reads each input, pins it, checks its license and makes one plugin of them.', about: 'One plugin made from the plugins and skills you name, harmonized by the AI, for every harness.' },
  harmonize: { title: 'Harmonize again', submit: 'Harmonize', does: 'The AI harmonizes the project again.', about: 'The AI reads the inputs and the decision records again and fixes what no longer holds.' },
  add_input: { title: 'Add an input', submit: 'Add input', does: 'The AI adds the input.', about: 'The AI pins the input, reads it and harmonizes it with the others.' },
  remove_input: { title: 'Remove an input', submit: 'Remove input', does: 'The AI removes the input.', about: 'What only this input brought leaves the project. The AI harmonizes what remains.' },
  move_pin: { title: 'Move a pin', submit: 'Move pin', does: 'The AI moves the pin.', about: 'The AI compares the pinned commit with the new one, reads the input again and reviews the choices the difference touches.' },
  instructions: { title: 'Your instructions', submit: 'Save and harmonize', does: 'The AI harmonizes the instructions with the inputs.', about: 'Your own Markdown notes. The AI decides how each one fits with the inputs and records why; it never changes them.' },
};
/** The words of a dialog and its button for an operation (`create` is a new project). */
export const operationWords = (operation: ProjectOperation): OperationWords => WORDS[operation];

/** How the version moves when the person does not say: an input added or removed is a minor step, the rest a patch (the runtime's own defaults). */
export const defaultStep = (operation: ChangeOperation): VersionStep => (operation === 'add_input' || operation === 'remove_input' ? 'minor' : 'patch');

/** What the runtime says when the agent is not Claude Code, or null: from `snapshot.registry.settings` (the harness of `ai`, else the old `agent`, else Claude Code, as the runtime reads it). */
export function agentRefusal(settings: { ai?: { harness?: string } | undefined; agent?: string | undefined } | null | undefined): string | null {
  const harness = settings?.ai?.harness ?? settings?.agent ?? 'claude-code';
  return harness === 'claude-code' ? null : NEEDS_CLAUDE;
}

// ---------- what a person typed: the checks the runtime makes again ----------

/** Characters as the runtime counts them (Rust's `chars()`): code points, not UTF-16 units. */
const chars = (text: string): number => [...text].length;
const isControl = (c: string): boolean => /\p{Cc}/u.test(c);

/** A text of a field. By default one line as the runtime's `line` takes it: trimmed, not empty, at most 200 characters and no control character. With `multiline` a request in words as its
 * `request_text` takes it: optional, at most 4000 characters, only a line break, a tab and a carriage return among the control characters. `what` starts the message ("The project name"). */
export function checkText(text: string, what: string, multiline = false): string | null {
  const value = text.trim();
  if (multiline) {
    if (chars(value) > MAX_TEXT) return `${what} must be at most ${MAX_TEXT} characters`;
    if ([...value].some(c => isControl(c) && c !== '\n' && c !== '\t' && c !== '\r')) return `${what} must be plain text`;
    return null;
  }
  if (!value) return `${what} is required`;
  if (chars(value) > MAX_LINE || isControl(value)) return `${what} must be one line of at most ${MAX_LINE} characters`;
  return null;
}

const isSlug = (id: string): boolean => id.length <= 64 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id);
/** The ids that are taken: of the projects of the list and of the plugins of the registry (the runtime refuses both, in different words). */
export interface Listed { projects?: readonly string[]; plugins?: readonly string[] }
const isIds = (value: readonly string[] | Listed): value is readonly string[] => Array.isArray(value);

/** The plugin id of a new project (the runtime's `create`): kebab-case of at most 64 characters, not a project or a plugin already listed. `listed` is the ids of the
 * projects (`list.map(p => p.id)`), or `{projects, plugins}` (`snapshot.registry.plugins`). */
export function checkSlug(slug: string, listed: readonly string[] | Listed = []): string | null {
  const id = slug.trim();
  if (!isSlug(id)) return BAD_SLUG;
  const taken: Listed = isIds(listed) ? { projects: listed } : listed;
  if (taken.projects?.includes(id)) return `A project for ${id} is already in your list`;
  if (taken.plugins?.includes(id)) return `A plugin named ${id} is already in your list: choose another plugin id`;
  return null;
}

/** The plugin id a name suggests while nobody typed one: accents dropped, every other run of characters a dash, at most 64 characters. A suggestion to read, never a decision. */
export const slugOf = (name: string): string => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/, '');

/** A full path of this computer: a drive letter and a separator, a share (`\\server`) or a root (`/`). The runtime asks `Path::is_absolute` of the machine it runs on, which on Windows takes the first two
 * and not a root alone: a path that begins with `/` passes here and the runtime says what it thinks of it. */
export const isFullPath = (text: string): boolean => /^([A-Za-z]:[\\/]|\\\\[^\\/]|\/)/.test(text);

/** Where an input comes from (the runtime's `source`): an `https://` address without spaces (a folder of the repository after the hash sign), or the full path of a folder. */
export function checkSource(text: string): string | null {
  const bad = checkText(text, 'Where the input comes from');
  if (bad) return bad;
  const value = text.trim();
  if (value.startsWith('https://')) {
    const rest = value.slice('https://'.length);
    return !rest || /\s/u.test(rest) ? "An input's address must be an https:// address without spaces" : null;
  }
  return isFullPath(value) ? null : NOT_A_SOURCE;
}

/** The folder a new project's file goes in (the runtime's `create`): one line, a full path. That it is there is the runtime's to say. */
export function checkFolder(text: string): string | null {
  return checkText(text, 'The folder') ?? (isFullPath(text.trim()) ? null : 'Choose the folder with its full path');
}

/** The inputs of a form as sources: one per line, trimmed, blank lines left out. */
export const inputLines = (text: string): string[] => text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

/** The inputs of a new project, each checked as `checkSource` and then as a set (at least one, at most 20, none twice): the first message, or null. */
export function checkInputs(inputs: string | readonly string[]): string | null {
  const sources = typeof inputs === 'string' ? inputLines(inputs) : inputs.map(i => i.trim()).filter(Boolean);
  if (!sources.length) return 'Add at least one input: a project is made from plugins and skills';
  if (sources.length > 20) return 'At most 20 inputs at once';
  for (const source of sources) {
    const bad = checkSource(source);
    if (bad) return bad;
  }
  const twice = sources.find((source, i) => sources.indexOf(source) !== i);
  return twice === undefined ? null : `The input ${twice} is named twice`;
}

const DECIMAL = /^(\d+(\.\d*)?|\.\d+)$/;
/** A budget as typed: a plain decimal number, else NaN (so `0x10`, `1e2` and `5,5` are no budget). */
export const parseBudget = (text: string): number => (DECIMAL.test(text.trim()) ? Number(text.trim()) : Number.NaN);
/** The budget of an AI run (the runtime's `validate_budget`): above 0 and at most 100 USD. */
export function checkBudget(text: string): string | null {
  const budget = parseBudget(text);
  return budget > 0 && budget <= MAX_BUDGET ? null : BAD_BUDGET;
}

export type RepositoryErrors = Partial<Record<keyof ProjectRepository, string>>;
/** The repository of the form as the request carries it: null when the address is empty (none, or taken away), else the three fields trimmed, an empty branch being `main`. */
export function repositoryOf(form: ProjectRepository | null | undefined): ProjectRepository | null {
  const url = form?.url.trim() ?? '';
  return form && url ? { url, branch: form.branch.trim() || 'main', tag_prefix: form.tag_prefix.trim() } : null;
}
/** What is wrong with the repository fields (the runtime's `repository`): nothing while the address is empty; else the address one line and an `https://` address without spaces, the branch and
 * the prefix, when given, one line each. */
export function checkRepository(form: ProjectRepository | null | undefined): RepositoryErrors {
  const errors: RepositoryErrors = {};
  if (!form || !form.url.trim()) return errors;
  const url = form.url.trim();
  const address = checkText(url, 'The repository address');
  if (address) errors.url = address;
  else if (!url.startsWith('https://') || url.includes(' ')) errors.url = 'The repository address must be an https:// address';
  const branch = form.branch.trim() ? checkText(form.branch, 'The branch') : null;
  if (branch) errors.branch = branch;
  const prefix = form.tag_prefix.trim() ? checkText(form.tag_prefix, 'The tag prefix') : null;
  if (prefix) errors.tag_prefix = prefix;
  return errors;
}

const bytes = (text: string): number => new TextEncoder().encode(text).length;
/** The edits of the instruction files (the runtime's `instruction_edits`): at least one, at most 50; each path of plain folder and file names joined by `/`, ending in `.md`; no file twice, whatever the case;
 * no text over 256 KiB. The first message, or null. A removal is `text` null. */
export function checkInstructions(edits: readonly InstructionEdit[]): string | null {
  if (!edits.length) return 'Change at least one instruction file';
  if (edits.length > MAX_INSTRUCTION_FILES) return `At most ${MAX_INSTRUCTION_FILES} instruction files at once`;
  const seen: string[] = [];
  for (const edit of edits) {
    const path = edit.path.trim();
    if (!path || bytes(path) > MAX_LINE) return 'An instruction file needs a name';
    if (!path.toLowerCase().endsWith('.md')) return `An instruction file is Markdown: its name ends in .md (${path})`;
    for (const part of path.split('/')) {
      if (!part || part === '.' || part === '..' || /[. ]$/.test(part) || [...part].some(c => isControl(c) || '\\:<>"|?*'.includes(c))) {
        return `An instruction file's name is plain folder and file names separated by / (${path})`;
      }
    }
    if (seen.includes(path.toLowerCase())) return `The instruction file ${path} is named twice`;
    seen.push(path.toLowerCase());
    if (edit.text !== null && bytes(edit.text) > MAX_INSTRUCTION) return `${path} is larger than 256 KiB`;
  }
  return null;
}

/** What a sheet of instruction files changes against the files the project holds: each file written (new, renamed or changed) with its text, each one no longer there removed with null. A path is trimmed,
 * its backslashes are slashes and its leading slashes are gone; a name kept in another case is a write, not a removal. */
export function instructionDiff(held: readonly InstructionFile[], rows: readonly InstructionFile[]): InstructionEdit[] {
  const named = rows.map(row => ({ path: row.path.trim().replace(/\\/g, '/').replace(/^\/+/, ''), text: row.text }));
  const kept = new Set(named.map(row => row.path.toLowerCase()));
  const edits: InstructionEdit[] = [];
  for (const file of held) if (!kept.has(file.path.toLowerCase())) edits.push({ path: file.path, text: null });
  for (const row of named) {
    const before = held.find(file => file.path === row.path);
    if (!before || before.text !== row.text) edits.push({ path: row.path, text: row.text });
  }
  return edits;
}

/** The decision records as the factory takes them (its `check_records`): a unique id of letters, digits, dots, dashes or underscores, a real `YYYY-MM-DD` date, subjects that are names, a text of at most
 * 20,000 characters, an author of `muro` or `you`, a binding that is true or false. The first message, or null. */
export function checkRecords(records: readonly ProjectRecord[]): string | null {
  const seen = new Set<string>();
  for (const [index, record] of records.entries()) {
    if (typeof record.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(record.id)) return `Record ${index + 1} needs an id of letters, digits, dots, dashes or underscores`;
    if (seen.has(record.id)) return `Two records have the id ${record.id}`;
    seen.add(record.id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date)) return `Record ${record.id} needs a date as YYYY-MM-DD`;
    const [year, month, day] = record.date.split('-').map(Number) as [number, number, number];
    const real = new Date(Date.UTC(year, month - 1, day));
    if (real.getUTCFullYear() !== year || real.getUTCMonth() !== month - 1 || real.getUTCDate() !== day) return `Record ${record.id} needs a real date`;
    if (!Array.isArray(record.subjects) || !record.subjects.every(s => typeof s === 'string' && s.trim())) return `Record ${record.id}: subjects must be a list of names`;
    if (typeof record.text !== 'string' || !record.text.trim()) return `Record ${record.id} needs a text`;
    if (chars(record.text) > MAX_RECORD) return `Record ${record.id} is longer than ${MAX_RECORD} characters`;
    if (record.author !== 'muro' && record.author !== 'you') return `Record ${record.id}: the author is muro or you`;
    if (typeof record.binding !== 'boolean') return `Record ${record.id}: binding must be true or false`;
  }
  return null;
}

/** The id of a record the owner adds on `date`: `you-<date>-<n>`, the first n not taken. */
export function newRecordId(date: string, records: readonly { id: string }[]): string {
  let n = 1;
  while (records.some(r => r.id === `you-${date}-${n}`)) n++;
  return `you-${date}-${n}`;
}

// ---------- the requests ----------

/** What the dialog of a new project holds, as typed. `inputs` is the box of addresses (one per line) or the rows of them; `repository` is its three fields, an empty address meaning none. */
export type NewProjectForm = { name: string; slug: string; author: string; folder: string; inputs: string | readonly string[]; request: string; repository?: ProjectRepository | null; budget: string };
/** `create_project`: every key the runtime reads. `repository` is null when there is none. */
export type NewProjectPayload = { name: string; slug: string; author: string; folder: string; inputs: { source: string }[]; request: string; repository: ProjectRepository | null; budget_usd: number };
/** What the dialog of a change holds, as typed: the budget as text and, by operation, `source` (add_input), `input` (remove_input, move_pin), `to` (move_pin: empty is the newest release) or `instructions`
 * (the edits `instructionDiff` made). `step` is the version step; without it the operation's default. */
export type ChangeForm = { budget: string; step?: VersionStep; request?: string; source?: string; input?: string; to?: string; instructions?: readonly InstructionEdit[] };
/** `project_job`: the keys the runtime reads, and for each operation only the ones it uses. */
export type ChangePayload = { id: string; digest: string; operation: ChangeOperation; budget_usd: number; step: VersionStep; request: string; source?: string; input?: string; to?: string; instructions?: InstructionEdit[] };
/** What an edit by hand changes: only the keys present are sent. `repository` null takes it away; an empty address does too. */
export type EditPatch = { name?: string; author?: string; repository?: ProjectRepository | null; records?: readonly ProjectRecord[]; changelog?: string };
/** `edit_project`: the digest of the file the page read, and what changes. */
export type EditPayload = { id: string; digest: string; name?: string; author?: string; repository?: ProjectRepository | null; records?: ProjectRecord[]; changelog?: string };
/** `delete_project`: the registry revision the page read (the runtime refuses a stale one) and the project. */
export type DeletePayload = { id: string; revision: number };

/** The request as the runtime reads it: trimmed, a line break being one line feed. */
const requestOf = (text: string): string => text.trim().replace(/\r\n/g, '\n');
/** The budget of a form as a number. A budget that is no budget is an error here, never a number the request would send as nothing: the runtime reads a missing or null budget as the default, which would run at
 * a cost the person did not choose. */
function budgetOf(text: string): number {
  const bad = checkBudget(text);
  if (bad) throw new Error(bad);
  return parseBudget(text);
}

/** `create_project` from the dialog of a new project. */
export function newProjectPayload(form: NewProjectForm): NewProjectPayload {
  const sources = typeof form.inputs === 'string' ? inputLines(form.inputs) : form.inputs.map(i => i.trim()).filter(Boolean);
  return {
    name: form.name.trim(), slug: form.slug.trim(), author: form.author.trim(), folder: form.folder.trim(), inputs: sources.map(source => ({ source })),
    request: requestOf(form.request), repository: repositoryOf(form.repository), budget_usd: budgetOf(form.budget),
  };
}

/** `project_job` for the project `id`, on the file whose digest the page read (`info.digest`). */
export function changePayload(id: string, digest: string, operation: ChangeOperation, form: ChangeForm): ChangePayload {
  const payload: ChangePayload = { id, digest, operation, budget_usd: budgetOf(form.budget), step: form.step ?? defaultStep(operation), request: requestOf(form.request ?? '') };
  if (operation === 'add_input') payload.source = (form.source ?? '').trim();
  if (operation === 'remove_input' || operation === 'move_pin') payload.input = (form.input ?? '').trim();
  if (operation === 'move_pin') payload.to = (form.to ?? '').trim();
  if (operation === 'instructions') payload.instructions = (form.instructions ?? []).map(edit => ({ path: edit.path.trim(), text: edit.text }));
  return payload;
}

/** `edit_project` for the project `id`, on the file whose digest the page read (after an edit, the digest the answer carried). */
export function editPayload(id: string, digest: string, patch: EditPatch): EditPayload {
  const payload: EditPayload = { id, digest };
  if (patch.name !== undefined) payload.name = patch.name.trim();
  if (patch.author !== undefined) payload.author = patch.author.trim();
  if (patch.repository !== undefined) payload.repository = repositoryOf(patch.repository);
  if (patch.records !== undefined) payload.records = patch.records.map(r => ({ id: r.id, date: r.date, subjects: [...r.subjects], text: r.text, author: r.author, binding: r.binding }));
  if (patch.changelog !== undefined) payload.changelog = patch.changelog;
  return payload;
}

/** `delete_project` for the project `id`, with the revision of the registry the page read. */
export const deletePayload = (id: string, revision: number): DeletePayload => ({ id, revision });

// ---------- releasing a project ----------

/** Releasing (ADR-0034): the runtime has the factory put the project's file into the repository its `project.json` names (`release_project`, `muro project release`), with the person's own Git, and
 * that repository's workflow makes the release. No AI runs. What the page says before the release is what the file says (`releaseOf` in data.ts); what it says after is the command's own sentence. */

/** Why Release… is off for a project whose file names no repository, and where one is given. */
export const NO_RELEASE_REPOSITORY = 'This project names no repository: give it one in Edit details…';
/** What the release dialog says under its title: what is done, by whom, and that it is not taken back from here. */
export const RELEASE_ABOUT = 'The project file is pushed to its repository with your own Git, and the workflow of that repository then makes the release. A push cannot be taken back from here.';
/** What it says under the facts of the release: whose push it is, and what the repository does with the file. */
export const RELEASE_NOTE = 'Git pushes under your name and with your credentials: Muro asks for none, keeps none and forces nothing. The workflow of the repository builds the plugin store from the file and publishes the release under its tag.';
/** The one switch of the dialog (`init`), and what it does. */
export const RELEASE_INIT = 'Add the release workflow when the repository has none';
export const RELEASE_INIT_HINT = 'The workflow is added as .github/workflows/release.yml, in the same commit as the project file, and calls the store workflow of this version of Muro. A workflow that is already there is never replaced.';
/** `release_project`: the digest of the file the page read, and whether the release workflow is added to a repository that has none. */
export type ReleasePayload = { id: string; digest: string; init: boolean };
/** `release_project` for the project `id`, on the file whose digest the page read (`info.digest`). */
export const releasePayload = (id: string, digest: string, init: boolean): ReleasePayload => ({ id, digest, init });
/** What the page says once a release is answered: the command's own sentence (`reason`), which also says that nothing was pushed when the repository already holds the file, and carries its
 * warnings. An answer without one says only whether a commit was pushed. */
export function releasedLine(done: Partial<ProjectRelease> | null | undefined): string {
  const said = typeof done?.reason === 'string' ? done.reason.trim() : '';
  return said || (done?.pushed === true ? 'The project file was pushed to its repository.' : 'Nothing was pushed.');
}

// ---------- extracting a project for one harness ----------

/** Extracting (ADR-0035): the runtime has the factory write the plugin the file carries for one harness into a folder (`extract_project`, `muro project extract`). Nothing is built. */
export const EXTRACT_ABOUT = 'Choose a harness and a destination. Muro writes an installable copy in a new folder named after the harness.';
export async function pickProjectFile(request: Transport): Promise<string | null> {
  const picked = await request<{ path: string | null } | null>('pick_file', { filter: 'Muro project (*.mp)' });
  return picked?.path ?? null;
}
/** Windows reports full paths both with and without a verbatim prefix. POSIX paths keep their case. */
export function projectFileKey(path: string): string {
  const flat = path.replace(/\\/g, '/').replace(/^\/\/\?\/UNC\//i, '//').replace(/^\/\/\?\//, '').replace(/\/+$/, '');
  return /^(?:[a-z]:\/|\/\/)/i.test(flat) ? flat.toLowerCase() : flat;
}
/** The harnesses Muro builds an adapter for (the runtime's `HARNESSES`). A file whose build lacks one is refused by the command, which says which it has. */
export const EXTRACT_HARNESSES = ['claude-code', 'codex', 'opencode', 'pi', 'hermes'] as const;
export type ExtractPayload = { id: string; harness: string; folder: string };
export const extractPayload = (id: string, harness: string, folder: string): ExtractPayload => ({ id, harness, folder: folder.trim() });
/** What the page says once it is done: the folders written, as the command named them. */
export function extractedLine(done: { folders?: unknown } | null | undefined): string {
  const folders = Array.isArray(done?.folders) ? done.folders : [];
  return folders.length ? `Exported to ${folders.join(' and ')}` : 'The plugin was exported.';
}

// ---------- the runs the runtime holds ----------

export const isRunning = (job: Job): boolean => job.status === 'running';
const isProject = (job: Job): boolean => job.kind === 'project';
/** When the run started, in epoch seconds (0 when the runtime did not say): the runtime sends a number, an older answer a text of digits. */
export function startedAt(job: Job): number {
  const seconds = Number(job.time);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}
const newestFirst = (jobs: readonly Job[]): Job[] => [...jobs].sort((a, b) => startedAt(b) - startedAt(a));

/** The AI run in progress, whatever it is (a project's, or the adaptation of a plugin): the runtime lets one go at a time. */
export const runningJob = (jobs: readonly Job[]): Job | null => jobs.find(isRunning) ?? null;
/** The run that is changing this project. */
export const runningOn = (jobs: readonly Job[], projectId: string): Job | null => jobs.find(j => isRunning(j) && isProject(j) && j.project_id === projectId) ?? null;
/** The newest run of this project that is over, whatever came of it. */
export const lastOver = (jobs: readonly Job[], projectId: string): Job | null => newestFirst(jobs.filter(j => !isRunning(j) && isProject(j) && j.project_id === projectId))[0] ?? null;
/** What a run is called: its own title (a project run has one), else the plugin an adaptation adapts. */
export const jobTitle = (job: Job): string => job.title || (isProject(job) ? 'Changing the project' : job.plugin_id ? `The adaptation of ${job.plugin_id}` : 'An adaptation');
/** Why the page offers no other change while a run goes, in its words, or null when none does. The card of that run, with its Cancel, is on the Projects page (`JobCard`). */
export function busyReason(running: Job | null): string | null {
  if (!running) return null;
  return `${jobTitle(running)} is running: one AI run goes at a time. Wait for it to finish, or cancel it.`;
}

/** The phase the runtime says while the factory builds and saves a project run (`project_jobs.rs`). From there on the runtime ignores a Cancel: a build that replaces the file cannot be stopped half way. */
export const SAVING_PHASE = 'Building and saving the project';
/** What the card says instead of Cancel in that phase. */
export const NOT_CANCELLABLE = 'The project is being saved: it cannot be cancelled now';
/** Whether the page offers Cancel for this run: every run, but a project run that is being saved. */
export const canCancel = (job: Job): boolean => !(isProject(job) && job.phase === SAVING_PHASE);
/** After how many minutes the runtime stops this run. */
export const runLimit = (job: Job): number => (isProject(job) ? PROJECT_RUN_MINUTES : ADAPTATION_RUN_MINUTES);

/** The project runs that were running in `before` and are over in `after`: what a reading of the jobs tells that the one before did not. */
export function endedBetween(before: readonly Job[], after: readonly Job[]): Job[] {
  const was = new Set(before.filter(isRunning).map(j => j.id));
  return after.filter(j => isProject(j) && !isRunning(j) && was.has(j.id));
}
/** The jobs with `job` in place of the one of its id, or first when it is new. */
export const upsertJob = (jobs: readonly Job[], job: Job): Job[] => (jobs.some(j => j.id === job.id) ? jobs.map(j => (j.id === job.id ? job : j)) : [job, ...jobs]);

/** What to say when a project run is over, in the runtime's words (its title and its message), and whether it is an error. Null while it runs, and for a status this window does not know. */
export function outcomeOf(job: Job): { text: string; error: boolean } | null {
  const title = job.title || 'The AI run';
  const said = job.message ? `: ${job.message}` : '.';
  switch (job.status) {
    case 'completed': return { text: job.message ? `${title}: ${job.message}` : `${title}: done.`, error: false };
    case 'failed': return { text: `${title} failed${said}`, error: true };
    case 'cancelled': return { text: `${title} was cancelled${said}`, error: false };
    case 'interrupted': return { text: `${title} was interrupted${said}`, error: true };
    default: return null;
  }
}
