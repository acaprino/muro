// Plan 2, Task 6: the Projects tab, the list and the project page with its steps 1 (Inputs) and 4 (Install), on the fake transport (fake-transport.js).
// Tasks 7 and 8 add their own sections at the end of this file: the steps they build (Harmonize, Graph & simulator).
//   node apps/desktop/tests/browser-projects.mjs        (MURO_UI_PORT moves the dev server off 1422)
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { open } from './browser-helper.mjs';

const shots = 'apps/desktop/tests/artifacts';
await mkdir(shots, { recursive: true });
const done = [];
async function test(name, scenario, options, body) {
  const app = await open(scenario, options);
  try { await body(app); done.push(name); } finally { await app.close(); }
}
const actions = async app => (await app.calls()).map(c => c.action);
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const tab = (page, name) => page.getByRole('tab', { name: new RegExp('^' + name) });
const goProjects = async page => { await page.locator('nav button', { hasText: 'Projects' }).click(); await page.getByRole('heading', { name: 'Projects', level: 1 }).waitFor(); };
const openMarionette = async page => { await goProjects(page); await page.getByRole('button', { name: /Marionette/ }).click(); await page.getByRole('heading', { name: 'Marionette', level: 1 }).waitFor(); };
const kept = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('muro.project') ?? 'null'));
const switchOf = (page, harness) => page.locator(`[role=switch][aria-label="Install Marionette on ${harness}"]`);

await test('Projects is the first tab, the app still opens on Sync, and the list says what each project is', 'projects', {}, async app => {
  const { page } = app;
  await page.locator('nav').waitFor();
  assert.deepEqual(await page.locator('nav button .label').allTextContents(), ['Projects', 'Sync', 'Activity', 'Settings']);
  assert.equal(await page.locator('nav button[aria-current=page] .label').textContent(), 'Sync', 'the app opens on Sync');
  assert.equal(await page.getByRole('heading', { name: 'Sync', level: 1 }).count(), 1);
  assert.equal((await actions(app)).includes('projects'), false, 'nothing of the Projects tab is read before it is opened');
  await goProjects(page);
  assert.equal(await page.locator('nav button[aria-current=page] .label').textContent(), 'Projects');
  const row = page.locator('li.go', { hasText: 'Marionette' });
  await row.waitFor();
  const text = await row.textContent();
  assert.match(text, /Marionette\s*0\.5\.0/);
  assert.match(text, /Included with Muro/);
  assert.match(text, /D:\/Muro\/data\/projects\/marionette\.mp/);
  assert.match(text, /3 inputs · 4 capabilities/);
  assert.match(text, /Harmonized/);
  assert.match(text, /Not installed anywhere/);
  const published = page.locator('li', { hasText: 'commit-helper' });
  assert.match(await published.textContent(), /No version for Codex/);
  assert.equal(await page.locator('h2', { hasText: 'Installed as published' }).count(), 1);
  assert.equal(await page.getByText(/New project|Create a project/).count(), 0, 'the write side is plan 3');
  assert.deepEqual((await actions(app)).filter(a => a === 'projects' || a === 'project'), ['projects']);
  await page.screenshot({ path: shots + '/projects-list.png' });
});

await test('the project page: its header, its file, what the file holds, and the four steps as tabs', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  assert.deepEqual((await app.calls()).filter(c => c.action === 'project'), [{ action: 'project', payload: { id: 'marionette' } }]);
  const head = page.locator('.projhead');
  assert.match(await head.textContent(), /Marionette\s*0\.5\.0\s*Harmonized\s*Included with Muro/);
  const file = page.locator('.projfile');
  assert.match(await file.textContent(), /D:\/Muro\/data\/projects\/marionette\.mp/);
  assert.match(await file.textContent(), /Repository github\.com\/acaprino\/marionette · main · by acaprino · created 2026-11-10/);
  await file.getByRole('button', { name: 'Open folder' }).click();
  await page.waitForFunction(() => window.calls.some(c => c.action === 'open_folder'));
  assert.deepEqual((await app.calls()).find(c => c.action === 'open_folder'), { action: 'open_folder', payload: { path: 'D:/Muro/data/projects/marionette.mp' } });
  assert.equal(await page.locator('.pfiles').isVisible(), false, 'what the file holds is closed at first');
  await page.getByText('What this project file holds').click();
  assert.deepEqual(await page.locator('.pfiles li strong').allTextContents(), ['Identity', 'Choices', 'Your instructions', 'Built plugin', 'Offline']);
  assert.deepEqual(await page.getByRole('tablist', { name: 'Project steps' }).getByRole('tab').allInnerTexts().then(t => t.map(x => x.replace(/\s+/g, ' ').trim())), ['1 Inputs 3 inputs', '2 Harmonize Harmonized', '3 Graph & simulator 4 capabilities · 2 examples', '4 Install Not installed anywhere']);
  assert.equal(await page.getByRole('tab', { selected: true }).count(), 1);
  assert.match(await tab(page, 'Inputs').getAttribute('aria-selected'), /true/);
  await page.getByRole('tabpanel').waitFor();
  assert.equal(await page.getByRole('tabpanel').getAttribute('aria-labelledby'), 'step-tab-inputs');
  await page.screenshot({ path: shots + '/project-inputs.png' });
  await page.locator('.crumb button').click();
  await page.getByRole('heading', { name: 'Projects', level: 1 }).waitFor();
  assert.equal(await kept(page), null, 'closing the project forgets it');
});

await test('Inputs: what goes in, pinned how, under which license, and what it became; the write actions are not there', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  const rows = page.locator('.pinputs tbody tr');
  assert.equal(await rows.count(), 3);
  const first = (await rows.nth(0).innerText()).replace(/\s+/g, ' ');
  assert.match(first, /taste-skill https:\/\/github\.com\/example\/taste-skill v1\.2\.0 published release MIT 2 capabilities · 1 dropped/);
  assert.match((await rows.nth(1).innerText()).replace(/\s+/g, ' '), /genoffice .* Latest commit @0123456 Apache-2\.0 1 capability · 1 hook/);
  assert.match((await rows.nth(2).innerText()).replace(/\s+/g, ' '), /superpowers .* Frozen commit @fedcba9 MIT 1 always on/);
  assert.equal(await page.getByRole('button', { name: /Move pin|Add input/ }).count(), 0);
  assert.match(await page.locator('.sec', { hasText: 'Custom instructions' }).locator('xpath=following-sibling::ul[1]').textContent(), /house-style\.md/);
  await rows.nth(0).getByRole('button').click();
  await tab(page, 'Harmonize').and(page.locator('[aria-selected=true]')).waitFor();
  const record = await kept(page);
  assert.deepEqual({ step: record.step, view: record.view, dsrc: record.dsrc, dform: record.dform }, { step: 'harmonize', view: 'choices', dsrc: 'taste-skill', dform: 'all' }, 'its choices, filtered to that input, are kept for step 2');
});

