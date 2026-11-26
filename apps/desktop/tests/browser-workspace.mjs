// Plan R0, Task 5: the Projects tab on Sigrid, on the fake transport (fake-transport.js). The list of project files and the workspace of the open one: the panel
// at the left (inputs, examples, records, runs), the decision graph at the centre with its entries closed until opened, the details in the inspector, the actions
// of the editor at the foot (disabled until it exists). A documented example and the AI's validated answer are the only things that light a branch; an input
// lights what its decisions target. Nothing is matched by words.
//   node apps/desktop/tests/browser-workspace.mjs        (MURO_UI_PORT moves the dev server off 1422)
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { open } from './browser-helper.mjs';
import { ODD_INTENT, ODD_OUTPUT, ODD_TASK, ODD_TITLE } from './fake-transport.js';

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
const openSample = async page => {
  await goProjects(page);
  await page.getByRole('button', { name: 'Sample', exact: true }).click();
  await page.getByRole('heading', { name: 'Sample', level: 1 }).waitFor();
};
const panelOf = page => page.locator('[data-slot="content-split-aside"]');
const graphPane = page => page.locator('section[aria-labelledby="graph-heading"]');
const canvas = (page, name = 'Sample') => page.getByRole('tree', { name: `Decision graph of ${name}` });
const node = (page, id) => page.locator(`[data-slot="graph-node"][data-node-id="${id}"]`);
const DESIGN = 'entry:0:sample-design', OFFICE = 'entry:1:sample-office';
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
/** Waits until the thing `id` is drawn whole inside the visible box of the canvas. */
const inSight = (page, id) => page.waitForFunction(id => {
  const n = [...document.querySelectorAll('[data-slot="graph-node"]')].find(e => e.getAttribute('data-node-id') === id), tree = n?.closest('[role=tree]');
  if (!n || !tree) return false;
  const box = n.getBoundingClientRect(), view = tree.getBoundingClientRect();
  return box.width > 0 && box.left >= view.left - 0.5 && box.right <= view.right + 0.5 && box.top >= view.top - 0.5 && box.bottom <= view.bottom + 0.5;
}, id);
/** What a screen reader hears after a thing's name: the description Sigrid ties to it (`aria-describedby`), which says each of its lines with its words and the other end. */
const described = (page, id) => node(page, id).evaluate(n => (n.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean).map(x => document.getElementById(x)?.textContent ?? '').join(' '));
/** What Sigrid draws a line with: its look is four custom properties on the line's path (`lineVars`, `--sigrid-line-stroke`, `-width`, `-dash`, `-cap`), no class. The dash of each style, the colour of each tone and the width
 * of the chosen and of the path's lines are Sigrid's (`LINE_STYLES`, `LINE_TONES`, `LINE_NEAR`, `LINE_PATH`): a dashed line is `6 4`, a dotted one `0 4`, and the path or a tone of the accent is `var(--color-accent)` 2px thick. */
const DASHED = { dash: '6 4' }, DOTTED = { dash: '0 4' }, ACCENT = { stroke: 'var(--color-accent)', width: '2' };
const NEAR = { stroke: 'var(--color-ink-soft)', width: '1.5' }, NEAR_DOTTED = { stroke: 'var(--color-ink-soft)', width: '2', dash: '0 4' };
/** The lines of the canvas (each `.react-flow__edge`, with the words of the line inside it) whose path has every property of `look`. */
const drawnLines = (page, look) => page.locator('[data-slot="graph"] .react-flow__edge').filter({
  has: page.locator(`.react-flow__edge-path${Object.entries(look).map(([name, value]) => `[style*="--sigrid-line-${name}: ${value}"]`).join('')}`),
});
/** Waits until the canvas numbers the capability `id` as step `step` of the lit path: the name a screen reader hears says it ("design-taste, step 1", Sigrid's
 * `graph.onPath`), and so do the dots on the thing. */
const numbered = async (page, id, step) => {
  await page.waitForFunction(([id, name]) => [...document.querySelectorAll('[data-slot="graph-node"]')].find(e => e.getAttribute('data-node-id') === id)?.getAttribute('aria-label') === name, [`cap:${id}`, `${id}, step ${step}`]);
  assert.equal(await node(page, `cap:${id}`).locator('[data-slot="graph-steps"]').textContent(), String(step));
};
/** The bar of the window: the title bar with its three buttons. */
const frameButtons = page => page.locator('[data-slot="title-bar"] [data-slot="window-controls"] button');
/** Every control and field of the window that has no name. */
const unnamed = page => page.evaluate(() => [...document.querySelectorAll('button, [role=switch], [role=tab], [role=treeitem], textarea, input:not([type=hidden])')].filter(e => {
  const by = e.getAttribute('aria-labelledby');
  return !(e.getAttribute('aria-label') || (by && by.split(/\s+/).some(id => document.getElementById(id)?.textContent.trim())) || e.textContent.trim() || e.labels?.length);
}).map(e => e.outerHTML.slice(0, 120)));

