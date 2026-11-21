// Task 5: the app bar, the three tabs and the Sync page, on the fake transport (fake-transport.js).
//   node apps/desktop/tests/browser-sync.mjs        (MURO_UI_PORT moves the dev server off 1422)
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { open } from './browser-helper.mjs';

const shots = 'apps/desktop/tests/artifacts';
await mkdir(shots, { recursive: true });
const done = [];
async function test(name, scenario, options, body) {
  const app = await open(scenario, options);
  try { await body(app); done.push(name); } finally { await app.close(); }
}
const actions = async app => (await app.calls()).map(c => c.action);
const title = page => page.locator('#sync-state b').first().textContent();
const strip = page => page.locator('#sync-state');   // the note: what the last check found
const bar = page => page.locator('.im-actions');
const labels = loc => loc.locator('button').evaluateAll(buttons => buttons.map(b => b.querySelector('span').textContent));   // the words of the buttons, not their key caps
const status = page => page.locator('.im-status');
const foot = page => page.locator('.im-footer');
const checkNow = page => page.getByRole('button', { name: 'Check now', exact: true });
const check = async page => { await checkNow(page).click(); await page.locator('.im-status-text').getByText('today').first().waitFor(); };
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

await test('tabs and an app bar without a sidebar', 'changes', {}, async ({ page }) => {
  await page.locator('nav').waitFor();
  assert.deepEqual(await page.locator('nav button .label').allTextContents(), ['Projects', 'Sync', 'Activity', 'Settings']);
  assert.equal(await page.locator('nav button[aria-current=page] .label').textContent(), 'Sync', 'Sync is current');
  for (const gone of ['sidebar', 'topbar', 'bottom']) assert.equal(await page.locator('.' + gone).count(), 0, `no .${gone}`);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.imLook), 'smooth', 'Imago Smooth is the default');
  await page.getByRole('tab', { name: 'Activity' }).click();
  await page.getByRole('heading', { name: 'Activity', level: 1 }).waitFor();
  assert.equal(await page.locator('nav button[aria-current=page] .label').textContent(), 'Activity');
  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.getByRole('heading', { name: 'Settings', level: 1 }).waitFor();
  await page.getByRole('tab', { name: 'Sync' }).click();
  await page.getByRole('heading', { name: 'Sync', level: 1 }).waitFor();
});

await test('the strip before and after a check', 'changes', {}, async app => {
  const { page } = app;
  await strip(page).getByText('Not checked yet', { exact: true }).waitFor();
  assert.deepEqual(await labels(bar(page)), ['Check now'], 'only Check now before a check');
  assert.deepEqual(await actions(app).then(a => a.filter(x => x === 'plan' || x === 'check')), [], 'opening the app checks nothing');
  await page.screenshot({ path: shots + '/sync-not-checked.png' });
  await check(page);
  assert.equal(await title(page), '1 change ready to apply');
  assert.match(await status(page).textContent(), /Last check\s*today/);
  assert.match(await foot(page).textContent(), /Automatic sync off/);
  assert.deepEqual(await labels(bar(page)), ['Check now', 'Review', 'Apply all 1 change']);
  assert.equal(await page.locator('#rows td').nth(1).textContent().then(t => t.includes('v2')), true, 'latest version column');
  await page.screenshot({ path: shots + '/sync-dark.png' });
});

await test('a harness column offers its own changes and never replaces the strip\'s plan', 'two-harnesses', {}, async app => {
  const { page } = app;
  await check(page);
  assert.equal(await title(page), '2 changes ready to apply');
  const own = page.locator('th .im-cell-meta').getByRole('button', { name: 'Sync 1 change' });
  assert.equal(await own.count(), 2);
  await own.first().click();
  await page.locator('dialog[open] h2').getByText('Sync Codex isolated test', { exact: true }).waitFor();
  assert.deepEqual((await app.calls()).at(-1), { action: 'plan', payload: { target_id: 't1' } });
  assert.equal(await page.locator('dialog[open] li').count(), 1, 'the sheet lists only this harness');
  await page.keyboard.press('Escape');
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert.equal(await title(page), '2 changes ready to apply', 'a one-harness plan is not the plan of the strip');
  assert.equal(await bar(page).getByRole('button', { name: 'Apply all 2 changes' }).count(), 1);
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Sync 1 change', 'focus returns to where the sheet was opened');
});

