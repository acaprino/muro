// Plan W, Task 2: the AI changes of an open project from the React window, on the fake transport (fake-transport.js): Add input and Harmonize again from the foot of the
// workspace, Move pin and Remove from the Inputs panel, the custom instructions, and the card of the run at the top with Cancel. The runs are the fake's jobs: a test ends
// them with window.behind.finish(), as the runtime does when the agent and the build are done; what the runtime refuses comes back in its own words and is shown as it is.
// The old Imago page's tests (8f70786:apps/desktop/tests/browser-project-write.mjs) are the spec; the selectors are Sigrid's.
//   node apps/desktop/tests/browser-write-ai.mjs        (MURO_UI_PORT moves the dev server off 1422; MURO_ONLY=<words> runs the tests whose name holds them)
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { open } from './browser-helper.mjs';

const shots = 'apps/desktop/tests/artifacts';
await mkdir(shots, { recursive: true });
const done = [], failed = [];
/** Every test runs, whatever the others did: a failure is listed at the end, and fails the run. */
async function test(name, scenario, options, body) {
  if (process.env.MURO_ONLY && !name.includes(process.env.MURO_ONLY)) return;
  const app = await open(scenario, options);
  app.page.setDefaultTimeout(10000);
  try { await body(app); done.push(name); }
  catch (error) { failed.push(`${name}: ${String(error.message).split(/\r?\n/).slice(0, 3).join(' | ')}`); }
  finally { await app.close().catch(error => failed.push(`${name}: ${error.message}`)); }
}

// What the runtime says (crates/muro-desktop-runtime/src/project_jobs.rs), and what the fake's runs end with.
const NEEDS_CLAUDE = 'Making and changing a project needs Claude Code (the only agent Muro can hold to a budget). Choose Claude Code in Settings → AI.';
const CHANGED = 'The project file changed since it was opened: open it again and repeat the change';
const SAVED = 'The project was saved. Use Install via Sync… to bring the change to your harnesses';
const busyWith = title => `${title} is running: one AI run goes at a time. Wait for it to finish, or cancel it.`;
const editWith = title => `${title} is changing this project: edits wait for it to finish, or cancel it.`;
const FROZEN_PIN = 'A frozen commit is held at the commit that was reviewed: its pin is not moved from here.';
const NOT_CANCELLABLE = 'The project is being saved: it cannot be cancelled now';

const callsOf = async (app, action) => (await app.calls()).filter(c => c.action === action).map(c => c.payload);
/** The window has read the registry once: the status row says when it was last checked. */
const ready = page => page.locator('[data-slot="app-shell-status"]').getByText(/Last check/).waitFor();
const tab = (page, name) => page.locator('[data-slot="toolbar-tab"]').filter({ hasText: new RegExp(`^${name}$`) });
const openSample = async page => {
  await ready(page);
  await tab(page, 'Projects').click();
  await page.getByRole('button', { name: 'Sample', exact: true }).click();
  await page.getByRole('heading', { name: 'Sample', level: 1 }).waitFor();
};
const segment = (scope, name) => scope.locator('[data-slot="toggle-group-item"]').filter({ hasText: new RegExp(`^${name}$`) });
const row = (page, title) => page.locator('[data-slot="item-row"]').filter({ has: page.locator('[data-slot="item-row-title"]', { hasText: new RegExp(`^${title}$`) }) });
/** The dialog open over the window: a centred one, or one docked at the right (the instructions). */
const dialog = page => page.locator('[data-slot="dialog-content"], [data-slot="sheet-content"][data-side="right"]');
/** The card of the open project's run, at the top of the workspace. */
const card = page => page.getByRole('region', { name: 'AI run', exact: true });
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
/** Release… of the project's More menu, with the menu open (`closeMenu` shuts it). */
const releaseItem = async page => {
  if (!(await page.getByRole('menu').count())) await page.getByRole('button', { name: 'More', exact: true }).click();
  return page.getByRole('menuitem', { name: 'Release…', exact: true });
};
const closeMenu = async page => { await page.keyboard.press('Escape'); await page.getByRole('menu').waitFor({ state: 'detached' }); };
const header = page => page.locator('main header').first();
const notice = (page, text) => page.locator('[data-toasts]').getByText(text, { exact: true });
const fieldError = (scope, text) => scope.locator('[data-slot="field-error"]').getByText(text, { exact: true });
const finish = (page, status = 'completed', message = null) => page.evaluate(([s, m]) => window.behind.finish(s, m ?? undefined), [status, message]);
const digest = page => page.evaluate(() => window.behind.digest('sample'));
const focused = page => page.evaluate(() => {
  const e = document.activeElement;
  return e ? { tag: e.tagName, text: e.textContent, placeholder: e.getAttribute('placeholder'), inDialog: !!e.closest('[data-slot="dialog-content"], [data-slot="sheet-content"]') } : null;
});
/** Waits until `check()` holds, polling: a run is read every 2 s, so what follows its end takes a moment. */
async function until(check, what, ms = 10000) {
  const end = Date.now() + ms;
  for (;;) {
    if (await check()) return;
    if (Date.now() > end) throw new Error(`Timed out waiting: ${what}`);
    await new Promise(next => setTimeout(next, 100));
  }
}
const versionShown = (page, version) => header(page).getByText(version, { exact: true }).waitFor();

