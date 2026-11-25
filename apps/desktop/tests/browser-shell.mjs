// Muro in Imago's shell, on the fake transport (fake-transport.js) and in a fake window (browser-helper.mjs): the four views and the
// page behind each, the window's buttons, nothing out of the window from 250px up, Muro's accent in both schemes, the palette and
// the theme it keeps, and the registry read again when the window is shown, on the focus and every 30 s while it has it.
//   node apps/desktop/tests/browser-shell.mjs        (MURO_UI_PORT moves the dev server off 1422)
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { open } from './browser-helper.mjs';

const shots = 'apps/desktop/tests/artifacts';
await mkdir(shots, { recursive: true });
const done = [], failed = [];
/** Every test runs, whatever the others did: a failure is listed at the end, and fails the run. */
async function test(name, scenario, options, body) {
  if (process.env.MURO_ONLY && !name.includes(process.env.MURO_ONLY)) return;   // while working on one test
  const app = await open(scenario, options);
  app.page.setDefaultTimeout(10000);
  try { await body(app); done.push(name); }
  catch (error) { failed.push(`${name}: ${String(error.message).split(/\r?\n/).slice(0, 3).join(' | ')}`); }
  finally { await app.close().catch(error => failed.push(`${name}: ${error.message}`)); }
}

const PAGES = ['Projects', 'Sync', 'Activity', 'Settings'];
const titleBar = page => page.locator('[data-slot="title-bar"]');
/** The tabs wherever they are: in the title bar, or in the row under it on a narrow window. A tab is a button marked `aria-current="page"` when it is the page shown (Sigrid's `ToolbarTab`), not a `role=tab`. */
const tabs = page => page.locator('[data-slot="toolbar-tab"]');
const tab = (page, name) => tabs(page).filter({ hasText: new RegExp(`^${name}$`) });
const currentTab = page => page.locator('[data-slot="toolbar-tab"][aria-current="page"]');
const content = page => page.locator('main[data-slot="app-shell-content"]');
const status = page => page.locator('[data-slot="app-shell-status"]');
const foot = page => page.locator('[data-slot="app-shell-footer"]');
const controls = page => titleBar(page).locator('[data-slot="window-controls"] button');
const palette = page => page.locator('[data-slot="command-palette"]');
const options = page => palette(page).getByRole('option');
const texts = loc => loc.evaluateAll(elements => elements.map(e => e.textContent.trim()));
const count = async (app, action) => (await app.calls()).filter(c => c.action === action).length;
const behind = (page, change) => page.evaluate(change);
/** The window has read the registry once: the footer says what it holds. */
const ready = page => foot(page).getByText(/in your list/).waitFor();

/** What sticks out: how far the page scrolls sideways, which items of the title bar's toolbar run under the window's buttons, and whether those buttons and every tab are inside the window. */
const measure = page => page.evaluate(() => {
  const bar = document.querySelector('[data-slot="title-bar"]');
  const buttons = bar.querySelector('[data-slot="window-controls"]').getBoundingClientRect();
  const under = [...bar.querySelectorAll('[data-slot="toolbar"] > *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > buttons.left + 0.5; }).map(e => e.getAttribute('data-slot') + ' ' + e.textContent.trim());
  const outside = [...document.querySelectorAll('[data-slot="toolbar-tab"]')].filter(e => { const r = e.getBoundingClientRect(); const row = e.closest('[data-slot="toolbar"]').getBoundingClientRect(); return r.left < row.left - 0.5 || r.right > row.right + 0.5 || r.right > window.innerWidth + 0.5; }).map(e => e.textContent.trim());
  return { sideways: document.documentElement.scrollWidth - window.innerWidth, under, outside, buttonsPastEdge: buttons.right - window.innerWidth };
});

/** The colour a `#rrggbb` is, one channel at a time; two colours are the same within one step of 255 in each channel. */
const channels = hex => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));
const near = (a, b) => /^#[0-9a-f]{6}$/i.test(a) && /^#[0-9a-f]{6}$/i.test(b) && channels(a).every((v, i) => Math.abs(v - channels(b)[i]) <= 1);
/** The scheme and the accent painted on the root, the choice kept, and what the window was told of the theme last. */
const painted = page => page.evaluate(() => {
  const root = document.documentElement;
  return {
    scheme: root.dataset.scheme, accent: root.style.getPropertyValue('--color-accent').trim(), ring: root.style.getPropertyValue('--color-ring').trim(), stored: localStorage.getItem('muro.theme'),
    told: window.native.filter(([command]) => command === 'plugin:imago-shell|set_theme').at(-1)?.[1],
  };
});
const themed = page => page.waitForFunction(() => document.documentElement.dataset.theme === 'muro');

