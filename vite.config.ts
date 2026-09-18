import { defineConfig } from 'vite';

export default defineConfig({
  base: '/magic-8-ball/',
  server: {
    proxy: { '/api': { target: 'http://127.0.0.1:8787', rewrite: (path) => path.replace(/^\/api/, '') } },
  },
  build: { target: 'es2022' },
});
