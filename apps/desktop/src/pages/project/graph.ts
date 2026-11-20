import type { ViewState, ProjectInfo } from '../../types.ts';
import type { Actions } from '../../context.ts';
import { empty } from '../../ui.ts';

/** Step 3, the decision graph and the simulator. A placeholder: the module that replaces it (plan 2, Task 8) keeps these exports.
 *
 * Contract with pages/projects.ts (which owns the page, the tabs and the state `state.project`):
 * - `view(state, info)`: the step's HTML for the tab panel; `state.project.sim` is this step's state.
 * - `actions`: the step's actions. Every name starts with `graph-`, except `open-capability` (`data-id` is a capability id): it opens the
 *   capability sheet from any step, and the Harmonize step's links to capabilities use it.
 * - `SimState`, `newSim()`, `restoreSim(raw)`: the simulation the page keeps in `state.project.sim` and in the session. `restoreSim` takes what
 *   a reload brings back (anything) and returns a valid state, never one that is running.
 * - optional `input(app, el)`, `change(app, el)`, `keydown(app, e)`: return true when they handled the event; pages/projects.ts forwards them.
 * Change `state.project`, then `app.render()`: every render is stored in the session. */
export interface SimState { task: string }
export const newSim = (): SimState => ({ task: '' });
export const restoreSim = (raw: unknown): SimState => ({ ...newSim(), task: typeof (raw as SimState | null)?.task === 'string' ? (raw as SimState).task : '' });

export function view(_state: ViewState, _info: ProjectInfo): string {
  return empty('Graph & simulator', 'Coming in this version');
}
export const actions: Actions = {};
