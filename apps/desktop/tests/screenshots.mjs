// Regenerates the screenshots in docs/assets/screenshots from the fake transport's `demo` scenario (fake-transport.js).
//   node apps/desktop/tests/screenshots.mjs
// MURO_UI_PORT moves the dev server when 1422 is taken; MURO_SHOTS_OUT=<folder> writes somewhere else;
// MURO_GUIDE=<path of a release's GUIDE.html> also captures Marionette's offline guide.
import { chromium } from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { open } from './browser-helper.mjs';

const out = process.env.MURO_SHOTS_OUT || 'docs/assets/screenshots';
await mkdir(out, { recursive: true });
const shot = async (page, name, height) => { await delay(250); await page.screenshot({ path: `${out}/${name}.png`, clip: height ? { x: 0, y: 0, width: 1440, height } : undefined }); console.log(`${out}/${name}.png`); };

for (const scheme of ['dark', 'light']) {
  const app = await open('demo', { viewport: { width: 1440, height: 940 }, colorScheme: scheme, reducedMotion: 'reduce' });
  try {
    const { page } = app;
    await page.getByRole('button', { name: 'Check now' }).click();
    await page.getByText('3 changes ready to apply', { exact: true }).waitFor();
    await shot(page, `sync-${scheme}`);
    if (scheme === 'dark') {
      await page.getByRole('button', { name: 'Review', exact: true }).click();
      await page.locator('dialog.sheet[open]').getByText('Not ready yet').waitFor();
      await shot(page, 'review');
    }
  } finally { await app.close(); }
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
    await shot(page, 'marionette-guide', 560);
    if (errors.length) throw Error('Page errors: ' + errors.join('; '));
  } finally { await browser.close(); }
}
