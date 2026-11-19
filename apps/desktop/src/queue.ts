import type { Transport } from './types.ts';

/** The page's requests wait for each other, in the order they were made. The service takes its registry lock without waiting
 * and refuses a second request that arrives meanwhile ("Registry is busy"), and the page sends such a pair by itself: `adopt`
 * plans in the background after a save while the step that saved goes on with its next request. An action in `alone` does not
 * take that lock (`discover` runs Mukade and can last a minute): it is sent at once, waits for nobody and holds nobody back.
 * A request that fails reaches its own caller only; the ones behind it still go. */
export function serial(send: Transport, alone: readonly string[] = []): Transport {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(action: string, payload?: Record<string, unknown>): Promise<T> => {
    if (alone.includes(action)) return send<T>(action, payload);
    const sent = tail.then(() => send<T>(action, payload));
    tail = sent.catch(() => undefined);
    return sent;
  };
}
