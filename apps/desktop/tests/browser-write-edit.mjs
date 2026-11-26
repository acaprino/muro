// Plan W, Task 3: the details and the decision records edited by hand, on the fake transport (fake-transport.js). Edits are no AI runs: `edit_project` carries the digest of the file the page
// shows, the runtime saves it offline, and the page reads the project again, so the next edit names the file the last one wrote. The dialogs are opened through the workspace's own buttons
// (Edit details… in the header, Add record… and the Edit and Delete of a record in the Records panel).
// And the release of a project (ADR-0034), which is no AI run either and writes no file: Release… at the foot asks first, `release_project` carries the digest and the one switch, and what the
// runtime answers is said as it came. The fake reaches no repository.
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
const openSample = async page => {
  await goProjects(page);
  await page.getByRole('button', { name: 'Sample', exact: true }).click();
  await page.getByRole('heading', { name: 'Sample', level: 1 }).waitFor();
};
const segment = (page, name) => page.locator('[data-slot="toggle-group-item"]').filter({ hasText: new RegExp(`^${name}$`) });
const notice = (page, text) => page.locator('[data-toasts]').getByText(text, { exact: true });
/** The digest of the project's file now, as the fake holds it (what the page's digest has to be to be current). */
const digest = page => page.evaluate(() => window.behind.digest('sample'));
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
  await openSample(page);
  const first = await digest(page);
  const dialog = await openDetails(page);
  await page.waitForFunction(() => document.activeElement?.getAttribute('name') === 'name');
  assert.equal(await dialog.locator('input[name="name"]').inputValue(), 'Sample');
  assert.equal(await dialog.locator('input[name="author"]').inputValue(), 'acaprino');
  assert.equal(await dialog.locator('input[name="repository-url"]').inputValue(), 'https://github.com/owner/sample');
  assert.equal(await dialog.locator('input[name="repository-branch"]').inputValue(), 'main');
  assert.equal(await dialog.locator('input[name="repository-tag_prefix"]').inputValue(), 'sample-v');
  assert.equal(await save(dialog).isDisabled(), true, 'nothing changed: nothing to save');
  const author = 'Ann <i>Lee</i> & "Co"';
  await dialog.locator('input[name="name"]').fill('Sample Plus');
  await dialog.locator('input[name="author"]').fill(author);
  await dialog.getByRole('button', { name: 'Take the repository away', exact: true }).click();
  assert.equal(await dialog.locator('input[name="repository-url"]').inputValue(), '', 'the address is empty');
  assert.equal(await dialog.getByRole('button', { name: 'Take the repository away', exact: true }).count(), 0, 'there is nothing left to take away');
  await page.screenshot({ path: shots + '/write-details.png' });
  await save(dialog).click();
  await dialog.waitFor({ state: 'detached' });
  await notice(page, 'Details saved.').waitFor();
  await page.getByRole('heading', { name: 'Sample Plus', level: 1 }).waitFor();
  assert.deepEqual(await editsOf(app), [{ id: 'sample', digest: first, name: 'Sample Plus', author, repository: null }], 'only what changed, on the digest the page showed, with the repository as null');
  const head = await page.locator('main header').first().textContent();
  assert.ok(head.includes('No Git repository set') && head.includes(`by ${author}`), `the page shows the file as it is now: ${head}`);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('main i')].filter(e => e.textContent.includes('Lee')).length), 0, 'the author is text, not markup');
  const second = await digest(page);
  assert.notEqual(second, first, 'the file has another digest');

  // The window opens on the file as it is now, and the second edit names the digest the first one left.
  const again = await openDetails(page);
  assert.equal(await again.locator('input[name="name"]').inputValue(), 'Sample Plus');
  assert.equal(await again.locator('input[name="repository-url"]').inputValue(), '');
  await again.locator('textarea[name="changelog"]').fill('# Sample Plus\n\nEdited by hand.\n');
  await save(again).click();
  await again.waitFor({ state: 'detached' });
  const edits = await editsOf(app);
  assert.equal(edits.length, 2);
  assert.deepEqual(edits[1], { id: 'sample', digest: second, changelog: '# Sample Plus\n\nEdited by hand.\n' });
  const third = await digest(page);
  assert.notEqual(third, second);
  const last = await openDetails(page);
  assert.equal(await last.locator('textarea[name="changelog"]').inputValue(), '# Sample Plus\n\nEdited by hand.\n', 'the changelog is the one the file holds now');
  await last.getByRole('button', { name: 'Cancel', exact: true }).click();
  await last.waitFor({ state: 'detached' });
  assert.equal((await editsOf(app)).length, 2, 'Cancel sends nothing');
});

