// Task 6: the harness sheet, the plugin dialog and its actions, the Add harness menu, the plugins outside the list.
//   MURO_UI_PORT=1431 node apps/desktop/tests/browser-harness.mjs
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { open } from './browser-helper.mjs';

const shots = 'apps/desktop/tests/artifacts';
await mkdir(shots, { recursive: true });
const done = [];
async function test(name, scenario, options, body) {
  if (process.env.MURO_ONLY && !name.includes(process.env.MURO_ONLY)) return;   // while working on one test
  const app = await open(scenario, options);
  try { await body(app); done.push(name); } finally { await app.close(); }
}
const actions = async app => (await app.calls()).map(c => c.action);
const callsOf = async (app, action) => (await app.calls()).filter(c => c.action === action);
const dialog = page => page.locator('dialog[open]');
const toast = page => page.locator('#toasts .toast');
const focused = (page, what) => page.evaluate(w => { const e = document.activeElement; return w === 'name' ? e?.getAttribute('name') : w === 'text' ? e?.textContent : w === 'inside' ? !!e?.closest('dialog') : e?.id; }, what);
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const check = async page => { await page.getByRole('button', { name: 'Check now', exact: true }).click(); await page.locator('section.strip .meta').getByText('today').first().waitFor(); };
const column = (page, name) => page.getByRole('button', { name, exact: true });
const rowOf = (page, name) => page.locator('#rows').getByRole('button', { name: new RegExp('^' + name) });
const errorOf = (dlg, field) => dlg.locator('#err-' + field);
const on = page => page.evaluate(() => { const e = document.activeElement; return (e?.getAttribute('data-action') || '') + ':' + (e?.getAttribute('data-id') || ''); });
/** The app is up and the computer was searched for harnesses: a render that follows the search would close an open menu. */
const ready = async page => { await page.locator('nav').waitFor(); await page.waitForFunction(() => window.calls.some(c => c.action === 'discover')); await page.waitForTimeout(150); };

// ---------- the harness sheet ----------
await test('a column header opens the harness sheet; each wrong field says what is wrong, tied to the field, and takes the focus', 'changes', {}, async app => {
  const { page } = app, dlg = dialog(page).first();
  await column(page, 'Codex isolated test').click();
  await dlg.locator('h2').getByText('Codex isolated test', { exact: true }).waitFor();
  assert.equal(await dlg.evaluate(d => d.classList.contains('sheet')), true, 'a sheet on the right');
  assert.equal(await focused(page, 'inside'), true, 'the sheet takes the focus');
  assert.equal(await dlg.getAttribute('aria-labelledby'), 'dlg-title');
  for (const label of ['Name', 'Harness', 'Configuration folder', 'Executable', 'Keep this harness in sync', 'Always uninstall plugins that are not in my list']) await dlg.getByLabel(label).first().waitFor();
  await dlg.getByText('Checked never · last sync never').waitFor();
  await page.screenshot({ path: shots + '/harness-sheet.png' });
  const root = dlg.locator('[name=root]'), save = dlg.getByRole('button', { name: 'Save', exact: true });
  await root.fill('');
  await save.click();
  assert.equal(await errorOf(dlg, 'root').textContent(), 'Enter the configuration folder.');
  assert.equal(await root.getAttribute('aria-invalid'), 'true');
  assert.match(await root.getAttribute('aria-describedby'), /err-root/, 'the error is the field\'s description');
  assert.equal(await focused(page, 'name'), 'root', 'the field with the error has the focus');
  assert.equal(await errorOf(dlg, 'root').getAttribute('role'), 'alert');
  await root.fill('codex');
  assert.equal(await errorOf(dlg, 'root').textContent(), '', 'typing takes the error away');
  assert.equal(await root.getAttribute('aria-invalid'), null);
  await save.click();
  assert.equal(await errorOf(dlg, 'root').textContent(), 'Enter the full path of the folder, such as C:\\Users\\you\\.codex.');
  assert.equal(await focused(page, 'name'), 'root');
  await dlg.locator('[name=name]').fill('');
  await dlg.locator('[name=executable]').fill('');
  await save.click();
  assert.equal(await errorOf(dlg, 'name').textContent(), 'Give the harness a name.');
  assert.equal(await errorOf(dlg, 'executable').textContent(), 'Enter the command or full path of the executable.');
  assert.equal(await focused(page, 'name'), 'name', 'the first wrong field, in the order of the form');
  await page.screenshot({ path: shots + '/harness-sheet-error.png' });
  assert.equal((await actions(app)).includes('save_target'), false, 'nothing is sent while a field is wrong');
  await page.keyboard.press('Escape');
  await dlg.waitFor({ state: 'detached' });
  assert.equal(await on(page), 'edit-target:t1', 'the focus goes back to the header');
});

