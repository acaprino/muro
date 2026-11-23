import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
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
const code = async () => (await files(source)).filter(path => /\.tsx?$/.test(path));
const name = (path: string) => relative(source, path).replace(/\\/g, '/');

test('desktop appearance is imported from Sigrid, with no application stylesheet rules (ADR-0031)', async () => {
  const styles = (await files(source)).filter(path => path.endsWith('.css'));
  assert.equal(styles.length, 1);
  const css = await readFile(styles[0], 'utf8');
  assert.match(css, /@import "@acaprino\/sigrid\/theme\.css";/);
  assert.doesNotMatch(css, /[{}]/, 'the entry imports and declares sources: it holds no rule of its own');
});

test('the application has no private SVG renderer, inline style or HTML string, in a .ts or a .tsx file', async () => {
  for (const path of await code()) {
    const text = await readFile(path, 'utf8');
    assert.doesNotMatch(text, /<svg\b|createElementNS\(|\bstyle=|\.style[.\[]|dangerouslySetInnerHTML|\binnerHTML\b/, name(path));
  }
});

// The window glue (window controls, zoom, the guard of the browser's own keys) is the one thing the desktop still takes from Imago: Sigrid has no Tauri side
// (ADR-0031 and the plan R0 ruling). Nothing else of Imago, in particular none of its markup, graph or UI modules, is imported.
test('the only Imago the application imports is the window glue: its shell module and the Tauri adapter', async () => {
  const allowed = new Set(['@acaprino/imago/shell', '@acaprino/imago/tauri']);
  const found: string[] = [];
  for (const path of await code()) {
    const text = await readFile(path, 'utf8');
    for (const match of text.matchAll(/(?:from\s+|import\(\s*|import\s+)['"](@acaprino\/imago[^'"]*)['"]/g)) {
      found.push(match[1]);
      assert.ok(allowed.has(match[1]), `${name(path)} imports ${match[1]}`);
    }
  }
  assert.ok(found.includes('@acaprino/imago/shell'), 'the glue is still where the window controls and the zoom are mounted');
});

test('the graph adapter contains domain data and leaves all geometry to Sigrid', async () => {
  const adapter = await readFile(join(source, 'pages/project/graphScene.ts'), 'utf8');
  assert.match(adapter, /from '@acaprino\/sigrid\/graph'/);
  assert.doesNotMatch(adapter, /createElement|innerHTML|viewBox|textWidth|\bwidth\s*:|\bheight\s*:/);
  const workspace = await readFile(join(source, 'pages/project/Workspace.tsx'), 'utf8');
  assert.match(workspace, /GraphCanvas/);
  assert.match(workspace, /from '@acaprino\/sigrid\/graph'/);
});
