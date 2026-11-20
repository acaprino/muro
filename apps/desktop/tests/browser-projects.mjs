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

await test('Harmonize and Graph & simulator are the steps their own tasks fill: each says so', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await tab(page, 'Harmonize').click();
  await page.getByText('Coming in this version').waitFor();
  assert.equal(await page.getByRole('tabpanel').getAttribute('aria-labelledby'), 'step-tab-harmonize');
  await tab(page, 'Graph').click();
  assert.equal(await page.getByRole('tabpanel').getAttribute('aria-labelledby'), 'step-tab-graph');
  await page.getByText('Coming in this version').waitFor();
});

await test('Install: a switch per harness calls install_project with that harness; what waits is reviewed in the sheet of Sync and applied there', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await tab(page, 'Install').click();
  assert.equal(await switchOf(page, 'Claude Code').getAttribute('aria-checked'), 'false');
  assert.equal(await page.getByRole('button', { name: /^Review/ }).count(), 0, 'nothing waits yet');
  const before = (await app.calls()).length;
  await switchOf(page, 'Codex').click();
  await page.locator('#step-panel li', { hasText: 'Codex' }).getByText('Install 0.5.0').waitFor();
  const made = (await app.calls()).slice(before);
  assert.deepEqual(made.map(c => c.action).filter(a => a !== 'plan'), ['install_project', 'snapshot', 'save_plugin']);
  assert.deepEqual(made[0], { action: 'install_project', payload: { id: 'marionette', harnesses: ['codex'] } });
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

await test('a flag makes install_project set the target by itself: no second save', 'projects', {}, async app => {
  const { page } = app;
  await app.flags({ installAssigns: true });
  await openMarionette(page);
  await tab(page, 'Install').click();
  const before = (await app.calls()).length;
  await switchOf(page, 'Codex').click();
  await switchOf(page, 'Codex').and(page.locator('[aria-checked=true]')).waitFor();
  assert.deepEqual((await app.calls()).slice(before).map(c => c.action).filter(a => a !== 'plan'), ['install_project', 'snapshot']);
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
  await page.locator('li.go', { hasText: 'Notes' }).getByRole('button').click();
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

console.log('PASS: ' + done.join('; '));