// ---------- the tabs and their pages ----------
await test('the window opens on Sync; the four tabs are in the title bar in order, and each one shows its own page', 'default', {}, async app => {
  const { page } = app;
  await ready(page);
  assert.deepEqual(await texts(titleBar(page).locator('[data-slot="toolbar-tab"]')), PAGES, 'at 1512px the tabs are in the bar');
  assert.deepEqual(await texts(currentTab(page)), ['Sync'], 'the window opens on Sync');
  assert.equal(await content(page).getAttribute('aria-label'), 'Sync');
  await page.screenshot({ path: shots + '/shell-sync.png' });
  for (const name of ['Activity', 'Settings']) {
    await tab(page, name).click();
    assert.deepEqual(await texts(currentTab(page)), [name], `${name} is the current tab`);
    assert.equal(await content(page).getAttribute('aria-label'), name, 'the content is named after the page');
    await content(page).getByText(`${name} is moving to the new window`).waitFor();
    assert.equal(await content(page).getByText(/is moving to the new window/).count(), 1, 'one page at a time');
  }
  await content(page).getByText('the background worker goes on checking your registry; with automatic sync on it also applies the changes').waitFor();
  await tab(page, 'Sync').click();
  assert.deepEqual(await texts(currentTab(page)), ['Sync'], 'Sync is a page of its own now (browser-sync.mjs tests it)');
  assert.equal(await content(page).getByText(/is moving to the new window/).count(), 0, 'and no longer says it is moving');
});

await test('the title bar names the product and its buttons: the palette, and the three window buttons at its end', 'default', {}, async app => {
  const { page } = app;
  await ready(page);
  await titleBar(page).locator('[data-slot="toolbar-brand-name"]').getByText('Muro', { exact: true }).waitFor();
  assert.deepEqual(await controls(page).evaluateAll(buttons => buttons.map(b => [b.tagName, b.getAttribute('aria-label')])), [['BUTTON', 'Minimize'], ['BUTTON', 'Maximize'], ['BUTTON', 'Close']]);
  for (const name of ['Minimize', 'Maximize', 'Close']) assert.equal(await titleBar(page).getByRole('button', { name, exact: true }).count(), 1, `one ${name} button`);
  await titleBar(page).getByRole('button', { name: 'Commands', exact: true }).waitFor();
  const { buttonsPastEdge } = await measure(page);
  assert.ok(Math.abs(buttonsPastEdge) <= 0.5, 'the window buttons end at the window\'s edge');
  assert.equal(await titleBar(page).getAttribute('data-tauri-drag-region'), '', 'the bar moves the window');
});

