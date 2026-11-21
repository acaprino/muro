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
const strip = page => page.locator('#sync-state');   // the note: what the last check found
const bar = page => page.locator('.im-actions');
const labels = loc => loc.locator('button').evaluateAll(buttons => buttons.map(b => b.querySelector('span').textContent));   // the words of the buttons, not their key caps
const status = page => page.locator('.im-status');
const foot = page => page.locator('.im-footer');
const title = page => strip(page).locator('b').first().textContent();
const count = async (app, action) => (await app.calls()).filter(c => c.action === action).length;
const focus = page => page.evaluate(() => window.dispatchEvent(new Event('focus')));
const behind = (page, change) => page.evaluate(change);

// ---------- F1: the recorded check shows on open ----------
await test('a check the window did not make shows on open: its count, Review and Apply all', 'recorded', {}, async app => {
  const { page } = app;
  await strip(page).locator('b', { hasText: '1 change ready to apply' }).waitFor();
  assert.deepEqual(await labels(bar(page)), ['Check now', 'Review', 'Apply all 1 change']);
  assert.equal(await strip(page).locator('span').first().textContent(), 'Nothing changes until you apply.', 'no breakdown, no leading full stop');
  assert.match(await status(page).textContent(), /Last check\s*(today|yesterday)/);
  assert.match(await status(page).textContent(), /1 change waiting/);
  assert.equal(await page.locator('nav button', { hasText: 'Sync' }).locator('.im-count').textContent(), '1', 'the tab badge agrees');
  assert.match(await page.locator('#rows td').nth(2).textContent(), /Update 1 → 2/, 'the cells are the snapshot\'s');
  assert.equal(await page.getByText('Not checked yet').count(), 0);
  assert.deepEqual((await app.calls()).map(c => c.action).filter(a => a === 'plan' || a === 'check'), [], 'opening checks nothing');
  // Review plans again before it shows anything.
  await bar(page).getByRole('button', { name: 'Review' }).click();
  await page.locator('dialog[open]').waitFor();
  assert.equal(await count(app, 'plan'), 1);
});

await test('a recorded check with nothing to do is Everything is in sync, and its columns agree', 'recorded-ok', {}, async ({ page }) => {
  await strip(page).locator('b', { hasText: 'Everything is in sync' }).waitFor();
  assert.match(await page.locator('th .im-cell-meta').last().textContent(), /In sync/);
  assert.match(await status(page).textContent(), /In sync/);
});

await test('a column the record cannot describe says to check, never In sync', 'recorded-unseen', {}, async app => {
  const { page } = app;
  await strip(page).locator('b', { hasText: '1 change ready to apply' }).waitFor();
  const column = page.locator('th .im-cell-meta').last();
  assert.match(await column.textContent(), /Check to see the changes/);
  assert.doesNotMatch(await column.textContent(), /In sync/);
  await bar(page).getByRole('button', { name: 'Check now' }).click();
  await column.getByRole('button', { name: 'Sync 1 change' }).waitFor();
  assert.doesNotMatch(await column.textContent(), /Check to see/, 'the plan shows what the column holds');
});

// ---------- F5: a source the last check could not resolve ----------
await test('a source the last check could not resolve is not in sync, and a clean check says so', 'recorded-errors', {}, async app => {
  const { page } = app;
  await strip(page).locator('b', { hasText: '1 source could not be checked' }).waitFor();
  assert.doesNotMatch(await strip(page).textContent(), /Everything is in sync/);
  assert.match(await status(page).textContent(), /Sources not checked/);
  assert.deepEqual(await labels(bar(page)), ['Check now']);
  assert.match(await bar(page).getByRole('button', { name: 'Check now' }).getAttribute('class'), /primary/, 'Check now leads');
  await app.flags({ checkErrors: true });
  await bar(page).getByRole('button', { name: 'Check now' }).click();
  await page.locator('#main .im-note').filter({ hasText: 'Source unreachable' }).waitFor();
  assert.equal(await title(page), '1 source could not be checked', 'the check found it again');
  await app.flags({ checkErrors: false });
  await bar(page).getByRole('button', { name: 'Check now' }).click();
  await strip(page).locator('b', { hasText: 'Everything is in sync' }).waitFor();
  assert.equal(await page.locator('.im-notice-word').count(), 0);
});

