// Task 7: the Settings page (saved on change) and the Activity page, on the fake transport (fake-transport.js).
//   MURO_UI_PORT=1432 node apps/desktop/tests/browser-settings.mjs
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { open } from './browser-helper.mjs';

const shots = 'apps/desktop/tests/artifacts';
await mkdir(shots, { recursive: true });
const done = [];
async function test(name, scenario, options, body) {
  const app = await open(scenario, options);
  try { await app.page.locator('nav').waitFor(); await body(app); done.push(name); } finally { await app.close(); }
}
const AI = { engine: 'harness', harness: 'claude-code', budget_usd: 0.5, api_base: 'https://api.openai.com/v1', model: '', api_key_env: 'MURO_API_KEY' };
const STORED = { auto_sync: false, interval_minutes: 60, close_to_tray: true, agent: 'claude-code', python: 'python', factory_path: '', ai: AI };
const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const calls = async (app, ...actions) => (await app.calls()).filter(c => actions.includes(c.action));
const saves = async app => (await calls(app, 'settings')).map(c => c.payload);
const tab = (page, name) => page.locator('nav').getByRole('tab', { name: new RegExp('^' + name) });
/** A row of the page, found by its title. */
const row = (page, title) => page.locator('.im-setting-row').filter({ has: page.locator('strong').filter({ hasText: new RegExp('^' + escapeRe(title) + '$') }) });
const hint = (page, title) => row(page, title).locator('small');
const switchOf = (page, label) => page.getByRole('switch', { name: label, exact: true });
const AUTO = 'Automatic sync', TRAY = 'Keep running when the window is closed', START = 'Start Muro when Windows starts';
async function openSettings(page) {
  await tab(page, 'Settings').click();
  await page.getByRole('heading', { name: 'Settings', level: 1 }).waitFor();
  // `autostart` is read when the page opens: the switch is disabled until it is known.
  await page.waitForFunction(label => { const s = document.querySelector(`[aria-label="${label}"]`); return !!s && (!s.disabled || s.closest('.im-setting-row').textContent.includes('Available on Windows')); }, START);
}
async function openActivity(page) {
  await tab(page, 'Activity').click();
  await page.getByRole('heading', { name: 'Activity', level: 1 }).waitFor();
}
const checked = async (page, label) => (await switchOf(page, label).getAttribute('aria-checked')) === 'true';
const waitSwitch = (page, label, on) => page.locator(`[role=switch][aria-label="${label}"][aria-checked="${on}"]`).waitFor();
const bannerText = page => page.locator('.im-banner[role=alert]').allTextContents();
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const titles = page => page.locator('ul.im-activity-list li strong').allTextContents();

await test('Settings: five sections, saved on change, no Save button', 'default', {}, async app => {
  const { page } = app;
  await openSettings(page);
  assert.deepEqual(await page.locator('section.im-settings > h2').allTextContents(), ['Sync', 'Background', 'Appearance', 'AI', 'Maintenance']);
  assert.equal(await page.getByRole('button', { name: /save/i }).count(), 0, 'there is no Save button');
  assert.equal(await page.getByText('Saved as you change them.').count(), 1);
  assert.equal((await calls(app, 'autostart')).length, 1, 'autostart is read once when the page opens');
  assert.deepEqual((await saves(app)), [], 'opening the page saves nothing');
  assert.equal(await page.getByRole('radio', { name: 'System' }).isChecked(), true, 'the theme starts on System');
  assert.equal(await page.getByRole('radio', { name: 'Coding agent on this computer' }).isChecked(), true, 'the engine starts on a coding agent');
  assert.equal(await page.getByRole('combobox', { name: 'Coding agent' }).inputValue(), 'claude-code');
  assert.equal(await page.getByRole('textbox', { name: 'Python' }).inputValue(), 'python');
  assert.equal(await page.getByRole('textbox', { name: 'Muro factory folder' }).getAttribute('placeholder'), 'Built in');
});

await test('each switch saves once, with only its own field changed', 'default', {}, async app => {
  const { page } = app;
  await openSettings(page);
  await switchOf(page, AUTO).click();
  await waitSwitch(page, AUTO, true);
  assert.deepEqual(await saves(app), [{ revision: 1, settings: { ...STORED, auto_sync: true } }]);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), AUTO, 'the focus is on the switch again');
  await switchOf(page, TRAY).click();
  await waitSwitch(page, TRAY, false);
  assert.deepEqual(await saves(app), [{ revision: 1, settings: { ...STORED, auto_sync: true } }, { revision: 2, settings: { ...STORED, auto_sync: true, close_to_tray: false } }]);
  // The keyboard works the same: Space on the focused switch.
  await switchOf(page, TRAY).focus();
  await page.keyboard.press('Space');
  await waitSwitch(page, TRAY, true);
  assert.equal((await saves(app)).length, 3);
  assert.equal((await calls(app, 'set_autostart')).length, 0, 'these switches never touch Start with Windows');
});