// ---------- narrow windows ----------
await test('from 250px up nothing sticks out sideways: the tabs go under the bar below 860px and keep their words', 'changes', { viewport: { width: 500, height: 800 } }, async app => {
  const { page } = app;
  await ready(page);
  // 250 is the smallest window (500 physical pixels) at 200% zoom, 340 about a window half-snapped on a 1366px screen at 200%.
  for (const width of [250, 340, 500, 620, 700, 859, 860, 1000, 1512]) {
    await page.setViewportSize({ width, height: 800 });
    const row = page.locator('[data-slot="app-shell-tabs"]');
    if (width < 860) await row.locator('[data-slot="toolbar-tab"]').first().waitFor(); else await row.waitFor({ state: 'detached' });
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    assert.deepEqual(await texts(tabs(page)), PAGES, `${width}px: the four tabs, with their words`);
    assert.equal(await titleBar(page).locator('[data-slot="toolbar-tab"]').count(), width < 860 ? 0 : 4, `${width}px: the tabs are ${width < 860 ? 'under' : 'in'} the bar`);
    const m = await measure(page);
    assert.ok(m.sideways <= 0, `${width}px: the page scrolls ${m.sideways}px sideways`);
    assert.deepEqual(m.under, [], `${width}px: nothing of the bar runs under the window buttons`);
    assert.ok(Math.abs(m.buttonsPastEdge) <= 0.5, `${width}px: the window buttons end at the window's edge`);
    assert.deepEqual(m.outside, [], `${width}px: every tab is inside its row and the window`);
    if (width === 500 || width === 250) await page.screenshot({ path: `${shots}/shell-${width}.png` });
  }
  await page.setViewportSize({ width: 500, height: 800 });
  await page.locator('[data-slot="app-shell-tabs"] [data-slot="toolbar-tab"]').first().waitFor();
  for (const name of ['Settings', 'Activity']) {
    await tab(page, name).click();
    assert.deepEqual(await texts(currentTab(page)), [name]);
    await content(page).getByText(`${name} is moving to the new window`).waitFor();
  }
  assert.equal(await controls(page).count(), 3, 'the window buttons stay at 500px');
  await titleBar(page).getByRole('button', { name: 'Commands', exact: true }).waitFor();
});

// ---------- the theme ----------
await test('with nothing chosen the window is dark, whatever Windows says: Muro\'s accent is #68ddb8, the focus ring is the accent, and the window is told', 'default', { colorScheme: 'light' }, async app => {
  const { page } = app;
  await ready(page);
  await themed(page);
  await page.waitForFunction(() => window.native.some(([command]) => command === 'plugin:imago-shell|ready'));
  const p = await painted(page);
  assert.equal(p.scheme, 'dark');
  assert.ok(near(p.accent, '#68ddb8'), `the accent ${p.accent} is oklch(0.82 0.12 170)`);
  assert.equal(p.ring, p.accent, 'the focus ring is the accent');
  assert.deepEqual(p.told, { theme: 'dark', resolved: 'dark' });
  await page.screenshot({ path: shots + '/shell-dark.png' });
});

await test('a theme kept by the earlier window under muro.theme stays: light, with Muro\'s accent #00714f', 'default', { theme: 'light' }, async app => {
  const { page } = app;
  await ready(page);
  await themed(page);
  const p = await painted(page);
  assert.equal(p.scheme, 'light');
  assert.ok(near(p.accent, '#00714f'), `the accent ${p.accent} is oklch(0.47 0.13 170)`);
  await page.screenshot({ path: shots + '/shell-light.png' });
});

await test('the palette opens with Ctrl+K and from the bar; it goes to a page, and a theme chosen there stays across a reload', 'default', { colorScheme: 'dark' }, async app => {
  const { page } = app;
  await ready(page);
  await themed(page);
  await page.keyboard.press('Control+k');
  await options(page).first().waitFor();
  for (const name of ['Check now', ...PAGES.map(p => `Go to ${p}`), 'Light theme', 'Dark theme', 'System theme']) assert.equal(await options(page).filter({ hasText: name }).count(), 1, `${name} is in the palette, once`);
  assert.notEqual(await options(page).filter({ hasText: 'Check now' }).getAttribute('aria-disabled'), 'true', 'Check now works since the Sync page is there');
  await page.screenshot({ path: shots + '/shell-palette.png' });
  await options(page).filter({ hasText: 'Light theme' }).click();
  await palette(page).waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.documentElement.dataset.scheme === 'light');
  assert.equal((await painted(page)).stored, 'light', 'kept under muro.theme');

  await page.reload();
  await ready(page);
  await themed(page);
  assert.equal((await painted(page)).scheme, 'light', 'the choice outlives a reload, with Windows dark');
  await titleBar(page).getByRole('button', { name: 'Commands' }).click();
  await options(page).first().waitFor();
  await options(page).filter({ hasText: 'System theme' }).click();
  await palette(page).waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.documentElement.dataset.scheme === 'dark');
  assert.equal((await painted(page)).stored, 'system');

  await page.keyboard.press('Control+k');
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-slot') === 'command-palette-input');
  await page.keyboard.type('activity');
  assert.deepEqual(await options(page).filter({ hasText: 'Go to' }).evaluateAll(all => all.map(e => e.textContent.trim())), ['Go to Activity']);
  await page.keyboard.press('Enter');
  await palette(page).waitFor({ state: 'detached' });
  assert.deepEqual(await texts(currentTab(page)), ['Activity']);
});

