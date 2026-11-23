// Plan R1, Task 3: the plugin drawer and Add plugin of the Sync page, on the fake transport (fake-transport.js). The plugin-related tests of the Imago window (browser-sync.mjs and
// browser-harness.mjs of commit 5e33a82) are ported here: the form and what is wrong with it, what an edit keeps of the plugin and what a changed source drops, the instructions of a plugin, the actions
// under More (Check for updates, Adapt with AI, Plan a reinstall, Open instructions folder, Remove from my list), and that leaving with changes asks once. New for this window: the registry moves
// while a drawer is open (what was typed stays, the save goes on the registry as it is), and the drawer is the one surface of its plugin: Adapt, the removal and the question before leaving are
// views of it, never a second window over it.
// The drawers are opened as the page opens them: the plugin's row (a button whose name starts with the plugin's name) and the Add plugin button of the Sync page (Task 2's `Sync.tsx`).
//   node apps/desktop/tests/browser-sync-dialogs.mjs        (MURO_UI_PORT moves the dev server off 1422; MURO_ONLY=<part of a test name> runs one test)
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
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

const callsOf = async (app, action) => (await app.calls()).filter(c => c.action === action);
const actions = async app => (await app.calls()).map(c => c.action);
const escaped = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The window has read the registry once: the footer says what it holds. */
const foot = page => page.locator('[data-slot="app-shell-footer"]');
const ready = page => foot(page).getByText(/in your list/).waitFor();
const notice = (page, text) => page.locator('[data-toasts]').getByText(text, { exact: true });
/** The drawer of a plugin or of Add plugin (Sigrid's side panel), and its title. */
const sheet = page => page.locator('[data-slot="sheet-content"]');
const titleOf = s => s.locator('[data-slot="sheet-title"]');
/** The title of the drawer when it says exactly `text` (the drawer's title is its plugin's name, or the question or the view it shows). */
const title = (s, text) => titleOf(s).filter({ hasText: new RegExp('^' + escaped(text) + '$') });
/** What the page offers: a plugin's row opens its drawer (a button whose name starts with the plugin's name), and Add plugin opens the form of a new one. */
const rowOf = (page, name) => page.getByRole('button', { name: new RegExp('^' + escaped(name)) }).first();
const addButton = page => page.getByRole('button', { name: 'Add plugin', exact: true }).first();
const openPlugin = async (page, name) => {
  await ready(page);
  await rowOf(page, name).click();
  const s = sheet(page);
  await title(s, name).waitFor();
  return s;
};
const openAdd = async page => {
  await ready(page);
  await addButton(page).click();
  const s = sheet(page);
  await title(s, 'Add a plugin').waitFor();
  return s;
};
const fold = (s, name) => s.getByRole('button', { name, exact: true });
const addSubmit = s => s.getByRole('button', { name: 'Add plugin', exact: true });
const save = s => s.getByRole('button', { name: 'Save', exact: true });
const field = (s, name) => s.locator(`input[name="${name}"]`);
const onField = (page, name) => page.waitForFunction(n => document.activeElement?.getAttribute('name') === n, name);
const focusedText = page => page.evaluate(() => document.activeElement?.textContent?.trim());
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
/** Every control and field inside `root` that has no name (what is hidden from assistive technology, such as the checkbox's own hidden input, is not a control). */
const unnamed = root => root.evaluate(element => [...element.querySelectorAll('button, [role=switch], [role=checkbox], [role=radio], [role=combobox], textarea, input:not([type=hidden])')].filter(e => {
  if (e.closest('[aria-hidden="true"]')) return false;
  const by = e.getAttribute('aria-labelledby');
  return !(e.getAttribute('aria-label') || (by && by.split(/\s+/).some(id => document.getElementById(id)?.textContent.trim())) || e.textContent.trim() || e.labels?.length);
}).map(e => e.outerHTML.slice(0, 120)));
/** What runs past the right edge of `root` (a drawer): the controls and texts that a narrow window would cut off or scroll sideways, though the drawer itself does not. */
const stickingOut = root => root.evaluate(element => {
  const edge = element.getBoundingClientRect().right + 1;
  return [...element.querySelectorAll('*')].filter(e => !e.closest('[aria-hidden="true"]') && !e.closest('.sr-only') && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > edge).map(e => e.tagName + ' ' + (e.textContent || '').trim().slice(0, 40));
});
const CODEX = { engine: 'harness', harness: 'codex', budget_usd: 0.5, api_base: 'https://api.openai.com/v1', model: '', api_key_env: 'MURO_API_KEY' };
/** Adds a plugin the way a person does (the drawer of Add plugin), with a build folder and an instructions folder of its own, and waits for its row. */
async function addPkg(page, { name = 'Pkg', source = 'https://example.com/plugin', build = true } = {}) {
  const s = await openAdd(page);
  await field(s, 'name').fill(name);
  await field(s, 'source').fill(source);
  await fold(s, 'Advanced').click();
  await field(s, 'custom_instructions_dir').fill('D:/custom notes');
  if (build) {
    await fold(s, 'Add build').click();
    await field(s, 'distribution_path').fill('D:/artifact');
    await field(s, 'distribution_version').fill('1');
  }
  await addSubmit(s).click();
  await s.waitFor({ state: 'detached' });
  await rowOf(page, name).waitFor();
}

