// The Sync page on Sigrid (plan R1, Task 2), on the fake transport (fake-transport.js): the note for each state of the sync, the table, its cells and its column
// heads, Check now, Review and Apply all, the review sheet (what is not ready, removals confirmed or left out, a failed apply, a plan refused because the registry
// moved under it), the status row and the palette, the arrows in the table, and the page at 1100, 500 and 250px. A port of the Imago window's tests/browser-sync.mjs
// and of the removal tests of its browser-harness.mjs (commit 5e33a82). What the plugin dialog, the harness inspector and the plugins outside the list do is tested
// with them (browser-sync-dialogs.mjs, browser-sync-harness.mjs); here only that a row and a column head open them.
//   node apps/desktop/tests/browser-sync.mjs        (MURO_UI_PORT moves the dev server off 1422; MURO_ONLY=<words> runs the tests whose name holds them)
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

// ---------- where things are ----------
const content = page => page.locator('main[data-slot="app-shell-content"]');
const status = page => page.locator('[data-slot="app-shell-status"]');
const foot = page => page.locator('[data-slot="app-shell-footer"]');
/** The note on top of the page, its title and its sentence; `data-kind` is the state it says (words.ts `NoteKind`). */
const note = page => page.locator('#sync-state');
const noteTitle = page => page.locator('#sync-state-title');
const noteText = page => page.locator('#sync-state-text');
const kind = page => note(page).getAttribute('data-kind');
const titled = (page, text) => page.waitForFunction(t => document.querySelector('#sync-state-title')?.textContent === t, text);
/** The action bar, in the frame's action region; its one solid button is `data-variant="default"`. */
const bar = page => page.locator('[data-slot="app-shell-actions"]');
const barLabels = page => bar(page).locator('button').evaluateAll(buttons => buttons.map(b => b.textContent.trim()));
const solid = page => bar(page).locator('button[data-variant="default"]');
const checkNow = page => bar(page).getByRole('button', { name: 'Check now', exact: true });
const barButton = (page, name) => bar(page).getByRole('button', { name, exact: true });
/** The table: a row per plugin (its name is a button), a column head per harness (its name is a button). */
const rows = page => page.locator('#rows tr');
const row = (page, name) => rows(page).filter({ has: page.getByRole('button', { name, exact: true }) });
const cells = (page, name) => row(page, name).locator('td');
const head = (page, name) => page.locator('#sync-table th').filter({ has: page.getByRole('button', { name, exact: true }) });
/** The review sheet: Sigrid's dialog holding the sheet's content; its buttons are in the dialog's footer (the dialog's own × is named Close too). */
const sheet = page => page.locator('[data-slot="dialog-content"]').filter({ has: page.locator('[data-review-sheet]') });
const sheetFoot = page => sheet(page).locator('[data-slot="dialog-footer"]');
const sheetTitle = page => sheet(page).locator('[data-slot="dialog-title"]').textContent();
/** A dialog, a drawer or the docked inspector, whichever another file draws. */
const surface = page => page.locator('[data-slot="dialog-content"], [data-slot="sheet-content"], [data-slot="inspector"]:not([hidden])');
const notice = (page, text) => page.locator('[data-toasts]').getByText(text, { exact: true });
const actions = async app => (await app.calls()).map(c => c.action);
const callsOf = async (app, action) => (await app.calls()).filter(c => c.action === action);
const count = async (app, action) => (await callsOf(app, action)).length;
/** The words of the focused element as drawn (`innerText`: a waiting button keeps its other label in the DOM, hidden). */
const focusedText = page => page.evaluate(() => document.activeElement?.innerText?.trim() ?? null);
const focusOn = (page, text) => page.waitForFunction(t => document.activeElement?.innerText?.trim() === t, text);
/** The bar holds these buttons, once the requests that changed it are over. */
const barIs = (page, labels) => page.waitForFunction(l => [...document.querySelectorAll('[data-slot="app-shell-actions"] button')].map(b => b.innerText.trim()).join('|') === l.join('|'), labels);
/** The window has read the registry once: the footer says what it holds. */
const ready = page => foot(page).getByText(/in your list/).waitFor();
/** Nothing about the sync runs: no busy button in the bar, and the note says neither checking nor applying. */
const settled = page => page.waitForFunction(() => {
  const n = document.querySelector('#sync-state');
  return !document.querySelector('[data-slot="app-shell-actions"] [aria-busy="true"]') && (!n || !['checking', 'applying'].includes(n.getAttribute('data-kind')));
});
/** Check now, and wait for what it found. */
async function check(app) {
  const before = await count(app, 'check');
  await checkNow(app.page).click();
  await app.page.waitForFunction(n => window.calls.filter(c => c.action === 'check').length > n, before);
  await settled(app.page);
}
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
/** The buttons of `selector` that are drawn past an edge of the window, by their words. */
const outside = (page, selector) => page.evaluate(s => [...document.querySelectorAll(s)].filter(e => {
  const r = e.getBoundingClientRect();
  return r.width > 0 && (r.left < -0.5 || r.right > window.innerWidth + 0.5);
}).map(e => e.textContent.trim()), selector);