await test('a stored interval of 45 minutes stays 45 after another setting is saved', 'stored-settings', {}, async app => {
  const { page } = app;
  await openSettings(page);
  const interval = page.getByRole('combobox', { name: 'Check interval' });
  assert.equal(await interval.inputValue(), '45');
  assert.equal(await interval.locator('option:checked').textContent(), 'Every 45 minutes');
  assert.deepEqual(await interval.locator('option').allTextContents(), ['Every 15 minutes', 'Every 30 minutes', 'Every 45 minutes', 'Every hour', 'Every 3 hours', 'Every 12 hours', 'Once a day']);
  await switchOf(page, TRAY).click();
  await waitSwitch(page, TRAY, false);
  assert.equal((await saves(app))[0].settings.interval_minutes, 45, 'the stored 45 is sent back as it was');
  assert.equal(await interval.inputValue(), '45');
  await interval.selectOption('180');
  await page.waitForFunction(() => window.calls.filter(c => c.action === 'settings').length === 2);
  assert.equal((await saves(app))[1].settings.interval_minutes, 180);
  assert.equal(await page.getByRole('combobox', { name: 'Check interval' }).inputValue(), '180');
});

await test('the interval is used only when automatic sync is on', 'default', {}, async app => {
  const { page } = app;
  await openSettings(page);
  const interval = page.getByRole('combobox', { name: 'Check interval' });
  assert.equal(await interval.isDisabled(), true);
  assert.equal(await hint(page, 'Check').textContent(), 'Used when automatic sync is on.');
  await switchOf(page, AUTO).click();
  await waitSwitch(page, AUTO, true);
  assert.equal(await interval.isDisabled(), false);
  assert.equal(await row(page, 'Check').locator('small').count(), 0, 'no hint once it is used');
});

await test('an interval outside 1 to 1440 is refused where it enters, and the control is restored', 'stored-settings', {}, async app => {
  const { page } = app;
  await openSettings(page);
  const interval = page.getByRole('combobox', { name: 'Check interval' });
  for (const bad of ['0', '1441', '5000', '-5', '1.5', 'abc']) {
    await interval.evaluate((el, value) => { el.add(new Option('Injected', value)); }, bad);
    await interval.selectOption(bad);
    await page.locator('.im-banner[role=alert]').getByText('The interval goes from 1 to 1440 minutes.').waitFor();
    assert.equal(await page.getByRole('combobox', { name: 'Check interval' }).inputValue(), '45', `${bad} is not kept`);
    assert.deepEqual(await saves(app), [], `${bad} was never sent`);
  }
});

await test('Start Muro when Windows starts: on also switches automatic sync on, off leaves it', 'default', {}, async app => {
  const { page } = app;
  await openSettings(page);
  const BASE = 'Starts in the notification area and keeps your harnesses in line with your list.';
  assert.equal(await switchOf(page, START).isEnabled(), true);
  assert.equal(await checked(page, START), false);
  assert.equal(await hint(page, START).textContent(), BASE);
  await switchOf(page, START).click();
  await waitSwitch(page, START, true);
  await waitSwitch(page, AUTO, true);
  const made = await calls(app, 'set_autostart', 'settings');
  assert.deepEqual(made.map(c => c.action), ['set_autostart', 'settings'], 'one set_autostart, then one settings save');
  assert.deepEqual(made[0].payload, { enabled: true });
  assert.deepEqual(made[1].payload, { revision: 1, settings: { ...STORED, auto_sync: true } });
  assert.equal(await hint(page, START).textContent(), BASE);
  // Automatic sync switched off by hand: Muro still starts, and the row says what that means.
  await switchOf(page, AUTO).click();
  await waitSwitch(page, AUTO, false);
  assert.equal(await hint(page, START).textContent(), 'Automatic sync is off: Muro starts and watches, but applies changes only when you ask.');
  assert.equal(await row(page, START).locator('small .im-text-warn').count(), 1, 'the hint is a warning');
  // Off: set_autostart alone, and automatic sync stays as it is.
  const before = (await saves(app)).length;
  await switchOf(page, START).click();
  await waitSwitch(page, START, false);
  assert.deepEqual((await calls(app, 'set_autostart')).map(c => c.payload), [{ enabled: true }, { enabled: false }]);
  assert.equal((await saves(app)).length, before, 'switching it off saves no setting');
  assert.equal(await checked(page, AUTO), false, 'automatic sync is as it was');
});

await test('Start Muro when Windows starts, with automatic sync already on, saves no setting', 'stored-settings', {}, async app => {
  const { page } = app;
  await openSettings(page);
  await switchOf(page, START).click();
  await waitSwitch(page, START, true);
  assert.deepEqual((await calls(app, 'set_autostart', 'settings')).map(c => c.action), ['set_autostart']);
});

await test('where Start with Windows is not available the switch is disabled and says so', 'default', {}, async app => {
  const { page } = app;
  await app.flags({ autostartUnsupported: true });
  await openSettings(page);
  assert.equal(await switchOf(page, START).isDisabled(), true);
  assert.equal(await hint(page, START).textContent(), 'Available on Windows');
  assert.equal((await calls(app, 'set_autostart')).length, 0);
});

await test('Keep running when the window is closed: off shows its warning', 'default', {}, async app => {
  const { page } = app;
  await openSettings(page);
  assert.equal(await checked(page, TRAY), true);
  assert.equal(await hint(page, TRAY).textContent(), 'Closing the window leaves Muro in the notification area. Quit from its icon there.');
  assert.equal(await row(page, TRAY).locator('small .im-text-warn').count(), 0);
  await switchOf(page, TRAY).click();
  await waitSwitch(page, TRAY, false);
  assert.equal(await hint(page, TRAY).textContent(), 'Closing the window quits Muro: nothing syncs until you open it again.');
  assert.equal(await row(page, TRAY).locator('small .im-text-warn').count(), 1, 'the hint is a warning');
});

