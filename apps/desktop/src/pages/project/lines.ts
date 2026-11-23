import type { Engine } from '../../model.ts';
import { harnessNames, obj, text } from '../../model.ts';
import type { ProjectInfo, ProjectSummary } from '../../types.ts';
import { day, money, plural, took } from '../../words.ts';
import type { Who } from './graph-model.ts';

/** The lines the Projects tab writes from data: the engine a free-text request uses and what it may cost, who answered one, what a listed project holds, and the details
 * of an open project. Pure: no React, no Sigrid, so it runs under plain Node (tests/project-data.test.ts). */

/** A harness by the name the window gives it, or its id when the window has none; an id that names something of every object (`constructor`) is no name either. */
export const harnessName = (id: string): string => Object.hasOwn(harnessNames, id) ? harnessNames[id] : id;

/** Who answers a free-text request, in the words of the button that waits for it ("Asking Claude Code…"). */
export const asking = (e: Engine): string => e.api ? e.model || 'the API' : harnessName(e.harness);

/** What the first free-text request will use and may cost. Documented examples run no AI. */
export function noteText(e: Engine): string {
  if (e.api) return `Free-text requests are sent to ${e.model || 'the model set in Settings'} through ${e.base || 'the endpoint set in Settings'} and billed by your API provider. Documented examples run no AI.`;
  const name = harnessName(e.harness);
  const cost = e.harness === 'codex' ? ` Muro sets no budget for ${name}.` : e.budget !== null ? ` Each costs up to ${money(e.budget)} a request.` : '';
  return `Free-text requests use ${name} on this computer, with its own credentials.${cost} Documented examples run no AI.`;
}

/** Who answered a free-text request, what it cost and how long it took, as far as the runtime knows. */
export function whoLine(w: Who | null): string {
  if (!w) return '';
  const name = w.engine === 'api' ? w.model || 'the API' : harnessName(w.harness ?? '') || w.harness || w.engine;
  return [`Asked ${name}`, w.cost_usd !== null ? money(w.cost_usd) : '', w.duration_ms !== null ? took(w.duration_ms) : ''].filter(Boolean).join(' · ');
}

/** What a listed project holds, as the list says it: its inputs and its capabilities. A count the runtime did not send is left out, never shown as zero. */
export function countsOf(p: Pick<ProjectSummary, 'inputs' | 'capabilities'>): string {
  const count = (n: unknown, one: string, many?: string): string => typeof n === 'number' ? plural(n, one, many) : '';
  return [count(p.inputs, 'input'), count(p.capabilities, 'capability', 'capabilities')].filter(Boolean).join(' · ');
}

/** The details of an open project, under its name: its repository and branch (or that it has none), who made it and when. A field the file holds in another shape is left out. */
export function aboutLine(info: ProjectInfo): string {
  const p = obj(info.project) ?? {}, repo = obj(p.repository);
  const url = text(repo?.url).replace(/^https?:\/\//, ''), branch = text(repo?.branch), author = text(p.author), created = text(p.created);
  return [
    repo && url ? `Repository ${url}` : 'No Git repository set',
    repo && url ? branch : '',
    author ? `by ${author}` : '',
    created ? `created ${day(created)}` : '',
  ].filter(Boolean).join(' · ');
}