// ---------- the list ----------
await test('the list says what each project is, what is installed as published, and opening one shows the three regions side by side', 'projects', {}, async app => {
  const { page } = app;
  await goProjects(page);
  const line = page.getByRole('table', { name: 'Projects' }).getByRole('row').filter({ hasText: 'Sample' });
  await line.waitFor();
  const text = await line.textContent();
  for (const fact of ['0.5.0', 'D:/Muro/data/projects/sample.mp', '3 inputs · 4 capabilities']) assert.ok(text.includes(fact), `the row says ${fact}: ${text}`);
  assert.equal(await line.getByRole('button', { name: 'Remove Sample from the list', exact: true }).count(), 1, 'every project can leave the list');
  assert.equal(await line.getByRole('button', { name: 'Delete Sample…', exact: true }).count(), 1, 'and every project can be deleted');
  await page.getByRole('heading', { name: /Installed as published/, level: 2 }).waitFor();
  assert.match(await page.getByRole('list', { name: 'Installed as published' }).textContent(), /commit-helper.*Needs a build for Codex/);
  await page.screenshot({ path: shots + '/workspace-list.png' });
  await page.getByRole('button', { name: 'Sample', exact: true }).click();
  await page.getByRole('heading', { name: 'Sample', level: 1 }).waitFor();
  assert.deepEqual((await callsOf(app, 'project')).map(c => c.payload), [{ id: 'sample' }]);
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
  await page.getByRole('table', { name: 'Projects' }).waitFor();
  await page.getByRole('button', { name: 'Open project file…', exact: true }).click();
  await notice(page, `${odd} added to your list.`).waitFor();
  assert.equal((await callsOf(app, 'projects')).length, 1, 'opening a file uses its returned summary without inspecting the other archives again');
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
  assert.equal(await page.getByRole('table', { name: 'Projects' }).getByRole('button', { name: 'Sample', exact: true }).count(), 1, 'the other project is what is left');
});

// ---------- the graph ----------
await test('the graph opens with every entry closed, each saying how many it hides; an entry opens to show its capabilities', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
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
  for (const fact of ['design-review', 'worker', 'sample-design', 'Activates when the request means', 'Review a finished design', 'Not for: Building one']) assert.ok(details.includes(fact), `the details say ${fact}`);
  // What it needs is a line of the canvas, no longer words of the details: dashed, with the AI's label of the condition drawn while one of its ends is chosen, and heard.
  assert.equal(details.includes('on a condition'), false, 'the details no longer write the lines out');
  await drawnLines(page, DASHED).filter({ hasText: 'A design exists' }).waitFor({ state: 'attached' });
  assert.match(await described(page, 'cap:design-review'), /A design exists, from design-taste/);
  // Choosing it brought in sight what it is joined to: office-docs, which never goes with it, sits in the office entry, which opened, and the dotted line between them is drawn.
  await page.waitForFunction(id => document.querySelector(`[data-node-id="${id}"]`)?.getAttribute('aria-expanded') === 'true', OFFICE);
  await drawnLines(page, DOTTED).filter({ hasText: 'never together' }).waitFor({ state: 'attached' });
  assert.match(await described(page, 'cap:design-review'), /never together, with office-docs/);
  await node(page, 'cap:design-taste').click();
  await inspector(page).getByRole('heading', { name: 'design-taste', level: 3 }).waitFor();
  assert.match(await inspector(page).textContent(), /Comes from\s*taste-skill/);
  assert.match(await inspector(page).textContent(), /Produces\s*design-brief/);
});