await test('a rejected save leaves the control as it was and shows the error', 'default', {}, async app => {
  const { page } = app;
  await openSettings(page);
  await app.flags({ rejectSettings: true });
  await switchOf(page, AUTO).click();
  await page.locator('.im-banner[role=alert]').getByText('Version conflict: settings not saved').waitFor();
  assert.equal(await checked(page, AUTO), false, 'the switch is as it was');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), AUTO, 'and keeps the focus');
  // A text box too: what was typed goes back to what is stored.
  const python = page.getByRole('textbox', { name: 'Python' });
  await python.fill('python3');
  await python.blur();
  await page.waitForFunction(() => window.calls.filter(c => c.action === 'settings').length === 2);
  await page.waitForFunction(() => document.querySelector('input[name=python]').value === 'python');
  assert.equal(await python.inputValue(), 'python');
  assert.equal(await switchOf(page, TRAY).isEnabled(), true, 'the page is usable again');
  // The next save, once the cause is gone, works and clears the error.
  await app.flags({ rejectSettings: false });
  await switchOf(page, AUTO).click();
  await waitSwitch(page, AUTO, true);
  assert.deepEqual(await bannerText(page), [], 'the error is gone');
});

await test('Python and the factory folder are saved when they are left, trimmed', 'default', {}, async app => {
  const { page } = app;
  await openSettings(page);
  const python = page.getByRole('textbox', { name: 'Python' }), factory = page.getByRole('textbox', { name: 'Muro factory folder' });
  await python.fill('  C:/Tools/Python 3/python.exe  ');
  assert.deepEqual(await saves(app), [], 'typing saves nothing');
  await python.blur();
  await page.waitForFunction(() => window.calls.some(c => c.action === 'settings'));
  assert.deepEqual(await saves(app), [{ revision: 1, settings: { ...STORED, python: 'C:/Tools/Python 3/python.exe' } }]);
  await factory.fill('D:/Muro');
  await factory.blur();
  await page.waitForFunction(() => window.calls.filter(c => c.action === 'settings').length === 2);
  assert.equal((await saves(app))[1].settings.factory_path, 'D:/Muro');
  await factory.fill('');
  await factory.blur();
  await page.waitForFunction(() => window.calls.filter(c => c.action === 'settings').length === 3);
  assert.equal((await saves(app))[2].settings.factory_path, '', 'empty means the built-in factory');
  // An empty Python is no value: it is refused where it enters and the stored one comes back.
  await python.fill('   ');
  await python.blur();
  await page.locator('.im-banner[role=alert]').getByText('Enter the Python command or its full path.').waitFor();
  assert.equal((await saves(app)).length, 3, 'it was never sent');
  assert.equal(await python.inputValue(), 'C:/Tools/Python 3/python.exe');
});

await test('a value that is not changed saves nothing', 'default', {}, async app => {
  const { page } = app;
  await openSettings(page);
  const python = page.getByRole('textbox', { name: 'Python' });
  await python.focus();
  await python.fill('python ');
  await python.blur();
  await page.getByRole('radio', { name: 'Light' }).check({ force: true });
  await page.waitForFunction(() => document.documentElement.dataset.imTheme === 'light');
  assert.deepEqual(await saves(app), [], 'trimmed to the stored value, and a theme is not a registry setting');
});

await test('a settings save keeps the last plan: no new plan, the strip stays, Apply all still works', 'changes', {}, async app => {
  const { page } = app;
  await page.getByRole('button', { name: 'Check now', exact: true }).click();
  await page.locator('section.im-summary strong', { hasText: '1 change ready to apply' }).waitFor();
  const meta = async n => page.locator('section.im-summary .im-summary-meta span').nth(n).textContent();
  const [lastCheck, lastSync] = [await meta(0), await meta(1)];
  const before = (await app.calls()).length;
  await openSettings(page);
  await switchOf(page, TRAY).click();
  await waitSwitch(page, TRAY, false);
  await switchOf(page, AUTO).click();
  await waitSwitch(page, AUTO, true);
  assert.deepEqual((await app.calls()).slice(before).map(c => c.action), ['autostart', 'settings', 'settings'], 'no plan, no check, no snapshot after a save');
  await tab(page, 'Sync').click();
  await page.locator('section.im-summary strong', { hasText: '1 change ready to apply' }).waitFor();
  assert.equal(await page.locator('section.im-summary button', { hasText: 'Apply all 1 change' }).count(), 1);
  assert.match(await meta(2), /^Next check/, 'the strip reads the new setting');
  assert.equal(await meta(0), lastCheck, 'Last check is as it was');
  assert.equal(await meta(1), lastSync, 'and so is Last sync');
  await page.getByRole('button', { name: 'Apply all 1 change' }).click();
  await page.locator('[data-im-notices]').getByText('1 change applied.').waitFor();
  assert.equal(await page.locator('section.im-summary strong').first().textContent(), 'Everything is in sync');
});

await test('the first settings save of a session, with nothing checked yet, asks for no plan', 'default', {}, async app => {
  const { page } = app;
  await openSettings(page);
  const before = (await app.calls()).length;
  await switchOf(page, TRAY).click();
  await waitSwitch(page, TRAY, false);
  assert.deepEqual((await app.calls()).slice(before).map(c => c.action), ['settings'], 'one settings request, no plan, no snapshot');
  assert.equal((await calls(app, 'plan')).length, 0, 'no plan was asked for in this session');
  await switchOf(page, AUTO).click();
  await waitSwitch(page, AUTO, true);
  assert.equal((await calls(app, 'plan')).length, 0, 'nor after the second save');
});