await test('pausing a harness in its sheet saves it and the column says Paused', 'changes', {}, async app => {
  const { page } = app, dlg = dialog(page).first();
  await column(page, 'Codex isolated test').click();
  assert.equal(await dlg.getByLabel('Keep this harness in sync').isChecked(), true);
  await dlg.getByLabel('Keep this harness in sync').uncheck();
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await dlg.waitFor({ state: 'detached' });
  await page.locator('th .hstate').getByText('Paused').waitFor();
  const saved = (await callsOf(app, 'save_target')).at(-1).payload;
  assert.equal(saved.target.enabled, false);assert.equal(saved.target.id, 't1');assert.equal(saved.target.root, 'D:/isolated/codex');assert.equal(saved.revision, 1);
  assert.equal(await toast(page).first().textContent(), 'Codex isolated test saved.');
  assert.deepEqual((await actions(app)).slice(-2), ['save_target', 'plan'], 'one plan after the save');
});

await test('a refused save keeps the sheet and its values, with the reason; Stop managing asks first', 'two-harnesses', {}, async app => {
  const { page } = app, dlg = dialog(page).first();
  await column(page, 'OpenCode isolated test').click();
  await dlg.locator('[name=name]').fill('Renamed <b>');
  await app.flags({ rejectSave: true });
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await dlg.locator('#form-error').getByText('Version conflict').waitFor();
  assert.equal(await dlg.locator('[name=name]').inputValue(), 'Renamed <b>', 'the values stay');
  assert.equal(await dlg.getByRole('button', { name: 'Save', exact: true }).isEnabled(), true, 'and the sheet can try again');
  await app.flags({ rejectSave: false });
  await dlg.getByRole('button', { name: 'Stop managing' }).click();
  await dlg.locator('h2').getByText('Stop managing OpenCode isolated test?', { exact: true }).waitFor();
  await dlg.getByText('Its plugins stay installed. Muro only stops syncing it.').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-confirm')), true, 'the confirming button has the focus');
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  assert.equal((await actions(app)).includes('remove_target'), false, 'Cancel removes nothing');
  await column(page, 'OpenCode isolated test').click();
  await dlg.getByRole('button', { name: 'Stop managing' }).click();
  await dlg.getByRole('button', { name: 'Stop managing', exact: true }).click();
  await page.locator('th').getByText('OpenCode isolated test').waitFor({ state: 'detached' });
  assert.deepEqual((await actions(app)).slice(-2), ['remove_target', 'plan']);
  assert.equal(await toast(page).last().textContent(), 'Muro no longer manages OpenCode isolated test.');
});

// ---------- the Add harness menu ----------
await test('Add harness lists the harness found, opens its sheet with the folder filled in, and keeps the keyboard in order', 'changes', {}, async app => {
  const { page } = app, toggle = page.getByRole('button', { name: 'Add harness', exact: true }), menu = page.locator('.menu');
  await ready(page);
  assert.equal(await menu.isHidden(), true, 'closed at first');
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await toggle.click();
  assert.equal(await menu.isVisible(), true);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(await menu.getByRole('menuitem').allTextContents(), ['CCManage Claude Code', 'Add by hand…', 'Rescan this computer']);
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'CCManage Claude Code', 'the first choice has the focus');
  await page.screenshot({ path: shots + '/harness-menu.png' });
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Add by hand…');
  await page.keyboard.press('End');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Rescan this computer');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'CCManage Claude Code', 'it wraps');
  await page.keyboard.press('Escape');
  assert.equal(await menu.isHidden(), true, 'Escape closes it');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-action')), 'menu', 'and the keyboard goes back to its button');
  await toggle.click();
  await page.locator('h1').click();
  assert.equal(await menu.isHidden(), true, 'a click elsewhere closes it');
  await toggle.click();
  await menu.getByRole('menuitem', { name: /Manage Claude Code/ }).click();
  const dlg = dialog(page).first();
  await dlg.locator('h2').getByText('Add a harness', { exact: true }).waitFor();
  assert.equal(await menu.isHidden(), true, 'the menu closed on its own');
  assert.equal(await dlg.locator('[name=root]').inputValue(), 'D:/config/claude-code', 'the folder is the one found');
  assert.equal(await dlg.locator('[name=name]').inputValue(), 'Claude Code');
  assert.equal(await dlg.locator('[name=executable]').inputValue(), 'claude-code');
  assert.equal(await dlg.locator('[name=harness]').inputValue(), 'claude-code');
  await dlg.getByText('Muro filled in the folder where this harness keeps its plugin configuration by default.').waitFor();
  assert.equal(await focused(page, 'name'), 'name', 'a new harness starts in its name');
  await page.keyboard.press('Escape');
  await dlg.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-action')), 'menu', 'the keyboard is back at Add harness');
  await toggle.click();
  await menu.getByRole('menuitem', { name: /Manage Claude Code/ }).click();
  await dlg.getByRole('button', { name: 'Add harness', exact: true }).click();
  await dlg.waitFor({ state: 'detached' });
  await column(page, 'Claude Code').waitFor();
  const saved = (await callsOf(app, 'save_target')).at(-1).payload;
  assert.deepEqual({ ...saved.target, id: 'x' }, { id: 'x', harness: 'claude-code', name: 'Claude Code', root: 'D:/config/claude-code', executable: 'claude-code', enabled: true, exclusive: false });
  assert.deepEqual((await actions(app)).slice(-2), ['save_target', 'plan']);
  await toggle.click();
  await menu.getByText('No other harness found on this computer').waitFor();
  assert.deepEqual(await menu.getByRole('menuitem').allTextContents(), ['Add by hand…', 'Rescan this computer'], 'a harness that is managed is not offered again');
});

