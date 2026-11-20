// The open window beside the background worker, on the fake transport (fake-transport.js): what it shows of a check it did not
// make (the recorded sync state, on open and after a refresh), how it follows the registry the worker and the tray change
// (when it gets the focus, every 30 s while it has it and nothing is under way), a settings save the registry refuses because
// it moved, a source the last check could not resolve, and a plugin added from what is installed.
//   node apps/desktop/tests/browser-background.mjs        (MURO_UI_PORT moves the dev server off 1422)
import assert from 'node:assert/strict';
import { open } from './browser-helper.mjs';

const done = [], failed = [];
/** Every test runs, whatever the others did: a failure is listed at the end, and fails the run. */
async function test(name, scenario, options, body) {
  const app = await open(scenario, options);
  app.page.setDefaultTimeout(10000);
  try { await body(app); done.push(name); }
  catch (error) { failed.push(`${name}: ${String(error.message).split(/\r?\n/).slice(0, 3).join(' | ')}`); }
  finally { await app.close().catch(error => failed.push(`${name}: ${error.message}`)); }
}
const strip = page => page.locator('section.strip');
const title = page => strip(page).locator('strong').first().textContent();
const count = async (app, action) => (await app.calls()).filter(c => c.action === action).length;
const focus = page => page.evaluate(() => window.dispatchEvent(new Event('focus')));
const behind = (page, change) => page.evaluate(change);
const stateButton = page => page.locator('.tstatus');

// ---------- F1: the recorded check shows on open ----------
await test('a check the window did not make shows on open: its count, Review and Apply all', 'recorded', {}, async app => {
  const { page } = app;
  await strip(page).locator('strong', { hasText: '1 change ready to apply' }).waitFor();
  assert.deepEqual(await strip(page).locator('button').allTextContents(), ['Check now', 'Review', 'Apply all 1 change']);
  assert.equal(await strip(page).locator('small').first().textContent(), 'Nothing changes until you apply.', 'no breakdown, no leading full stop');
  assert.match(await strip(page).locator('.meta').textContent(), /Last check\s*(today|yesterday)/);
  assert.match(await stateButton(page).textContent(), /1 change waiting · checked/);
  assert.equal(await page.locator('nav button', { hasText: 'Sync' }).locator('.n').textContent(), '1', 'the tab badge agrees');
  assert.match(await page.locator('#rows td').nth(2).textContent(), /Update 1 → 2/, 'the cells are the snapshot\'s');
  assert.equal(await page.getByText('Not checked yet').count(), 0);
  assert.deepEqual((await app.calls()).map(c => c.action).filter(a => a === 'plan' || a === 'check'), [], 'opening checks nothing');
  // Review plans again before it shows anything.
  await strip(page).getByRole('button', { name: 'Review' }).click();
  await page.locator('dialog.sheet[open]').waitFor();
  assert.equal(await count(app, 'plan'), 1);
});

await test('a recorded check with nothing to do is Everything is in sync, and its columns agree', 'recorded-ok', {}, async ({ page }) => {
  await strip(page).locator('strong', { hasText: 'Everything is in sync' }).waitFor();
  assert.match(await page.locator('th .hstate').last().textContent(), /In sync/);
  assert.match(await stateButton(page).textContent(), /In sync · checked/);
});

await test('a column the record cannot describe says to check, never In sync', 'recorded-unseen', {}, async app => {
  const { page } = app;
  await strip(page).locator('strong', { hasText: '1 change ready to apply' }).waitFor();
  const column = page.locator('th .hstate').last();
  assert.match(await column.textContent(), /Check to see the changes/);
  assert.doesNotMatch(await column.textContent(), /In sync/);
  await strip(page).getByRole('button', { name: 'Check now' }).click();
  await column.getByRole('button', { name: 'Sync 1 change' }).waitFor();
  assert.doesNotMatch(await column.textContent(), /Check to see/, 'the plan shows what the column holds');
});

