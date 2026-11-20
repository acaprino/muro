import type { ProjectView, ProjectsState } from '../../types.ts';
import { newSim, restoreSim } from './graph.ts';

/** The four steps of a project page, in order: what the tabs are. */
export const STEPS = [['inputs', 'Inputs'], ['harmonize', 'Harmonize'], ['graph', 'Graph & simulator'], ['install', 'Install']] as const;
/** The four views of step 2. */
export const VIEWS = ['records', 'choices', 'history', 'prompts'] as const;
const KEY = 'muro.project';

/** What the Projects page holds while nothing was read: no list, nothing open. */
export const blankProjects = (): ProjectsState => ({ list: null, loading: false, error: null, info: null, infoId: null, infoLoading: false, infoError: null, noPicker: false, noFolder: false });
/** A project opened for the first time: its first step, its first view, no filter, no simulation. */
export const fresh = (id: string): ProjectView => ({ id, step: 'inputs', view: 'records', dsrc: '', dform: 'all', sim: newSim() });

// The open project survives a reload of the page, as the first run does (pages/setup.ts): in the session, never in a file.
const store = (): Storage | null => { try { return globalThis.sessionStorage ?? null; } catch { return null; } };
/** The record of the open project, or null when there is none or it is not one this page wrote. */
export function recall(): ProjectView | null {
  try {
    const raw = JSON.parse(store()?.getItem(KEY) ?? 'null');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (typeof raw.id !== 'string' || !STEPS.some(([id]) => id === raw.step) || !VIEWS.includes(raw.view) || typeof raw.dsrc !== 'string' || typeof raw.dform !== 'string') return null;
    return { id: raw.id, step: raw.step, view: raw.view, dsrc: raw.dsrc, dform: raw.dform, sim: restoreSim(raw.sim) };
  } catch { return null; }
}
/** Keeps the open project (null forgets it). Called at every render, so whoever changes `state.project` need not. */
export function remember(project: ProjectView | null): void {
  try {
    if (project) store()?.setItem(KEY, JSON.stringify(project));
    else store()?.removeItem(KEY);
  } catch { /* a session that keeps nothing: the page works until it is reloaded */ }
}