// ---------- Add plugin ----------
await test('Add plugin: wrong fields say so, the name follows the source, a refused save keeps the form, the saved one is a row and its source is checked', 'default', {}, async app => {
  const { page } = app;
  const s = await openAdd(page);
  await onField(page, 'source');
  assert.equal(await s.getByRole('checkbox', { name: 'Codex isolated test' }).isChecked(), true, 'every enabled harness is ticked');
  assert.equal(await fold(s, 'More').count(), 0, 'a plugin that is not in the list has no More');
  assert.equal(await field(s, 'pinned_version').count(), 0, 'Pinned version shows only for a pinned plugin');
  await addSubmit(s).click();
  await s.getByText('Enter where the plugin comes from.', { exact: true }).waitFor();
  await s.getByText('Give the plugin a name.', { exact: true }).waitFor();
  assert.equal(await field(s, 'source').getAttribute('aria-invalid'), 'true');
  await onField(page, 'source');
  await field(s, 'source').fill('https://github.com/owner/my-plugin.git');
  assert.equal(await field(s, 'name').inputValue(), 'my-plugin', 'the name follows the source');
  assert.equal(await s.getByText('Give the plugin a name.').count(), 0, 'and its error goes');
  await field(s, 'name').fill('<Test plugin>');
  await field(s, 'source').fill('https://example.com/plugin');
  assert.equal(await field(s, 'name').inputValue(), '<Test plugin>', 'a name that was typed stays');
  await s.getByRole('radio', { name: 'Pinned version' }).click();
  await field(s, 'pinned_version').waitFor();
  await addSubmit(s).click();
  await s.getByText('A pinned plugin needs a version.', { exact: true }).waitFor();
  await onField(page, 'pinned_version');
  await s.getByRole('radio', { name: 'Latest release' }).click();
  await field(s, 'pinned_version').waitFor({ state: 'detached' });
  await fold(s, 'Advanced').click();
  await field(s, 'custom_instructions_dir').fill('D:/custom notes');
  await fold(s, 'Add build').click();
  await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'combobox');
  await addSubmit(s).click();
  await s.getByText('Each build needs a folder and a version.', { exact: true }).waitFor();
  await field(s, 'distribution_path').fill('D:/artifact');
  await field(s, 'distribution_version').fill('1');
  await page.screenshot({ path: shots + '/sync-plugin-new.png' });
  await app.flags({ rejectSave: true });
  await addSubmit(s).click();
  await s.getByRole('alert').filter({ hasText: 'Version conflict' }).waitFor();
  assert.equal(await field(s, 'name').inputValue(), '<Test plugin>', 'a failed save keeps the form');
  assert.equal(await field(s, 'distribution_path').inputValue(), 'D:/artifact');
  assert.equal((await callsOf(app, 'save_plugin')).length, 1);
  assert.equal((await callsOf(app, 'resolve')).length, 0, 'a plugin that was not saved has no source to check');
  assert.equal(await addSubmit(s).isEnabled(), true, 'and it can try again');
  await app.flags({ rejectSave: false });
  await addSubmit(s).click();
  await s.waitFor({ state: 'detached' });
  await rowOf(page, '<Test plugin>').waitFor();
  assert.equal(await page.locator('test').count(), 0, 'a name is text, never markup');
  await notice(page, '<Test plugin> added to your list.').waitFor();
  await delay(400);
  assert.deepEqual((await actions(app)).slice(-3), ['save_plugin', 'resolve', 'plan'], 'the plugin is saved, its source is checked, and the page plans once');
  const sent = (await callsOf(app, 'save_plugin')).at(-1).payload;
  assert.equal(sent.revision, 1);
  assert.deepEqual({ ...sent.plugin, id: 'x' }, { id: 'x', name: '<Test plugin>', source: 'https://example.com/plugin', policy: 'stable', pinned_version: '', targets: ['t1'], distributions: [{ harness: 'codex', path: 'D:/artifact', version: '1' }], custom_instructions_dir: 'D:/custom notes' });
  assert.deepEqual((await callsOf(app, 'resolve')).at(-1).payload, { id: sent.plugin.id }, 'the source that is checked is the plugin that was saved');
  // The button the drawer was opened from (the empty list's) went with the empty list: the keyboard is on the row of the plugin that was added.
  await page.waitForFunction(() => document.activeElement?.textContent?.trim() === '<Test plugin>');
});

await test('Add plugin from a list that has plugins: the keyboard goes back to Add plugin', 'changes', {}, async app => {
  const { page } = app;
  const s = await openAdd(page);
  await field(s, 'source').fill('https://example.com/second');
  await addSubmit(s).click();
  await s.waitFor({ state: 'detached' });
  await rowOf(page, 'second').waitFor();
  await page.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Add plugin');
});