// ---------- the note, Check now and the action bar ----------
await test('the note before and after a check: opening the page checks nothing, Check now leads, then Review and Apply all', 'changes', {}, async app => {
  const { page } = app;
  await ready(page);
  await titled(page, 'Not checked yet');
  assert.equal(await kind(page), 'not-checked');
  assert.equal(await noteText(page).textContent(), 'Check now to compare your list with what is installed and to look for new versions. Nothing changes until you apply.');
  assert.match(await note(page).textContent(), /Last check never · Last sync never · Automatic sync off/);
  assert.deepEqual(await barLabels(page), ['Check now'], 'only Check now before a check');
  assert.deepEqual(await solid(page).allTextContents(), ['Check now'], 'and it is what to do next');
  assert.deepEqual((await actions(app)).filter(a => a === 'plan' || a === 'check'), [], 'opening the page checks nothing');
  await page.screenshot({ path: shots + '/sync-not-checked.png' });
  await check(app);
  assert.equal(await noteTitle(page).textContent(), '1 change ready to apply');
  assert.equal(await noteText(page).textContent(), '1 update. Nothing changes until you apply.');
  assert.match(await note(page).textContent(), /Last check today/);
  assert.match(await status(page).textContent(), /1 change waiting/, 'the status row repeats it');
  assert.match(await status(page).textContent(), /Last check\s*today/);
  assert.match(await foot(page).textContent(), /Automatic sync off/);
  assert.deepEqual(await barLabels(page), ['Check now', 'Review', 'Apply all 1 change']);
  assert.deepEqual(await solid(page).allTextContents(), ['Apply all 1 change'], 'one solid button');
  const c = cells(page, 'Package');
  assert.match(await c.nth(0).textContent(), /github\.com\/example\/p1/, 'the source under the name');
  assert.equal(await c.nth(1).textContent(), 'v2Latest release', 'the latest version with the update policy');
  assert.equal(await c.nth(2).textContent(), 'Update 1 → 2', 'the cell says what a sync changes there');
  await head(page, 'Codex isolated test').getByRole('button', { name: 'Sync 1 change', exact: true }).waitFor();
  await page.screenshot({ path: shots + '/sync-dark.png' });
});

await test('a harness column offers its own changes, and its plan is not the note\'s', 'two-harnesses', {}, async app => {
  const { page } = app;
  await ready(page);
  await check(app);
  assert.equal(await noteTitle(page).textContent(), '2 changes ready to apply');
  const own = page.locator('#sync-table thead').getByRole('button', { name: 'Sync 1 change', exact: true });
  assert.equal(await own.count(), 2, 'one for each harness');
  await own.first().click();
  await sheet(page).waitFor();
  assert.equal(await sheetTitle(page), 'Sync Codex isolated test');
  assert.deepEqual((await app.calls()).at(-1), { action: 'plan', payload: { target_id: 't1' } });
  assert.equal(await sheet(page).locator('[data-operation]').count(), 1, 'the sheet lists only this harness');
  await sheet(page).getByText('Only the changes of this harness. Nothing changes until you apply.').waitFor();
  await page.keyboard.press('Escape');
  await sheet(page).waitFor({ state: 'detached' });
  assert.equal(await noteTitle(page).textContent(), '2 changes ready to apply', 'a one-harness plan is not the plan of the note');
  await barButton(page, 'Apply all 2 changes').waitFor();
  await focusOn(page, 'Sync 1 change');
  assert.equal(await page.evaluate(() => !!document.activeElement?.closest('th')), true, 'focus goes back to where the sheet was opened');
});