await test('the steps are a tablist with arrow keys: the keyboard goes with the selection, the arrows wrap, Home and End go to the ends', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  const current = () => page.evaluate(() => ({ focus: document.activeElement?.id, selected: [...document.querySelectorAll('[role=tab]')].filter(t => t.getAttribute('aria-selected') === 'true').map(t => t.id), tabbable: [...document.querySelectorAll('[role=tab]')].filter(t => t.tabIndex === 0).map(t => t.id) }));
  await tab(page, 'Inputs').focus();
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await current(), { focus: 'step-tab-harmonize', selected: ['step-tab-harmonize'], tabbable: ['step-tab-harmonize'] });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await current(), { focus: 'step-tab-install', selected: ['step-tab-install'], tabbable: ['step-tab-install'] });
  await page.keyboard.press('ArrowRight');
  assert.equal((await current()).focus, 'step-tab-inputs', 'wraps to the first');
  await page.keyboard.press('ArrowLeft');
  assert.equal((await current()).focus, 'step-tab-install', 'wraps to the last');
  await page.keyboard.press('Home');
  assert.equal((await current()).focus, 'step-tab-inputs');
  await page.keyboard.press('End');
  assert.equal((await current()).focus, 'step-tab-install');
  await page.keyboard.press('ArrowDown');
  assert.equal((await current()).focus, 'step-tab-install', 'other keys do nothing');
  assert.equal(await page.getByRole('tabpanel').getAttribute('aria-labelledby'), 'step-tab-install');
  await page.keyboard.press('Tab');
  assert.notEqual((await current()).focus, 'step-tab-install', 'Tab leaves the tablist for the panel');
  await page.keyboard.press('Shift+Tab');
  assert.equal((await current()).focus, 'step-tab-install', 'and Shift+Tab comes back to the selected tab, the only one in the tab order');
  assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'solid', 'the focused tab has a visible focus');
});

await test('Graph & simulator opens in its tab panel with the simulator and the graph, not a placeholder (its sections are below)', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await tab(page, 'Graph').click();
  const panel = page.getByRole('tabpanel');
  assert.equal(await panel.getAttribute('aria-labelledby'), 'step-tab-graph');
  await panel.getByRole('heading', { name: 'Simulate a request', level: 2 }).waitFor();
  assert.equal(await panel.locator('svg.graph').count(), 1, 'the decision graph');
  assert.equal(await panel.locator('textarea[name="simtask"]').count(), 1, 'the request box');
  assert.equal(await page.getByText('Coming in this version').count(), 0, 'no placeholder is left');
});

await test('Install: a switch per harness calls install_project with the id of that harness; what waits is reviewed in the sheet of Sync and applied there', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await tab(page, 'Install').click();
  assert.equal(await switchOf(page, 'Claude Code').getAttribute('aria-checked'), 'false');
  assert.equal(await page.getByRole('button', { name: /^Review/ }).count(), 0, 'nothing waits yet');
  const before = (await app.calls()).length;
  await switchOf(page, 'Codex').click();
  await page.locator('#step-panel li', { hasText: 'Codex' }).getByText('Install 0.5.0').waitFor();
  const made = (await app.calls()).slice(before);
  assert.deepEqual(made.map(c => c.action).filter(a => a !== 'plan'), ['install_project', 'snapshot'], 'one install_project sets the build and the target: the page saves nothing');
  assert.deepEqual(made[0], { action: 'install_project', payload: { id: 'marionette', targets: ['t2'] } }, 'the id of the Codex switch, never the kind of harness');
  assert.equal(await switchOf(page, 'Codex').getAttribute('aria-checked'), 'true');
  assert.equal(await switchOf(page, 'Claude Code').getAttribute('aria-checked'), 'false', 'only the one switched');
  assert.match(await tab(page, 'Install').textContent(), /On 1 harness · 1 change waiting/);
  assert.equal(await page.locator('nav button', { hasText: 'Sync' }).locator('.n').textContent(), '1', 'the tab of Sync counts the change this switch made');
  await page.getByRole('button', { name: 'Review 1 change' }).click();
  await page.locator('dialog.sheet[open] h2', { hasText: 'Review changes' }).waitFor();
  assert.deepEqual((await app.calls()).at(-1), { action: 'plan', payload: {} }, 'a fresh plan of everything, as Sync asks for it');
  assert.match(await page.locator('dialog.sheet').textContent(), /Install\s*Marionette/);
  await page.screenshot({ path: shots + '/project-install-review.png' });
  await page.getByRole('button', { name: /^Apply 1 change/ }).click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  await page.locator('#step-panel li', { hasText: 'Codex' }).locator('.cell.ok').waitFor();
  assert.match(await tab(page, 'Install').textContent(), /On 1 harness · in sync/);
  assert.equal(await page.getByRole('button', { name: /^Review/ }).count(), 0);
  await page.screenshot({ path: shots + '/project-install.png' });
  await switchOf(page, 'Codex').click();
  await switchOf(page, 'Codex').and(page.locator('[aria-checked=false]')).waitFor();
  const last = (await app.calls()).filter(c => c.action !== 'plan').at(-1);
  assert.equal(last.action, 'save_plugin');
  assert.deepEqual(last.payload.plugin.targets, [], 'the harness left the targets of the plugin');
  assert.equal((await app.calls()).filter(c => c.action === 'install_project').length, 1, 'switching off installs nothing');
});

await test('the list says where a project is installed once it is, and keeps the plugins installed as published apart', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await tab(page, 'Install').click();
  await switchOf(page, 'Claude Code').click();
  await switchOf(page, 'Claude Code').and(page.locator('[aria-checked=true]')).waitFor();
  await page.locator('.crumb button').click();
  const row = page.locator('li.go', { hasText: 'Marionette' });
  await row.getByText(/On 1 harness · 1 change waiting/).waitFor();
  assert.equal(await page.locator('h2', { hasText: 'Installed as published' }).count(), 1);
  assert.equal(await page.locator('li', { hasText: 'commit-helper' }).count(), 1);
  assert.equal(await page.locator('li:not(.go)', { hasText: 'Marionette' }).count(), 0, 'the project plugin is not listed among the plugins installed as published');
});

await test('Install: a harness whose build is older than the project file says so, offers to install again, and the install takes the file as it is now', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await tab(page, 'Install').click();
  await switchOf(page, 'Claude Code').click();
  await switchOf(page, 'Claude Code').and(page.locator('[aria-checked=true]')).waitFor();
  assert.match(await tab(page, 'Install').textContent(), /On 1 harness · 1 change waiting/);
  // the project file changes behind the page: the registry's plan blocks the plugin of the project on the harness it is on
  await app.flags({ projectChanged: true });
  await page.locator('nav button', { hasText: 'Sync' }).click();
  await page.getByRole('button', { name: 'Check now', exact: true }).click();
  await page.getByText(/Project file changed: open the project again/).first().waitFor();
  await page.locator('nav button', { hasText: 'Projects' }).click();
  const row = page.locator('#step-panel li', { hasText: 'Claude Code' });
  await row.getByText('Changed since it was installed: install again', { exact: true }).waitFor();
  assert.equal(await row.locator('.cell').count(), 0, 'not shown as a version that is up to date');
  assert.match(await tab(page, 'Install').textContent(), /1 harness to install again/);
  const before = (await app.calls()).length;
  await row.getByRole('button', { name: 'Install Marionette again on Claude Code' }).click();
  await row.getByText('Changed since it was installed: install again').waitFor({ state: 'detached' });
  const made = (await app.calls()).slice(before);
  assert.deepEqual(made.filter(c => c.action === 'install_project'), [{ action: 'install_project', payload: { id: 'marionette', targets: ['t1'] } }], 'the harnesses that are on, nothing else');
  assert.equal(made.some(c => c.action === 'save_plugin'), false, 'the page saves nothing itself');
  assert.equal(await switchOf(page, 'Claude Code').getAttribute('aria-checked'), 'true');
  assert.equal(await switchOf(page, 'Codex').getAttribute('aria-checked'), 'false', 'a harness that was off stays off');
  await page.screenshot({ path: shots + '/project-install-again.png' });
});