await test('Add plugin: a second Add after a request that failed on the way saves the same plugin; a registry that moved is read once and the save sent again', 'default', {}, async app => {
  const { page } = app;
  const s = await openAdd(page);
  await field(s, 'source').fill('https://example.com/moved');
  assert.equal(await field(s, 'name').inputValue(), 'moved');
  await app.flags({ rejectSave: true });
  await addSubmit(s).click();
  await s.getByRole('alert').filter({ hasText: 'Version conflict' }).waitFor();
  await app.flags({ rejectSave: false });
  // The registry moves behind the page's back: the revision the window holds is stale.
  await page.evaluate(() => window.behind.bump());
  await addSubmit(s).click();
  await s.waitFor({ state: 'detached' });
  await rowOf(page, 'moved').waitFor();
  const saves = await callsOf(app, 'save_plugin');
  assert.equal(saves.length, 3, 'the refused save, the stale one, and the one on the new revision');
  assert.equal(saves[1].payload.revision, 1);
  assert.equal(saves[2].payload.revision, 2, 'sent again on the revision the registry has now');
  assert.equal(new Set(saves.map(c => c.payload.plugin.id)).size, 1, 'one plugin, whatever the number of tries');
  const calls = await actions(app);
  const at = calls.lastIndexOf('save_plugin');
  assert.deepEqual(calls.slice(at - 2, at + 2), ['save_plugin', 'snapshot', 'save_plugin', 'resolve']);
});

await test('Add plugin: leaving with what was typed asks once; nothing typed leaves at once; the next drawer starts empty', 'default', {}, async app => {
  const { page } = app;
  let s = await openAdd(page);
  await page.keyboard.press('Escape');
  await s.waitFor({ state: 'detached' });
  s = await openAdd(page);
  await field(s, 'source').fill('https://example.com/typed');
  await page.keyboard.press('Escape');
  await title(s, 'Discard changes to the new plugin?').waitFor();
  await s.getByText('What you changed is not saved.', { exact: true }).waitFor();
  await page.waitForFunction(() => document.activeElement?.textContent === 'Keep editing');
  await page.keyboard.press('Escape');
  await title(s, 'Add a plugin').waitFor();
  assert.equal(await field(s, 'source').inputValue(), 'https://example.com/typed', 'Keep editing keeps what was typed');
  await onField(page, 'source');
  await s.getByRole('button', { name: 'Cancel', exact: true }).click();
  await s.getByRole('button', { name: 'Keep editing', exact: true }).waitFor();
  await s.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await s.waitFor({ state: 'detached' });
  assert.equal((await callsOf(app, 'save_plugin')).length, 0, 'nothing was saved');
  s = await openAdd(page);
  assert.equal(await field(s, 'source').inputValue(), '', 'a drawer that opens is a new form');
  assert.equal(await field(s, 'name').inputValue(), '');
});

await test('a name with markup and a very long one are text: the row, the drawer\'s title and its Name field', 'default', {}, async app => {
  const { page } = app;
  const name = '<i>Long</i> & "quoted" ' + 'x'.repeat(100);
  await addPkg(page, { name, source: 'https://example.com/long', build: false });
  assert.equal(await page.locator('i').filter({ hasText: 'Long' }).count(), 0, 'no markup was made of it');
  assert.ok(await sideways(page) <= 0, 'the page does not scroll sideways');
  const s = sheet(page);
  await rowOf(page, '<i>Long').click();
  await s.waitFor();
  const shown = (await titleOf(s).textContent()).trim();
  assert.ok(shown.endsWith('…') && [...shown].length <= 48, `a very long name ends in an ellipsis in the title: ${shown}`);
  assert.equal(await field(s, 'name').inputValue(), name, 'and the Name field holds the whole of it');
  assert.ok(await sideways(page) <= 0 && await s.evaluate(d => d.scrollWidth <= d.clientWidth + 1), 'nothing of the drawer sticks out sideways');
  assert.deepEqual(await stickingOut(s), [], 'and no part of it runs past its edge');
  await page.screenshot({ path: shots + '/sync-plugin-long.png' });
});

