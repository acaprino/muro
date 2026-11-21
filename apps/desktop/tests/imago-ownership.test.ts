import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const source = fileURLToPath(new URL('../src/', import.meta.url));
async function files(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else result.push(path);
  }
  return result;
}

test('desktop appearance is imported from Imago, with no application stylesheet rules', async () => {
  const styles = (await files(source)).filter(path => path.endsWith('.css'));
  assert.equal(styles.length, 1);
  assert.equal((await readFile(styles[0], 'utf8')).trim(), '@import "@acaprino/imago/css/imago.css";');
});

test('the application has no private SVG renderer, inline style or UI implementation shim', async () => {
  for (const path of (await files(source)).filter(path => path.endsWith('.ts'))) {
    const text = await readFile(path, 'utf8');
    assert.doesNotMatch(text, /<svg\b|createElementNS\(|\bstyle=|\.style[.\[]/, path);
  }
  const ui = await readFile(join(source, 'ui.ts'), 'utf8');
  assert.doesNotMatch(ui, /<[a-z]+\b/i, 'the compatibility module must only delegate to Imago');
  assert.match(ui, /from '@acaprino\/imago\/ui'/);
});

test('the graph adapter contains domain data and delegates all geometry to Imago', async () => {
  assert.equal((await files(source)).some(path => path.endsWith('graph-draw.ts')), false);
  const adapter = await readFile(join(source, 'pages/project/graph-scene.ts'), 'utf8');
  assert.match(adapter, /from '@acaprino\/imago\/graph-layout'/);
  assert.doesNotMatch(adapter, /createElement|innerHTML|viewBox|textWidth|\bwidth\s*:/);
  const app = await readFile(join(source, 'app.ts'), 'utf8');
  assert.match(app, /graphView\(host,/);
  assert.match(app, /mountedGraph\.dispose\(\)/);
});
