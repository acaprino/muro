// Regenerates the screenshots of docs/assets/screenshots from the fake transport's demo scenarios (fake-transport.js):
//   node apps/desktop/tests/screenshots.mjs
// MURO_UI_PORT moves the dev server when 1422 is taken; MURO_SHOTS_OUT=<folder> writes somewhere else;
// MURO_GUIDE=<path of a release's GUIDE.html> also captures Marionette's offline guide.
// The pages: Sync with changes (dark and light), Sync in sync, the review sheet, the harness sheet, the plugin dialog's
// Adapt with AI, Settings, Activity, the Projects list, a project's Inputs and Graph & simulator steps and a simulation result, and the three steps of the first run.
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
  const app = await open(scenario, { viewport: SIZE, colorScheme: scheme, reducedMotion: 'reduce' });
  try { await body(app.page); } finally { await app.close(); }
}
const tab = (page, name) => page.locator('nav').getByRole('tab', { name: new RegExp('^' + name) });
const check = async (page, headline) => { await page.getByRole('button', { name: 'Check now' }).click(); await page.getByText(headline, { exact: true }).waitFor(); };

for (const scheme of ['dark', 'light']) {
  // Sync after a check: three changes, one plugin that is not ready, one harness with a plugin outside the list.
  await demo('demo', scheme, async page => {
    await check(page, '3 changes ready to apply');
    await shot(page, `sync-changes-${scheme}`);
    if (scheme !== 'dark') return;
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.locator('dialog[open]').getByText('Not ready yet').waitFor();
    await shot(page, 'review');
    await page.keyboard.press('Escape');
    await page.locator('dialog[open]').waitFor({ state: 'detached' });
    await page.locator('th button[data-action="edit-target"]', { hasText: 'Claude Code' }).click();
    await page.locator('.im-inspector:not([hidden]) h2').getByText('Claude Code', { exact: true }).waitFor();
    await shot(page, 'harness');
    await page.keyboard.press('Escape');
    await page.locator('dialog[open]').waitFor({ state: 'detached' });
    await page.locator('#rows').getByRole('button', { name: /^docs-writer/ }).click();
    const dialog = page.locator('dialog[open]');
    await dialog.getByText('More', { exact: true }).click();
    await dialog.getByRole('button', { name: 'Adapt with AI' }).click();
    await dialog.locator('h2').getByText('Adapt docs-writer with AI', { exact: true }).waitFor();
    await shot(page, 'adapt');
  });
}

// Sync once everything is installed.
await demo('demo-synced', 'dark', async page => {
  await check(page, 'Everything is in sync');
  await shot(page, 'sync-in-sync');
});

// Settings and Activity, from the demo with its running adaptation, after a check as a person would have made one.
await demo('demo-activity', 'dark', async page => {
  await check(page, '3 changes ready to apply');
  await tab(page, 'Settings').click();
  await page.getByRole('heading', { name: 'Settings', level: 1 }).waitFor();
  await page.waitForFunction(() => { const s = document.querySelector('[aria-label="Start Muro when Windows starts"]'); return !!s && !s.disabled; });
  await page.setViewportSize({ width: 1440, height: 1230 });   // the page scrolls inside the window: a tall window shows all five sections
  await shot(page, 'settings', 1230);
  await page.setViewportSize(SIZE);
  await tab(page, 'Activity').click();
  await page.getByRole('heading', { name: 'Activity', level: 1 }).waitFor();
  await page.locator('ul.im-activity-list li').first().waitFor();
  await shot(page, 'activity');
});

// The Projects tab, from the `projects` scenario (Marionette as the default project, one plugin installed as published): the list, the Inputs and the Graph & simulator
// steps with a documented example lit, and a free-text request answered. The selectors are those of browser-projects.mjs.
await demo('projects', 'dark', async page => {
  await page.locator('nav button', { hasText: 'Projects' }).click();
  await page.getByRole('heading', { name: 'Projects', level: 1 }).waitFor();
  await page.locator('li.im-list-link', { hasText: 'Marionette' }).waitFor();
  await shot(page, 'projects');
  await page.getByRole('button', { name: /Marionette/ }).click();
  await page.getByRole('heading', { name: 'Marionette', level: 1 }).waitFor();
  await page.locator('#step-panel table').first().waitFor();
  await shot(page, 'project-inputs');
  await page.getByRole('tab', { name: /^Graph/ }).click();
  await page.locator('[data-project-graph] .im-graph').waitFor();
  await page.locator('.im-choice-list button').first().click();
  await page.locator('.im-numbered-result').waitFor();
  await shot(page, 'project-graph');
  await page.locator('textarea[name="simtask"]').fill('Write a letter as a Word file');
  await page.locator('button[data-action="graph-simulate"]').click();
  await page.locator('.im-numbered-result', { hasText: 'Asked' }).waitFor();
  await shot(page, 'project-simulation');
});

// The first run: step 1 with a harness ticked, step 2 with what is installed on it, step 3 with the two switches.
await demo('first-run', 'dark', async page => {
  const title = text => page.locator('#setup-title').filter({ hasText: text }).waitFor();
  await title('Which coding agents does Muro manage?');
  await page.getByRole('checkbox', { name: /Claude Code/ }).check();
  await shot(page, 'first-run-1', 460);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await title('Start from what is installed');
  await shot(page, 'first-run-2', 460);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await title('Keep them in sync by itself?');
  await shot(page, 'first-run-3', 460);
});

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
    await shot(page, 'marionette-guide', 560);
    if (errors.length) throw Error('Page errors: ' + errors.join('; '));
  } finally { await browser.close(); }
}