// ---------- F5: a source the last check could not resolve ----------
await test('a source the last check could not resolve is not in sync, and a clean check says so', 'recorded-errors', {}, async app => {
  const { page } = app;
  await strip(page).locator('strong', { hasText: '1 source could not be checked' }).waitFor();
  assert.doesNotMatch(await strip(page).textContent(), /Everything is in sync/);
  assert.match(await stateButton(page).textContent(), /Sources not checked/);
  assert.deepEqual(await strip(page).locator('button').allTextContents(), ['Check now']);
  assert.match(await strip(page).getByRole('button', { name: 'Check now' }).getAttribute('class'), /primary/, 'Check now leads');
  await app.flags({ checkErrors: true });
  await strip(page).getByRole('button', { name: 'Check now' }).click();
  await page.locator('.banner[role=alert]').getByText('1 source could not be checked').waitFor();
  assert.equal(await title(page), '1 source could not be checked', 'the check found it again');
  await app.flags({ checkErrors: false });
  await strip(page).getByRole('button', { name: 'Check now' }).click();
  await strip(page).locator('strong', { hasText: 'Everything is in sync' }).waitFor();
  assert.equal(await page.locator('.banner[role=alert]').count(), 0);
});

// ---------- F4: the window follows the registry ----------
await test('the window reads the registry again when it gets the focus, and asks for no plan', 'changes', { clock: true }, async app => {
  const { page } = app;
  await strip(page).getByText('Automatic sync off').waitFor();
  assert.equal(await page.evaluate(() => document.hasFocus()), true, 'the premise: this page has the focus');
  const before = await count(app, 'snapshot');
  await behind(page, () => window.behind.settings({ auto_sync: true }));
  await focus(page);
  await strip(page).getByText('Next check').waitFor();
  assert.equal(await count(app, 'snapshot'), before + 1);
  assert.equal(await count(app, 'plan'), 0, 'a refresh asks for no plan');
  // The save that failed with "Registry revision changed" before now goes through, over what the worker saved.
  await page.getByRole('button', { name: /^Settings/ }).click();
  await page.getByRole('switch', { name: 'Keep running when the window is closed' }).click();
  await page.locator('#toasts').getByText('Saved.').waitFor();
  const save = (await app.calls()).filter(c => c.action === 'settings').at(-1).payload;
  assert.equal(save.revision, 2);
  assert.deepEqual([save.settings.auto_sync, save.settings.close_to_tray], [true, false], 'what the worker saved is kept');
  assert.equal(await page.locator('.banner[role=alert]').count(), 0);
});

await test('the shell telling the window it was shown again reads the registry again, and asks for no plan', 'changes', {}, async app => {
  const { page } = app;
  await strip(page).getByText('Automatic sync off').waitFor();
  const before = await count(app, 'snapshot');
  await behind(page, () => window.behind.settings({ auto_sync: true }));
  await page.evaluate(() => window.shown());
  await strip(page).getByText('Next check').waitFor();
  assert.equal(await count(app, 'snapshot'), before + 1);
  assert.equal(await count(app, 'plan'), 0);
});

await test('every 30 s while it has the focus the window shows what the worker recorded', 'changes', { clock: true }, async app => {
  const { page } = app;
  await strip(page).getByText('Not checked yet').waitFor();
  assert.equal(await page.evaluate(() => document.hasFocus()), true);
  // Time stands still from here: what passes is what the test lets pass.
  await page.clock.pauseAt(new Date(Date.now() + 2_000));
  await behind(page, () => window.behind.check());
  await page.clock.fastForward(10_000);
  assert.equal(await count(app, 'snapshot'), 1, 'not yet');
  await page.clock.fastForward(25_000);
  await strip(page).locator('strong', { hasText: '1 change ready to apply' }).waitFor();
  assert.match(await strip(page).locator('.meta').textContent(), /Last check\s*today/);
  assert.equal(await count(app, 'plan'), 0);
});