await test('Theme: Light is the root\'s data-theme and survives a reload', 'default', { colorScheme: 'dark' }, async app => {
  const { page } = app;
  await openSettings(page);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.imTheme), 'dark');
  const group = page.getByRole('radiogroup', { name: 'Theme' });
  assert.deepEqual(await group.locator('label').allTextContents(), ['System', 'Light', 'Dark']);
  assert.equal(await row(page, 'Theme').locator('small').textContent(), 'System follows Windows.');
  await group.getByRole('radio', { name: 'Light' }).check({ force: true });
  await page.waitForFunction(() => document.documentElement.dataset.imTheme === 'light');
  assert.equal(await page.evaluate(() => localStorage.getItem('muro.theme')), 'light');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('value')), 'light', 'the radio keeps the focus');
  assert.equal((await calls(app, 'settings')).length, 0, 'a theme is the window\'s, not the registry\'s');
  await page.screenshot({ path: shots + '/settings-light.png' });
  await page.reload();
  await page.locator('nav').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.imTheme), 'light', 'still Light after a reload, against a dark system');
  await openSettings(page);
  assert.equal(await page.getByRole('radio', { name: 'Light' }).isChecked(), true);
  await page.getByRole('radio', { name: 'System' }).check({ force: true });
  await page.waitForFunction(() => document.documentElement.dataset.imTheme === 'dark');
});

