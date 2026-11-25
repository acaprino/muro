// Plan W, Task 3: the details and the decision records edited by hand, on the fake transport (fake-transport.js). Edits are no AI runs: `edit_project` carries the digest of the file the page
// shows, the runtime saves it offline, and the page reads the project again, so the next edit names the file the last one wrote. The dialogs are opened through the workspace's own buttons
// (Edit details… in the header, Add record… and the Edit and Delete of a record in the Records panel).
//   node apps/desktop/tests/browser-write-edit.mjs        (MURO_UI_PORT moves the dev server off 1422; MURO_ONLY=<part of a test name> runs one test)
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

const CHANGED = 'The project file changed since it was opened: open it again and repeat the change';
const callsOf = async (app, action) => (await app.calls()).filter(c => c.action === action);
/** The payloads of every `edit_project` the page sent, oldest first. */
const editsOf = async app => (await callsOf(app, 'edit_project')).map(c => c.payload);
const texts = loc => loc.evaluateAll(elements => elements.map(e => e.textContent.trim()));
/** The window has read the registry once: the footer says what it holds. */
const ready = page => page.locator('[data-slot="app-shell-footer"]').getByText(/in your list/).waitFor();
const tab = (page, name) => page.locator('[data-slot="toolbar-tab"]').filter({ hasText: new RegExp(`^${name}$`) });
const goProjects = async page => { await ready(page); await tab(page, 'Projects').click(); };
const openMarionette = async page => {
  await goProjects(page);
  await page.getByRole('button', { name: 'Marionette', exact: true }).click();
  await page.getByRole('heading', { name: 'Marionette', level: 1 }).waitFor();
};
const segment = (page, name) => page.locator('[data-slot="toggle-group-item"]').filter({ hasText: new RegExp(`^${name}$`) });
const notice = (page, text) => page.locator('[data-toasts]').getByText(text, { exact: true });
/** The digest of the project's file now, as the fake holds it (what the page's digest has to be to be current). */
const digest = page => page.evaluate(() => window.behind.digest('marionette'));
/** The side panel of Edit details (Sigrid's drawer form) and the window of a record (Sigrid's dialog), by what they say. */
const detailsOf = page => page.locator('[data-slot="sheet-content"]').filter({ hasText: 'Edit details' });
const windowOf = (page, title) => page.locator('[data-slot="dialog-content"]').filter({ hasText: title });
/** Every control and field inside `root` that has no name (what is hidden from assistive technology, such as the checkbox's own hidden input, is not a control). */
const unnamed = root => root.evaluate(element => [...element.querySelectorAll('button, [role=switch], [role=checkbox], [role=tab], textarea, input:not([type=hidden])')].filter(e => {
  if (e.closest('[aria-hidden="true"]')) return false;
  const by = e.getAttribute('aria-labelledby');
  return !(e.getAttribute('aria-label') || (by && by.split(/\s+/).some(id => document.getElementById(id)?.textContent.trim())) || e.textContent.trim() || e.labels?.length);
}).map(e => e.outerHTML.slice(0, 120)));
const openDetails = async page => {
  await page.getByRole('button', { name: 'Edit details…', exact: true }).click();
  const dialog = detailsOf(page);
  await dialog.waitFor();
  return dialog;
};
const save = dialog => dialog.getByRole('button', { name: 'Save', exact: true });

