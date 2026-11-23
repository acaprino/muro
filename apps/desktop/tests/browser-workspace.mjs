// Plan R0, Task 5: the Projects tab on Sigrid, on the fake transport (fake-transport.js). The list of project files and the workspace of the open one: the panel
// at the left (inputs, examples, records, runs), the decision graph at the centre with its entries closed until opened, the details in the inspector, the actions
// of the editor at the foot (disabled until it exists). A documented example and the AI's validated answer are the only things that light a branch; an input
// lights what its decisions target. Nothing is matched by words.
//   node apps/desktop/tests/browser-workspace.mjs        (MURO_UI_PORT moves the dev server off 1422)
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
const texts = loc => loc.evaluateAll(elements => elements.map(e => e.textContent.trim()));
const kept = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('muro.project') ?? 'null'));
/** The window has read the registry once: the footer says what it holds. */
const ready = page => page.locator('[data-slot="app-shell-footer"]').getByText(/in your list/).waitFor();
/** The tabs are Sigrid's `ToolbarTab`s, in the title bar or in the row under it on a narrow window: buttons marked `aria-current="page"`, not `role=tab`. */
const tab = (page, name) => page.locator('[data-slot="toolbar-tab"]').filter({ hasText: new RegExp(`^${name}$`) });
const goProjects = async page => { await ready(page); await tab(page, 'Projects').click(); };
const openMarionette = async page => {
  await goProjects(page);
  await page.getByRole('button', { name: 'Marionette', exact: true }).click();
  await page.getByRole('heading', { name: 'Marionette', level: 1 }).waitFor();
};
const panelOf = page => page.locator('section[aria-label="Project panel"]');
const graphPane = page => page.locator('section[aria-labelledby="graph-heading"]');
const canvas = (page, name = 'Marionette') => page.getByRole('tree', { name: `Decision graph of ${name}` });
const node = (page, id) => page.locator(`[data-slot="graph-node"][data-node-id="${id}"]`);
const DESIGN = 'entry:0:marionette-design', OFFICE = 'entry:1:marionette-office';
/** The inspector while it shows something: docked (an `aside`, `hidden` when closed) or, under 1000px, a panel over the end of the graph. */
const inspector = page => page.locator('[data-inspector-form]:not([hidden])');
const segment = (page, name) => page.locator('[data-slot="toggle-group-item"]').filter({ hasText: new RegExp(`^${name}$`) });
const row = (page, title) => page.locator('[data-slot="item-row"]').filter({ has: page.locator('[data-slot="item-row-title"]', { hasText: new RegExp(`^${title}$`) }) });
/** The bar at the foot of the workspace: the nearest block around Add input…, whose buttons each sit in a span that carries their hint. */
const actionBar = page => page.getByRole('button', { name: 'Add input…', exact: true }).locator('xpath=ancestor::div[1]');
const notice = (page, text) => page.locator('[data-toasts]').getByText(text, { exact: true });
/** How far the page scrolls sideways, and how far the content region would. */
const sideways = page => page.evaluate(() => {
  const main = document.querySelector('main[data-slot="app-shell-content"]');
  return Math.max(document.documentElement.scrollWidth - window.innerWidth, main ? main.scrollWidth - main.clientWidth : 0);
});
const frames = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
/** Every control and field of the window that has no name. */
const unnamed = page => page.evaluate(() => [...document.querySelectorAll('button, [role=switch], [role=tab], [role=treeitem], textarea, input:not([type=hidden])')].filter(e => {
  const by = e.getAttribute('aria-labelledby');
  return !(e.getAttribute('aria-label') || (by && by.split(/\s+/).some(id => document.getElementById(id)?.textContent.trim())) || e.textContent.trim() || e.labels?.length);
}).map(e => e.outerHTML.slice(0, 120)));