await test('Apply all asks for a fresh plan, applies it at once when it is what the note showed, and plans again', 'changes', {}, async app => {
  const { page } = app;
  await ready(page);
  await check(app);
  const before = (await app.calls()).length;
  await barButton(page, 'Apply all 1 change').click();
  await titled(page, 'Everything is in sync');
  const after = (await app.calls()).slice(before);
  assert.deepEqual(after.map(c => c.action), ['plan', 'apply', 'plan'], 'a fresh plan, the apply, then the plan the note reads');
  assert.deepEqual(after[0].payload, {}, 'a whole plan');
  assert.deepEqual(Object.keys(after[1].payload), ['plan_id'], 'no allow_blocked without blockers, no removal to confirm');
  assert.equal(after[1].payload.plan_id, 'plan-2', 'the fresh plan, not the one of the check');
  assert.equal(await sheet(page).count(), 0, 'nothing to review: it was the plan the note showed');
  assert.equal(await cells(page, 'Package').nth(2).textContent(), '2', 'the cell shows the installed version');
  await head(page, 'Codex isolated test').getByText('In sync', { exact: true }).waitFor();
  await notice(page, '1 change applied.').waitFor();
  assert.match(await foot(page).textContent(), /last sync\s*today/);
  assert.match(await status(page).textContent(), /In sync/);
  await barIs(page, ['Check now']);
  assert.equal(await solid(page).count(), 0, 'in sync, nothing leads');
});

// ---------- the states of the note ----------
await test('with blockers Apply all opens the review sheet, which says what is not ready; its Apply sends allow_blocked and the notice counts what was left out', 'changes', {}, async app => {
  const { page } = app;
  await ready(page);
  await app.flags({ blockPlan: true });
  await check(app);
  assert.equal(await noteText(page).textContent(), '1 update · 1 item not ready yet. Nothing changes until you apply.');
  await barButton(page, 'Apply all 1 change').click();
  await sheet(page).waitFor();
  assert.equal(await sheetTitle(page), 'Review changes');
  await sheet(page).getByRole('heading', { name: 'Not ready yet' }).waitFor();
  await sheet(page).getByText('Codex isolated test: Inventory incomplete', { exact: true }).waitFor();
  await sheet(page).getByText('It is left out of this sync.', { exact: true }).waitFor();
  const update = sheet(page).locator('[data-operation="update"]');
  assert.match(await update.textContent(), /Package/);
  assert.match(await update.textContent(), /1 → 2 · Reconcile desired artifact/, 'the versions and the reason');
  assert.equal((await actions(app)).includes('apply'), false, 'nothing is applied before the sheet\'s Apply');
  await focusOn(page, 'Apply 1 change');
  await page.screenshot({ path: shots + '/sync-review.png' });
  await sheetFoot(page).getByRole('button', { name: 'Apply 1 change', exact: true }).click();
  await sheet(page).waitFor({ state: 'detached' });
  const apply = await callsOf(app, 'apply');
  assert.equal(apply.length, 1);
  assert.equal(apply[0].payload.allow_blocked, true);
  await notice(page, '1 change applied. 1 left out.').waitFor();
  await titled(page, 'Some plugins are not ready');
});

