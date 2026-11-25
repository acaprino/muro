// Shared by every browser-*.mjs: one Vite dev server on MURO_UI_PORT (default 1422) and one headless Edge for the whole
// process, however many pages a file opens. open(scenario, options) returns {page, errors, calls, flags, close};
// close() ends the page and the last close ends the browser and the server, and it fails the run when the page raised an error.
// options.clock installs Playwright's clock before the page loads: page.clock.fastForward(ms) then runs its timers (the 30 s refresh).
// The page runs in a window that only pretends to be Tauri's (`fakeWindow`), as the program is: it has the three buttons and its foot at every width.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const port = process.env.MURO_UI_PORT || '1422', base = `http://127.0.0.1:${port}`;
const root = fileURLToPath(new URL('../../..', import.meta.url));
let server, browser, starting, refs = 0, output = '';

async function start() {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'apps/desktop/vite.config.ts', '--port', port], { cwd: root, stdio: 'pipe', windowsHide: true });
  server.stdout.on('data', b => output += b); server.stderr.on('data', b => output += b);
  for (let i = 0; ; i++) {
    try { if ((await fetch(base + '/tests/harness.html')).ok) break; } catch { /* the server is still starting */ }
    if (i === 100) throw Error('The dev server did not start: ' + output);
    await delay(200);
  }
  browser = await chromium.launch({ channel: 'msedge', headless: true });
}
const stop = async () => { await browser?.close(); server?.kill(); browser = server = starting = undefined; };
process.on('exit', () => server?.kill());

/** Tauri's window as the page finds it: it answers every call and writes it down in `window.native`. `window.shown()` is the crate's word that the window was shown again (`window-shown`). */
function fakeWindow() {
  const handlers = [], listeners = {};
  window.native = [];
  window.shown = () => { for (const handler of listeners['window-shown'] ?? []) handlers[handler]({ event: 'window-shown', id: 1, payload: null }); };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main', windowLabel: 'main' } },
    transformCallback: callback => handlers.push(callback) - 1,
    unregisterCallback: () => {},
    invoke: async (command, args) => {
      window.native.push([command, args]);
      if (command === 'plugin:event|listen') (listeners[args.event] ??= []).push(args.handler);
      return command === 'plugin:window|is_maximized' ? false : command === 'plugin:event|listen' ? 1 : null;
    },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
}

/** options: viewport, colorScheme (Windows' own), theme (the choice kept; the window is dark without one), reducedMotion (reduce: a drawer that still slides in is not where it will be), query (appended to the harness URL after ?scenario=). */
export async function open(scenario = 'default', options = {}) {
  refs++;
  try { await (starting ||= start()); } catch (e) { refs--; await stop(); throw e; }
  const page = await browser.newPage({ viewport: options.viewport || { width: 1512, height: 982 }, colorScheme: options.colorScheme || 'dark', reducedMotion: options.reducedMotion || 'reduce' });
  if (options.clock) await page.clock.install();
  await page.addInitScript(fakeWindow);
  if (options.theme) await page.addInitScript(theme => { if (!localStorage.getItem('muro.theme')) localStorage.setItem('muro.theme', theme); }, options.theme);
  const errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.error('page error:', e.message); });
  await page.goto(`${base}/tests/harness.html?scenario=${encodeURIComponent(scenario)}${options.query || ''}`);
  return {
    page, errors,
    /** The requests the fake transport has answered, oldest first. */
    calls: () => page.evaluate(() => window.calls.map(c => ({ action: c.action, payload: c.payload }))),
    /** Turn the fake's knobs: flags({blockPlan: true}). */
    flags: patch => page.evaluate(p => Object.assign(window.flags, p), patch),
    async close() {
      await page.close();
      if (--refs === 0) await stop();
      if (errors.length) throw new Error('Page errors: ' + errors.join('; '));
    },
  };
}