await test('nothing under way is disturbed: not a dialog that is open, not a box being typed in', 'changes', { clock: true }, async app => {
  const { page } = app;
  await strip(page).getByText('Not checked yet').waitFor();
  const snapshots = () => count(app, 'snapshot');
  // A dialog is open: it is the person's.
  await page.getByRole('button', { name: 'Add plugin' }).first().click();
  await page.locator('dialog[open]').waitFor();
  await behind(page, () => window.behind.check());
  await page.clock.fastForward(31_000);
  await focus(page);
  assert.equal(await snapshots(), 1, 'a dialog was open');
  await page.keyboard.press('Escape');
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  // A text box has the keyboard: what is typed in it is not put back to what is stored.
  await page.locator('#search').click();
  await page.locator('#search').fill('pack');
  await page.clock.fastForward(31_000);
  await focus(page);
  assert.equal(await snapshots(), 1, 'a box was being typed in');
  assert.equal(await page.locator('#search').inputValue(), 'pack');
  // Once the person leaves it, the next tick reads the registry.
  await page.locator('h1').click();
  await page.clock.fastForward(31_000);
  await strip(page).locator('strong', { hasText: '1 change ready to apply' }).waitFor();
  assert.equal(await page.locator('#search').inputValue(), 'pack', 'the filter survived the refresh');
});

await test('a settings save refused because the registry moved reads it again and sends the same change once more, once', 'default', {}, async app => {
  const { page } = app;
  await page.getByRole('button', { name: /^Settings/ }).click();
  await page.getByRole('heading', { name: 'Settings', level: 1 }).waitFor();
  await behind(page, () => window.behind.settings({ auto_sync: true }));
  const tail = async n => (await app.calls()).slice(-n).map(c => c.action);
  await page.getByRole('switch', { name: 'Keep running when the window is closed' }).click();
  await page.locator('#toasts').getByText('Saved.').waitFor();
  assert.deepEqual(await tail(3), ['settings', 'snapshot', 'settings'], 'refused, read again, sent again');
  assert.equal(await page.locator('.banner[role=alert]').count(), 0);
  // Refused twice: the person sees it, after exactly one more try.
  await app.flags({ staleSettings: 2 });
  await page.getByRole('switch', { name: 'Automatic sync' }).click();
  await page.locator('.banner[role=alert]').getByText('Registry revision changed').waitFor();
  assert.deepEqual(await tail(3), ['settings', 'snapshot', 'settings']);
  // And the next try, with the registry as it is, goes through.
  await page.getByRole('button', { name: 'Reload' }).click();
  const sent = await count(app, 'settings');
  await page.getByRole('switch', { name: 'Automatic sync' }).click();
  await page.waitForFunction(n => window.calls.filter(c => c.action === 'settings').length > n, sent);
  await page.locator('.busy').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.banner[role=alert]').count(), 0);
});

// ---------- F7: a plugin added from what is installed ----------
await test('Add to my list sends the installation it takes over, and the next check finds it installed', 'unlisted', {}, async app => {
  const { page } = app;
  await page.getByRole('button', { name: 'Add to my list' }).click();
  await page.locator('#toasts').getByText('old-snippets added to your list.').waitFor();
  const save = (await app.calls()).filter(c => c.action === 'save_plugin').at(-1).payload;
  assert.deepEqual(save.adopt, { target_id: 't1', native_id: 'native-old-snippets' });
  await strip(page).getByRole('button', { name: 'Check now' }).click();
  await strip(page).locator('strong', { hasText: 'Everything is in sync' }).waitFor();
  assert.doesNotMatch(await page.locator('#rows').textContent(), /Install/, 'no second copy is planned beside the one that is there');
});

if (failed.length) { console.error(['FAILED:', ...failed.map(f => '  - ' + f)].join('\n')); process.exit(1); }
console.log(JSON.stringify({ status: 'pass', test: 'the window beside the background worker', checks: done }));