// ---------- the plugin drawer ----------
await test('a plugin row opens its drawer: edits keep what the form does not show, a changed source drops the builds, an empty folder goes back to the one Muro keeps', 'default', {}, async app => {
  const { page } = app;
  await addPkg(page);
  let s = await openPlugin(page, 'Pkg');
  assert.equal(await save(s).isDisabled(), true, 'nothing changed: nothing to save');
  await s.getByText('Nothing has changed yet.', { exact: true }).waitFor();
  await s.getByText(/Changing the source removes the prepared builds/).waitFor();
  await field(s, 'name').fill('Pkg renamed');
  await save(s).click();
  await s.waitFor({ state: 'detached' });
  await rowOf(page, 'Pkg renamed').waitFor();
  await notice(page, 'Saved.').waitFor();
  let saved = (await callsOf(app, 'save_plugin')).at(-1).payload.plugin;
  assert.equal(saved.upstream_version, 'v-native', 'editing keeps the upstream metadata');
  assert.equal(saved.distributions[0].origin, 'muro', 'and where each build comes from');
  assert.equal(saved.distributions[0].custom_instructions_digest, 'old-instructions', 'and the instructions it was built from');
  assert.equal(saved.custom_instructions_dir, 'D:/custom notes');
  await delay(300);
  assert.deepEqual((await actions(app)).slice(-2), ['save_plugin', 'plan'], 'one plan after the save');
  s = await openPlugin(page, 'Pkg renamed');
  await field(s, 'source').fill('https://example.com/replacement-plugin');
  await save(s).click();
  await s.waitFor({ state: 'detached' });
  saved = (await callsOf(app, 'save_plugin')).at(-1).payload.plugin;
  assert.deepEqual(saved.distributions, [], 'a changed source drops every build of the old one');
  assert.equal(saved.upstream_version, undefined);
  assert.equal(saved.upstream_revision, undefined);
  assert.equal(saved.custom_instructions_dir, 'D:/custom notes', 'the instructions folder stays');
  s = await openPlugin(page, 'Pkg renamed');
  await fold(s, 'Advanced').click();
  assert.equal(await s.locator('[role=group][aria-label^="Build "]').count(), 0, 'the old builds do not come back');
  await field(s, 'custom_instructions_dir').fill('');
  await save(s).click();
  await s.waitFor({ state: 'detached' });
  assert.equal((await callsOf(app, 'save_plugin')).at(-1).payload.plugin.custom_instructions_dir, undefined, 'an empty folder goes back to the one Muro keeps');
  s = await openPlugin(page, 'Pkg renamed');
  await fold(s, 'Custom instructions · none yet').click();
  await s.getByText('D:/isolated/data/custom-instructions/' + saved.id, { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await s.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.closest('main') !== null), true, 'the keyboard goes back to the page, where the row is');
});

await test('the install-on boxes, the update policy and the builds are saved as the form says', 'two-harnesses', {}, async app => {
  const { page } = app;
  const s = await openPlugin(page, 'Package');
  assert.equal(await s.getByRole('checkbox', { name: 'Codex isolated test' }).isChecked(), true);
  assert.equal(await s.getByRole('checkbox', { name: 'OpenCode isolated test' }).isChecked(), true);
  await s.getByRole('checkbox', { name: 'OpenCode isolated test' }).click();
  await s.getByRole('radio', { name: 'Pinned version' }).click();
  await field(s, 'pinned_version').fill('2');
  await fold(s, 'Advanced').click();
  assert.equal(await s.locator('[role=group][aria-label^="Build "]').count(), 2, 'one row per prepared build');
  await s.getByRole('button', { name: 'Remove build 2', exact: true }).click();
  assert.equal(await s.locator('[role=group][aria-label^="Build "]').count(), 1);
  await page.screenshot({ path: shots + '/sync-plugin-edited.png' });
  await save(s).click();
  await s.waitFor({ state: 'detached' });
  const saved = (await callsOf(app, 'save_plugin')).at(-1).payload.plugin;
  assert.deepEqual(saved.targets, ['t1']);
  assert.equal(saved.policy, 'pinned');
  assert.equal(saved.pinned_version, '2');
  assert.deepEqual(saved.distributions.map(d => d.harness), ['codex'], 'the build that was removed from the form is gone, the other keeps what the registry knew of it');
  assert.equal(saved.distributions[0].path, 'D:/Muro/data/artifacts/codex-2');
});

await test('the registry moves while the drawer is open: what was typed stays, and the save goes on the registry as it is now', 'changes', {}, async app => {
  const { page } = app;
  const s = await openPlugin(page, 'Package');
  await field(s, 'name').fill('Renamed');
  await page.evaluate(() => window.behind.settings({ auto_sync: true }));
  await page.evaluate(() => window.shown());
  await foot(page).getByText('Automatic sync on').waitFor();
  assert.equal(await field(s, 'name').inputValue(), 'Renamed', 'the window read the registry again and the form kept what was typed');
  const before = (await callsOf(app, 'snapshot')).length;
  await save(s).click();
  await s.waitFor({ state: 'detached' });
  const saves = await callsOf(app, 'save_plugin');
  assert.equal(saves.length, 1, 'no second try: the revision was current');
  assert.equal(saves[0].payload.revision, 2);
  assert.equal(saves[0].payload.plugin.name, 'Renamed');
  assert.deepEqual(saves[0].payload.plugin.distributions.map(d => d.version), ['2'], 'what the form did not touch is what the registry holds');
  assert.equal((await callsOf(app, 'snapshot')).length, before, 'nothing was read again to send it');
  await rowOf(page, 'Renamed').waitFor();
});