await test('Remove from list asks first, removes only the entry, and the project Muro ships has none', 'projects', {}, async app => {
  const { page } = app;
  await app.flags({ pickPath: 'D:/Notes/Notes.mp' });
  await goProjects(page);
  await page.locator('li.go', { hasText: 'Marionette' }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^Remove .* from the list$/ }).count(), 0, 'the project Muro ships stays in the list');
  await page.getByRole('button', { name: 'Open project file…' }).click();
  await page.locator('li.go', { hasText: 'Notes' }).waitFor();
  const remove = page.getByRole('button', { name: 'Remove Notes from the list' });
  assert.equal(await remove.count(), 1);
  const dlg = page.locator('dialog[open]');
  await remove.click();
  await dlg.locator('h2', { hasText: 'Remove Notes from your list?' }).waitFor();
  await dlg.getByText('Only the entry goes: the file stays where it is (D:/Notes/Notes.mp) and you can open it again.', { exact: true }).waitFor();
  assert.equal((await actions(app)).includes('remove_project'), false, 'nothing is removed before the person agrees');
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  await dlg.waitFor({ state: 'detached' });
  assert.equal(await page.locator('li.go', { hasText: 'Notes' }).count(), 1, 'cancelled: still listed');
  await remove.click();
  await dlg.getByRole('button', { name: 'Remove from list', exact: true }).click();
  await page.locator('.toast', { hasText: 'Notes removed from your list.' }).waitFor();
  await page.locator('li.go', { hasText: 'Notes' }).waitFor({ state: 'detached' });
  const asked = (await app.calls()).filter(c => c.action === 'remove_project');
  assert.equal(asked.length, 1);
  assert.equal(asked[0].payload.id, 'notes');
  assert.equal(typeof asked[0].payload.revision, 'number');
  assert.equal(await page.locator('li.go').count(), 1, 'the project Muro ships is all that is left');
  assert.equal(await sideways(page), 0);
});

await test('a runtime that leaves the harness out of the plugin\'s targets is an error in the banner, and the switch stays off', 'projects', {}, async app => {
  const { page } = app;
  await app.flags({ installLeavesTargets: true });
  await openMarionette(page);
  await tab(page, 'Install').click();
  const before = (await app.calls()).length;
  await switchOf(page, 'Codex').click();
  await page.locator('.banner.bad', { hasText: 'marionette was not set up for Codex' }).waitFor();
  assert.equal(await switchOf(page, 'Codex').getAttribute('aria-checked'), 'false');
  assert.equal((await app.calls()).slice(before).some(c => c.action === 'save_plugin'), false, 'the page does not save the targets itself');
});

await test('an install that fails says why and changes nothing', 'projects', {}, async app => {
  const { page } = app;
  await app.flags({ rejectInstall: true });
  await openMarionette(page);
  await tab(page, 'Install').click();
  await switchOf(page, 'Codex').click();
  await page.locator('.banner.bad', { hasText: 'no build for codex' }).waitFor();
  assert.equal(await switchOf(page, 'Codex').getAttribute('aria-checked'), 'false');
});

await test('the open project, its step and the tab survive a reload; the app opens on Sync again, and the Projects tab brings the project back', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await tab(page, 'Install').click();
  await page.reload();
  await page.locator('nav').waitFor();
  assert.equal(await page.locator('nav button[aria-current=page] .label').textContent(), 'Sync', 'the app opens on Sync');
  await page.locator('nav button', { hasText: 'Projects' }).click();
  await page.getByRole('heading', { name: 'Marionette', level: 1 }).waitFor();
  assert.equal(await tab(page, 'Install').getAttribute('aria-selected'), 'true', 'the step is the one that was open');
  await page.locator('nav button', { hasText: 'Projects' }).click();
  await page.getByRole('heading', { name: 'Projects', level: 1 }).waitFor();
  assert.equal(await page.locator('.projhead').count(), 0, 'the Projects tab, clicked while a project is open, goes back to the list');
  await page.locator('nav button', { hasText: 'Sync' }).click();
  await page.locator('nav button', { hasText: 'Projects' }).click();
  assert.equal(await page.locator('.projhead').count(), 0, 'and the list stays the list');
});

await test('the step and the page keep the keyboard where it was when they paint again', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await tab(page, 'Install').click();
  await switchOf(page, 'Claude Code').focus();
  await page.keyboard.press('Space');
  await switchOf(page, 'Claude Code').and(page.locator('[aria-checked=true]')).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Install Marionette on Claude Code', 'the switch keeps the focus after the request');
});

await test('Open project file: the shell picks a file, Muro adds it, the list is read again and the project is listed', 'projects', {}, async app => {
  const { page } = app;
  await app.flags({ pickPath: 'D:/Notes/Notes.mp' });
  await goProjects(page);
  await page.getByRole('button', { name: 'Open project file…' }).click();
  await page.locator('li.go', { hasText: 'Notes' }).waitFor();
  assert.deepEqual((await actions(app)).filter(a => ['pick_file', 'open_project'].includes(a)), ['pick_file', 'open_project']);
  assert.deepEqual((await app.calls()).find(c => c.action === 'pick_file').payload, { filter: 'Muro project (*.mp)' });
  assert.deepEqual((await app.calls()).find(c => c.action === 'open_project').payload, { path: 'D:/Notes/Notes.mp' });
  await page.locator('.toast', { hasText: 'Notes added to your list.' }).waitFor();
  assert.equal(await page.locator('li.go').count(), 2);
  assert.doesNotMatch(await page.locator('li.go', { hasText: 'Notes' }).textContent(), /Included with Muro/);
  await page.locator('li.go', { hasText: 'Notes' }).locator('button[data-action=open-project]').click();
  await page.getByRole('heading', { name: 'Notes', level: 1 }).waitFor();
  assert.match(await page.locator('.projfile').textContent(), /No Git repository set · by you/);
});

await test('a cancelled file dialog changes nothing; a file that is not a project is refused with the reason', 'projects', {}, async app => {
  const { page } = app;
  await goProjects(page);
  await app.flags({ pickPath: null });
  await page.getByRole('button', { name: 'Open project file…' }).click();
  await page.waitForFunction(() => window.calls.some(c => c.action === 'pick_file'));
  assert.equal((await actions(app)).includes('open_project'), false);
  assert.equal(await page.locator('.banner').count(), 0);
  await app.flags({ pickPath: 'D:/Notes/Notes.txt' });
  await page.getByRole('button', { name: 'Open project file…' }).click();
  await page.locator('.banner.bad', { hasText: 'Not a Muro project file' }).waitFor();
  assert.equal(await page.locator('li.go').count(), 1, 'nothing was added');
});