await test('a graph of a large project (37 capabilities, 15 entries): the first view keeps names readable, starts at the first entry and cuts none at its edge; an example opens the entries of its steps, numbers them and brings them in sight', 'projects', {}, async app => {
  const { page } = app;
  await app.flags({ bigGraph: true });
  await openSample(page);
  await canvas(page).waitFor();
  const first = 'entry:0:sample-group-1';
  // Visible: Sigrid shows the canvas only once its first view is fitted.
  await node(page, first).waitFor();
  await frames(page);
  // Only what is in the view is drawn (React Flow's onlyRenderVisibleElements, Sigrid's choice): the 15 are counted by graph-scene.test.ts, not here.
  const entries = await page.locator('[data-slot="graph-node"]').evaluateAll(nodes => nodes.map(n => {
    const label = n.querySelector('.truncate'), box = n.getBoundingClientRect(), tree = n.closest('[role=tree]').getBoundingClientRect();
    const inside = box.left >= tree.left - 0.5 && box.right <= tree.right + 0.5 && box.top >= tree.top - 0.5 && box.bottom <= tree.bottom + 0.5;
    const outside = box.bottom <= tree.top + 0.5 || box.top >= tree.bottom - 0.5 || box.right <= tree.left + 0.5 || box.left >= tree.right - 0.5;
    return { id: n.getAttribute('data-node-id'), name: n.getAttribute('aria-label'), expanded: n.getAttribute('aria-expanded'), clipped: label.scrollWidth > label.clientWidth + 0.5, inside, outside };
  }));
  assert.ok(entries.length > 0 && entries.length <= 15);
  for (const e of entries) {
    const n = Number(/^group-(\d+),/.exec(e.name)?.[1]);
    assert.equal(e.name, `group-${n}, closed, hides ${n <= 7 ? 3 : 2}`, 'closed, with the number of its own capabilities');
    assert.equal(e.expanded, 'false');
    assert.equal(e.clipped, false, `${e.name}: its name is not cut`);
    // Sigrid places the edges of the view between things wherever the layout leaves a gap, as a column of entries 16px apart does: none is drawn cut.
    assert.ok(e.inside || e.outside, `${e.name}: cut by the edge of the canvas`);
  }
  assert.equal(entries.find(e => e.id === first)?.inside, true, 'a graph too large for a readable fit starts at its first thing, whole and in sight');
  // How large the first view draws a name. Sigrid's readable fit (GraphCanvas `minFitZoom`, 0.8 by default) promises that the first view, a change of size, the fit
  // button and `focus` never draw the graph smaller than 0.8: "names of 14 px stay about 11 px". A graph too large for that starts at its top left, and the rest is a pan,
  // the map or the find field away. Fifteen closed entries in one column need about 0.7 to fit at 1512x982, so this one starts at the top (the review measured 0.59 for
  // the whole column, names at 8.3px, under Sigrid 3.3.9).
  const { scale, name } = await node(page, first).evaluate(n => {
    const s = n.getBoundingClientRect().width / 208;
    return { scale: s, name: parseFloat(getComputedStyle(n.querySelector('.truncate')).fontSize) * s };
  });
  console.log(`bigGraph, first view at 1512x982: scale ${scale.toFixed(2)}, its names drawn at ${name.toFixed(1)}px, ${entries.filter(e => e.inside).length} of 15 entries in sight`);
  assert.ok(scale >= 0.8 - 0.005, `the first view is drawn at ${scale.toFixed(2)}, under Sigrid's floor of 0.8`);
  assert.ok(name >= 11, `a name is drawn at ${name.toFixed(1)}px, under the 11px Sigrid's readable fit keeps`);
  await page.screenshot({ path: shots + '/workspace-graph-large.png' });
  const long = 'a-capability-whose-name-is-far-longer-than-any-other-capability-of-this-project-' + 'x'.repeat(30);
  await row(page, 'Two of many').click();
  await inspector(page).getByRole('heading', { name: 'Two of many', level: 3 }).waitFor();
  assert.deepEqual(await texts(inspector(page).locator('ol[aria-label="Steps, in order"] > li').locator('xpath=./div/div/*[1]')), [long, 'capability-37-design-system']);
  // No press on "Fit the view": a new light opens the entries of its steps and asks the canvas to bring them into the view (Workspace.tsx, Sigrid's `focus`).
  await inSight(page, `cap:${long}`);
  await inSight(page, 'cap:capability-37-design-system');
  for (const id of ['entry:5:sample-group-6', 'entry:6:sample-group-7']) await page.waitForFunction(id => document.querySelector(`[data-node-id="${id}"]`)?.getAttribute('aria-expanded') === 'true', id);
  // The canvas numbers the path: the step in dots and in the name a screen reader hears.
  assert.equal(await node(page, `cap:${long}`).getAttribute('aria-label'), `${long}, step 1`);
  assert.equal(await node(page, 'cap:capability-37-design-system').getAttribute('aria-label'), 'capability-37-design-system, step 2');
  assert.equal(await node(page, `cap:${long}`).locator('[data-slot="graph-steps"]').textContent(), '1');
  assert.equal(await node(page, 'cap:capability-37-design-system').locator('[data-slot="graph-steps"]').textContent(), '2');
  const drawn = await page.locator(`[data-node-id="cap:${long}"]`).evaluate(n => n.getBoundingClientRect().width / 208);
  assert.ok(drawn >= 0.8 - 0.005, `the steps are brought in sight at ${drawn.toFixed(2)}, under 0.8`);
  assert.ok(await sideways(page) <= 0, 'nothing widens the page');
  await page.screenshot({ path: shots + '/workspace-graph-large-example.png' });
});