await test('Add by hand opens an empty sheet and Rescan reads the computer again', 'changes', {}, async app => {
  const { page } = app, toggle = page.getByRole('button', { name: 'Add harness', exact: true }), menu = page.locator('.menu'), dlg = dialog(page).first();
  await ready(page);
  await toggle.click();
  await menu.getByRole('menuitem', { name: 'Add by hand…' }).click();
  await dlg.locator('h2').getByText('Add a harness', { exact: true }).waitFor();
  assert.equal(await dlg.locator('[name=root]').inputValue(), '', 'no folder is made up');
  await dlg.getByText('Tell Muro where this harness keeps its plugin configuration.').waitFor();
  assert.equal(await dlg.getByRole('button', { name: 'Stop managing' }).count(), 0, 'nothing to stop managing yet');
  assert.equal(await dlg.getByText('Installed here').count(), 0);
  await dlg.getByRole('button', { name: 'Add harness', exact: true }).click();
  assert.equal(await errorOf(dlg, 'name').textContent(), 'Give the harness a name.');
  assert.equal(await errorOf(dlg, 'root').textContent(), 'Enter the configuration folder.');
  assert.equal(await focused(page, 'name'), 'name');
  await page.keyboard.press('Escape');
  await dlg.waitFor({ state: 'detached' });
  const before = (await app.calls()).length;
  await toggle.click();
  await menu.getByRole('menuitem', { name: 'Rescan this computer' }).click();
  await page.waitForFunction(n => window.calls.length >= n + 3, before);
  assert.deepEqual((await actions(app)).slice(before), ['scan', 'plan', 'discover']);
});

// ---------- plugins outside the list ----------
await test('Always uninstall lists the removal before Apply', 'unlisted', {}, async app => {
  const { page } = app;
  await page.getByRole('heading', { name: 'Installed, not in your list' }).waitFor();
  const line = page.locator('ul.list li').filter({ hasText: 'old-snippets' });
  assert.match(await line.textContent(), /0\.2\.0 · on Codex isolated test/);
  await line.getByText('Left alone', { exact: true }).waitFor();
  assert.equal(await page.getByRole('radio', { name: 'Leave alone' }).isChecked(), true);
  await page.screenshot({ path: shots + '/harness-unlisted.png' });
  await page.getByRole('radio', { name: 'Always uninstall' }).check({ force: true });
  await line.getByText('Removed at the next sync', { exact: true }).waitFor();
  const saved = (await callsOf(app, 'save_target')).at(-1).payload;
  assert.equal(saved.target.exclusive, true);assert.equal(saved.target.id, 't1');assert.equal(saved.revision, 1);
  assert.equal(await toast(page).first().textContent(), 'Saved. Plugins outside your list are uninstalled at the next sync.');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('value')), 'remove', 'the radio keeps the focus');
  assert.deepEqual((await actions(app)).slice(-2), ['save_target', 'plan'], 'the plan is asked for after the save, and nothing is applied');
  await page.locator('section.strip strong').getByText('1 change ready to apply').waitFor();
  assert.match(await page.locator('section.strip small').first().textContent(), /1 removal/);
  await page.screenshot({ path: shots + '/harness-unlisted-removal.png' });
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  const sheet = page.locator('dialog.sheet[open]');
  await sheet.getByText('Remove', { exact: true }).waitFor();
  await sheet.getByText('old-snippets').waitFor();
  await sheet.getByText('1 plugin will be uninstalled.').waitFor();
  assert.equal((await actions(app)).includes('apply'), false, 'looking is not applying');
  await page.screenshot({ path: shots + '/harness-unlisted-review.png' });
  await page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });
  await page.getByRole('radio', { name: 'Leave alone' }).check({ force: true });
  await line.getByText('Left alone', { exact: true }).waitFor();
  assert.equal((await callsOf(app, 'save_target')).at(-1).payload.target.exclusive, false);
  assert.equal((await callsOf(app, 'save_target')).at(-1).payload.revision, 2, 'with the revision the first save returned');
});

