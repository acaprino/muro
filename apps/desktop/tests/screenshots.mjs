// Regenerates the screenshots of docs/assets/screenshots from the fake transport's demo scenarios (fake-transport.js):
//   node apps/desktop/tests/screenshots.mjs
// MURO_UI_PORT moves the dev server when 1422 is taken; MURO_SHOTS_OUT=<folder> writes somewhere else;
// MURO_GUIDE=<path of a release's GUIDE.html> also captures that release's offline guide.
// The pages of the React window: the Projects list, and the workspace of a project with a documented example lit, with an
// answer to a free-text request, and in the light theme. Sync, Activity, Settings and the first run are not in the window yet
// (plan R0), so nothing here draws them: their pictures in docs/assets/screenshots are those of the earlier window.
// The selectors are those of browser-workspace.mjs.
import { chromium } from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { open } from './browser-helper.mjs';

const out = process.env.MURO_SHOTS_OUT || 'docs/assets/screenshots';
await mkdir(out, { recursive: true });
const shot = async (page, name, height) => { await delay(250); await page.screenshot({ path: `${out}/${name}.png`, clip: height ? { x: 0, y: 0, width: 1440, height } : undefined }); console.log(`${out}/${name}.png`); };
const SIZE = { width: 1440, height: 940 };
async function demo(scenario, scheme, body) {
  const app = await open(scenario, { viewport: SIZE, theme: scheme, reducedMotion: 'reduce' });
  try { await body(app.page); } finally { await app.close(); }
}
/** The window has read the registry once: the footer says what it holds. */
const ready = page => page.locator('[data-slot="app-shell-footer"]').getByText(/in your list/).waitFor();
const tab = (page, name) => page.locator('[data-slot="toolbar-tab"]').filter({ hasText: new RegExp(`^${name}$`) });
const row = (page, title) => page.locator('[data-slot="item-row"]').filter({ has: page.locator('[data-slot="item-row-title"]', { hasText: new RegExp(`^${title}$`) }) });

/** The Projects tab of the `projects` scenario (one project, one plugin installed as published) and the project opened. */
async function openProject(page) {
  await ready(page);
  await tab(page, 'Projects').click();
  await page.getByRole('heading', { name: 'Projects', level: 1 }).waitFor();
  await page.getByRole('button', { name: 'Sample', exact: true }).waitFor();
}
const workspace = async page => {
  await page.getByRole('button', { name: 'Sample', exact: true }).click();
  await page.getByRole('heading', { name: 'Sample', level: 1 }).waitFor();
  await page.getByRole('tree', { name: 'Decision graph of Sample' }).waitFor();
};

for (const scheme of ['dark', 'light']) {
  await demo('projects', scheme, async page => {
    await openProject(page);
    if (scheme === 'dark') await shot(page, 'projects');
    await workspace(page);
    // A documented example: its steps light the graph and its details open in the inspector.
    await row(page, 'A landing page').click();
    await page.getByRole('heading', { name: 'Documented example', level: 2 }).waitFor();
    await shot(page, `project-workspace-${scheme}`);
    if (scheme !== 'dark') return;
    // A free-text request, answered: the numbered steps on the graph and in the panel, with the engine that answered.
    await page.getByRole('textbox', { name: 'Request to simulate' }).fill('Write a letter as a Word file');
    await page.getByRole('button', { name: 'Simulate' }).click();
    await page.getByText(/^Asked /).first().waitFor();
    await shot(page, 'project-simulation');
  });
}

if (process.env.MURO_GUIDE) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(process.env.MURO_GUIDE).href);
    await delay(1500);
    // The guide's first example path: one request routed through capabilities absorbed from different sources.
    await page.getByRole('button', { name: 'Percorsi' }).click();
    await page.getByText('Landing con animazioni allo scroll', { exact: true }).first().click();
    await delay(2000);
    await shot(page, 'package-guide', 560);
    if (errors.length) throw Error('Page errors: ' + errors.join('; '));
  } finally { await browser.close(); }
}
