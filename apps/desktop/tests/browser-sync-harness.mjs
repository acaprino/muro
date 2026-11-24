// Plan R1, Task 4: the harness side of the Sync page, on the fake transport (fake-transport.js): the harness inspector (a column header opens it), Add harness (a dialog), and "Installed, not in your
// list" (the section under the table). Ported from the old window's browser-harness.mjs. The page around them is another file's (Sync.tsx, SyncTable.tsx): its three entry points are the helpers
// `column`, `addHarnessButton` and `unlistedSection` and the table's rows, found by role and name, so one line each says where they are; everything inside the inspector, the dialog and the section
// is found by what it says and by Sigrid's own slots.
//   node apps/desktop/tests/browser-sync-harness.mjs        (MURO_UI_PORT moves the dev server off 1422; MURO_ONLY=<part of a test name> runs one test)
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

// ---------- where the page's own parts are ----------
/** The header of a harness in the table: the button with its name opens the inspector. */
const column = (page, name) => page.locator('th').getByRole('button', { name: new RegExp('^' + name) }).first();
const addHarnessButton = page => page.getByRole('button', { name: 'Add harness', exact: true });
const unlistedSection = page => page.getByRole('region', { name: 'Installed, not in your list' });
const rowOf = (page, name) => page.getByRole('row').filter({ hasText: name });

// ---------- the parts of this file ----------
/** The requests of the page about the sync and the registry; the AI runs' reading (`jobs`) is the window's own and comes when it likes. */
const actions = async app => (await app.calls()).map(c => c.action).filter(action => action !== 'jobs');
const callsOf = async (app, action) => (await app.calls()).filter(c => c.action === action);
/** The window has read the registry once: the footer says what it holds. */
const ready = page => page.locator('[data-slot="app-shell-footer"]').getByText(/in your list/).waitFor();
/** The inspector while it shows something: docked (an `aside`, `hidden` when closed) or, under 1000px, a panel over the end of the content. */
const inspector = page => page.locator('[data-inspector-form]:not([hidden])');
/** Add harness is a drawer from the right (Sigrid's `Dialog` with `drawer`); what it asks first is a centred dialog. */
const addDialog = page => page.locator('[data-slot="sheet-content"]').filter({ hasText: 'Add a harness' });
const confirmOf = (page, title) => page.locator('[data-slot="dialog-content"]').filter({ hasText: title });
const notice = (page, text) => page.locator('[data-toasts]').getByText(text, { exact: true });
const errorsOf = scope => scope.locator('[data-slot="field-error"]');
const focusedName = page => page.evaluate(() => document.activeElement?.getAttribute('name'));
/** The request after a write is a plan (the window plans again when the revision moved): the last call says so once it was made. */
const planned = page => page.waitForFunction(() => window.calls.filter(c => c.action !== 'jobs').at(-1)?.action === 'plan');
/** The keyboard is inside the inspector (a dialog over it gives it back on a timer when it closes). */
const insideInspector = page => page.waitForFunction(() => !!document.activeElement?.closest('[data-inspector-form]'));
const unnamed = scope => scope.evaluate(root => [...root.querySelectorAll('button, [role=switch], [role=checkbox], [role=radio], textarea, input:not([type=hidden])')].filter(e => {
  if (e.closest('[aria-hidden="true"]')) return false;
  const by = e.getAttribute('aria-labelledby');
  return !(e.getAttribute('aria-label') || (by && by.split(/\s+/).some(id => document.getElementById(id)?.textContent.trim())) || e.textContent.trim() || e.labels?.length);
}).map(e => e.outerHTML.slice(0, 120)));
/** Escape on the inspector: a form with changes asks once, and the test discards them. It waits for the question or for the closing, whichever comes (5s), and keeps a picture when neither does. */
const leave = async page => {
  await insideInspector(page);
  await page.keyboard.press('Escape');
  const discard = page.getByRole('button', { name: 'Discard changes' });
  for (const end = Date.now() + 5000; Date.now() < end;) {
    if (await discard.isVisible()) { await discard.click(); return; }
    if (await inspector(page).count() === 0) return;
    await page.waitForTimeout(50);
  }
  await page.screenshot({ path: shots + '/sync-harness-leave-failed.png' });
};
/** Opens the inspector of a harness from its column header and waits until the keyboard is in its name field. */
async function openHarness(page, name) {
  await ready(page);
  await column(page, name).click();
  const panel = inspector(page);
  await headingOf(panel, name).waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute('name') === 'name');
  return panel;
}
/** The heading of the inspector: a panel over the content (under 1000px) has it twice, once for the screen reader. */
const headingOf = (panel, name) => panel.getByRole('heading', { name, level: 2, exact: true }).first();
const saveOf = panel => panel.getByRole('button', { name: 'Save', exact: true });
/** A radio of the rule for plugins outside the list, and the wait for it to be the chosen one (the group follows the registry, so a click is not `check()`). */
const rule = (section, name) => section.getByRole('radio', { name, exact: true });
const chosen = (page, radio) => radio.and(page.locator('[aria-checked="true"]'));
/** Opens Add harness and waits for the search to end. */
async function openAdd(page) {
  await ready(page);
  await addHarnessButton(page).click();
  const dialog = addDialog(page);
  await dialog.getByRole('heading', { name: 'Add a harness' }).waitFor();
  await dialog.getByRole('status').filter({ hasText: 'Looking for harnesses' }).waitFor({ state: 'detached' });
  return dialog;
}
const addIn = dialog => dialog.getByRole('button', { name: 'Add harness', exact: true });