// ---------- the glass ----------
await test('Settings has the glass of the window, off at first; a press makes it glass and tells the window, and the palette says so', 'default', {}, async app => {
  const { page } = app;
  await ready(page);
  await tab(page, 'Settings').click();
  const glass = content(page).getByRole('switch', { name: 'Glass' });
  assert.equal(await glass.getAttribute('aria-checked'), 'false', 'the window is not glass until the person chooses');
  assert.equal(await page.evaluate(() => window.native.filter(([command]) => command === 'plugin:imago-shell|set_glass').length), 0, 'nothing is told at the start');
  await content(page).getByText('Settings is moving to the new window').waitFor();
  await glass.click();
  await page.waitForFunction(() => document.documentElement.dataset.material === 'glass');
  await page.waitForFunction(() => window.native.some(([command]) => command === 'plugin:imago-shell|set_glass'));
  assert.deepEqual(await page.evaluate(() => window.native.filter(([command]) => command === 'plugin:imago-shell|set_glass').map(([, args]) => args)), [{ glass: true }]);
  await page.screenshot({ path: shots + '/shell-glass.png' });
  await page.keyboard.press('Control+k');
  assert.equal(await options(page).filter({ hasText: 'Glass' }).getAttribute('aria-checked'), 'true', 'the command of the look is checked');
});

// ---------- the registry, read again ----------
await test('the window reads the registry again when the crate says it is shown (window-shown) and when it gets the focus, and asks for no plan', 'changes', {}, async app => {
  const { page } = app;
  await ready(page);
  await foot(page).getByText('Automatic sync off').waitFor();
  await status(page).getByText('Not checked yet').waitFor();
  await status(page).getByText('1 harness').waitFor();
  const before = await count(app, 'snapshot');
  await behind(page, () => window.behind.settings({ auto_sync: true }));
  await page.evaluate(() => window.shown());
  await foot(page).getByText('Automatic sync on').waitFor();
  await status(page).getByText('next check soon').waitFor();
  assert.equal(await count(app, 'snapshot'), before + 1);
  await behind(page, () => window.behind.check());
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await status(page).getByText('1 change waiting').waitFor();
  assert.match(await status(page).textContent(), /Last check\s*today/);
  assert.equal(await count(app, 'snapshot'), before + 2);
  assert.equal(await count(app, 'plan'), 0, 'a refresh asks for no plan');
});

await test('every 30 s while it has the focus the window shows what the worker recorded', 'changes', { clock: true }, async app => {
  const { page } = app;
  await ready(page);
  await status(page).getByText('Not checked yet').waitFor();
  assert.equal(await page.evaluate(() => document.hasFocus()), true, 'the premise: this page has the focus');
  const before = await count(app, 'snapshot');
  // Time stands still from here: what passes is what the test lets pass.
  await page.clock.pauseAt(new Date(Date.now() + 2_000));
  await behind(page, () => window.behind.check());
  await page.clock.fastForward(10_000);
  assert.equal(await count(app, 'snapshot'), before, 'not yet');
  await page.clock.fastForward(25_000);
  await status(page).getByText('1 change waiting').waitFor();
  assert.match(await status(page).textContent(), /Last check\s*today/);
  assert.equal(await count(app, 'snapshot'), before + 1);
  assert.equal(await count(app, 'plan'), 0);
});

if (failed.length) { console.error('FAILED:\n  ' + failed.join('\n  ')); process.exit(1); }
console.log('PASS: ' + done.join('; '));
