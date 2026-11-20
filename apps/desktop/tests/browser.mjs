// Runs every browser-*.mjs of this folder, one after the other (each starts its own dev server on MURO_UI_PORT and
// closes it), and fails when one fails. A single file runs on its own: node apps/desktop/tests/browser-sync.mjs
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const files = (await readdir(here)).filter(f => /^browser-.+\.mjs$/.test(f) && f !== 'browser-helper.mjs').sort();
const failed = [];
for (const file of files) {
  console.log(`--- ${file}`);
  const code = await new Promise(done => spawn(process.execPath, [here + file], { stdio: 'inherit', windowsHide: true }).on('exit', c => done(c ?? 1)));
  if (code) failed.push(file);
}
if (failed.length) { console.error('FAILED: ' + failed.join(', ')); process.exit(1); }
console.log(`PASS: ${files.length} browser file(s)`);