await test('a save that finds the registry moved is sent once more on the new revision', 'changes', {}, async app => {
  const { page } = app;
  const s = await openPlugin(page, 'Package');
  await field(s, 'name').fill('Again');
  await page.evaluate(() => window.behind.bump());
  await save(s).click();
  await s.waitFor({ state: 'detached' });
  const saves = await callsOf(app, 'save_plugin');
  assert.deepEqual(saves.map(c => c.payload.revision), [1, 2], 'refused on the revision the window had, accepted on the one it read');
  const calls = await actions(app);
  assert.deepEqual(calls.slice(calls.indexOf('save_plugin'), calls.indexOf('save_plugin') + 3), ['save_plugin', 'snapshot', 'save_plugin']);
  await rowOf(page, 'Again').waitFor();
});

await test('a refused save keeps the drawer and its values and says why inside it', 'changes', {}, async app => {
  const { page } = app;
  const s = await openPlugin(page, 'Package');
  await field(s, 'name').fill('Renamed <b>');
  await app.flags({ rejectSave: true });
  await save(s).click();
  const refusal = s.getByRole('alert').filter({ hasText: 'Version conflict' });
  await refusal.waitFor();
  assert.match(await refusal.textContent(), /Not saved\./);
  assert.equal(await field(s, 'name').inputValue(), 'Renamed <b>', 'the values stay');
  assert.equal(await save(s).isEnabled(), true, 'and the drawer can try again');
  assert.equal(await page.locator('[data-toasts]').getByText('Version conflict').count(), 0, 'it is not a notice: a notice would cover the buttons');
  await app.flags({ rejectSave: false });
  await save(s).click();
  await s.waitFor({ state: 'detached' });
  assert.equal(await page.locator('b').filter({ hasText: 'Renamed' }).count(), 0, 'the name is text');
});

await test('leaving with changes asks once: Escape, the close button, a press outside and Cancel; nothing changed leaves at once', 'changes', {}, async app => {
  const { page } = app;
  let s = await openPlugin(page, 'Package');
  await page.keyboard.press('Escape');
  await s.waitFor({ state: 'detached' });
  s = await openPlugin(page, 'Package');
  await field(s, 'name').fill('Renamed');
  await page.keyboard.press('Escape');
  await title(s, 'Discard changes to Package?').waitFor();
  await s.getByText('What you changed is not saved.', { exact: true }).waitFor();
  await page.waitForFunction(() => document.activeElement?.textContent === 'Keep editing');
  await page.screenshot({ path: shots + '/sync-plugin-discard.png' });
  await s.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await title(s, 'Package').waitFor();
  assert.equal(await field(s, 'name').inputValue(), 'Renamed', 'Keep editing keeps the form and its values');
  await onField(page, 'source');
  await s.getByRole('button', { name: 'Close', exact: true }).click();
  await title(s, 'Discard changes to Package?').waitFor();
  await page.keyboard.press('Escape');
  await title(s, 'Package').waitFor();
  // A press on the dimmed page beside the drawer (below the title bar) is a way out too.
  await page.mouse.click(10, 500);
  await title(s, 'Discard changes to Package?').waitFor();
  await s.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await title(s, 'Package').waitFor();
  assert.equal(await field(s, 'name').inputValue(), 'Renamed');
  await s.getByRole('button', { name: 'Cancel', exact: true }).click();
  await s.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await s.waitFor({ state: 'detached' });
  assert.equal((await callsOf(app, 'save_plugin')).length, 0, 'nothing was saved');
  s = await openPlugin(page, 'Package');
  assert.equal(await field(s, 'name').inputValue(), 'Package', 'the drawer opens on the plugin as it is, not on what was left');
});

await test('the instructions of a plugin: open their folder, reload them, and a warning when they changed', 'changes', {}, async app => {
  const { page } = app;
  const s = await openPlugin(page, 'Package');
  await fold(s, 'Custom instructions · none yet').click();
  await s.getByText('D:/isolated/data/custom-instructions/p1', { exact: true }).waitFor();
  await fold(s, 'More').click();
  await fold(s, 'Open instructions folder').click();
  await s.getByText('Folder opened. Edit the Markdown files, reload them, then adapt the plugin again.', { exact: true }).waitFor();
  assert.deepEqual((await callsOf(app, 'open_custom_instructions')).map(c => c.payload), [{ id: 'p1' }], 'the folder opens on request and for this plugin');
  assert.equal(await sheet(page).count(), 1, 'the drawer stays');
  await app.flags({ instructionFiles: ['custom-instructions/nested/<recap>.md'], instructionStale: true });
  await fold(s, 'Reload files').click();
  await s.getByText('Instructions changed. Adapt again for: Codex.', { exact: true }).waitFor();
  await fold(s, 'Custom instructions · 1 Markdown file').waitFor();
  await s.getByText('custom-instructions/nested/<recap>.md', { exact: true }).waitFor();
  assert.equal(await page.locator('recap').count(), 0, 'Markdown file names are text');
  assert.equal(await fold(s, 'Custom instructions · 1 Markdown file').getAttribute('aria-expanded'), 'true', 'the section stays open');
  await page.waitForFunction(() => { const e = document.activeElement; return e?.tagName === 'BUTTON' && !!e.textContent?.includes('Reload files'); });
  await app.flags({ instructionFiles: [] });
  await fold(s, 'Reload files').click();
  await fold(s, 'Custom instructions · none yet').waitFor();
  await s.getByText('Instructions changed. Adapt again for: Codex.', { exact: true }).waitFor();
});