// ---------- Add input ----------
await test('Add input: an address that is no input and a request that is too long are said in place and nothing is sent; then the run starts on the file the page read, its card shows it, and at its end the project is read again at its new version', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
  const read = await digest(page);
  await button(page, 'Add input…').click();
  const dlg = dialog(page);
  await dlg.getByRole('heading', { name: 'Add an input' }).waitFor();
  await dlg.getByText('Sample: the AI pins the input, reads it and harmonizes it with the others.', { exact: true }).waitFor();
  await until(async () => (await focused(page))?.placeholder === 'https://github.com/owner/repository', 'the focus starts on the input');
  const source = dlg.getByRole('textbox', { name: 'Input', exact: true });
  await button(dlg, 'Add input').click();
  await fieldError(dlg, 'Where the input comes from is required').waitFor();
  await source.fill('github.com/example/x');
  assert.equal(await dlg.locator('[data-slot="field-error"]').count(), 0, 'typing takes the error away');
  await source.press('Enter');
  await fieldError(dlg, 'An input is an https:// address or the full path of a folder on this computer').waitFor();
  assert.equal(await source.getAttribute('aria-invalid'), 'true');
  await source.fill('https://github.com/example/a b');
  await button(dlg, 'Add input').click();
  await fieldError(dlg, "An input's address must be an https:// address without spaces").waitFor();
  await source.fill('https://github.com/example/x');
  await dlg.getByRole('textbox', { name: 'Your request', exact: true }).fill('x'.repeat(4001));
  await dlg.getByRole('textbox', { name: 'Maximum budget (USD)', exact: true }).fill('0');
  await button(dlg, 'Add input').click();
  await fieldError(dlg, 'The request must be at most 4000 characters').waitFor();
  await fieldError(dlg, 'The AI budget must be above 0 and at most 100 USD').waitFor();
  assert.equal((await callsOf(app, 'project_job')).length, 0, 'nothing is sent while the form is wrong');
  assert.equal(await segment(dlg, 'Minor').getAttribute('aria-pressed'), 'true', 'an input added moves the version by a minor step unless the person says otherwise');
  await dlg.getByText(/^Claude Code does it on this computer with its own credentials, and spends at most the budget below\./).waitFor();
  await dlg.getByRole('textbox', { name: 'Your request', exact: true }).fill('Take its layout rules.');
  await dlg.getByRole('textbox', { name: 'Maximum budget (USD)', exact: true }).fill('2.5');
  await page.screenshot({ path: shots + '/write-add-input.png' });
  await button(dlg, 'Add input').click();
  await dlg.waitFor({ state: 'detached' });
  assert.deepEqual(await callsOf(app, 'project_job'), [{ id: 'sample', digest: read, operation: 'add_input', budget_usd: 2.5, step: 'minor', request: 'Take its layout rules.', source: 'https://github.com/example/x' }]);
  const title = 'Add the input https://github.com/example/x';
  await card(page).getByRole('heading', { name: title }).waitFor();
  const facts = await card(page).textContent();
  for (const fact of ['Running', 'Opening the project', 'Claude Code', 'up to $2.50', 'Each step stops after 120 min', 'output.log']) assert.ok(facts.includes(fact), `the card says ${fact}: ${facts}`);
  assert.equal(await button(card(page), 'Cancel').count(), 1);
  assert.equal(await button(page, 'Add input…').isDisabled(), true, 'no second run while this one goes');
  assert.equal(await button(page, 'Add input…').getAttribute('title'), busyWith(title));
  await page.screenshot({ path: shots + '/write-running.png' });
  const reads = (await callsOf(app, 'project')).length;
  await finish(page);
  await versionShown(page, '0.6.0');
  assert.ok((await callsOf(app, 'project')).length > reads, 'the project is read again when its run ends');
  await card(page).getByText(`${title}: ${SAVED}`, { exact: true }).waitFor();
  await notice(page, `${title}: ${SAVED}`).waitFor();
  await until(() => button(page, 'Add input…').isEnabled(), 'Add input… comes back');
  await segment(page, 'Inputs').click();
  await row(page, 'x').waitFor();
  await button(card(page), 'Dismiss').click();
  await card(page).waitFor({ state: 'detached' });
});