await test('Apply all asks for a fresh plan, then applies and plans again', 'changes', {}, async app => {
  const { page } = app;
  await check(page);
  const before = (await app.calls()).length;
  await page.getByRole('button', { name: 'Apply all 1 change' }).click();
  await page.getByText('Everything is in sync', { exact: true }).waitFor();
  const after = (await app.calls()).slice(before);
  assert.deepEqual(after.map(c => c.action), ['plan', 'apply', 'plan'], 'a fresh plan, the apply, then the plan the strip reads');
  assert.deepEqual(after[0].payload, {}, 'a full plan');
  assert.deepEqual(Object.keys(after[1].payload), ['plan_id'], 'no allow_blocked without blockers');
  assert.equal(after[1].payload.plan_id, 'plan-2');
  assert.match(await page.locator('#rows td').nth(2).textContent(), /2/, 'the cell shows the installed version');
  await page.locator('[data-im-notices]').getByText('1 change applied.').waitFor();
  assert.match(await foot(page).textContent(), /last sync\s*today/);
});

await test('with blockers Apply all opens the review sheet; its Apply sends allow_blocked', 'changes', {}, async app => {
  const { page } = app;
  await app.flags({ blockPlan: true });
  await check(page);
  assert.match(await strip(page).locator('span').first().textContent(), /1 item not ready yet/);
  await page.getByRole('button', { name: 'Apply all 1 change' }).click();
  const sheet = page.locator('dialog[open]');
  await sheet.getByRole('heading', { name: 'Review changes' }).waitFor();
  await sheet.getByRole('heading', { name: 'Not ready yet' }).waitFor();
  await sheet.getByText('Inventory incomplete').waitFor();
  assert.equal((await actions(app)).includes('apply'), false, 'nothing is applied before the sheet\'s Apply');
  await page.screenshot({ path: shots + '/sync-review.png' });
  await sheet.getByRole('button', { name: 'Apply 1 change' }).click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  const apply = (await app.calls()).filter(c => c.action === 'apply');
  assert.equal(apply.length, 1);
  assert.equal(apply[0].payload.allow_blocked, true);
  await page.locator('[data-im-notices]').getByText('1 change applied. 1 left out.').waitFor();
});