await test('a shell that has no file dialog or folder opening yet loses those buttons and says so', 'projects', {}, async app => {
  const { page } = app;
  await app.flags({ noShellActions: true });
  await goProjects(page);
  await page.getByRole('button', { name: 'Open project file…' }).click();
  await page.locator('.toast', { hasText: 'cannot open a file dialog' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Open project file…' }).count(), 0);
  assert.equal(await page.locator('.banner').count(), 0, 'not an error of the app');
  await page.getByRole('button', { name: /Marionette/ }).click();
  await page.getByRole('heading', { name: 'Marionette', level: 1 }).waitFor();
  await page.locator('.projfile').getByRole('button', { name: 'Open folder' }).click();
  await page.locator('.toast', { hasText: 'cannot open folders' }).waitFor();
  assert.equal(await page.locator('.projfile').getByRole('button', { name: 'Open folder' }).count(), 0);
});

await test('with no project listed the page says what to do, and offers no way to create one yet', 'default', {}, async app => {
  const { page } = app;
  await goProjects(page);
  await page.getByText('No project yet').waitFor();
  assert.match(await page.locator('.empty').textContent(), /Open a project file to add it here\./);
  assert.equal(await page.getByRole('button', { name: 'Open project file…' }).count() > 0, true);
  assert.equal(await page.getByText(/New project|Create a project/).count(), 0);
  assert.equal(await page.locator('h2', { hasText: 'Installed as published' }).count(), 0);
});

await test('no sideways scroll at 760px, on the list and on a project; every control has a name', 'projects', { viewport: { width: 760, height: 900 } }, async app => {
  const { page } = app;
  await goProjects(page);
  await page.locator('li.go').waitFor();
  assert.ok(await sideways(page) <= 0, 'the list');
  await openMarionette(page);
  assert.ok(await sideways(page) <= 0, 'the project');
  await page.getByText('What this project file holds').click();
  assert.ok(await sideways(page) <= 0, 'what the file holds');
  for (const name of ['Install', 'Inputs']) { await tab(page, name).click(); assert.ok(await sideways(page) <= 0, name); }
  const unnamed = await page.evaluate(() => [...document.querySelectorAll('button, [role=switch], [role=tab]')].filter(b => !(b.getAttribute('aria-label') || b.textContent.trim())).length);
  assert.equal(unnamed, 0);
  await page.screenshot({ path: shots + '/project-760.png' });
});

await test('the light theme keeps the project page readable', 'projects', { colorScheme: 'light' }, async app => {
  const { page } = app;
  await openMarionette(page);
  await page.getByText('What this project file holds').click();
  await page.screenshot({ path: shots + '/project-light.png' });
});

// ---------- Plan 2, Task 7: step 2, Harmonize (the project's history and reasons, read only) ----------
const harmonizeTab = async page => { await openMarionette(page); await tab(page, 'Harmonize').click(); await page.locator('section.strip').waitFor(); };
const viewRadio = (page, name) => page.getByRole('radiogroup', { name: 'Harmonization views' }).getByRole('radio', { name: new RegExp('^' + name) });
const choose = async (page, name) => { await viewRadio(page, name).check({ force: true }); await page.getByRole('region', { name }).waitFor(); };
const flat = async locator => (await locator.innerText()).replace(/\s+/g, ' ').trim();
const rowsOf = async locator => Promise.all((await locator.all()).map(flat));
const focused = (page, attribute) => page.evaluate(a => document.activeElement?.getAttribute(a), attribute);

await test('Harmonize: the state strip, the four views as a radio group, the decision records, and nothing to write', 'projects', {}, async app => {
  const { page } = app;
  await harmonizeTab(page);
  assert.equal(await page.getByRole('tabpanel').getAttribute('aria-labelledby'), 'step-tab-harmonize');
  assert.match(await flat(page.locator('section.strip')), /^Harmonized Last run 18 Nov 2026, \d\d:\d\d Version 0\.5\.0 Agent Claude Code$/);
  assert.deepEqual(await page.getByRole('radiogroup', { name: 'Harmonization views' }).locator('label').allTextContents(), ['Decision records · 2', 'Choices by part · 6', 'History · 2', 'Prompts']);
  assert.equal(await viewRadio(page, 'Decision records').isChecked(), true);
  assert.deepEqual(await rowsOf(page.locator('.dec > li')), ['By Muro 2026-11-10 · design-taste One owner per output.', 'Yours · binding 2026-11-12 · office-docs Documents keep the source\'s limits.']);
  assert.equal(await page.getByRole('button', { name: /^(Edit|Add a record|Add input|Harmonize|Harmonize again|Move pin)$/ }).count(), 0, 'the write side is plan 3');
  assert.equal(await page.locator('#step-panel button').count(), 0, 'nothing to press in the records');
  await page.screenshot({ path: shots + '/project-harmonize-records.png' });
});

await test('Harmonize, Choices by part: filter by input and by form, the count, links to capabilities, and the filters are kept', 'projects', {}, async app => {
  const { page } = app;
  await harmonizeTab(page);
  await choose(page, 'Choices by part');
  const count = () => flat(page.locator('#step-panel .tools strong'));
  assert.equal(await count(), '6 of 6');
  assert.equal((await rowsOf(page.locator('.dec > li')))[0], 'Capability taste-skill SKILL.md Its method is a design capability. → design-taste');
  const link = page.locator('.dec .to button').first();
  assert.deepEqual([await link.getAttribute('data-action'), await link.getAttribute('data-id'), await link.getAttribute('aria-label')], ['open-capability', 'design-taste', 'Open capability design-taste']);
  assert.deepEqual(await page.getByLabel('Filter by input').locator('option').allTextContents(), ['All inputs', 'taste-skill', 'genoffice', 'superpowers']);
  assert.deepEqual(await page.getByRole('radiogroup', { name: 'Filter by form' }).locator('label').allTextContents(), ['All', 'Capability', 'Always on', 'Hook', 'Dropped']);
  await page.getByLabel('Filter by input').selectOption('genoffice');
  await page.locator('#step-panel .tools strong', { hasText: '2 of 6' }).waitFor();
  assert.deepEqual((await rowsOf(page.locator('.dec > li'))).map(t => t.split(' ').slice(0, 3).join(' ')), ['Capability genoffice skills/docx', 'Hook genoffice hooks/guard.json']);
  await page.getByRole('radiogroup', { name: 'Filter by form' }).getByRole('radio', { name: 'Hook' }).check({ force: true });
  await page.locator('#step-panel .tools strong', { hasText: '1 of 6' }).waitFor();
  assert.equal(await focused(page, 'value'), 'hook', 'the radio keeps the focus');
  assert.equal(await page.getByLabel('Filter by input').inputValue(), 'genoffice', 'the input filter is still chosen');
  assert.deepEqual(await kept(page).then(r => [r.view, r.dsrc, r.dform]), ['choices', 'genoffice', 'hook']);
  await page.getByLabel('Filter by input').selectOption('superpowers');
  await page.getByText('No choice matches this filter.').waitFor();
  assert.equal(await page.locator('.dec').count(), 0);
  assert.equal(await count(), '0 of 6');
  await page.getByLabel('Filter by input').selectOption('');
  await page.getByRole('radiogroup', { name: 'Filter by form' }).getByRole('radio', { name: 'All' }).check({ force: true });
  await page.locator('#step-panel .tools strong', { hasText: '6 of 6' }).waitFor();
  assert.equal(await page.locator('.dec > li').count(), 6);
  await page.screenshot({ path: shots + '/project-harmonize-choices.png' });
});

await test('Harmonize: the arrow keys move between the views and the radio keeps the keyboard', 'projects', {}, async app => {
  const { page } = app;
  await harmonizeTab(page);
  await viewRadio(page, 'Decision records').focus();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('region', { name: 'Choices by part' }).waitFor();
  assert.equal(await viewRadio(page, 'Choices by part').isChecked(), true);
  assert.equal(await focused(page, 'value'), 'choices');
  await page.keyboard.press('ArrowRight');
  await page.getByRole('region', { name: 'History' }).waitFor();
  assert.equal(await focused(page, 'value'), 'history');
  await page.keyboard.press('ArrowLeft');
  await page.getByRole('region', { name: 'Choices by part' }).waitFor();
  assert.equal(await focused(page, 'value'), 'choices');
});

await test('Harmonize, History: one row a run with its version and tag, changelog, result, budget and engine', 'projects', {}, async app => {
  const { page } = app;
  await harmonizeTab(page);
  await choose(page, 'History');
  assert.deepEqual(await page.locator('.runs th').allTextContents(), ['When', 'Version', 'Changelog', 'Result', 'Budget', 'Engine']);
  const rows = await rowsOf(page.locator('.runs tbody tr'));
  assert.equal(rows.length, 2);
  assert.match(rows[0], /^18 Nov 2026, \d\d:\d\d 0\.5\.0 current marionette-v0\.5\.0 Moved taste-skill to v1\.2\.0\. Built and validated \$2\.00 Claude Code$/, 'the newest first, its tag from the repository\'s prefix');
  assert.match(rows[1], /^10 Nov 2026, \d\d:\d\d 0\.4\.0 marionette-v0\.4\.0 First harmonization\. Built and validated — —$/, 'no budget and no engine recorded');
  const region = page.getByRole('region', { name: 'Runs' });
  await region.focus();
  assert.equal(await focused(page, 'aria-label'), 'Runs', 'the table can be scrolled with the keyboard');
  assert.equal(await page.getByRole('button', { name: /Edit|Harmonize|Cancel/ }).count(), 0);
  await page.screenshot({ path: shots + '/project-harmonize-history.png' });
});

await test('Harmonize, History: a project with no repository has no tag', 'projects', {}, async app => {
  const { page } = app;
  await app.flags({ pickPath: 'D:/Notes/Notes.mp' });
  await goProjects(page);
  await page.getByRole('button', { name: 'Open project file…' }).click();
  await page.locator('li.go', { hasText: 'Notes' }).locator('button[data-action=open-project]').click();
  await page.getByRole('heading', { name: 'Notes', level: 1 }).waitFor();
  await tab(page, 'Harmonize').click();
  await choose(page, 'History');
  const rows = await rowsOf(page.locator('.runs tbody tr'));
  assert.match(rows[0], /^18 Nov 2026, \d\d:\d\d 0\.5\.0 current Moved taste-skill/, 'no line with a tag');
  assert.equal(await page.locator('.runs small').count(), 0);
});

await test('Harmonize, Prompts: each prompt with an Open that shows its text in a sheet, and the focus goes in and comes back', 'projects', {}, async app => {
  const { page } = app;
  await harmonizeTab(page);
  await choose(page, 'Prompts');
  const items = await rowsOf(page.locator('#step-panel li'));
  assert.equal(items.length, 4);
  assert.match(items[0], /^intake\.md Reads the inputs, classifies what they do and extracts capabilities with their provenance\. Open$/);
  assert.deepEqual(await page.locator('#step-panel li button').evaluateAll(b => b.map(x => x.getAttribute('aria-label'))), ['Open intake.md', 'Open harmonizer.md', 'Open delivery.md', 'Open classify.md']);
  await page.getByRole('button', { name: 'Open intake.md' }).click();
  const sheet = page.getByRole('dialog', { name: 'intake.md' });
  await sheet.waitFor();
  assert.equal(await sheet.evaluate(d => d.classList.contains('sheet')), true, 'a sheet, on the right');
  assert.equal(await sheet.locator('pre.prompt').textContent(), '# intake.md\n\nThe prompt.');
  assert.equal(await page.evaluate(() => !!document.activeElement?.closest('dialog')), true, 'the focus is in the sheet');
  let reached = false;
  for (let i = 0; i < 3 && !reached; i++) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => !!document.activeElement?.classList.contains('prompt')); }
  assert.equal(reached, true, 'the text can be reached with the keyboard, to scroll it');
  await page.screenshot({ path: shots + '/project-harmonize-prompt.png' });
  await page.keyboard.press('Escape');
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert.equal(await focused(page, 'aria-label'), 'Open intake.md', 'the focus returns to the button that opened the sheet');
  await page.getByRole('button', { name: 'Open classify.md' }).click();
  await page.getByRole('dialog', { name: 'classify.md' }).getByRole('button', { name: 'Close' }).click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert.equal(await focused(page, 'aria-label'), 'Open classify.md');
});

