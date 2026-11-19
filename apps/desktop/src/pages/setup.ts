import type { ViewState } from '../types.ts';
import type { Actions } from '../context.ts';

/** The first run (Task 8): when `needed` the frame shows `view` in place of the tabs and the page, with `state.setup`. Task 5 leaves it off. */
export const needed = (_state: ViewState) => false;
export const view = (_state: ViewState) => '';
export const actions: Actions = {};
