// The theme of the window, the part without React and Sigrid (src/theme.ts): Muro's accent, the choice and where it is
// kept, the scheme it resolves to, and what the native window is told. What Sigrid's engine paints from it, the accent
// included, is read in a browser (tests/browser-shell.mjs): the package is not loaded under plain Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MURO_ACCENT, MURO_HUE, THEME_CHOICES, THEME_KEY, THEME_LABELS, otherChoices, parseChoice, readChoice, resolveScheme, windowTheme, writeChoice } from '../src/theme.ts';

test('the accent is the one Imago computed for Muro: oklch(0.82 0.12 170) in dark, oklch(0.47 0.13 170) in light', () => {
  assert.equal(MURO_HUE, 170);
  assert.deepEqual(MURO_ACCENT.dark, { L: 0.82, C: 0.12, h: 170 });
  assert.deepEqual(MURO_ACCENT.light, { L: 0.47, C: 0.13, h: 170 });
});

test('the system choice follows Windows; light and dark stay themselves whatever Windows says', () => {
  assert.equal(resolveScheme('system', true), 'dark');
  assert.equal(resolveScheme('system', false), 'light');
  for (const systemIsDark of [true, false]) {
    assert.equal(resolveScheme('light', systemIsDark), 'light');
    assert.equal(resolveScheme('dark', systemIsDark), 'dark');
  }
});

test('a stored value that is not light or dark follows Windows: nothing stored, a stale look, a corrupt value', () => {
  assert.equal(parseChoice('light'), 'light');
  assert.equal(parseChoice('dark'), 'dark');
  for (const value of [null, undefined, '', 'system', 'oni', 'Dark', ' light', 42, {}, ['dark']]) assert.equal(parseChoice(value), 'system', String(value));
});

test('the choice is kept under muro.theme, the key of the old window, and a storage that fails changes nothing', () => {
  assert.equal(THEME_KEY, 'muro.theme');
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(readChoice(storage), 'system', 'nothing stored yet');
  writeChoice(storage, 'dark');
  assert.equal(values.get('muro.theme'), 'dark');
  assert.equal(readChoice(storage), 'dark');
  values.set('muro.theme', 'oni');
  assert.equal(readChoice(storage), 'system', 'a value the window never wrote');
  const broken = { getItem: (): string | null => { throw new Error('blocked'); }, setItem: (): void => { throw new Error('blocked'); } };
  assert.equal(readChoice(broken), 'system');
  assert.doesNotThrow(() => writeChoice(broken, 'light'));
  assert.equal(readChoice(null), 'system', 'no storage at all');
  assert.doesNotThrow(() => writeChoice(undefined, 'light'));
});

test('the palette offers the two choices besides the one in use, in the order of the three', () => {
  assert.deepEqual(THEME_CHOICES, ['system', 'light', 'dark']);
  assert.deepEqual(otherChoices('system'), ['light', 'dark']);
  assert.deepEqual(otherChoices('light'), ['system', 'dark']);
  assert.deepEqual(otherChoices('dark'), ['system', 'light']);
  assert.deepEqual(THEME_LABELS, { system: 'Follow Windows', light: 'Light theme', dark: 'Dark theme' });
});

test('the native window is told the choice, the one look Sigrid has (Smooth to the crate) and the scheme drawn', () => {
  assert.deepEqual(windowTheme('system', 'dark'), { theme: 'system', look: 'smooth', resolved: 'dark' });
  assert.deepEqual(windowTheme('light', 'light'), { theme: 'light', look: 'smooth', resolved: 'light' });
});