// ---------- F4: the window follows the registry ----------
await test('the window reads the registry again when it gets the focus, and asks for no plan', 'changes', { clock: true }, async app => {
  const { page } = app;
  await foot(page).getByText('Automatic sync off').waitFor();
  assert.equal(await page.evaluate(() => document.hasFocus()), true, 'the premise: this page has the focus');
  const before = await count(app, 'snapshot');
  await behind(page, () => window.behind.settings({ auto_sync: true }));
  await focus(page);
  await status(page).getByText('next check').waitFor();
  assert.equal(await count(app, 'snapshot'), before + 1);
  assert.equal(await count(app, 'plan'), 0, 'a refresh asks for no plan');
  // The save that failed with "Registry revision changed" before now goes through, over what the worker saved.
  await page.getByRole('tab', { name: /^Settings/ }).click();
  await page.getByRole('switch', { name: 'Keep running when the window is closed' }).click();
  await page.locator('[data-im-notices]').getByText('Saved.').waitFor();
  const save = (await app.calls()).filter(c => c.action === 'settings').at(-1).payload;
  assert.equal(save.revision, 2);
  assert.deepEqual([save.settings.auto_sync, save.settings.close_to_tray], [true, false], 'what the worker saved is kept');
  assert.equal(await page.locator('.im-notice-word').count(), 0);
});

await test('the shell telling the window it was shown again reads the registry again, and asks for no plan', 'changes', {}, async app => {
  const { page } = app;
  await foot(page).getByText('Automatic sync off').waitFor();
  const before = await count(app, 'snapshot');
  await behind(page, () => window.behind.settings({ auto_sync: true }));
  await page.evaluate(() => window.shown());
  await status(page).getByText('next check').waitFor();
  assert.equal(await count(app, 'snapshot'), before + 1);
  assert.equal(await count(app, 'plan'), 0);
});

await test('an operation shows its loader in the status row only after 300 ms: a quick one shows nothing', 'changes', { clock: true }, async app => {
  const { page } = app;
  await strip(page).getByText('Not checked yet').waitFor();
  await page.getByRole('button', { name: 'Check now', exact: true }).click();
  await strip(page).locator('b', { hasText: '1 change ready to apply' }).waitFor();
  await page.clock.pauseAt(new Date(Date.now() + 1_000));
  await app.flags({ planDelay: 100 });
  await bar(page).getByRole('button', { name: 'Review' }).click();
  await page.clock.fastForward(50);
  assert.equal(await page.locator('.im-status .im-loader').count(), 0, 'nothing under 300 ms');
  await page.clock.fastForward(100);
  await page.locator('dialog[open]').waitFor();
  assert.equal(await page.locator('.im-status .im-loader').count(), 0, 'a run that answered in 100 ms never showed one');
  await page.keyboard.press('Escape');
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  await app.flags({ planDelay: 2_000 });
  await bar(page).getByRole('button', { name: 'Review' }).click();
  await page.clock.fastForward(200);
  assert.equal(await page.locator('.im-status .im-loader').count(), 0, 'still nothing at 200 ms');
  await page.clock.fastForward(200);
  await page.locator('.im-status .im-loader').waitFor();
  assert.match(await page.locator('.im-status .im-loader').textContent(), /Comparing with what is installed/, 'the loader says what runs');
  assert.equal(await page.locator('#main > .im-panel-body > .im-loader').count(), 0, 'and it is not in the content');
  await page.clock.fastForward(2_000);
  await page.locator('dialog[open]').waitFor();
  assert.equal(await page.locator('.im-status .im-loader').count(), 0, 'it goes when the run ends');
});

