import './styles.css';
import { request, onShown } from './api.ts';
import { startMuro } from './app.ts';
startMuro(document.querySelector<HTMLElement>('#app')!,request,onShown);
