/** The look of the window: Smooth (the default) or Classic (the look Muro was born with). The choice is the root's
 * `data-look`: smooth.css is scoped to it, styles.css is what is left without it. Smooth has a dark and a light theme and
 * follows the system unless one was chosen; Classic is always dark. Both choices live in the webview's own storage. */
export type Look = 'smooth' | 'classic';
export type Theme = 'system' | 'light' | 'dark';
export const LOOK_KEY = 'muro.look', THEME_KEY = 'muro.theme';
/** Anything that is not a stored choice (nothing, a stale value) is the default. */
export const storedLook = (raw: string | null): Look => (raw === 'classic' ? 'classic' : 'smooth');
export const storedTheme = (raw: string | null): Theme => (raw === 'light' || raw === 'dark' ? raw : 'system');
export const resolveTheme = (look: Look, theme: Theme, systemLight: boolean): 'light' | 'dark' =>
  look === 'smooth' && (theme === 'light' || (theme === 'system' && systemLight)) ? 'light' : 'dark';

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
export const currentLook = () => storedLook(read(LOOK_KEY));
export const currentTheme = () => storedTheme(read(THEME_KEY));
const systemLight = () => window.matchMedia('(prefers-color-scheme: light)');

export function applyLook(): void {
  const root = document.documentElement;
  root.dataset.look = currentLook();
  root.dataset.theme = resolveTheme(currentLook(), currentTheme(), systemLight().matches);
  // The desktop window is acrylic: Smooth lets it show through, Classic paints over it.
  const native = '__TAURI_INTERNALS__' in window;
  root.classList.toggle('native-glass', native);
  // The title bar follows the theme too; a refusal leaves it on the system's.
  if (native) void import('@tauri-apps/api/window').then(m => m.getCurrentWindow().setTheme(root.dataset.theme as 'light' | 'dark')).catch(() => {});
}
export function saveLook(look: Look, theme: Theme): void {
  try { localStorage.setItem(LOOK_KEY, look); localStorage.setItem(THEME_KEY, theme); } catch { /* the choice lasts until restart */ }
  applyLook();
}
/** Applies the stored look and keeps following the system theme. Returns the cleanup. */
export function watchLook(): () => void {
  applyLook();
  const media = systemLight();
  media.addEventListener('change', applyLook);
  return () => media.removeEventListener('change', applyLook);
}
