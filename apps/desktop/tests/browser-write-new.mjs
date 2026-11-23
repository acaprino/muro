// Plan W, Task 4: a new project and a deleted one, from the Projects tab, on the fake transport (fake-transport.js). The new project is an AI run of the runtime (a job the fake
// holds until a test ends it with window.behind.finish(), as the runtime does when the agent and the build are done); the dialog checks what only needs what was typed, in the
// runtime's words, and shows the runtime's own refusal of the rest before the run is paid for. The job card above the list is another file's (write/JobCard.tsx): here it is
// found by what it says, never by its markup.
//   node apps/desktop/tests/browser-write-new.mjs        (MURO_UI_PORT moves the dev server off 1422)
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

const callsOf = async (app, action) => (await app.calls()).filter(c => c.action === action);
/** The window has read the registry once: the footer says what it holds. */
const ready = page => page.locator('[data-slot="app-shell-footer"]').getByText(/in your list/).waitFor();
/** The tabs are Sigrid's `ToolbarTab`s: buttons marked `aria-current="page"`, not `role=tab`. */
const tab = (page, name) => page.locator('[data-slot="toolbar-tab"]').filter({ hasText: new RegExp(`^${name}$`) });
const goProjects = async page => { await ready(page); await tab(page, 'Projects').click(); await page.getByRole('heading', { name: 'Projects', level: 1 }).waitFor(); };
const notice = (page, text) => page.locator('[data-toasts]').getByText(text, { exact: true });
const newButton = page => page.getByRole('button', { name: 'New project…', exact: true });
/** The form of a new project is a drawer from the right (Sigrid's `Dialog` with `drawer`); a deletion is a centred dialog. */
const drawerOf = page => page.locator('[data-slot="sheet-content"][data-side="right"]');
const dialogOf = page => page.locator('[data-slot="dialog-content"]');
const openNew = async page => { await goProjects(page); await newButton(page).click(); const drawer = drawerOf(page); await drawer.getByLabel('Name', { exact: true }).waitFor(); return drawer; };
const create = drawer => drawer.getByRole('button', { name: 'Create project', exact: true });
const LABELS = { name: 'Name', slug: 'Plugin id', author: 'Author', folder: 'Save in folder', inputs: 'Inputs', request: 'Your request (optional)', budget: 'Maximum budget (USD)', url: 'Repository', branch: 'Branch', tag_prefix: 'Release tag prefix' };
const field = (drawer, key) => drawer.getByLabel(LABELS[key], { exact: true });
/** Types the fields named, the name first (the plugin id follows it until it is typed). */
async function typeInto(drawer, values) {
  for (const key of Object.keys(LABELS)) if (values[key] !== undefined) await field(drawer, key).fill(values[key]);
}
/** A value typed and left: the field says what is wrong with it. */
async function wrong(drawer, key, value, said) {
  await field(drawer, key).fill(value);
  await field(drawer, key).blur();
  await drawer.getByText(said, { exact: true }).waitFor();
}
const RIGHT = { name: 'Docs Kit', author: 'me', folder: 'D:/Projects', inputs: 'https://github.com/example/docs' };
const MARKS = { name: 'My plugin' };
const focusedPlaceholder = page => page.waitForFunction(text => document.activeElement?.getAttribute('placeholder') === text, MARKS.name);
/** Every control and field of a region that has no name. */
const unnamed = scope => scope.evaluate(root => [...root.querySelectorAll('button, textarea, input:not([type=hidden])')].filter(e => {
  const by = e.getAttribute('aria-labelledby');
  return !(e.getAttribute('aria-label') || (by && by.split(/\s+/).some(id => document.getElementById(id)?.textContent.trim())) || e.textContent.trim() || e.labels?.length);
}).map(e => e.outerHTML.slice(0, 120)));
/** What the odd name and request of a new project would have made if they were markup: elements of the name, a script of the request, and whether it ran. */
const markup = page => page.evaluate(() => [[...document.querySelectorAll('main b')].filter(b => b.textContent.includes('Tools')).length, [...document.querySelectorAll('main script')].filter(e => e.textContent.includes('window.hit')).length, window.hit ?? 0]);
const sideways = page => page.evaluate(() => {
  const main = document.querySelector('main[data-slot="app-shell-content"]');
  return Math.max(document.documentElement.scrollWidth - window.innerWidth, main ? main.scrollWidth - main.clientWidth : 0);
});
const finish = (page, status = 'completed', text) => page.evaluate(([s, t]) => window.behind.finish(s, t), [status, text]);
/** Focus is on the heading of the list, where it goes when the button it was on is gone or off (a button that is not there cannot take it back). */
const onHeading = page => page.waitForFunction(() => document.activeElement?.tagName === 'H1' && document.activeElement.textContent === 'Projects');
const NEEDS_CLAUDE = 'Making and changing a project needs Claude Code (the only agent Muro can hold to a budget). Choose Claude Code in Settings → AI.';