// ---------- the inspector ----------
await test('a column header opens the harness inspector; each wrong field says what is wrong, tied to the field, and takes the focus; nothing is sent while a field is wrong', 'changes', {}, async app => {
  const { page } = app;
  const panel = await openHarness(page, 'Codex isolated test');
  for (const label of ['Name', 'Configuration folder', 'Executable', 'Keep this harness in sync', 'Uninstall plugins that are not in my list']) await panel.getByLabel(label).first().waitFor();
  assert.equal(await panel.locator('[data-slot="select-trigger"]').textContent(), 'Codex', 'the kind of harness');
  await panel.getByText('Checked never · last sync never', { exact: true }).waitFor();
  assert.equal(await saveOf(panel).isDisabled(), true, 'nothing changed: nothing to save');
  await page.screenshot({ path: shots + '/sync-harness-inspector.png' });
  const root = panel.locator('input[name="root"]');
  await root.fill('');
  await saveOf(panel).click();
  assert.equal(await errorsOf(panel).first().textContent(), 'Enter the configuration folder.');
  assert.equal(await root.getAttribute('aria-invalid'), 'true');
  const errorId = await errorsOf(panel).first().getAttribute('id');
  assert.ok((await root.getAttribute('aria-describedby')).split(' ').includes(errorId), "the error is the field's description");
  assert.equal(await errorsOf(panel).first().getAttribute('role'), 'alert');
  assert.equal(await focusedName(page), 'root', 'the field with the error has the focus');
  await root.fill('codex');
  assert.equal(await errorsOf(panel).first().textContent(), 'Enter the full path of the folder, such as C:\\Users\\you\\.codex.', 'what is typed is checked again at once, once a save was tried');
  await panel.locator('input[name="name"]').fill('');
  await panel.locator('input[name="executable"]').fill('');
  await saveOf(panel).click();
  assert.deepEqual(await errorsOf(panel).allTextContents(), ['Give the harness a name.', 'Enter the full path of the folder, such as C:\\Users\\you\\.codex.', 'Enter the command or full path of the executable.'], 'in the order of the form');
  assert.equal(await focusedName(page), 'name', 'the first wrong field, in the order of the form');
  await page.screenshot({ path: shots + '/sync-harness-inspector-error.png' });
  assert.equal((await actions(app)).includes('save_target'), false, 'nothing is sent while a field is wrong');
  assert.deepEqual(await unnamed(panel), [], 'every control of the inspector has a name');
  await leave(page);
  await panel.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.closest('th') !== null), true, 'the keyboard goes back to the header');
});

