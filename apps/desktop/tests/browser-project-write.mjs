// Plan 3 (ADR-0030): making and changing a project from the Projects tab, on the fake transport (fake-transport.js). The AI runs are the fake's jobs:
// a test ends them with window.behind.finish(), as the runtime does when the agent and the build are done.
//   node apps/desktop/tests/browser-project-write.mjs        (MURO_UI_PORT moves the dev server off 1422; MURO_BROWSER_PATH runs another Chromium)
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
const callsOf = async (app, action) => (await app.calls()).filter(c => c.action === action).map(c => c.payload);
const goProjects = async page => { await page.locator('nav button', { hasText: 'Projects' }).click(); await page.getByRole('heading', { name: 'Projects', level: 1 }).waitFor(); };
const openMarionette = async page => { await goProjects(page); await page.getByRole('button', { name: /Marionette/ }).click(); await page.getByRole('heading', { name: 'Marionette', level: 1 }).waitFor(); };
const tab = (page, name) => page.getByRole('tab', { name: new RegExp('^' + name) });
const dialog = page => page.locator('dialog[open]');
const finish = (page, status = 'completed', message = 'Done') => page.evaluate(([s, m]) => window.behind.finish(s, m), [status, message]);

await test('New project: the dialog says what is missing, names the plugin after the project, takes the inputs and starts the AI run', 'projects', {}, async app => {
  const { page } = app;
  await goProjects(page);
  await page.getByRole('button', { name: 'New project…' }).first().click();
  const dlg = dialog(page);
  await dlg.getByRole('heading', { name: 'New project' }).waitFor();
  await dlg.getByRole('button', { name: 'Create project' }).click();
  for (const said of ['Give the project a name.', 'Say who owns the project.', 'Choose the folder the project file goes in.', 'Add at least one input: a project is made from plugins and skills.']) await dlg.getByText(said).waitFor();
  assert.equal(await callsOf(app, 'create_project').then(c => c.length), 0, 'nothing is sent while the form is wrong');
  await dlg.locator('[name=name]').fill('Docs Kit');
  assert.equal(await dlg.locator('[name=slug]').inputValue(), 'docs-kit', 'the id follows the name until it is typed');
  await dlg.locator('[name=author]').fill('me');
  await dlg.getByRole('button', { name: 'Choose folder…' }).click();
  await page.waitForFunction(() => document.querySelector('dialog[open] [name=folder]')?.value === 'D:/Projects');
  await dlg.locator('[name=inputs]').fill('https://github.com/example/docs\n\nD:/Skills/writing\n');
  assert.equal(await dlg.locator('#err-inputs').textContent(), '', 'typing clears what was missing');
  await dlg.locator('[name=request]').fill('One plugin for every document we write.');
  await page.screenshot({ path: shots + '/project-new.png' });
  await dlg.getByRole('button', { name: 'Create project' }).click();
  await dlg.waitFor({ state: 'detached' });
  assert.deepEqual(await callsOf(app, 'create_project'), [{ name: 'Docs Kit', slug: 'docs-kit', author: 'me', folder: 'D:/Projects', inputs: [{ source: 'https://github.com/example/docs' }, { source: 'D:/Skills/writing' }], request: 'One plugin for every document we write.', repository: null, budget_usd: 5 }]);
  const card = page.locator('article.im-task-card', { hasText: 'New project Docs Kit' });
  await card.waitFor();
  assert.equal(await card.getByRole('button', { name: 'Cancel' }).count(), 1);
  await finish(page);
  await page.locator('li.im-list-link', { hasText: 'Docs Kit' }).waitFor({ timeout: 10_000 });
  await card.waitFor({ state: 'detached' });
  await page.getByText('New project Docs Kit: done.').waitFor();
});

await test('New project with Codex as the agent says what is needed and cannot start', 'projects', {}, async app => {
  const { page } = app;
  await page.evaluate(() => window.behind.settings({ ai: { engine: 'harness', harness: 'codex', budget_usd: 0.5, api_base: '', model: '', api_key_env: 'MURO_API_KEY' }, agent: 'codex' }));
  await goProjects(page);
  await page.getByRole('button', { name: 'Refresh' }).click().catch(() => {});
  await page.evaluate(() => window.shown?.());
  await page.getByRole('button', { name: 'New project…' }).first().click();
  const dlg = dialog(page);
  await dlg.getByText(/Making and changing a project needs Claude Code/).waitFor();
  assert.equal(await dlg.getByRole('button', { name: 'Create project' }).isDisabled(), true);
  assert.equal(await dlg.getByRole('button', { name: 'Open Settings' }).count(), 1);
});

