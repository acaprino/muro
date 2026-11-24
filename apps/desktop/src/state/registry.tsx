// The registry as the window holds it: the last snapshot the service sent, and the one way to ask the service
// something. Every request goes through one queue (`serial` of queue.ts): the service takes its registry lock without
// waiting and refuses a second request that arrives meanwhile; the actions in `ALONE` take no lock and go at once.
//
// The background worker and the tray move the registry while the window is open or hidden, and tell the window
// nothing. So the window reads it again (the behaviour of the Imago window's `startMuro`, app.ts): when it is shown
// again (the shell's `muro-shown`, since WebView2 gives the page no focus event then), when it gets the focus, and
// every REFRESH_MS while it has it, and only while nothing the person asked for is under way. Such a refresh asks
// for no plan, shows no error (the next one tries again) and changes nothing when the registry did not move.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Snapshot, Transport } from '../types.ts';
import { serial, ALONE } from '../queue.ts';

/** How often the open window reads the registry again while it has the focus. */
export const REFRESH_MS = 30_000;

export interface RegistryState {
  /** The last snapshot, or null until the first one arrives. */
  snapshot: Snapshot | null;
  /** Asks the service: in the window's one queue, and counted as the person's own (a refresh waits for it). */
  request: Transport;
  /** Reads the registry again; a failure is `error`. */
  reload(): Promise<void>;
  /** Takes a snapshot an action returned (a save, a removal): it keeps the jobs and the data folder already held. */
  adopt(snapshot: Snapshot): void;
  /** Why the last reading failed, or null. */
  error: string | null;
}

const RegistryContext = createContext<RegistryState | null>(null);

/** The registry of the window. */
export function useRegistry(): RegistryState {
  const registry = useContext(RegistryContext);
  if (!registry) throw new Error('useRegistry needs a RegistryProvider above it');
  return registry;
}

const message = (error: unknown): string => String(error instanceof Error ? error.message : error);
/** The shell sends the jobs and the data folder only with `snapshot`: a snapshot an action returns keeps the ones already held. */
const merged = (next: Snapshot, before: Snapshot | null): Snapshot => ({ ...next, jobs: next.jobs ?? before?.jobs, data_dir: next.data_dir ?? before?.data_dir });

export interface RegistryProviderProps {
  /** How the service is reached: the shell's `request` (api.ts), or the fake of the tests. */
  transport: Transport;
  /** The host's way to say the window was shown again; it returns how to stop listening (api.ts `onShown`). */
  shown?: ((wake: () => void) => () => void) | undefined;
  children?: ReactNode;
}

export function RegistryProvider({ transport, shown, children }: RegistryProviderProps) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  // What the refresh compares with and merges into, without waiting for a render.
  const held = useRef<Snapshot | null>(null);
  // The requests of the person under way: while there is one, the window does not read the registry by itself. An action
  // of `ALONE` (a search for harnesses, a simulation that lasts as long as the AI takes) holds no lock and does not count,
  // as it held no refresh back in the Imago window: the window keeps following the registry meanwhile.
  const pending = useRef(0);
  const queue = useMemo(() => serial(transport, ALONE), [transport]);
  const request = useMemo<Transport>(() => <T,>(action: string, payload?: Record<string, unknown>): Promise<T> => {
    if (ALONE.includes(action)) return queue<T>(action, payload);
    pending.current++;
    return queue<T>(action, payload).finally(() => { pending.current--; });
  }, [queue]);

  const adopt = useCallback((next: Snapshot) => {
    held.current = merged(next, held.current);
    setSnapshot(held.current);
  }, []);

  const reload = useCallback(async () => {
    setError(null);
    try { adopt(await request<Snapshot>('snapshot')); } catch (e) { setError(message(e)); }
  }, [request, adopt]);

  const refreshing = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshing.current || pending.current > 0) return;
    refreshing.current = true;
    try {
      // The window's own request: not counted, so it holds nothing back.
      const next = await queue<Snapshot>('snapshot');
      setError(null);
      // A registry that did not move is not painted again: no needless churn every 30 s.
      if (JSON.stringify(merged(next, held.current)) !== JSON.stringify(held.current)) adopt(next);
    } catch { /* the next focus or tick tries again */ }
    finally { refreshing.current = false; }
  }, [queue, adopt]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const wake = () => { void refresh(); };
    // A hidden window has no focus: WebView2 keeps `visibilityState` "visible" for it, so that says nothing.
    const timer = setInterval(() => { if (document.hasFocus()) wake(); }, REFRESH_MS);
    window.addEventListener('focus', wake);
    const stopShown = shown?.(wake);
    return () => { clearInterval(timer); window.removeEventListener('focus', wake); stopShown?.(); };
  }, [refresh, shown]);

  const value = useMemo<RegistryState>(() => ({ snapshot, request, reload, adopt, error }), [snapshot, request, reload, adopt, error]);
  return <RegistryContext.Provider value={value}>{children}</RegistryContext.Provider>;
}