await test('pausing a harness in its inspector saves it, with the revision, and the window plans again once', 'changes', {}, async app => {
  const { page } = app;
  const panel = await openHarness(page, 'Codex isolated test');
  const keep = panel.getByRole('checkbox', { name: 'Keep this harness in sync' });
  assert.equal(await keep.isChecked(), true);
  await keep.uncheck();
  await saveOf(panel).click();
  await panel.waitFor({ state: 'hidden' });
  await notice(page, 'Codex isolated test saved.').waitFor();
  const saved = (await callsOf(app, 'save_target')).at(-1).payload;
  assert.equal(saved.target.enabled, false);
  assert.equal(saved.target.id, 't1');
  assert.equal(saved.target.root, 'D:/isolated/codex');
  assert.equal(saved.revision, 1);
  await planned(page);
  assert.deepEqual((await actions(app)).slice(-2), ['save_target', 'plan'], 'one plan after the save');
  assert.equal((await callsOf(app, 'save_target')).length, 1, 'exactly one save_target');
});

await test('a refused save keeps the inspector and its values, with the reason; Stop managing asks first, then takes the harness off its plugins and removes it', 'two-harnesses', {}, async app => {
  const { page } = app;
  const panel = await openHarness(page, 'OpenCode isolated test');
  await panel.locator('input[name="name"]').fill('Renamed <b>');
  await app.flags({ rejectSave: true });
  await saveOf(panel).click();
  await panel.getByRole('alert').filter({ hasText: 'Version conflict' }).waitFor();
  assert.equal(await panel.locator('input[name="name"]').inputValue(), 'Renamed <b>', 'the values stay');
  assert.equal(await saveOf(panel).isEnabled(), true, 'and the inspector can try again');
  assert.equal(await page.locator('[data-slot="inspector"] b').count(), 0, 'what was typed is text');
  await app.flags({ rejectSave: false });
  await panel.getByRole('button', { name: 'Stop managing', exact: true }).click();
  const ask = confirmOf(page, 'Stop managing OpenCode isolated test?');
  await ask.waitFor();
  await ask.getByText('Its plugins stay installed. Muro only stops syncing it.').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Cancel', 'Cancel has the focus');
  await ask.getByRole('button', { name: 'Cancel', exact: true }).click();
  await ask.waitFor({ state: 'detached' });
  assert.equal((await actions(app)).includes('remove_target'), false, 'Cancel removes nothing');
  assert.equal(await panel.locator('input[name="name"]').inputValue(), 'Renamed <b>', 'and the form still holds what was typed');
  await leave(page);
  await panel.waitFor({ state: 'hidden' });
  await column(page, 'OpenCode isolated test').click();
  await headingOf(panel, 'OpenCode isolated test').waitFor();
  await panel.getByRole('button', { name: 'Stop managing', exact: true }).click();
  await confirmOf(page, 'Stop managing OpenCode isolated test?').getByRole('button', { name: 'Stop managing OpenCode isolated test', exact: true }).click();
  await page.locator('th').filter({ hasText: 'OpenCode isolated test' }).waitFor({ state: 'detached' });
  await planned(page);
  assert.deepEqual((await actions(app)).slice(-3), ['save_plugin', 'remove_target', 'plan'], 'the plugin that listed it is saved without it first, then the harness goes, then one plan');
  assert.deepEqual((await callsOf(app, 'save_plugin')).at(-1).payload.plugin.targets, ['t1']);
  await notice(page, 'Muro no longer manages OpenCode isolated test.').waitFor();
});

