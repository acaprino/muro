// Runs the browser test files one after the other (each starts its own dev server on MURO_UI_PORT and closes it), and
// fails when one fails. A single file runs on its own: node apps/desktop/tests/browser-shell.mjs
// The files of the React window: the frame (browser-shell.mjs), the project workspace (browser-workspace.mjs) and the write side of a
// project: the AI dialogs (-write-ai), the edits by hand (-write-edit) and the new project and its delete (-write-new). The
// pages that are not in it yet (Sync, Activity, Settings, the first run) bring their own file when they are ported.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const files = ['browser-shell.mjs', 'browser-sync.mjs', 'browser-sync-dialogs.mjs', 'browser-sync-harness.mjs', 'browser-workspace.mjs', 'browser-write-ai.mjs', 'browser-write-edit.mjs', 'browser-write-new.mjs'];
const failed = [];
for (const file of files) {
  console.log(`--- ${file}`);
  const code = await new Promise(done => spawn(process.execPath, [here + file], { stdio: 'inherit', windowsHide: true }).on('exit', c => done(c ?? 1)));
  if (code) failed.push(file);
}
if (failed.length) { console.error('FAILED: ' + failed.join(', ')); process.exit(1); }
console.log(`PASS: ${files.length} browser file(s)`);