await test('the scroll of the content is kept when the window reads the registry again', 'changes', { clock: true, viewport: { width: 1100, height: 320 } }, async app => {
  const { page } = app;
  await strip(page).getByText('Not checked yet').waitFor();
  const body = '#main > .im-panel-body';
  await page.evaluate(selector => document.querySelector(selector).scrollTo(0, 120), body);
  const before = await page.evaluate(selector => document.querySelector(selector).scrollTop, body);
  assert.ok(before > 0, 'the page is taller than the window and was scrolled');
  await page.clock.pauseAt(new Date(Date.now() + 2_000));
  await behind(page, () => window.behind.check());
  await page.clock.fastForward(35_000);
  await strip(page).locator('b', { hasText: '1 change ready to apply' }).waitFor();
  assert.equal(await page.evaluate(selector => document.querySelector(selector).scrollTop, body), before, 'the refresh keeps the scroll of the content panel');
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
  await strip(page).locator('b', { hasText: '1 change ready to apply' }).waitFor();
  assert.match(await status(page).textContent(), /Last check\s*today/);
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
  await strip(page).locator('b', { hasText: '1 change ready to apply' }).waitFor();
  assert.equal(await page.locator('#search').inputValue(), 'pack', 'the filter survived the refresh');
});

await test('a settings save refused because the registry moved reads it again and sends the same change once more, once', 'default', {}, async app => {
  const { page } = app;
  await page.getByRole('tab', { name: /^Settings/ }).click();
  await page.getByRole('heading', { name: 'Settings', level: 1 }).waitFor();
  await behind(page, () => window.behind.settings({ auto_sync: true }));
  const tail = async n => (await app.calls()).slice(-n).map(c => c.action);
  await page.getByRole('switch', { name: 'Keep running when the window is closed' }).click();
  await page.locator('[data-im-notices]').getByText('Saved.').waitFor();
  assert.deepEqual(await tail(3), ['settings', 'snapshot', 'settings'], 'refused, read again, sent again');
  assert.equal(await page.locator('.im-notice-word').count(), 0);
  // Refused twice: the person sees it, after exactly one more try.
  await app.flags({ staleSettings: 2 });
  await page.getByRole('switch', { name: 'Automatic sync' }).click();
  await page.locator('.im-notice-text').getByText('Registry revision changed').waitFor();
  assert.deepEqual(await tail(3), ['settings', 'snapshot', 'settings']);
  // And the next try, with the registry as it is, goes through.
  await page.getByRole('button', { name: 'Reload' }).click();
  const sent = await count(app, 'settings');
  await page.getByRole('switch', { name: 'Automatic sync' }).click();
  await page.waitForFunction(n => window.calls.filter(c => c.action === 'settings').length > n, sent);
  await page.locator('.im-loader').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.im-notice-word').count(), 0);
});

// ---------- F7: a plugin added from what is installed ----------
await test('Add to my list sends the installation it takes over, and the next check finds it installed', 'unlisted', {}, async app => {
  const { page } = app;
  await page.getByRole('button', { name: 'Add to my list' }).click();
  await page.locator('[data-im-notices]').getByText('old-snippets added to your list.').waitFor();
  const save = (await app.calls()).filter(c => c.action === 'save_plugin').at(-1).payload;
  assert.deepEqual(save.adopt, { target_id: 't1', native_id: 'native-old-snippets' });
  await bar(page).getByRole('button', { name: 'Check now' }).click();
  await strip(page).locator('b', { hasText: 'Everything is in sync' }).waitFor();
  assert.doesNotMatch(await page.locator('#rows').textContent(), /Install/, 'no second copy is planned beside the one that is there');
});

if (failed.length) { console.error(['FAILED:', ...failed.map(f => '  - ' + f)].join('\n')); process.exit(1); }
console.log(JSON.stringify({ status: 'pass', test: 'the window beside the background worker', checks: done }));
