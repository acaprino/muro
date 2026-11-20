// The new interface on the real executable: native WebView2, the real Tauri request command, the real registry service and a
// real OpenCode profile, all in a temporary folder. The flow of a first user: the first run picks the harness, a plugin is
// added, Check now shows the change, Apply all installs it into the profile, the profile's own settings are still there, the
// table shows the installed version, and a second Check finds everything in sync with the times moved.
//
// Isolation: XDG_CONFIG_HOME points at a temporary folder, so the discovery (Mukade) puts OpenCode's configuration folder
// inside it, and the first run picks that harness like anyone does. The other harnesses of this computer are listed and left
// unticked: nothing here reads or writes their folders. (Moving USERPROFILE instead keeps WebView2 from starting.) Start with
// Windows is left on in the first run, under a Run value of this test's own (MURO_AUTOSTART_NAME), which the finally deletes.
//   node apps/desktop/tests/native.mjs        (MURO_DESKTOP_EXE: another executable; MURO_CDP_PORT: another debugging port)
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const executable = resolve(process.env.MURO_DESKTOP_EXE || 'target/debug/muro-desktop.exe');
await access(executable);
const root = await mkdtemp(join(tmpdir(), 'muro-native-ui-'));
const xdg = join(root, 'config'), data = join(root, 'data'), profile = join(xdg, 'opencode'), artifact = join(root, 'native-package');
await Promise.all([mkdir(data), mkdir(profile, { recursive: true }), mkdir(artifact)]);
await writeFile(join(profile, 'opencode.json'), JSON.stringify({ plugins: [], theme: 'retained-test-setting' }));
await writeFile(join(artifact, 'package.json'), JSON.stringify({ name: 'muro-native-ui-smoke', version: '1.0.0', type: 'module', main: 'index.js' }));
await writeFile(join(artifact, 'index.js'), 'export default async () => ({});\n');

const valueName = `MuroTest-${randomBytes(6).toString('hex')}`;
const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const reg = join(process.env.SystemRoot, 'System32', 'reg.exe');
const runValue = () => {
  const result = spawnSync(reg, ['query', runKey, '/v', valueName], { encoding: 'utf8' });
  if (result.status === 1) return null;
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split(/\r?\n/).find(l => l.trim().startsWith(valueName)).trim().slice(valueName.length).trim().replace(/^REG_SZ\s+/, '');
};
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const until = async (what, check, timeout = 60000) => {
  const end = Date.now() + timeout;
  let last;
  for (;;) {
    try { const value = await check(); if (value) return value; } catch (error) { last = error; }
    if (Date.now() > end) throw Error(`Timed out: ${what}${last ? `: ${last.message}` : ''}`);
    await delay(250);
  }
};