await test('a plan with nothing ready: the note says what is not ready, Review leads to a sheet with no Apply', 'unlisted', {}, async app => {
  const { page } = app;
  await ready(page);
  await app.flags({ blockPlan: true });
  await check(app);
  assert.equal(await kind(page), 'blocked');
  assert.equal(await noteTitle(page).textContent(), 'Some plugins are not ready');
  assert.equal(await noteText(page).textContent(), 'Codex isolated test: Inventory incomplete. Muro leaves them out until they are fixed.');
  assert.deepEqual(await barLabels(page), ['Check now', 'Review']);
  assert.deepEqual(await solid(page).allTextContents(), ['Check now']);
  await barButton(page, 'Review').click();
  await sheet(page).getByRole('heading', { name: 'Not ready yet' }).waitFor();
  assert.equal(await sheetFoot(page).getByRole('button', { name: /^Apply/ }).count(), 0, 'nothing ready: no Apply');
  await sheet(page).getByText('No change is ready to apply.', { exact: true }).waitFor();
  await sheetFoot(page).getByRole('button', { name: 'Close', exact: true }).click();
  await sheet(page).waitFor({ state: 'detached' });
  assert.equal((await actions(app)).includes('apply'), false);
});

await test('a plugin without a build for a harness: its cell and its column say so, and the note never says in sync', 'projects', {}, async app => {
  const { page } = app;
  await ready(page);
  const c = cells(page, 'commit-helper');
  assert.equal(await c.nth(2).textContent(), '2.1.0', 'installed where it has a build');
  assert.equal(await c.nth(3).textContent(), 'Needs a build');
  await head(page, 'Codex').getByText('1 plugin needs a build', { exact: true }).waitFor();
  await head(page, 'Claude Code').getByText('In sync', { exact: true }).waitFor();
  await check(app);
  assert.equal(await kind(page), 'blocked');
  assert.match(await noteText(page).textContent(), /^Codex \/ commit-helper: no build for this harness/);
  assert.equal(await content(page).getByText('Everything is in sync').count(), 0);
});

await test('a harness that cannot be read is never in sync: the note names it, the column says so and its cells are unknown', 'changes', {}, async app => {
  const { page } = app;
  await ready(page);
  await app.flags({ unreadable: true });
  await check(app);
  assert.equal(await kind(page), 'unreadable');
  assert.equal(await noteTitle(page).textContent(), 'Codex isolated test cannot be read');
  assert.equal(await content(page).getByText('Everything is in sync').count(), 0);
  assert.deepEqual(await solid(page).allTextContents(), ['Check now'], 'checking again is what to do');
  await head(page, 'Codex isolated test').getByText('Cannot be read', { exact: true }).waitFor();
  assert.equal(await cells(page, 'Package').nth(2).textContent(), 'Unknown');
  await page.screenshot({ path: shots + '/sync-unreadable.png' });
});

await test('a source the check could not resolve is listed with the service\'s words, and the plan stays', 'changes', {}, async app => {
  const { page } = app;
  await ready(page);
  await app.flags({ checkErrors: true });
  await check(app);
  const errors = page.locator('#check-errors');
  await errors.getByText('1 source could not be checked', { exact: true }).waitFor();
  assert.match(await errors.textContent(), /Package: Source unreachable: could not resolve the release/);
  assert.equal(await noteTitle(page).textContent(), '1 change ready to apply', 'the plan stays');
  assert.match(await noteText(page).textContent(), /1 source could not be checked/);
});

await test('with nothing to apply, a source that could not be resolved replaces "in sync"; the next check that resolves it takes the list away', 'unlisted', {}, async app => {
  const { page } = app;
  await ready(page);
  await app.flags({ checkErrors: true });
  await check(app);
  assert.equal(await kind(page), 'sources');
  assert.equal(await noteTitle(page).textContent(), '1 source could not be checked');
  assert.equal(await noteText(page).textContent(), 'Muro could not resolve it, so it cannot say it is up to date. Check again when it answers.');
  assert.equal(await content(page).getByText('Everything is in sync').count(), 0);
  assert.deepEqual(await solid(page).allTextContents(), ['Check now']);
  assert.match(await status(page).textContent(), /Sources not checked/);
  await app.flags({ checkErrors: false });
  await check(app);
  await titled(page, 'Everything is in sync');
  assert.equal(await page.locator('#check-errors').count(), 0, 'the list is of the last check');
});

