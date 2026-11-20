import type { ViewState, ProjectInfo } from '../../types.ts';
import type { Actions } from '../../context.ts';
import { empty } from '../../ui.ts';

/** Step 2, the decision records, the choices by part, the history and the prompts. A placeholder: the module that replaces it (plan 2, Task 7) keeps these exports.
 *
 * Contract with pages/projects.ts (which owns the page, the tabs and the state `state.project`):
 * - `view(state, info)`: the step's HTML for the tab panel. It reads `state.project.view` (`records`, `choices`, `history`, `prompts`),
 *   `state.project.dsrc` (an input id, or '' for all) and `state.project.dform` (a form, or 'all'); `info.inputs[].id` are the inputs.
 * - `actions`: the step's actions. Every name starts with `harmonize-`. A link to a capability uses the action `open-capability` (data-id =
 *   capability id), which pages/project/graph.ts owns; `decisions-of` (data-id = input id) is the Inputs step's and lands here, on `choices`.
 * - optional `input(app, el)`, `change(app, el)`, `keydown(app, e)`: return true when they handled the event; pages/projects.ts forwards them.
 *   The segmented choices are radios: `hview` (the view), `dform` (the form); the input filter is a select named `dsrc`.
 * Change `state.project`, then `app.render()`: every render is stored in the session. A `dsrc` that names no input of `info` means all. */
export function view(_state: ViewState, _info: ProjectInfo): string {
  return empty('Harmonize', 'Coming in this version');
}
export const actions: Actions = {};