const port = Number(process.env.MURO_CDP_PORT || 9227), endpoint = `http://127.0.0.1:${port}`;
try { await fetch(endpoint + '/json/version'); throw Error(`CDP port ${port} is already in use`); } catch (e) { if (e.message.includes('already in use')) throw e; }
const app = spawn(executable, [], {
  env: { ...process.env, XDG_CONFIG_HOME: xdg, MURO_DATA_DIR: data, MURO_AUTOSTART_NAME: valueName, WEBVIEW2_USER_DATA_FOLDER: join(root, 'webview'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
  stdio: 'pipe', windowsHide: true,
});
let output = ''; app.stdout.on('data', b => output += b); app.stderr.on('data', b => output += b);
let browser;
const checks = [];
try {
  await until('CDP', async () => { if (app.exitCode !== null) throw Error(`App exited ${app.exitCode}: ${output}`); return (await fetch(endpoint + '/json/version')).ok; }, 60000);
  browser = await chromium.connectOverCDP(endpoint);
  const page = await until('the WebView page', () => browser.contexts().flatMap(c => c.pages()).find(p => !p.url().startsWith('devtools:')));
  page.setDefaultTimeout(60000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const strip = page.locator('section.strip');
  const headline = () => strip.locator('strong').first().textContent();
  const status = () => json(join(data, 'sync-status.json'));

  // 1. The first run: three steps in place of the tabs. Mukade's discovery takes a while on a real computer.
  await page.locator('#setup-title').filter({ hasText: 'Which coding agents does Muro manage?' }).waitFor({ timeout: 180000 });
  assert.equal(await page.locator('nav').count(), 0, 'the first run shows no tabs');
  const opencode = page.getByRole('checkbox', { name: /OpenCode/ });
  await opencode.waitFor({ timeout: 180000 });
  assert.equal(await opencode.isChecked(), false, 'nothing is ticked for the person');
  assert.ok((await page.locator('.pick').textContent()).toLowerCase().includes(profile.toLowerCase()), 'OpenCode is offered with the profile of the temporary folder');
  await opencode.check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('#setup-title').filter({ hasText: 'Start from what is installed' }).waitFor();
  await page.getByText('Nothing installed yet').waitFor();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('#setup-title').filter({ hasText: 'Keep them in sync by itself?' }).waitFor();
  const auto = page.getByRole('switch', { name: 'Automatic sync' });
  assert.equal(await auto.getAttribute('aria-checked'), 'true', 'automatic sync is offered on');
  await auto.click();    // this test applies by hand: the worker must not do it first
  assert.equal(await auto.getAttribute('aria-checked'), 'false');
  assert.equal(await page.getByRole('switch', { name: 'Start Muro when Windows starts' }).getAttribute('aria-checked'), 'true');
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page.locator('nav').waitFor();
  assert.equal(await page.locator('nav button[aria-current=page] .label').textContent(), 'Sync');
  assert.equal(await runValue(), `"${executable}" --background`, 'Start with Windows wrote this test\'s Run value');
  let registry = await json(join(data, 'registry.json'));
  assert.deepEqual([registry.targets.length, registry.targets[0].harness, registry.targets[0].root.toLowerCase()], [1, 'opencode', profile.toLowerCase()]);
  assert.equal(registry.settings.auto_sync, false);
  assert.equal(registry.plugins.length, 0, 'nothing was imported');
  checks.push('the first run picks OpenCode, found in the temporary folder, imports nothing, saves automatic sync off and the Run value');

  // 2. A plugin is added: a folder source with a prepared OpenCode build.
  await page.getByText('Your list is empty').waitFor();
  await page.getByRole('button', { name: 'Add plugin' }).first().click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Source', { exact: false }).fill(artifact);
  await dialog.getByLabel('Name', { exact: true }).fill('Native IPC smoke');
  assert.equal(await dialog.getByRole('checkbox', { name: /OpenCode/ }).isChecked(), true, 'the one harness is ticked in the new plugin');
  await dialog.getByText('Advanced', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Add build' }).click();
  await dialog.locator('select[name=distribution_harness]').selectOption('opencode');
  await dialog.getByLabel('Build folder').fill(artifact);
  await dialog.getByLabel('Version', { exact: true }).fill('1.0.0');
  await dialog.getByRole('button', { name: 'Add plugin', exact: true }).click();
  await page.locator('#rows').getByText('Native IPC smoke', { exact: true }).waitFor();
  await page.reload();
  await page.locator('#rows').getByText('Native IPC smoke', { exact: true }).waitFor();
  registry = await json(join(data, 'registry.json'));
  assert.equal(registry.plugins.length, 1);
  assert.equal(await page.locator('#setup-title').count(), 0, 'a registry with a harness never shows the first run again');
  checks.push('the plugin is saved, and is still there after a reload');

  // 3. Check now compares the list with the profile and shows the change; nothing is installed yet.
  const checkedBefore = (await status()).last_check;
  await delay(1100);    // the plan after the save recorded a time; the times are in seconds
  await page.getByRole('button', { name: 'Check now', exact: true }).click();
  await until('the check', async () => (await status()).last_check !== checkedBefore);
  await strip.locator('strong', { hasText: '1 change ready to apply' }).waitFor();
  await strip.getByRole('button', { name: 'Apply all 1 change' }).waitFor();
  assert.match(await page.locator('#rows td').nth(2).textContent(), /Install 1\.0\.0/, 'the cell says what a sync would do');
  assert.deepEqual((await json(join(profile, 'opencode.json'))).plugins, [], 'checking installs nothing');
  checks.push('Check now shows "1 change ready to apply" and installs nothing');

  // 4. Apply all installs it into the profile, and the profile's own settings stay.
  await strip.getByRole('button', { name: 'Apply all 1 change' }).click();
  await page.locator('#toasts').getByText('1 change applied.').waitFor();
  await strip.locator('strong', { hasText: 'Everything is in sync' }).waitFor();
  const config = await json(join(profile, 'opencode.json'));
  assert.equal(config.theme, 'retained-test-setting');
  assert.equal(config.plugins.length, 1);
  assert.ok(config.plugins[0].startsWith('file:'));
  assert.match(await page.locator('#rows td').nth(2).textContent(), /1\.0\.0/, 'the table shows the installed version');
  assert.equal(await page.locator('th .hstate').last().textContent().then(t => t.includes('In sync')), true, 'the harness column says In sync');
  const synced = await status();
  assert.ok(synced.last_sync, 'the sync was recorded');
  assert.deepEqual([synced.pending, synced.blockers], [0, 0]);
  await mkdir('apps/desktop/tests/artifacts', { recursive: true });
  await page.screenshot({ path: 'apps/desktop/tests/artifacts/native-sync.png' });
  checks.push('Apply all installs the plugin into the OpenCode profile, which keeps its own setting; the table shows 1.0.0');

  // 5. A second Check finds nothing to do, and the times moved.
  await delay(1100);    // the times are in seconds
  await page.getByRole('button', { name: 'Check now', exact: true }).click();
  const second = await until('the second check', async () => { const s = await status(); return s.last_check !== synced.last_check && s; });
  assert.ok(Number(second.last_check) > Number(synced.last_check), 'Last check moved');
  const id = registry.targets[0].id;
  assert.ok(Number(second.targets[id].checked) > Number(synced.targets[id].checked), 'the harness was checked again');
  assert.equal(second.last_sync, synced.last_sync, 'a check that applies nothing leaves Last sync alone');
  await strip.locator('strong', { hasText: 'Everything is in sync' }).waitFor();
  assert.deepEqual(await page.locator('nav button .label').allTextContents(), ['Projects', 'Sync', 'Activity', 'Settings']);
  assert.equal((await json(join(profile, 'opencode.json'))).plugins.length, 1, 'still one plugin: a second plan changed nothing');
  checks.push('a second Check shows "Everything is in sync" with Last check and the harness\'s checked time moved, and Last sync as it was');

  // 5b. A plugin the person installed by hand before Muro knew it (listed in the profile): Add to my list takes the installation
  // over, so the next check finds it installed instead of planning a second copy beside it (and, on an exclusive harness, the
  // removal of the person's own).
  const own = join(root, 'installed-by-hand');
  await mkdir(own);
  await writeFile(join(own, 'package.json'), JSON.stringify({ name: 'muro-native-own', version: '2.0.0', type: 'module', main: 'index.js' }));
  await writeFile(join(own, 'index.js'), 'export default async () => ({});\n');
  const profileConfig = await json(join(profile, 'opencode.json'));
  await writeFile(join(profile, 'opencode.json'), JSON.stringify({ ...profileConfig, plugins: [...profileConfig.plugins, own] }));
  await page.reload();
  await page.getByText('Installed, not in your list').waitFor();
  await page.getByRole('button', { name: 'Add to my list' }).click();
  await page.locator('#toasts').getByText('added to your list.').waitFor();
  const adopted = Object.values(await json(join(data, 'receipts.json'))).filter(r => r.native_id === own);
  assert.equal(adopted.length, 1, 'the service wrote one receipt for the installation that was there');
  assert.deepEqual([adopted[0].version, adopted[0].path, adopted[0].adopted], ['2.0.0', own, true]);
  await page.getByRole('button', { name: 'Check now', exact: true }).click();
  await strip.locator('strong', { hasText: 'Everything is in sync' }).waitFor();
  assert.doesNotMatch(await page.locator('#rows').textContent(), /Install\b/, 'the plugin is not planned for installation');
  assert.deepEqual((await json(join(profile, 'opencode.json'))).plugins.length, 2, 'no second copy was installed');
  assert.equal((await status()).pending, 0);
  checks.push('a plugin installed by hand is added with Add to my list: the service binds it, and the next check finds it in sync, not as an install');

  // 6. Settings, through the real service: saved on change; the interface and the registry agree.
  await page.locator('nav').getByRole('button', { name: /^Settings/ }).click();
  await page.getByRole('heading', { name: 'Settings', level: 1 }).waitFor();
  const TRAY = 'Keep running when the window is closed';
  const tray = page.getByRole('switch', { name: TRAY });
  // The page paints a setting only after the service answered, so once it shows it the save is done on disk too.
  const shows = async on => { await page.locator(`[role=switch][aria-label="${TRAY}"][aria-checked="${on}"]`).waitFor(); await page.locator('.busy').waitFor({ state: 'detached' }); };
  assert.equal(await tray.getAttribute('aria-checked'), 'true');
  await tray.click();
  await shows(false);
  const saved = await json(join(data, 'registry.json'));
  assert.equal(saved.settings.close_to_tray, false);
  assert.equal((await status()).revision, saved.revision, 'a settings save keeps the recorded plan current');
  await tray.click();
  await shows(true);
  assert.equal((await json(join(data, 'registry.json'))).settings.close_to_tray, true);
  checks.push('Settings saves on change through the real service and keeps the recorded sync state current');

  // 7. Stop managing: the service refuses a harness that a plugin still lists, so the page takes it off the plugin first.
  await page.locator('nav').getByRole('button', { name: /^Sync/ }).click();
  await page.locator('th .hbtn').click();
  const sheet = page.locator('dialog[open]');
  await sheet.getByRole('button', { name: 'Stop managing' }).click();
  await sheet.getByRole('button', { name: 'Stop managing', exact: true }).click();
  await page.locator('#toasts').getByText(/Muro no longer manages/).waitFor();
  registry = await json(join(data, 'registry.json'));
  assert.deepEqual([registry.targets.length, registry.plugins.length, registry.plugins.flatMap(p => p.targets).length], [0, 2, 0], 'the harness is gone and the plugins kept their place in the list');
  assert.equal((await json(join(profile, 'opencode.json'))).plugins.length, 2, 'the plugins stay installed in the profile');
  checks.push('Stop managing takes the harness off its plugins and removes it; the profile keeps the installed plugins');

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'pass', test: 'native WebView2 + real Tauri IPC: first run, add a plugin, check, apply, check again', checks, screenshot: 'apps/desktop/tests/artifacts/native-sync.png' }));
} catch (e) {
  console.error(output);
  // What the window showed when it failed.
  const shown = await browser?.contexts().flatMap(c => c.pages()).find(p => !p.url().startsWith('devtools:'))?.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  if (shown) console.error('--- the window said:\n' + shown.slice(0, 2000));
  throw e;
} finally {
  await browser?.close().catch(() => {});
  app.kill();
  spawnSync(reg, ['delete', runKey, '/v', valueName, '/f']);
  await delay(500);
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }).catch(() => {});
}
