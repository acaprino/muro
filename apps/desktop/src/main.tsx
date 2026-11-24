import { request, onShown } from './api.ts';
import { mount } from './mount.tsx';

mount(document.querySelector<HTMLElement>('#app')!, request, onShown);
