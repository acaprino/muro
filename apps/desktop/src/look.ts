import { applyLook, parseTheme, parseLook, resolveTheme as resolve, type ThemeChoice, type Look } from '@acaprino/imago/shell';
export type Theme = ThemeChoice;
export const THEME_KEY = 'muro.theme';
export const LOOK_KEY = 'muro.look';
export const storedTheme = parseTheme;
export const resolveTheme = (theme: Theme, systemLight: boolean) => resolve(theme, !systemLight);
const read = (key:string) => { try { return localStorage.getItem(key); } catch { return null; } };
export const currentTheme = () => parseTheme(read(THEME_KEY));
export const currentLook = () => parseLook(read(LOOK_KEY));
export function applyTheme():void {
 const native = '__TAURI_INTERNALS__' in window;
 applyLook(document.documentElement,{app:'muro',look:currentLook(),theme:currentTheme(),glass:native}, native ? {
  setWindowTheme: (word,{look,resolved}) => import('@tauri-apps/api/core').then(m=>m.invoke('set_window_theme',{theme:word,look,resolved}))
 } : {});
}
export function saveTheme(theme:Theme):void { try { localStorage.setItem(THEME_KEY,theme); } catch {} applyTheme(); }
export function saveLook(look:Look):void { try { localStorage.setItem(LOOK_KEY,look); } catch {} applyTheme(); }
export function watchTheme():()=>void {
 applyTheme();const media=window.matchMedia('(prefers-color-scheme: dark)');media.addEventListener('change',applyTheme);
 return ()=>media.removeEventListener('change',applyTheme);
}
