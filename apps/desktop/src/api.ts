import { Channel, invoke } from '@tauri-apps/api/core';
import type { CheckProgress, Transport } from './types.ts';

export const request: Transport = (action, payload = {}, onProgress) => {
  if (!onProgress) return invoke('request', { action, payload });
  const channel = new Channel<CheckProgress>();
  channel.onmessage = onProgress;
  return invoke('request', { action, payload, onProgress: channel });
};
