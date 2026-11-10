import { fileURLToPath, URL } from 'node:url';

import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

// API paths forwarded to the backend by the dev server (`GET /` stays with the app).
const API_PATHS = /^\/(inspect|validate|stats|normalize|foldrna|run|runs)(\/|\?|$)/;

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Reads COBALT_* from the shell or from .env, .env.local, .env.[mode] (no VITE_ prefix, so
  // these values stay in the dev server and never reach the browser bundle).
  const env = loadEnv(mode, process.cwd(), 'COBALT_');
  const apiUrl = env.COBALT_API_URL || 'http://127.0.0.1:8001';
  const apiKey = env.COBALT_API_KEY;

  return {
    plugins: [vue()],
    server: {
      port: 8000,
      proxy: {
        [API_PATHS.source]: {
          target: apiUrl,
          changeOrigin: true,
          headers: apiKey ? { 'X-API-Key': apiKey } : undefined,
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