await test('a check this window did not make: the note says what the service recorded, a column that cannot show where says to check, and Apply all with a removal opens the sheet', 'recorded-unseen', {}, async app => {
  const { page } = app;
  await ready(page);
  await titled(page, '1 change ready to apply');
  await head(page, 'Codex isolated test').getByText('Check to see the changes', { exact: true }).waitFor();
  assert.deepEqual(await barLabels(page), ['Check now', 'Review', 'Apply all 1 change']);
  assert.equal(await count(app, 'plan'), 0, 'the record is read, no plan is made');
  await barButton(page, 'Apply all 1 change').click();
  await sheet(page).waitFor();
  await sheetFoot(page).getByRole('button', { name: 'Apply and uninstall 1 plugin', exact: true }).waitFor();
  assert.equal(await sheetFoot(page).getByRole('button', { name: 'Apply without uninstalling' }).count(), 0, 'a plan of removals only has nothing to apply without them');
  await sheet(page).getByText('1 plugin will be uninstalled.', { exact: true }).waitFor();
  await focusOn(page, 'Cancel');
  assert.equal((await actions(app)).includes('apply'), false, 'looking is not applying');
  await page.keyboard.press('Escape');
  await sheet(page).waitFor({ state: 'detached' });
  assert.equal((await actions(app)).includes('apply'), false);
});

// ---------- removals (ADR-0029) ----------
// The plan of the scenario `removals`: 1 install, 1 uninstall and 1 record whose files are gone.
await test('Apply all on a plan with removals opens the sheet and applies nothing; Apply without uninstalling applies the install and leaves the removals', 'removals', {}, async app => {
  const { page } = app;
  await ready(page);
  await check(app);
  assert.equal(await noteText(page).textContent(), '1 install, 2 removals. Nothing changes until you apply.');
  await barButton(page, 'Apply all 3 changes').click();
  await sheet(page).waitFor();
  await sheetFoot(page).getByRole('button', { name: 'Apply, uninstall 1 and clear 1 without files', exact: true }).waitFor();
  assert.equal((await actions(app)).includes('apply'), false, 'Apply all asked for a fresh plan and applied nothing');
  await sheet(page).locator('[data-operation="install"]').getByText('Install', { exact: true }).waitFor();
  assert.equal(await sheet(page).locator('[data-operation="remove"]').count(), 2);
  assert.match(await sheet(page).locator('[data-operation="remove"]').filter({ hasText: 'ghost' }).textContent(), /files missing/);
  await sheet(page).getByText('1 plugin will be uninstalled and 1 record without files cleared.', { exact: true }).waitFor();
  await focusOn(page, 'Cancel');
  await page.screenshot({ path: shots + '/sync-removals-review.png' });
  await sheetFoot(page).getByRole('button', { name: 'Apply without uninstalling', exact: true }).click();
  await sheet(page).waitFor({ state: 'detached' });
  const sent = (await callsOf(app, 'apply')).at(-1).payload;
  assert.deepEqual(Object.keys(sent).sort(), ['plan_id', 'skip_removals']);
  assert.equal(sent.skip_removals, true);
  await notice(page, '1 change applied. 2 removals left out.').waitFor();
  await titled(page, '2 changes ready to apply');
});

await test('the main button of a review with removals confirms their number and removes them', 'removals', {}, async app => {
  const { page } = app;
  await ready(page);
  await check(app);
  await barButton(page, 'Apply all 3 changes').click();
  await sheetFoot(page).getByRole('button', { name: 'Apply, uninstall 1 and clear 1 without files', exact: true }).click();
  await sheet(page).waitFor({ state: 'detached' });
  const sent = (await callsOf(app, 'apply')).at(-1).payload;
  assert.deepEqual(Object.keys(sent).sort(), ['confirm_removals', 'plan_id']);
  assert.equal(sent.confirm_removals, 2, 'the number of removals of the plan');
  await notice(page, '3 changes applied.').waitFor();
  await titled(page, 'Everything is in sync');
});

