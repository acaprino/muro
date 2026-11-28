// Photographs of every screen of the window (under Sigrid's narrow width the Sync table is two lists: a plugin and a harness are opened from them), on the fake transport and in the fake window of browser-helper.mjs: dark and light, 1440, 860 and 620 px wide, in
// apps/desktop/tests/shots (the artifact `muro-shots` of Tests), which a person judges. A screen that cannot be reached, or that overflows sideways, fails the run.
//   node apps/desktop/tests/shots.mjs        (MURO_UI_PORT moves the dev server off 1422)
import { mkdir } from 'node:fs/promises';
import { open } from './browser-helper.mjs';

const out = 'apps/desktop/tests/shots';
await mkdir(out, { recursive: true });
const ready = page => page.locator('[data-slot="app-shell-status"]').getByText(/Last check/).waitFor();
const tab = (page, name) => page.locator('[data-slot="toolbar-tab"]').filter({ hasText: new RegExp(`^${name}$`) });
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const row = (page, title) => page.locator('[data-slot="item-row"]').filter({ has: page.locator('[data-slot="item-row-title"]', { hasText: new RegExp(`^${title}$`) }) });
const segment = (page, name) => page.locator('[data-slot="toggle-group-item"]').filter({ hasText: new RegExp(`^${name}$`) });
const projects = async page => { await tab(page, 'Projects').click(); await button(page, 'Sample').waitFor(); };
const project = async page => { await projects(page); await button(page, 'Sample').click(); await page.getByRole('tree', { name: 'Decision graph of Sample' }).waitFor(); };
/** The left panel of the project: beside the graph, or in its drawer where the window is narrow. */
const panel = async (page, name) => {
  const opener = button(page, 'Project panel');
  if (await opener.count()) await opener.click();
  await segment(page, name).click();
};
const checked = async page => { await button(page, 'Check now').click(); await button(page, 'Review').waitFor(); };
const addInput = async page => { await project(page); await button(page, 'Add input…').click(); await page.getByRole('heading', { name: 'Add an input' }).waitFor(); };

/** The screens: the data, and the way to each from the window as it opens. */
const SCREENS = [
  ['sync', 'demo', async () => {}],
  ['sync-in-sync', 'demo-synced', async () => {}],
  ['sync-no-harness', 'default', async () => {}],
  ['sync-unlisted', 'unlisted', async () => {}],
  ['sync-checked', 'demo', checked],
  ['sync-review', 'demo', async page => { await checked(page); await button(page, 'Review').click(); await page.locator('[data-review-sheet]').waitFor(); }],
  ['sync-plugin', 'changes', async page => { await page.locator('#rows button, [aria-label="Your plugins on your harnesses"] button').first().click(); await page.locator('[data-slot="sheet-content"]').waitFor(); }],
  ['sync-add-plugin', 'changes', async page => { await button(page, 'Add plugin').first().click(); await page.locator('[data-slot="sheet-content"]').waitFor(); }],
  ['sync-add-harness', 'changes', async page => { await button(page, 'Add harness').first().click(); await page.getByRole('heading', { name: 'Add a harness' }).waitFor(); }],
  ['sync-harness', 'demo', async page => { await page.locator('#sync-table th button, [aria-label="Your harnesses"] button').first().click(); await page.locator('[data-inspector-form]:not([hidden])').waitFor(); }],
  ['projects', 'projects', projects],
  ['project', 'projects', project],
  ['project-example', 'projects', async page => { await project(page); await panel(page, 'Examples'); await row(page, 'A landing page').click(); await page.getByRole('heading', { name: 'Documented example', level: 2 }).first().waitFor(); }],
  ['project-inputs', 'projects', async page => { await project(page); await panel(page, 'Inputs'); }],
  ['project-records', 'projects', async page => { await project(page); await panel(page, 'Records'); }],
  ['project-runs', 'projects', async page => { await project(page); await panel(page, 'Runs'); }],
  ['project-details', 'projects', async page => { await project(page); await button(page, 'Edit details…').click(); await page.locator('[data-slot="dialog-content"], [data-slot="sheet-content"][data-side="right"]').waitFor(); }],
  ['project-add-input', 'projects', addInput],
  ['project-harmonize', 'projects', async page => { await project(page); await button(page, 'Harmonize again…').click(); await page.locator('[data-slot="dialog-content"], [data-slot="sheet-content"][data-side="right"]').waitFor(); }],
  ['project-release', 'projects', async page => { await project(page); await button(page, 'More').click(); await page.getByRole('menuitem', { name: 'Release…', exact: true }).click(); await page.locator('[data-slot="dialog-content"]').waitFor(); }],
  ['project-extract', 'projects', async page => { await project(page); await button(page, 'More').click(); await page.getByRole('menuitem', { name: 'Export to folder…', exact: true }).click(); await page.locator('[data-slot="dialog-content"]').waitFor(); }],
  ['project-running', 'projects', async page => {
    await addInput(page);
    const form = page.locator('[data-slot="dialog-content"], [data-slot="sheet-content"][data-side="right"]');
    await form.getByRole('textbox', { name: 'Input', exact: true }).fill('https://github.com/example/x');
    await form.getByRole('textbox', { name: 'Your request', exact: true }).fill('Take its layout rules.');
    await form.getByRole('textbox', { name: 'Maximum budget (USD)', exact: true }).fill('2.5');
    await button(form, 'Add input').click();
    await page.getByRole('region', { name: 'AI run', exact: true }).waitFor();
  }],
  ['project-new', 'projects', async page => { await projects(page); await button(page, 'New project…').click(); await page.locator('[data-slot="sheet-content"][data-side="right"]').waitFor(); }],
  ['activity', 'demo', async page => { await tab(page, 'Activity').click(); }],
  ['settings', 'demo', async page => { await tab(page, 'Settings').click(); }],
  ['commands', 'demo', async page => { await page.keyboard.press('Control+k'); await page.locator('[data-slot="command-palette"]').getByRole('option').first().waitFor(); }],
];

const failed = [];
for (const scheme of ['dark', 'light']) for (const width of [1440, 860, 620]) for (const [name, scenario, reach] of SCREENS) {
  const shot = `${name}-${scheme}-${width}`;
  const app = await open(scenario, { viewport: { width, height: 900 }, theme: scheme, reducedMotion: 'reduce' });
  app.page.setDefaultTimeout(10000);
  try {
    await ready(app.page);
    await reach(app.page);
    await app.page.waitForTimeout(300);
    const wide = await app.page.evaluate(() => [document.documentElement, ...document.querySelectorAll('[data-slot="title-bar"], [data-slot="app-shell-tabs"], [data-slot="app-shell-status"], [data-slot="app-shell-content"], [data-slot="app-shell-actions"], [data-slot="app-shell-footer"], [data-slot="sheet-content"], [data-slot="dialog-content"]')]
      .filter(e => e.scrollWidth > e.clientWidth + 1).map(e => `${e.getAttribute('data-slot') ?? 'the page'} is ${e.scrollWidth} wide in ${e.clientWidth}`));
    if (wide.length) failed.push(`${shot}: ${wide.join(', ')}`);
  } catch (error) { failed.push(`${shot}: ${String(error.message).split(/\r?\n/).slice(0, 2).join(' | ')}`); }
  await app.page.screenshot({ path: `${out}/${shot}.png` });
  await app.close().catch(error => failed.push(`${shot}: ${error.message}`));
}
if (failed.length) { console.error('FAILED:\n  ' + failed.join('\n  ')); process.exit(1); }
console.log(`PASS: ${SCREENS.length * 6} photographs`);