// ---------- the dialog ----------
await test('New project: every field is checked in the runtime\'s words, nothing is sent while the form is wrong, and Enter sends only a right form', 'projects', {}, async app => {
  const { page } = app;
  const drawer = await openNew(page);
  await focusedPlaceholder(page);
  assert.deepEqual(await unnamed(drawer), [], 'every control of the form has a name');
  assert.equal(await create(drawer).getAttribute('data-variant'), 'default', 'Create project is the one solid button of the form');
  // A field says what is wrong once it was left (the name, which had the focus, and the author); the ones not visited yet say nothing.
  await field(drawer, 'author').focus();
  await field(drawer, 'author').blur();
  await drawer.getByText('The project name is required', { exact: true }).waitFor();
  await drawer.getByText('The author is required', { exact: true }).waitFor();
  for (const quiet of ['The plugin id is lowercase letters and digits joined by dashes, such as my-plugin', 'The folder is required', 'Add at least one input: a project is made from plugins and skills']) {
    assert.equal(await drawer.getByText(quiet, { exact: true }).count(), 0, `${quiet} waits until the field is left or the form is sent`);
  }
  // Sent empty: every field says what is missing, and the focus goes to the first.
  await create(drawer).click();
  for (const said of [
    'The project name is required',
    'The plugin id is lowercase letters and digits joined by dashes, such as my-plugin',
    'The author is required',
    'The folder is required',
    'Add at least one input: a project is made from plugins and skills',
  ]) await drawer.getByText(said, { exact: true }).waitFor();
  await focusedPlaceholder(page);
  assert.equal((await callsOf(app, 'create_project')).length, 0, 'nothing is sent while the form is wrong');
  // Each field, checked as the runtime checks it.
  await wrong(drawer, 'name', 'x'.repeat(201), 'The project name must be one line of at most 200 characters');
  await field(drawer, 'name').fill('Marionette');
  assert.equal(await field(drawer, 'slug').inputValue(), 'marionette', 'the plugin id follows the name');
  await field(drawer, 'slug').blur();
  await drawer.getByText('The plugin id marionette is the project Muro ships: choose another', { exact: true }).waitFor();
  await wrong(drawer, 'slug', 'Bad Slug', 'The plugin id is lowercase letters and digits joined by dashes, such as my-plugin');
  await wrong(drawer, 'slug', 'commit-helper', 'A plugin named commit-helper is already in your list: choose another plugin id');
  await wrong(drawer, 'author', '   ', 'The author is required');
  await wrong(drawer, 'folder', 'projects', 'Choose the folder with its full path');
  await wrong(drawer, 'inputs', 'github.com/example/x', 'An input is an https:// address or the full path of a folder on this computer');
  await wrong(drawer, 'inputs', 'http://github.com/example/x', 'An input is an https:// address or the full path of a folder on this computer');
  await wrong(drawer, 'inputs', 'https://', "An input's address must be an https:// address without spaces");
  await wrong(drawer, 'inputs', 'https://github.com/example/a b', "An input's address must be an https:// address without spaces");
  await wrong(drawer, 'inputs', `https://github.com/example/${'a'.repeat(200)}`, 'Where the input comes from must be one line of at most 200 characters');
  await wrong(drawer, 'inputs', 'https://github.com/a/b\nD:\\Skills\nhttps://github.com/a/b', 'The input https://github.com/a/b is named twice');
  await wrong(drawer, 'inputs', Array.from({ length: 21 }, (_, i) => `https://github.com/example/${i}`).join('\n'), 'At most 20 inputs at once');
  await wrong(drawer, 'request', 'x'.repeat(4001), 'The request must be at most 4000 characters');
  for (const budget of ['0', '101', 'abc', '5,5', '-1']) await wrong(drawer, 'budget', budget, 'The AI budget must be above 0 and at most 100 USD');
  await drawer.getByRole('button', { name: 'Repository (optional)', exact: true }).click();
  await wrong(drawer, 'url', 'http://github.com/example/docs', 'The repository address must be an https:// address');
  // A right value takes its sentence away, and an empty repository is none.
  await field(drawer, 'url').fill('');
  assert.equal(await drawer.getByText('The repository address must be an https:// address', { exact: true }).count(), 0);
  await field(drawer, 'budget').fill('5');
  assert.equal(await drawer.getByText('The AI budget must be above 0 and at most 100 USD', { exact: true }).count(), 0);
  // Enter sends the form only when it is right.
  await typeInto(drawer, { name: 'Docs Kit', slug: 'Bad Slug', author: 'me', folder: 'D:/Projects', inputs: 'https://github.com/example/docs', request: '' });
  await field(drawer, 'author').press('Enter');
  await drawer.getByText('The plugin id is lowercase letters and digits joined by dashes, such as my-plugin', { exact: true }).waitFor();
  assert.equal((await callsOf(app, 'create_project')).length, 0, 'Enter on a wrong form sends nothing');
  await field(drawer, 'slug').fill('docs-kit');
  await field(drawer, 'author').press('Enter');
  await drawer.waitFor({ state: 'detached' });
  assert.equal((await callsOf(app, 'create_project')).length, 1, 'Enter on a right form sends it');
});

