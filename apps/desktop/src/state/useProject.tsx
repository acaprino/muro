import * as React from 'react';
import { fresh, recall, remember, sameSelected } from './project.ts';
import type { Panel, ProjectView, Selected, SimState } from './project.ts';
import type { ProjectInfo, ProjectSummary } from '../types.ts';
import { useRegistry } from './registry.tsx';

/** The dialogs of a project: the ones its actions open, and the ones its header and its panel open. */
export type ProjectDialog = 'add' | 'harmonize' | 'pin' | 'instructions' | 'details' | 'release' | 'extract' | 'prompt';

/** The open project of the Projects tab, for the workspace and for the window's inspector.
 * The state is `state/project.ts`'s; this only holds it in React and writes it to the
 * session at every change, so a reload, or leaving the tab and coming back, finds the same project, panel, selection and request. A free-text request still waited
 * for when the project is closed, another one is opened or the tab is left is stopped (`cancel_simulation`): nobody would see its answer, and the AI would go on. */
/** What the service last said of the projects, kept while the tab is left, each with the `settled` count of `useJobs` it was read at: reading them again starts a Python process for every
 * project file, so a page shows what it holds while nothing that changes them (a run that ended, an edit, the registry's list) moved. */
export interface ProjectCache {
  list: { settled: number; ids: string; rows: ProjectSummary[] } | null;
  info: { id: string; settled: number; info: ProjectInfo & { file: string } } | null;
}

export interface ProjectApi {
  view: ProjectView | null;
  /** The last list and the last project read (mutable, the same object for the window's life). */
  cache: ProjectCache;
  /** What the service said of the open project, while its workspace is on screen. */
  info: (ProjectInfo & { file: string | null }) | null;
  setInfo(info: ProjectApi['info']): void;
  /** The dialog open over the workspace, if any: the window's actions open three of them. */
  dialog: ProjectDialog | null;
  setDialog(dialog: ProjectDialog | null): void;
  /** The latest state, for a caller that awaited something and must check it is still the one it started from (a simulation waited for). */
  current(): ProjectView | null;
  open(id: string): void;
  close(): void;
  /** The Projects tab was left: a request waited for is stopped, and the project is as the session keeps it. */
  leave(): void;
  setPanel(panel: Panel): void;
  /** A new selection, or a function of the one there is (to clear only what an inspector was showing). */
  select(next: Selected | ((now: Selected) => Selected)): void;
  /** A change of the simulation, or a function of it that returns the change, or null for none (an answer that is no longer the one waited for). */
  patchSim(patch: Partial<SimState> | ((sim: SimState) => Partial<SimState> | null)): void;
}

const ProjectContext = React.createContext<ProjectApi | null>(null);

export function ProjectProvider({ children }: { children?: React.ReactNode }) {
  const { request } = useRegistry();
  const send = React.useRef(request);
  send.current = request;
  const [view, setView] = React.useState<ProjectView | null>(() => recall());
  const [info, setInfo] = React.useState<ProjectApi['info']>(null);
  const [dialog, setDialog] = React.useState<ProjectDialog | null>(null);
  const latest = React.useRef(view);
  latest.current = view;
  const cache = React.useRef<ProjectCache>({ list: null, info: null }).current;
  React.useEffect(() => { remember(view); }, [view]);
  /** Stops the request the open project is waiting for, if any. A runtime that cannot say so is no error of the page, which stops waiting either way. */
  const stopRun = React.useCallback(() => {
    const run = latest.current?.sim.run ?? null;
    if (run !== null) send.current('cancel_simulation', { run }).catch(() => { /* nothing is waiting for it */ });
  }, []);
  React.useEffect(() => stopRun, [stopRun]);
  const api = React.useMemo<ProjectApi>(() => {
    const change = (next: (v: ProjectView) => ProjectView) => setView(v => {
      if (!v) return v;
      const made = next(v);
      latest.current = made;
      return made;
    });
    return {
      view,
      cache,
      info,
      setInfo,
      dialog,
      setDialog,
      current: () => latest.current,
      // A project opened from the list, or closed, is read again the next time: the file may have changed behind the window. Only leaving the tab keeps it.
      open: id => { stopRun(); setDialog(null); cache.info = null; setView(() => (latest.current = fresh(id))); },
      close: () => { stopRun(); cache.info = null; setView(() => (latest.current = null)); },
      leave: () => { stopRun(); setDialog(null); remember(latest.current); setView(() => (latest.current = recall())); },
      setPanel: panel => change(v => v.panel === panel ? v : { ...v, panel }),
      select: next => change(v => {
        const selected = typeof next === 'function' ? next(v.selected) : next;
        return sameSelected(selected, v.selected) ? v : { ...v, selected };
      }),
      patchSim: patch => change(v => {
        const made = typeof patch === 'function' ? patch(v.sim) : patch;
        return made ? { ...v, sim: { ...v.sim, ...made } } : v;
      }),
    };
  }, [view, info, dialog, stopRun, cache]);
  return <ProjectContext.Provider value={api}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectApi {
  const api = React.useContext(ProjectContext);
  if (!api) throw new Error('useProject is used outside a ProjectProvider');
  return api;
}