// ---------- the details ----------
await test('Edit details: name, author and the repository taken away go on the digest the page read, the page reads the file again, and the next edit names the file this one wrote', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  const first = await digest(page);
  const dialog = await openDetails(page);
  await page.waitForFunction(() => document.activeElement?.getAttribute('name') === 'name');
  assert.equal(await dialog.locator('input[name="name"]').inputValue(), 'Marionette');
  assert.equal(await dialog.locator('input[name="author"]').inputValue(), 'acaprino');
  assert.equal(await dialog.locator('input[name="repository-url"]').inputValue(), 'https://github.com/acaprino/marionette');
  assert.equal(await dialog.locator('input[name="repository-branch"]').inputValue(), 'main');
  assert.equal(await dialog.locator('input[name="repository-tag_prefix"]').inputValue(), 'marionette-v');
  assert.equal(await save(dialog).isDisabled(), true, 'nothing changed: nothing to save');
  const author = 'Ann <i>Lee</i> & "Co"';
  await dialog.locator('input[name="name"]').fill('Marionette Plus');
  await dialog.locator('input[name="author"]').fill(author);
  await dialog.getByRole('button', { name: 'Take the repository away', exact: true }).click();
  assert.equal(await dialog.locator('input[name="repository-url"]').inputValue(), '', 'the address is empty');
  assert.equal(await dialog.getByRole('button', { name: 'Take the repository away', exact: true }).count(), 0, 'there is nothing left to take away');
  await page.screenshot({ path: shots + '/write-details.png' });
  await save(dialog).click();
  await dialog.waitFor({ state: 'detached' });
  await notice(page, 'Details saved.').waitFor();
  await page.getByRole('heading', { name: 'Marionette Plus', level: 1 }).waitFor();
  assert.deepEqual(await editsOf(app), [{ id: 'marionette', digest: first, name: 'Marionette Plus', author, repository: null }], 'only what changed, on the digest the page showed, with the repository as null');
  const head = await page.locator('main header').first().textContent();
  assert.ok(head.includes('No Git repository set') && head.includes(`by ${author}`), `the page shows the file as it is now: ${head}`);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('main i')].filter(e => e.textContent.includes('Lee')).length), 0, 'the author is text, not markup');
  const second = await digest(page);
  assert.notEqual(second, first, 'the file has another digest');

  // The window opens on the file as it is now, and the second edit names the digest the first one left.
  const again = await openDetails(page);
  assert.equal(await again.locator('input[name="name"]').inputValue(), 'Marionette Plus');
  assert.equal(await again.locator('input[name="repository-url"]').inputValue(), '');
  await again.locator('textarea[name="changelog"]').fill('# Marionette Plus\n\nEdited by hand.\n');
  await save(again).click();
  await again.waitFor({ state: 'detached' });
  const edits = await editsOf(app);
  assert.equal(edits.length, 2);
  assert.deepEqual(edits[1], { id: 'marionette', digest: second, changelog: '# Marionette Plus\n\nEdited by hand.\n' });
  const third = await digest(page);
  assert.notEqual(third, second);
  const last = await openDetails(page);
  assert.equal(await last.locator('textarea[name="changelog"]').inputValue(), '# Marionette Plus\n\nEdited by hand.\n', 'the changelog is the one the file holds now');
  await last.getByRole('button', { name: 'Cancel', exact: true }).click();
  await last.waitFor({ state: 'detached' });
  assert.equal((await editsOf(app)).length, 2, 'Cancel sends nothing');
});

await test('Edit details: Cancel and Escape send nothing and the window starts again from the file; what is wrong is said before anything is sent', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  let dialog = await openDetails(page);
  await dialog.locator('input[name="name"]').fill('Something else');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  dialog = await openDetails(page);
  assert.equal(await dialog.locator('input[name="name"]').inputValue(), 'Marionette', 'what was typed is not kept');
  assert.deepEqual(await unnamed(dialog), [], 'every control of the window has a name');

  await dialog.locator('input[name="name"]').fill('  ');
  await dialog.locator('input[name="repository-url"]').fill('http://example.com/x');
  await save(dialog).click();
  await dialog.getByText('The project name is required', { exact: true }).waitFor();
  await dialog.getByText('The repository address must be an https:// address', { exact: true }).waitFor();
  assert.equal((await editsOf(app)).length, 0, 'nothing is sent while the form is wrong');
  await dialog.locator('input[name="name"]').fill('A'.repeat(201));
  await dialog.locator('input[name="repository-url"]').fill('https://github.com/acaprino/marionette');
  await dialog.getByText('The project name must be one line of at most 200 characters', { exact: true }).waitFor();
  assert.equal(await dialog.getByText('The repository address must be an https:// address', { exact: true }).count(), 0, 'what was fixed is no longer said');
  await save(dialog).click();
  assert.equal((await editsOf(app)).length, 0, 'still nothing sent');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  assert.equal((await editsOf(app)).length, 0);
});

await test('Edit details: a file that changed after the page read it is refused in the runtime\'s words, the window stays open and the file is as it was', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  const read = await digest(page);
  const dialog = await openDetails(page);
  await dialog.locator('input[name="name"]').fill('Marionette Plus');
  await page.evaluate(() => window.behind.touch('marionette'));
  const touched = await digest(page);
  assert.notEqual(touched, read);
  await save(dialog).click();
  const refusal = dialog.getByRole('alert').filter({ hasText: CHANGED });
  await refusal.waitFor();
  assert.equal((await refusal.textContent()).trim(), `Not saved. ${CHANGED}`, 'the runtime\'s sentence, whole');
  assert.deepEqual(await editsOf(app), [{ id: 'marionette', digest: read, name: 'Marionette Plus' }], 'the edit named the file the page had read');
  assert.equal(await digest(page), touched, 'the file was not written');
  assert.equal(await dialog.isVisible(), true, 'the window stays so what was typed is not lost');
  assert.equal(await dialog.locator('input[name="name"]').inputValue(), 'Marionette Plus');
  await page.screenshot({ path: shots + '/write-details-refused.png' });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await page.getByRole('heading', { name: 'Marionette', level: 1 }).waitFor();
});

