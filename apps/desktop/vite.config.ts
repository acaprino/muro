import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  clearScreen: false,
  plugins: [react(), tailwindcss()],
  // Sigrid 3.3.9's `./graph` bundle inlines the React Compiler runtime with a CommonJS `__require("react")`, which the dev server's dependency
  // optimizer cannot run in a browser ("Calling `require` for \"react\"..."). The package ships its source too (`./src/*`): the graph entry is read from it,
  // as the main entry is read from its bundle, until Sigrid's bundle is fixed (ADR-0031, plan R0).
  resolve: { alias: [{ find: /^@acaprino\/sigrid\/graph$/, replacement: fileURLToPath(new URL('../../node_modules/@acaprino/sigrid/src/graph.ts', import.meta.url)) }] },
  server: { host: '127.0.0.1', port: 1421, strictPort: true },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
});
