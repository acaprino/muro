import type { Transport, ViewState, Snapshot } from './types.ts';

/** What the app lends to a page module (pages/*.ts) and to a sheet: the state, the transport and the few operations
 * every page needs. The modules never reach into app.ts; app.ts merges their `actions` and routes the events. */
export interface App {
  state: ViewState;
  request: Transport;
  /** Paints the state again: focus, open details and scroll position survive. */
  render(): void;
  /** One request at a time: sets `state.busy` to `label`, runs `work`, hands its value to `after`, shows a failure in `state.error`. Does nothing while another run is busy. */
  run<T>(label: string, work: () => Promise<T>, after?: (value: T) => void | Promise<void>): Promise<void>;
  notify(text: string, tone?: 'good' | 'bad'): void;
  /** Reads the snapshot again. */
  reload(): Promise<void>;
  /** Asks the service for a full plan and keeps it as `state.plan`. Calls that arrive meanwhile share one more plan, never one each. */
  replan(): Promise<void>;
  /** Keeps a snapshot a request returned (it keeps the jobs and the data folder only `snapshot` carries). When the registry revision moved and the held plan is of another revision it replans once by itself, so no module calls `replan` after a registry mutation; it does after a change the revision does not show (a scan, an apply). `{ replan: false }` keeps the snapshot and asks for no plan: for a save that does not change what a sync would do (a setting). */
  adopt(snapshot: Snapshot, options?: { replan?: boolean }): void;
  /** Looks for the harnesses installed on this computer: `state.discovered`. */
  discover(): Promise<void>;
  /** Opens `html` in the one dialog (a centred dialog or a sheet on the right); open already, it replaces the content and keeps the focus. The first heading becomes its name. Returns the element: wire a form's `onsubmit` on it. */
  openDialog(html: string, kind?: 'dialog' | 'sheet'): HTMLDialogElement;
  closeDialog(): void;
  confirm(title: string, text: string, ok: string, then: () => void, danger?: boolean): void;
}
/** An action is named by a control's `data-action`; its `data-*` and the element come with it. A name has one owner: two modules declaring it make `mountApp` throw. */
export type Actions = Record<string, (app: App, data: DOMStringMap, el: HTMLElement) => void | Promise<void>>;
export interface PageModule {
  /** The page, as HTML for the `main` element. */
  view(state: ViewState): string;
  actions: Actions;
  /** A text box of the page or of a dialog was typed in (the `input` event); true when handled. Never re-render here for a box that holds the caret. */
  input?(app: App, el: HTMLInputElement | HTMLSelectElement): boolean;
  /** A control of the page or of a dialog changed (the `change` event); true when handled. */
  change?(app: App, el: HTMLInputElement | HTMLSelectElement): boolean;
  /** A key was pressed in the page or in a dialog; true when handled (the module then calls `preventDefault` itself). */
  keydown?(app: App, e: KeyboardEvent): boolean;
  /** The page was opened (a tab, the first paint). */
  opened?(app: App): void | Promise<void>;
}
