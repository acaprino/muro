import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  clearScreen: false,
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 1421, strictPort: true },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
});