await test('Edit details: the name, the author and the repository are saved on the file the page read, and the page reads it again', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await page.getByRole('button', { name: 'Edit details…' }).click();
  const dlg = dialog(page);
  await dlg.locator('[name=name]').fill('Marionette Plus');
  await dlg.locator('[name=repo_url]').fill('');
  await dlg.getByRole('button', { name: 'Save' }).click();
  await dlg.waitFor({ state: 'detached' });
  assert.deepEqual(await callsOf(app, 'edit_project'), [{ id: 'marionette', digest: 'sha256:marionette', name: 'Marionette Plus', author: 'acaprino', repository: null }]);
  await page.getByRole('heading', { name: 'Marionette Plus', level: 1 }).waitFor();
  assert.match(await page.locator('.im-record-meta').textContent(), /No Git repository set/);
  assert.equal(await page.getByRole('button', { name: 'Delete project…' }).count(), 0, 'the project Muro ships cannot be deleted');
});

await test('Harmonize again: the request goes to the AI run, the page shows the run and offers no change until it ends, then reads the project again', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await tab(page, 'Harmonize').click();
  await page.getByRole('button', { name: 'Harmonize again…' }).click();
  const dlg = dialog(page);
  await dlg.locator('[name=request]').fill('Merge the two review steps.');
  await dlg.getByRole('radio', { name: 'Minor' }).check({ force: true });
  await dlg.getByRole('button', { name: 'Harmonize', exact: true }).click();
  await dlg.waitFor({ state: 'detached' });
  assert.deepEqual(await callsOf(app, 'project_job'), [{ id: 'marionette', digest: 'sha256:marionette', operation: 'harmonize', budget_usd: 5, step: 'minor', request: 'Merge the two review steps.' }]);
  await page.locator('article.im-task-card', { hasText: 'Harmonize again' }).waitFor();
  assert.match(await page.locator('.im-record-heading').textContent(), /Changing/);
  assert.equal(await page.getByRole('button', { name: /Harmonize again…|Add record…|Edit details…/ }).count(), 0, 'no change while the run goes');
  const read = (await callsOf(app, 'project')).length;
  await finish(page);
  await page.getByRole('button', { name: 'Harmonize again…' }).waitFor({ timeout: 10_000 });
  assert.ok((await callsOf(app, 'project')).length > read, 'the project is read again');
  assert.match(await page.locator('.im-record-heading').textContent(), /Harmonized/);
});

await test('A run that failed is said on the page with its reason', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await tab(page, 'Harmonize').click();
  await page.getByRole('button', { name: 'Harmonize again…' }).click();
  await dialog(page).getByRole('button', { name: 'Harmonize', exact: true }).click();
  await page.locator('article.im-task-card').waitFor();
  await finish(page, 'failed', 'The factory build failed. The project file was not changed');
  await page.getByText(/Harmonize again failed: The factory build failed\. The project file was not changed/).first().waitFor({ timeout: 10_000 });
});

await test('Inputs: Check for updates says which input is behind, and Move pin starts from that release', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await page.getByText('v9.9.9 available').waitFor();
  await page.getByRole('button', { name: 'Move the pin of taste-skill' }).click();
  const dlg = dialog(page);
  assert.equal(await dlg.locator('[name=to]').inputValue(), 'v9.9.9');
  await dlg.getByRole('button', { name: 'Move pin' }).click();
  await dlg.waitFor({ state: 'detached' });
  assert.deepEqual(await callsOf(app, 'project_job'), [{ id: 'marionette', digest: 'sha256:marionette', operation: 'move_pin', budget_usd: 5, step: 'patch', request: '', input: 'taste-skill', to: 'v9.9.9' }]);
});