await test('New project: Escape and Cancel close the form without a request, the focus goes back to the button, and the next form is empty', 'projects', {}, async app => {
  const { page } = app;
  const drawer = await openNew(page);
  await field(drawer, 'name').fill('Half done');
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.activeElement?.textContent?.includes('New project…'));
  assert.equal((await callsOf(app, 'create_project')).length, 0);
  const again = await openNew(page);
  assert.equal(await field(again, 'name').inputValue(), '', 'a form that opens is a new one');
  assert.equal(await field(again, 'slug').inputValue(), '');
  assert.equal(await field(again, 'budget').inputValue(), '5', 'the budget starts at the runtime\'s default');
  await again.getByRole('button', { name: 'Cancel', exact: true }).click();
  await again.waitFor({ state: 'detached' });
});

await test('New project: the folder dialog fills the folder, a closed dialog leaves it, a shell without the action loses the button', 'projects', {}, async app => {
  const { page } = app;
  const drawer = await openNew(page);
  const choose = drawer.getByRole('button', { name: 'Choose folder…', exact: true });
  await choose.click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-slot="sheet-content"] input')].some(i => i.value === 'D:/Projects'));
  assert.deepEqual((await callsOf(app, 'pick_folder')).map(c => c.payload), [{}]);
  // A dialog closed without a folder answers {path: null}: what was typed stays.
  await field(drawer, 'folder').fill('E:/Mine');
  await app.flags({ pickFolder: null });
  await choose.click();
  await page.waitForFunction(() => window.calls.filter(c => c.action === 'pick_folder').length === 2 && document.querySelector('[data-slot="sheet-content"] button[aria-busy="true"]') === null);
  assert.equal(await field(drawer, 'folder').inputValue(), 'E:/Mine', 'a closed dialog changes nothing');
  assert.equal(await page.locator('[data-toasts]').getByText(/folder/i).count(), 0, 'and says nothing');
  // A shell that does not know the action: the button is gone, and says why.
  await app.flags({ noShellActions: true });
  await choose.click();
  await drawer.getByText('This version of Muro cannot open a folder dialog yet: type the path.').waitFor();   // inline, beside the field: a notice would cover the drawer's buttons
  await choose.waitFor({ state: 'detached' });
  assert.equal(await field(drawer, 'folder').inputValue(), 'E:/Mine');
  await drawer.getByRole('button', { name: 'Cancel', exact: true }).click();
  await drawer.waitFor({ state: 'detached' });
  const again = await openNew(page);
  assert.equal(await again.getByRole('button', { name: 'Choose folder…', exact: true }).count(), 0, 'it stays gone for the session');
  assert.equal((await callsOf(app, 'pick_folder')).length, 3);
});