await test('Verify and Clean up', 'default', {}, async app => {
  const { page } = app;
  await openSettings(page);
  assert.equal(await page.getByText('Reinstall a plugin').count(), 0, 'Reinstall is in the plugin dialog now');
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await page.locator('[role=status]', { hasText: 'Every stored build is intact' }).waitFor();
  assert.deepEqual((await calls(app, 'maintenance')).map(c => c.payload), [{ kind: 'verify' }]);
  // Clean up deletes files: it asks first, and Cancel does nothing.
  await page.getByRole('button', { name: 'Clean up…', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Clean up unused builds?' });
  await dialog.getByText('Only stored builds that nothing uses are deleted.').waitFor();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await dialog.waitFor({ state: 'detached' });
  assert.equal((await calls(app, 'maintenance')).length, 1);
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Clean up…', 'the focus goes back to where the dialog opened');
  await page.getByRole('button', { name: 'Clean up…', exact: true }).click();
  await dialog.getByRole('button', { name: 'Clean up', exact: true }).click();
  await page.locator('[role=status]', { hasText: 'Nothing to clean up' }).waitFor();
  assert.deepEqual((await calls(app, 'maintenance')).map(c => c.payload), [{ kind: 'verify' }, { kind: 'cleanup' }]);
  assert.equal(await page.locator('[role=status]', { hasText: 'Every stored build is intact' }).count(), 0, 'one result at a time');
});

await test('the rule for plugins outside the list is drawn in Sync with the Sync page\'s control, and changes every harness', 'demo', {}, async app => {
  const { page } = app;
  await openSettings(page);
  const group = page.getByRole('radiogroup', { name: 'Plugins that are not in my list' });
  assert.deepEqual(await group.locator('label').allTextContents(), ['Leave alone', 'Uninstall, asking first']);
  assert.equal(await group.getByRole('radio', { name: 'Leave alone' }).isChecked(), false, 'one harness differs: no option is chosen');
  assert.equal(await group.getByRole('radio', { name: 'Uninstall, asking first' }).isChecked(), false);
  assert.equal(await row(page, 'Plugins that are not in my list').getByText('Differs per harness').count(), 1);
  // The action is the Sync page's: one save_target per harness that does not have it yet, then every harness is on one side.
  await group.getByRole('radio', { name: 'Uninstall, asking first' }).check({ force: true });
  await page.waitForFunction(() => window.calls.filter(c => c.action === 'save_target').length === 2);
  await row(page, 'Plugins that are not in my list').locator('input:checked').waitFor();
  assert.deepEqual((await calls(app, 'save_target')).map(c => [c.payload.target.id, c.payload.target.exclusive]), [['codex', true], ['opencode', true]]);
  assert.equal(await group.getByRole('radio', { name: 'Uninstall, asking first' }).isChecked(), true);
  assert.equal(await row(page, 'Plugins that are not in my list').getByText('Differs per harness').count(), 0);
  assert.equal((await saves(app)).length, 0, 'it is not a setting of the registry');
});

await test('the rule for plugins outside the list: every harness on one side', 'two-harnesses', {}, async app => {
  const { page } = app;
  await openSettings(page);
  const group = page.getByRole('radiogroup', { name: 'Plugins that are not in my list' });
  assert.equal(await group.getByRole('radio', { name: 'Leave alone' }).isChecked(), true);
  assert.equal(await row(page, 'Plugins that are not in my list').getByText('Differs per harness').count(), 0);
});

await test('Activity: running adaptations first with their phase and Cancel, then the events newest first', 'demo', {}, async app => {
  const { page } = app;
  const snapshots = (await calls(app, 'snapshot')).length;
  await openActivity(page);
  await page.waitForFunction(count => window.calls.filter(c => c.action === 'snapshot').length > count, snapshots);
  const job = page.locator('article.im-task-card');
  assert.equal(await job.count(), 1);
  const text = await job.textContent();
  assert.match(text, /docs-writer/);
  assert.match(text, /OpenCode/);
  assert.match(text, /harmonization/, 'its phase');
  const bar = job.getByRole('progressbar', { name: 'Adaptation in progress' });
  assert.equal(await bar.count(), 1, 'a progress bar');
  assert.equal(await bar.getAttribute('aria-valuenow'), null, 'with no value: it is indeterminate');
  assert.match(await bar.getAttribute('aria-valuetext'), /^harmonization, running for 3 min \d+ s$/, 'what a screen reader reads at the bar');
  assert.match(text, /Running for 3 min \d+ s/, 'the time it has run, from its start');
  assert.match(text, /Claude Code is adapting the plugin for OpenCode\./);
  assert.match(text, /\$2\.00/, 'its budget');
  assert.match(text, /C:\/Users\/you\/Muro\/data\/jobs\/job-1\/log\.txt/, 'where its log is');
  assert.equal(await job.getByRole('button', { name: 'Cancel' }).count(), 1);
  assert.equal(await page.locator('nav button[aria-current=page] .label').textContent(), 'Activity');
  assert.deepEqual(await titles(page), ['Checked sources and harnesses', 'Apply'], 'newest first; an action the page has no title for is shown as the service named it');
  assert.equal(await page.locator('ul.im-activity-list li').first().locator('time').textContent().then(t => /today|yesterday|\d/.test(t)), true);
  assert.equal(await page.locator('section.im-settings').count(), 0);
  await page.screenshot({ path: shots + '/activity-dark.png' });
});

await test('Activity: the time a running adaptation has run moves with the poll of the jobs', 'demo', { clock: true }, async app => {
  const { page } = app;
  await openActivity(page);
  const elapsed = page.locator('article.im-task-card .im-task-elapsed');
  await elapsed.filter({ hasText: /^Running for 3 min \d+ s$/ }).waitFor();
  // Time stands still from here: what passes is what the test lets pass. The adaptation started three minutes before.
  await page.clock.pauseAt(new Date(Date.now() + 2_000));
  await page.clock.fastForward(125_000);
  await elapsed.filter({ hasText: /^Running for 5 min \d+ s$/ }).waitFor();
  assert.equal(await page.locator('article.im-task-card [role=progressbar]').getAttribute('aria-valuenow'), null, 'still no value');
});

await test('Activity: Cancel stops the adaptation, which stays in the list as cancelled', 'demo', {}, async app => {
  const { page } = app;
  await openActivity(page);
  await page.locator('article.im-task-card').getByRole('button', { name: 'Cancel' }).click();
  await page.locator('article.im-task-card').waitFor({ state: 'detached' });
  assert.deepEqual((await calls(app, 'cancel_job')).map(c => c.payload), [{ id: 'job-1' }]);
  const first = page.locator('ul.im-activity-list li').first();
  assert.match(await first.textContent(), /AI adaptation of docs-writer for OpenCode/);
  assert.match(await first.textContent(), /Cancelled/);
  assert.match(await first.textContent(), /log\.txt/, 'its log stays reachable');
  assert.equal(await page.locator('nav button', { hasText: 'Activity' }).getAttribute('aria-label'), null, 'nothing runs any more');
});

await test('Activity: the filters, and Problems shows only what failed or was cancelled', 'demo', {}, async app => {
  const { page } = app;
  // A failed check, and a cancelled adaptation, besides the two events that completed.
  await app.flags({ checkErrors: true });
  await page.getByRole('button', { name: 'Check now', exact: true }).click();
  await page.locator('.im-banner[data-im-tone="warn"]').waitFor();
  await openActivity(page);
  await page.locator('article.im-task-card').getByRole('button', { name: 'Cancel' }).click();
  await page.locator('article.im-task-card').waitFor({ state: 'detached' });
  const filter = page.getByRole('radiogroup', { name: 'Filter activity' });
  assert.deepEqual(await filter.locator('label').allTextContents(), ['All', 'Sync', 'AI adaptation', 'Problems']);
  assert.equal(await filter.getByRole('radio', { name: 'All' }).isChecked(), true);
  assert.equal((await titles(page)).length, 4, 'all: two completed, a failed check, a cancelled adaptation');
  await filter.getByRole('radio', { name: 'Problems' }).check({ force: true });
  await page.waitForFunction(() => document.querySelectorAll('ul.im-activity-list li').length === 2);
  const problems = await page.locator('ul.im-activity-list li').allTextContents();
  assert.equal(problems.length, 2);
  assert.ok(problems.some(t => /Check with problems/.test(t) && /Failed/.test(t) && /sources not resolved/.test(t)), problems.join(' | '));
  assert.ok(problems.some(t => /AI adaptation of docs-writer/.test(t) && /Cancelled/.test(t)), problems.join(' | '));
  assert.equal(problems.some(t => /Checked sources and harnesses|Apply/.test(t)), false, 'no completed event under Problems');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('value')), 'problems', 'the radio keeps the focus');
  await filter.getByRole('radio', { name: 'AI adaptation' }).check({ force: true });
  await page.waitForFunction(() => document.querySelectorAll('ul.im-activity-list li').length === 1);
  assert.match(await page.locator('ul.im-activity-list li').textContent(), /AI adaptation of docs-writer for OpenCode/);
  await filter.getByRole('radio', { name: 'Sync' }).check({ force: true });
  await page.waitForFunction(() => document.querySelectorAll('ul.im-activity-list li').length >= 2);
  const synced = await titles(page);
  assert.ok(synced.includes('Checked sources and harnesses') && synced.includes('Check with problems'), synced.join(' | '));
  assert.equal(synced.some(t => /AI adaptation/.test(t)), false, 'no adaptation under Sync');
  await filter.getByRole('radio', { name: 'All' }).check({ force: true });
  await page.waitForFunction(() => document.querySelectorAll('ul.im-activity-list li').length === 4);
});