await test('a harness opens in the docked inspector at 1512 and the table stays beside it; Escape closes it, and a change asks once and keeps what was typed', 'changes', {}, async app => {
  const { page } = app;
  const panel = await openHarness(page, 'Codex isolated test');
  assert.equal(await panel.getAttribute('data-inspector-form'), 'docked');
  const [table, side] = await Promise.all([page.getByRole('table').first().boundingBox(), panel.boundingBox()]);
  assert.ok(table.x + table.width <= side.x + 1, 'docked beside the table, never over it');
  assert.equal(await column(page, 'Codex isolated test').isEnabled(), true, 'the table is still usable');
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden' });
  await column(page, 'Codex isolated test').click();
  await panel.locator('input[name="name"]').fill('Renamed');
  await page.keyboard.press('Escape');
  await confirmOf(page, 'Discard changes to Codex isolated test?').waitFor();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  assert.equal(await panel.locator('input[name="name"]').inputValue(), 'Renamed', 'Keep editing keeps the form and its values');
  assert.equal((await actions(app)).includes('save_target'), false);
  await insideInspector(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await panel.waitFor({ state: 'hidden' });
});

await test('another harness over a form with changes asks first, and Keep editing stays on the first one', 'two-harnesses', {}, async app => {
  const { page } = app;
  const panel = await openHarness(page, 'Codex isolated test');
  await panel.locator('input[name="name"]').fill('Edited');
  await column(page, 'OpenCode isolated test').click();
  await confirmOf(page, 'Discard changes to Codex isolated test?').waitFor();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await headingOf(panel, 'Codex isolated test').waitFor();
  assert.equal(await panel.locator('input[name="name"]').inputValue(), 'Edited', 'Keep editing keeps the first form');
});

await test('what was typed survives the registry moving under the open inspector, and the save lands on the new revision', 'changes', {}, async app => {
  const { page } = app;
  const panel = await openHarness(page, 'Codex isolated test');
  await panel.locator('input[name="name"]').fill('Typed');
  const reads = (await callsOf(app, 'snapshot')).length;
  await page.evaluate(() => { window.behind.bump(); window.shown(); });
  await page.waitForFunction(n => window.calls.filter(c => c.action === 'snapshot').length > n, reads);
  await page.waitForTimeout(200);   // the answer is adopted and drawn
  assert.equal(await panel.locator('input[name="name"]').inputValue(), 'Typed', 'the window read the registry again and the form did not change');
  await saveOf(panel).click();
  await panel.waitFor({ state: 'hidden' });
  assert.equal((await callsOf(app, 'save_target')).at(-1).payload.revision, 2, 'the save carries the revision the window holds now');
  assert.equal((await callsOf(app, 'save_target')).length, 1);
});

await test('a save made on a registry that moved is read again and sent once more on the new revision', 'changes', {}, async app => {
  const { page } = app;
  const panel = await openHarness(page, 'Codex isolated test');
  await panel.locator('input[name="name"]').fill('Typed');
  await page.evaluate(() => window.behind.bump());
  const before = (await actions(app)).length;
  await saveOf(panel).click();
  await panel.waitFor({ state: 'hidden' });
  assert.deepEqual((await actions(app)).slice(before, before + 3), ['save_target', 'snapshot', 'save_target']);
  const sent = await callsOf(app, 'save_target');
  assert.deepEqual(sent.map(c => c.payload.revision), [1, 2]);
  await notice(page, 'Typed saved.').waitFor();
});

// ---------- what is installed there ----------
await test('the inspector lists what is installed there and adds a plugin to the list without closing, saying so in its own line', 'unlisted', {}, async app => {
  const { page } = app;
  const panel = await openHarness(page, 'Codex isolated test');
  const here = panel.getByRole('region', { name: 'Installed here' });
  await here.getByText('2 · in your list', { exact: true }).waitFor();
  await here.getByText('0.2.0 · not in your list', { exact: true }).waitFor();
  await here.getByText('Package', { exact: true }).waitFor();
  await here.getByText('old-snippets', { exact: true }).waitFor();
  assert.equal(await here.getByRole('button', { name: /Add to my list/ }).count(), 1, 'only what is outside the list can be added');
  await panel.locator('input[name="name"]').fill('Edited but not saved');
  await page.screenshot({ path: shots + '/sync-harness-installed.png' });
  await here.getByRole('button', { name: /Add to my list/ }).click();
  await here.getByText('0.2.0 · in your list', { exact: true }).waitFor();
  await here.getByText('old-snippets added to your list.', { exact: true }).waitFor();
  assert.equal(await panel.locator('input[name="name"]').inputValue(), 'Edited but not saved', 'what the person typed stays');
  assert.equal(await here.getByRole('button', { name: /Add to my list/ }).count(), 0);
  assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[data-inspector-form]')), true, 'the keyboard stays in the inspector');
  assert.equal(await page.locator('[data-toasts]').getByText('old-snippets added to your list.').count(), 0, 'no notice over the inspector: it says so itself');
  assert.equal((await callsOf(app, 'save_plugin')).length, 1);
  await leave(page);
  await panel.waitFor({ state: 'hidden' });
  await rowOf(page, 'old-snippets').first().waitFor();
});

await test('a failed Add to my list says why inside the inspector, which stays and can try again', 'unlisted', {}, async app => {
  const { page } = app;
  const panel = await openHarness(page, 'Codex isolated test');
  await app.flags({ rejectSave: true });
  const add = panel.getByRole('region', { name: 'Installed here' }).getByRole('button', { name: /Add to my list/ });
  await add.click();
  await panel.getByRole('alert').filter({ hasText: 'Version conflict' }).waitFor();
  assert.equal(await add.isEnabled(), true, 'it can be tried again');
});

// ---------- Add harness ----------
await test('Add harness lists the harness found with its folder and executable, fills the fields in when one is chosen, and saves it as a new harness', 'changes', {}, async app => {
  const { page } = app;
  const dialog = await openAdd(page);
  const found = dialog.getByRole('radio', { name: 'Claude Code', exact: true });
  await found.waitFor();
  assert.match(await dialog.textContent(), /D:\/config\/claude-code · claude-code/, 'the folder and the executable are shown');
  assert.equal(await dialog.locator('input[name="root"]').inputValue(), '', 'nothing is made up before a choice');
  await dialog.getByText('Tell Muro where this harness keeps its plugin configuration.').waitFor();
  await found.click();
  assert.equal(await dialog.locator('input[name="name"]').inputValue(), 'Claude Code');
  assert.equal(await dialog.locator('input[name="root"]').inputValue(), 'D:/config/claude-code', 'the folder is the one found');
  assert.equal(await dialog.locator('input[name="executable"]').inputValue(), 'claude-code');
  assert.equal(await dialog.locator('[data-slot="select-trigger"]').textContent(), 'Claude Code');
  await dialog.getByText('Muro filled in the folder where this harness keeps its plugin configuration by default. Change it for a custom installation.').waitFor();
  await page.screenshot({ path: shots + '/sync-harness-add.png' });
  assert.deepEqual(await unnamed(dialog), [], 'every control of the dialog has a name');
  await dialog.getByRole('radio', { name: 'Another harness, by hand', exact: true }).click();
  assert.equal(await dialog.locator('input[name="root"]').inputValue(), '', 'by hand empties the fields a harness found filled');
  await found.click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  assert.equal((await actions(app)).includes('save_target'), false, 'Cancel saves nothing');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.includes('Add harness')), true, 'the keyboard is back at Add harness');
  const again = await openAdd(page);
  assert.equal(await again.locator('input[name="name"]').inputValue(), '', 'the dialog starts empty again');
  await again.getByRole('radio', { name: 'Claude Code', exact: true }).click();
  await addIn(again).click();
  await again.waitFor({ state: 'detached' });
  await column(page, 'Claude Code').waitFor();
  await planned(page);
  const saved = (await callsOf(app, 'save_target')).at(-1).payload;
  assert.deepEqual({ ...saved.target, id: 'x' }, { id: 'x', harness: 'claude-code', name: 'Claude Code', root: 'D:/config/claude-code', executable: 'claude-code', enabled: true, exclusive: false });
  assert.equal(saved.revision, 1);
  assert.deepEqual((await actions(app)).slice(-2), ['save_target', 'plan']);
  await notice(page, 'Claude Code saved.').waitFor();
  const last = await openAdd(page);
  assert.equal(await last.getByRole('radio', { name: 'Claude Code', exact: true }).count(), 0, 'a harness that is managed is not offered again');
  await last.getByText('No other harness found on this computer', { exact: true }).waitFor();
});