await test('New project with Codex as the agent says what is needed before the run, and cannot start', 'projects', {}, async app => {
  const { page } = app;
  await goProjects(page);
  await page.getByRole('button', { name: 'Marionette', exact: true }).waitFor();   // the list is read: the registry is not refreshed while a request of the person is pending
  await page.evaluate(() => window.behind.settings({ ai: { engine: 'harness', harness: 'codex', budget_usd: 0.5, api_base: '', model: '', api_key_env: 'MURO_API_KEY' }, agent: 'codex' }));
  await page.evaluate(() => window.shown());
  await newButton(page).click();
  const drawer = drawerOf(page);
  await drawer.getByText(NEEDS_CLAUDE, { exact: true }).waitFor();
  assert.equal(await create(drawer).isDisabled(), true);
  await typeInto(drawer, RIGHT);
  await field(drawer, 'author').press('Enter');
  assert.equal((await callsOf(app, 'create_project')).length, 0, 'nothing is sent for an agent that cannot be held to a budget');
  await page.screenshot({ path: shots + '/write-new-codex.png' });
});

// ---------- the run ----------
await test('New project: the payload is what was typed; the run shows above the list while it goes and the project is listed when it ends', 'projects', {}, async app => {
  const { page } = app;
  const drawer = await openNew(page);
  await field(drawer, 'name').fill('Docs Kit');
  assert.equal(await field(drawer, 'slug').inputValue(), 'docs-kit', 'the plugin id follows the name until it is typed');
  await field(drawer, 'author').fill('me');
  await drawer.getByRole('button', { name: 'Choose folder…', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-slot="sheet-content"] input')].some(i => i.value === 'D:/Projects'));
  await field(drawer, 'inputs').fill('https://github.com/example/docs\n\nD:\\Skills Folder\\writing\n');
  assert.equal(await drawer.getByText('Add at least one input: a project is made from plugins and skills', { exact: true }).count(), 0);
  await field(drawer, 'request').fill('One plugin for every document\nwe write.');
  await field(drawer, 'budget').fill('2.5');
  await page.screenshot({ path: shots + '/write-new-project.png' });
  await create(drawer).click();
  await drawer.waitFor({ state: 'detached' });
  await onHeading(page);
  assert.deepEqual((await callsOf(app, 'create_project')).map(c => c.payload), [{
    name: 'Docs Kit', slug: 'docs-kit', author: 'me', folder: 'D:/Projects',
    inputs: [{ source: 'https://github.com/example/docs' }, { source: 'D:\\Skills Folder\\writing' }],
    request: 'One plugin for every document\nwe write.', repository: null, budget_usd: 2.5,
  }]);
  // The card above the list, while the run goes; one run at a time, so no other new project, and the button says why.
  const card = page.getByText('New project Docs Kit').first();
  await card.waitFor();
  const [cardBox, tableBox] = [await card.boundingBox(), await page.getByRole('table', { name: 'Projects' }).boundingBox()];
  assert.ok(cardBox && tableBox && cardBox.y + cardBox.height <= tableBox.y + 1, 'the run is above the list');
  assert.equal(await newButton(page).isDisabled(), true);
  assert.match(await newButton(page).locator('xpath=..').getAttribute('title'), /one AI run goes at a time/);
  assert.equal(await page.getByRole('button', { name: 'Docs Kit', exact: true }).count(), 0, 'the project is not listed before the run ends');
  const read = (await callsOf(app, 'projects')).length;
  await finish(page);
  const row = page.getByRole('table', { name: 'Projects' }).getByRole('row').filter({ hasText: 'Docs Kit' });
  await row.waitFor();
  const text = await row.textContent();
  for (const fact of ['0.1.0', 'D:/Projects/docs-kit.mp', '2 inputs']) assert.ok(text.includes(fact), `the new row says ${fact}: ${text}`);
  assert.ok((await callsOf(app, 'projects')).length > read, 'the list was read again when the run ended');
  await notice(page, 'New project Docs Kit: The project was created and added to your list. Install it from its Install step').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('New project…') && !b.disabled));
  // The project is listed now: its id is taken, and the form is a new one.
  await newButton(page).click();
  const again = drawerOf(page);
  await again.getByLabel('Name', { exact: true }).waitFor();
  assert.equal(await field(again, 'name').inputValue(), '');
  await wrong(again, 'slug', 'docs-kit', 'A project for docs-kit is already in your list');
});