await test('Edit details: Cancel and Escape send nothing and the window starts again from the file; what is wrong is said before anything is sent', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
  let dialog = await openDetails(page);
  await dialog.locator('input[name="name"]').fill('Something else');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  dialog = await openDetails(page);
  assert.equal(await dialog.locator('input[name="name"]').inputValue(), 'Sample', 'what was typed is not kept');
  assert.deepEqual(await unnamed(dialog), [], 'every control of the window has a name');

  await dialog.locator('input[name="name"]').fill('  ');
  await dialog.locator('input[name="repository-url"]').fill('http://example.com/x');
  await save(dialog).click();
  await dialog.getByText('The project name is required', { exact: true }).waitFor();
  await dialog.getByText('The repository address must be an https:// address', { exact: true }).waitFor();
  assert.equal((await editsOf(app)).length, 0, 'nothing is sent while the form is wrong');
  await dialog.locator('input[name="name"]').fill('A'.repeat(201));
  await dialog.locator('input[name="repository-url"]').fill('https://github.com/owner/sample');
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
  await openSample(page);
  const read = await digest(page);
  const dialog = await openDetails(page);
  await dialog.locator('input[name="name"]').fill('Sample Plus');
  await page.evaluate(() => window.behind.touch('sample'));
  const touched = await digest(page);
  assert.notEqual(touched, read);
  await save(dialog).click();
  const refusal = dialog.getByRole('alert').filter({ hasText: CHANGED });
  await refusal.waitFor();
  assert.equal(await refusal.locator('[data-slot="note-description"]').textContent(), CHANGED, 'the runtime\'s sentence, whole');
  assert.match(await refusal.locator('[data-slot="note-title"]').textContent(), /Not saved/);
  assert.deepEqual(await editsOf(app), [{ id: 'sample', digest: read, name: 'Sample Plus' }], 'the edit named the file the page had read');
  assert.equal(await digest(page), touched, 'the file was not written');
  assert.equal(await dialog.isVisible(), true, 'the window stays so what was typed is not lost');
  assert.equal(await dialog.locator('input[name="name"]').inputValue(), 'Sample Plus');
  await page.screenshot({ path: shots + '/write-details-refused.png' });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await page.getByRole('heading', { name: 'Sample', level: 1 }).waitFor();
});

// ---------- the records ----------
await test('Records: one added, one changed and one deleted, each on the digest the last edit left; a record with < & and quotes is text', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
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
  await openSample(page);
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
  await page.evaluate(() => window.behind.touch('sample'));
  await save(dialog).click();
  const refusal = dialog.getByRole('alert').filter({ hasText: CHANGED });
  await refusal.waitFor();
  assert.equal(await refusal.locator('[data-slot="note-description"]').textContent(), CHANGED);
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
  await openSample(page);
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

// ---------- release ----------
const RELEASE_ABOUT = 'The project file is pushed to its repository with your own Git, and the workflow of that repository then makes the release. A push cannot be taken back from here.';
const RELEASE_INIT = 'Add the release workflow when the repository has none';
const NO_RELEASE_REPOSITORY = 'This project names no repository: give it one in Edit details…';
const releaseButton = page => page.getByRole('button', { name: 'Release…', exact: true });
/** The payloads of every `release_project` the page sent, oldest first. */
const releasesOf = async app => (await callsOf(app, 'release_project')).map(c => c.payload);
const openRelease = async (page, name = 'Sample') => {
  await releaseButton(page).click();
  const dialog = windowOf(page, `Release ${name}?`);
  await dialog.waitFor();
  return dialog;
};
const initSwitch = dialog => dialog.getByRole('switch', { name: RELEASE_INIT, exact: true });

await test('Release: it asks first with the focus on Cancel and says what the file says; the request carries the digest the page read and the switch; while the file is on its way the button waits and the window stays; the command\'s sentence is the notice', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
  const read = await digest(page);
  assert.equal(await releaseButton(page).isDisabled(), false, 'the project names a repository');
  assert.equal(await releaseButton(page).getAttribute('data-variant'), 'outline', 'not the solid action of the window');
  let dialog = await openRelease(page);
  await page.waitForFunction(() => document.activeElement?.textContent === 'Cancel');
  await dialog.getByText(RELEASE_ABOUT, { exact: true }).waitFor();
  const said = await dialog.textContent();
  for (const fact of ['https://github.com/owner/sample', 'main', 'sample.mp', '0.5.0', 'sample-v0.5.0', 'Git pushes under your name and with your credentials: Muro asks for none, keeps none and forces nothing.']) {
    assert.ok(said.includes(fact), `the window says ${fact}: ${said}`);
  }
  assert.equal(await initSwitch(dialog).isChecked(), false, 'the workflow is added only when the person asks');
  assert.deepEqual(await unnamed(dialog), [], 'every control of the window has a name');
  await page.screenshot({ path: shots + '/write-release.png' });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  assert.deepEqual(await releasesOf(app), [], 'Cancel sends nothing');

  dialog = await openRelease(page);
  await initSwitch(dialog).focus();
  await page.keyboard.press('Space');
  assert.equal(await initSwitch(dialog).isChecked(), true);
  await app.flags({ releaseDelay: 2000 });
  await dialog.getByRole('button', { name: 'Release Sample', exact: true }).click();
  await dialog.locator('button[aria-busy="true"]').getByText('Releasing…').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await dialog.isVisible(), true, 'the window does not close while the file is on its way');
  await dialog.waitFor({ state: 'detached' });
  await notice(page, "Pushed sample.mp and .github/workflows/release.yml to main. The repository's workflow releases it as sample-v0.5.0.").waitFor();
  assert.deepEqual(await releasesOf(app), [{ id: 'sample', digest: read, init: true }], 'the file the page showed, and the switch');
  assert.equal(await digest(page), read, 'a release does not write the file');
  // A window that opens again starts from its first values.
  await app.flags({ releaseDelay: 0 });
  dialog = await openRelease(page);
  assert.equal(await initSwitch(dialog).isChecked(), false);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  assert.equal((await releasesOf(app)).length, 1, 'Cancel sends nothing');
});

