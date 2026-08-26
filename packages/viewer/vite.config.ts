import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// dev: vite serves the app, the API comes from `dgv serve` on 7710
export default defineConfig({
  plugins: [svelte()],
  server: { port: 5190, proxy: { '/api': { target: 'http://127.0.0.1:7710', changeOrigin: false } } },
  build: { outDir: 'dist', emptyOutDir: true },
});
