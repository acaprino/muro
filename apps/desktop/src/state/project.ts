import { obj, text } from '../model.ts';
import { readOutcome } from '../pages/project/graph-model.ts';
import type { Outcome } from '../pages/project/graph-model.ts';

/** The open project of the Projects tab, as plain data: which project, which panel of the workspace is shown, what the inspector shows and the simulation of a request.
 * Pure (no React), so the rules are tested under Node. It survives a reload of the page, as the old window's project page did: in the session, never in a file.
 * What a reload brings back is read for what it is: a record this page did not write is no record, and a simulation that was waiting for the AI never comes back as waiting. */

/** The four panels at the left of the workspace, in the order of their segmented control. */
export type Panel = 'inputs' | 'examples' | 'records' | 'runs';
export const PANELS: readonly Panel[] = ['inputs', 'examples', 'records', 'runs'];
const KINDS: readonly string[] = ['example', 'capability', 'input'];

/** What the inspector shows: a documented example (`id` is its index in the project's examples, as a string), a capability (its id) or an input (its id). */
export type Selected = { kind: 'example' | 'capability' | 'input'; id: string } | null;

/** The simulation of a request, copied from the old window (pages/project/graph.ts) with its rules. */
export interface SimState {
  /** The request in the box. */
  task: string;
  /** The documented example that lights the graph (an index into the project's examples), or null. */
  example: number | null;
  /** The name of the free-text request being waited for, or null. It is the name the runtime knows the run by (so it can be stopped); never kept in the session. */
  run: string | null;
  /** What the box says is wrong (an empty request); never kept. */
  error: string;
  /** The last free-text outcome. */
  result: Outcome | null;
}
export const newSim = (): SimState => ({ task: '', example: null, run: null, error: '', result: null });
/** A simulation from what a reload brings back (anything): always valid, never running, never with an error. */
export function restoreSim(raw: unknown): SimState {
  const o = obj(raw) ?? {};
  return { task: text(o.task), example: typeof o.example === 'number' && Number.isInteger(o.example) && o.example >= 0 ? o.example : null, run: null, error: '', result: readOutcome(o.result) };
}

export interface ProjectView { id: string; panel: Panel; selected: Selected; sim: SimState }
/** A project opened from the list: its examples first (the graph and what lights it), nothing selected, no simulation. */
export const fresh = (id: string): ProjectView => ({ id, panel: 'examples', selected: null, sim: newSim() });

/** The same thing selected, or both nothing. */
export const sameSelected = (a: Selected, b: Selected): boolean => a === b || (!!a && !!b && a.kind === b.kind && a.id === b.id);

/** A selection as a reload brings it back: null, or a kind this page knows with a nonempty id (an example's id is an index). `undefined` when it is neither, which makes the record no record. */
function selectedOf(raw: unknown): Selected | undefined {
  if (raw === null) return null;
  const o = obj(raw);
  if (!o || typeof o.kind !== 'string' || !KINDS.includes(o.kind) || typeof o.id !== 'string' || !o.id) return undefined;
  if (o.kind === 'example' && !/^\d+$/.test(o.id)) return undefined;
  return { kind: o.kind as NonNullable<Selected>['kind'], id: o.id };
}

const KEY = 'muro.project';
const store = (): Storage | null => { try { return globalThis.sessionStorage ?? null; } catch { return null; } };

/** The record of the open project, or null when there is none or it is not one this page wrote. A selection the project no longer has is the workspace's to ignore: it cannot be known here. */
export function recall(): ProjectView | null {
  try {
    const raw = obj(JSON.parse(store()?.getItem(KEY) ?? 'null'));
    if (!raw || typeof raw.id !== 'string' || !raw.id || !PANELS.includes(raw.panel as Panel)) return null;
    const selected = selectedOf(raw.selected ?? null);
    if (selected === undefined) return null;
    return { id: raw.id, panel: raw.panel as Panel, selected, sim: restoreSim(raw.sim) };
  } catch { return null; }
}
/** Keeps the open project (null forgets it). The run waited for and the box's error are not kept: a reload never shows a request as running. */
export function remember(project: ProjectView | null): void {
  try {
    if (!project) { store()?.removeItem(KEY); return; }
    const { task, example, result } = project.sim;
    store()?.setItem(KEY, JSON.stringify({ id: project.id, panel: project.panel, selected: project.selected, sim: { task, example, result } }));
  } catch { /* a session that keeps nothing: the page works until it is reloaded */ }
}

// The note on what a free-text request uses and may cost is said until the first free-text request of the session starts, and then never again: after it, the result names the engine and the cost.
const NOTE = 'muro.simulated';
export const noteTold = (): boolean => { try { return store()?.getItem(NOTE) === '1'; } catch { return false; } };
export const tellNote = (): void => { try { store()?.setItem(NOTE, '1'); } catch { /* a session that keeps nothing says it each time */ } };
