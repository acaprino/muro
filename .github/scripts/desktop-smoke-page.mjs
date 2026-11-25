// What the page of the real window says and does, over the debugging port of WebView2 (desktop-smoke.ps1).
// node desktop-smoke-page.mjs <port> <action> [argument ...]: the last line it prints is JSON.
import { chromium } from '@playwright/test';

const [port, action, ...rest] = process.argv.slice(2);
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
let browser;
let last;
for (let attempt = 0; attempt < 40 && !browser; attempt++) {
  try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 10000 }); } catch (error) { last = error; await pause(250); }
}
if (!browser) throw new Error(`the debugging port did not open: ${String(last).slice(0, 400)}`);
let page;
for (let attempt = 0; attempt < 60 && !page; attempt++) {
  page = browser.contexts()[0]?.pages().find((each) => /tauri\.localhost/.test(each.url()));
  if (!page) await pause(250);
}
if (!page) throw new Error('the page of Muro is not there');
page.setDefaultTimeout(15000);

const say = (value) => console.log(JSON.stringify(value));
const invoke = (command, payload) => page.evaluate(([c, p]) => window.__TAURI_INTERNALS__.invoke(c, p), [command, payload]);

if (action === 'request') {
  // request <action> <payload>: Muro's own command.
  say(await invoke('request', { action: rest[0], payload: JSON.parse(rest[1] ?? '{}') }));
} else if (action === 'settings') {
  // settings <changes>: the settings as they are, with these changed, saved.
  const { revision, settings } = await invoke('request', { action: 'status', payload: {} });
  await invoke('request', { action: 'settings', payload: { revision, settings: { ...settings, ...JSON.parse(rest[0]) } } });
  say((await invoke('request', { action: 'status', payload: {} })).settings);
} else if (action === 'listen') {
  await page.evaluate(async () => {
    const internals = window.__TAURI_INTERNALS__;
    window.smokeShown = 0;
    const handler = internals.transformCallback(() => { window.smokeShown += 1; });
    await internals.invoke('plugin:event|listen', { event: 'window-shown', target: { kind: 'Any' }, handler });
  });
  say({});
} else if (action === 'refused') {
  // Calls the capability does not grant, and commands that are no more.
  const tried = {};
  for (const [command, payload] of [
    ['plugin:window|set_theme', { value: 'dark' }], ['plugin:window|set_title', { value: 'x' }], ['plugin:dialog|open', { options: {} }],
    ['set_window_theme', { theme: 'dark' }], ['window_caption_maximize', { x: 0, y: 0, width: 0, height: 0 }],
  ]) tried[command] = await invoke(command, payload).then(() => 'allowed', () => 'refused');
  say(tried);
} else if (action === 'theme') {
  // theme <light|dark|system>: in the palette, as a person chooses it.
  await page.keyboard.press('Control+k');
  await page.getByRole('dialog').waitFor();
  await page.keyboard.type(`${rest[0]} theme`);
  await page.keyboard.press('Enter');
  await pause(1500);
  say({ scheme: await page.evaluate(() => document.documentElement.dataset.scheme) });
} else if (action === 'close') {
  await page.click('[data-window-control="close"]').catch(() => undefined);
  say({});
  process.exit(0);
} else {
  await page.waitForSelector('[data-window-control="close"]', { state: 'attached' });
  await pause(700);
  say(await page.evaluate(() => {
    const button = document.querySelector('[data-window-control="maximize"], [data-window-control="restore"]').getBoundingClientRect();
    const px = (value) => Math.round(value * devicePixelRatio);
    return {
      timeOrigin: performance.timeOrigin,
      scheme: document.documentElement.dataset.scheme,
      shown: window.smokeShown ?? null,
      button: { x: px(button.left), y: px(button.top), width: px(button.width), height: px(button.height) },
      ipc: performance.getEntriesByType('resource').filter(({ name }) => name.includes('ipc.localhost'))
        .map(({ name, startTime, responseEnd, responseStatus }) => ({ call: decodeURIComponent(new URL(name).pathname.slice(1)), start: Math.round(startTime), end: Math.round(responseEnd), status: responseStatus })),
    };
  }));
}
await browser.close();