// ---------- an apply that runs, fails or is refused ----------
await test('a check and an apply say that they run; a sheet that applies cannot be dismissed', 'changes', {}, async app => {
  const { page } = app;
  await ready(page);
  await app.flags({ checkDelay: 600 });
  await checkNow(page).click();
  await titled(page, 'Checking sources and harnesses…');
  assert.equal(await checkNow(page).getAttribute('aria-busy'), 'true');
  await status(page).getByText('Checking…', { exact: true }).waitFor();
  assert.equal(await focusedText(page), 'Check now', 'the button keeps the focus while it waits');
  await settled(page);
  assert.equal(await noteTitle(page).textContent(), '1 change ready to apply');
  assert.equal(await focusedText(page), 'Check now');
  await app.flags({ checkDelay: 0, blockPlan: true, applyDelay: 800 });
  await barButton(page, 'Apply all 1 change').click();
  await sheetFoot(page).getByRole('button', { name: 'Apply 1 change', exact: true }).click();
  const busy = sheetFoot(page).getByRole('button', { name: 'Applying 1 change…', exact: true });
  await busy.waitFor();
  assert.equal(await busy.getAttribute('aria-busy'), 'true');
  await titled(page, 'Applying 1 change…');
  await status(page).getByText('Applying 1 change…', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await sheet(page).count(), 1, 'Escape does not close a sheet that is applying');
  await sheet(page).waitFor({ state: 'detached' });
  await notice(page, '1 change applied. 1 left out.').waitFor();
});

await test('a failed apply keeps the sheet open with the error in it, reads the registry and the plan again, and can try again', 'changes', {}, async app => {
  const { page } = app;
  await ready(page);
  await app.flags({ blockPlan: true, rejectApply: true });
  await check(app);
  await barButton(page, 'Apply all 1 change').click();
  const apply = sheetFoot(page).getByRole('button', { name: 'Apply 1 change', exact: true });
  await apply.click();
  await sheet(page).getByRole('alert').filter({ hasText: 'The harness refused the change' }).waitFor();
  assert.deepEqual((await actions(app)).slice(-3), ['apply', 'snapshot', 'plan'], 'the registry and the plan are read again after a refusal');
  assert.equal(await apply.getAttribute('aria-busy'), null, 'the sheet can try again');
  assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[data-slot="dialog-content"]')), true, 'focus stays in the sheet');
  assert.equal(await page.locator('[data-toasts]').getByText(/did not complete/).count(), 0, 'the error is the sheet\'s: no notice over its buttons');
  await app.flags({ rejectApply: false });
  await apply.click();
  await sheet(page).waitFor({ state: 'detached' });
  const sent = await callsOf(app, 'apply');
  assert.equal(sent.length, 2);
  assert.equal(sent[1].payload.plan_id, 'plan-3', 'the second try sends the plan made after the refusal');
  await notice(page, '1 change applied. 1 left out.').waitFor();
});

await test('a plan made before the registry moved under the window is refused, made again and shown, and the next Apply sends the new one', 'changes', {}, async app => {
  const { page } = app;
  await ready(page);
  await check(app);
  await barButton(page, 'Review').click();
  await sheet(page).waitFor();
  const first = (await callsOf(app, 'plan')).length;
  // The background worker or the tray saves the registry: the window is not told.
  await page.evaluate(() => window.behind.bump());
  const apply = sheetFoot(page).getByRole('button', { name: 'Apply 1 change', exact: true });
  const before = (await app.calls()).length;
  await apply.click();
  await sheet(page).getByRole('alert').filter({ hasText: 'Registry revision changed' }).waitFor();
  const refused = (await app.calls()).slice(before);
  assert.deepEqual(refused.map(c => c.action), ['apply', 'snapshot', 'plan'], 'nothing applied in part: the registry and the plan are read again');
  assert.equal(refused[0].payload.plan_id, `plan-${first + 1}`, 'the refused plan is the one the sheet showed');
  const again = (await app.calls()).length;
  await apply.click();
  await sheet(page).waitFor({ state: 'detached' });
  await titled(page, 'Everything is in sync');
  const after = (await app.calls()).slice(again);
  assert.deepEqual(after.map(c => c.action), ['apply', 'plan']);
  assert.equal(after[0].payload.plan_id, `plan-${first + 2}`, 'the plan made after the refusal');
  await notice(page, '1 change applied.').waitFor();
});