await test('Harmonize: the view and its filters survive a reload, and a stored filter for an input the project lacks shows all', 'projects', {}, async app => {
  const { page } = app;
  await harmonizeTab(page);
  await choose(page, 'Choices by part');
  await page.getByLabel('Filter by input').selectOption('genoffice');
  await page.locator('#step-panel .tools strong', { hasText: '2 of 6' }).waitFor();
  await page.reload();
  await page.locator('nav').waitFor();
  await page.locator('nav button', { hasText: 'Projects' }).click();
  await page.getByRole('heading', { name: 'Marionette', level: 1 }).waitFor();
  await page.locator('#step-panel .tools strong', { hasText: '2 of 6' }).waitFor();
  assert.equal(await viewRadio(page, 'Choices by part').isChecked(), true);
  assert.equal(await page.getByLabel('Filter by input').inputValue(), 'genoffice');
  await page.evaluate(() => { const r = JSON.parse(sessionStorage.getItem('muro.project')); r.dsrc = 'vanished'; sessionStorage.setItem('muro.project', JSON.stringify(r)); });
  await page.reload();
  await page.locator('nav').waitFor();
  await page.locator('nav button', { hasText: 'Projects' }).click();
  await page.locator('#step-panel .tools strong', { hasText: '6 of 6' }).waitFor();
  assert.equal(await page.getByLabel('Filter by input').inputValue(), '');
});

await test('Harmonize at 760px: no sideways scroll in any view, every control has a name', 'projects', { viewport: { width: 760, height: 900 } }, async app => {
  const { page } = app;
  await harmonizeTab(page);
  for (const name of ['Decision records', 'Choices by part', 'History', 'Prompts']) {
    await choose(page, name);
    assert.ok(await sideways(page) <= 0, name);
    const unnamed = await page.evaluate(() => [...document.querySelectorAll('#step-panel button, #step-panel select, #step-panel input, #step-panel [tabindex]')].filter(e => !(e.getAttribute('aria-label') || e.textContent.trim() || [...(e.labels ?? [])].some(l => l.textContent.trim()))).length);
    assert.equal(unnamed, 0, `${name}: every control is named`);
  }
  await choose(page, 'Choices by part');
  await page.screenshot({ path: shots + '/project-harmonize-760.png' });
});

await test('Harmonize in the light theme stays readable', 'projects', { colorScheme: 'light' }, async app => {
  const { page } = app;
  await harmonizeTab(page);
  await choose(page, 'Choices by part');
  await page.screenshot({ path: shots + '/project-harmonize-light.png' });
});