await test('the rule is saved harness by harness; it stops at the first one that fails, says so, and keeps the ones saved', 'unlisted', {}, async app => {
  const { page } = app, dlg = dialog(page).first(), toggle = page.getByRole('button', { name: 'Add harness', exact: true });
  await ready(page);
  await toggle.click();
  await page.getByRole('menuitem', { name: 'Add by hand…' }).click();
  await dlg.locator('[name=name]').fill('Second');
  await dlg.locator('[name=root]').fill('D:/second');
  await dlg.locator('[name=executable]').fill('second');
  await dlg.getByRole('button', { name: 'Add harness', exact: true }).click();
  await dlg.waitFor({ state: 'detached' });
  await column(page, 'Second').waitFor();
  const before = (await callsOf(app, 'save_target')).length;
  // The second save of the rule is the one the fixture refuses.
  await page.evaluate(() => { let reads = 0; Object.defineProperty(window.flags, 'rejectSave', { get: () => ++reads >= 2, configurable: true }); });
  await page.getByRole('radio', { name: 'Always uninstall' }).click({ force: true });
  await page.getByRole('alert').filter({ hasText: 'was not saved' }).waitFor();
  const saves = (await callsOf(app, 'save_target')).slice(before);
  assert.equal(saves.length, 2, 'it did not go on after the failure');
  assert.deepEqual(saves.map(c => c.payload.target.id), ['t1', saves[1].payload.target.id]);
  assert.equal(saves[0].payload.target.exclusive, true);
  assert.equal(saves[1].payload.revision, saves[0].payload.revision + 1, 'the second save carries the revision the first one returned');
  assert.match(await page.getByRole('alert').filter({ hasText: 'was not saved' }).textContent(), /1 harness saved\. Second was not saved: Version conflict/);
  await page.getByText('Differs per harness').waitFor();
  assert.equal(await page.getByRole('radio', { name: 'Always uninstall' }).isChecked(), false, 'neither choice claims what is half done');
  await page.locator('ul.list li').filter({ hasText: 'old-snippets' }).getByText('Removed at the next sync').waitFor();
  await page.evaluate(() => { delete window.flags.rejectSave; window.flags.rejectSave = false; });
  await page.getByRole('button', { name: 'Reload' }).click();
  await page.getByRole('radio', { name: 'Always uninstall' }).click({ force: true });
  await page.getByRole('radio', { name: 'Always uninstall' }).waitFor();
  await page.waitForFunction(() => document.querySelector('input[name=excl][value=remove]')?.checked === true);
  const again = (await callsOf(app, 'save_target')).slice(before + 2);
  assert.deepEqual(again.map(c => c.payload.target.id).filter(id => id === 't1'), [], 'the harness already saved is not saved again');
  assert.equal(again.length, 1);
});

await test('Add to my list calls save_plugin and the plugin becomes a row; the line is gone', 'unlisted', {}, async app => {
  const { page } = app;
  await page.locator('ul.list li').filter({ hasText: 'old-snippets' }).getByRole('button', { name: 'Add to my list' }).click();
  await page.locator('#rows').getByRole('button', { name: /^old-snippets/ }).waitFor();
  const saved = (await callsOf(app, 'save_plugin')).at(-1).payload;
  assert.deepEqual({ ...saved.plugin, id: 'x' }, { id: 'x', name: 'old-snippets', source: 'D:/plugins/old-snippets', policy: 'pinned', pinned_version: '0.2.0', targets: ['t1'], distributions: [{ harness: 'codex', path: 'D:/plugins/old-snippets', version: '0.2.0' }] });
  assert.equal(saved.revision, 1);
  assert.equal(await toast(page).first().textContent(), 'old-snippets added to your list.');
  assert.equal(await page.getByText('Installed, not in your list').count(), 0, 'what the list holds is no longer outside it');
  assert.equal(await page.getByRole('heading', { name: 'Installed, not in your list' }).count(), 0);
  assert.deepEqual((await actions(app)).slice(-2), ['save_plugin', 'plan']);
});

await test('a plugin added to the list while Always uninstall is on is not shown as removed', 'unlisted', {}, async app => {
  const { page } = app, line = page.locator('ul.list li').filter({ hasText: 'old-snippets' });
  await page.getByRole('radio', { name: 'Always uninstall' }).click({ force: true });
  await line.getByText('Removed at the next sync', { exact: true }).waitFor();
  await line.getByRole('button', { name: 'Add to my list' }).click();
  await page.locator('#rows').getByRole('button', { name: /^old-snippets/ }).waitFor();
  assert.equal(await page.getByText('Removed at the next sync').count(), 0, 'it is in the list: the next sync keeps it');
  assert.equal(await page.getByRole('heading', { name: 'Installed, not in your list' }).count(), 0, 'and it is no longer in the section');
});

