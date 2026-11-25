// The window's one entry, for the program (main.tsx) and the tests (tests/harness.html) alike: Muro in Imago's shell, on a transport.
// The shell has no StrictMode, which would run the mount effects twice under the dev server: the browser tests count the requests the page makes.
import { defineApp, startApp } from '@acaprino/imago';
import '@acaprino/sigrid/styles.css';
import '@acaprino/sigrid/graph.css';
import type { Transport } from './types.ts';
import { RegistryProvider } from './state/registry.tsx';
import { App } from './App.tsx';

/** Muro for the shell: its one colour, and the keys its choices are kept under (`muro.theme` and `muro.zoom` are the earlier window's). */
const MURO = defineApp({
  id: 'muro', name: 'Muro', lang: 'en',
  // design-check-ignore-next-line color-value: Muro's accent, the one colour the theme is computed from
  accent: '#00714f',
  storage: { scheme: 'muro.theme', zoom: 'muro.zoom', sidebar: 'muro.sidebar' },
});

/** Draws Muro in `root`, reaching the service through `transport`. Returns how to take it away. */
export const start = (root: HTMLElement, transport: Transport): (() => void) =>
  startApp(MURO, root, <RegistryProvider transport={transport}><App /></RegistryProvider>);