await test('Activity: empty states', 'default', {}, async app => {
  const { page } = app;
  await openActivity(page);
  assert.equal(await page.locator('.im-empty strong').textContent(), 'Nothing yet');
  assert.equal(await page.locator('.im-empty span').textContent(), 'Sync runs and AI adaptations show up here.');
  await page.getByRole('radio', { name: 'Problems' }).check({ force: true });
  await page.locator('.im-empty strong', { hasText: 'Nothing here' }).waitFor();
  assert.equal(await page.locator('article.im-task-card').count(), 0);
});

// Pictures to look at, in both themes: the whole of Settings (a tall window, the page scrolls inside), and Activity with
// a running adaptation, then with a failed check and a cancelled adaptation among the events.
for (const scheme of ['dark', 'light']) {
  await test(`screenshots of Settings and Activity, ${scheme}`, 'demo', { colorScheme: scheme, viewport: { width: 1280, height: 1380 } }, async app => {
    const { page } = app;
    await openSettings(page);
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await page.locator('[role=status]', { hasText: 'Every stored build is intact' }).waitFor();
    await page.screenshot({ path: `${shots}/settings-${scheme}-full.png` });
    await openActivity(page);
    await page.screenshot({ path: `${shots}/activity-${scheme}-running.png`, clip: { x: 0, y: 0, width: 1280, height: 520 } });
    await app.flags({ checkErrors: true });
    await tab(page, 'Sync').click();
    await page.getByRole('button', { name: 'Check now', exact: true }).click();
    await page.locator('.im-banner[data-im-tone="warn"]').waitFor();
    await openActivity(page);
    await page.locator('article.im-task-card').getByRole('button', { name: 'Cancel' }).click();
    await page.locator('article.im-task-card').waitFor({ state: 'detached' });
    await page.screenshot({ path: `${shots}/activity-${scheme}-full.png`, clip: { x: 0, y: 0, width: 1280, height: 700 } });
  });
}

for (const width of [1100, 760]) {
  await test(`no sideways scroll at ${width}px, in Settings and in Activity`, 'demo', { viewport: { width, height: 900 } }, async ({ page }) => {
    await openSettings(page);
    assert.ok(await sideways(page) <= 0, `Settings scrolls sideways at ${width}px`);
    await page.screenshot({ path: `${shots}/settings-${width}.png` });
    await openActivity(page);
    assert.ok(await sideways(page) <= 0, `Activity scrolls sideways at ${width}px`);
    await page.screenshot({ path: `${shots}/activity-${width}.png` });
  });
}

// ---- Settings, section AI (plan 2, Task 9): the engine, its fields, the variable that holds the key ----
// The radios of the engine are saved by the service before the page shows the new engine, so they are clicked (a click states no expectation of its state), never `check`ed.
// A segmented control lays its radio over its label (`.im-seg input{position:absolute;inset:0;opacity:0}`), so a click aimed at the label's text lands on the radio, as a person's does:
// the radio is the element to click, with `force` because Playwright refuses a target that something else covers (the other files do the same, see `check({ force: true })`).
const KEY = 'Key from the environment variable';
const useEngine = (page, label) => page.getByRole('radiogroup', { name: 'Use', exact: true }).getByRole('radio', { name: label, exact: true }).click({ force: true });
/** The request of the n-th save was sent. The page shows the stored value until the answer comes back: wait for `boxIs` before reading a box after a save. */
const saved = (page, n) => page.waitForFunction(count => window.calls.filter(c => c.action === 'settings').length === count, n);
const boxIs = (page, name, value) => page.waitForFunction(([n, v]) => document.querySelector(`input[name=${n}]`)?.value === v, [name, value]);
/** The error slot of a field, once it holds `text`. */
const slotWith = (page, field, text) => page.locator(`#err-${field}`).filter({ hasText: text });
const hintOf = (page, title) => row(page, title).locator('small[id^="hint-"]');
async function openApi(page) {
  await openSettings(page);
  await useEngine(page, 'OpenAI-compatible API');
  await page.getByRole('textbox', { name: 'Endpoint' }).waitFor();
}

