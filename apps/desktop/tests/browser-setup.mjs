// Task 8: the first run, on the fake transport (fake-transport.js): three steps in place of the tabs.
//   MURO_UI_PORT=1433 node apps/desktop/tests/browser-setup.mjs
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { open } from './browser-helper.mjs';

const shots = 'apps/desktop/tests/artifacts';
await mkdir(shots, { recursive: true });
const done = [];
async function test(name, scenario, options, body) {
  const app = await open(scenario, options);
  app.page.setDefaultTimeout(8000);
  try { await body(app); done.push(name); } finally { await app.close(); }
}
const named = (app, ...actions) => app.calls().then(calls => calls.filter(c => actions.includes(c.action)));
const heading = page => page.locator('#setup-title');
const step = (page, n, title) => heading(page).filter({ hasText: title }).waitFor().then(() => page.getByText(`Step ${n} of 3`, { exact: true }).waitFor());
const box = (page, name) => page.getByRole('checkbox', { name });
const button = (page, name) => page.getByRole('button', { name, exact: true });
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const ONE = 'Which coding agents does Muro manage?', TWO = 'Start from what is installed', THREE = 'Keep them in sync by itself?';

/** Step 1 with Claude Code chosen, then Continue: step 2. */
async function toStepTwo(app) {
  await box(app.page, /Claude Code/).check();
  await button(app.page, 'Continue').click();
  await step(app.page, 2, TWO);
}
async function toStepThree(app) {
  await toStepTwo(app);
  await button(app.page, 'Continue').click();
  await step(app.page, 3, THREE);
}

await test('with no harness the three steps take the place of the tabs, and a harness already there never shows them', 'first-run', {}, async app => {
  const { page } = app;
  await step(page, 1, ONE);
  assert.equal(await page.locator('nav').count(), 0, 'no tabs');
  assert.equal(await page.locator('.im-titlebar-status').count(), 0, 'no state button');
  assert.equal(await page.locator('.im-steps li:is([data-im-step="done"],[data-im-step="now"])').count(), 1, 'one bar of three is on');
  assert.deepEqual(await page.getByRole('checkbox').evaluateAll(boxes => boxes.map(b => [b.checked, b.disabled])), [[false, false], [false, false]], 'two harnesses found, nothing chosen for the person');
  assert.match(await page.locator('.im-choice-rows').textContent(), /D:\/config\/claude-code/);
  assert.deepEqual((await app.calls()).map(c => c.action).filter(a => a !== 'snapshot' && a !== 'discover'), [], 'opening the setup changes nothing');
  await page.getByRole('region', { name: ONE }).waitFor();
});

await test('a registry with a harness opens on the tabs, never the setup', 'default', {}, async ({ page }) => {
  await page.locator('nav').waitFor();
  assert.equal(await page.locator('#setup-title').count(), 0);
  assert.equal(await page.locator('nav button[aria-current=page] .label').textContent(), 'Sync');
});

await test('Continue with nothing chosen says so and asks the service nothing', 'first-run', {}, async app => {
  const { page } = app;
  await step(page, 1, ONE);
  await button(page, 'Continue').click();
  await page.getByRole('alert').filter({ hasText: 'Pick at least one harness.' }).waitFor();
  assert.equal(await named(app, 'save_target', 'scan').then(c => c.length), 0);
  await step(page, 1, ONE);
  await box(page, /Codex/).check();
  assert.equal(await page.getByRole('alert').filter({ hasText: 'Pick at least one harness.' }).count(), 0, 'choosing one takes the message away');
});