// ---------- Harmonize again ----------
await test('Harmonize again: the request and the step go to the run; while it runs no other change of the project is offered and the buttons and the foot say why; the card stays when the project is left and opened again; at its end the changes come back at the version the step moved to', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
  const read = await digest(page);
  await button(page, 'Harmonize again…').click();
  const dlg = dialog(page);
  await dlg.getByRole('heading', { name: 'Harmonize again' }).waitFor();
  await until(async () => (await focused(page))?.tag === 'TEXTAREA', 'the focus starts on the request');
  assert.equal(await segment(dlg, 'Patch').getAttribute('aria-pressed'), 'true', 'a harmonization is a patch unless the person says otherwise');
  await dlg.getByRole('textbox', { name: 'Your request', exact: true }).fill('Merge the two review steps.');
  await segment(dlg, 'Minor').click();
  await button(dlg, 'Harmonize').click();
  await dlg.waitFor({ state: 'detached' });
  assert.deepEqual(await callsOf(app, 'project_job'), [{ id: 'sample', digest: read, operation: 'harmonize', budget_usd: 5, step: 'minor', request: 'Merge the two review steps.' }]);
  await card(page).getByRole('heading', { name: 'Harmonize again' }).waitFor();
  const reason = busyWith('Harmonize again');
  assert.equal(await button(page, 'Install via Sync…').isEnabled(), true, 'opening Sync can read the current project while a new version is being prepared');
  // Release… is no AI run, and still waits for a run that changes this project, as Edit details… does.
  for (const name of ['Harmonize again…', 'Add input…']) {
    assert.equal(await button(page, name).isDisabled(), true, `${name} waits for the run`);
    assert.equal(await button(page, name).getAttribute('title'), reason, `${name} says why`);
  }
  // An edit by hand is no AI run: it waits because this project is being changed, and says so.
  const edit = editWith('Harmonize again');
  assert.equal(await button(page, 'Edit details…').isDisabled(), true, 'Edit details… waits for the run');
  assert.equal(await button(page, 'Edit details…').getAttribute('title'), edit, 'Edit details… says why');
  assert.equal(await (await releaseItem(page)).isDisabled(), true, 'Release… waits for the run');
  assert.equal(await (await releaseItem(page)).getAttribute('title'), edit, 'Release… says why');
  await closeMenu(page);
  await page.getByRole('status').filter({ hasText: reason }).first().waitFor();
  await segment(page, 'Inputs').click();
  for (const name of ['Move pin of taste-skill', 'Remove genoffice', 'Instructions…']) {
    assert.equal(await button(page, name).isDisabled(), true, `${name} waits for the run`);
    assert.equal(await button(page, name).getAttribute('title'), reason);
  }
  await page.evaluate(() => window.behind.phase('AI intake and harmonization'));
  await card(page).getByText('AI intake and harmonization', { exact: true }).waitFor();
  // The card is the runtime's run, read again: leaving the project and the tab does not lose it.
  await button(page, 'All projects').click();
  await tab(page, 'Sync').click();
  await tab(page, 'Projects').click();
  await page.getByRole('button', { name: 'Sample', exact: true }).click();
  await card(page).getByRole('heading', { name: 'Harmonize again' }).waitFor();
  await finish(page);
  await versionShown(page, '0.6.0');
  await until(() => button(page, 'Harmonize again…').isEnabled(), 'Harmonize again… comes back');
  assert.equal(await button(page, 'Edit details…').isDisabled(), false);
  assert.equal(await (await releaseItem(page)).isDisabled(), false);
  await closeMenu(page);
  assert.equal(await page.getByRole('status').filter({ hasText: reason }).count(), 0, 'the foot no longer says a run goes');
});

