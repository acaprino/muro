// The window's frame on Sigrid (plan R0, Task 3), on the fake transport (fake-transport.js): the four tabs and the page
// behind each, the title bar's buttons and their names, nothing out of the window from 250px up, Muro's accent in both
// schemes, the command palette and the theme it keeps, and the registry read again when the shell shows the window,
// on the focus and every 30 s while the window has it.
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

/** What sticks out: how far the page scrolls sideways, which items of the title bar's toolbar run under the window's buttons, and whether those buttons and every tab are inside the window.
 * For the row of tabs under the bar, also whether it scrolls sideways inside itself, and which tabs could not be scrolled into it (each is scrolled into view, then the row goes back to its start). */
const measure = page => page.evaluate(() => {
  const bar = document.querySelector('[data-slot="title-bar"]');
  const buttons = bar.querySelector('[data-slot="window-controls"]').getBoundingClientRect();
  const under = [...bar.querySelectorAll('[data-slot="toolbar"] > *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > buttons.left + 0.5; }).map(e => e.getAttribute('data-slot') + ' ' + e.textContent.trim());
  const outside = [...document.querySelectorAll('[data-slot="toolbar-tab"]')].filter(e => { const r = e.getBoundingClientRect(); const row = e.closest('[data-slot="toolbar"]').getBoundingClientRect(); return r.left < row.left - 0.5 || r.right > row.right + 0.5 || r.right > window.innerWidth + 0.5; }).map(e => e.textContent.trim());
  const sideways = document.documentElement.scrollWidth - window.innerWidth;
  const row = document.querySelector('[data-slot="app-shell-tabs"] [data-slot="toolbar"]'), unreachable = [];
  let rowScrolls = false;
  if (row) {
    rowScrolls = row.scrollWidth > row.clientWidth + 0.5 && ['auto', 'scroll'].includes(getComputedStyle(row).overflowX);
    const box = row.getBoundingClientRect();
    for (const t of row.querySelectorAll('[data-slot="toolbar-tab"]')) {
      t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = t.getBoundingClientRect();
      if (r.left < box.left - 0.5 || r.right > box.right + 0.5) unreachable.push(t.textContent.trim());
    }
    row.scrollLeft = 0;
  }
  return { sideways, under, outside, buttonsPastEdge: buttons.right - window.innerWidth, rowScrolls, unreachable, rowWidth: row?.clientWidth ?? 0, rowContent: row?.scrollWidth ?? 0 };
});

/** The colour a `#rrggbb` is, one channel at a time; two colours are the same within one step of 255 in each channel. */
const channels = hex => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));
const near = (a, b) => /^#[0-9a-f]{6}$/i.test(a) && /^#[0-9a-f]{6}$/i.test(b) && channels(a).every((v, i) => Math.abs(v - channels(b)[i]) <= 1);
/** The scheme and the accent painted on the root, and the hex Sigrid's own `toHex` gives for Muro's accent (src/sigridTheme.ts, `accentHex`). */
const painted = page => page.evaluate(async () => {
  const { accentHex } = await import('/src/sigridTheme.ts');
  const root = document.documentElement, scheme = root.dataset.scheme;
  return { theme: root.dataset.theme, scheme, accent: root.style.getPropertyValue('--color-accent').trim(), ring: root.style.getPropertyValue('--color-ring').trim(), expected: accentHex(scheme), stored: localStorage.getItem('muro.theme') };
});
const themed = page => page.waitForFunction(() => document.documentElement.dataset.theme === 'muro');