await test('a plan without anything ready has no Apply button', 'default', {}, async app => {
  const { page } = app;
  await page.getByRole('button', { name: 'Add plugin' }).first().click();
  await page.getByLabel('Name', { exact: true }).fill('<Test plugin>');
  await page.getByLabel('Source', { exact: false }).fill('https://example.com/plugin');
  await page.getByRole('checkbox', { name: /Codex isolated test/ }).check();
  await page.evaluate(() => { window.flags.rejectSave = true; });
  await page.locator('.im-inspector:not([hidden])').getByRole('button', { name: 'Add plugin', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Version conflict' }).waitFor();
  assert.equal(await page.getByLabel('Name', { exact: true }).inputValue(), '<Test plugin>', 'a failed save keeps the form');
  await page.evaluate(() => { window.flags.rejectSave = false; });
  const before = (await app.calls()).length;
  await page.locator('.im-inspector:not([hidden])').getByRole('button', { name: 'Add plugin', exact: true }).click();
  await page.locator('#rows').getByText('<Test plugin>', { exact: true }).waitFor();
  assert.equal(await page.locator('test').count(), 0, 'a plugin name is escaped');
  await page.getByText('Some plugins are not ready', { exact: true }).waitFor();
  await delay(400);
  const after = (await app.calls()).slice(before);
  assert.deepEqual(after.map(c => c.action), ['save_plugin', 'plan'], 'one plan after the mutation, none more');
  assert.deepEqual(after[1].payload, {});
  assert.equal(await bar(page).getByRole('button', { name: 'Check now' }).count(), 1);
  await bar(page).getByRole('button', { name: 'Review' }).click();
  const sheet = page.locator('dialog[open]');
  await sheet.getByRole('heading', { name: 'Not ready yet' }).waitFor();
  assert.equal(await sheet.getByRole('button', { name: /^Apply/ }).count(), 0, 'nothing ready: no Apply');
  assert.match(await sheet.textContent(), /No change is ready to apply\./);
  await sheet.locator('footer').getByRole('button', { name: 'Close', exact: true }).click();
});

await test('a harness that cannot be read is never in sync', 'changes', {}, async app => {
  const { page } = app;
  await app.flags({ unreadable: true });
  await checkNow(page).click();
  await page.locator('#sync-state b').getByText('cannot be read').waitFor();
  assert.equal(await title(page), 'Codex isolated test cannot be read');
  assert.equal(await page.getByText('Everything is in sync').count(), 0);
  assert.equal(await bar(page).getByRole('button', { name: 'Check now' }).count(), 1);
  await page.locator('th .im-cell-meta').getByText('Cannot be read').waitFor();
  await page.screenshot({ path: shots + '/sync-unreadable.png' });
});

await test('check errors show in the banner and keep the plan', 'changes', {}, async app => {
  const { page } = app;
  await app.flags({ checkErrors: true });
  await check(page);
  const banner = page.getByRole('alert').filter({ hasText: 'could not be checked' });
  await banner.waitFor();
  assert.match(await banner.textContent(), /Package: Source unreachable/);
  assert.equal(await title(page), '1 change ready to apply', 'the plan stays');
});

await test('a paused harness shows Paused', 'changes', {}, async app => {
  const { page } = app;
  await page.getByRole('button', { name: 'Codex isolated test', exact: true }).click();
  await page.getByLabel('Keep this harness in sync').uncheck();
  await page.locator('.im-inspector:not([hidden])').getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('th .im-cell-meta').getByText('Paused').waitFor();
  assert.equal(await page.locator('#rows').getByText('Paused').count(), 1);
  await page.getByText('No harness is managed', { exact: true }).waitFor();
  assert.deepEqual((await app.calls()).at(-1), { action: 'plan', payload: {} });
});

await test('removing a harness asks first and plans again', 'two-harnesses', {}, async app => {
  const { page } = app;
  await page.getByRole('button', { name: 'OpenCode isolated test', exact: true }).click();
  await page.getByRole('button', { name: 'Stop managing' }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('heading', { name: 'Stop managing OpenCode isolated test?' }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.matches('[role=alertdialog] .im-btn') && document.activeElement.textContent === 'Cancel'), true, 'Cancel has the focus');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  assert.equal((await actions(app)).includes('remove_target'), false, 'Cancel removes nothing');
  await page.getByRole('button', { name: 'OpenCode isolated test', exact: true }).click();
  await page.getByRole('button', { name: 'Stop managing' }).click();
  await dialog.getByRole('button', { name: 'Stop managing', exact: true }).click();
  await page.locator('th').getByText('OpenCode isolated test').waitFor({ state: 'detached' });
  const calls = await app.calls();
  assert.deepEqual(calls.slice(-3).map(c => c.action), ['save_plugin', 'remove_target', 'plan'], 'the plugin that listed the harness is saved without it first, the harness goes, and the plan is asked for after the mutation');
  assert.deepEqual(calls.at(-3).payload.plugin.targets, ['t1'], 'the plugin keeps its other harness');
  assert.equal(calls.at(-2).payload.revision, calls.at(-3).payload.revision + 1, 'the removal carries the revision the save returned');
});

await test('a harness that cannot be removed stays, and the message says so', 'two-harnesses', {}, async app => {
  const { page } = app;
  await app.flags({ rejectSave: true });
  await page.getByRole('button', { name: 'OpenCode isolated test', exact: true }).click();
  await page.getByRole('button', { name: 'Stop managing' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Stop managing', exact: true }).click();
  await page.locator('#main > .im-panel-body > .im-note[role=alert]').getByText('OpenCode isolated test was not removed: Version conflict', { exact: false }).waitFor();
  assert.equal(await page.locator('th').getByText('OpenCode isolated test').count(), 1, 'the harness is still a column');
  assert.equal((await actions(app)).includes('remove_target'), false, 'the harness was never asked to go while a plugin lists it');
});

await test('rescan reads the installed plugins again, plans and looks for harnesses', 'changes', {}, async app => {
  const { page } = app;
  const before = (await app.calls()).length;
  await page.getByRole('button', { name: 'Add harness', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rescan this computer' }).click();
  await page.waitForFunction(n => window.calls.length >= n + 3, before);
  assert.deepEqual((await actions(app)).slice(before), ['scan', 'plan', 'discover']);
});

await test('search, filter and the keyboard', 'demo', {}, async app => {
  const { page } = app;
  await page.locator('#rows tr').first().waitFor();
  const rows = () => page.locator('#rows tr').count();
  assert.equal(await rows(), 5);
  await page.keyboard.press('/');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'search', '/ focuses the search');
  await page.keyboard.type('docs');
  assert.equal(await page.locator('#search').inputValue(), 'docs', 'typing keeps the focus');
  assert.equal(await rows(), 1);
  await page.locator('#search').fill('unmatched');
  await page.getByText('No plugin matches.').waitFor();
  await page.locator('#search').fill('');
  assert.equal(await rows(), 5);
  await page.getByRole('radio', { name: 'Needs action' }).check({ force: true });
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('value')), 'action', 'the radio keeps the focus');
  assert.equal(await rows(), 3, 'the plugin in sync and the one with no harness are hidden');
  await page.getByRole('radio', { name: 'All', exact: true }).check({ force: true });
  await page.getByRole('button', { name: 'Marionette' }).first().focus();
  await page.keyboard.press('Tab');
  // Enter on Check now: the render takes the focus off a disabled button, never onto the body.
  await app.flags({ checkDelay: 400 });
  await checkNow(page).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => !!document.activeElement?.closest('main')), true, 'focus stays inside main while checking');
  await page.locator('.im-status-text').getByText('today').first().waitFor();
  await page.waitForFunction(() => document.activeElement?.querySelector('span')?.textContent === 'Check now');
});

await test('applying shows its progress and cannot be dismissed', 'changes', {}, async app => {
  const { page } = app;
  await app.flags({ blockPlan: true, applyDelay: 700 });
  await check(page);
  await page.getByRole('button', { name: 'Apply all 1 change' }).click();
  const sheet = page.locator('dialog[open]');
  await sheet.getByRole('button', { name: 'Apply 1 change' }).click();
  await sheet.getByRole('button', { name: 'Applying 1 change…' }).waitFor();
  assert.equal(await sheet.getByRole('button', { name: 'Applying 1 change…' }).isDisabled(), true);
  await strip(page).getByText('Applying 1 change…').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(), 1, 'Escape does not close a sheet that is applying');
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
});