// ---------- the list ----------
await test('the list says what each project is, what is installed as published, and opening one shows the three regions side by side', 'projects', {}, async app => {
  const { page } = app;
  await goProjects(page);
  const line = page.getByRole('table', { name: 'Projects' }).getByRole('row').filter({ hasText: 'Marionette' });
  await line.waitFor();
  const text = await line.textContent();
  for (const fact of ['0.5.0', 'Included with Muro', 'D:/Muro/data/projects/marionette.mp', '3 inputs · 4 capabilities']) assert.ok(text.includes(fact), `the row says ${fact}: ${text}`);
  assert.equal(await page.getByRole('button', { name: /^Remove .* from the list$/ }).count(), 0, 'the project Muro ships stays in the list');
  await page.getByRole('heading', { name: /Installed as published/, level: 2 }).waitFor();
  assert.match(await page.getByRole('list', { name: 'Installed as published' }).textContent(), /commit-helper.*Needs a build for Codex/);
  assert.equal(await page.getByText(/New project|Create a project/).count(), 0, 'the write side is a later plan');
  await page.screenshot({ path: shots + '/workspace-list.png' });
  await page.getByRole('button', { name: 'Marionette', exact: true }).click();
  await page.getByRole('heading', { name: 'Marionette', level: 1 }).waitFor();
  assert.deepEqual((await callsOf(app, 'project')).map(c => c.payload), [{ id: 'marionette' }]);
  await canvas(page).waitFor();
  assert.equal(await inspector(page).count(), 0, 'nothing selected: the inspector is closed and the graph takes its room');
  await row(page, 'A landing page').click();
  await inspector(page).getByRole('heading', { name: 'Documented example', level: 2 }).waitFor();
  assert.equal(await inspector(page).getAttribute('data-inspector-form'), 'docked', 'at 1512px the inspector is docked');
  const [left, centre, right] = await Promise.all([panelOf(page).boundingBox(), graphPane(page).boundingBox(), inspector(page).boundingBox()]);
  assert.ok(left && centre && right && left.width > 0 && centre.width > 0 && right.width > 0, 'three regions in sight');
  assert.ok(left.x + left.width <= centre.x + 1 && centre.x + centre.width <= right.x + 1, 'the panel, the graph and the details side by side, none over another');
  assert.ok(await sideways(page) <= 0);
  await page.screenshot({ path: shots + '/workspace-1512.png' });
});

await test('Remove from list asks first and removes only the entry; a project named with <, & and quotes is shown as text', 'projects', {}, async app => {
  const { page } = app;
  const odd = '<b>Odd & "quoted"';
  await app.flags({ pickPath: `D:/Notes/${odd}.mp` });
  await goProjects(page);
  await page.getByRole('button', { name: 'Open project file…', exact: true }).click();
  await notice(page, `${odd} added to your list.`).waitFor();
  assert.deepEqual((await app.calls()).filter(c => ['pick_file', 'open_project'].includes(c.action)).map(c => [c.action, c.payload]), [['pick_file', { filter: 'Muro project (*.mp)' }], ['open_project', { path: `D:/Notes/${odd}.mp` }]]);
  await page.getByRole('button', { name: odd, exact: true }).waitFor();
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('main b')].filter(b => b.textContent.includes('Odd')).length), 0, 'the name is text, not markup');
  const remove = page.getByRole('button', { name: `Remove ${odd} from the list`, exact: true });
  const dialog = page.locator('[data-slot="dialog-content"]');
  await remove.click();
  await dialog.getByText(`Remove ${odd} from your list?`, { exact: true }).waitFor();
  await dialog.getByText(`Only the entry goes: the file stays where it is (D:/Notes/${odd}.mp) and you can open it again.`, { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Cancel', 'the focus starts on Cancel');
  assert.equal((await callsOf(app, 'remove_project')).length, 0, 'nothing is removed before the person agrees');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: odd, exact: true }).waitFor();
  await remove.click();
  await dialog.getByRole('button', { name: `Remove ${odd}`, exact: true }).click();
  await notice(page, `${odd} removed from your list.`).waitFor();
  await page.getByRole('button', { name: odd, exact: true }).waitFor({ state: 'detached' });
  const asked = await callsOf(app, 'remove_project');
  assert.equal(asked.length, 1);
  assert.equal(asked[0].payload.id, odd.toLowerCase());
  assert.equal(typeof asked[0].payload.revision, 'number');
  assert.equal(await page.getByRole('table', { name: 'Projects' }).getByRole('button', { name: 'Marionette', exact: true }).count(), 1, 'the project Muro ships is what is left');
});