// ---------- the tabs and their pages ----------
await test('the window opens on Sync; the four tabs are in the title bar in order, and each one shows its own page', 'default', {}, async app => {
  const { page } = app;
  await ready(page);
  assert.deepEqual(await texts(titleBar(page).locator('[data-slot="toolbar-tab"]')), PAGES, 'at 1512px the tabs are in the bar');
  assert.deepEqual(await texts(currentTab(page)), ['Sync'], 'the window opens on Sync');
  assert.equal(await content(page).getAttribute('aria-label'), 'Sync');
  await content(page).getByText('Sync is moving to the new window').waitFor();
  await page.screenshot({ path: shots + '/shell-sync.png' });
  for (const name of ['Activity', 'Settings', 'Sync']) {
    await tab(page, name).click();
    assert.deepEqual(await texts(currentTab(page)), [name], `${name} is the current tab`);
    assert.equal(await content(page).getAttribute('aria-label'), name, 'the content is named after the page');
    await content(page).getByText(`${name} is moving to the new window`).waitFor();
    assert.equal(await content(page).getByText(/is moving to the new window/).count(), 1, 'one page at a time');
  }
  await content(page).getByText('the background worker goes on checking your registry; with automatic sync on it also applies the changes').waitFor();
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
await test('from 250px up nothing sticks out sideways: the tabs go under the bar below 860px and keep their words, and under 500px their row scrolls inside itself', 'changes', { viewport: { width: 500, height: 800 } }, async app => {
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
    if (width >= 500) assert.deepEqual(m.outside, [], `${width}px: every tab is inside its row and the window`);
    else {
      // Under 500px the four tabs, with their words, are wider than the row Sigrid's frame gives them: the row scrolls sideways inside itself (App.tsx gives it
      // `overflow-x-auto`) and the page does not. What holds here is that every tab can be scrolled into the row, not that all four are in sight at once.
      console.log(`${width}px: the row of tabs is ${m.rowWidth}px wide and its tabs ${m.rowContent}px; not in sight before scrolling: ${m.outside.join(', ') || 'none'}`);
      if (m.outside.length) assert.ok(m.rowScrolls, `${width}px: the tabs out of sight (${m.outside.join(', ')}) are in a row that scrolls sideways`);
      assert.deepEqual(m.unreachable, [], `${width}px: every tab can be scrolled into its row`);
    }
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
await test('Muro\'s accent is painted as oklch(0.82 0.12 170) in dark, following Windows, and is the focus ring', 'default', { colorScheme: 'dark' }, async app => {
  const { page } = app;
  await ready(page);
  await themed(page);
  const p = await painted(page);
  assert.equal(p.scheme, 'dark');
  assert.equal(p.stored, null, 'nothing chosen yet: Windows decides');
  assert.ok(near(p.accent, p.expected), `the accent ${p.accent} is Sigrid's hex of oklch(0.82 0.12 170), ${p.expected}`);
  assert.ok(near(p.accent, '#68ddb8'), `the accent ${p.accent} is oklch(0.82 0.12 170)`);
  assert.equal(p.ring, p.accent, 'the focus ring is the accent');
  await page.screenshot({ path: shots + '/shell-dark.png' });
});

await test('Muro\'s accent is painted as oklch(0.47 0.13 170) in light, following Windows', 'default', { colorScheme: 'light' }, async app => {
  const { page } = app;
  await ready(page);
  await themed(page);
  const p = await painted(page);
  assert.equal(p.scheme, 'light');
  assert.ok(near(p.accent, p.expected), `the accent ${p.accent} is Sigrid's hex of oklch(0.47 0.13 170), ${p.expected}`);
  await page.screenshot({ path: shots + '/shell-light.png' });
});

await test('the palette opens with Ctrl+K and from the bar; it goes to a page, and a theme chosen there stays across a reload', 'default', { colorScheme: 'dark' }, async app => {
  const { page } = app;
  await ready(page);
  await themed(page);
  await page.keyboard.press('Control+k');
  await options(page).first().waitFor();
  assert.deepEqual(await texts(options(page)), ['Check now', ...PAGES, 'Light theme', 'Dark theme'], 'Follow Windows is the choice in use: the two others are offered');
  assert.equal(await options(page).filter({ hasText: 'Check now' }).getAttribute('aria-disabled'), 'true', 'Check now comes back with the Sync page');
  await page.screenshot({ path: shots + '/shell-palette.png' });
  await options(page).filter({ hasText: 'Light theme' }).click();
  await palette(page).waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.documentElement.dataset.scheme === 'light');
  assert.equal((await painted(page)).stored, 'light', 'kept under muro.theme');

  await page.reload();
  await ready(page);
  await themed(page);
  assert.equal((await painted(page)).scheme, 'light', 'the choice outlives a reload, with Windows dark');
  await titleBar(page).getByRole('button', { name: 'Commands', exact: true }).click();
  await options(page).first().waitFor();
  assert.deepEqual(await texts(options(page).filter({ hasText: /theme|Windows/ })), ['Follow Windows', 'Dark theme']);
  await options(page).filter({ hasText: 'Follow Windows' }).click();
  await palette(page).waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.documentElement.dataset.scheme === 'dark');
  assert.equal((await painted(page)).stored, 'system');

  await page.keyboard.press('Control+k');
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-slot') === 'command-palette-input');
  await page.keyboard.type('activity');
  assert.deepEqual(await texts(options(page)), ['Activity']);
  await page.keyboard.press('Enter');
  await palette(page).waitFor({ state: 'detached' });
  assert.deepEqual(await texts(currentTab(page)), ['Activity']);
});

// ---------- the registry, read again ----------
await test('the window reads the registry again when the shell shows it and when it gets the focus, and asks for no plan', 'changes', {}, async app => {
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
