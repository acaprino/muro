import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
// Every entry of Sigrid's `dist` is an ES module that takes `react` (and the graph's `react/compiler-runtime`) from the app, since Sigrid 4.1.0: the graph is
// read from its bundle as the main entry is, with no alias (ADR-0031, the note of 2026-11-23 on Sigrid 4.3.1).
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  clearScreen: false,
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 1421, strictPort: true },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
});