await test('AI: the engine is a radio group and a keyboard moves it; the API shows its fields and asks whether the key variable is set', 'default', {}, async app => {
  const { page } = app;
  await openSettings(page);
  const use = page.getByRole('radiogroup', { name: 'Use', exact: true });
  assert.deepEqual(await use.locator('label').allTextContents(), ['Coding agent on this computer', 'OpenAI-compatible API']);
  assert.equal(await page.getByRole('textbox', { name: 'Endpoint' }).count(), 0, 'the API fields wait for the API');
  assert.equal((await calls(app, 'env_present')).length, 0, 'and the variable is not asked about');
  await use.getByRole('radio', { name: 'Coding agent on this computer' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('textbox', { name: 'Endpoint' }).waitFor();
  assert.deepEqual(await saves(app), [{ revision: 1, settings: { ...STORED, ai: { ...AI, engine: 'api' } } }], 'one save, the engine only');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('value')), 'api', 'the radio keeps the focus');
  assert.deepEqual((await calls(app, 'env_present')).map(c => c.payload), [{ name: 'MURO_API_KEY' }], 'a name goes out, nothing else');
  assert.equal(await page.getByRole('radio', { name: 'OpenAI-compatible API' }).isChecked(), true);
  assert.equal(await page.getByRole('textbox', { name: 'Endpoint' }).inputValue(), 'https://api.openai.com/v1');
  assert.equal(await page.getByRole('textbox', { name: 'Model' }).inputValue(), '');
  assert.equal(await page.getByRole('textbox', { name: KEY }).inputValue(), 'MURO_API_KEY');
  assert.equal(await page.getByRole('combobox', { name: 'Coding agent' }).count(), 0, 'the coding agent waits for the coding agent');
  assert.equal(await page.getByRole('textbox', { name: 'Budget per request in USD' }).count(), 0);
  assert.match(await hintOf(page, 'Model').textContent(), /^Required: a request cannot run without a model\.$/);
  assert.equal(await row(page, 'Model').locator('small .im-text-warn').count(), 1, 'a warning');
  // The page holds the name and the runtime's answer, never a key: there is no box for one.
  assert.equal(await page.locator('input[type=password]').count(), 0);
  await page.getByText('MURO_API_KEY is not set for Muro.', { exact: true }).waitFor();
  assert.equal((await hintOf(page, KEY).textContent()).endsWith("Muro never stores the key. Set it in Windows' environment variables, then restart Muro."), true);
  assert.equal(await row(page, KEY).locator('[role=status]').count(), 1, 'the answer is a status');
  // Set for the Muro process: the next visit says so.
  await app.flags({ envSet: ['MURO_API_KEY'] });
  await tab(page, 'Sync').click();
  await openSettings(page);
  await page.getByText('MURO_API_KEY is set for Muro.', { exact: true }).waitFor();
  assert.equal(await row(page, KEY).locator('.im-text-ok').count(), 1);
  // A runtime that cannot answer is a line in the row, no banner.
  await app.flags({ noEnvCheck: true });
  await tab(page, 'Sync').click();
  await openSettings(page);
  await page.getByText('Could not check whether MURO_API_KEY is set.', { exact: true }).waitFor();
  assert.deepEqual(await bannerText(page), []);
  await app.flags({ noEnvCheck: false });
  await page.screenshot({ path: shots + '/settings-ai-api.png' });
});

await test('AI: the endpoint is validated in the page, in its own field, and the stored address comes back', 'default', {}, async app => {
  const { page } = app;
  await openApi(page);
  const endpoint = page.getByRole('textbox', { name: 'Endpoint' });
  for (const [bad, text] of [['http://example.com/v1', 'Plain http is allowed only on localhost; use https.'], ['api.openai.com/v1', 'The API address must be an https URL (http only on localhost).'], ['https://user:hunter2@example.com/v1', 'The API address must not hold a user name or a password.'], ['', 'Enter the address of the API.']]) {
    await endpoint.fill(bad);
    await endpoint.blur();
    await slotWith(page, 'ai_api_base', text).waitFor();
    assert.equal(await endpoint.getAttribute('aria-invalid'), 'true');
    assert.match(await endpoint.getAttribute('aria-describedby'), /\berr-ai_api_base\b/, 'the error is tied to its field');
    assert.equal(await page.locator('#err-ai_api_base').getAttribute('role'), 'alert');
    assert.equal(await endpoint.inputValue(), 'https://api.openai.com/v1', 'the stored address is back');
    assert.deepEqual(await bannerText(page), [], 'the banner is for what the service refuses');
  }
  assert.equal((await saves(app)).length, 1, 'only the engine was ever sent');
  assert.equal(await page.locator('body').evaluate(b => b.textContent.includes('hunter2')), false);
  // Typing takes the error away without painting the page; leaving the box saves what passes.
  await endpoint.fill('http://localhost:11434/v1');
  await page.waitForFunction(() => document.getElementById('err-ai_api_base').textContent === '' && !document.querySelector('input[name=ai_api_base]').hasAttribute('aria-invalid'));
  await endpoint.blur();
  await saved(page, 2);
  assert.equal((await saves(app))[1].settings.ai.api_base, 'http://localhost:11434/v1', 'http is accepted on localhost');
  await boxIs(page, 'ai_api_base', 'http://localhost:11434/v1');
  await endpoint.fill('  https://api.example.com/v1  ');
  await endpoint.blur();
  await saved(page, 3);
  assert.equal((await saves(app))[2].settings.ai.api_base, 'https://api.example.com/v1', 'trimmed');
});

await test('AI: a key typed where the name of the variable goes is refused without being repeated, and nothing holds it', 'default', {}, async app => {
  const { page } = app;
  await openApi(page);
  const key = page.getByRole('textbox', { name: KEY });
  await key.fill('sk-proj-ABCDEF1234567890SECRET');
  await key.blur();
  await slotWith(page, 'ai_api_key_env', 'The key setting must name an environment variable, not hold a key').waitFor();
  assert.equal(await key.getAttribute('aria-invalid'), 'true');
  assert.match(await key.getAttribute('aria-describedby'), /\berr-ai_api_key_env\b/);
  assert.equal(await key.inputValue(), 'MURO_API_KEY', 'the box is back to the name');
  assert.equal((await page.content()).includes('SECRET'), false, 'not on the page');
  assert.equal(JSON.stringify(await app.calls()).includes('SECRET'), false, 'not in any request');
  assert.equal((await saves(app)).length, 1, 'only the engine was ever sent');
  assert.equal((await calls(app, 'env_present')).length, 1, 'the runtime was asked once, about the stored name');
  // A key of a provider that carries no hyphen (gsk_..., hf_..., letters and digits) is no name either, and is not repeated
  for (const pasted of ['gsk_abc123SECRET', 'hf_xyz789SECRET', 'Zk3dQp9RtLm2NvXw8YbHc5JfGs7AaE1uOi4TyP6eSECRET']) {
    await key.fill(pasted);
    await key.blur();
    await slotWith(page, 'ai_api_key_env', 'The key setting must name an environment variable, not hold a key').waitFor();
    assert.equal(await key.inputValue(), 'MURO_API_KEY', 'the box is back to the name');
    assert.equal((await page.content()).includes('SECRET'), false, 'not on the page');
  }
  assert.equal(JSON.stringify(await app.calls()).includes('SECRET'), false, 'in no request');
  assert.equal((await saves(app)).length, 1, 'none of them was sent');
  // A name is saved, trimmed, and its state is read.
  await app.flags({ envSet: ['OPENAI_API_KEY'] });
  await key.fill(' OPENAI_API_KEY ');
  await key.blur();
  await saved(page, 2);
  assert.equal((await saves(app))[1].settings.ai.api_key_env, 'OPENAI_API_KEY');
  await page.getByText('OPENAI_API_KEY is set for Muro.', { exact: true }).waitFor();
  assert.deepEqual((await calls(app, 'env_present')).map(c => c.payload), [{ name: 'MURO_API_KEY' }, { name: 'OPENAI_API_KEY' }]);
});