// ---------- Cancel ----------
await test('Cancel during the agent: the run is asked to stop and the card says it is stopping until the runtime ends it, then that it was cancelled or timed out and the file was not changed; the project stays at its version', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
  await app.flags({ cancelHolds: true });
  await button(page, 'Harmonize again…').click();
  await button(dialog(page), 'Harmonize').click();
  await dialog(page).waitFor({ state: 'detached' });
  await page.evaluate(() => window.behind.phase('AI intake and harmonization'));
  await card(page).getByText('AI intake and harmonization', { exact: true }).waitFor();
  await button(card(page), 'Cancel').click();
  await card(page).locator('button[aria-busy="true"]').getByText('Stopping…').waitFor();
  const [asked] = await callsOf(app, 'cancel_job');
  assert.match(asked.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'the run of the card is the one asked to stop');
  assert.equal(await button(page, 'Harmonize again…').isDisabled(), true, 'nothing else starts while it still goes');
  await finish(page, 'cancelled');
  // In the agent's step the runtime cannot tell a Cancel from its limit, and says both (the number of minutes is the runtime's).
  await card(page).getByText(/^Harmonize again was cancelled: The AI run was cancelled\. The project file was not changed$/).waitFor();
  await card(page).getByText('Cancelled', { exact: true }).waitFor();
  await until(() => button(page, 'Harmonize again…').isEnabled(), 'the changes come back');
  await versionShown(page, '0.5.0');
});

await test('Cancel between the steps of a run: the job was cancelled and the file was not changed', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
  await app.flags({ cancelHolds: true });
  await button(page, 'Harmonize again…').click();
  await button(dialog(page), 'Harmonize').click();
  await dialog(page).waitFor({ state: 'detached' });
  await card(page).getByText('Opening the project', { exact: true }).waitFor();
  await button(card(page), 'Cancel').click();
  await card(page).locator('button[aria-busy="true"]').getByText('Stopping…').waitFor();
  await finish(page, 'cancelled');
  await card(page).getByText('Harmonize again was cancelled: Job cancelled. The project file was not changed', { exact: true }).waitFor();
  await until(() => button(page, 'Harmonize again…').isEnabled(), 'the changes come back');
  await versionShown(page, '0.5.0');
});