await test('Add by hand: every wrong field says so before anything is sent, a refused save keeps the dialog and its values, and the kind of harness is saved as chosen', 'changes', {}, async app => {
  const { page } = app;
  const dialog = await openAdd(page);
  await dialog.getByRole('radio', { name: 'Another harness, by hand', exact: true }).click();
  await addIn(dialog).click();
  assert.deepEqual(await errorsOf(dialog).allTextContents(), ['Give the harness a name.', 'Enter the configuration folder.', 'Enter the command or full path of the executable.']);
  assert.equal(await focusedName(page), 'name');
  assert.equal((await actions(app)).includes('save_target'), false);
  await dialog.locator('input[name="name"]').fill('Second');
  await dialog.locator('input[name="root"]').fill('D:/second');
  await dialog.locator('input[name="executable"]').fill('second');
  await dialog.locator('[data-slot="select-trigger"]').click();
  await page.getByRole('option', { name: 'OpenCode', exact: true }).click();
  await app.flags({ rejectSave: true });
  await addIn(dialog).click();
  await dialog.getByRole('alert').filter({ hasText: 'Version conflict' }).waitFor();
  assert.equal(await dialog.locator('input[name="root"]').inputValue(), 'D:/second', 'the values stay');
  await app.flags({ rejectSave: false });
  await addIn(dialog).click();
  await dialog.waitFor({ state: 'detached' });
  await column(page, 'Second').waitFor();
  const saved = (await callsOf(app, 'save_target')).at(-1).payload.target;
  assert.deepEqual({ ...saved, id: 'x' }, { id: 'x', harness: 'opencode', name: 'Second', root: 'D:/second', executable: 'second', enabled: true, exclusive: false });
});