await test('More lists the actions of the saved plugin; Check for updates reads its source and says what it found', 'changes', {}, async app => {
  const { page } = app;
  const s = await openPlugin(page, 'Package');
  assert.equal(await fold(s, 'More').getAttribute('aria-expanded'), 'false', 'More is closed at first');
  await fold(s, 'More').click();
  for (const name of ['Check for updates', 'Adapt with AI', 'Plan a reinstall', 'Open instructions folder', 'Remove from my list']) await fold(s, name).waitFor();
  await page.screenshot({ path: shots + '/sync-plugin-more.png' });
  await fold(s, 'Check for updates').click();
  await s.waitFor({ state: 'detached' });
  assert.deepEqual((await callsOf(app, 'resolve')).map(c => c.payload), [{ id: 'p1' }]);
  await notice(page, 'Package: no new version.').waitFor();
  await delay(300);
  assert.deepEqual((await actions(app)).slice(-2), ['resolve', 'plan'], 'one plan after the check');
});

await test('Adapt with AI is a view of the drawer: the budget starts from Settings, must be above zero, and the run is started with the agent of Settings', 'changes', {}, async app => {
  const { page } = app;
  const s = await openPlugin(page, 'Package');
  await fold(s, 'More').click();
  await fold(s, 'Adapt with AI').click();
  await title(s, 'Adapt Package with AI').waitFor();
  assert.equal(await sheet(page).count(), 1, 'one surface, not a second window over the first');
  await s.getByText("Claude Code rebuilds this plugin for a harness that has no native version of it, and validates the result. It uses Claude Code's own credentials and spends at most the budget below.", { exact: true }).waitFor();
  assert.equal(await field(s, 'budget').inputValue(), '0.5', 'the budget Settings, section AI, starts from');
  assert.equal(await s.getByRole('combobox', { name: 'For harness' }).textContent(), 'Claude Code', 'a plugin with every build has none that needs adapting: the first choice is Claude Code');
  await page.screenshot({ path: shots + '/sync-plugin-adapt.png' });
  await field(s, 'budget').fill('0');
  await s.getByRole('button', { name: 'Start', exact: true }).click();
  await s.getByText('Enter a budget above zero.', { exact: true }).waitFor();
  assert.equal(await field(s, 'budget').getAttribute('aria-invalid'), 'true');
  await onField(page, 'budget');
  assert.equal((await actions(app)).includes('adapt'), false);
  await field(s, 'budget').fill('3');
  await s.getByRole('combobox', { name: 'For harness' }).click();
  await page.getByRole('option', { name: 'OpenCode', exact: true }).click();
  await s.getByRole('button', { name: 'Start', exact: true }).click();
  await s.waitFor({ state: 'detached' });
  assert.deepEqual((await callsOf(app, 'adapt')).map(c => c.payload), [{ id: 'p1', harness: 'opencode', agent: 'claude-code', budget_usd: 3 }]);
  const calls = await actions(app);
  assert.equal(calls[calls.indexOf('adapt') + 1], 'snapshot', 'the registry is read after it, so the window finds the run');
  await notice(page, 'Started. Follow it in Activity.').waitFor();
});

await test('Adapt with AI: Cancel and Escape go back to the form with what was typed; the harness whose instructions changed is the first choice', 'changes', {}, async app => {
  const { page } = app;
  await ready(page);
  await app.flags({ instructionStale: true });
  await page.evaluate(() => window.shown());
  const s = await openPlugin(page, 'Package');
  await s.getByText('Instructions changed. Adapt again for: Codex.', { exact: true }).waitFor();
  await fold(s, 'More').click();
  await fold(s, 'Adapt with AI').click();
  await title(s, 'Adapt Package with AI').waitFor();
  assert.equal(await s.getByRole('combobox', { name: 'For harness' }).textContent(), 'Codex', 'the harness whose instructions changed');
  await page.keyboard.press('Escape');
  await title(s, 'Package').waitFor();
  await page.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Adapt with AI');
  assert.equal(await sheet(page).count(), 1, 'Escape closed the view, not the drawer');
  await fold(s, 'Adapt with AI').click();
  await s.getByRole('button', { name: 'Cancel', exact: true }).click();
  await title(s, 'Package').waitFor();
  assert.equal((await actions(app)).includes('adapt'), false);
});