await test('Saving: while the project is built and saved the card offers no Cancel and says why, and the run ends as it would have', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
  await button(page, 'Harmonize again…').click();
  await button(dialog(page), 'Harmonize').click();
  await dialog(page).waitFor({ state: 'detached' });
  await button(card(page), 'Cancel').waitFor();
  assert.equal(await card(page).getByText(NOT_CANCELLABLE, { exact: true }).count(), 0, 'before the saving phase it can be cancelled');
  await page.evaluate(() => window.behind.phase('Building and saving the project'));
  await card(page).getByText(NOT_CANCELLABLE, { exact: true }).waitFor();
  await card(page).getByText('Building and saving the project', { exact: true }).waitFor();
  assert.equal(await button(card(page), 'Cancel').count(), 0, 'no Cancel while the project is saved');
  assert.equal(await card(page).getByText('Stopping', { exact: true }).count(), 0);
  await page.screenshot({ path: shots + '/write-saving.png' });
  await finish(page);
  await versionShown(page, '0.5.1');
  await card(page).getByText(`Harmonize again: ${SAVED}`, { exact: true }).waitFor();
});

// ---------- a run that is not this page's ----------
await test('A run of another project or an adaptation: its card, with Cancel, is on the Projects page, since it is why no change is offered', 'projects', {}, async app => {
  const { page } = app;
  await ready(page);
  await tab(page, 'Projects').click();
  await page.getByRole('heading', { name: 'Projects', level: 1 }).waitFor();
  assert.equal(await card(page).count(), 0);
  await page.evaluate(() => window.behind.adapt('docs-writer', 'opencode'));
  await page.evaluate(() => window.shown?.());
  await card(page).getByRole('heading', { name: 'The adaptation of docs-writer' }).waitFor();
  const facts = await card(page).textContent();
  for (const fact of ['Running', 'harmonization', 'docs-writer for opencode', 'up to $2.00', 'Each step stops after 30 min']) assert.ok(facts.includes(fact), `the card says ${fact}: ${facts}`);
  assert.equal(await page.getByRole('button', { name: 'New project…', exact: true }).isDisabled(), true, 'no other run while it goes');
  await button(card(page), 'Cancel').click();
  await card(page).waitFor({ state: 'detached' });
  await until(() => page.getByRole('button', { name: 'New project…', exact: true }).isEnabled(), 'New project… comes back');
});

await test('A run another client started: the refusal is shown, and the page reads the runs again, so its card shows and the dialog cannot start another', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
  await page.evaluate(() => window.behind.adapt('docs-writer', 'opencode'));
  assert.equal(await card(page).count(), 0, 'the page was not told');
  await button(page, 'Harmonize again…').click();
  const dlg = dialog(page);
  await button(dlg, 'Harmonize').click();
  await dlg.getByRole('alert').getByText(/^Another AI run is in progress \(/).waitFor();
  await until(() => button(dlg, 'Harmonize').isDisabled(), 'the dialog knows a run goes');
  await button(dlg, 'Cancel').click();
  await dlg.waitFor({ state: 'detached' });
  await card(page).getByRole('heading', { name: 'The adaptation of docs-writer' }).waitFor();
  assert.equal(await button(page, 'Add input…').isDisabled(), true, 'no change is offered while it goes');
  assert.equal(await button(page, 'Add input…').getAttribute('title'), busyWith('The adaptation of docs-writer'));
  assert.equal(await (await releaseItem(page)).isDisabled(), false, 'a release is no AI run: a run that does not change this project does not hold it back');
  await closeMenu(page);
});