// ---------- the records ----------
await test('Records: one added, one changed and one deleted, each on the digest the last edit left; a record with < & and quotes is text', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await segment(page, 'Records').click();
  const list = page.getByRole('list', { name: 'Decision records' });
  const digests = [await digest(page)];
  const odd = 'Keep <b>Word</b> & "PDF" first.';

  // Add: the owner's record, binding when asked, at the end of the list.
  await page.getByRole('button', { name: 'Add record…', exact: true }).click();
  let dialog = windowOf(page, 'Add a record');
  await dialog.waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute('name') === 'date');
  await dialog.locator('input[name="date"]').fill('2026-11-21');
  await dialog.locator('input[name="subjects"]').fill('office-docs, genoffice,  ');
  await dialog.locator('textarea[name="text"]').fill(odd);
  const binding = dialog.getByRole('checkbox', { name: 'Binding', exact: true });
  assert.equal(await binding.getAttribute('aria-checked'), 'false');
  await binding.click();
  assert.equal(await binding.getAttribute('aria-checked'), 'true');
  assert.deepEqual(await unnamed(dialog), [], 'every control of the window has a name');
  await page.screenshot({ path: shots + '/write-record-add.png' });
  await save(dialog).click();
  await dialog.waitFor({ state: 'detached' });
  await notice(page, 'Record added.').waitFor();
  let edits = await editsOf(app);
  assert.equal(edits.length, 1);
  assert.deepEqual(Object.keys(edits[0]), ['id', 'digest', 'records'], 'only the records are sent');
  assert.equal(edits[0].digest, digests[0], 'on the digest the page showed');
  assert.deepEqual(edits[0].records.map(r => r.id), ['r1', 'r2', 'you-2026-11-21-1']);
  assert.deepEqual(edits[0].records[2], { id: 'you-2026-11-21-1', date: '2026-11-21', subjects: ['office-docs', 'genoffice'], text: odd, author: 'you', binding: true });
  assert.deepEqual(await texts(list.locator(':scope > li p')), ['One owner per output.', 'Documents keep the source\'s limits.', odd], 'the page read the file again and shows the record as text');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('main b')].filter(e => e.textContent.includes('Word')).length), 0, 'markup in a record is text, not markup');
  digests.push(await digest(page));
  assert.notEqual(digests[1], digests[0]);

  // Edit, binding only: Muro's record stays Muro's. The list sent is the one the page shows now, with the record added.
  await page.getByRole('button', { name: 'Edit the record of 2026-11-10 about design-taste', exact: true }).click();
  dialog = windowOf(page, 'Edit the record of 2026-11-10');
  await dialog.waitFor();
  await dialog.getByText('Muro wrote this record', { exact: false }).waitFor();
  assert.equal(await dialog.locator('input[name="date"]').inputValue(), '2026-11-10');
  assert.equal(await dialog.locator('input[name="subjects"]').inputValue(), 'design-taste');
  assert.equal(await dialog.locator('textarea[name="text"]').inputValue(), 'One owner per output.');
  await dialog.getByRole('checkbox', { name: 'Binding', exact: true }).click();
  await save(dialog).click();
  await dialog.waitFor({ state: 'detached' });
  await notice(page, 'Record saved.').waitFor();
  edits = await editsOf(app);
  assert.equal(edits.length, 2);
  assert.equal(edits[1].digest, digests[1], 'the second edit names the file the first one wrote');
  assert.deepEqual(edits[1].records.map(r => r.id), ['r1', 'r2', 'you-2026-11-21-1'], 'the list has the record added before');
  assert.deepEqual(edits[1].records[0], { id: 'r1', date: '2026-11-10', subjects: ['design-taste'], text: 'One owner per output.', author: 'muro', binding: true });
  assert.deepEqual(edits[1].records[2], edits[0].records[2], 'the others are as they were');
  digests.push(await digest(page));

  // Edit, the words: from then on the record is the owner's.
  await page.getByRole('button', { name: 'Edit the record of 2026-11-10 about design-taste', exact: true }).click();
  dialog = windowOf(page, 'Edit the record of 2026-11-10');
  await dialog.waitFor();
  assert.equal(await dialog.getByRole('checkbox', { name: 'Binding', exact: true }).getAttribute('aria-checked'), 'true', 'the window shows the record as the file holds it now');
  await dialog.locator('textarea[name="text"]').fill('One owner per output, always.');
  await save(dialog).click();
  await dialog.waitFor({ state: 'detached' });
  edits = await editsOf(app);
  assert.equal(edits.length, 3);
  assert.equal(edits[2].digest, digests[2]);
  assert.deepEqual(edits[2].records[0], { id: 'r1', date: '2026-11-10', subjects: ['design-taste'], text: 'One owner per output, always.', author: 'you', binding: true });
  digests.push(await digest(page));
  assert.match(await list.locator(':scope > li').first().textContent(), /Yours · binding/);

  // Delete: asked first, naming the record, with focus on Cancel; Cancel sends nothing.
  await page.getByRole('button', { name: 'Delete the record of 2026-11-12 about office-docs', exact: true }).click();
  dialog = windowOf(page, 'Delete the record of 2026-11-12?');
  await dialog.waitFor();
  await dialog.getByText('about office-docs', { exact: false }).waitFor();
  await dialog.getByText('Documents keep the source\'s limits.', { exact: false }).waitFor();
  await page.waitForFunction(() => document.activeElement?.textContent === 'Cancel');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  assert.equal((await editsOf(app)).length, 3, 'Cancel deletes nothing');
  await page.getByRole('button', { name: 'Delete the record of 2026-11-12 about office-docs', exact: true }).click();
  dialog = windowOf(page, 'Delete the record of 2026-11-12?');
  await dialog.getByRole('button', { name: 'Delete record', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await notice(page, 'Record deleted.').waitFor();
  // The Delete button went with the record: focus is on the heading of the panel, not on the page.
  await page.waitForFunction(() => document.activeElement?.closest('h3')?.textContent === 'Decision records');
  edits = await editsOf(app);
  assert.equal(edits.length, 4);
  assert.equal(edits[3].digest, digests[3]);
  assert.deepEqual(edits[3].records.map(r => r.id), ['r1', 'you-2026-11-21-1']);
  assert.deepEqual(await texts(list.locator(':scope > li p')), ['One owner per output, always.', odd]);
  await page.screenshot({ path: shots + '/write-records.png' });
});