await test('Inputs: Add input refuses what is no input, then starts the run; Remove names its input', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await page.getByRole('button', { name: 'Add input…' }).click();
  let dlg = dialog(page);
  await dlg.locator('[name=source]').fill('github.com/example/x');
  await dlg.getByRole('button', { name: 'Add input' }).click();
  await dlg.getByText('Enter an https:// address or the full path of a folder.').waitFor();
  await dlg.locator('[name=source]').fill('https://github.com/example/x');
  await dlg.getByRole('button', { name: 'Add input' }).click();
  await dlg.waitFor({ state: 'detached' });
  assert.deepEqual((await callsOf(app, 'project_job')).map(p => [p.operation, p.source, p.step]), [['add_input', 'https://github.com/example/x', 'minor']]);
  await finish(page);
  await page.getByRole('button', { name: 'Remove genoffice' }).waitFor({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Remove genoffice' }).click();
  dlg = dialog(page);
  await dlg.getByRole('heading', { name: 'Remove genoffice' }).waitFor();
  await dlg.getByRole('button', { name: 'Remove input' }).click();
  await dlg.waitFor({ state: 'detached' });
  const removal = (await callsOf(app, 'project_job'))[1];
  assert.deepEqual([removal.operation, removal.input, removal.digest], ['remove_input', 'genoffice', 'sha256:runrun-1'], 'the change names the file as the first run left it');
});

await test('Your instructions: a file changed and one added are sent, the rest is not', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await page.getByRole('button', { name: 'Edit your instructions' }).click();
  const dlg = dialog(page);
  await dlg.locator('[name=ins_text]').first().fill('Keep sentences short and plain.\n');
  await dlg.getByRole('button', { name: 'Add file' }).click();
  await dlg.locator('[name=ins_path]').nth(1).fill('team/tone.md');
  await dlg.locator('[name=ins_text]').nth(1).fill('Friendly.');
  await page.screenshot({ path: shots + '/project-instructions.png' });
  await dlg.getByRole('button', { name: 'Save and harmonize' }).click();
  await dlg.waitFor({ state: 'detached' });
  const [job] = await callsOf(app, 'project_job');
  assert.equal(job.operation, 'instructions');
  assert.deepEqual(job.instructions, [{ path: 'house-style.md', text: 'Keep sentences short and plain.\n' }, { path: 'team/tone.md', text: 'Friendly.' }]);
});

await test('Records: one added is the owner\'s and binding when asked; an edit and a deletion save the whole list', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await tab(page, 'Harmonize').click();
  await page.getByRole('button', { name: 'Add record…' }).click();
  let dlg = dialog(page);
  await dlg.locator('[name=date]').fill('2026-11-21');
  await dlg.locator('[name=subjects]').fill('office-docs, genoffice');
  await dlg.locator('[name=text]').fill('Keep the Word output first.');
  await dlg.getByText('Binding', { exact: true }).click();
  await dlg.getByRole('button', { name: 'Save' }).click();
  await dlg.waitFor({ state: 'detached' });
  const [added] = await callsOf(app, 'edit_project');
  assert.deepEqual(added.records.at(-1), { id: 'you-2026-11-21-1', date: '2026-11-21', subjects: ['office-docs', 'genoffice'], text: 'Keep the Word output first.', author: 'you', binding: true });
  assert.equal(added.records.length, 3);
  await page.locator('.im-decision-list > li', { hasText: 'Keep the Word output first.' }).waitFor();
  await page.getByRole('button', { name: 'Edit the record of 2026-11-10' }).click();
  dlg = dialog(page);
  await dlg.getByRole('button', { name: 'Delete record' }).click();
  await dlg.waitFor({ state: 'detached' });
  const deleted = (await callsOf(app, 'edit_project'))[1];
  assert.deepEqual(deleted.records.map(r => r.id), ['r2', 'you-2026-11-21-1']);
  assert.equal(deleted.digest, 'sha256:edit1', 'the second edit names the file the first one wrote');
});

await test('Delete project: asked first, the project leaves the list and the page goes back to it', 'projects', {}, async app => {
  const { page } = app;
  await app.flags({ pickPath: 'D:/Notes/Notes.mp' });
  await goProjects(page);
  await page.getByRole('button', { name: 'Open project file…' }).click();
  await page.locator('li.im-list-link', { hasText: 'Notes' }).waitFor();
  await page.getByRole('button', { name: /Notes/ }).first().click();
  await page.getByRole('heading', { name: 'Notes', level: 1 }).waitFor();
  await page.getByRole('button', { name: 'Delete project…' }).click();
  const confirm = page.getByRole('alertdialog');
  await confirm.getByText(/Its plugin stays installed where it is/).waitFor();
  await confirm.getByRole('button', { name: 'Delete project' }).click();
  await page.getByRole('heading', { name: 'Projects', level: 1 }).waitFor();
  await page.getByText('Notes deleted.').waitFor();
  assert.equal(await page.locator('li.im-list-link', { hasText: 'Notes' }).count(), 0);
  assert.deepEqual((await callsOf(app, 'delete_project')).map(p => p.id), ['notes']);
});

console.log('PASS: ' + done.join('; '));