// ---------- the examples and the simulator ----------
await test('each example says its request, its intents and its outputs; a click lights its path, opens its entry and shows its steps in the details', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
  assert.equal(await segment(page, 'Examples').getAttribute('aria-pressed'), 'true', 'a project opens on its examples');
  const landing = row(page, 'A landing page'), letter = row(page, 'A letter');
  const lines = async r => texts(r.locator('[data-slot="item-row-description"], [data-slot="item-row-fact"]'));
  assert.deepEqual(await lines(landing), ['Design a landing page · With stack:react', 'Intent design-taste-intent → design-review-intent', 'Output design-brief']);
  assert.deepEqual(await lines(letter), ['Write a letter as a Word file', 'Intent office-docs-intent'], 'a prerequisite has no intent, and a step that makes nothing adds no output line');
  await landing.click();
  assert.equal(await landing.getAttribute('aria-current'), 'true');
  await inspector(page).getByRole('heading', { name: 'A landing page', level: 3 }).waitFor();
  const steps = inspector(page).locator('ol[aria-label="Steps, in order"] > li');
  assert.deepEqual(await texts(steps), ['1design-tastedesign-taste-intentIt designs a page.', '2design-reviewdesign-review-intentA finished design is checked.']);
  assert.match(await inspector(page).textContent(), /Produces\s*design-brief/);
  assert.match(await inspector(page).textContent(), /Design first, then review\./);
  await numbered(page, 'design-taste', 1);
  await numbered(page, 'design-review', 2);
  // The line between the two steps is the path's, in the accent: here the dashed line of the need, its words drawn on the path.
  await drawnLines(page, { ...ACCENT, ...DASHED }).filter({ hasText: 'A design exists' }).waitFor({ state: 'attached' });
  assert.equal(await drawnLines(page, ACCENT).count(), 1, 'one line between the two steps');
  assert.equal(await node(page, DESIGN).getAttribute('aria-expanded'), 'true', 'the entry of the path is open');
  assert.equal(await node(page, OFFICE).getAttribute('aria-expanded'), 'false', 'the others stay closed');
  await graphPane(page).getByText('The steps of “A landing page” are numbered on the graph.', { exact: true }).waitFor();
  assert.equal((await callsOf(app, 'simulate')).length, 0, 'a documented example runs no AI');
  // A step of the details shows its capability, and the path stays lit.
  await inspector(page).getByRole('button', { name: 'Step 2: design-review', exact: true }).click();
  await inspector(page).getByRole('heading', { name: 'design-review', level: 3 }).waitFor();
  assert.equal(await landing.getAttribute('aria-current'), 'true', 'looking at a capability keeps the example lit');
  await numbered(page, 'design-review', 2);
  await numbered(page, 'design-taste', 1);
  // Another example replaces it; the same one again, while it is shown, puts it out.
  await letter.click();
  await numbered(page, 'office-pdf', 1);
  await numbered(page, 'office-docs', 2);
  await drawnLines(page, ACCENT).filter({ hasText: 'runs first' }).waitFor({ state: 'attached' });
  assert.equal(await node(page, DESIGN).getAttribute('aria-expanded'), 'false', 'the entries of the old path close');
  assert.equal(await landing.getAttribute('aria-current'), null);
  await letter.click();
  await inspector(page).waitFor({ state: 'detached' }).catch(() => inspector(page).waitFor({ state: 'hidden' }));
  assert.equal(await letter.getAttribute('aria-current'), null);
  await page.waitForFunction(() => document.querySelectorAll('[data-slot="graph"] [data-slot="graph-steps"], [data-slot="graph"] .react-flow__edge-path[style*="--sigrid-line-stroke: var(--color-accent)"]').length === 0);
  assert.equal(await node(page, 'cap:office-docs').getAttribute('aria-label'), 'office-docs', 'nothing is numbered any more, and no line is the path\'s');
  // A capability chosen on the canvas is drawn with its lines: what it is joined to in a closed entry comes in sight (design-review, in the design entry), and the
  // words of its lines are drawn and heard. The details no longer write them out.
  await node(page, 'cap:office-docs').click();
  await inspector(page).getByRole('heading', { name: 'office-docs', level: 3 }).waitFor();
  await page.waitForFunction(id => document.querySelector(`[data-node-id="${id}"]`)?.getAttribute('aria-expanded') === 'true', DESIGN);
  await inSight(page, 'cap:design-review');
  await drawnLines(page, NEAR).filter({ hasText: 'runs first' }).waitFor({ state: 'attached' });
  await drawnLines(page, NEAR_DOTTED).filter({ hasText: 'never together' }).waitFor({ state: 'attached' });
  const heard = await described(page, 'cap:office-docs');
  assert.match(heard, /runs first, from office-pdf/);
  assert.match(heard, /never together, with design-review/);
  assert.doesNotMatch(await inspector(page).textContent(), /Never together|runs office-pdf first/i);
  await node(page, 'cap:design-review').click();
  await inspector(page).getByRole('heading', { name: 'design-review', level: 3 }).waitFor();
  await page.screenshot({ path: shots + '/workspace-example.png' });
});