await test('Records: what is missing is said before anything is sent, and a file that changed is refused in the runtime\'s words', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await segment(page, 'Records').click();
  const read = await digest(page);
  await page.getByRole('button', { name: 'Add record…', exact: true }).click();
  const dialog = windowOf(page, 'Add a record');
  await dialog.waitFor();
  assert.match(await dialog.locator('input[name="date"]').inputValue(), /^\d{4}-\d{2}-\d{2}$/, 'the date starts as a day (today)');
  await save(dialog).click();
  await dialog.getByText('Write the decision and its reason.', { exact: true }).waitFor();
  assert.equal((await editsOf(app)).length, 0, 'nothing is sent while the decision is empty');
  await dialog.locator('textarea[name="text"]').fill('A decision.');
  assert.equal(await dialog.getByText('Write the decision and its reason.', { exact: true }).count(), 0, 'what was fixed is no longer said');
  await page.evaluate(() => window.behind.touch('marionette'));
  await save(dialog).click();
  const refusal = dialog.getByRole('alert').filter({ hasText: CHANGED });
  await refusal.waitFor();
  assert.equal((await refusal.textContent()).trim(), `Not saved. ${CHANGED}`);
  const edits = await editsOf(app);
  assert.equal(edits.length, 1);
  assert.equal(edits[0].digest, read, 'the edit named the file the page had read');
  assert.equal(edits[0].records.length, 3);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  assert.deepEqual(await texts(page.getByRole('list', { name: 'Decision records' }).locator(':scope > li p')), ['One owner per output.', 'Documents keep the source\'s limits.'], 'the records are as they were');
});

await test('Records: at 500px the panel is a drawer, and a record added from it is saved and the drawer is still there', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await page.setViewportSize({ width: 500, height: 900 });
  await page.getByRole('button', { name: 'Project panel', exact: true }).click();
  const drawer = page.locator('[data-slot="sheet-content"][data-side="left"]');
  await drawer.waitFor();
  await segment(page, 'Records').click();
  await drawer.getByRole('button', { name: 'Add record…', exact: true }).click();
  const dialog = windowOf(page, 'Add a record');
  await dialog.waitFor();
  await dialog.locator('textarea[name="text"]').fill('Said from the drawer.');
  await save(dialog).click();
  await dialog.waitFor({ state: 'detached' });
  await notice(page, 'Record added.').waitFor();
  assert.equal((await editsOf(app)).length, 1);
  await drawer.getByText('Said from the drawer.', { exact: true }).waitFor();
});

if (failed.length) { console.error('FAILED:\n  ' + failed.join('\n  ')); process.exit(1); }
console.log('PASS: ' + done.join('; '));