await test('New project: a creation that fails lists nothing, says why, and the button comes back', 'projects', {}, async app => {
  const { page } = app;
  const drawer = await openNew(page);
  await typeInto(drawer, RIGHT);
  await create(drawer).click();
  await drawer.waitFor({ state: 'detached' });
  await page.getByText('New project Docs Kit').first().waitFor();
  await finish(page, 'failed', 'The factory build failed. The project file was not changed');
  await notice(page, 'New project Docs Kit failed: The factory build failed. The project file was not changed').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Docs Kit', exact: true }).count(), 0, 'nothing was made');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('New project…') && !b.disabled));
  assert.equal(await page.getByRole('table', { name: 'Projects' }).getByRole('row').filter({ hasText: 'D:/Projects/docs-kit.mp' }).count(), 0);
});

await test('New project: a file that is there, a folder that is not and a run that goes are refused before the run, in the runtime\'s words, and the form stays', 'projects', {}, async app => {
  const { page } = app;
  await app.flags({ existingFiles: ['D:/Projects/docs-kit.mp'], missingFolders: ['D:/Nowhere'] });
  const drawer = await openNew(page);
  await typeInto(drawer, RIGHT);
  await create(drawer).click();
  await drawer.getByText('D:/Projects/docs-kit.mp already exists: choose another folder or plugin id', { exact: true }).waitFor();
  assert.equal(await drawer.isVisible(), true, 'the form stays, with what was typed');
  assert.equal(await field(drawer, 'name').inputValue(), 'Docs Kit');
  assert.equal((await callsOf(app, 'create_project')).length, 1);
  // Typing again takes the refusal away; the next one is the folder's.
  await field(drawer, 'slug').fill('docs-kit-2');
  assert.equal(await drawer.getByText('already exists', { exact: false }).count(), 0, 'what was refused is no longer what is typed');
  await field(drawer, 'folder').fill('D:/Nowhere');
  await create(drawer).click();
  await drawer.getByText('The folder is missing: D:/Nowhere', { exact: true }).waitFor();
  await field(drawer, 'folder').fill('D:/Projects');
  await create(drawer).click();
  await drawer.waitFor({ state: 'detached' });
  const asked = (await callsOf(app, 'create_project')).map(c => [c.payload.slug, c.payload.folder]);
  assert.deepEqual(asked, [['docs-kit', 'D:/Projects'], ['docs-kit-2', 'D:/Nowhere'], ['docs-kit-2', 'D:/Projects']]);
  await page.getByText('New project Docs Kit').first().waitFor();
  assert.equal(await page.getByRole('table', { name: 'Projects' }).getByRole('row').filter({ hasText: 'docs-kit.mp' }).count(), 0, 'the file that was there is not a project of the list');
});