await test('Search again asks Mukade again, and the dialog keeps what was typed while it does', 'changes', {}, async app => {
  const { page } = app;
  const dialog = await openAdd(page);
  await dialog.locator('input[name="name"]').fill('Typed first');
  const before = (await callsOf(app, 'discover')).length;
  await dialog.getByRole('button', { name: 'Search again', exact: true }).click();
  await page.waitForFunction(n => window.calls.filter(c => c.action === 'discover').length > n, before);
  await dialog.getByRole('radio', { name: 'Claude Code', exact: true }).waitFor();
  assert.equal(await dialog.locator('input[name="name"]').inputValue(), 'Typed first');
  await dialog.getByRole('radio', { name: 'Another harness, by hand', exact: true }).click();
  assert.equal(await dialog.locator('input[name="name"]').inputValue(), 'Typed first', 'by hand keeps what was typed before any choice');
});

// ---------- plugins outside the list ----------
await test('Installed, not in your list: each line says what the rule does to it, and Uninstall, asking first saves the rule and plans, without applying', 'unlisted', {}, async app => {
  const { page } = app;
  await ready(page);
  const section = unlistedSection(page);
  await section.waitFor();
  const line = section.getByRole('listitem').filter({ hasText: 'old-snippets' });
  assert.match(await line.textContent(), /0\.2\.0 · on Codex isolated test/);
  await line.getByText('Left alone', { exact: true }).waitFor();
  assert.equal(await rule(section, 'Leave alone').getAttribute('aria-checked'), 'true');
  await page.screenshot({ path: shots + '/sync-harness-unlisted.png' });
  await rule(section, 'Uninstall, asking first').click();
  await chosen(page, rule(section, 'Uninstall, asking first')).waitFor();
  await line.getByText('Removal waits for your confirmation', { exact: true }).waitFor();
  await notice(page, 'Saved. Muro will ask before it uninstalls plugins outside your list.').waitFor();
  const saved = (await callsOf(app, 'save_target')).at(-1).payload;
  assert.equal(saved.target.exclusive, true);
  assert.equal(saved.target.id, 't1');
  assert.equal(saved.revision, 1);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'radio', 'the radio keeps the focus');
  await planned(page);
  assert.deepEqual((await actions(app)).slice(-2), ['save_target', 'plan'], 'the plan is asked for after the save, and nothing is applied');
  assert.equal((await actions(app)).includes('apply'), false, 'looking is not applying');
  await rule(section, 'Leave alone').click();
  await line.getByText('Left alone', { exact: true }).waitFor();
  const back = (await callsOf(app, 'save_target')).at(-1).payload;
  assert.equal(back.target.exclusive, false);
  assert.equal(back.revision, 2, 'with the revision the first save returned');
});