await test('Release: what the runtime refuses is said in the window as it came and the window stays open; a file that changed after the page read it is refused too; the project read again is released', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
  const read = await digest(page);
  const taken = 'sample-v0.5.0: the same version was already released from another file: change the version';
  await app.flags({ releaseError: taken, releaseCaller: true });
  const dialog = await openRelease(page);
  const confirm = dialog.getByRole('button', { name: 'Release Sample', exact: true });
  await confirm.click();
  await dialog.getByRole('alert').getByText(taken, { exact: true }).waitFor();
  assert.equal(await dialog.isVisible(), true, 'the window stays open');
  assert.equal(await confirm.getAttribute('aria-busy'), null, 'and can be tried again');
  assert.equal(await page.locator('[data-toasts]').getByText(/Pushed/).count(), 0, 'nothing is said to have been pushed');
  await page.screenshot({ path: shots + '/write-release-refused.png' });
  // The file is written behind the page: the digest the page read is stale, and the runtime says so.
  await app.flags({ releaseError: '' });
  await page.evaluate(() => window.behind.touch('sample'));
  const touched = await digest(page);
  await confirm.click();
  await dialog.getByRole('alert').getByText(CHANGED, { exact: true }).waitFor();
  assert.equal(await dialog.getByText(taken, { exact: true }).count(), 0, 'the refusal before it is no longer said');
  assert.deepEqual(await releasesOf(app), [{ id: 'sample', digest: read, init: false }, { id: 'sample', digest: read, init: false }], 'both named the file the page had read');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  // The project opened again is the file as it is now.
  await page.getByRole('button', { name: 'All projects', exact: true }).click();
  await page.getByRole('button', { name: 'Sample', exact: true }).click();
  await page.getByRole('heading', { name: 'Sample', level: 1 }).waitFor();
  const again = await openRelease(page);
  assert.equal(await again.getByRole('alert').count(), 0, 'a window that opens has not failed yet');
  await again.getByRole('button', { name: 'Release Sample', exact: true }).click();
  await again.waitFor({ state: 'detached' });
  await notice(page, "Pushed sample.mp to main. The repository's workflow releases it as sample-v0.5.0.").waitFor();
  assert.deepEqual((await releasesOf(app))[2], { id: 'sample', digest: touched, init: false });
});

await test('Release: a project that names no repository has it off, saying why; once Edit details gives it one, it is on and the window says the new repository', 'projects', {}, async app => {
  const { page } = app;
  await app.flags({ pickPath: 'D:/Notes/Notes.mp' });
  await goProjects(page);
  await page.getByRole('button', { name: 'Open project file…', exact: true }).click();
  await notice(page, 'Notes added to your list.').waitFor();
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByRole('heading', { name: 'Notes', level: 1 }).waitFor();
  assert.equal(await releaseButton(page).isDisabled(), true, 'there is nowhere to release it to');
  assert.equal(await releaseButton(page).getAttribute('title'), NO_RELEASE_REPOSITORY);
  const details = await openDetails(page);
  await details.locator('input[name="repository-url"]').fill('https://github.com/owner/notes');
  await details.locator('input[name="repository-tag_prefix"]').fill('notes-v');
  await save(details).click();
  await details.waitFor({ state: 'detached' });
  await page.locator('button:enabled').filter({ hasText: /^Release…$/ }).waitFor();
  assert.equal(await releaseButton(page).getAttribute('title'), null, 'nothing to say once it can be released');
  const dialog = await openRelease(page, 'Notes');
  const said = await dialog.textContent();
  for (const fact of ['https://github.com/owner/notes', 'main', 'notes.mp', '0.5.0', 'notes-v0.5.0']) assert.ok(said.includes(fact), `the window says ${fact}: ${said}`);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  assert.deepEqual(await releasesOf(app), [], 'looking sends nothing');
});

if (failed.length) { console.error('FAILED:\n  ' + failed.join('\n  ')); process.exit(1); }
console.log('PASS: ' + done.join('; '));
