import type { ViewState } from '../types.ts';
import type { Actions } from '../context.ts';
import { head, empty } from '../ui.ts';

/** Task 5 leaves the page as a title and an empty state; Task 7 builds it: running adaptations first, then the events, with the filter `state.afilter`. */
export const view = (_state: ViewState) => head('Activity', 'What Muro did, and why.') + empty('Nothing here yet', 'Sync runs and AI adaptations show up here.');
export const actions: Actions = {};