await test('AI: the model is saved trimmed, and its warning goes with it', 'default', {}, async app => {
  const { page } = app;
  await openApi(page);
  const model = page.getByRole('textbox', { name: 'Model' });
  await model.fill('bad\u0007name');
  await model.blur();
  await slotWith(page, 'ai_model', 'The model name is not valid.').waitFor();
  assert.equal((await saves(app)).length, 1);
  await model.fill('  org/model:7b  ');
  await model.blur();
  await saved(page, 2);
  assert.equal((await saves(app))[1].settings.ai.model, 'org/model:7b');
  await page.locator('#hint-ai_model', { hasText: 'The model name as the API knows it.' }).waitFor();
  assert.equal(await row(page, 'Model').locator('small .im-text-warn').count(), 0, 'the warning went with the empty model');
  await boxIs(page, 'ai_model', 'org/model:7b');
});

await test('AI: a coding agent has a budget per request in dollars, Codex has none', 'default', {}, async app => {
  const { page } = app;
  await openSettings(page);
  const budget = page.getByRole('textbox', { name: 'Budget per request in USD' });
  assert.equal(await budget.inputValue(), '0.5');
  assert.match(await hintOf(page, 'Budget per request').textContent(), /^In US dollars/);
  for (const bad of ['0', '101', 'abc', '0,5', '']) {
    await budget.fill(bad);
    await budget.blur();
    await slotWith(page, 'ai_budget_usd', 'The budget is a number of US dollars above 0 and at most 100, such as 0.5.').waitFor();
    assert.equal(await budget.inputValue(), '0.5', `${JSON.stringify(bad)} is not kept`);
    assert.equal(await budget.getAttribute('aria-invalid'), 'true');
  }
  assert.deepEqual(await saves(app), [], 'none was sent');
  await budget.fill(' 3 ');
  await budget.blur();
  await saved(page, 1);
  assert.deepEqual(await saves(app), [{ revision: 1, settings: { ...STORED, ai: { ...AI, budget_usd: 3 } } }], 'a number, with the rest of ai as it was');
  await boxIs(page, 'ai_budget_usd', '3');
  const agent = page.getByRole('combobox', { name: 'Coding agent' });
  assert.deepEqual(await agent.locator('option').allTextContents(), ['Claude Code · dollar budget', 'Codex · no budget limit']);
  await agent.selectOption('codex');
  await saved(page, 2);
  assert.equal((await saves(app))[1].settings.ai.harness, 'codex');
  assert.equal((await saves(app))[1].settings.ai.budget_usd, 3, 'the budget stays stored');
  await page.waitForFunction(() => document.querySelector('input[name=ai_budget_usd]').disabled);
  assert.equal(await hintOf(page, 'Budget per request').textContent(), 'Codex has no budget limit.');
  assert.equal(await page.getByRole('textbox', { name: 'Budget per request in USD' }).inputValue(), '3', 'what is stored stays');
  assert.equal((await calls(app, 'env_present')).length, 0, 'a coding agent never asks about the key');
});

await test('AI: a save the service refuses puts the engine back and shows the service\'s words in the banner', 'default', {}, async app => {
  const { page } = app;
  await openSettings(page);
  await app.flags({ rejectSettings: true });
  await useEngine(page, 'OpenAI-compatible API');
  await page.locator('.im-banner[role=alert]').getByText('Version conflict: settings not saved').waitFor();
  assert.equal(await page.getByRole('radio', { name: 'Coding agent on this computer' }).isChecked(), true, 'the stored engine is shown');
  assert.equal(await page.getByRole('textbox', { name: 'Endpoint' }).count(), 0);
  await app.flags({ rejectSettings: false });
  await useEngine(page, 'OpenAI-compatible API');
  await page.getByRole('textbox', { name: 'Endpoint' }).waitFor();
  assert.deepEqual(await bannerText(page), [], 'the error is gone');
});

for (const width of [1100, 760]) {
  await test(`AI with the API: no sideways scroll at ${width}px`, 'default', { viewport: { width, height: 900 } }, async ({ page }) => {
    await openApi(page);
    assert.ok(await sideways(page) <= 0, `Settings scrolls sideways at ${width}px`);
    await page.screenshot({ path: `${shots}/settings-ai-api-${width}.png` });
  });
}

console.log('PASS: ' + done.join('; '));
