import type { CheckProgress, Transport } from './types.ts';

/** What the page sends beside the queue (see `serial`): the one list `mountApp` uses. `discover` runs Mukade; `simulate` lasts as long as the AI takes and holds no registry lock,
 * and `cancel_simulation` must reach the service while it runs: behind the queue, a simulation would freeze every other action of the window and Cancel would wait for the run it stops.
 * The same holds for the AI jobs of the project write side: `jobs` (the poll that follows a run) and `cancel_job` must not wait behind a long `project_updates` or `edit_project`.
 * `projects` and `project` read the registry without its lock and then wait for a Python process each: behind the queue, opening Projects would wait for a whole check. */
export const ALONE: readonly string[] = ['discover', 'simulate', 'cancel_simulation', 'jobs', 'cancel_job', 'env_present', 'pick_file', 'pick_folder', 'projects', 'project'];

/** The page's requests wait for each other, in the order they were made. The service takes its registry lock without waiting
 * and refuses a second request that arrives meanwhile ("Registry is busy"), and the page sends such a pair by itself: `adopt`
 * plans in the background after a save while the step that saved goes on with its next request. An action in `alone` does not
 * take that lock (`discover` runs Mukade and can last a minute): it is sent at once, waits for nobody and holds nobody back.
 * A request that fails reaches its own caller only; the ones behind it still go. */
export function serial(send: Transport, alone: readonly string[] = []): Transport {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(action: string, payload?: Record<string, unknown>, onProgress?: (event: CheckProgress) => void): Promise<T> => {
    if (alone.includes(action)) return send<T>(action, payload, onProgress);
    const sent = tail.then(() => send<T>(action, payload, onProgress));
    tail = sent.catch(() => undefined);
    return sent;
  };
}