// ---------- the table ----------
await test('the table: a row per plugin with its source, version and policy, a cell per harness, a column head per harness; the arrows move between the rows', 'demo', {}, async app => {
  const { page } = app;
  await ready(page);
  await check(app);
  assert.equal(await rows(page).count(), 5);
  const m = cells(page, 'Sample');
  assert.match(await m.nth(0).textContent(), /github\.com\/owner\/sample/);
  assert.equal(await m.nth(0).locator('[title="Sample"]').count(), 1, 'the whole name in its title');
  assert.equal(await m.nth(1).textContent(), 'v0.4.0Latest release');
  assert.equal(await m.nth(2).textContent(), 'Update 0.3.0 → 0.4.0');
  assert.equal(await m.nth(3).textContent(), '0.4.0');
  const t = cells(page, 'test-runner');
  assert.match(await t.nth(1).textContent(), /Pinned version/);
  assert.equal(await t.nth(4).textContent(), 'Install 1.0.4');
  assert.equal(await cells(page, 'docs-writer').nth(4).textContent(), 'Needs a build');
  const s = cells(page, 'sql-companion');
  assert.equal(await s.nth(1).textContent(), 'Not checkedLatest commit', 'no version yet, on the latest commit');
  assert.equal(await s.nth(2).getByRole('img', { name: 'Not installed here' }).textContent(), '—');
  await head(page, 'Claude Code').getByRole('button', { name: 'Sync 2 changes', exact: true }).waitFor();
  await head(page, 'Codex').getByText('In sync', { exact: true }).waitFor();
  await head(page, 'OpenCode').getByRole('button', { name: 'Sync 1 change', exact: true }).waitFor();
  await head(page, 'OpenCode').getByText('1 plugin needs a build', { exact: true }).waitFor();
  assert.equal(await noteText(page).textContent(), '1 install, 1 update, 1 removal · 1 item not ready yet. Nothing changes until you apply.');
  // The rows are one tab stop, and the arrows move between them.
  const name = n => page.locator('#rows').getByRole('button', { name: n, exact: true });
  assert.equal(await page.locator('#rows [data-row-button][tabindex="0"]').count(), 1);
  await name('Sample').focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await focusedText(page), 'commit-helper');
  await page.keyboard.press('End');
  assert.equal(await focusedText(page), 'sql-companion');
  await page.keyboard.press('ArrowDown');
  assert.equal(await focusedText(page), 'sql-companion', 'the last row stays the last');
  await page.keyboard.press('Home');
  assert.equal(await focusedText(page), 'Sample');
  await page.keyboard.press('ArrowUp');
  assert.equal(await focusedText(page), 'Sample');
  await page.keyboard.press('ArrowDown');
  assert.equal(await name('commit-helper').getAttribute('tabindex'), '0', 'the tab stop follows the focus');
  assert.equal(await name('Sample').getAttribute('tabindex'), '-1');
  await page.screenshot({ path: shots + '/sync-table.png' });
});

await test('a row opens its plugin and gives the focus back to it; a column head opens its harness', 'changes', {}, async app => {
  const { page } = app;
  await ready(page);
  await page.locator('#rows').getByRole('button', { name: 'Package', exact: true }).click();
  await surface(page).first().waitFor();
  await page.keyboard.press('Escape');
  await page.locator('[data-slot="dialog-content"], [data-slot="sheet-content"]').first().waitFor({ state: 'detached' });
  await focusOn(page, 'Package');
  await head(page, 'Codex isolated test').getByRole('button', { name: 'Codex isolated test', exact: true }).click();
  await surface(page).first().waitFor();
  assert.deepEqual((await actions(app)).filter(a => a === 'plan' || a === 'check' || a === 'apply'), [], 'opening asks for no plan');
});