await test('Adapt with AI with Codex as the coding agent says what is needed before it starts and cannot be started; the API engine says it needs the agent', 'changes', {}, async app => {
  const { page } = app;
  await ready(page);
  await page.evaluate(ai => window.behind.settings({ auto_sync: true, agent: ai.harness, ai }), CODEX);
  await page.evaluate(() => window.shown());
  await foot(page).getByText('Automatic sync on').waitFor();
  let s = await openPlugin(page, 'Package');
  await fold(s, 'More').click();
  await fold(s, 'Adapt with AI').click();
  await title(s, 'Adapt Package with AI').waitFor();
  await s.getByText('Adapting a plugin needs Claude Code (the only agent Muro can hold to a budget). Choose Claude Code in Settings → AI.', { exact: true }).waitFor();
  assert.equal(await s.getByRole('button', { name: 'Start', exact: true }).isDisabled(), true, 'it cannot be started');
  await page.screenshot({ path: shots + '/sync-plugin-adapt-codex.png' });
  await field(s, 'budget').press('Enter');
  assert.equal((await actions(app)).includes('adapt'), false, 'an Enter in a field starts nothing either');
  await s.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.keyboard.press('Escape');
  await s.waitFor({ state: 'detached' });
  // The API answers the simulator; the agent of Settings still runs the adaptation, and the dialog says so.
  await page.evaluate(ai => window.behind.settings({ auto_sync: false, agent: ai.harness, ai }), { ...CODEX, engine: 'api', harness: 'claude-code' });
  await page.evaluate(() => window.shown());
  await foot(page).getByText('Automatic sync off').waitFor();
  s = await openPlugin(page, 'Package');
  await fold(s, 'More').click();
  await fold(s, 'Adapt with AI').click();
  await s.getByText("Adapting a plugin needs a coding agent on this computer: Claude Code. It rebuilds this plugin for a harness that has no native version of it, and validates the result. It uses Claude Code's own credentials and spends at most the budget below.", { exact: true }).waitFor();
  assert.equal(await s.getByRole('button', { name: 'Start', exact: true }).isEnabled(), true);
});

await test('Adapt with AI while another AI run goes says so and cannot be started', 'changes', {}, async app => {
  const { page } = app;
  await ready(page);
  await page.evaluate(() => { window.behind.adapt('docs-writer', 'opencode'); window.behind.bump(); });
  await page.evaluate(() => window.shown());
  const s = await openPlugin(page, 'Package');
  await fold(s, 'More').click();
  await fold(s, 'Adapt with AI').click();
  await s.getByText(/is running: one AI run goes at a time/).first().waitFor();
  assert.equal(await s.getByRole('button', { name: 'Start', exact: true }).isDisabled(), true);
  assert.equal((await callsOf(app, 'adapt')).length, 0);
});

await test('More acts on the saved plugin: with unsaved changes it says so and does nothing', 'changes', {}, async app => {
  const { page } = app;
  const s = await openPlugin(page, 'Package');
  await field(s, 'name').fill('Package, edited');
  await fold(s, 'More').click();
  for (const name of ['Check for updates', 'Adapt with AI', 'Plan a reinstall']) {
    await fold(s, name).click();
    await s.getByText('Save your changes first: this acts on the saved plugin.', { exact: true }).waitFor();
    assert.equal(await field(s, 'name').inputValue(), 'Package, edited', 'the edit is still there');
    await title(s, 'Package').waitFor();
  }
  const sent = await actions(app);
  for (const action of ['resolve', 'adapt']) assert.equal(sent.includes(action), false, action);
  assert.equal((await callsOf(app, 'plan')).filter(c => c.payload.reinstall).length, 0);
});

await test('Plan a reinstall closes the drawer and opens the plan it made in the review, and applies nothing', 'changes', {}, async app => {
  const { page } = app;
  const s = await openPlugin(page, 'Package');
  await fold(s, 'More').click();
  await fold(s, 'Plan a reinstall').click();
  await s.waitFor({ state: 'detached' });
  assert.deepEqual((await callsOf(app, 'plan')).at(-1).payload, { reinstall: 'p1' });
  // The review is Task 2's sheet: it shows the reinstall the plan holds (no request is made for it again).
  await page.getByText('Reinstall', { exact: true }).first().waitFor();
  await page.screenshot({ path: shots + '/sync-plugin-reinstall.png' });
  const plans = (await callsOf(app, 'plan')).length;
  await page.keyboard.press('Escape');
  assert.equal((await callsOf(app, 'plan')).length, plans, 'opening the review asks for no other plan');
  assert.equal((await actions(app)).includes('apply'), false, 'looking is not applying');
});

