import type { ViewState } from '../types.ts';
import type { Actions } from '../context.ts';
import { head, empty } from '../ui.ts';

/** Task 5 leaves the page as a title and an empty state; Task 7 builds it: settings saved on change, read `autostart` when the page opens. */
export const view = (_state: ViewState) => head('Settings', 'Sync, background, appearance, adaptation and maintenance.') + empty('Nothing here yet', 'The settings of Muro appear here.');
export const actions: Actions = {};