// ---------- the records wait for a run ----------
await test('Records: while a run changes the project the panel offers no edit, Add record, Edit and Delete say why, and they come back when the run ends', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
  await button(page, 'Harmonize again…').click();
  await button(dialog(page), 'Harmonize').click();
  await dialog(page).waitFor({ state: 'detached' });
  await card(page).getByRole('heading', { name: 'Harmonize again' }).waitFor();
  await segment(page, 'Records').click();
  const reason = editWith('Harmonize again');
  const names = ['Add record…', 'Edit the record of 2026-11-10 about design-taste', 'Delete the record of 2026-11-10 about design-taste', 'Edit the record of 2026-11-12 about office-docs', 'Delete the record of 2026-11-12 about office-docs'];
  for (const name of names) {
    assert.equal(await button(page, name).isDisabled(), true, `${name} waits for the run`);
    assert.equal(await button(page, name).locator('xpath=..').getAttribute('title'), reason, `${name} says why`);
  }
  await page.getByRole('status').filter({ hasText: reason }).first().waitFor();
  await finish(page);
  await versionShown(page, '0.5.1');
  for (const name of names) await until(() => button(page, name).isEnabled(), `${name} comes back`);
});

// ---------- a failed run ----------
await test('A run that failed is said on the project page with its reason and its log until it is put away; the project is as it was', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
  await button(page, 'Harmonize again…').click();
  await button(dialog(page), 'Harmonize').click();
  await card(page).getByRole('heading', { name: 'Harmonize again' }).waitFor();
  await finish(page, 'failed', 'The factory build failed. The project file was not changed');
  const said = 'Harmonize again failed: The factory build failed. The project file was not changed';
  await card(page).getByRole('alert').getByText(said, { exact: true }).waitFor();
  await notice(page, said).waitFor();
  assert.match(await card(page).textContent(), /Failed.*Log: D:\/isolated\/data\/jobs\/.*\/output\.log/);
  await versionShown(page, '0.5.0');
  await until(() => button(page, 'Harmonize again…').isEnabled(), 'the changes come back');
  // Leaving the project and coming back still says it, until it is put away.
  await button(page, 'All projects').click();
  await page.getByRole('button', { name: 'Sample', exact: true }).click();
  await card(page).getByText(said, { exact: true }).waitFor();
  await button(card(page), 'Dismiss').click();
  await card(page).waitFor({ state: 'detached' });
  await button(page, 'All projects').click();
  await page.getByRole('button', { name: 'Sample', exact: true }).click();
  await page.getByRole('heading', { name: 'Sample', level: 1 }).waitFor();
  assert.equal(await card(page).count(), 0, 'put away for the session');
});