// ---------- the graph ----------
await test('the graph opens with every entry closed, each saying how many it hides; an entry opens to show its capabilities', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await canvas(page).waitFor();
  await node(page, DESIGN).waitFor();
  assert.equal(await node(page, DESIGN).getAttribute('aria-label'), 'design, closed, hides 2');
  assert.equal(await node(page, OFFICE).getAttribute('aria-label'), 'office, closed, hides 2');
  assert.equal(await page.locator('[data-slot="graph-node"][data-node-id^="cap:"]').count(), 0, 'no capability in sight while every entry is closed');
  await node(page, DESIGN).getByRole('button', { name: 'Open design' }).click();
  await node(page, 'cap:design-taste').waitFor();
  await node(page, 'cap:design-review').waitFor();
  assert.equal(await node(page, DESIGN).getAttribute('aria-expanded'), 'true');
  await node(page, 'cap:design-review').click();
  await inspector(page).getByRole('heading', { name: 'Capability', level: 2 }).waitFor();
  const details = await inspector(page).textContent();
  for (const fact of ['design-review', 'worker', 'marionette-design', 'Activates when the request means', 'Review a finished design', 'Not for: Building one', 'Runs design-taste first, on a condition', 'A design exists']) assert.ok(details.includes(fact), `the details say ${fact}`);
  await inspector(page).getByRole('button', { name: 'design-taste', exact: true }).click();
  await inspector(page).getByRole('heading', { name: 'design-taste', level: 3 }).waitFor();
  assert.match(await inspector(page).textContent(), /Comes from\s*taste-skill/);
  assert.match(await inspector(page).textContent(), /Produces\s*design-brief/);
});

await test('a graph the size of Marionette (37 capabilities, 15 entries): every entry closed, uncut and in sight at first (its scale is logged); an example opens the entries of its steps and numbers them', 'projects', {}, async app => {
  const { page } = app;
  await app.flags({ bigGraph: true });
  await openMarionette(page);
  await canvas(page).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('[data-slot="graph-node"]').length === 15);
  const entries = await page.locator('[data-slot="graph-node"]').evaluateAll(nodes => nodes.map(n => {
    const label = n.querySelector('.truncate'), box = n.getBoundingClientRect(), tree = n.closest('[role=tree]').getBoundingClientRect();
    return { id: n.getAttribute('data-node-id'), name: n.getAttribute('aria-label'), expanded: n.getAttribute('aria-expanded'), clipped: label.scrollWidth > label.clientWidth + 0.5, inside: box.left >= tree.left - 0.5 && box.right <= tree.right + 0.5 && box.top >= tree.top - 0.5 && box.bottom <= tree.bottom + 0.5 };
  }));
  assert.equal(entries.length, 15);
  for (const e of entries) {
    const n = Number(/^group-(\d+),/.exec(e.name)?.[1]);
    assert.equal(e.name, `group-${n}, closed, hides ${n <= 7 ? 3 : 2}`, 'closed, with the number of its own capabilities');
    assert.equal(e.expanded, 'false');
    assert.equal(e.clipped, false, `${e.name}: its name is not cut`);
    assert.equal(e.inside, true, `${e.name}: in sight inside the canvas`);
  }
  // How large the first view draws a thing: Sigrid fits the whole graph (15 entries in one rank, never above 1). Logged, not asserted: the app cannot choose the fit.
  const scale = await page.locator('[data-slot="graph-node"]').first().evaluate(n => n.getBoundingClientRect().width / 208);
  console.log(`bigGraph, first view at 1512x982: scale ${scale.toFixed(2)}, a 14px name drawn at ${(14 * scale).toFixed(1)}px`);
  await page.screenshot({ path: shots + '/workspace-graph-large.png' });
  const long = 'a-capability-whose-name-is-far-longer-than-any-other-capability-of-this-project-' + 'x'.repeat(30);
  await row(page, 'Two of many').click();
  await inspector(page).getByRole('heading', { name: 'Two of many', level: 3 }).waitFor();
  assert.deepEqual(await texts(inspector(page).locator('ol[aria-label="Steps, in order"] > li').locator('xpath=./div/div/*[1]')), [long, 'capability-37-design-system']);
  await page.waitForFunction(() => document.querySelectorAll('[data-slot="graph-node"][aria-expanded="true"]').length === 2);
  assert.equal(await node(page, 'entry:5:marionette-group-6').getAttribute('aria-expanded'), 'true', 'the entry of step 1 is open');
  assert.equal(await node(page, 'entry:6:marionette-group-7').getAttribute('aria-expanded'), 'true', 'the entry of step 2 is open');
  await canvas(page).getByRole('button', { name: 'Fit the view' }).click();
  await node(page, `cap:${long}`).getByText('step 1', { exact: true }).waitFor();
  await node(page, 'cap:capability-37-design-system').getByText('step 2', { exact: true }).waitFor();
  assert.ok(await sideways(page) <= 0, 'nothing widens the page');
  await page.screenshot({ path: shots + '/workspace-graph-large-example.png' });
});