// ---------- Plan 2, Task 8: step 3, the graph and the simulator ----------
// The fake service answers `simulate` from flags (fake-transport.js): it never reads the words of a request, so these tests prove how the page shows and keeps what the AI decided, not what an AI decides.
const squash = async locator => (await locator.innerText()).replace(/\s+/g, ' ').trim();
const activeAttr = (page, attribute) => page.evaluate(a => document.activeElement?.getAttribute(a), attribute);
const graphTab = async page => { await openMarionette(page); await tab(page, 'Graph').click(); await page.locator('.two svg.graph').waitFor(); };
const gnode = (page, id) => page.locator(`button.gnode[data-id="${id}"]`);
const litNodes = page => page.locator('button.gnode.on');
const simulateButton = page => page.locator('button[data-action="graph-simulate"]');
const requestBox = page => page.locator('textarea[name="simtask"]');
const simulations = async app => (await app.calls()).filter(c => c.action === 'simulate');
const nameFits = page => page.locator('button.gnode').evaluateAll(nodes => nodes.every(b => { const name = b.querySelector('.gname').getBoundingClientRect(), box = b.getBoundingClientRect(); return name.left >= box.left && name.right <= box.right - 1; }));
const unnamedIn = (page, scope) => page.evaluate(s => [...document.querySelectorAll(`${s} button, ${s} textarea, ${s} [tabindex]`)].filter(e => !(e.getAttribute('aria-label') || e.textContent.trim())).length, scope);

await test('Graph & simulator: one labelled drawing, every capability a named button, conditions and conflicts drawn, and nothing simulated until asked', 'projects', {}, async app => {
  const { page } = app;
  await graphTab(page);
  assert.equal(await page.getByRole('tabpanel').getAttribute('aria-labelledby'), 'step-tab-graph');
  const svg = page.locator('svg.graph');
  assert.deepEqual([await svg.getAttribute('role'), await svg.getAttribute('aria-label')], ['group', 'Decision graph: entries on the left, capabilities on the right']);
  assert.deepEqual(await page.locator('button.gnode').evaluateAll(b => b.map(x => x.getAttribute('aria-label'))), ['Capability design-taste, entry design', 'Capability design-review, entry design', 'Capability office-docs, entry office', 'Capability office-pdf, entry office']);
  assert.deepEqual(await page.locator('svg.graph g.n.ent').evaluateAll(g => g.map(x => x.textContent.trim())), ['Use when designing an interface.design', 'Use when producing Word files.office'], 'the entries, without the plugin\'s prefix, each with its "Use when" as the tooltip');
  assert.match(await squash(page.locator('.legend')), /entry → capability needs, on a condition never together 2 entries · 4 capabilities$/);
  assert.equal(await svg.locator('path.e.need').count(), 1);
  assert.equal(await svg.locator('path.e.conf').count(), 1);
  assert.equal(await litNodes(page).count(), 0);
  assert.equal(await page.locator('.simres').count(), 0, 'no result before there is one');
  assert.equal((await simulations(app)).length, 0);
  assert.equal(await nameFits(page), true, 'every name is inside its node');
  assert.equal(await page.getByRole('heading', { name: 'Documented examples' }).count(), 1);
  assert.equal(await page.locator('.exlist button').count(), 2);
  await page.screenshot({ path: shots + '/project-graph.png' });
});

await test('Graph & simulator: the nodes are reached with the keyboard, in order, with a visible focus', 'projects', {}, async app => {
  const { page } = app;
  await graphTab(page);
  await gnode(page, 'design-taste').focus();
  await page.keyboard.press('Tab');
  assert.equal(await activeAttr(page, 'data-id'), 'design-review');
  assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'solid', 'a focus ring on the node');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await activeAttr(page, 'data-id'), 'design-taste');
  await page.keyboard.press('Space');
  await page.getByRole('dialog', { name: 'design-taste' }).waitFor();
});

await test('Documented examples: one lights its branch in order with no call, again clears it, another replaces it', 'projects', {}, async app => {
  const { page } = app;
  await graphTab(page);
  const example = name => page.locator('.exlist button', { hasText: name });
  await example('A landing page').click();
  assert.equal(await example('A landing page').getAttribute('aria-pressed'), 'true');
  const card = page.locator('.simres');
  assert.equal(await card.getAttribute('role'), 'status', 'the result is announced');
  const text = await squash(card);
  for (const part of [/2 steps/, /Documented example/, /With stack:react/, /“Design a landing page”/, /1 design-taste design-taste-intent It designs a page\./, /2 design-review design-review-intent A finished design is checked\./, /Design first, then review\./]) assert.match(text, part);
  assert.doesNotMatch(text, /Asked /, 'no engine answered a documented example');
  assert.equal(await litNodes(page).count(), 2);
  assert.deepEqual(await page.locator('.gnum').allTextContents(), ['1', '2']);
  assert.equal(await page.locator('svg.graph.sim').count(), 1, 'what is not lit is dimmed');
  assert.match(await squash(page.locator('.legend')), /activated, in order/);
  assert.equal(await gnode(page, 'design-review').getAttribute('aria-label'), 'Capability design-review, entry design, step 2');
  assert.equal((await simulations(app)).length, 0, 'a documented example calls nothing');
  await page.screenshot({ path: shots + '/project-graph-example.png' });
  await example('A letter').click();
  assert.deepEqual([await example('A landing page').getAttribute('aria-pressed'), await example('A letter').getAttribute('aria-pressed')], ['false', 'true']);
  assert.match(await squash(card), /1 office-pdf Prerequisite A prerequisite the plugin declares, added before the step that needs it\. 2 office-docs office-docs-intent It makes the Word file\./);
  assert.match(await gnode(page, 'office-pdf').innerText(), /office-pdf\s*1/);
  assert.match(await gnode(page, 'office-docs').innerText(), /office-docs\s*2/);
  assert.equal(await gnode(page, 'design-taste').evaluate(b => b.classList.contains('on')), false);
  await example('A letter').click();
  assert.equal(await page.locator('.simres').count(), 0);
  assert.equal(await litNodes(page).count(), 0);
  await example('A letter').click();
  await page.getByRole('button', { name: 'Clear' }).click();
  assert.equal(await page.locator('.simres').count(), 0);
  assert.equal(await activeAttr(page, 'name'), 'simtask', 'the keyboard goes to the request after Clear');
  assert.equal((await simulations(app)).length, 0);
});