await test('the simulator: an empty request is refused in place, the note names the engine once, an answer lights its steps, and Cancel stops waiting', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
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
  const result = panelOf(page).locator('[role=status]').filter({ hasText: '“Write a letter”' });
  await result.getByText('2 steps', { exact: true }).waitFor();
  assert.deepEqual(await texts(result.locator('ol[aria-label="Steps, in order"] > li')), ['1office-pdfPrerequisiteA prerequisite the plugin declares, added before the step that needs it.', '2office-docsoffice-docs-intentThe request asks for a Word file.']);
  await result.getByText('Asked Claude Code · $0.12 · 4.2 s', { exact: true }).waitFor();
  const sent = (await callsOf(app, 'simulate')).at(-1).payload;
  assert.equal(sent.id, 'sample'); assert.equal(sent.task, 'Write a letter'); assert.match(sent.run, /^[A-Za-z0-9_-]{1,64}$/);
  await numbered(page, 'office-pdf', 1);
  await numbered(page, 'office-docs', 2);
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
  await page.getByRole('heading', { name: 'Sample', level: 1 }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Request to simulate' }).inputValue(), 'A third letter', 'what was typed is kept');
  assert.equal(await page.getByRole('button', { name: 'Simulate' }).getAttribute('aria-busy'), null, 'coming back, nothing is waited for');
});

// ---------- the inputs ----------
await test('choosing an input shows it, and opens the entries of the capabilities its decisions target and marks those capabilities on the graph', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
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
  await graphPane(page).getByText('The capabilities genoffice became are marked on the graph.', { exact: true }).waitFor();
  // Marked as chosen together (Sigrid's several chosen): its one capability here is the choice a screen reader hears.
  assert.equal(await node(page, 'cap:office-docs').getAttribute('aria-selected'), 'true');
  await row(page, 'taste-skill').click();
  await page.waitForFunction(id => document.querySelector(`[data-node-id="${id}"]`)?.getAttribute('aria-expanded') === 'true', DESIGN);
  assert.equal(await node(page, OFFICE).getAttribute('aria-expanded'), 'false', 'another input opens its own entries and closes the others');
  await row(page, 'superpowers').click();
  await inspector(page).getByText('None: no choice of this input went to a capability.', { exact: true }).waitFor();
  await graphPane(page).getByText('superpowers became no capability on the graph.', { exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-slot="graph-node"][data-node-id^="entry:"]')].every(n => n.getAttribute('aria-expanded') === 'false'));
  assert.equal(await page.locator('[data-slot="graph-node"][aria-selected="true"]').count(), 0, 'nothing is marked');
  await page.screenshot({ path: shots + '/workspace-inputs.png' });
});

await test('Records and Runs are the read-only views of the harmonization', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
  await segment(page, 'Records').click();
  const records = page.getByRole('list', { name: 'Decision records' });
  assert.deepEqual(await texts(records.locator(':scope > li p')), ['One owner per output.', 'Documents keep the source\'s limits.']);
  assert.match(await records.locator(':scope > li').nth(1).textContent(), /2026-11-12.*office-docs.*Yours · binding/);
  await segment(page, 'Runs').click();
  const runs = page.getByRole('list', { name: 'Runs' }).locator(':scope > li');
  assert.equal(await runs.count(), 2);
  const newest = await runs.first().textContent();
  for (const fact of ['0.5.0', 'current', 'sample-v0.5.0', 'Moved taste-skill to v1.2.0.', 'Built and validated', '$2.00', 'Claude Code']) assert.ok(newest.includes(fact), `the newest run says ${fact}`);
  assert.match(await runs.nth(1).textContent(), /0\.4\.0.*First harmonization\..*Budget\s*—.*Engine\s*—/);
  await page.screenshot({ path: shots + '/workspace-runs.png' });
});