// ---------- an empty registry ----------
await test('no harness is managed: the page says so where the note would be, with Add harness', 'first-run', {}, async app => {
  const { page } = app;
  await ready(page);
  await content(page).getByText('No harness is managed', { exact: true }).waitFor();
  assert.equal(await content(page).getByRole('button', { name: 'Add harness', exact: true }).count(), 1, 'once on the page');
  assert.equal(await page.locator('#sync-table').count(), 0);
  assert.equal(await note(page).count(), 0);
  assert.deepEqual(await barLabels(page), ['Check now']);
  assert.match(await status(page).textContent(), /No harness/);
  await content(page).getByRole('button', { name: 'Add harness', exact: true }).click();
  await page.locator('[data-slot="dialog-content"], [data-slot="sheet-content"]').first().waitFor();
});

await test('an empty list says so where the table would be, with Add plugin once', 'default', {}, async app => {
  const { page } = app;
  await ready(page);
  await content(page).getByText('Your list is empty', { exact: true }).waitFor();
  assert.equal(await content(page).getByRole('button', { name: 'Add plugin', exact: true }).count(), 1);
  assert.equal(await content(page).getByRole('button', { name: 'Add harness', exact: true }).count(), 1);
  await titled(page, 'Not checked yet');
});

// ---------- the palette ----------
await test('Check now in the command palette checks from another page, and the status row says what it found', 'changes', {}, async app => {
  const { page } = app;
  await ready(page);
  await page.locator('[data-slot="toolbar-tab"]').filter({ hasText: /^Projects$/ }).click();
  await page.keyboard.press('Control+k');
  const option = page.locator('[data-slot="command-palette"]').getByRole('option').filter({ hasText: 'Check now' });
  await option.waitFor();
  assert.notEqual(await option.getAttribute('aria-disabled'), 'true', 'it is there and works');
  await option.click();
  await page.waitForFunction(() => window.calls.some(c => c.action === 'check'));
  await status(page).getByText('1 change waiting', { exact: true }).waitFor();
  assert.match(await status(page).textContent(), /Last check\s*today/);
});

// ---------- narrow windows ----------
for (const width of [1100, 500]) {
  await test(`at ${width}px nothing scrolls sideways, with the sheet open too, and every button of the bar and the sheet is in the window`, 'demo', { viewport: { width, height: 900 } }, async app => {
    const { page } = app;
    await ready(page);
    await check(app);
    assert.ok(await sideways(page) <= 0, `the page scrolls ${await sideways(page)}px sideways`);
    assert.deepEqual(await outside(page, '[data-slot="app-shell-actions"] button'), []);
    await barButton(page, 'Review').click();
    await sheet(page).waitFor();
    assert.ok(await sideways(page) <= 0, 'and with the sheet open');
    assert.deepEqual(await outside(page, '[data-slot="dialog-content"] button'), []);
    await page.screenshot({ path: `${shots}/sync-${width}.png` });
  });
}

await test('a window of 500 at 200% zoom (250): the action bar wraps inside the window, the primary action too, and the sheet fits', 'demo', { viewport: { width: 250, height: 700 } }, async app => {
  const { page } = app;
  await ready(page);
  await check(app);
  assert.ok(await sideways(page) <= 0, `the page scrolls ${await sideways(page)}px sideways`);
  await bar(page).getByRole('button', { name: /^Apply all/ }).waitFor();
  assert.deepEqual(await outside(page, '[data-slot="app-shell-actions"] button'), [], 'Check now, Review and Apply all are in the window');
  await barButton(page, 'Review').click();
  await sheet(page).waitFor();
  assert.ok(await sideways(page) <= 0);
  assert.deepEqual(await outside(page, '[data-slot="dialog-content"] button'), []);
  await page.screenshot({ path: shots + '/sync-250.png' });
});

if (failed.length) { console.error('FAILED:\n  ' + failed.join('\n  ')); process.exit(1); }
console.log('PASS: ' + done.join('; '));
