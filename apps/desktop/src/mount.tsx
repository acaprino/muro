// The window's one entry, for the shell (main.tsx) and the tests (tests/harness.html) alike: the page on a transport,
// as the Imago window's `startMuro` was. No StrictMode: it runs the mount effects twice under the dev server, and the
// browser tests count the requests the page makes.
import './styles.css';
import { createRoot } from 'react-dom/client';
import type { Transport } from './types.ts';
import { RegistryProvider } from './state/registry.tsx';
import { NoticesProvider } from './state/notices.tsx';
import { App } from './App.tsx';

/** Mounts the window in `root`, reaching the service through `transport`; `shown` is the host's word that the window was shown again. Returns how to take it away.
 * The notices of the whole window, the frame's errors and the pages' results alike, are one stack (`NoticesProvider`, which draws Sigrid's `Toasts` once). */
export function mount(root: HTMLElement, transport: Transport, shown?: (wake: () => void) => () => void): () => void {
  const app = createRoot(root);
  app.render(<RegistryProvider transport={transport} shown={shown}><NoticesProvider><App /></NoticesProvider></RegistryProvider>);
  return () => app.unmount();
}
