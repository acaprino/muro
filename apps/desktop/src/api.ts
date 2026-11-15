import { invoke } from '@tauri-apps/api/core';
import type { Transport } from './types.ts';
export const request:Transport = (action,payload={}) => invoke('request',{action,payload});