await test('New project: names with <, & and quotes and Windows paths with spaces are shown as text and sent exactly', 'projects', {}, async app => {
  const { page } = app;
  const name = '<b>Tools & "Kit"</b>', author = 'O\'Brien & "Co" <x>', folder = 'D:\\Mes Projets\\Café Ünï';
  const longAddress = `https://github.com/example/${'a'.repeat(160)}`, windowsInput = 'D:\\Skills Folder\\écrire & <more>';
  const request = '<script>window.hit = 1</script> & "quotes"\n\tindented';
  const drawer = await openNew(page);
  await typeInto(drawer, { name, slug: 'tools-kit', author, folder, inputs: `${longAddress}\n  ${windowsInput}  `, request });
  assert.equal(await field(drawer, 'name').inputValue(), name, 'the name is shown as typed');
  await drawer.getByRole('button', { name: 'Repository (optional)', exact: true }).click();
  await typeInto(drawer, { url: 'https://github.com/acme/tools-kit', branch: 'develop', tag_prefix: 'tools-kit-v' });
  await create(drawer).click();
  await drawer.waitFor({ state: 'detached' });
  assert.deepEqual((await callsOf(app, 'create_project')).map(c => c.payload), [{
    name, slug: 'tools-kit', author, folder, inputs: [{ source: longAddress }, { source: windowsInput }], request,
    repository: { url: 'https://github.com/acme/tools-kit', branch: 'develop', tag_prefix: 'tools-kit-v' }, budget_usd: 5,
  }], 'sent as typed, trimmed and nothing else');
  await page.getByText(`New project ${name}`).first().waitFor();
  assert.deepEqual(await markup(page), [0, 0, 0], 'the name and the request are text, not markup');
  await finish(page);
  await page.getByRole('button', { name, exact: true }).waitFor();
  const row = page.getByRole('table', { name: 'Projects' }).getByRole('row').filter({ has: page.getByRole('button', { name, exact: true }) });
  assert.ok((await row.textContent()).includes(`${folder}/tools-kit.mp`), 'the file is the folder as typed and the plugin id');
  assert.deepEqual(await markup(page), [0, 0, 0]);
});

await test('New project: the form fits a 500px window, the buttons at its foot in sight', 'projects', {}, async app => {
  const { page } = app;
  await goProjects(page);
  await page.setViewportSize({ width: 500, height: 800 });
  await newButton(page).click();
  const drawer = drawerOf(page);
  await drawer.getByLabel('Name', { exact: true }).waitFor();
  await drawer.getByRole('button', { name: 'Repository (optional)', exact: true }).click();
  assert.ok(await drawer.evaluate(d => d.scrollWidth <= d.clientWidth + 1 && d.getBoundingClientRect().right <= window.innerWidth + 0.5), 'the form fits the window');
  for (const name of ['Cancel', 'Create project']) {
    const box = await drawer.getByRole('button', { name, exact: true }).boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 500 + 0.5 && box.y + box.height <= 800 + 0.5, `${name} is in sight without scrolling`);
  }
  assert.ok(await sideways(page) <= 0);
  assert.deepEqual(await unnamed(drawer), []);
  await page.screenshot({ path: shots + '/write-new-500.png' });
});

