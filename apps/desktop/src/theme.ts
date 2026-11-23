// The theme of the window, the part that needs neither React nor Sigrid (tests/theme.test.ts runs it under plain Node):
// the choice the person made and where it is kept, the scheme it resolves to, and Muro's accent as numbers.
// sigridTheme.ts makes Sigrid's theme from them and paints it; window.ts tells the native window.

/** What the person chose: `system` follows Windows. */
export type ThemeChoice = 'system' | 'light' | 'dark';
/** What the page draws: never `system`. */
export type Scheme = 'light' | 'dark';

/** Where the choice is kept, in the webview's own storage: the key the Imago window used, so a choice made there stays. */
export const THEME_KEY = 'muro.theme';
/** The three choices, in the order they are offered, with their words (the palette's, and Settings' once it moves). */
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];
export const THEME_LABELS: Readonly<Record<ThemeChoice, string>> = { system: 'Follow Windows', light: 'Light theme', dark: 'Dark theme' };

/** Muro's hue on the OKLCH wheel, the one Imago gave the app ("One accent per app" of Imago's design file). */
export const MURO_HUE = 170;
/**
 * Muro's accent in each scheme as OKLCH lightness, chroma and hue: the accent Imago computed from the hue, dark
 * `oklch(0.82 0.12 170)` and light `oklch(0.47 0.13 170)`, kept through the move to Sigrid (plan R0).
 */
export const MURO_ACCENT: Readonly<Record<Scheme, { readonly L: number; readonly C: number; readonly h: number }>> = {
  dark: { L: 0.82, C: 0.12, h: MURO_HUE },
  light: { L: 0.47, C: 0.13, h: MURO_HUE },
};

/** The choice a stored value stands for: anything that is not light or dark (nothing stored, a stale or corrupt value) follows Windows. */
export function parseChoice(value: unknown): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** The scheme the page draws for a choice: the choice itself, or for `system` what Windows says. */
export function resolveScheme(choice: ThemeChoice, systemIsDark: boolean): Scheme {
  if (choice === 'system') return systemIsDark ? 'dark' : 'light';
  return choice;
}

/** The choices the palette offers besides the one in use: the two that change something. */
export function otherChoices(choice: ThemeChoice): ThemeChoice[] {
  return THEME_CHOICES.filter(other => other !== choice);
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** The choice kept in `storage`; a storage that is missing or throws (blocked site data, a private window) follows Windows. */
export function readChoice(storage: Store | null | undefined): ThemeChoice {
  try { return parseChoice(storage?.getItem(THEME_KEY)); } catch { return 'system'; }
}

/** Keeps the choice. A storage that refuses it changes nothing else: the window draws the choice until it closes. */
export function writeChoice(storage: Store | null | undefined, choice: ThemeChoice): void {
  try { storage?.setItem(THEME_KEY, choice); } catch { /* kept for this session only */ }
}

/**
 * What the native command `set_window_theme` of the imago-shell crate is told: the word chosen, the look the page draws
 * and the scheme drawn, from which the crate picks the theme and the tint of the window. Sigrid has one look, which the
 * crate knows as Smooth (Imago's ONI look went with the move to Sigrid, plan R0).
 */
export function windowTheme(theme: ThemeChoice, resolved: Scheme): { theme: ThemeChoice; look: 'smooth'; resolved: Scheme } {
  return { theme, look: 'smooth', resolved };
}
