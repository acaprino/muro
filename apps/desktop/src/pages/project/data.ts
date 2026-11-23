import type { ProjectDecision, ProjectInfo, ProjectInput, ProjectRecord, ProjectRun } from '../../types.ts';
import { text } from '../../model.ts';
import { capsOf, entriesOf, examplesOf } from './graph-model.ts';
import type { Cap, Entry, Example } from './graph-model.ts';
import { plural } from '../../words.ts';

/** What the workspace reads of a project, once per project: the graph through `graph-model.ts`, the rest as the service sends it. A project file may come from
 * elsewhere, so a list that is not a list is an empty one. Pure: nothing here decides what a request means or which capability an input is; the decisions say it
 * (their `source` and `targets`), never a name. */
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
const listOf = <T>(v: unknown): T[] => Array.isArray(v) ? v.filter((x): x is T => !!x && typeof x === 'object') : [];

export function projectData(info: ProjectInfo): ProjectData {
  return {
    info, slug: text(info.plugin?.slug), caps: capsOf(info), entries: entriesOf(info), examples: examplesOf(info),
    inputs: listOf<ProjectInput>(info.inputs).filter(i => typeof i.id === 'string'), decisions: listOf<ProjectDecision>(info.decisions),
    records: listOf<ProjectRecord>(info.records), history: listOf<ProjectRun>(info.history),
  };
}

const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
/** The capabilities the decisions of an input target, in the order first met and once each: what the input became, as the harmonization recorded it. */
export const targetsOf = (decisions: ProjectDecision[], input: string): string[] => [...new Set(decisions.filter(d => d.source === input).flatMap(d => strings(d.targets)))];
/** The inputs whose decisions target a capability: where it comes from. */
export const sourcesOf = (decisions: ProjectDecision[], capability: string): string[] => [...new Set(decisions.filter(d => typeof d.source === 'string' && strings(d.targets).includes(capability)).map(d => d.source))];

/** What an input became, by form, in the words of the interface: only the forms that are used. */
export function becameParts(input: ProjectInput): string[] {
  const n = (input.became ?? {}) as Partial<ProjectInput['became']>, count = (v: unknown) => typeof v === 'number' && v > 0 ? v : 0;
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
export const instructionsOf = (info: ProjectInfo): string => listOf<{ part: string; detail: string }>(info.files).find(f => f.part === 'Your instructions')?.detail || 'None yet';

/** The runs of the harmonization, newest first, and which of them built the version the project is at. */
export function runsOf(data: ProjectData): { runs: ProjectRun[]; current: number } {
  const runs = [...data.history].sort((a, b) => (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0));
  return { runs, current: runs.findIndex(r => r.status === 'completed' && r.version === data.info.plugin?.version) };
}
