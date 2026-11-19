import './styles.css';
import './smooth.css';
import { request } from './api.ts';
import { mountApp } from './app.ts';
mountApp(document.querySelector<HTMLElement>('#app')!,request);