await test('choosing one harness saves it once and scans; step 2 lists what is installed on it; Back removes nothing', 'first-run', {}, async app => {
  const { page } = app;
  await step(page, 1, ONE);
  await toStepTwo(app);
  const saves = await named(app, 'save_target');
  assert.equal(saves.length, 1, 'one save_target');
  assert.deepEqual({ ...saves[0].payload.target, id: '' }, { id: '', harness: 'claude-code', name: 'Claude Code', root: 'D:/config/claude-code', executable: 'claude-code', enabled: true, exclusive: false });
  assert.equal(saves[0].payload.revision, 1);
  const order = (await app.calls()).map(c => c.action).filter(a => a === 'save_target' || a === 'scan');
  assert.deepEqual(order, ['save_target', 'scan'], 'it saves, then reads what is installed');
  const keep = box(page, /commit-helper/);
  assert.equal(await keep.isChecked(), true, 'kept by default');
  assert.match(await page.locator('.im-choice-rows').textContent(), /Claude Code 2\.1\.0/);
  assert.equal(await page.locator('.im-steps li:is([data-im-step="done"],[data-im-step="now"])').count(), 2);
  await button(page, 'Back').click();
  await step(page, 1, ONE);
  assert.equal(await box(page, /Claude Code/).isChecked(), true, 'still chosen');
  assert.equal(await named(app, 'remove_target').then(c => c.length), 0, 'Back removes nothing');
  await button(page, 'Continue').click();
  await step(page, 2, TWO);
  assert.equal(await named(app, 'save_target').then(c => c.length), 1, 'the harness is not saved twice');
});

await test('a harness ticked off after Back is removed when the person goes on', 'first-run', {}, async app => {
  const { page } = app;
  await toStepTwo(app);
  await button(page, 'Back').click();
  await step(page, 1, ONE);
  await box(page, /Claude Code/).uncheck();
  await box(page, /Codex/).check();
  await button(page, 'Continue').click();
  await step(page, 2, TWO);
  assert.equal(await named(app, 'remove_target').then(c => c.length), 1);
  await page.getByText('Nothing installed yet').waitFor();
});

await test('with every plugin unticked Finish imports nothing, saves the two switches and opens Sync', 'first-run', {}, async app => {
  const { page } = app;
  await toStepTwo(app);
  await box(page, /commit-helper/).uncheck();
  await button(page, 'Continue').click();
  await step(page, 3, THREE);
  const auto = page.getByRole('switch', { name: 'Automatic sync' }), start = page.getByRole('switch', { name: 'Start Muro when Windows starts' });
  assert.equal(await auto.getAttribute('aria-checked'), 'true');
  assert.equal(await start.getAttribute('aria-checked'), 'true');
  await page.getByText('Checks every hour and applies what changed.').waitFor();
  await button(page, 'Finish').click();
  await page.locator('nav').waitFor();
  assert.equal(await page.locator('nav button[aria-current=page] .label').textContent(), 'Sync', 'Sync is current');
  assert.deepEqual(await page.locator('nav button .label').allTextContents(), ['Projects', 'Sync', 'Activity', 'Settings']);
  assert.equal(await page.locator('#setup-title').count(), 0);
  assert.equal(await named(app, 'save_plugin').then(c => c.length), 0, 'nothing imported');
  const [settings] = await named(app, 'settings');
  assert.equal(settings.payload.settings.auto_sync, true);
  assert.equal(settings.payload.settings.interval_minutes, 60);
  assert.deepEqual((await named(app, 'set_autostart')).map(c => c.payload), [{ enabled: true }]);
  await page.getByText('Muro is set up.').waitFor();
  assert.deepEqual(await page.evaluate(() => [sessionStorage.getItem('muro.setup'), sessionStorage.getItem('muro.setup.closed')]), [null, '1'], 'the record is gone and the first run is closed for the session');
  await page.reload();   // the fake starts empty again, but a setup that is done does not come back while the session lasts
  await page.locator('nav').waitFor();
  assert.equal(await page.locator('#setup-title').count(), 0);
  await page.getByText('No harness is managed').waitFor();
});