// ---------- the examples and the simulator ----------
await test('each example says its request, its intents and its outputs; a click lights its path, opens its entry and shows its steps in the details', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  assert.equal(await segment(page, 'Examples').getAttribute('aria-pressed'), 'true', 'a project opens on its examples');
  const landing = row(page, 'A landing page'), letter = row(page, 'A letter');
  const lines = async r => texts(r.locator('[data-slot="item-row-description"] > span'));
  assert.deepEqual(await lines(landing), ['Design a landing page · With stack:react', 'Intent design-taste-intent → design-review-intent', 'Output design-brief']);
  assert.deepEqual(await lines(letter), ['Write a letter as a Word file', 'Intent office-docs-intent'], 'a prerequisite has no intent, and a step that makes nothing adds no output line');
  await landing.click();
  assert.equal(await landing.getAttribute('aria-current'), 'true');
  await inspector(page).getByRole('heading', { name: 'A landing page', level: 3 }).waitFor();
  const steps = inspector(page).locator('ol[aria-label="Steps, in order"] > li');
  assert.deepEqual(await texts(steps), ['1design-tastedesign-taste-intentIt designs a page.', '2design-reviewdesign-review-intentA finished design is checked.']);
  assert.match(await inspector(page).textContent(), /Produces\s*design-brief/);
  assert.match(await inspector(page).textContent(), /Design first, then review\./);
  await node(page, 'cap:design-taste').getByText('step 1', { exact: true }).waitFor();
  await node(page, 'cap:design-review').getByText('step 2', { exact: true }).waitFor();
  assert.equal(await node(page, DESIGN).getAttribute('aria-expanded'), 'true', 'the entry of the path is open');
  assert.equal(await node(page, OFFICE).getAttribute('aria-expanded'), 'false', 'the others stay closed');
  await graphPane(page).getByText('The steps of “A landing page” are numbered on the graph.', { exact: true }).waitFor();
  assert.equal((await callsOf(app, 'simulate')).length, 0, 'a documented example runs no AI');
  // A step of the details shows its capability, and the path stays lit.
  await inspector(page).getByRole('button', { name: 'Step 2: design-review', exact: true }).click();
  await inspector(page).getByRole('heading', { name: 'design-review', level: 3 }).waitFor();
  await inspector(page).getByText('Step 2 of the decision on the graph', { exact: true }).waitFor();
  assert.equal(await landing.getAttribute('aria-current'), 'true', 'looking at a capability keeps the example lit');
  await node(page, 'cap:design-taste').getByText('step 1', { exact: true }).waitFor();
  // Another example replaces it; the same one again, while it is shown, puts it out.
  await letter.click();
  await node(page, 'cap:office-docs').getByText('step 2', { exact: true }).waitFor();
  assert.equal(await node(page, DESIGN).getAttribute('aria-expanded'), 'false', 'the entries of the old path close');
  assert.equal(await landing.getAttribute('aria-current'), null);
  await letter.click();
  await inspector(page).waitFor({ state: 'detached' }).catch(() => inspector(page).waitFor({ state: 'hidden' }));
  assert.equal(await letter.getAttribute('aria-current'), null);
  assert.equal(await node(page, 'cap:office-docs').getByText('step 2', { exact: true }).count(), 0, 'nothing is numbered any more');
  // A capability reached from the details opens its entry, so the graph shows what the inspector shows.
  await node(page, 'cap:office-docs').click();
  await inspector(page).getByRole('heading', { name: 'office-docs', level: 3 }).waitFor();
  assert.match(await inspector(page).textContent(), /Always runs office-pdf first.*Never together with design-review/);
  assert.equal(await node(page, DESIGN).getAttribute('aria-expanded'), 'false');
  await inspector(page).getByRole('button', { name: 'design-review', exact: true }).click();
  await inspector(page).getByRole('heading', { name: 'design-review', level: 3 }).waitFor();
  await page.waitForFunction(id => document.querySelector(`[data-node-id="${id}"]`)?.getAttribute('aria-expanded') === 'true', DESIGN);
  await node(page, 'cap:design-review').waitFor();
  await page.screenshot({ path: shots + '/workspace-example.png' });
});

