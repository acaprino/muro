import type { DecisionForm, ProjectDecision, ProjectInfo, ProjectInput, ProjectRecord, ProjectRun } from '../../types.ts';
import { amount, obj, text } from '../../model.ts';
import { capsOf, entriesOf, examplesOf } from './graph-model.ts';
import type { Cap, Entry, Example } from './graph-model.ts';
import { plural } from '../../words.ts';

/** What the workspace reads of a project, once per project: the graph through `graph-model.ts`, the rest as the service sends it. A project file may come from
 * elsewhere and its records and runs are written by hand, so every row is read for what is there: a list that is not a list is an empty one, a row that is not an
 * object is left out, and a field of another shape becomes text (below), never an object that would reach the page and stop it. Pure: nothing here decides what a
 * request means or which capability an input is; the decisions say it (their `source` and `targets`), never a name. */
export interface ProjectData {
  info: ProjectInfo;
  slug: string;
  caps: Cap[];
  entries: Entry[];
  examples: Example[];
  inputs: ProjectInput[];
  decisions: ProjectDecision[];
  records: ProjectRecord[];
  history: ProjectRun[];
}
const rows = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.map(obj).filter((x): x is Record<string, unknown> => !!x) : [];
const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const orNull = (v: unknown): string | null => typeof v === 'string' ? v : null;
const count = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
/** Free text a person reads (a record, a changelog entry, a choice and its reason): a string as it is; anything else the file holds there, as its JSON, so it is seen as it is. */
export function said(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  try { return JSON.stringify(v) ?? ''; } catch { return ''; }
}

const inputOf = (r: Record<string, unknown>): ProjectInput => {
  const b = obj(r.became) ?? {};
  return {
    id: text(r.id), url: orNull(r.url), pin: text(r.pin), release: orNull(r.release), commit: orNull(r.commit), license: orNull(r.license), paths: strings(r.paths),
    became: { capability: count(b.capability), 'always-on': count(b['always-on']), hook: count(b.hook), dropped: count(b.dropped) },
  };
};
// A form or a status this window does not know stays as it came: the page shows it as it is (Details.tsx, RunsPanel.tsx).
const decisionOf = (r: Record<string, unknown>): ProjectDecision => ({ source: text(r.source), content: said(r.content), form: text(r.form) as DecisionForm, targets: strings(r.targets), reason: said(r.reason) });
const recordOf = (r: Record<string, unknown>): ProjectRecord => ({ id: text(r.id), date: text(r.date), subjects: strings(r.subjects), text: said(r.text), author: r.author === 'you' ? 'you' : 'muro', binding: r.binding === true });
const runOf = (r: Record<string, unknown>): ProjectRun => ({
  id: text(r.id), time: text(r.time), version: text(r.version), status: text(r.status) as ProjectRun['status'], budget_usd: amount(r.budget_usd), engine: orNull(r.engine),
  pins: Object.fromEntries(Object.entries(obj(r.pins) ?? {}).filter((pair): pair is [string, string] => typeof pair[1] === 'string')), changelog: said(r.changelog),
});

export function projectData(info: ProjectInfo): ProjectData {
  return {
    info, slug: text(info.plugin?.slug), caps: capsOf(info), entries: entriesOf(info), examples: examplesOf(info),
    inputs: rows(info.inputs).filter(i => typeof i.id === 'string').map(inputOf), decisions: rows(info.decisions).map(decisionOf),
    records: rows(info.records).map(recordOf), history: rows(info.history).map(runOf),
  };
}

/** The capabilities the decisions of an input target, in the order first met and once each: what the input became, as the harmonization recorded it. */
export const targetsOf = (decisions: ProjectDecision[], input: string): string[] => [...new Set(decisions.filter(d => d.source === input).flatMap(d => strings(d.targets)))];
/** The inputs whose decisions target a capability: where it comes from. A decision that names no input is no one's. */
export const sourcesOf = (decisions: ProjectDecision[], capability: string): string[] => [...new Set(decisions.filter(d => typeof d.source === 'string' && d.source !== '' && strings(d.targets).includes(capability)).map(d => d.source))];

/** What an input became, by form, in the words of the interface: only the forms that are used. */
export function becameParts(input: ProjectInput): string[] {
  const n = (input.became ?? {}) as Partial<ProjectInput['became']>;
  return [
    count(n.capability) ? plural(count(n.capability), 'capability', 'capabilities') : '',
    count(n['always-on']) ? `${count(n['always-on'])} always on` : '',
    count(n.hook) ? plural(count(n.hook), 'hook') : '',
    count(n.dropped) ? `${count(n.dropped)} dropped` : '',
  ].filter(Boolean);
}
/** How an input is pinned: its release (the published tag), its latest commit, or a frozen one; and what the pin resolved to. */
export function pinnedOf(input: ProjectInput): { title: string; line: string } {
  const commit = input.commit ? `@${input.commit.slice(0, 7)}` : 'not resolved yet';
  if (input.pin === 'release') return { title: input.release || 'Release', line: 'published release' };
  if (input.pin === 'head') return { title: 'Latest commit', line: commit };
  return { title: 'Frozen commit', line: commit };
}
/** The custom instructions the project file holds, as the file's own list of parts says them. */
export const instructionsOf = (info: ProjectInfo): string => text(rows(info.files).find(f => f.part === 'Your instructions')?.detail) || 'None yet';

/** The runs of the harmonization, newest first, and which of them built the version the project is at: the newest completed run of that version, never a newer
 * run that was cancelled or failed. -1 when none did. */
export function runsOf(data: ProjectData): { runs: ProjectRun[]; current: number } {
  const runs = [...data.history].sort((a, b) => (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0));
  return { runs, current: runs.findIndex(r => r.status === 'completed' && r.version === data.info.plugin?.version) };
}
/** The tag a run's version has in the project's repository (the repository's `tag_prefix` and the version), or '' for a project with no repository or a run with no version. */
export function tagOf(info: ProjectInfo, version: string): string {
  const repo = obj(info.project?.repository);
  return repo && version ? text(repo.tag_prefix) + version : '';
}