await test('a plugin that is kept becomes a row of the list, and the switches turned off are what is saved', 'first-run', {}, async app => {
  const { page } = app;
  await toStepThree(app);
  await page.getByRole('switch', { name: 'Automatic sync' }).click();
  assert.equal(await page.getByRole('switch', { name: 'Automatic sync' }).getAttribute('aria-checked'), 'false');
  await page.getByRole('switch', { name: 'Start Muro when Windows starts' }).click();
  await button(page, 'Finish').click();
  await page.locator('nav').waitFor();
  const [plugin] = await named(app, 'save_plugin');
  assert.equal(plugin.payload.plugin.name, 'commit-helper');
  assert.equal(plugin.payload.plugin.source, 'D:/plugins/commit-helper');
  assert.deepEqual(plugin.payload.plugin.distributions, [{ harness: 'claude-code', path: 'D:/plugins/commit-helper', version: '2.1.0' }]);
  assert.equal((await named(app, 'settings'))[0].payload.settings.auto_sync, false);
  assert.deepEqual((await named(app, 'set_autostart')).map(c => c.payload), [{ enabled: false }]);
  await page.locator('#rows').getByText('commit-helper', { exact: true }).waitFor();
});

await test('a failure stays in its step, announced, and loses nothing the person chose', 'first-run', {}, async app => {
  const { page } = app;
  await step(page, 1, ONE);
  await box(page, /Claude Code/).check();
  await box(page, /Codex/).check();
  await app.flags({ rejectSave: true });
  await button(page, 'Continue').click();
  const alert = page.locator('#setup-error');
  await alert.filter({ hasText: 'Version conflict: reload registry' }).waitFor();
  assert.equal(await alert.getAttribute('role'), 'alert');
  assert.match(await heading(page).getAttribute('aria-describedby'), /setup-error/, 'the message is tied to the step');
  await step(page, 1, ONE);
  assert.equal(await box(page, /Claude Code/).isChecked(), true);
  assert.equal(await box(page, /Codex/).isChecked(), true);
  assert.equal(await page.locator('.im-banner').count(), 0, 'not a banner of the app');
  await page.screenshot({ path: shots + '/setup-error.png' });
  await app.flags({ rejectSave: false });
  await button(page, 'Continue').click();
  await step(page, 2, TWO);
  assert.equal(await page.locator('#setup-error').textContent(), '', 'the message goes with the step');
  await button(page, 'Continue').click();
  await step(page, 3, THREE);
  await page.getByRole('switch', { name: 'Automatic sync' }).click();
  await app.flags({ rejectSettings: true });
  await button(page, 'Finish').click();
  await page.locator('#setup-error').filter({ hasText: 'Version conflict: settings not saved' }).waitFor();
  await step(page, 3, THREE);
  assert.equal(await page.getByRole('switch', { name: 'Automatic sync' }).getAttribute('aria-checked'), 'false', 'the switch is as the person left it');
  assert.equal(await page.locator('nav').count(), 0, 'still the setup');
  await app.flags({ rejectSettings: false });
  await button(page, 'Finish').click();
  await page.locator('nav').waitFor();
  assert.equal(await named(app, 'save_plugin').then(c => c.length), 1, 'the retry does not import the plugin again');
  assert.equal((await named(app, 'settings')).at(-1).payload.settings.auto_sync, false);
});

await test('where the shell cannot start with Windows the second switch is disabled and says why', 'first-run', {}, async app => {
  const { page } = app;
  await app.flags({ autostartUnsupported: true });
  await toStepThree(app);
  const start = page.getByRole('switch', { name: 'Start Muro when Windows starts' });
  assert.equal(await start.isDisabled(), true);
  assert.equal(await start.getAttribute('aria-checked'), 'false');
  await page.getByText('Available on Windows', { exact: true }).waitFor();
  assert.equal(await page.getByRole('switch', { name: 'Automatic sync' }).isDisabled(), false);
  await page.screenshot({ path: shots + '/setup-3-unsupported.png' });
  await button(page, 'Finish').click();
  await page.locator('nav').waitFor();
  assert.equal(await named(app, 'set_autostart').then(c => c.length), 0);
  assert.equal(await named(app, 'settings').then(c => c.length), 1);
});