await test('the rule is saved harness by harness; it stops at the first one that fails, says so, and keeps the ones saved', 'unlisted', {}, async app => {
  const { page } = app;
  const dialog = await openAdd(page);
  await dialog.getByRole('radio', { name: 'Another harness, by hand', exact: true }).click();
  await dialog.locator('input[name="name"]').fill('Second');
  await dialog.locator('input[name="root"]').fill('D:/second');
  await dialog.locator('input[name="executable"]').fill('second');
  await addIn(dialog).click();
  await dialog.waitFor({ state: 'detached' });
  await column(page, 'Second').waitFor();
  const section = unlistedSection(page), before = (await callsOf(app, 'save_target')).length;
  // The second save of the rule is the one the fixture refuses.
  await page.evaluate(() => { let reads = 0; Object.defineProperty(window.flags, 'rejectSave', { get: () => ++reads >= 2, configurable: true }); });
  await rule(section, 'Uninstall, asking first').click();
  const alert = section.getByRole('alert').filter({ hasText: 'was not saved' });
  await alert.waitFor();
  const saves = (await callsOf(app, 'save_target')).slice(before);
  assert.equal(saves.length, 2, 'it did not go on after the failure');
  assert.equal(saves[0].payload.target.id, 't1');
  assert.equal(saves[0].payload.target.exclusive, true);
  assert.equal(saves[1].payload.revision, saves[0].payload.revision + 1, 'the second save carries the revision the first one returned');
  assert.match(await alert.textContent(), /1 harness saved\. Second was not saved: Version conflict/);
  await section.getByText('Differs per harness', { exact: true }).waitFor();
  assert.equal(await rule(section, 'Uninstall, asking first').getAttribute('aria-checked'), 'false', 'neither choice claims what is half done');
  assert.equal(await rule(section, 'Leave alone').getAttribute('aria-checked'), 'false');
  await section.getByRole('listitem').filter({ hasText: 'old-snippets' }).getByText('Removal waits for your confirmation').first().waitFor();
  await page.evaluate(() => { delete window.flags.rejectSave; window.flags.rejectSave = false; });
  await rule(section, 'Uninstall, asking first').click();
  await chosen(page, rule(section, 'Uninstall, asking first')).waitFor();
  const again = (await callsOf(app, 'save_target')).slice(before + 2);
  assert.deepEqual(again.map(c => c.payload.target.id).filter(id => id === 't1'), [], 'the harness already saved is not saved again');
  assert.equal(again.length, 1);
});

await test('Add to my list calls save_plugin with the installation to adopt, the plugin becomes a row, and the line is gone', 'unlisted', {}, async app => {
  const { page } = app;
  await ready(page);
  const section = unlistedSection(page);
  await section.getByRole('listitem').filter({ hasText: 'old-snippets' }).getByRole('button', { name: /Add to my list/ }).click();
  await rowOf(page, 'old-snippets').first().waitFor();
  const saved = (await callsOf(app, 'save_plugin')).at(-1).payload;
  assert.deepEqual({ ...saved.plugin, id: 'x' }, { id: 'x', name: 'old-snippets', source: 'D:/plugins/old-snippets', policy: 'pinned', pinned_version: '0.2.0', targets: ['t1'], distributions: [{ harness: 'codex', path: 'D:/plugins/old-snippets', version: '0.2.0' }] });
  assert.deepEqual(saved.adopt, { target_id: 't1', native_id: 'native-old-snippets' }, 'it takes over the copy that is installed');
  assert.equal(saved.revision, 1);
  await notice(page, 'old-snippets added to your list.').waitFor();
  assert.equal(await unlistedSection(page).count(), 0, 'what the list holds is no longer outside it');
  await planned(page);
  assert.deepEqual((await actions(app)).slice(-2), ['save_plugin', 'plan']);
});

