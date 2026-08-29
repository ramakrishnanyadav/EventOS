import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const rootDir = import.meta.dirname || path.resolve('.');

export default defineConfig({
  plugins: [react()],
  root: rootDir,
  build: {
    outDir: path.resolve(rootDir, './dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
