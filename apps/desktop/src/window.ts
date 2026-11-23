// The desktop window around the page. Sigrid draws the title bar and its three buttons and knows no window API (a shell
// drives it from outside); the glue stays Imago's (plan R0, decision of the controller): `@acaprino/imago/shell` with
// its Tauri adapter on this side, the imago-shell crate on the Rust side. Nothing here runs without Tauri: the browser
// tests and the screenshots draw the buttons, which then do nothing.
//
// What the crate needs from the page, read in Imago v0.4.1 (ts/shell/window-controls.ts, ts/tauri.ts):
// - the buttons marked `data-im-window="minimize" | "maximize" | "close"` in the title bar. Sigrid's `WindowControls`
//   marks them `data-window-control` and passes no attribute on, so the marks are put on its buttons once they are
//   drawn. `mountWindowControls` then clicks for them (Sigrid's own handlers do nothing: one owner per click) and
//   reports the rectangle of the maximize button to `window_caption_maximize`, so Windows 11 opens its Snap Layouts
//   over it; the mouse then reaches the crate's overlay and not the page, whose hover comes back through `onOsHover`
//   and is drawn by Sigrid (`maximizeState`);
// - `data-tauri-drag-region` on the parts of the bar that move the window: Sigrid's `TitleBar dragProps` (App.tsx);
// - the zoom keys (`mountZoom`, kept per machine as `muro.zoom`) and, in a release build, the browser's own keys and
//   menu taken away (`guardDesktop`);
// - the theme of the window (`set_window_theme`), which the crate saves and shows before the first frame.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useWords } from '@acaprino/sigrid';
import { guardDesktop, mountWindowControls, mountZoom, type WindowApi } from '@acaprino/imago/shell';
import { windowTheme, type Scheme, type ThemeChoice } from './theme.ts';

/** Whether the page runs in Muro's Tauri window, and not in a browser as the tests run it. */
export const isNative = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const message = (error: unknown): string => String(error instanceof Error ? error.message : error);

/** Imago's name for each of Sigrid's buttons: `restore` is the maximize button of a maximized window. */
const IMAGO_NAMES: Readonly<Record<string, 'minimize' | 'maximize' | 'close'>> = { minimize: 'minimize', maximize: 'maximize', restore: 'maximize', close: 'close' };

export interface WindowFrame {
  /** The window fills the screen: Sigrid's middle button restores it. */
  maximized: boolean;
  /** The pointer over the maximize button as Windows reports it, when the crate's overlay and not the page receives it. */
  maximizeState: 'hover' | 'pressed' | undefined;
}

/**
 * Wires the title bar (`titleBar`, the `<header>` of Sigrid's `TitleBar`, with its `WindowControls` drawn) to the
 * window, with the zoom and the guard. A window action that fails goes to `fail`, in words. Returns what the buttons
 * show of the window.
 */
export function useWindowFrame(titleBar: RefObject<HTMLElement | null>, fail: (text: string) => void): WindowFrame {
  const words = useWords().window;
  const [maximized, setMaximized] = useState(false);
  const [maximizeState, setMaximizeState] = useState<'hover' | 'pressed' | undefined>(undefined);
  const latest = useRef(fail);
  useEffect(() => { latest.current = fail; });
  useEffect(() => {
    if (!isNative()) return;
    let live = true;
    const stops: (() => void)[] = [];
    const failed = (what: string, error: unknown): void => { if (live) latest.current(`${what}: ${message(error)}`); };
    if (!import.meta.env.DEV) stops.push(guardDesktop(document));
    void Promise.all([import('@acaprino/imago/tauri'), import('@tauri-apps/api/webview')]).then(([adapter, webview]) => {
      if (!live) return;
      const native = adapter.tauriWindowApi((what, error) => failed(`Could not ${what}`, error));
      const bar = titleBar.current;
      if (bar) {
        for (const button of bar.querySelectorAll<HTMLElement>('[data-window-control]')) {
          const name = IMAGO_NAMES[button.dataset.windowControl ?? ''];
          if (name) { button.dataset.imWindow = name; button.title = button.getAttribute('aria-label') ?? ''; }
        }
        // `onMaximized` is left out of what Imago gets: it would write the button's name and tooltip itself, which are
        // Sigrid's here. The page follows it on its own, and Sigrid draws the button for the state.
        const api: WindowApi = {
          minimize: native.minimize,
          toggleMaximize: native.toggleMaximize,
          close: native.close,
          reportMaximizeRect: native.reportMaximizeRect,
          onOsHover: callback => native.onOsHover(state => { callback(state); setMaximizeState(state === 'none' ? undefined : state); }),
        };
        stops.push(mountWindowControls(bar, api, { onError: (what, error) => failed(`Could not ${what} the window`, error) }));
        if (native.onMaximized) stops.push(native.onMaximized(setMaximized));
      }
      let storage: Storage | undefined;
      try { storage = localStorage; } catch { /* the zoom is not kept */ }
      stops.push(mountZoom(document, { apply: level => webview.getCurrentWebview().setZoom(level), storage, storageKey: 'muro.zoom' }));
    }).catch(error => failed('The window controls did not load', error));
    return () => { live = false; for (const stop of stops) stop(); };
  }, [titleBar]);
  // The tooltip of the middle button follows its name, as the name follows the window.
  useEffect(() => {
    const button = titleBar.current?.querySelector<HTMLElement>('[data-im-window="maximize"]');
    if (button) button.title = maximized ? words.restore : words.maximize;
  }, [titleBar, maximized, words]);
  return { maximized, maximizeState };
}

/** Tells the native window the theme chosen and the scheme drawn, at each change (the crate saves it for the next start). */
export function useWindowTheme(theme: ThemeChoice, resolved: Scheme): void {
  useEffect(() => {
    if (!isNative()) return;
    void import('@tauri-apps/api/core')
      .then(core => core.invoke('set_window_theme', windowTheme(theme, resolved)))
      .catch(() => { /* the window keeps the theme it has; the next change asks again */ });
  }, [theme, resolved]);
}