await test('the project names its file, with Open folder, and its repository, author and creation date; a shell that cannot open folders loses the button for the session', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
  const head = page.locator('main header').first();
  await head.getByText('Repository github.com/owner/sample · main · by acaprino · created 2026-11-10', { exact: true }).waitFor();
  await head.getByText('D:/Muro/data/projects/sample.mp', { exact: true }).waitFor();
  const folder = head.getByRole('button', { name: 'Open folder', exact: true });
  assert.equal(await folder.getAttribute('data-variant'), 'outline', 'not the solid action of the window');
  await folder.click();
  await page.waitForFunction(() => window.calls.some(c => c.action === 'open_folder'));
  assert.deepEqual((await callsOf(app, 'open_folder')).map(c => c.payload), [{ path: 'D:/Muro/data/projects/sample.mp' }]);
  await app.flags({ noShellActions: true });
  await folder.click();
  await notice(page, 'This version of Muro cannot open folders yet.').waitFor();
  await folder.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'All projects', exact: true }).click();
  await page.getByRole('button', { name: 'Sample', exact: true }).click();
  await page.getByRole('heading', { name: 'Sample', level: 1 }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Open folder', exact: true }).count(), 0, 'gone for the session, not only for this page');
});

// ---------- what a project file may hold ----------
await test('a project with no capability says so where the graph would be and in its examples, and nothing fails', 'projects', {}, async app => {
  const { page } = app;
  await app.flags({ emptyGraph: true });
  await openSample(page);
  await graphPane(page).getByText('No decision graph', { exact: true }).waitFor();
  await graphPane(page).getByText('This project\'s plugin has no capabilities to choose between, so there is nothing to draw or to simulate.', { exact: true }).waitFor();
  assert.match(await graphPane(page).textContent(), /0 entries · 0 capabilities/);
  assert.equal(await canvas(page).count(), 0, 'no canvas to draw nothing on');
  await panelOf(page).getByText('No decision graph', { exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Request to simulate' }).count(), 0, 'nothing to simulate');
  assert.equal(await frameButtons(page).count(), 3, 'the frame is whole');
});

await test('capabilities that no entry groups are all on the graph, each one reachable, and an example still numbers its steps', 'projects', {}, async app => {
  const { page } = app;
  await app.flags({ noEntries: true });
  await openSample(page);
  await graphPane(page).getByText('No entry groups these capabilities: each stands on its own.', { exact: true }).waitFor();
  await canvas(page).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('[data-slot="graph-node"][data-node-id^="cap:"]').length === 4);
  assert.equal(await page.locator('[data-slot="graph-node"][data-node-id^="entry:"]').count(), 0);
  for (const id of ['design-taste', 'design-review', 'office-docs', 'office-pdf']) {
    await inSight(page, `cap:${id}`);
    await node(page, `cap:${id}`).click();
    await inspector(page).getByRole('heading', { name: id, level: 3 }).waitFor();
  }
  await row(page, 'A landing page').click();
  await numbered(page, 'design-taste', 1);
  await numbered(page, 'design-review', 2);
});

await test('two examples with one title are two rows, each chosen on its own; a title, an intent and an output with <, & and quotes are text, not markup', 'projects', {}, async app => {
  const { page } = app;
  await app.flags({ oddNames: true });
  await openSample(page);
  const letters = row(page, 'A letter');
  assert.equal(await letters.count(), 2);
  await letters.nth(1).click();
  await inspector(page).getByText('“Write a second letter”', { exact: true }).waitFor();
  assert.deepEqual([await letters.nth(0).getAttribute('aria-current'), await letters.nth(1).getAttribute('aria-current')], [null, 'true'], 'the second one, not the first');
  await numbered(page, 'office-docs', 1);
  await letters.nth(0).click();
  await inspector(page).getByText('“Write a letter as a Word file”', { exact: true }).waitFor();
  assert.deepEqual([await letters.nth(0).getAttribute('aria-current'), await letters.nth(1).getAttribute('aria-current')], ['true', null]);
  await numbered(page, 'office-docs', 2);
  const odd = row(page, ODD_TITLE);
  assert.deepEqual(await texts(odd.locator('[data-slot="item-row-description"], [data-slot="item-row-fact"]')), [ODD_TASK, `Intent ${ODD_INTENT}`, `Output ${ODD_OUTPUT}`]);
  await odd.click();
  await inspector(page).getByRole('heading', { name: ODD_TITLE, level: 3 }).waitFor();
  await inspector(page).getByText(ODD_INTENT, { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('main b, main i, main u')].filter(e => /Odd|PDF|pdf|file/.test(e.textContent)).length), 0, 'what the file says is text, not markup');
  await graphPane(page).getByText(`The steps of “${ODD_TITLE}” are numbered on the graph.`, { exact: true }).waitFor();
});