// ---------- Move pin and Remove ----------
await test('Inputs: Move pin checks for updates first and starts from the release it reports; a frozen pin has Move pin off, with the reason; Remove asks with the focus on Cancel, names its input, and goes on the file the first run left', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
  const read = await digest(page);
  await segment(page, 'Inputs').click();
  const frozen = button(page, 'Move pin of superpowers');
  assert.equal(await frozen.count(), 1, 'a frozen commit has its Move pin too');
  assert.equal(await frozen.isDisabled(), true, 'but off');
  assert.equal(await frozen.getAttribute('title'), FROZEN_PIN, 'and it says why');
  await button(page, 'Move pin of taste-skill').click();
  const dlg = dialog(page);
  await dlg.getByRole('heading', { name: 'Move the pin of taste-skill' }).waitFor();
  const to = dlg.getByRole('textbox', { name: 'Move to', exact: true });
  assert.equal(await to.inputValue(), '');
  await until(async () => (await focused(page))?.placeholder === 'v2.0.0', 'the focus starts on the release to move to');
  await app.flags({ updatesError: 'The upstream could not be reached' });
  await button(dlg, 'Check for updates').click();
  await dlg.getByRole('alert').getByText('The upstream could not be reached', { exact: true }).waitFor();
  assert.equal(await to.inputValue(), '', 'a check that failed fills nothing');
  await app.flags({ updatesError: '' });
  await button(dlg, 'Check for updates').click();
  await dlg.getByText('v9.9.9 available', { exact: true }).waitFor();
  assert.equal(await to.inputValue(), 'v9.9.9', 'the release the check reports fills the field');
  assert.deepEqual(await callsOf(app, 'project_updates'), [{ id: 'sample' }, { id: 'sample' }]);
  await button(dlg, 'Move pin').click();
  await dlg.waitFor({ state: 'detached' });
  assert.deepEqual(await callsOf(app, 'project_job'), [{ id: 'sample', digest: read, operation: 'move_pin', budget_usd: 5, step: 'patch', request: '', input: 'taste-skill', to: 'v9.9.9' }]);
  await finish(page);
  await versionShown(page, '0.5.1');
  assert.match(await row(page, 'taste-skill').textContent(), /v9\.9\.9 · published release/);
  const second = await digest(page);
  assert.notEqual(second, read, 'the run wrote the file');
  const remove = button(page, 'Remove genoffice');
  await until(() => remove.isEnabled(), 'Remove comes back');
  await remove.click();
  await dlg.getByRole('heading', { name: 'Remove genoffice' }).waitFor();
  await dlg.getByText('What only genoffice brought leaves Sample. The AI harmonizes what remains.', { exact: true }).waitFor();
  await until(async () => { const f = await focused(page); return f?.text === 'Cancel' && f.inDialog; }, 'the focus starts on Cancel');
  assert.equal(await button(dlg, 'Remove input').getAttribute('data-variant'), 'destructive');
  await button(dlg, 'Cancel').click();
  await dlg.waitFor({ state: 'detached' });
  assert.equal((await callsOf(app, 'project_job')).length, 1, 'nothing is removed before the person agrees');
  await remove.click();
  assert.equal(await segment(dlg, 'Minor').getAttribute('aria-pressed'), 'true');
  await button(dlg, 'Remove input').click();
  await dlg.waitFor({ state: 'detached' });
  const removal = (await callsOf(app, 'project_job'))[1];
  assert.deepEqual([removal.operation, removal.input, removal.digest, removal.step], ['remove_input', 'genoffice', second, 'minor'], 'the change names the file as the first run left it');
  await finish(page);
  await versionShown(page, '0.6.0');
  await row(page, 'genoffice').waitFor({ state: 'detached' });
});

// ---------- Instructions ----------
await test('Instructions: nothing changed is said and nothing is sent; a file that is no Markdown is refused in place; only the files that changed are sent, a removed one with no text', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
  await segment(page, 'Inputs').click();
  await button(page, 'Instructions…').click();
  const dlg = dialog(page);
  await dlg.getByRole('heading', { name: 'Your instructions' }).waitFor();
  const names = dlg.getByRole('textbox', { name: 'File name', exact: true }), texts = dlg.getByRole('textbox', { name: 'Text', exact: true });
  assert.equal(await names.count(), 1);
  assert.equal(await names.first().inputValue(), 'house-style.md');
  assert.equal(await texts.first().inputValue(), 'Keep sentences short.\n');
  await button(dlg, 'Save and harmonize').click();
  await dlg.getByRole('alert').getByText('Nothing changed: edit, add or remove a file first.', { exact: true }).waitFor();
  await button(dlg, 'Add file').click();
  await until(async () => (await focused(page))?.placeholder === 'house-style.md' && (await names.nth(1).evaluate(e => e === document.activeElement)), 'the new file takes the focus');
  await names.nth(1).fill('notes.txt');
  await texts.nth(1).fill('Friendly.');
  await button(dlg, 'Save and harmonize').click();
  await dlg.getByRole('alert').getByText('An instruction file is Markdown: its name ends in .md (notes.txt)', { exact: true }).waitFor();
  await names.nth(1).fill('team/tone.md');
  await page.screenshot({ path: shots + '/write-instructions.png' });
  await button(dlg, 'Save and harmonize').click();
  await dlg.waitFor({ state: 'detached' });
  let [job] = await callsOf(app, 'project_job');
  assert.equal(job.operation, 'instructions');
  assert.equal(job.step, 'patch');
  assert.deepEqual(job.instructions, [{ path: 'team/tone.md', text: 'Friendly.' }], 'the file that did not change is not sent');
  await finish(page);
  await versionShown(page, '0.5.1');
  await until(() => button(page, 'Instructions…').isEnabled(), 'Instructions… comes back');
  await button(page, 'Instructions…').click();
  await dlg.getByRole('heading', { name: 'Your instructions' }).waitFor();
  assert.equal(await names.count(), 2, 'the project read again holds the file the run wrote');
  await button(dlg, 'Remove file house-style.md').click();
  assert.equal(await names.count(), 1);
  await until(async () => (await focused(page))?.text === 'Add file', 'the focus goes to Add file');
  await texts.first().fill('Friendly and short.');
  await button(dlg, 'Save and harmonize').click();
  await dlg.waitFor({ state: 'detached' });
  job = (await callsOf(app, 'project_job'))[1];
  assert.deepEqual(job.instructions, [{ path: 'house-style.md', text: null }, { path: 'team/tone.md', text: 'Friendly and short.' }]);
});