await test('Simulate: an empty request is refused in place, the note names the engine and the cost once, asking shows the engine, and the answer lights the branch in order', 'projects', {}, async app => {
  const { page } = app;
  await graphTab(page);
  assert.match(await squash(page.locator('#sim-note')), /^Free-text requests use Claude Code on this computer, with its own credentials\. Each costs up to \$0\.50 a request\. Documented examples run no AI\. Change this in Settings\.$/);
  assert.equal(await page.locator('#sim-note').getByRole('button', { name: 'Settings' }).count(), 1);
  assert.match(await requestBox(page).getAttribute('aria-describedby'), /sim-note/);
  await simulateButton(page).click();
  assert.equal(await squash(page.locator('#err-simtask')), 'Write a request first.');
  assert.equal(await requestBox(page).getAttribute('aria-invalid'), 'true');
  assert.equal(await activeAttr(page, 'name'), 'simtask', 'the keyboard is in the box');
  assert.equal((await simulations(app)).length, 0);
  assert.equal(await page.locator('#sim-note').count(), 1, 'a refused request is no request: the note stays');
  await page.keyboard.type('Write a letter as a Word file');
  await page.waitForFunction(() => document.querySelector('#err-simtask').textContent === '');
  await app.flags({ simulateDelay: 700 });
  await simulateButton(page).click();
  await page.getByRole('button', { name: 'Asking Claude Code…' }).waitFor();
  assert.equal(await simulateButton(page).getAttribute('aria-busy'), 'true');
  assert.equal(await page.getByRole('button', { name: 'Cancel' }).count(), 1);
  assert.equal(await page.locator('#sim-note').count(), 0, 'said once: it is gone as the first request starts');
  const card = page.locator('.simres');
  await card.waitFor();
  const text = await squash(card);
  for (const part of [/2 steps/, /“Write a letter as a Word file”/, /1 office-pdf Prerequisite/, /2 office-docs office-docs-intent The request asks for a Word file\./, /Classified "Write a letter as a Word file" as a document\./, /Asked Claude Code · \$0\.12 · 4\.2 s/]) assert.match(text, part);
  assert.doesNotMatch(text, /Documented example/);
  assert.equal(await card.getAttribute('role'), 'status');
  assert.deepEqual(await page.locator('.gnum').allTextContents(), ['2', '1'], 'in the order of the decision (the graph lists office-docs first)');
  assert.deepEqual((await simulations(app)).map(({ payload: { run, ...rest } }) => [rest, /^[A-Za-z0-9_-]{1,64}$/.test(run)]), [[{ id: 'marionette', task: 'Write a letter as a Word file' }, true]], 'the request names its run, so that it can be stopped');
  assert.equal(await activeAttr(page, 'data-action'), 'graph-simulate', 'the keyboard is still on the button');
  assert.equal(await page.getByRole('button', { name: 'Cancel' }).count(), 0);
  await page.screenshot({ path: shots + '/project-graph-simulation.png' });
  await app.flags({ simulateDelay: 0 });
  await simulateButton(page).click();
  await page.waitForFunction(() => document.querySelectorAll('.simres').length === 1 && !document.querySelector('[aria-busy=true]'));
  assert.equal((await simulations(app)).length, 2);
  assert.equal(await page.locator('#sim-note').count(), 0, 'and not said again');
});

await test('Simulate: Cancel stops waiting, and the answer that comes later is not shown', 'projects', {}, async app => {
  const { page } = app;
  await graphTab(page);
  await app.flags({ simulateDelay: 1200 });
  await requestBox(page).fill('Write a letter');
  await simulateButton(page).click();
  await page.getByRole('button', { name: 'Asking Claude Code…' }).waitFor();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('button[data-action="graph-simulate"]', { hasText: 'Simulate' }).waitFor();
  await page.locator('.toast', { hasText: 'Stopped waiting for the answer.' }).waitFor();
  assert.equal(await activeAttr(page, 'data-action'), 'graph-simulate', 'the keyboard goes to Simulate');
  assert.equal(await page.getByRole('button', { name: 'Cancel' }).count(), 0);
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('.simres').count(), 0, 'nobody is waiting for it');
  assert.equal(await litNodes(page).count(), 0);
  // The runtime is told to stop that run. (The app's one-at-a-time queue sends it after the request it stops, until `simulate` and `cancel_simulation` are requests that wait for nobody.)
  await page.waitForFunction(() => window.calls.some(c => c.action === 'cancel_simulation'));
  const calls = await app.calls();
  assert.equal(calls.find(c => c.action === 'cancel_simulation').payload.run, calls.find(c => c.action === 'simulate').payload.run, 'the run it asks to stop is the one it started');
  await app.flags({ simulateDelay: 0 });
  await simulateButton(page).click();
  await page.locator('.simres', { hasText: '2 steps' }).waitFor();
});

await test('Simulate: a call that fails, an answer that is not a valid decision, no match and a question are each shown as what they are', 'projects', {}, async app => {
  const { page } = app;
  await graphTab(page);
  await requestBox(page).fill('Write a letter');
  const ask = async (flags, expected) => {
    await app.flags({ simulateError: '', ...flags });
    await simulateButton(page).click();
    const card = page.locator('.simres', { hasText: expected });
    await card.waitFor();
    return card;
  };
  const failed = await ask({ simulateError: 'No API key: the environment variable named by --api-key-env is not set' }, 'The simulation could not run');
  assert.equal(await failed.getAttribute('role'), 'alert');
  assert.match(await squash(failed), /No API key: the environment variable named by --api-key-env is not set Check the AI engine in Settings\./);
  assert.equal(await litNodes(page).count(), 0);
  assert.equal(await page.locator('.banner').count(), 0, 'the failure is the simulator\'s, not the app\'s');
  const invalid = await ask({ simulate: 'invalid' }, 'The AI\'s answer was not a valid decision');
  assert.deepEqual(await invalid.locator('li.q').allTextContents(), ['Unknown capability in AI classification: made-up', 'AI classification requires a nonempty reason']);
  assert.equal(await invalid.locator('ol, button[data-action="open-capability"]').count(), 0, 'no step comes of an invalid answer');
  assert.equal(await litNodes(page).count(), 0);
  assert.match(await squash(invalid), /Asked Claude Code · \$0\.12 · 4\.2 s/);
  const none = await ask({ simulate: 'no_match' }, 'No match');
  assert.match(await squash(none), /Nothing here is work for the plugin\./);
  assert.equal(await litNodes(page).count(), 0);
  const unclear = await ask({ simulate: 'clarify' }, 'Needs clarification');
  assert.deepEqual(await unclear.locator('li.q').allTextContents(), ['Is it a web page or a document?', 'Who is it for?']);
  await app.flags({ simulateError: 'The harness claude was not found on this computer' });
  await simulateButton(page).click();
  const again = page.locator('.simres', { hasText: 'was not found' });
  await again.waitFor();
  await again.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('heading', { name: 'Settings', level: 1 }).waitFor();
  await page.locator('nav button', { hasText: 'Projects' }).click();
  await page.locator('.simres', { hasText: 'was not found' }).waitFor();
});

await test('Simulate with an API engine names the model and the provider, and shows no cost it does not know', 'projects', {}, async app => {
  const { page } = app;
  await graphTab(page);
  await page.evaluate(() => window.behind.settings({ ai: { engine: 'api', harness: 'claude-code', budget_usd: 0.5, api_base: 'https://example.test/v1', model: 'gpt-test', api_key_env: 'MURO_API_KEY' } }));
  await page.evaluate(() => window.shown());
  const note = page.locator('#sim-note', { hasText: 'gpt-test' });
  await note.waitFor();
  assert.match(await squash(note), /^Free-text requests are sent to gpt-test through https:\/\/example\.test\/v1 and billed by your API provider\. Documented examples run no AI\. Change this in Settings\.$/);
  await requestBox(page).fill('Write a letter');
  await app.flags({ simulateDelay: 500 });
  await simulateButton(page).click();
  await page.getByRole('button', { name: 'Asking gpt-test…' }).waitFor();
  const card = page.locator('.simres');
  await card.waitFor();
  assert.match(await squash(card), /Asked gpt-test · 4\.2 s/);
  assert.doesNotMatch(await squash(card), /\$/);
});