await test('the simulator: an empty request is refused in place, the note names the engine once, an answer lights its steps, and Cancel stops waiting', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  const box = page.getByRole('textbox', { name: 'Request to simulate' }), go = page.getByRole('button', { name: 'Simulate' });
  const note = page.getByText(/^Free-text requests use Claude Code on this computer, with its own credentials\. Each costs up to \$0\.50 a request\. Documented examples run no AI\.$/);
  await note.waitFor();
  await go.click();
  await page.locator('[data-slot="field-error"]').getByText('Write a request first.', { exact: true }).waitFor();
  assert.equal(await box.getAttribute('aria-invalid'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'TEXTAREA', 'the box has the focus');
  assert.equal((await callsOf(app, 'simulate')).length, 0);
  await box.fill('Write a letter');
  assert.equal(await page.locator('[data-slot="field-error"]').count(), 0, 'typing takes the error away');
  await go.click();
  const result = page.locator('section[aria-label="Project panel"] [role=status]').filter({ hasText: '“Write a letter”' });
  await result.getByText('2 steps', { exact: true }).waitFor();
  assert.deepEqual(await texts(result.locator('ol[aria-label="Steps, in order"] > li')), ['1office-pdfPrerequisiteA prerequisite the plugin declares, added before the step that needs it.', '2office-docsoffice-docs-intentThe request asks for a Word file.']);
  await result.getByText('Asked Claude Code · $0.12 · 4.2 s', { exact: true }).waitFor();
  const sent = (await callsOf(app, 'simulate')).at(-1).payload;
  assert.equal(sent.id, 'marionette'); assert.equal(sent.task, 'Write a letter'); assert.match(sent.run, /^[A-Za-z0-9_-]{1,64}$/);
  await node(page, 'cap:office-pdf').getByText('step 1', { exact: true }).waitFor();
  await node(page, 'cap:office-docs').getByText('step 2', { exact: true }).waitFor();
  assert.equal(await note.count(), 0, 'the note is said once in a session');
  await page.screenshot({ path: shots + '/workspace-simulation.png' });
  await app.flags({ simulateDelay: 20000 });
  await box.fill('Write another letter');
  await go.click();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.getAttribute('aria-busy') === 'true' && b.textContent.includes('Asking Claude Code…')));
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await notice(page, 'Stopped waiting for the answer.').waitFor();
  assert.equal((await callsOf(app, 'cancel_simulation')).at(-1).payload.run, (await callsOf(app, 'simulate')).at(-1).payload.run, 'the run that was waited for is the one stopped');
  assert.equal(await go.getAttribute('aria-busy'), null, 'Simulate can be pressed again');
  // Leaving the tab while a request is waited for stops it: nobody would see its answer, and the AI would go on.
  await box.fill('A third letter');
  await go.click();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.getAttribute('aria-busy') === 'true'));
  const third = (await callsOf(app, 'simulate')).at(-1).payload.run;
  await tab(page, 'Sync').click();
  await page.waitForFunction(run => window.calls.some(c => c.action === 'cancel_simulation' && c.payload.run === run), third);
  await tab(page, 'Projects').click();
  await page.getByRole('heading', { name: 'Marionette', level: 1 }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Request to simulate' }).inputValue(), 'A third letter', 'what was typed is kept');
  assert.equal(await page.getByRole('button', { name: 'Simulate' }).getAttribute('aria-busy'), null, 'coming back, nothing is waited for');
});