await test('the harness sheet lists what is installed there and adds a plugin to the list without closing', 'unlisted', {}, async app => {
  const { page } = app, dlg = dialog(page).first();
  await column(page, 'Codex isolated test').click();
  const here = dlg.locator('#installed-here');
  await here.getByText('Installed here').waitFor();
  assert.deepEqual(await here.locator('li strong').allTextContents(), ['Package', 'old-snippets']);
  await here.getByText('2 · in your list').waitFor();
  await here.getByText('0.2.0 · not in your list').waitFor();
  assert.equal(await here.getByRole('button', { name: 'Add to my list' }).count(), 1, 'only what is outside the list can be added');
  await dlg.locator('[name=name]').fill('Edited but not saved');
  await page.screenshot({ path: shots + '/harness-installed-here.png' });
  await here.getByRole('button', { name: 'Add to my list' }).click();
  await here.getByText('0.2.0 · in your list').waitFor();
  assert.equal(await dlg.locator('[name=name]').inputValue(), 'Edited but not saved', 'what the person typed stays');
  assert.equal(await here.getByRole('button', { name: 'Add to my list' }).count(), 0);
  assert.equal(await focused(page, 'inside'), true, 'the keyboard stays in the sheet');
  assert.equal((await callsOf(app, 'save_plugin')).length, 1);
  await page.keyboard.press('Escape');
  await dlg.waitFor({ state: 'detached' });
  await page.locator('#rows').getByRole('button', { name: /^old-snippets/ }).waitFor();
  assert.equal(await toast(page).first().textContent(), 'old-snippets added to your list.');
});

await test('a failed Add to my list says why inside the sheet, which stays', 'unlisted', {}, async app => {
  const { page } = app, dlg = dialog(page).first();
  await column(page, 'Codex isolated test').click();
  await app.flags({ rejectSave: true });
  await dlg.locator('#installed-here').getByRole('button', { name: 'Add to my list' }).click();
  await dlg.locator('#form-error').getByText('Version conflict').waitFor();
  assert.equal(await dlg.locator('#installed-here').getByRole('button', { name: 'Add to my list' }).isEnabled(), true, 'it can be tried again');
});

// ---------- the plugin dialog ----------
await test('a new plugin: wrong fields say so, the name follows the source, a refused save keeps the form, the saved one is a row', 'default', {}, async app => {
  const { page } = app, dlg = dialog(page).first();
  await page.getByRole('button', { name: 'Add plugin' }).first().click();
  await dlg.locator('h2').getByText('Add a plugin', { exact: true }).waitFor();
  assert.equal(await dlg.evaluate(d => d.classList.contains('sheet')), false, 'a dialog, not a sheet');
  assert.equal(await focused(page, 'name'), 'source', 'it starts in the source');
  assert.equal(await dlg.getByRole('checkbox', { name: 'Codex isolated test' }).isChecked(), true, 'every enabled harness is checked');
  assert.equal(await dlg.getByText('More', { exact: true }).count(), 0, 'a plugin that is not in the list has no More');
  assert.equal(await dlg.locator('[name=pinned_version]').isVisible(), false, 'Pinned version shows only for a pinned plugin');
  await dlg.getByRole('button', { name: 'Add plugin', exact: true }).click();
  assert.equal(await errorOf(dlg, 'source').textContent(), 'Enter where the plugin comes from.');
  assert.equal(await errorOf(dlg, 'name').textContent(), 'Give the plugin a name.');
  assert.equal(await focused(page, 'name'), 'source');
  assert.equal(await dlg.locator('[name=source]').getAttribute('aria-invalid'), 'true');
  await dlg.locator('[name=source]').fill('https://github.com/owner/my-plugin.git');
  assert.equal(await dlg.locator('[name=name]').inputValue(), 'my-plugin', 'the name follows the source');
  assert.equal(await errorOf(dlg, 'name').textContent(), '', 'and its error goes');
  await dlg.locator('[name=name]').fill('<Test plugin>');
  await dlg.locator('[name=source]').fill('https://example.com/plugin');
  assert.equal(await dlg.locator('[name=name]').inputValue(), '<Test plugin>', 'a name that was typed stays');
  await dlg.getByRole('radio', { name: 'Pinned version' }).check({ force: true });
  await dlg.locator('[name=pinned_version]').waitFor({ state: 'visible' });
  await dlg.getByRole('button', { name: 'Add plugin', exact: true }).click();
  assert.equal(await errorOf(dlg, 'pinned_version').textContent(), 'A pinned plugin needs a version.');
  assert.equal(await focused(page, 'name'), 'pinned_version');
  await dlg.getByRole('radio', { name: 'Latest release' }).check({ force: true });
  assert.equal(await dlg.locator('[name=pinned_version]').isVisible(), false);
  await dlg.getByText('Advanced', { exact: true }).click();
  await dlg.getByLabel('Custom instructions folder').fill('D:/custom notes');
  await dlg.getByRole('button', { name: 'Add build' }).click();
  assert.equal(await focused(page, 'name'), 'distribution_harness', 'a new build starts in its harness');
  await dlg.getByRole('button', { name: 'Add plugin', exact: true }).click();
  assert.equal(await errorOf(dlg, 'distributions').textContent(), 'Each build needs a folder and a version.');
  await dlg.getByLabel('Build folder').fill('D:/artifact');
  await dlg.getByLabel('Version', { exact: true }).fill('1');
  await page.screenshot({ path: shots + '/harness-plugin-new.png' });
  await app.flags({ rejectSave: true });
  await dlg.getByRole('button', { name: 'Add plugin', exact: true }).click();
  await dlg.locator('#form-error').getByText('Version conflict').waitFor();
  assert.equal(await dlg.locator('[name=name]').inputValue(), '<Test plugin>', 'a failed save keeps the form');
  assert.equal(await dlg.getByLabel('Build folder').inputValue(), 'D:/artifact');
  await app.flags({ rejectSave: false });
  await dlg.getByRole('button', { name: 'Add plugin', exact: true }).click();
  await dlg.waitFor({ state: 'detached' });
  await rowOf(page, '<Test plugin>').waitFor();
  assert.equal(await page.locator('test').count(), 0, 'the name is escaped');
  assert.equal(await toast(page).first().textContent(), 'Saved.');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Add plugin', 'the keyboard goes back to where the dialog was opened');
  assert.equal((await callsOf(app, 'save_plugin')).at(-1).payload.plugin.custom_instructions_dir, 'D:/custom notes');
});

