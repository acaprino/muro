// The Activity page on Sigrid, on the fake transport (fake-transport.js): the history newest first, the filters and the empty page, an AI run that goes (its card, and Cancel, which asks first),
// and the page at 500 and 250px. The list itself is tested without a browser in activity.test.ts.
//   node apps/desktop/tests/browser-activity.mjs        (MURO_UI_PORT moves the dev server off 1422; MURO_ONLY=<words> runs the tests whose name holds them)
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { open } from './browser-helper.mjs';

const shots = 'apps/desktop/tests/artifacts';
await mkdir(shots, { recursive: true });
const done = [], failed = [];
async function test(name, scenario, options, body) {
  if (process.env.MURO_ONLY && !name.includes(process.env.MURO_ONLY)) return;
  const app = await open(scenario, options);
  app.page.setDefaultTimeout(10000);
  try { await body(app); done.push(name); }
  catch (error) { failed.push(`${name}: ${String(error.message).split(/\r?\n/).slice(0, 3).join(' | ')}`); }
  finally { await app.close().catch(error => failed.push(`${name}: ${error.message}`)); }
}

const content = page => page.locator('main[data-slot="app-shell-content"]');
const status = page => page.locator('[data-slot="app-shell-status"]');
const tab = (page, name) => page.locator('[data-slot="toolbar-tab"]').filter({ hasText: new RegExp(`^${name}$`) });
const ready = page => status(page).getByText(/Last check/).waitFor();
const history = page => content(page).getByRole('list', { name: 'Activity' });
const rows = page => history(page).getByRole('listitem');
const titles = page => rows(page).evaluateAll(items => items.map(item => item.innerText.split('\n')[0].trim()));
const filter = (page, name) => content(page).getByRole('group', { name: 'Filter activity' }).locator('[data-slot="toggle-group-item"]').filter({ hasText: new RegExp(`^${name}$`) });
const question = page => page.locator('[role="alertdialog"], [role="dialog"]');
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

await test('the history lists what Muro did, newest first, in the words of the interface', 'demo-activity', {}, async app => {
  const { page } = app;
  await ready(page);
  await tab(page, 'Activity').click();
  await content(page).getByRole('heading', { name: 'History' }).waitFor();
  await history(page).waitFor();
  assert.deepEqual(await titles(page), ['Checked sources and harnesses', 'Automatic sync', 'Synced your harnesses', 'Check with problems']);
  await history(page).getByText('2 changes applied').waitFor();
  assert.equal(await content(page).getByText('Check with problems').count(), 1);
  await page.screenshot({ path: shots + '/activity.png' });
});

await test('the filters keep the entries they name, and the page says so when none is left', 'demo-activity', {}, async app => {
  const { page } = app;
  await ready(page);
  await tab(page, 'Activity').click();
  await history(page).waitFor();
  await filter(page, 'Sync').click();
  assert.equal((await titles(page)).length, 4, 'all four are sync runs');
  await filter(page, 'Problems').click();
  assert.deepEqual(await titles(page), ['Check with problems']);
  await filter(page, 'AI runs').click();
  await content(page).getByText('Nothing here').waitFor();
  await filter(page, 'All').click();
  assert.equal((await titles(page)).length, 4);
});

await test('an AI run that goes has its card on top, and Cancel asks first', 'demo', {}, async app => {
  const { page } = app;
  await ready(page);
  await tab(page, 'Activity').click();
  const card = page.getByRole('region', { name: 'AI run', exact: true });
  await card.waitFor();
  await card.getByText('Running', { exact: true }).waitFor();
  await card.getByRole('button', { name: 'Cancel', exact: true }).click();
  const dialog = question(page);
  await dialog.getByText('Cancel adaptation?').waitFor();
  await dialog.getByRole('button', { name: 'Keep running' }).click();
  await dialog.waitFor({ state: 'detached' });
  assert.equal((await app.calls()).filter(c => c.action === 'cancel_job').length, 0, 'Keep running sends nothing');
  await card.getByRole('button', { name: 'Cancel', exact: true }).click();
  await question(page).getByRole('button', { name: 'Cancel adaptation' }).click();
  await question(page).waitFor({ state: 'detached' });
  assert.equal((await app.calls()).filter(c => c.action === 'cancel_job').length, 1, 'the question\'s answer sends one cancel');
});

await test('at 500 and 250px the page does not scroll sideways', 'demo-activity', { viewport: { width: 500, height: 800 } }, async app => {
  const { page } = app;
  await ready(page);
  await tab(page, 'Activity').click();
  await history(page).waitFor();
  assert.ok(await sideways(page) <= 0, `500px: the page scrolls ${await sideways(page)}px sideways`);
  await page.setViewportSize({ width: 250, height: 800 });
  assert.ok(await sideways(page) <= 0, `250px: the page scrolls ${await sideways(page)}px sideways`);
  await page.screenshot({ path: shots + '/activity-250.png' });
});

if (failed.length) { console.error('FAILED:\n  ' + failed.join('\n  ')); process.exit(1); }
console.log('PASS: ' + done.join('; '));
