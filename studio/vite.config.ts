import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// The fonts live in the repository's assets/ folder, one level above the studio.
const repo = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  base: './',
  server: { fs: { allow: [repo] }, port: 5199 },
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 },
});
