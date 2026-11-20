import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Transport } from './types.ts';
export const request:Transport = (action,payload={}) => invoke('request',{action,payload});
/** The shell's `muro-shown`: the window was shown again (from the notification area, or by a second launch). Returns how to stop listening. */
export const onShown = (wake:()=>void):(()=>void) => { const stop = listen('muro-shown',wake); return () => void stop.then(un => un()).catch(() => undefined); };