await test('a plugin row opens its dialog: edits keep what the form does not show, a changed source drops the builds', 'default', {}, async app => {
  const { page } = app, dlg = dialog(page).first();
  await page.getByRole('button', { name: 'Add plugin' }).first().click();
  await dlg.locator('[name=name]').fill('Pkg');
  await dlg.locator('[name=source]').fill('https://example.com/plugin');
  await dlg.getByText('Advanced', { exact: true }).click();
  await dlg.getByLabel('Custom instructions folder').fill('D:/custom notes');
  await dlg.getByRole('button', { name: 'Add build' }).click();
  await dlg.getByLabel('Build folder').fill('D:/artifact');
  await dlg.getByLabel('Version', { exact: true }).fill('1');
  await dlg.getByRole('button', { name: 'Add plugin', exact: true }).click();
  await dlg.waitFor({ state: 'detached' });
  await rowOf(page, 'Pkg').click();
  await dlg.locator('h2').getByText('Pkg', { exact: true }).waitFor();
  assert.equal(await dlg.getByRole('button', { name: 'Save', exact: true }).count(), 1);
  assert.equal(await dlg.getByText('Changing the source removes the prepared builds', { exact: false }).count(), 1);
  await dlg.locator('[name=name]').fill('Pkg renamed');
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await dlg.waitFor({ state: 'detached' });
  await rowOf(page, 'Pkg renamed').waitFor();
  let saved = (await callsOf(app, 'save_plugin')).at(-1).payload.plugin;
  assert.equal(saved.upstream_version, 'v-native', 'editing keeps the upstream metadata');
  assert.equal(saved.distributions[0].origin, 'muro', 'and where each build comes from');
  assert.equal(saved.distributions[0].custom_instructions_digest, 'old-instructions', 'and the instructions it was built from');
  assert.equal(saved.custom_instructions_dir, 'D:/custom notes');
  await rowOf(page, 'Pkg renamed').click();
  await dlg.locator('[name=source]').fill('https://example.com/replacement-plugin');
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await dlg.waitFor({ state: 'detached' });
  saved = (await callsOf(app, 'save_plugin')).at(-1).payload.plugin;
  assert.deepEqual(saved.distributions, [], 'a changed source drops every build of the old one');
  assert.equal(saved.upstream_version, undefined);assert.equal(saved.upstream_revision, undefined);
  assert.equal(saved.custom_instructions_dir, 'D:/custom notes', 'the instructions folder stays');
  await rowOf(page, 'Pkg renamed').click();
  assert.equal(await dlg.locator('.distribution-row').count(), 0, 'the old builds do not come back');
  await dlg.getByText('Advanced', { exact: true }).click();
  await dlg.getByLabel('Custom instructions folder').fill('');
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await dlg.waitFor({ state: 'detached' });
  assert.equal((await callsOf(app, 'save_plugin')).at(-1).payload.plugin.custom_instructions_dir, undefined, 'an empty folder goes back to the one Muro keeps');
  await rowOf(page, 'Pkg renamed').click();
  await dlg.getByText('Custom instructions · none yet', { exact: true }).click();
  await dlg.getByText('D:/isolated/data/custom-instructions/' + saved.id, { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await dlg.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.closest('#rows') !== null), true, 'the keyboard goes back to the row');
});