await test('A capability opens a sheet from the graph, from a step of the result and from Harmonize; the keyboard goes in and comes back to the control that opened it', 'projects', {}, async app => {
  const { page } = app;
  await graphTab(page);
  await gnode(page, 'design-review').click();
  const sheet = page.getByRole('dialog', { name: 'design-review' });
  await sheet.waitFor();
  assert.equal(await sheet.evaluate(d => d.classList.contains('sheet')), true, 'a sheet, on the right');
  const text = await squash(sheet);
  for (const part of [/Role worker/, /Entry marionette-design Use when designing an interface\./, /Comes from —/, /Activates when the request means design-review-intent Review a finished design Not for: Building one/, /Branches Runs design-taste first, on a condition A design exists/]) assert.match(text, part);
  assert.doesNotMatch(text, /Produces/);
  assert.equal(await page.evaluate(() => document.activeElement?.closest('dialog')?.querySelector('footer .btn') === document.activeElement), true, 'the keyboard is on Close, in the sheet');
  await page.screenshot({ path: shots + '/project-graph-sheet.png' });
  await page.keyboard.press('Escape');
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert.equal(await activeAttr(page, 'id'), 'gnode-design-review', 'the keyboard is back on the node');
  await gnode(page, 'design-taste').click();
  const taste = await squash(page.getByRole('dialog', { name: 'design-taste' }));
  assert.match(taste, /Comes from taste-skill/);
  assert.match(taste, /Produces design-brief/);
  assert.doesNotMatch(taste, /Branches/);
  await page.getByRole('dialog', { name: 'design-taste' }).locator('footer .btn').click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert.equal(await activeAttr(page, 'id'), 'gnode-design-taste');
  await page.locator('.exlist button', { hasText: 'A landing page' }).click();
  await page.locator('#sim-step-2').click();
  await page.getByRole('dialog', { name: 'design-review' }).waitFor();
  await page.keyboard.press('Escape');
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert.equal(await activeAttr(page, 'id'), 'sim-step-2', 'back on the step that was used, not on the node of the same capability');
  await tab(page, 'Inputs').click();
  await page.locator('button[data-action="decisions-of"]').first().click();
  const link = page.locator('button[data-action="open-capability"]').first();
  const id = await link.getAttribute('data-id');
  await link.click();
  await page.getByRole('dialog', { name: id }).waitFor();
  await page.keyboard.press('Escape');
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert.equal(await activeAttr(page, 'data-action'), 'open-capability', 'Harmonize\'s link gets the keyboard back too');
});

await test('A graph the size of Marionette (37 capabilities, 15 entries) scrolls inside its card; no long name leaves its node and nothing widens the page', 'projects', {}, async app => {
  const { page } = app;
  await app.flags({ bigGraph: true });
  await graphTab(page);
  assert.equal(await page.locator('button.gnode').count(), 37);
  assert.equal(await page.locator('svg.graph g.n.ent').count(), 15);
  assert.equal(await page.locator('.graphcard').evaluate(c => c.scrollHeight > c.clientHeight), true, 'the card scrolls, not the page');
  assert.ok(await sideways(page) <= 0);
  assert.equal(await nameFits(page), true, 'every name, the long one too, is inside its node');
  const widths = await page.locator('button.gnode').evaluateAll(b => b.map(x => Math.round(x.getBoundingClientRect().width)));
  assert.ok(Math.max(...widths) - Math.min(...widths) <= 2, 'the column is as wide as its longest name: the estimate of the width holds');
  assert.match(await squash(page.locator('.legend')), /15 entries · 37 capabilities$/);
  await page.locator('button.gnode').last().focus();
  assert.ok(await page.locator('.graphcard').evaluate(c => c.scrollTop) > 0, 'the node focused is scrolled into view inside the card');
  await page.locator('.exlist button', { hasText: 'Two of many' }).click();
  assert.equal(await litNodes(page).count(), 2);
  assert.ok(await sideways(page) <= 0);
  await page.screenshot({ path: shots + '/project-graph-large.png' });
});

await test('What was typed and the last answer survive leaving the step and a reload, and the note does not come back', 'projects', {}, async app => {
  const { page } = app;
  await graphTab(page);
  await requestBox(page).click();
  await page.keyboard.type('Write a letter as a Word file');
  await tab(page, 'Install').click();
  await tab(page, 'Graph').click();
  assert.equal(await requestBox(page).inputValue(), 'Write a letter as a Word file', 'what was typed is not lost by a paint');
  await simulateButton(page).click();
  await page.locator('.simres', { hasText: '2 steps' }).waitFor();
  const kept = await page.evaluate(() => JSON.parse(sessionStorage.getItem('muro.project')).sim);
  assert.deepEqual([kept.task, kept.run, kept.error, kept.result?.kind], ['Write a letter as a Word file', null, '', 'decision']);
  await page.reload();
  await page.locator('nav').waitFor();
  await page.locator('nav button', { hasText: 'Projects' }).click();
  await page.locator('.two svg.graph').waitFor();
  assert.equal(await requestBox(page).inputValue(), 'Write a letter as a Word file');
  assert.match(await squash(page.locator('.simres')), /2 steps .*1 office-pdf Prerequisite/);
  assert.equal(await litNodes(page).count(), 2);
  assert.equal(await page.locator('#sim-note').count(), 0, 'the session already had its note');
  assert.equal(await simulateButton(page).count(), 1);
  assert.equal(await page.locator('[aria-busy=true]').count(), 0, 'a request in progress is never brought back');
});

await test('A paste into the request box is kept like typing: it survives a change of step and back, and is the request sent', 'projects', {}, async app => {
  const { page } = app;
  await graphTab(page);
  await requestBox(page).fill('Write a letter as a Word file');   // `fill` sends the `input` event and no key: what a paste does
  await tab(page, 'Install').click();
  await tab(page, 'Graph').click();
  assert.equal(await requestBox(page).inputValue(), 'Write a letter as a Word file', 'the paste is not lost by the paint a step change makes');
  const held = await page.evaluate(() => JSON.parse(sessionStorage.getItem('muro.project')).sim.task);
  assert.equal(held, 'Write a letter as a Word file', 'the page holds it, not only the box');
  await simulateButton(page).click();
  await page.locator('.simres', { hasText: '2 steps' }).waitFor();
  assert.equal((await simulations(app))[0].payload.task, 'Write a letter as a Word file');
});

await test('The simulator at 760px: one column, the graph card scrolls inside itself, no sideways scroll, every control has a name', 'projects', { viewport: { width: 760, height: 900 } }, async app => {
  const { page } = app;
  await app.flags({ bigGraph: true });
  await graphTab(page);
  assert.equal(await page.locator('.two').evaluate(t => getComputedStyle(t).gridTemplateColumns.split(' ').length), 1);
  assert.ok(await sideways(page) <= 0, 'the step');
  await page.locator('.exlist button', { hasText: 'Another two' }).click();
  assert.ok(await sideways(page) <= 0, 'an example lit');
  await requestBox(page).fill('Write a letter');
  await simulateButton(page).click();
  await page.locator('.simres', { hasText: 'Asked Claude Code' }).waitFor();
  assert.ok(await sideways(page) <= 0, 'a result');
  assert.equal(await unnamedIn(page, '#step-panel'), 0);
  assert.equal(await nameFits(page), true);
  await page.screenshot({ path: shots + '/project-graph-760.png' });
});

await test('The graph and the simulator in the light theme stay readable', 'projects', { colorScheme: 'light' }, async app => {
  const { page } = app;
  await graphTab(page);
  await page.locator('.exlist button', { hasText: 'A landing page' }).click();
  await page.screenshot({ path: shots + '/project-graph-light.png' });
});

console.log('PASS: ' + done.join('; '));
