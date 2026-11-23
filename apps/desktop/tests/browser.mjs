// Runs the browser test files one after the other (each starts its own dev server on MURO_UI_PORT and closes it), and
// fails when one fails. A single file runs on its own: node apps/desktop/tests/browser-shell.mjs
// For now only browser-shell.mjs: plan R0, Task 3, put the React window in place of the Imago one, and the other
// browser-*.mjs files test pages the new window does not have yet. They stay in the folder until Task 6 deletes them.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const files = ['browser-shell.mjs'];
const failed = [];
for (const file of files) {
  console.log(`--- ${file}`);
  const code = await new Promise(done => spawn(process.execPath, [here + file], { stdio: 'inherit', windowsHide: true }).on('exit', c => done(c ?? 1)));
  if (code) failed.push(file);
}
if (failed.length) { console.error('FAILED: ' + failed.join(', ')); process.exit(1); }
console.log(`PASS: ${files.length} browser file(s)`);
