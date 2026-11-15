import './styles.css';
import { request } from './api.ts';
import { mountApp } from './app.ts';
mountApp(document.querySelector<HTMLElement>('#app')!,request);