await test('a plugin added to the list while Uninstall, asking first is on is not shown as removed', 'unlisted', {}, async app => {
  const { page } = app;
  await ready(page);
  const section = unlistedSection(page), line = section.getByRole('listitem').filter({ hasText: 'old-snippets' });
  await rule(section, 'Uninstall, asking first').click();
  await line.getByText('Removal waits for your confirmation', { exact: true }).waitFor();
  await line.getByRole('button', { name: /Add to my list/ }).click();
  await rowOf(page, 'old-snippets').first().waitFor();
  assert.equal(await page.getByText('Removal waits for your confirmation').count(), 0, 'it is in the list: the next sync keeps it');
  assert.equal(await unlistedSection(page).count(), 0, 'and it is no longer in the section');
});

await test('on an exclusive harness every line waits for confirmation, and a record whose files are gone says so', 'removals', {}, async app => {
  const { page } = app;
  await ready(page);
  const section = unlistedSection(page);
  await section.waitFor();
  assert.equal(await section.getByRole('listitem').count(), 2);
  await section.getByRole('listitem').filter({ hasText: 'old-snippets' }).getByText('Removal waits for your confirmation', { exact: true }).waitFor();
  const ghost = section.getByRole('listitem').filter({ hasText: 'ghost' });
  await ghost.getByText('files missing').waitFor();
  await ghost.getByText('Removal waits for your confirmation', { exact: true }).waitFor();
  assert.equal(await rule(section, 'Uninstall, asking first').getAttribute('aria-checked'), 'true');
  assert.equal((await actions(app)).includes('apply'), false, 'nothing is applied from here');
});

// ---------- narrow windows ----------
for (const width of [500, 250]) {
  await test(`the inspector, Add harness and the section fit a ${width}px window and nothing in them scrolls sideways`, 'unlisted', { viewport: { width, height: 900 } }, async app => {
    const { page } = app;
    const fits = scope => scope.evaluate(el => { const r = el.getBoundingClientRect(); return el.scrollWidth <= el.clientWidth + 1 && r.left >= 0 && r.right <= window.innerWidth + 1; });
    await ready(page);
    await unlistedSection(page).waitFor();
    assert.equal(await fits(unlistedSection(page)), true, 'the section fits');
    await column(page, 'Codex isolated test').click();
    const panel = inspector(page);
    await headingOf(panel, 'Codex isolated test').waitFor();
    assert.equal(await panel.getAttribute('data-inspector-form'), 'drawer', 'under 1000px the inspector is a panel over the content');
    assert.equal(await fits(panel), true, 'the inspector fits');
    for (const name of ['Stop managing', 'Cancel']) assert.equal(await panel.getByRole('button', { name, exact: true }).isVisible(), true, `${name} is reachable`);
    assert.equal(await saveOf(panel).isVisible(), true, 'Save is reachable');
    await page.screenshot({ path: shots + `/sync-harness-inspector-${width}.png` });
    await leave(page);
    await panel.waitFor({ state: 'hidden' });
    await addHarnessButton(page).click();
    const dialog = addDialog(page);
    await dialog.getByRole('heading', { name: 'Add a harness' }).waitFor();
    assert.equal(await fits(dialog), true, 'the dialog fits');
    assert.equal(await addIn(dialog).isVisible(), true, 'Add harness is reachable');
    await page.screenshot({ path: shots + `/sync-harness-add-${width}.png` });
  });
}

if (failed.length) { console.error('FAILED:\n  ' + failed.join('\n  ')); process.exit(1); }
console.log('PASS: ' + done.join('; '));
