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
const store = (key:string,value:string) => { try { localStorage.setItem(key,value); } catch {} };
/** The look and the theme the person chose, from Settings or from the palette: kept, then put on the window. */
export function saveAppearance(next:{look:Look;theme:Theme}):void { store(LOOK_KEY,next.look); store(THEME_KEY,next.theme); applyTheme(); }
export function saveTheme(theme:Theme):void { store(THEME_KEY,theme); applyTheme(); }
export function saveLook(look:Look):void { store(LOOK_KEY,look); applyTheme(); }
export function watchTheme():()=>void {
 applyTheme();const media=window.matchMedia('(prefers-color-scheme: dark)');media.addEventListener('change',applyTheme);
 return ()=>media.removeEventListener('change',applyTheme);
}
