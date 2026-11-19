// The native shell, on the real executable: start with Windows, close to the tray, start in the
// background, and the background worker. It talks to the shell's `request` command from the
// page (window.__TAURI_INTERNALS__.invoke), not through the interface, and it asks the window
// to close the way the operating system does: WM_CLOSE posted to it. Whether the window is shown is
// read from user32 (IsWindowVisible): document.visibilityState stays 'visible' in WebView2 when
// its host window is hidden, so it says nothing here.
//
// Not covered here: the tray menu itself. It is a native menu with no way in from a page.
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const executable = resolve(process.env.MURO_DESKTOP_EXE || 'target/debug/muro-desktop.exe');
await access(executable);
const root = await mkdtemp(join(tmpdir(), 'muro-native-shell-'));
const data = join(root, 'data'), profile = join(root, 'opencode'), artifact = join(root, 'package');
await Promise.all([mkdir(data), mkdir(profile), mkdir(artifact)]);
await writeFile(join(profile, 'opencode.json'), '{}');
await writeFile(join(artifact, 'package.json'), JSON.stringify({ name: 'muro-native-shell-smoke', version: '1.0.0', type: 'module', main: 'index.js' }));
await writeFile(join(artifact, 'index.js'), 'export default async () => ({});\n');

// A Run value of this test's own, deleted in the finally: never the real one, named `Muro`.
const valueName = `MuroTest-${randomBytes(6).toString('hex')}`;
const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const reg = join(process.env.SystemRoot, 'System32', 'reg.exe');
const runValue = () => {
  const result = spawnSync(reg, ['query', runKey, '/v', valueName], { encoding: 'utf8' });
  if (result.status === 1) return null;
  assert.equal(result.status, 0, result.stderr);
  const line = result.stdout.split(/\r?\n/).find(l => l.trim().startsWith(valueName));
  return line.trim().slice(valueName.length).trim().replace(/^REG_SZ\s+/, '');
};
const command = `"${executable}" --background`;
const sameText = (a, b) => a?.toLowerCase() === b.toLowerCase();

// The main window of a process, found and closed through user32.
const windowScript = join(root, 'window.ps1');
await writeFile(windowScript, `param([uint32]$ProcessId, [string]$Action, [int]$Milliseconds = 0)
$source = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class MuroWindow {
  delegate bool EnumProc(IntPtr window, IntPtr parameter);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr parameter);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
  public static IntPtr Find(uint process, string title) {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate (IntPtr window, IntPtr parameter) {
      uint owner;
      GetWindowThreadProcessId(window, out owner);
      if (owner != process) return true;
      StringBuilder text = new StringBuilder(256);
      GetWindowText(window, text, 256);
      if (text.ToString() != title) return true;
      found = window;
      return false;
    }, IntPtr.Zero);
    return found;
  }
  public static bool Visible(IntPtr window) { return IsWindowVisible(window); }
  public static void Close(IntPtr window) { PostMessage(window, 0x0010, IntPtr.Zero, IntPtr.Zero); }
}
'@
Add-Type -TypeDefinition $source
$found = $false; $visible = $false; $posted = $false
$end = [DateTime]::UtcNow.AddMilliseconds($Milliseconds)
do {
  $window = [MuroWindow]::Find($ProcessId, 'Muro')
  if ($window -ne [IntPtr]::Zero) {
    $found = $true
    if ([MuroWindow]::Visible($window)) { $visible = $true }
    if ($Action -eq 'close') { [MuroWindow]::Close($window); $posted = $true; break }
  }
  if ($Milliseconds -gt 0) { Start-Sleep -Milliseconds 100 }
} while ([DateTime]::UtcNow -lt $end)
@{ found = $found; visible = $visible; posted = $posted } | ConvertTo-Json -Compress
`);
/** action 'look': whether the window exists and whether it was visible at any moment of the next
 *  \`milliseconds\`; 'close': posts WM_CLOSE to it, as the close button does. */