// ---------- what the runtime refuses ----------
await test('Codex as the agent: every change says what is needed before the run and cannot start; Escape closes the dialog', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
  await page.evaluate(() => window.behind.settings({ ai: { engine: 'harness', harness: 'codex', budget_usd: 0.5, api_base: '', model: '', api_key_env: 'MURO_API_KEY' }, agent: 'codex' }));
  await page.evaluate(() => window.shown?.());
  await button(page, 'Harmonize again…').click();
  const dlg = dialog(page);
  await dlg.getByRole('alert').getByText(NEEDS_CLAUDE, { exact: true }).waitFor();
  assert.equal(await button(dlg, 'Harmonize').isDisabled(), true);
  assert.equal(await button(dlg, 'Harmonize').getAttribute('title'), NEEDS_CLAUDE);
  await dlg.getByRole('textbox', { name: 'Your request', exact: true }).fill('Anything.');
  await dlg.getByRole('textbox', { name: 'Maximum budget (USD)', exact: true }).press('Enter');
  await page.keyboard.press('Escape');
  await dlg.waitFor({ state: 'detached' });
  await button(page, 'Add input…').click();
  await dlg.getByRole('alert').getByText(NEEDS_CLAUDE, { exact: true }).waitFor();
  await dlg.getByRole('textbox', { name: 'Input', exact: true }).fill('https://github.com/example/x');
  await dlg.getByRole('textbox', { name: 'Input', exact: true }).press('Enter');
  assert.equal(await button(dlg, 'Add input').isDisabled(), true);
  assert.equal((await callsOf(app, 'project_job')).length, 0, 'no run is asked for');
});

await test('A file changed behind the page: the runtime refuses the change in its words, the dialog stays open with what was typed, and no run starts', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
  await button(page, 'Harmonize again…').click();
  const dlg = dialog(page);
  await dlg.getByRole('textbox', { name: 'Your request', exact: true }).fill('Keep the <b> & "quoted" names.');
  await page.evaluate(() => window.behind.touch('sample'));
  await button(dlg, 'Harmonize').click();
  await dlg.getByRole('alert').getByText(CHANGED, { exact: true }).waitFor();
  assert.equal(await dlg.getByRole('textbox', { name: 'Your request', exact: true }).inputValue(), 'Keep the <b> & "quoted" names.', 'what was typed is kept, as text');
  assert.equal((await callsOf(app, 'project_job')).length, 1, 'asked once, refused');
  assert.equal((await callsOf(app, 'project_job'))[0].request, 'Keep the <b> & "quoted" names.', 'sent as typed');
  assert.equal(await card(page).count(), 0, 'no run started');
  assert.equal(await button(dlg, 'Harmonize').isEnabled(), true, 'it can be asked again');
  await button(dlg, 'Cancel').click();
  await dlg.waitFor({ state: 'detached' });
});

if (failed.length) { console.error('FAILED:\n  ' + failed.join('\n  ')); process.exit(1); }
console.log('PASS: ' + done.join('; '));
