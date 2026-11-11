import { fileURLToPath, URL } from 'node:url';

import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Reads COBALT_* from the shell or from .env, .env.local, .env.[mode] (no VITE_ prefix, so
  // these values stay in the dev server and never reach the browser bundle).
  const env = loadEnv(mode, process.cwd(), 'COBALT_');
  const apiUrl = env.COBALT_API_URL || 'http://127.0.0.1:8001';
  const apiKey = env.COBALT_API_KEY;
  // The mock serves the API under /api; a real `cobalt serve` has no prefix, so strip it.
  const stripPrefix = ['1', 'true', 'yes'].includes(
    (env.COBALT_API_STRIP_PREFIX ?? '').toLowerCase(),
  );

  return {
    plugins: [vue()],
    server: {
      port: 8000,
      // The API lives under /api; every other path is the app (page routes fall back to index.html).
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          headers: apiKey ? { 'X-API-Key': apiKey } : undefined,
          rewrite: stripPrefix ? (path) => path.replace(/^\/api/, '') || '/' : undefined,
        },
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  };
});
