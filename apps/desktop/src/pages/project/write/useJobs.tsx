import * as React from 'react';
import type { Job } from '../../../types.ts';
import { useNotify } from '@acaprino/imago';
import { useRegistry } from '../../../state/registry.tsx';
import { message } from '../../../words.ts';
import { endedBetween, isRunning, outcomeOf, runningJob, upsertJob } from './jobs.ts';

/** How often the runs are read while one is going: the runtime keeps them in files and sends no event. */
export const POLL_MS = 2000;
/** The two requests that start an AI run (`create_project`, `project_job`); an edit by hand and a deletion are not runs. */
export type WriteAction = 'create_project' | 'project_job';

/** The AI runs of the runtime, for every page of the window. The jobs are the runtime's: read on mount, after a start and a cancel, and every `POLL_MS` while one is running, so a reload of the
 * window, the tab and the project left and opened again all find a run going (ADR-0032 decision 7). A run that was seen running and is over says its outcome in the runtime's words, once. */
export interface JobsApi {
  /** What the runtime holds, newest first (project runs and adaptations): empty until the first reading. */
  jobs: Job[];
  /** The run in progress, whatever it is: one goes at a time, so while there is one no page offers another change. Null when none goes. */
  running: Job | null;
  /** Counts the project runs that ended while this window watched, and the times a page asked for the projects to be read again (`refresh`). A page that shows what a run or an edit writes (the list of
   * projects, the open project) reads it again when this changes. */
  settled: number;
  /** The ids of the runs asked to stop that are still going: the runtime ends them a moment later. */
  cancelling: readonly string[];
  /** Why the last reading of the jobs failed, or null: the next one tries again. */
  error: string | null;
  /** Sends `create_project` or `project_job` with the payload of `jobs.ts`. Resolves when the runtime started the run (the card shows at once); rejects with the runtime's own refusal, before any run was paid for. */
  start(action: WriteAction, payload: Record<string, unknown>): Promise<void>;
  /** Asks the runtime to stop a run. Rejects with the runtime's words. */
  cancel(id: string): Promise<void>;
  /** Asks for the list of projects and the open project to be read again: what a change by hand (an edit that is no AI run) wrote is not told by any run that ends. It moves `settled`. */
  refresh(): void;
}

const JobsContext = React.createContext<JobsApi | null>(null);

export function ProjectJobsProvider({ children }: { children?: React.ReactNode }) {
  const { request, snapshot } = useRegistry();
  const notify = useNotify();
  const send = React.useRef(request);
  send.current = request;
  const say = React.useRef(notify);
  say.current = notify;
  const [jobs, setJobs] = React.useState<Job[]>([]);
  const [settled, setSettled] = React.useState(0);
  const [asked, setAsked] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  /** The list the next reading is compared with, without waiting for a render. */
  const held = React.useRef<Job[]>([]);
  const live = React.useRef(true);
  const reading = React.useRef(false);

  /** A list of jobs the runtime sent: kept when it differs, and what ended since the last one is said. */
  const take = React.useCallback((next: Job[]) => {
    if (!live.current) return;
    const ended = endedBetween(held.current, next);
    if (JSON.stringify(next) !== JSON.stringify(held.current)) setJobs(next);
    held.current = next;
    setAsked(now => {
      const going = now.filter(id => next.some(job => job.id === id && isRunning(job)));
      return going.length === now.length ? now : going;
    });
    if (!ended.length) return;
    setSettled(n => n + 1);
    for (const job of ended) {
      const outcome = outcomeOf(job);
      if (outcome) say.current(outcome.text, outcome.error ? { kind: 'error' } : undefined);
    }
  }, []);

  const read = React.useCallback(async (): Promise<void> => {
    try {
      const next = await send.current<Job[]>('jobs');
      if (!live.current) return;
      setError(null);
      take(Array.isArray(next) ? next : []);
    } catch (e) { if (live.current) setError(message(e)); }
  }, [take]);

  // Once on mount: a run that is going when the window opens (or opens again) is found.
  React.useEffect(() => {
    live.current = true;
    void read();
    return () => { live.current = false; };
  }, [read]);

  // While a run goes, again every POLL_MS; a reading that is still waiting in the window's queue (a long request ahead of it) is not asked twice.
  const going = React.useMemo(() => jobs.some(isRunning), [jobs]);
  React.useEffect(() => {
    if (!going) return undefined;
    const timer = setInterval(() => {
      if (reading.current) return;
      reading.current = true;
      void read().finally(() => { reading.current = false; });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [going, read]);

  // A run another window or the tray started reaches this window with the registry it reads again: the runs are read at once, not at the next tick of a poll that is not going.
  const fromRegistry = snapshot?.jobs;
  React.useEffect(() => {
    if (fromRegistry?.some(isRunning) && !held.current.some(isRunning)) void read();
  }, [fromRegistry, read]);

  const start = React.useCallback(async (action: WriteAction, payload: Record<string, unknown>): Promise<void> => {
    let job: Job;
    try { job = await send.current<Job>(action, payload); }
    catch (e) {
      // A refusal may be that another run goes (one started by `muroctl` or by another client, which this window has not read yet): the runs are read again, so the card shows and the buttons say why.
      void read();
      throw e;
    }
    // The runtime answers with the run as it began: it is on the page now, and the poll follows it.
    if (live.current && job && typeof job.id === 'string') take(upsertJob(held.current, job));
  }, [take, read]);

  const cancel = React.useCallback(async (id: string): Promise<void> => {
    await send.current('cancel_job', { id });
    if (live.current) setAsked(now => (now.includes(id) ? now : [...now, id]));
    await read();
  }, [read]);

  const refresh = React.useCallback((): void => setSettled(n => n + 1), []);

  const running = React.useMemo(() => runningJob(jobs), [jobs]);
  const api = React.useMemo<JobsApi>(() => ({ jobs, running, settled, cancelling: asked, error, start, cancel, refresh }), [jobs, running, settled, asked, error, start, cancel, refresh]);
  return <JobsContext.Provider value={api}>{children}</JobsContext.Provider>;
}

/** The AI runs of the window. The provider is mounted once, above every page (App.tsx). */
export function useJobs(): JobsApi {
  const api = React.useContext(JobsContext);
  if (!api) throw new Error('useJobs needs a ProjectJobsProvider above it');
  return api;
}
