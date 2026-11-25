import { request } from './api.ts';
import { start } from './start.tsx';

start(document.querySelector<HTMLElement>('#app')!, request);
