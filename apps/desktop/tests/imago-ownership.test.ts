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

test('desktop appearance is Sigrid\'s: no stylesheet and no class of the application (ADR-0031)', async () => {
  assert.deepEqual((await files(source)).filter(path => path.endsWith('.css')), []);
  for (const path of await code()) assert.doesNotMatch(await readFile(path, 'utf8'), /\b\w*[cC]lassName\b|classList/, name(path));
  assert.match(await readFile(join(source, 'start.tsx'), 'utf8'), /import '@acaprino\/sigrid\/styles\.css';/);
});

test('the application has no private SVG renderer, inline style or HTML string, in a .ts or a .tsx file', async () => {
  for (const path of await code()) {
    const text = await readFile(path, 'utf8');
    assert.doesNotMatch(text, /<svg\b|createElementNS\(|\bstyle=|\.style[.\[]|dangerouslySetInnerHTML|\binnerHTML\b/, name(path));
  }
});

/** The modules a file imports, each with the names it takes from it. */
function imports(text: string): { from: string; names: string[] }[] {
  const found = [...text.matchAll(/import\s+(?:type\s+)?(?:\{([^}]*)\}\s+from\s+|[\w*\s]+from\s+)?['"]([^'"]+)['"]/g)]
    .map(match => ({ from: match[2], names: (match[1] ?? '').split(',').map(part => part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]).filter(Boolean) }));
  return [...found, ...[...text.matchAll(/import\(\s*['"]([^'"]+)['"]/g)].map(match => ({ from: match[1], names: [] }))];
}
// The window, the bar, the frame, the palette, the notices and the theme are Imago's: what it draws with Sigrid's parts, no file of Muro's imports.
const SHELL = ['AppShell', 'TitleBar', 'WindowControls', 'CommandPalette', 'CommandsProvider', 'Toasts', 'useSchemeCommands', 'applyKeptScheme', 'applyTheme', 'applyDensity', 'applyFont', 'colorTheme', 'MotionProvider', 'WordsProvider', 'useDesktopGuard'];
test('the shell is Imago\'s: nothing it draws or wires is imported from Sigrid, and nothing of the window from Tauri', async () => {
  const entries = new Set<string>();
  for (const path of await code()) {
    for (const { from, names } of imports(await readFile(path, 'utf8'))) {
      if (from.startsWith('@acaprino/imago')) entries.add(from);
      if (from.startsWith('@acaprino/sigrid')) assert.deepEqual(names.filter(taken => SHELL.includes(taken)), [], `${name(path)} imports a part of the shell`);
      assert.notEqual(from, '@acaprino/sigrid/tauri', name(path));
      if (from.startsWith('@tauri-apps/')) assert.deepEqual([name(path), from], ['api.ts', '@tauri-apps/api/core'], 'only the request to the service');
    }
  }
  assert.deepEqual([...entries], ['@acaprino/imago'], 'Imago has one entry');
});

test('the graph adapter contains domain data and leaves all geometry to Sigrid', async () => {
  const adapter = await readFile(join(source, 'pages/project/graphScene.ts'), 'utf8');
  assert.match(adapter, /from '@acaprino\/sigrid\/graph'/);
  assert.doesNotMatch(adapter, /createElement|innerHTML|viewBox|textWidth|\bwidth\s*:|\bheight\s*:/);
  const workspace = await readFile(join(source, 'pages/project/Workspace.tsx'), 'utf8');
  assert.match(workspace, /GraphCanvas/);
  assert.match(workspace, /from '@acaprino\/sigrid\/graph'/);
});