await test('a failed apply keeps the sheet open, with the error, to try again', 'changes', {}, async app => {
  const { page } = app;
  await app.flags({ blockPlan: true, rejectApply: true });
  await check(page);
  await page.getByRole('button', { name: 'Apply all 1 change' }).click();
  const sheet = page.locator('dialog[open]');
  await sheet.getByRole('button', { name: 'Apply 1 change' }).click();
  await sheet.getByRole('alert').getByText('The harness refused the change').waitFor();
  assert.equal(await sheet.getByRole('button', { name: 'Apply 1 change' }).isEnabled(), true, 'the sheet can try again after an error');
  assert.equal(await page.evaluate(() => document.activeElement?.closest('dialog') !== null), true, 'focus stays in the sheet');
  await app.flags({ rejectApply: false });
  await sheet.getByRole('button', { name: 'Apply 1 change' }).click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  await page.locator('[data-im-notices]').getByText('1 change applied. 1 left out.').waitFor();
});

await test('themes: the system theme decides until one is chosen', 'changes', { colorScheme: 'light' }, async ({ page }) => {
  await page.locator('nav').waitFor();
  const paintedSurface = () => page.locator('.im-shell').evaluate(shell => {
    const style = getComputedStyle(shell), canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d');
    const rgba = color => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    };
    const luminance = channels => channels.slice(0, 3).map(value => {
      const s = value / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const background = rgba(style.backgroundColor), ground = rgba(style.getPropertyValue('--im-ground').trim());
    const text = rgba(getComputedStyle(shell.querySelector('main')).color);
    const backgroundLight = luminance(background), textLight = luminance(text);
    return { background, ground, luminance: backgroundLight, contrast: (Math.max(backgroundLight, textLight) + 0.05) / (Math.min(backgroundLight, textLight) + 0.05) };
  });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.imTheme), 'light');
  const light = await paintedSurface();
  assert.deepEqual(light.background, light.ground, 'the Imago shell paints its ground token');
  assert.equal(light.background[3], 255, 'the browser shell has an opaque surface');
  assert.ok(light.luminance > 0.8, 'the light theme paints a light surface');
  assert.ok(light.contrast >= 4.5, 'light-theme text remains readable on the actual surface');
  await page.screenshot({ path: shots + '/sync-light.png' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.documentElement.dataset.imTheme === 'dark');
  const dark = await paintedSurface();
  assert.deepEqual(dark.background, dark.ground, 'system changes update the painted Imago ground');
  assert.equal(dark.background[3], 255);
  assert.ok(dark.luminance < 0.2, 'the dark theme paints a dark surface');
  assert.ok(dark.contrast >= 4.5, 'dark-theme text remains readable on the actual surface');
  assert.notDeepEqual(dark.background, light.background, 'the visible surface changes with the system theme');
});