await test('the instructions of a plugin: reload them, open their folder, and a warning when they changed', 'changes', {}, async app => {
  const { page } = app, dlg = dialog(page).first();
  await rowOf(page, 'Package').click();
  await dlg.getByText('Custom instructions · none yet', { exact: true }).click();
  await dlg.getByText('More', { exact: true }).click();
  await dlg.getByRole('button', { name: 'Open instructions folder' }).click();
  await dlg.locator('#notes-status').getByText('Folder opened. Edit the Markdown files, reload them, then adapt the plugin again.').waitFor();
  assert.deepEqual((await callsOf(app, 'open_custom_instructions')).map(c => c.payload), [{ id: 'p1' }], 'the folder opens on request and for this plugin');
  assert.equal(await dlg.count(), 1, 'the dialog stays');
  await app.flags({ instructionFiles: ['custom-instructions/nested/<recap>.md'], instructionStale: true });
  await dlg.getByRole('button', { name: 'Reload files' }).click();
  await dlg.getByText('Instructions changed. Adapt again for: Codex.').waitFor();
  await dlg.getByText('Custom instructions · 1 Markdown file', { exact: true }).waitFor();
  await dlg.getByText('custom-instructions/nested/<recap>.md', { exact: true }).waitFor();
  assert.equal(await page.locator('recap').count(), 0, 'Markdown file names are escaped');
  assert.equal(await dlg.locator('details#instructions-p1').evaluate(d => d.open), true, 'the section stays open');
  assert.equal(await focused(page, 'text'), 'Reload files', 'and the keyboard stays on the button');
  await app.flags({ instructionFiles: [] });
  await dlg.getByRole('button', { name: 'Reload files' }).click();
  await dlg.getByText('Custom instructions · none yet', { exact: true }).waitFor();
  await dlg.getByText('Instructions changed. Adapt again for: Codex.').waitFor();
});

await test('More: Check for updates, Adapt with AI, Plan a reinstall, Remove from my list', 'changes', {}, async app => {
  const { page } = app, dlg = dialog(page).first();
  await rowOf(page, 'Package').click();
  await dlg.locator('h2').getByText('Package', { exact: true }).waitFor();
  assert.equal(await dlg.locator('#plugin-more').evaluate(d => d.open), false, 'More is closed at first');
  await dlg.getByText('More', { exact: true }).click();
  assert.deepEqual(await dlg.locator('#plugin-more button').allTextContents(), ['Check for updates', 'Adapt with AI', 'Plan a reinstall', 'Open instructions folder', 'Remove from my list']);
  await page.screenshot({ path: shots + '/harness-plugin-more.png' });
  // Check for updates
  await dlg.getByRole('button', { name: 'Check for updates' }).click();
  await dlg.waitFor({ state: 'detached' });
  assert.deepEqual((await callsOf(app, 'resolve')).map(c => c.payload), [{ id: 'p1' }]);
  assert.equal(await toast(page).first().textContent(), 'Package: no new version.');
  // Adapt with AI: the budget must be above zero
  await rowOf(page, 'Package').click();
  await dlg.getByText('More', { exact: true }).click();
  await dlg.getByRole('button', { name: 'Adapt with AI' }).click();
  await dlg.locator('h2').getByText('Adapt Package with AI', { exact: true }).waitFor();
  assert.equal(await dlg.locator('[name=budget]').inputValue(), '2');
  await page.screenshot({ path: shots + '/harness-adapt.png' });
  await dlg.locator('[name=budget]').fill('0');
  await dlg.getByRole('button', { name: 'Start' }).click();
  assert.equal(await errorOf(dlg, 'budget').textContent(), 'Enter a budget above zero.');
  assert.equal(await dlg.locator('[name=budget]').getAttribute('aria-invalid'), 'true');
  assert.equal(await focused(page, 'name'), 'budget');
  assert.equal((await actions(app)).includes('adapt'), false);
  await dlg.locator('[name=budget]').fill('3');
  await dlg.locator('[name=harness]').selectOption('opencode');
  await dlg.getByRole('button', { name: 'Start' }).click();
  await dlg.waitFor({ state: 'detached' });
  assert.deepEqual((await callsOf(app, 'adapt')).map(c => c.payload), [{ id: 'p1', harness: 'opencode', agent: 'claude-code', budget_usd: 3 }]);
  assert.equal(await toast(page).last().textContent(), 'Started. Follow it in Activity.');
  await page.getByRole('button', { name: 'Activity, 1 run in progress' }).waitFor();
  // Plan a reinstall: the plan is for the sheet; the strip does not take it
  await rowOf(page, 'Package').click();
  await dlg.getByText('More', { exact: true }).click();
  await dlg.getByRole('button', { name: 'Plan a reinstall' }).click();
  const sheet = page.locator('dialog.sheet[open]');
  await sheet.locator('h2').getByText('Review changes', { exact: true }).waitFor();
  assert.deepEqual((await callsOf(app, 'plan')).at(-1).payload, { reinstall: 'p1' });
  await sheet.getByText('Reinstall', { exact: true }).waitFor();
  await page.screenshot({ path: shots + '/harness-reinstall.png' });
  await page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });
  assert.equal(await page.locator('section.strip strong').textContent(), '1 change ready to apply', 'the strip keeps the plan it had');
  assert.doesNotMatch(await page.locator('section.strip small').first().textContent(), /reinstall/, 'and the reinstall is not in it');
  assert.equal((await actions(app)).includes('apply'), false);
  // Remove from my list asks first
  await rowOf(page, 'Package').click();
  await dlg.getByText('More', { exact: true }).click();
  await dlg.getByRole('button', { name: 'Remove from my list' }).click();
  await dlg.locator('h2').getByText('Remove Package from your list?', { exact: true }).waitFor();
  await dlg.getByText('It stays installed where it is, unless plugins outside your list are always uninstalled.').waitFor();
  assert.equal((await actions(app)).includes('remove_plugin'), false, 'nothing is removed before the person agrees');
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-confirm')), true);
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  assert.equal((await actions(app)).includes('remove_plugin'), false);
  await rowOf(page, 'Package').click();
  await dlg.getByText('More', { exact: true }).click();
  await dlg.getByRole('button', { name: 'Remove from my list' }).click();
  await dlg.getByRole('button', { name: 'Remove', exact: true }).click();
  await rowOf(page, 'Package').waitFor({ state: 'detached' });
  const removed = (await callsOf(app, 'remove_plugin')).at(-1).payload;
  assert.equal(removed.id, 'p1');assert.equal(typeof removed.revision, 'number');
  assert.equal(await toast(page).last().textContent(), 'Package removed from your list.');
  assert.deepEqual((await actions(app)).slice(-2), ['remove_plugin', 'plan']);
  await page.getByText('Your list is empty').waitFor();
});

