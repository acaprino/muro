// The sync state of the window: the plan the note and the table read, the review sheet that is open, a check or an apply under way, and what asks the service for a plan.
// A port of the Imago window's check, plan, apply, adopt and replan (app.ts, pages/sync.ts of commit 5e33a82), with their guards:
//  - one request of the person's at a time (`attempt`): a second click while a check, a plan for the sheet or an apply runs does nothing, and a service that refuses a second request
//    never sees one (the window's queue, state/registry.tsx, orders the rest);
//  - the plans the window makes for its own sake (after a mutation, after an apply, after a failure) go through `make`: a plan already being made makes one more after it, never two at once;
//    the plans the person asks for (Review, Apply all, one harness's own) are requests of the person's, counted by `attempt`;
//  - a snapshot a mutation returns plans again only when the registry revision moved and the plan held is not for it (`adopt`);
//  - the 30 s refresh and the shell's `onShown` (state/registry.tsx) take no plan: the recorded check says what changed (the note reads it, model.ts `syncHeadline`);
//  - a plan counts only for the revision it was made for (model.ts `currentPlan`): `plan` is held as it came, and every reader asks `currentPlan` or a function that does;
//  - an apply sends the plan's id, `allow_blocked` with blockers, and `confirm_removals` equal to the removals the sheet named or `skip_removals`: a plan that would run nothing is not sent
//    (words.ts `applyRequest`). One the service refuses (the registry moved, a harness refused a change) leaves the sheet open with the service's words, the registry and the plan are read
//    again, and a sheet that showed the whole plan shows the new one, so the next Apply never sends a plan that was refused and the table says what is installed.
// The pages ask for what they need here and send nothing about a plan themselves.
import * as React from 'react';
import type { ApplyProgress, CheckError, CheckProgress, CheckResult, Plan, Review, Snapshot } from '../../types.ts';
import { currentPlan, mustReview, type CellStatus } from '../../model.ts';
import { message } from '../../words.ts';
import { useNotify } from '@acaprino/imago';
import { useRegistry } from '../../state/registry.tsx';
import { registryWrite, resolvePlugin } from './registryWrite.ts';
import { applyRequest, appliedMessage, type Choice } from './words.ts';

export interface ApplyOptions {
  /** `confirm` (the default) runs the removals of the plan, `skip` leaves them out and runs the rest. Only a plan with removals has a difference. */
  choice?: Choice;
}
interface PluginTarget { plugin_id: string; target_id: string }
export interface ReviewOptions {
  /** Plan for this harness alone: the sheet shows only its changes, and the plan is not the one the note and the table read. */
  targetId?: string;
  /** A plan someone else made (a reinstall): shown as it is, with no request, and not the one the note and the table read. */
  plan?: Plan;
}

export interface SyncApi {
  /** The last whole plan this window made, for whatever revision it was made: readers pass it with the snapshot to `currentPlan`, `cellState`, `syncHeadline`, `noteOf`. Null before any. */
  plan: Plan | null;
  /** The registry revision `plan` was made for, or null with no plan. A plan counts only while the snapshot is at this revision. */
  planFor: number | null;
  /** The review sheet that is open, or null. A sheet is open exactly while this is not null. */
  review: Review | null;
  /** A check is running (resolving every source, then planning). */
  checking: boolean;
  /** Any request of the person's about the sync is running (a check, a plan for the sheet or for Apply all, an apply): while it is, another one does nothing. */
  busy: boolean;
  /** The id of the plan being applied, or null. The sheet of that plan is locked meanwhile (`closeReview` does nothing). */
  applying: string | null;
  /** What the apply under way runs: how many operations and the names of their plugins, for the note ("Applying 3 changes…"). */
  progress: ApplyProgress | null;
  /** The sources the last check could not resolve, with the service's words. Kept until the next check. */
  errors: CheckError[];
  /** Why the last request of the person's failed, or null: the sheet shows it in its own line. With no sheet open it is also a notice. Cleared by the next request. */
  error: string | null;
  /** Check now: resolves every source, then plans. The sources that failed are `errors`; the plan stays. Never rejects. */
  check(): Promise<void>;
  /** Asks for a whole plan; one already being made makes one more after it. Never rejects: a failure is `error` and a notice. */
  replan(): Promise<void>;
  /** Opens the review sheet on a fresh plan (the whole one, `targetId`'s alone) or on `plan` as it is. Review and "Sync N changes" ask for a fresh plan first: the sheet never shows an old one. */
  openReview(options?: ReviewOptions): Promise<void>;
  selectTarget(pluginId: string, targetId: string): Promise<void>;
  syncPlugin(pluginId: string, targetId: string, shown: CellStatus): Promise<void>;
  resolvingSources: readonly string[];
  resolveAdded(saved: Snapshot, pluginId: string): Promise<Snapshot>;
  /** Closes the sheet. Does nothing while it applies: an apply is not left half-way. */
  closeReview(): void;
  /** Applies the plan of the open sheet (`review`). On success the sheet closes, the plan is made again and a notice says what was applied and what was left out. On a failure the sheet stays, with `error`. Never rejects. */
  apply(options?: ApplyOptions): Promise<void>;
  /** Apply all: a fresh plan, applied at once only when it is the plan the note showed and holds no blocker and no removal; otherwise the sheet opens, so nothing the person has not seen is applied. */
  applyAll(): Promise<void>;
  /** Takes a snapshot an action returned (a save, a removal): the registry's `adopt`, and a new plan when the revision moved and the plan held is not for it. `replan: false` takes it and plans nothing. */
  adopt(snapshot: Snapshot, options?: { replan?: boolean }): void;
}

