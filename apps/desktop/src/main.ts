import './styles.css';
import { request, onShown } from './api.ts';
import { mountApp } from './app.ts';
mountApp(document.querySelector<HTMLElement>('#app')!,request,onShown);
