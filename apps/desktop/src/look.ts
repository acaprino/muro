/** The theme of the window: System (the default, follows the operating system), Light or Dark. The choice is the root's
 * `data-theme`, already resolved, and lives in the webview's own storage. There is one look; styles.css holds both palettes. */
export type Theme = 'system' | 'light' | 'dark';
export const THEME_KEY = 'muro.theme';
/** Anything that is not a stored choice (nothing, a stale value) is the default. */
export const storedTheme = (raw: string | null): Theme => (raw === 'light' || raw === 'dark' ? raw : 'system');
export const resolveTheme = (theme: Theme, systemLight: boolean): 'light' | 'dark' => (theme === 'light' || (theme === 'system' && systemLight) ? 'light' : 'dark');

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
export const currentTheme = () => storedTheme(read(THEME_KEY));
const systemLight = () => window.matchMedia('(prefers-color-scheme: light)');

export function applyTheme(): void {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(currentTheme(), systemLight().matches);
  // The desktop window is acrylic: the ground thins so it shows through.
  const native = '__TAURI_INTERNALS__' in window;
  root.classList.toggle('native-glass', native);
  // The title bar follows the theme too; a refusal leaves it on the system's.
  if (native) void import('@tauri-apps/api/window').then(m => m.getCurrentWindow().setTheme(root.dataset.theme as 'light' | 'dark')).catch(() => {});
}
export function saveTheme(theme: Theme): void {
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* the choice lasts until restart */ }
  applyTheme();
}
/** Applies the stored theme and keeps following the system theme. Returns the cleanup. */
export function watchTheme(): () => void {
  applyTheme();
  const media = systemLight();
  media.addEventListener('change', applyTheme);
  return () => media.removeEventListener('change', applyTheme);
}