await test('Remove from my list asks first, in the drawer, with Cancel in focus; Escape and Cancel remove nothing; the removal is on the revision, plans again and leaves the page its focus', 'changes', {}, async app => {
  const { page } = app;
  const s = await openPlugin(page, 'Package');
  await fold(s, 'More').click();
  await fold(s, 'Remove from my list').click();
  await title(s, 'Remove Package from your list?').waitFor();
  await s.getByText('It stays installed where it is, unless plugins outside your list are always uninstalled.', { exact: true }).waitFor();
  assert.equal(await sheet(page).count(), 1, 'one surface, not a second window over the first');
  await page.waitForFunction(() => document.activeElement?.textContent === 'Cancel');
  await page.screenshot({ path: shots + '/sync-plugin-remove.png' });
  assert.equal((await actions(app)).includes('remove_plugin'), false, 'nothing is removed before the person agrees');
  await page.keyboard.press('Escape');
  await title(s, 'Package').waitFor();
  await page.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Remove from my list');
  await fold(s, 'Remove from my list').click();
  await s.getByRole('button', { name: 'Cancel', exact: true }).click();
  await title(s, 'Package').waitFor();
  assert.equal((await actions(app)).includes('remove_plugin'), false);
  await fold(s, 'Remove from my list').click();
  await s.getByRole('button', { name: 'Remove Package', exact: true }).click();
  await s.waitFor({ state: 'detached' });
  await rowOf(page, 'Package').waitFor({ state: 'detached' });
  const removed = (await callsOf(app, 'remove_plugin')).at(-1).payload;
  assert.equal(removed.id, 'p1');
  assert.equal(typeof removed.revision, 'number');
  await notice(page, 'Package removed from your list.').waitFor();
  await delay(300);
  assert.deepEqual((await actions(app)).slice(-2), ['remove_plugin', 'plan']);
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-slot') === 'app-shell-content');
});

await test('every control of the drawers has a name, and the drawer fits a window of 500', 'changes', { viewport: { width: 500, height: 900 } }, async app => {
  const { page } = app;
  const s = await openPlugin(page, 'Package');
  assert.ok(await sideways(page) <= 0, 'no sideways scroll with the drawer open');
  await fold(s, 'More').click();
  await fold(s, 'Adapt with AI').click();
  await title(s, 'Adapt Package with AI').waitFor();
  assert.deepEqual(await unnamed(s), [], 'every control of Adapt has a name');
  assert.deepEqual(await stickingOut(s), [], 'and nothing of it runs past the drawer');
  assert.ok(await sideways(page) <= 0);
  await page.keyboard.press('Escape');
  await title(s, 'Package').waitFor();
  await fold(s, 'Advanced').click();
  await fold(s, 'Add build').click();
  await fold(s, 'Custom instructions · none yet').click();
  assert.deepEqual(await unnamed(s), [], 'every control of the plugin drawer has a name');
  assert.ok(await s.evaluate(d => d.scrollWidth <= d.clientWidth + 1), 'nothing inside the drawer scrolls sideways');
  assert.deepEqual(await stickingOut(s), [], 'and nothing runs past it');
  assert.ok(await s.evaluate(d => { const r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; }), 'and it fits the window');
  assert.ok(await sideways(page) <= 0);
  await page.screenshot({ path: shots + '/sync-plugin-500.png' });
  await s.getByRole('button', { name: 'Cancel', exact: true }).click();
  await s.getByRole('button', { name: 'Discard changes', exact: true }).waitFor();
  assert.ok(await sideways(page) <= 0, 'and with the question before leaving');
  await s.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await s.waitFor({ state: 'detached' });
  const add = await openAdd(page);
  assert.deepEqual(await unnamed(add), [], 'every control of Add plugin has a name');
  assert.ok(await add.evaluate(d => d.scrollWidth <= d.clientWidth + 1) && await sideways(page) <= 0, 'and it fits');
  assert.deepEqual(await stickingOut(add), []);
});

await test('the drawer of a plugin stays inside a window of 500 at 200% zoom (250): the footer is reachable and nothing sticks out', 'changes', { viewport: { width: 250, height: 700 } }, async app => {
  const { page } = app;
  const s = await openPlugin(page, 'Package');
  await fold(s, 'Advanced').click();
  await fold(s, 'Add build').click();
  await fold(s, 'More').click();
  assert.ok(await sideways(page) <= 0, 'no sideways scroll at 250');
  assert.ok(await s.evaluate(d => d.scrollWidth <= d.clientWidth + 1), 'nothing inside the drawer scrolls sideways at 250');
  assert.deepEqual(await stickingOut(s), [], 'and nothing runs past its edge');
  const inside = name => s.getByRole('button', { name, exact: true }).evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; });
  for (const name of ['Cancel', 'Save']) assert.equal(await inside(name), true, `${name} is inside the window`);
  for (const name of ['Check for updates', 'Open instructions folder', 'Remove from my list']) {
    await fold(s, name).scrollIntoViewIfNeeded();
    assert.equal(await inside(name), true, `${name} is inside the window`);
  }
});

await test('the drawer in a phone-width window, in the light theme', 'changes', { viewport: { width: 390, height: 844 }, colorScheme: 'light' }, async app => {
  const { page } = app;
  const s = await openPlugin(page, 'Package');
  await fold(s, 'More').click();
  assert.ok(await s.evaluate(d => d.scrollWidth <= d.clientWidth + 1), 'nothing inside the drawer scrolls sideways');
  assert.deepEqual(await stickingOut(s), [], 'and nothing runs past its edge');
  assert.ok(await s.evaluate(d => { const r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; }), 'and it fits the window');
  await page.screenshot({ path: shots + '/sync-plugin-narrow-light.png' });
});

if (failed.length) { console.error('FAILED:\n  ' + failed.join('\n  ')); process.exit(1); }
console.log('PASS: ' + done.join('; '));