// ---------- the inputs ----------
await test('choosing an input shows it and opens the entries of the capabilities its decisions target', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await segment(page, 'Inputs').click();
  assert.match(await row(page, 'taste-skill').textContent(), /v1\.2\.0 · published release · MIT.*Became 2 capabilities · 1 dropped/);
  await page.getByText('house-style.md', { exact: true }).waitFor();
  await row(page, 'genoffice').click();
  await inspector(page).getByRole('heading', { name: 'Input', level: 2 }).waitFor();
  await inspector(page).getByRole('heading', { name: 'genoffice', level: 3 }).waitFor();
  assert.deepEqual(await texts(inspector(page).getByRole('heading', { name: 'Capabilities it went to' }).locator('xpath=../ul/li')), ['office-docs']);
  await page.waitForFunction(id => document.querySelector(`[data-node-id="${id}"]`)?.getAttribute('aria-expanded') === 'true', OFFICE);
  assert.equal(await node(page, DESIGN).getAttribute('aria-expanded'), 'false');
  await node(page, 'cap:office-docs').waitFor();
  await graphPane(page).getByText('The entries that hold what genoffice became are open.', { exact: true }).waitFor();
  await row(page, 'taste-skill').click();
  await page.waitForFunction(id => document.querySelector(`[data-node-id="${id}"]`)?.getAttribute('aria-expanded') === 'true', DESIGN);
  assert.equal(await node(page, OFFICE).getAttribute('aria-expanded'), 'false', 'another input opens its own entries and closes the others');
  await row(page, 'superpowers').click();
  await inspector(page).getByText('None: no choice of this input went to a capability.', { exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-slot="graph-node"][data-node-id^="entry:"]')].every(n => n.getAttribute('aria-expanded') === 'false'));
  await page.screenshot({ path: shots + '/workspace-inputs.png' });
});

await test('Records and Runs are the read-only views of the harmonization', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await segment(page, 'Records').click();
  const records = page.getByRole('list', { name: 'Decision records' });
  assert.deepEqual(await texts(records.locator(':scope > li p')), ['One owner per output.', 'Documents keep the source\'s limits.']);
  assert.match(await records.locator(':scope > li').nth(1).textContent(), /2026-11-12.*office-docs.*Yours · binding/);
  await segment(page, 'Runs').click();
  const runs = page.getByRole('list', { name: 'Runs' }).locator(':scope > li');
  assert.equal(await runs.count(), 2);
  const newest = await runs.first().textContent();
  for (const fact of ['0.5.0', 'current', 'marionette-v0.5.0', 'Moved taste-skill to v1.2.0.', 'Built and validated', '$2.00', 'Claude Code']) assert.ok(newest.includes(fact), `the newest run says ${fact}`);
  assert.match(await runs.nth(1).textContent(), /0\.4\.0.*First harmonization\..*Budget\s*—.*Engine\s*—/);
  await page.screenshot({ path: shots + '/workspace-runs.png' });
});

// ---------- what the session keeps ----------
await test('a reload brings back the open project, its panel and its selection; a request that was waiting comes back idle', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await segment(page, 'Inputs').click();
  await row(page, 'genoffice').click();
  await inspector(page).getByRole('heading', { name: 'genoffice', level: 3 }).waitFor();
  assert.deepEqual(await kept(page).then(k => [k.id, k.panel, k.selected]), ['marionette', 'inputs', { kind: 'input', id: 'genoffice' }]);
  await page.reload();
  await goProjects(page);
  await page.getByRole('heading', { name: 'Marionette', level: 1 }).waitFor();
  assert.equal(await segment(page, 'Inputs').getAttribute('aria-pressed'), 'true', 'the panel that was open');
  assert.equal(await row(page, 'genoffice').getAttribute('aria-current'), 'true', 'the input that was selected');
  await inspector(page).getByRole('heading', { name: 'genoffice', level: 3 }).waitFor();
  await page.waitForFunction(id => document.querySelector(`[data-node-id="${id}"]`)?.getAttribute('aria-expanded') === 'true', OFFICE);
  // A free-text request in flight: what was typed comes back, the waiting does not.
  await segment(page, 'Examples').click();
  await app.flags({ simulateDelay: 20000 });
  await page.getByRole('textbox', { name: 'Request to simulate' }).fill('Write a letter');
  await page.getByRole('button', { name: 'Simulate' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.getAttribute('aria-busy') === 'true'));
  assert.equal('run' in (await kept(page)).sim, false, 'the run is never written to the session');
  await page.reload();
  await goProjects(page);
  await page.getByRole('heading', { name: 'Marionette', level: 1 }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Request to simulate' }).inputValue(), 'Write a letter');
  assert.equal(await page.getByRole('button', { name: 'Simulate' }).getAttribute('aria-busy'), null, 'never brought back as waiting');
  // A selection the project no longer has is no selection, and nothing fails.
  await page.evaluate(() => { const k = JSON.parse(sessionStorage.getItem('muro.project')); k.selected = { kind: 'example', id: '99' }; sessionStorage.setItem('muro.project', JSON.stringify(k)); });
  await page.reload();
  await goProjects(page);
  await canvas(page).waitFor();
  assert.equal(await inspector(page).count(), 0);
});