await test('the setup survives a reload of the page, on the step and with what was chosen', 'first-run', {}, async app => {
  const { page } = app;
  await step(page, 1, ONE);
  await box(page, /Codex/).check();
  await page.reload();
  await step(page, 1, ONE);
  assert.equal(await box(page, /Codex/).isChecked(), true, 'a choice survives the reload');
  assert.equal(await box(page, /Claude Code/).isChecked(), false);
  await button(page, 'Continue').click();
  await step(page, 2, TWO);
  await button(page, 'Continue').click();
  await step(page, 3, THREE);
  await page.getByRole('switch', { name: 'Automatic sync' }).click();
  await page.reload();
  await step(page, 3, THREE);
  assert.equal(await page.getByRole('switch', { name: 'Automatic sync' }).getAttribute('aria-checked'), 'false', 'the step and the switch come back');
  await button(page, 'Back').click();
  await step(page, 2, TWO);
});

await test('the keyboard does it all: Space ticks, Enter moves on, focus follows the step, a switch is a button', 'first-run', {}, async app => {
  const { page } = app;
  await step(page, 1, ONE);
  await box(page, /Claude Code/).focus();
  await page.keyboard.press('Space');
  assert.equal(await box(page, /Claude Code/).isChecked(), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.closest('label')?.textContent), 'CXCodexD:/config/codex', 'Tab reaches the next harness');
  await button(page, 'Continue').focus();
  await page.keyboard.press('Enter');
  await step(page, 2, TWO);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'setup-title', 'the new step is read first');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.closest('label')?.textContent?.includes('commit-helper')), true, 'then its first control');
  await button(page, 'Continue').focus();
  await page.keyboard.press('Enter');
  await step(page, 3, THREE);
  const auto = page.getByRole('switch', { name: 'Automatic sync' });
  await auto.focus();
  await page.keyboard.press('Space');
  assert.equal(await auto.getAttribute('aria-checked'), 'false');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Automatic sync', 'the switch keeps the focus after it changes');
});

/** Paints `frame` for a state the fake cannot produce (the page is mounted, nothing re-renders it): what the setup shows around a harness Muro cannot manage, and for nothing found. */
async function paint(page, discovered, setup) {
  await page.evaluate(async ({ discovered, setup }) => {
    const { frame } = await import('/src/views.ts');
    const snapshot = { registry: { schema: 1, revision: 1, plugins: [], targets: [], settings: { auto_sync: false, interval_minutes: 60, close_to_tray: true, agent: 'claude-code', python: 'python', factory_path: '' } }, inventory: [], activity: [], sync: { last_check: null, last_sync: null, revision: null, pending: null, blockers: null, targets: {} } };
    const state = { page: 'sync', snapshot, discovered, discovering: false, plan: null, checking: false, applying: null, review: null, query: '', filter: 'all', afilter: 'all', busy: null, error: null, checkErrors: [], discoveryError: null, maintenance: null, autostart: null, setup };
    document.querySelector('#app').innerHTML = frame(state);
  }, { discovered, setup });
}
const harness = (harness, name, extra = {}) => ({ harness, name, executable: harness, version: '1.0.0', config_root: `D:/config/${harness}`, available: true, supported: true, ...extra });

