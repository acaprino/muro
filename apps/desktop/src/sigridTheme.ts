// Muro's theme in Sigrid's engine: a colour theme made from Muro's accent (`colorTheme`), painted on the root with
// `applyTheme` and the density, and the person's choice as React state, one for the whole window. The numbers, the
// choice and the scheme it resolves to are theme.ts; telling the native window is window.ts.
import { useSyncExternalStore } from 'react';
import { DEFAULT_DENSITY, applyDensity, applyTheme, colorTheme, toHex, type ThemeDef, type ThemeTone } from '@acaprino/sigrid';
import { MURO_ACCENT, readChoice, resolveScheme, writeChoice, type Scheme, type ThemeChoice } from './theme.ts';

/**
 * The tone as the theme was designed. Sigrid's default tone (Vivid) multiplies the chroma of the accent by 1.7 and moves
 * the fill: Muro's accent is fixed, so it is painted as it is. The engine still moves a colour that would miss its
 * contrast; Muro's accent holds it in both schemes (tests/browser-shell.mjs reads what is painted).
 */
export const MURO_TONE: ThemeTone = { intensity: 'theme', light: 'theme' };

/** Muro's accent in a scheme as `#rrggbb`, through Sigrid's own conversion (out of sRGB, the chroma is reduced). */
export function accentHex(scheme: Scheme): string {
  return toHex(MURO_ACCENT[scheme]);
}

/**
 * Muro's theme for a scheme: Sigrid's colour theme made from the accent of that scheme. `colorTheme` takes the colour
 * as the light accent and derives the dark one at its own lightness (0.8), so the accent of the scheme is put back as
 * Muro's; the rest (the page, the lines, the ink, the fill of the solid button) is Sigrid's.
 */
export function muroTheme(scheme: Scheme): ThemeDef {
  const color = accentHex(scheme);
  const base = colorTheme({ id: 'muro', label: 'Muro', color });
  const surfaces = base.surfaces;
  if (!surfaces) return base;
  const own = { ...surfaces[scheme], accent: color };
  return { ...base, surfaces: scheme === 'light' ? { ...surfaces, light: own } : { ...surfaces, dark: own } };
}

/** Paints Muro's theme in `scheme` on `root` (the document's root element): its colours, the tone and the density. */
export function paintScheme(root: HTMLElement, scheme: Scheme): void {
  applyTheme(root, { theme: muroTheme(scheme), scheme, tone: MURO_TONE });
  applyDensity(root, DEFAULT_DENSITY);
}

// The choice, one for the window: every component that asks reads the same, and a change reaches all of them.
const storage = (): Storage | null => { try { return globalThis.localStorage ?? null; } catch { return null; } };
let chosen: ThemeChoice | null = null;
const listeners = new Set<() => void>();
const choiceNow = (): ThemeChoice => (chosen ??= readChoice(storage()));
function choose(next: ThemeChoice): void {
  if (next === choiceNow()) return;
  chosen = next;
  writeChoice(storage(), next);
  for (const listener of listeners) listener();
}
function onChoice(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// What Windows says, through the engine's `prefers-color-scheme`.
const DARK = '(prefers-color-scheme: dark)';
const media = (): MediaQueryList | null => (typeof matchMedia === 'function' ? matchMedia(DARK) : null);
const systemIsDark = (): boolean => media()?.matches ?? false;
function onSystem(listener: () => void): () => void {
  const query = media();
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
}

export interface SchemeState {
  /** What the person chose, kept in `localStorage['muro.theme']`. */
  choice: ThemeChoice;
  /** What the page draws now: the choice, or what Windows says for `system`. */
  resolved: Scheme;
  /** Keeps a new choice; every reader gets it. */
  set(choice: ThemeChoice): void;
}

/** The theme the person chose and the scheme it resolves to, following Windows while the choice is `system`. */
export function useScheme(): SchemeState {
  const choice = useSyncExternalStore(onChoice, choiceNow);
  const dark = useSyncExternalStore(onSystem, systemIsDark);
  return { choice, resolved: resolveScheme(choice, dark), set: choose };
}