// ---------- delete ----------
await test('Delete project: asks first, names the file and says it goes too; the project Muro ships has none; the project leaves the list', 'projects', {}, async app => {
  const { page } = app;
  const odd = '<b>Odd & "quoted"', file = `D:/My Notes/${odd}.mp`;
  await app.flags({ pickPath: file });
  await goProjects(page);
  await page.getByRole('button', { name: 'Open project file…', exact: true }).click();
  await notice(page, `${odd} added to your list.`).waitFor();
  assert.equal(await page.getByRole('button', { name: /^Delete .*…$/ }).count(), 1, 'one Delete: the project that is not Muro\'s');
  assert.equal(await page.getByRole('button', { name: 'Delete Marionette…', exact: true }).count(), 0, 'the project Muro ships stays in the list');
  assert.equal(await page.getByRole('button', { name: `Remove ${odd} from the list`, exact: true }).count(), 1, 'Remove from list is still there beside it');
  const del = page.getByRole('button', { name: `Delete ${odd}…`, exact: true });
  const dialog = dialogOf(page);
  await del.click();
  await dialog.getByText(`Delete ${odd}?`, { exact: true }).waitFor();
  await dialog.getByText('The project leaves your list and its file is deleted. This cannot be undone. Its plugin stays installed where it is, as it is.', { exact: true }).waitFor();
  await dialog.getByText(file, { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Cancel', 'the focus starts on Cancel');
  await page.screenshot({ path: shots + '/write-delete.png' });
  assert.equal((await callsOf(app, 'delete_project')).length, 0, 'nothing is deleted before the person agrees');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: odd, exact: true }).waitFor();
  await del.click();
  await dialog.getByRole('button', { name: `Delete ${odd}`, exact: true }).click();
  await notice(page, `${odd} deleted.`).waitFor();
  await page.getByRole('button', { name: odd, exact: true }).waitFor({ state: 'detached' });
  await onHeading(page);
  const asked = await callsOf(app, 'delete_project');
  assert.equal(asked.length, 1);
  assert.equal(asked[0].payload.id, odd.toLowerCase());
  assert.equal(typeof asked[0].payload.revision, 'number');
  assert.deepEqual(Object.keys(asked[0].payload).sort(), ['id', 'revision']);
  assert.equal(await page.getByRole('table', { name: 'Projects' }).getByRole('button', { name: 'Marionette', exact: true }).count(), 1, 'the project Muro ships is what is left');
  assert.equal(await page.getByRole('button', { name: /^Delete .*…$/ }).count(), 0);
});

await test('Delete project: a registry that moved since the page read it is read again and the request goes once more, with the new revision', 'projects', {}, async app => {
  const { page } = app;
  await app.flags({ pickPath: 'D:/Notes/Notes.mp' });
  await goProjects(page);
  await page.getByRole('button', { name: 'Open project file…', exact: true }).click();
  await notice(page, 'Notes added to your list.').waitFor();
  // The registry moves on as the first request reaches it: it refuses the revision the page read.
  await app.flags({ staleDeletes: 1 });
  await page.getByRole('button', { name: 'Delete Notes…', exact: true }).click();
  await dialogOf(page).getByRole('button', { name: 'Delete Notes', exact: true }).click();
  await notice(page, 'Notes deleted.').waitFor();
  const asked = await callsOf(app, 'delete_project');
  assert.equal(asked.length, 2, 'refused once, then sent again');
  assert.ok(asked[1].payload.revision > asked[0].payload.revision, 'the second request carries the revision read again');
  const all = (await app.calls()).map(c => c.action), [first, second] = [all.indexOf('delete_project'), all.lastIndexOf('delete_project')];
  assert.ok(all.slice(first + 1, second).includes('snapshot'), 'the registry was read again between the two');
  assert.equal(await page.getByRole('button', { name: 'Notes', exact: true }).count(), 0);
});

if (failed.length) { console.error('FAILED:\n  ' + failed.join('\n  ')); process.exit(1); }
console.log('PASS: ' + done.join('; '));