await test('a harness that cannot be picked is dimmed, says why and cannot be ticked; with nothing to pick the person can set up later', 'first-run', {}, async ({ page }) => {
  await step(page, 1, ONE);
  await paint(page, [harness('claude-code', 'Claude Code'), harness('deepseek', 'DeepSeek', { supported: false }), harness('pi', 'Pi', { config_root: null })], { step: 1, pick: { 'claude-code': true }, keep: {}, auto: true, autostart: true });
  assert.deepEqual(await page.getByRole('checkbox').evaluateAll(boxes => boxes.map(b => b.disabled)), [false, true, true]);
  await page.getByText('Plugins are not supported yet', { exact: true }).waitFor();
  await page.getByText('Add it by hand from Sync, with its configuration folder', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Set up later' }).count(), 0, 'something can be picked');
  await page.screenshot({ path: shots + '/setup-limits.png' });
  await paint(page, [harness('deepseek', 'DeepSeek', { supported: false })], { step: 1, pick: {}, keep: {}, auto: true, autostart: true });
  await page.getByRole('button', { name: 'Set up later', exact: true }).waitFor();
  await page.screenshot({ path: shots + '/setup-nothing-to-pick.png' });
  await paint(page, [], { step: 1, pick: {}, keep: {}, auto: true, autostart: true });
  await page.getByText('No harness found', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Look again', exact: true }).waitFor();
  await page.screenshot({ path: shots + '/setup-none-found.png' });
});

await test('the three steps in the dark theme', 'first-run', { viewport: { width: 1100, height: 760 } }, async app => {
  const { page } = app;
  await step(page, 1, ONE);
  await box(page, /Claude Code/).check();
  await page.screenshot({ path: shots + '/setup-1-dark.png' });
  await button(page, 'Continue').click();
  await step(page, 2, TWO);
  await page.screenshot({ path: shots + '/setup-2-dark.png' });
  await button(page, 'Continue').click();
  await step(page, 3, THREE);
  await page.screenshot({ path: shots + '/setup-3-dark.png' });
});

await test('the three steps in the light theme', 'first-run', { colorScheme: 'light', viewport: { width: 1100, height: 760 } }, async app => {
  const { page } = app;
  await step(page, 1, ONE);
  await box(page, /Claude Code/).check();
  await page.screenshot({ path: shots + '/setup-1-light.png' });
  await button(page, 'Continue').click();
  await step(page, 2, TWO);
  await page.screenshot({ path: shots + '/setup-2-light.png' });
  await button(page, 'Continue').click();
  await step(page, 3, THREE);
  await page.screenshot({ path: shots + '/setup-3-light.png' });
});

await test('on a long list the footer of the step stays in the window and Continue works from where the list starts', 'first-run', { viewport: { width: 1100, height: 520 } }, async app => {
  const { page } = app;
  await toStepTwo(app);
  // The fake has one plugin installed: forty more rows of its kind make the step taller than the window.
  await page.evaluate(() => { const list = document.querySelector('.im-choice-rows'), row = list.querySelector('li'); for (let i = 0; i < 40; i++) list.append(row.cloneNode(true)); });
  const geometry = () => page.evaluate(() => {
    const main = document.getElementById('main'), foot = document.querySelector('.im-wizard-actions').getBoundingClientRect(), last = document.querySelector('.im-choice-rows li:last-child').getBoundingClientRect();
    return { scrollable: main.scrollHeight > main.clientHeight + 200, footTop: foot.top, footBottom: foot.bottom, lastBottom: last.bottom, height: window.innerHeight };
  });
  const scrollTo = top => page.evaluate(y => document.getElementById('main').scrollTo(0, y), top);
  for (const [where, top] of [['at the start', 0], ['in the middle', 600], ['at the end', 1e6]]) {
    await scrollTo(top);
    const g = await geometry();
    assert.ok(g.scrollable, 'the step is taller than the window');
    assert.ok(g.footBottom <= g.height + 1 && g.footTop >= 0, `the footer is in the window ${where}: ${JSON.stringify(g)}`);
    if (top === 1e6) assert.ok(g.lastBottom <= g.footTop + 1, `the last row is not left under the footer: ${JSON.stringify(g)}`);
    if (top === 600) await page.screenshot({ path: shots + '/setup-2-long.png' });
  }
  await scrollTo(0);
  await button(page, 'Continue').click();
  await step(page, 3, THREE);
});

await test('no sideways scroll on a narrow window, and the card fits', 'first-run', { viewport: { width: 400, height: 800 } }, async app => {
  const { page } = app;
  await step(page, 1, ONE);
  assert.ok(await sideways(page) <= 0, 'step 1');
  await page.screenshot({ path: shots + '/setup-1-narrow.png' });
  await toStepTwo(app);
  assert.ok(await sideways(page) <= 0, 'step 2');
  await button(page, 'Continue').click();
  await step(page, 3, THREE);
  assert.ok(await sideways(page) <= 0, 'step 3');
  await page.screenshot({ path: shots + '/setup-3-narrow.png' });
});

console.log('PASS: ' + done.join('; '));