await test('More acts on the saved plugin: with unsaved changes it says so and does nothing', 'changes', {}, async app => {
  const { page } = app, dlg = dialog(page).first();
  await rowOf(page, 'Package').click();
  await dlg.locator('[name=name]').fill('Package, edited');
  await dlg.getByText('More', { exact: true }).click();
  for (const name of ['Check for updates', 'Adapt with AI', 'Plan a reinstall']) {
    await dlg.getByRole('button', { name }).click();
    await dlg.locator('#form-error').getByText('Save your changes first: this acts on the saved plugin.').waitFor();
    assert.equal(await dlg.locator('[name=name]').inputValue(), 'Package, edited', 'the edit is still there');
    await dlg.locator('#form-error').evaluate(e => { e.textContent = ''; });
  }
  const sent = await actions(app);
  for (const action of ['resolve', 'adapt']) assert.equal(sent.includes(action), false, action);
  assert.equal((await callsOf(app, 'plan')).filter(c => c.payload.reinstall).length, 0);
});

await test('the dialogs and the menu fit a phone-width window, in the light theme', 'unlisted', { viewport: { width: 390, height: 844 }, colorScheme: 'light' }, async app => {
  const { page } = app, dlg = dialog(page).first();
  await page.locator('nav').waitFor();
  await page.screenshot({ path: shots + '/harness-narrow-page.png' });
  await ready(page);
  await page.getByRole('button', { name: 'Add harness', exact: true }).click();
  await page.screenshot({ path: shots + '/harness-narrow-menu.png' });
  assert.ok(await page.locator('.menu').evaluate(m => { const r = m.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; }), 'the menu stays on screen');
  await page.keyboard.press('Escape');
  await column(page, 'Codex isolated test').click();
  assert.ok(await dlg.evaluate(d => d.scrollWidth <= d.clientWidth + 1), 'nothing inside the sheet scrolls sideways');
  assert.ok(await dlg.evaluate(d => { const r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; }), 'and it fits the window');
  await page.screenshot({ path: shots + '/harness-narrow-sheet.png' });
  await page.keyboard.press('Escape');
  await dlg.waitFor({ state: 'detached' });
  await rowOf(page, 'Package').click();
  await dlg.getByText('Advanced', { exact: true }).click();
  await dlg.getByRole('button', { name: 'Add build' }).click();
  await dlg.getByText('More', { exact: true }).click();
  assert.ok(await dlg.evaluate(d => d.scrollWidth <= d.clientWidth + 1), 'nothing inside the plugin dialog scrolls sideways');
  assert.ok(await dlg.evaluate(d => { const r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; }), 'and it fits the window');
  await page.screenshot({ path: shots + '/harness-narrow-plugin.png' });
});

await test('the harness sheet and the plugin dialog in the light theme', 'unlisted', { colorScheme: 'light' }, async app => {
  const { page } = app, dlg = dialog(page).first();
  await column(page, 'Codex isolated test').click();
  await dlg.locator('#installed-here').waitFor();
  await page.screenshot({ path: shots + '/harness-sheet-light.png' });
  await page.keyboard.press('Escape');
  await dlg.waitFor({ state: 'detached' });
  await rowOf(page, 'Package').click();
  await dlg.getByText('More', { exact: true }).click();
  await page.screenshot({ path: shots + '/harness-plugin-light.png' });
});

console.log('PASS: ' + done.join('; '));