const windowOf = (app, action, milliseconds = 0) => {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', windowScript,
    '-ProcessId', String(app.pid), '-Action', action, '-Milliseconds', String(milliseconds)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  return JSON.parse(result.stdout.trim().split(/\r?\n/).pop());
};

const until = async (what, check, timeout = 60000) => {
  const end = Date.now() + timeout;
  let last;
  for (;;) {
    try { const value = await check(); if (value) return value; } catch (error) { last = error; }
    if (Date.now() > end) throw Error(`Timed out: ${what}${last ? `: ${last.message}` : ''}`);
    await delay(200);
  }
};
const exited = async (app, ms) => {
  if (app.exitCode !== null) return true;
  return Promise.race([once(app, 'exit').then(() => true), delay(ms).then(() => false)]);
};
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const automation = () => json(join(data, 'automation-status.json'));

const port = Number(process.env.MURO_CDP_PORT || 9228), endpoint = `http://127.0.0.1:${port}`;
try { await fetch(endpoint + '/json/version'); throw Error(`CDP port ${port} is already in use`); } catch (e) { if (e.message.includes('already in use')) throw e; }

const running = new Set();
/** Starts the executable with `args` and reaches its page over CDP. The window is not hidden by the
 *  operating system's start-up flags: whether it shows is the shell's own doing. */
