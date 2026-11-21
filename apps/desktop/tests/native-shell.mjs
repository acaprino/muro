// The native shell, on the real executable: start with Windows, close to the tray, start in the
// background, the background worker, and one running Muro for each data directory. It talks to the shell's `request` command from the
// page (window.__TAURI_INTERNALS__.invoke), not through the interface, and it asks the window
// to close the way the operating system does: WM_CLOSE posted to it. Whether the window is shown is
// read from user32 (IsWindowVisible): document.visibilityState stays 'visible' in WebView2 when
// its host window is hidden, so it says nothing here.
//
// A registry that is held while the window asks (section 8): a source that takes seconds to answer makes a check hold the
// registry lock that long. It is a git clone of a local server that accepts the connection and hangs up after a while.
//
// Not covered here: the tray menu itself. It is a native menu with no way in from a page.
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { resolve, join, dirname } from 'node:path';
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

const port = Number(process.env.MURO_CDP_PORT || 9228);
// A second Muro, on another data directory, needs a debugging port of its own.
for (const cdp of [port, port + 1]) {
  try { await fetch(`http://127.0.0.1:${cdp}/json/version`); throw Error(`CDP port ${cdp} is already in use`); } catch (e) { if (e.message.includes('already in use')) throw e; }
}

const running = new Set();
/** Starts the executable with `args` and reaches its page over CDP. The window is not hidden by the
 *  operating system's start-up flags: whether it shows is the shell's own doing. */