const SyncContext = React.createContext<SyncApi | null>(null);
const CheckProgressContext = React.createContext<CheckProgress | null>(null);

export const useCheckProgress = () => React.useContext(CheckProgressContext);

export function SyncProvider({ children }: { children?: React.ReactNode }) {
  const registry = useRegistry();
  const { snapshot } = registry;
  const notify = useNotify();
  // What the callbacks read, so they stay the same from one render to the next.
  const send = React.useRef(registry.request);
  send.current = registry.request;
  const take = React.useRef(registry.adopt);
  take.current = registry.adopt;
  const say = React.useRef(notify);
  say.current = notify;
  const snapshotRef = React.useRef<Snapshot | null>(snapshot);
  snapshotRef.current = snapshot;

  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [review, setReview] = React.useState<Review | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [resolvingSources, setResolvingSources] = React.useState<string[]>([]);
  const [checkProgress, setCheckProgress] = React.useState<CheckProgress | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<ApplyProgress | null>(null);
  const [errors, setErrors] = React.useState<CheckError[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  // The same state as the guards read it, without waiting for a render.
  const planRef = React.useRef<Plan | null>(null);
  const reviewRef = React.useRef<Review | null>(null);
  const progressRef = React.useRef<ApplyProgress | null>(null);
  const working = React.useRef(false);
  // The revision the window last knew, whoever brought it: a mutation's snapshot here, the refresh's through the registry (the effect below).
  const seen = React.useRef<number | null>(null);
  // The plan being made: one at a time. `again`: asked for while it ran, so one more follows. `loud`: somebody who wants to hear of a failure asked.
  const planning = React.useRef<Promise<void> | null>(null);
  const again = React.useRef(false);
  const loud = React.useRef(false);

  React.useEffect(() => { if (snapshot) seen.current = snapshot.registry.revision; }, [snapshot]);

  const hold = React.useCallback((next: Plan | null) => { planRef.current = next; setPlan(next); }, []);
  const show = React.useCallback((next: Review | null) => { reviewRef.current = next; setReview(next); }, []);
  const running = React.useCallback((next: ApplyProgress | null) => { progressRef.current = next; setProgress(next); }, []);

  // A failure: the sheet says it in its own line while it is open (the page behind a dialog cannot be seen), otherwise it is a notice.
  const report = React.useCallback((e: unknown) => {
    const text = message(e);
    setError(text);
    if (!reviewRef.current) say.current(`That did not complete: ${text}`, { kind: 'error' });
  }, []);

  /** One request of the person's at a time. Resolves with what `flow` returned, or undefined when another request was running or `flow` failed (and was reported). */
  const attempt = React.useCallback(async <T,>(flow: () => Promise<T>): Promise<T | undefined> => {
    if (working.current) return undefined;
    working.current = true;
    setBusy(true);
    setError(null);
    try { return await flow(); }
    catch (e) { report(e); return undefined; }
    finally { working.current = false; setBusy(false); }
  }, [report]);

  /** Where the window asks for a whole plan for its own sake (after a mutation, an apply or a failure; `replan`). A plan already being made makes one more after it, never two at once, and every asker
   * waits for the last. `quiet` asks for no word on a failure. */
  const make = React.useCallback((quiet: boolean): Promise<void> => {
    if (planning.current) {
      again.current = true;
      if (!quiet) loud.current = true;
      return planning.current;
    }
    loud.current = !quiet;
    // The guard is in place before anything runs, so even a request that fails at once finds it set and clears it.
    let release!: () => void;
    const guard = new Promise<void>(done => { release = done; });
    planning.current = guard;
    void (async () => {
      try {
        do {
          again.current = false;
          hold(await send.current<Plan>('plan'));
        } while (again.current);
      } catch (e) { if (loud.current) report(e); }
      finally { planning.current = null; release(); }
    })();
    return guard;
  }, [hold, report]);

  const replan = React.useCallback((): Promise<void> => make(false), [make]);

  const adopt = React.useCallback((next: Snapshot, options?: { replan?: boolean }): void => {
    const before = seen.current;
    seen.current = next.registry.revision;
    take.current(next);
    if (options?.replan === false || before === null || before === next.registry.revision || planRef.current?.revision === next.registry.revision) return;
    void make(false);
  }, [make]);

  const resolveAdded = React.useCallback(async (saved: Snapshot, pluginId: string): Promise<Snapshot> => {
    const showSnapshot = (snapshot: Snapshot) => adopt(snapshot, { replan: false });
    setResolvingSources(ids => [...ids, pluginId]);
    showSnapshot(saved);
    try {
      const resolved = await resolvePlugin(send.current, pluginId, showSnapshot);
      showSnapshot(resolved);
      // A verified archive lists its native builds. Its cell can plan just the chosen installation.
      if (!resolved.registry.plugins.find(plugin => plugin.id === pluginId)?.resolved_project) void make(false);
      return resolved;
    } finally {
      setResolvingSources(ids => ids.filter(id => id !== pluginId));
    }
  }, [adopt, make]);

  const check = React.useCallback(async (): Promise<void> => {
    await attempt(async () => {
      setChecking(true);
      setErrors([]);
      let active = true;
      try {
        const result = await send.current<CheckResult>('check', {}, event => {
          if (active) setCheckProgress(event);
        });
        // The plan first: the snapshot is then of the revision the plan is for, and `adopt` plans nothing more.
        hold(result.plan);
        setErrors(result.errors ?? []);
        adopt(result.snapshot);
      } finally {
        active = false;
        setCheckProgress(null);
        setChecking(false);
      }
    });
  }, [attempt, hold, adopt]);

  const openReview = React.useCallback(async (options: ReviewOptions = {}): Promise<void> => {
    if (progressRef.current) return;
    if (options.plan) {
      setError(null);
      show({ plan: options.plan, target_id: null });
      return;
    }
    const target = options.targetId ? snapshotRef.current?.registry.targets.find(t => t.id === options.targetId) : undefined;
    if (options.targetId && !target) return;
    const fresh = await attempt(() => send.current<Plan>('plan', target ? { target_id: target.id } : {}));
    if (!fresh) return;
    // Only a whole plan is the plan of the note and the table; the plan of one harness is for its sheet alone.
    if (!target) hold(fresh);
    show({ plan: fresh, target_id: target?.id ?? null });
  }, [attempt, hold, show]);

  const selectTarget = React.useCallback(async (pluginId: string, targetId: string): Promise<void> => {
    const snapshot = snapshotRef.current;
    if (!snapshot) return;
    await attempt(async () => {
      const next = await registryWrite(send.current, snapshot.registry.revision, 'select_plugin_target', { id: pluginId, target_id: targetId });
      adopt(next, { replan: false });
    });
  }, [attempt, adopt]);

  const pluginPlan = React.useCallback(async (pluginId: string, targetId: string): Promise<Plan> => {
    const plan = await send.current<Plan>('plan', { plugin_id: pluginId, target_id: targetId });
    if (plan.operations.some(o => o.plugin_id !== pluginId || o.target_id !== targetId || !['install', 'activate', 'update', 'reinstall'].includes(o.kind))) {
      throw new Error('This plan includes other changes. Open Review to see the full plan.');
    }
    return plan;
  }, []);

  const closeReview = React.useCallback((): void => {
    if (progressRef.current) return;
    show(null);
    setError(null);
  }, [show]);

  /** After an apply that failed: the registry and the plan are read again, quietly (the failure stays what the sheet says). Part of the plan may have been applied before the harness refused,
   * and a plan refused because the registry moved is no longer the plan: either way the table must say what is installed. A sheet that showed the whole plan held (`replaced`: its id) shows
   * the new one, so the next Apply sends a plan the service can take; the sheet of one harness or of a reinstall cannot be made again from what the window holds, and stays as it was. */
  const settle = React.useCallback(async (replaced: string | null, scope?: PluginTarget): Promise<void> => {
    const open = reviewRef.current;
    if (scope) {
      hold(null);
      // A native apply can fail after changing files. Refresh this target's inventory before adopting the snapshot.
      try {
        const plan = await pluginPlan(scope.plugin_id, scope.target_id);
        if (open) show({ ...scope, plan });
      } catch {
        if (open) show(null);
      }
    }
    try { adopt(await send.current<Snapshot>('snapshot'), { replan: false }); }
    catch { /* the next focus or tick of the window reads it again */ }
    if (scope) return;
    await make(true);
    const fresh = planRef.current;
    if (replaced && fresh && fresh.id !== replaced && open && open.target_id === null && open.plan.id === replaced) show({ plan: fresh, target_id: null });
  }, [adopt, hold, make, show, pluginPlan]);

  const applyPlan = React.useCallback(async (planned: Plan, choice: Choice, scope?: PluginTarget): Promise<void> => {
    const sent = applyRequest(planned, choice);
    if (!sent) return;
    // Whether the sheet shows the plan the window holds: only then can it be replaced by the new one after a refusal.
    const whole = planRef.current?.id === planned.id ? planned.id : null;
    await attempt(async () => {
      running(sent.progress);
      try {
        let answer: Snapshot;
        // The request that failed is reported by `attempt` once the window has read the registry again; nothing is applied from the sheet before that.
        try { answer = await send.current<Snapshot>('apply', sent.payload); }
        catch (e) { await settle(whole, scope); throw e; }
        // The plan is made again from what is installed now; the note says "Applying…" until it is.
        adopt(answer, { replan: false });
        hold(null);
        show(null);
        if (!scope) await make(false);
        say.current(appliedMessage(planned, answer));
      } finally { running(null); }
    });
  }, [attempt, running, settle, adopt, hold, show, make]);

  const apply = React.useCallback(async (options: ApplyOptions = {}): Promise<void> => {
    const open = reviewRef.current;
    if (!open) return;
    const scope = open.plugin_id && open.target_id ? { plugin_id: open.plugin_id, target_id: open.target_id } : undefined;
    await applyPlan(open.plan, options.choice ?? 'confirm', scope);
  }, [applyPlan]);

  const syncPlugin = React.useCallback(async (pluginId: string, targetId: string, shown: CellStatus): Promise<void> => {
    const fresh = await attempt(async () => {
      const plan = await pluginPlan(pluginId, targetId);
      if (shown.kind === 'unscanned') adopt(await send.current<Snapshot>('snapshot'), { replan: false });
      return plan;
    });
    if (!fresh) return;
    const [operation] = fresh.operations;
    if (!fresh.blockers.length && fresh.operations.length === 1 && operation?.kind === shown.kind
      && (operation.from_version || '') === (shown.from || '') && (operation.to_version || '') === (shown.to || '')) {
      await applyPlan(fresh, 'confirm', { plugin_id: pluginId, target_id: targetId });
    } else {
      show({ plan: fresh, target_id: targetId, plugin_id: pluginId });
    }
  }, [attempt, pluginPlan, adopt, applyPlan, show]);

  const applyAll = React.useCallback(async (): Promise<void> => {
    if (working.current) return;
    // What the note showed: the plan of the snapshot's revision, if any.
    const shown = snapshotRef.current ? currentPlan(snapshotRef.current, planRef.current) : null;
    const fresh = await attempt(async () => {
      const made = await send.current<Plan>('plan');
      hold(made);
      return made;
    });
    if (!fresh) return;
    if (mustReview(shown, fresh)) show({ plan: fresh, target_id: null });
    else await applyPlan(fresh, 'confirm');
  }, [attempt, hold, show, applyPlan]);

  const api = React.useMemo<SyncApi>(() => ({
    plan, planFor: plan?.revision ?? null, review, checking, busy, applying: progress?.plan_id ?? null, progress, errors, error,
    check, replan, openReview, selectTarget, syncPlugin, resolvingSources, resolveAdded, closeReview, apply, applyAll, adopt,
  }), [plan, review, checking, busy, progress, errors, error, check, replan, openReview, selectTarget, syncPlugin, resolvingSources, resolveAdded, closeReview, apply, applyAll, adopt]);
  return <SyncContext.Provider value={api}><CheckProgressContext.Provider value={checkProgress}>{children}</CheckProgressContext.Provider></SyncContext.Provider>;
}

/** The sync state of the window. The provider is mounted once, above every page (App.tsx). */
export function useSync(): SyncApi {
  const api = React.useContext(SyncContext);
  if (!api) throw new Error('useSync needs a SyncProvider above it');
  return api;
}