async function launch(...args) {
  const app = spawn(executable, args, {
    env: { ...process.env, MURO_DATA_DIR: data, MURO_AUTOSTART_NAME: valueName, WEBVIEW2_USER_DATA_FOLDER: join(root, 'webview'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
    stdio: 'pipe', windowsHide: false,
  });
  running.add(app);
  let output = '';
  app.stdout.on('data', b => output += b); app.stderr.on('data', b => output += b);
  try {
    await until('CDP', async () => { if (app.exitCode !== null) throw Error(`App exited ${app.exitCode}: ${output}`); return (await fetch(endpoint + '/json/version')).ok; });
    const browser = await chromium.connectOverCDP(endpoint);
    const page = await until('page', () => browser.contexts().flatMap(c => c.pages()).find(p => !p.url().startsWith('devtools:')));
    await page.waitForFunction(() => window.__TAURI_INTERNALS__?.invoke);
    // The registry answers one writer at a time: a request that meets the worker's read tries again.
    const call = async (action, payload = {}) => {
      for (let attempt = 0; ; attempt++) {
        try { return await page.evaluate(([a, p]) => window.__TAURI_INTERNALS__.invoke('request', { action: a, payload: p }), [action, payload]); }
        catch (error) { if (attempt >= 20 || !/busy/i.test(error.message)) throw error; await delay(250); }
      }
    };
    const save = async (action, key, value) => call(action, { revision: (await call('registry')).revision, [key]: value });
    const settings = async changes => {
      const registry = await call('registry');
      return call('settings', { revision: registry.revision, settings: { ...registry.settings, ...changes } });
    };
    return { app, browser, page, call, save, settings, output: () => output };
  } catch (error) { app.kill(); console.error(output); throw error; }
}
/** Posts WM_CLOSE and returns whether the process ended within `ms`. */
const closeWindow = async (run, ms) => { windowOf(run.app, 'close'); return exited(run.app, ms); };

const results = [];
try {
  // 1. Started as a user starts it: the window is shown once the backend answers.
  const first = await launch();
  await until('window shown', () => windowOf(first.app, 'look').visible);
  results.push('window shown without --background');

  // 2. Start with Windows: the shell answers `autostart` and `set_autostart` itself.
  assert.equal((await first.call('registry')).settings.close_to_tray, true);
  assert.deepEqual(await first.call('autostart'), { supported: true, enabled: false, current: false });
  assert.equal(runValue(), null);
  assert.deepEqual(await first.call('set_autostart', { enabled: true }), { supported: true, enabled: true, current: true });
  assert.ok(sameText(runValue(), command), `Run value ${runValue()} is not ${command}`);
  assert.deepEqual(await first.call('autostart'), { supported: true, enabled: true, current: true });
  assert.deepEqual(await first.call('set_autostart', { enabled: false }), { supported: true, enabled: false, current: false });
  assert.equal(runValue(), null);
  for (const enabled of ['yes', null, undefined]) {
    await assert.rejects(first.call('set_autostart', { enabled }), /enabled must be a boolean/);
  }
  assert.equal(runValue(), null);
  results.push('autostart on and off in the Run key, refused unless a boolean');

  // 3. The worker's first pass: a check that only looks, as automatic sync is off. Empty registry.
  const idle = await until('first pass', automation);
  assert.deepEqual([idle.action, idle.status, idle.message], ['Background check', 'complete', 'Everything is in sync']);
  results.push('worker checks at start without applying when auto_sync is off');

  // 4. Seed the registry: one harness over a profile folder, one plugin built for it.
  await first.save('save_target', 'target', { id: 'oc', harness: 'opencode', name: 'OpenCode shell test', root: profile, executable: '', exclusive: true, enabled: true });
  await first.save('save_plugin', 'plugin', { id: 'example', name: 'Example', source: artifact, policy: 'pinned', pinned_version: '1.0.0', targets: ['oc'], distributions: [{ harness: 'opencode', path: artifact, version: '1.0.0' }] });
  const plugins = async () => ((await json(join(profile, 'opencode.json'))).plugins ?? []).length;

  // 5. Closing the window: with close_to_tray the process stays and the window is hidden.
  assert.equal(await closeWindow(first, 1000), false, 'closed with close_to_tray on');
  const hidden = windowOf(first.app, 'look');
  assert.deepEqual([hidden.found, hidden.visible], [true, false]);
  await first.settings({ close_to_tray: false });
  assert.equal(await closeWindow(first, 3000), true, 'still running after close with close_to_tray off');
  await first.browser.close().catch(() => {});
  running.delete(first.app);
  results.push('close hides the window with close_to_tray on and ends the process with it off');

  // 6. --background: no window. The value that names another copy of Muro is repaired at start.
  spawnSync(reg, ['add', runKey, '/v', valueName, '/t', 'REG_SZ', '/d', '"C:\\Muro Old\\Muro.exe" --background', '/f']);
  const second = await launch('--background');
  assert.ok(sameText(runValue(), command), `Run value not repaired: ${runValue()}`);
  // The worker has run once the status shows what it found: by then setup is over.
  const waiting = await until('background check', async () => { const s = await automation(); return s.message === '1 change waiting' && s; });
  assert.deepEqual([waiting.action, waiting.status], ['Background check', 'complete']);
  const look = windowOf(second.app, 'look', 1500);
  assert.deepEqual([look.found, look.visible], [true, false], 'a window was shown with --background');
  assert.equal(await plugins(), 0, 'applied with auto_sync off');
  results.push('--background starts without a window; a value of another copy is repaired; a check leaves the plugin uninstalled');

  // 7. Automatic sync on: the next start applies what the check found.
  await second.settings({ auto_sync: true });
  assert.equal(await closeWindow(second, 3000), true);
  await second.browser.close().catch(() => {});
  running.delete(second.app);
  const third = await launch('--background');
  const applied = await until('automatic sync', async () => { const s = await automation(); return s.action === 'Automatic sync' && s; });
  assert.deepEqual([applied.status, applied.message], ['complete', '1 change applied']);
  assert.equal(await plugins(), 1);
  assert.equal(await closeWindow(third, 3000), true);
  await third.browser.close().catch(() => {});
  running.delete(third.app);
  results.push('worker applies at start when auto_sync is on');
  console.log(JSON.stringify({ status: 'pass', test: 'native shell: autostart, close to tray, background start, worker', checks: results, data_dir: root }));
} catch (e) {
  throw e;
} finally {
  for (const app of running) app.kill();
  spawnSync(reg, ['delete', runKey, '/v', valueName, '/f']);
  await delay(500);
  await rm(root, { recursive: true, force: true }).catch(() => {});
}