await test('a record or a run holding an object where the file should hold text is shown as text, and the window stays whole', 'projects', {}, async app => {
  const { page } = app;
  await app.flags({ objectFields: true });
  await openSample(page);
  await segment(page, 'Records').click();
  const records = page.getByRole('list', { name: 'Decision records' });
  assert.deepEqual(await texts(records.locator(':scope > li p')), ['{"en":"One owner per output."}', 'Documents keep the source\'s limits.']);
  await segment(page, 'Runs').click();
  assert.match(await page.getByRole('list', { name: 'Runs' }).locator(':scope > li').first().textContent(), /\{"en":"Moved taste-skill to v1\.2\.0\."\}/);
  assert.equal(await frameButtons(page).count(), 3, 'the title bar and its three buttons are there');
  await page.getByRole('heading', { name: 'Sample', level: 1 }).waitFor();
  assert.equal(await page.getByText('This screen could not be shown').count(), 0, 'the page itself did not fail');
});

// ---------- what the session keeps ----------
await test('a reload brings back the open project, its panel and its selection; a request that was waiting comes back idle', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
  await segment(page, 'Inputs').click();
  await row(page, 'genoffice').click();
  await inspector(page).getByRole('heading', { name: 'genoffice', level: 3 }).waitFor();
  assert.deepEqual(await kept(page).then(k => [k.id, k.panel, k.selected]), ['sample', 'inputs', { kind: 'input', id: 'genoffice' }]);
  await page.reload();
  await goProjects(page);
  await page.getByRole('heading', { name: 'Sample', level: 1 }).waitFor();
  assert.equal(await segment(page, 'Inputs').getAttribute('aria-pressed'), 'true', 'the panel that was open');
  assert.equal((await callsOf(app, 'projects')).length, 0, 'restoring a workspace only inspects its own archive');
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
  await page.getByRole('heading', { name: 'Sample', level: 1 }).waitFor();
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
  await openSample(page);
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
  assert.equal(await panelOf(page).count(), 0, 'under 850px the left panel is out of the layout');
  await frames(page);
  assert.ok(await sideways(page) <= 0, '500px, the graph');
  for (const name of ['Review decisions…', 'Harmonize again…', 'Install via Sync…', 'Export to folder…', 'Release…', 'Add input…', 'All projects', 'Project panel']) {
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

await test('Install via Sync prefills the project, cancellation clears the next Add, and a registered file reopens the same plugin', 'projects', {}, async app => {
  const { page } = app;
  const file = 'D:/Muro/data/projects/sample.mp';
  await app.flags({ projectSources: { [file]: { file, digest: '4'.repeat(64), harnesses: ['claude-code', 'codex'], version: '0.5.0' } } });
  const install = page.getByRole('button', { name: 'Install via Sync…', exact: true });
  const drawer = page.locator('[data-slot="sheet-content"]');
  const source = drawer.locator('input[name="source"]'), name = drawer.locator('input[name="name"]');
  const cancel = drawer.getByRole('button', { name: 'Cancel', exact: true });
  await openSample(page);
  await install.click();
  await drawer.getByRole('heading', { name: 'Add a plugin', exact: true }).waitFor();
  assert.equal(await tab(page, 'Sync').getAttribute('aria-current'), 'page');
  assert.equal(await source.inputValue(), file);
  assert.equal(await name.inputValue(), 'Sample');
  await cancel.click();
  await drawer.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Add plugin', exact: true }).click();
  assert.equal(await source.inputValue(), '');
  assert.equal(await name.inputValue(), '');
  await cancel.click();
  await drawer.waitFor({ state: 'detached' });
  assert.equal((await callsOf(app, 'save_plugin')).length, 0);
  await goProjects(page);
  await install.click();
  await drawer.getByRole('checkbox', { name: 'Claude Code', exact: true }).uncheck();
  await drawer.getByRole('button', { name: 'Add plugin', exact: true }).click();
  await drawer.waitFor({ state: 'detached' });
  const plugin = (await callsOf(app, 'save_plugin')).at(-1).payload.plugin;
  assert.equal(plugin.source, file);
  assert.deepEqual(plugin.targets, ['t2']);
  await goProjects(page);
  await install.click();
  await drawer.getByRole('heading', { name: 'Sample', exact: true }).waitFor();
  assert.equal(await drawer.getByRole('button', { name: 'Save', exact: true }).isDisabled(), true);
  assert.equal((await callsOf(app, 'save_plugin')).length, 1);
  for (const action of ['apply', 'install_project', 'extract_project', 'extract_plugin']) assert.equal((await callsOf(app, action)).length, 0, action);
});

await test('a local project and a repository with equal file bytes can follow their own sources in Sync', 'projects', {}, async app => {
  const { page } = app;
  await ready(page);
  const source = 'https://github.com/owner/published-store';
  const digest = await page.evaluate(() => window.behind.digest('sample'));
  await app.flags({ projectSources: { [source]: {
    file: 'D:/isolated/data/sources/revision/sample.mp', digest, harnesses: ['claude-code', 'codex'], version: '0.5.0',
  } } });
  await page.getByRole('button', { name: 'Add plugin', exact: true }).click();
  const drawer = page.locator('[data-slot="sheet-content"]');
  await drawer.locator('input[name="source"]').fill(source);
  await drawer.getByRole('button', { name: 'Add plugin', exact: true }).click();
  await drawer.waitFor({ state: 'detached' });
  await openSample(page);
  await page.getByRole('button', { name: 'Install via Sync…', exact: true }).click();
  await drawer.getByRole('heading', { name: 'Add a plugin', exact: true }).waitFor();
  assert.equal(await drawer.locator('input[name="source"]').inputValue(), 'D:/Muro/data/projects/sample.mp');
  assert.equal(await drawer.locator('input[name="name"]').inputValue(), 'Sample');
  assert.equal((await callsOf(app, 'save_plugin')).length, 1);
});

await test('Install via Sync checks a linked legacy plugin, then opens that same plugin with its selected targets', 'legacy-project', {}, async app => {
  const { page } = app;
  const file = 'D:/Muro/data/projects/sample.mp';
  const install = page.getByRole('button', { name: 'Install via Sync…', exact: true });
  await app.flags({ projectSources: { [file]: { error: 'The project file could not be verified' } } });
  await openSample(page);
  await install.click();
  await page.locator('[data-toasts]').getByText(/The project file could not be verified/).waitFor();
  assert.equal(await tab(page, 'Projects').getAttribute('aria-current'), 'page');
  assert.equal((await callsOf(app, 'save_plugin')).length, 0);
  await app.flags({ projectSources: { [file]: {
    file, digest: 'a'.repeat(64), version: '0.5.0', harnesses: ['claude-code', 'codex'],
  } } });
  await install.click();
  const drawer = page.locator('[data-slot="sheet-content"]');
  await drawer.getByRole('heading', { name: 'Sample', exact: true }).waitFor();
  await drawer.getByRole('region', { name: 'Project file builds' }).getByText(/Included.*Claude Code.*Codex/).waitFor();
  assert.equal(await drawer.getByRole('checkbox', { name: 'Claude Code', exact: true }).isChecked(), false);
  assert.equal(await drawer.getByRole('checkbox', { name: 'Codex', exact: true }).isChecked(), true);
  assert.deepEqual((await callsOf(app, 'resolve')).map(c => c.payload.id), ['sample', 'sample']);
  for (const action of ['save_plugin', 'install_project', 'apply']) assert.equal((await callsOf(app, action)).length, 0, action);
});

await test('every control has a name, and the actions that are not there yet are disabled and say why', 'projects', {}, async app => {
  const { page } = app;
  await openSample(page);
  await row(page, 'A landing page').click();
  await inspector(page).getByRole('heading', { name: 'A landing page', level: 3 }).waitFor();
  assert.deepEqual(await unnamed(page), [], 'the examples, the graph and the details');
  for (const name of ['Inputs', 'Records', 'Runs']) {
    await segment(page, name).click();
    assert.deepEqual(await unnamed(page), [], name);
  }
  const actions = ['Review decisions…', 'Harmonize again…', 'Install via Sync…', 'Export to folder…', 'Release…', 'Add input…'];
  const waiting = { 'Review decisions…': 'Coming with the review' };
  const buttons = actionBar(page).getByRole('button');
  assert.equal(await buttons.count(), actions.length);
  for (const [index, name] of actions.entries()) {
    const button = page.getByRole('button', { name, exact: true });
    assert.equal(await buttons.nth(index).and(button).count(), 1, `${name} is action ${index + 1}`);
    if (name in waiting) {
      assert.equal(await button.isDisabled(), true, `${name} waits for another plan`);
      assert.equal(await button.getAttribute('title'), waiting[name]);
    } else assert.equal(await button.isDisabled(), false, `${name} is live`);
  }
  assert.deepEqual(await buttons.evaluateAll(elements => elements.map(b => b.getAttribute('data-variant'))), ['outline', 'outline', 'outline', 'outline', 'outline', 'default'], 'Add input… is the one solid action');
});

if (failed.length) { console.error('FAILED:\n  ' + failed.join('\n  ')); process.exit(1); }
console.log('PASS: ' + done.join('; '));