await test('Ctrl+F and / search the current view: Sync focuses its search box, the other pages leave focus and page as they are; the command button holds the caps of the registry', 'changes', {}, async ({ page }) => {
  await page.locator('#search').waitFor();
  assert.deepEqual(await page.locator('.im-titlebar-command .im-key').allTextContents(), ['Ctrl', 'K'], 'two caps, from the registry');
  assert.deepEqual(await page.locator('#search').evaluate(el => el.closest('label').querySelector('.im-key').textContent), '/', 'the search box shows the cap of its command');
  await page.keyboard.press('Control+f');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'search', 'Ctrl+F focuses the search box');
  await page.locator('#rows').click({ position: { x: 2, y: 2 } }).catch(() => {});
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('/');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'search', '/ does the same');
  await page.getByRole('tab', { name: 'Activity' }).click();
  await page.getByRole('heading', { name: 'Activity', level: 1 }).waitFor();
  await page.evaluate(() => document.activeElement?.blur());
  const before = await page.evaluate(() => document.activeElement?.tagName);
  await page.keyboard.press('Control+f');
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), before, 'focus stays where it was');
  await page.getByRole('heading', { name: 'Activity', level: 1 }).waitFor();
  assert.equal(await page.locator('nav button[aria-current=page] .label').textContent(), 'Activity', 'the page does not change');
});

await test('a plugin row opens its inspector, and Plan a reinstall opens the review dialog over it (not run locally: the owner's rule)', 'changes', {}, async ({ page }) => {
  const panel = page.locator('.im-inspector:not([hidden])');
  await page.locator('#rows [data-action=open-plugin]').first().click();
  await panel.locator('h2.im-panel-title').waitFor();
  assert.equal(await page.evaluate(() => document.querySelector('.im-body').inert), false, 'the inspector is not modal');
  await panel.getByText('More', { exact: true }).click();
  await panel.getByRole('button', { name: 'Plan a reinstall' }).click();
  await page.locator('dialog[open] h2').getByText('Review changes', { exact: true }).waitFor();
  assert.equal(await panel.count(), 1, 'the inspector stays under the review');
});

for (const width of [1100, 760]) {
  await test(`no sideways scroll at ${width}px`, 'demo', { viewport: { width, height: 900 } }, async app => {
    const { page } = app;
    await check(page);
    assert.ok(await sideways(page) <= 0, `the document scrolls sideways at ${width}px`);
    await page.getByRole('button', { name: /^Review/ }).click();
    assert.ok(await sideways(page) <= 0, 'and with the sheet open');
    await page.screenshot({ path: `${shots}/sync-${width}.png` });
  });
}

console.log('PASS: ' + done.join('; '));