// ---------- narrow windows ----------
await test('at 900px the inspector is a panel over the graph and a press on another example keeps it; at 500px the left panel is a drawer and nothing scrolls sideways', 'projects', { viewport: { width: 900, height: 900 } }, async app => {
  const { page } = app;
  await openMarionette(page);
  await row(page, 'A landing page').click();
  await inspector(page).getByRole('heading', { name: 'A landing page', level: 3 }).waitFor();
  assert.equal(await inspector(page).getAttribute('data-inspector-form'), 'drawer', 'under 1000px the inspector is a drawer');
  assert.equal(await panelOf(page).isVisible(), true, 'the left panel stays beside the graph');
  assert.equal(await canvas(page).isVisible(), true);
  await row(page, 'A letter').click();
  await inspector(page).getByRole('heading', { name: 'A letter', level: 3 }).waitFor();
  assert.equal(await row(page, 'A letter').getAttribute('aria-current'), 'true');
  assert.ok(await sideways(page) <= 0, '900px');
  await page.screenshot({ path: shots + '/workspace-900.png' });
  await inspector(page).getByRole('button', { name: 'Close', exact: true }).click();
  await inspector(page).waitFor({ state: 'detached' });
  assert.equal(await row(page, 'A letter').getAttribute('aria-current'), 'true', 'closing the details keeps the example lit');

  await page.setViewportSize({ width: 500, height: 900 });
  const opener = page.getByRole('button', { name: 'Project panel', exact: true });
  await opener.waitFor();
  assert.equal(await panelOf(page).count(), 0, 'under 620px the left panel is out of the layout');
  await frames(page);
  assert.ok(await sideways(page) <= 0, '500px, the graph');
  for (const name of ['Review decisions…', 'Harmonize again…', 'Install on harnesses…', 'Add input…', 'All projects', 'Project panel']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 500 + 0.5, `${name} is inside the window`);
  }
  await opener.click();
  const drawer = page.locator('[data-slot="sheet-content"][data-side="left"]');
  await drawer.getByRole('textbox', { name: 'Request to simulate' }).waitFor();
  assert.equal(await row(page, 'A landing page').isVisible(), true, 'the examples are reachable');
  assert.ok(await drawer.evaluate(d => d.scrollWidth <= d.clientWidth + 1 && d.getBoundingClientRect().right <= window.innerWidth + 0.5), 'the drawer fits the window');
  assert.ok(await sideways(page) <= 0, '500px, the drawer');
  await page.screenshot({ path: shots + '/workspace-500-panel.png' });
  await row(page, 'A landing page').click();
  await drawer.waitFor({ state: 'detached' });
  await inspector(page).getByRole('heading', { name: 'A landing page', level: 3 }).waitFor();
  assert.ok(await sideways(page) <= 0, '500px, the details');
  await page.screenshot({ path: shots + '/workspace-500.png' });
});

await test('every control has a name, and the editor\'s actions are disabled and say why', 'projects', {}, async app => {
  const { page } = app;
  await openMarionette(page);
  await row(page, 'A landing page').click();
  await inspector(page).getByRole('heading', { name: 'A landing page', level: 3 }).waitFor();
  assert.deepEqual(await unnamed(page), [], 'the examples, the graph and the details');
  for (const name of ['Inputs', 'Records', 'Runs']) {
    await segment(page, name).click();
    assert.deepEqual(await unnamed(page), [], name);
  }
  const actions = ['Review decisions…', 'Harmonize again…', 'Install on harnesses…', 'Add input…'];
  for (const name of actions) {
    const button = page.getByRole('button', { name, exact: true });
    assert.equal(await button.isDisabled(), true, `${name} waits for the editor`);
    assert.equal(await button.getAttribute('title'), 'Coming with the editor');
  }
  assert.deepEqual(await texts(actionBar(page).locator('button')), actions, 'Add input… is last');
  assert.deepEqual(await actionBar(page).locator('button').evaluateAll(buttons => buttons.map(b => b.getAttribute('data-variant'))), ['outline', 'outline', 'outline', 'default'], 'Add input… is the one solid action');
});

if (failed.length) { console.error('FAILED:\n  ' + failed.join('\n  ')); process.exit(1); }
console.log('PASS: ' + done.join('; '));