async function launch(args = [], { dataDir = data, cdpPort = port } = {}) {
  const endpoint = `http://127.0.0.1:${cdpPort}`;
  const app = spawn(executable, args, {
    env: { ...process.env, MURO_DATA_DIR: dataDir, MURO_AUTOSTART_NAME: valueName, WEBVIEW2_USER_DATA_FOLDER: join(root, 'webview'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}` },
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
    // Straight to the shell's command: the registry answers one writer at a time, and waiting for it is the shell's own doing.
    const call = (action, payload = {}) => page.evaluate(([a, p]) => window.__TAURI_INTERNALS__.invoke('request', { action: a, payload: p }), [action, payload]);
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

/** Starts the executable again, as a user does with a Muro already running, and gives it `ms` to end
 *  on its own: whether it did, its exit code, how long it took and what it printed. */
async function startAgain(args = [], dataDir = data, ms = 5000) {
  const began = Date.now();
  const app = spawn(executable, args, {
    env: { ...process.env, MURO_DATA_DIR: dataDir, MURO_AUTOSTART_NAME: valueName },
    stdio: 'pipe', windowsHide: false,
  });
  running.add(app);
  let output = '';
  app.stdout.on('data', b => output += b); app.stderr.on('data', b => output += b);
  const ended = await exited(app, ms);
  const took = Date.now() - began;
  if (!ended) app.kill();
  running.delete(app);
  return { ended, code: app.exitCode, took, output };
}

/** How many backends (muroctl) serve `dir` right now, whoever started them. */
const backends = dir => {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `@(Get-CimInstance Win32_Process -Filter "Name='muroctl.exe'" | Where-Object { $_.CommandLine.Contains($env:MURO_PROBE) }).Count`],
    { encoding: 'utf8', env: { ...process.env, MURO_PROBE: dir } });
  assert.equal(result.status, 0, result.stderr);
  return Number(result.stdout.trim());
};

const results = [];
// What section 8 starts and the finally ends: the processes that hold the registry, and the server that never answers.
const holders = [];
let stall;
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

  // 4b. Whoever asks for it, a sync_now goes through the shell's gate and runs after the one in
  // progress. Alone, the registry refuses the second writer with "Registry is busy". The worker's own
  // reads can take that lock for a moment too, so a round with a refusal is tried again: without the
  // gate every round has one.
  const raw = () => first.page.evaluate(() => window.__TAURI_INTERNALS__.invoke('request', { action: 'sync_now', payload: { apply: false } }));
  let refused = [];
  for (let round = 0; round < 3; round++) {
    refused = (await Promise.allSettled([raw(), raw(), raw()])).filter(r => r.status === 'rejected').map(r => String(r.reason));
    if (refused.length === 0) break;
  }
  assert.deepEqual(refused, [], 'simultaneous sync_now calls were not run one after the other');
  results.push('simultaneous sync_now requests run one after the other');

  // 5. Closing the window: with close_to_tray the process stays and the window is hidden.
  assert.equal(await closeWindow(first, 1000), false, 'closed with close_to_tray on');
  const hidden = windowOf(first.app, 'look');
  assert.deepEqual([hidden.found, hidden.visible], [true, false]);

  // 5a. The window that was hidden reads the registry again when it is shown: what the worker did meanwhile shows. The shell's
  // command is watched from here, to see the page ask.
  await first.page.evaluate(() => {
    window.__asked = [];
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = (command, args, ...rest) => { if (command === 'request') window.__asked.push(args.action); return invoke.call(window.__TAURI_INTERNALS__, command, args, ...rest); };
  });

  // 5b. One Muro for each data directory. Started again while it waits in the tray, Muro shows the
  // window of the one that runs; the new process ends by itself, with no error and no second backend.
  assert.equal(backends(data), 1);
  const again = await startAgain();
  assert.deepEqual([again.ended, again.code, again.output], [true, 0, ''], `second start: ${JSON.stringify(again)}`);
  assert.ok(again.took < 5000, `second start took ${again.took} ms`);
  await until('first window shown by the second start', () => windowOf(first.app, 'look').visible, 5000);
  await until('the window shown again reads the registry again', () => first.page.evaluate(() => window.__asked.includes('snapshot')), 10000);
  results.push('a window that is shown again reads the registry again');
  assert.equal(backends(data), 1, 'a second backend was started');
  results.push('a second start for the same data directory ends with 0 and shows the window that runs');

  // Started with Windows (--background) while Muro runs: it ends and shows nothing.
  assert.equal(await closeWindow(first, 1000), false, 'closed with close_to_tray on');
  assert.equal(windowOf(first.app, 'look').visible, false);
  const quiet = await startAgain(['--background']);
  assert.deepEqual([quiet.ended, quiet.code, quiet.output], [true, 0, ''], `second start with --background: ${JSON.stringify(quiet)}`);
  const stillHidden = windowOf(first.app, 'look', 1500);
  assert.deepEqual([stillHidden.found, stillHidden.visible], [true, false], 'a window was shown by --background');
  assert.equal(backends(data), 1);
  results.push('a second start with --background ends with 0 and shows nothing');

  // Another data directory is another Muro: its own backend and window, the first one untouched.
  const otherData = join(root, 'other-data');
  const other = await launch([], { dataDir: otherData, cdpPort: port + 1 });
  await until('window of the other data directory', () => windowOf(other.app, 'look').visible);
  assert.equal((await other.call('snapshot')).data_dir, otherData);
  assert.equal(backends(otherData), 1);
  assert.equal(backends(data), 1);
  assert.equal(first.app.exitCode, null);
  assert.equal(windowOf(first.app, 'look').visible, false, 'the other Muro woke the first one');
  await other.settings({ close_to_tray: false });
  assert.equal(await closeWindow(other, 3000), true, 'the other Muro did not end');
  await other.browser.close().catch(() => {});
  running.delete(other.app);
  results.push('another data directory starts its own backend and window');

  await first.settings({ close_to_tray: false });
  assert.equal(await closeWindow(first, 3000), true, 'still running after close with close_to_tray off');
  await first.browser.close().catch(() => {});
  running.delete(first.app);
  results.push('close hides the window with close_to_tray on and ends the process with it off');

  // 6. --background: no window. The value that names another copy of Muro is repaired at start.
  spawnSync(reg, ['add', runKey, '/v', valueName, '/t', 'REG_SZ', '/d', '"C:\\Muro Old\\Muro.exe" --background', '/f']);
  const second = await launch(['--background']);
  // The repair runs beside the window, on a thread of its own, so it is waited for.
  await until('the Run value is repaired', () => sameText(runValue(), command), 10000).catch(() => assert.fail(`Run value not repaired: ${runValue()}`));
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
  // A value that names another Muro that is still there is left to it: a development build or a
  // portable copy that starts does not become the one that starts with Windows.
  const installed = `"${process.execPath}" --background`;
  spawnSync(reg, ['add', runKey, '/v', valueName, '/t', 'REG_SZ', '/d', installed, '/f']);
  const third = await launch(['--background']);
  const applied = await until('automatic sync', async () => { const s = await automation(); return s.action === 'Automatic sync' && s; });
  assert.deepEqual([applied.status, applied.message], ['complete', '1 change applied']);
  assert.equal(await plugins(), 1);
  assert.ok(sameText(runValue(), installed), `a value of another existing executable was taken over: ${runValue()}`);
  assert.equal(await closeWindow(third, 3000), true);
  await third.browser.close().catch(() => {});
  running.delete(third.app);
  results.push('worker applies at start when auto_sync is on; a value naming another existing executable is left alone');

  // 8. A registry that is held while the window asks. `muroctl request check` is another process that holds it for as long as the
  // source takes to answer; `sync_now` is the shell's own worker doing the same.
  let stallMs = 6000;
  stall = createServer(socket => { socket.on('error', () => {}); setTimeout(() => socket.destroy(), stallMs); });
  await new Promise(done => stall.listen(0, '127.0.0.1', done));
  const slowData = join(root, 'slow-data'), slowProfile = join(root, 'slow-profile');
  await mkdir(slowProfile);
  await writeFile(join(slowProfile, 'opencode.json'), '{}');
  const ctl = join(dirname(executable), 'muroctl.exe');
  await access(ctl);
  const seed = async (action, payload) => {
    const file = join(root, 'payload.json');
    await writeFile(file, JSON.stringify(payload));
    const done = spawnSync(ctl, ['--data', slowData, 'request', action, '--input', file], { encoding: 'utf8' });
    assert.equal(done.status, 0, done.stderr);
  };
  await seed('save_target', { revision: 0, target: { id: 'slow-oc', harness: 'opencode', name: 'OpenCode slow test', root: slowProfile, executable: '', exclusive: false, enabled: true } });
  await seed('save_plugin', { revision: 1, plugin: { id: 'slow', name: 'Slow source', source: `https://127.0.0.1:${stall.address().port}/slow/plugin.git`, policy: 'pinned', pinned_version: 'v1', targets: [], distributions: [] } });
  const holdRegistry = () => { const holder = spawn(ctl, ['--data', slowData, 'request', 'check'], { stdio: 'ignore', windowsHide: true }); holders.push(holder); return holder; };
  const registryBusy = () => /Registry is busy/.test(spawnSync(ctl, ['--data', slowData, 'request', 'snapshot'], { encoding: 'utf8' }).stderr);
  const slowAutomation = () => json(join(slowData, 'automation-status.json'));

  // 8a. Muro starts while another process holds the registry: it waits for it, and shows its page.
  holdRegistry();
  await until('the registry is held', registryBusy, 15000);
  const slow = await launch([], { dataDir: slowData, cdpPort: port + 1 });
  await slow.page.locator('section.im-summary').waitFor({ timeout: 60000 });
  results.push('a launch while the registry is held waits for it and shows the Sync page');

  // 8b. The worker's first check could not resolve the source: the run is a failed one, with the plugin's name.
  const first8 = await until('the worker checked', async () => { const s = await slowAutomation(); return s.action === 'Background check' && s; }, 60000);
  assert.deepEqual([first8.status, first8.message], ['failed', 'Sources not checked: Slow source']);
  const recorded = await json(join(slowData, 'sync-status.json'));
  assert.deepEqual([recorded.errors, recorded.pending, recorded.blockers], [1, 0, 0]);
  results.push('a check that could not resolve a source is recorded as failed, with its name, and counted in sync-status.json');

  // 8c. A window opened while the registry is held, after that check: its first request waits for the lock, never reads
  // "Registry not available", and the strip shows what was recorded (not "Not checked yet").
  await slow.page.addInitScript(() => {
    window.__unavailable = false;
    new MutationObserver(() => { if (document.body?.innerText.includes('Registry not available')) window.__unavailable = true; }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  holdRegistry();
  await until('the registry is held again', registryBusy, 15000);
  const began = Date.now();
  await slow.page.reload();
  await slow.page.locator('section.im-summary').waitFor({ timeout: 60000 });
  assert.ok(Date.now() - began >= 1000, `the first request did not wait (${Date.now() - began} ms)`);
  assert.equal(await slow.page.evaluate(() => window.__unavailable), false, 'the page said the registry is not available');
  assert.equal(await slow.page.locator('section.im-summary strong').first().textContent(), '1 source could not be checked');
  assert.match(await slow.page.locator('.im-titlebar-status').textContent(), /Sources not checked/);
  results.push('a request that meets a held registry waits for it; the window opens on the recorded check, with the source it could not resolve');

  // 8d. A sync in progress is waited for by any request, however long it lasts (here longer than the 15 s a busy registry is
  // tried again for), and its failure is recorded whole.
  stallMs = 18000;
  const before = Number((await slowAutomation()).time);
  const syncing = slow.call('sync_now', { apply: false });
  syncing.catch(() => {});
  await delay(1500);
  const asked = Date.now();
  const snapshot = await slow.call('snapshot');
  assert.ok(Date.now() - asked >= 10000, `a request did not wait for the sync (${Date.now() - asked} ms)`);
  assert.equal(snapshot.registry.plugins.length, 1);
  const result = await syncing;
  assert.equal(result.errors.length, 1);
  assert.ok(Number((await slowAutomation()).time) > before);
  results.push('a request waits for the sync in progress, past the time a busy registry is tried again for');

  // 8e. Close with "Keep running when the window is closed" off, in the middle of a sync: the window goes at once, the process
  // waits for the sync (and records it) and then ends. Before, a registry that was busy meant "stay".
  stallMs = 6000;
  await slow.settings({ close_to_tray: false });
  const earlier = Number((await slowAutomation()).time);
  const midSync = slow.call('sync_now', { apply: false });
  midSync.catch(() => {});
  await delay(1500);
  windowOf(slow.app, 'close');
  assert.equal(windowOf(slow.app, 'look').visible, false, 'the window stayed');
  assert.equal(await exited(slow.app, 2500), false, 'it ended in the middle of the sync');
  assert.equal(await exited(slow.app, 40000), true, 'it did not end after the sync');
  const ended = await slowAutomation();
  assert.ok(Number(ended.time) > earlier, 'the sync was cut off before it recorded itself');
  assert.equal(ended.message, 'Sources not checked: Slow source');
  await slow.browser.close().catch(() => {});
  running.delete(slow.app);
  results.push('a close with the setting off ends Muro after the sync in progress, while the registry is held');
  console.log(JSON.stringify({ status: 'pass', test: 'native shell: autostart, close to tray, background start, worker, one running Muro, a held registry', checks: results, data_dir: root }));
} catch (e) {
  throw e;
} finally {
  for (const app of running) app.kill();
  for (const holder of holders) holder.kill();
  stall?.close();
  spawnSync(reg, ['delete', runKey, '/v', valueName, '/f']);
  await delay(500);
  await rm(root, { recursive: true, force: true }).catch(() => {});
}
