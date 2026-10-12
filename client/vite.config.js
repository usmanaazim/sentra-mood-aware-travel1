import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * SENTRA dev server.
 *  - binds to 0.0.0.0 so the app can be previewed from a remote sandbox/container
 *  - proxies /api to the Express backend, which keeps cookies first-party and
 *    avoids CORS entirely in development.
 */
const API_TARGET = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,          // 0.0.0.0
    port: 5173,
    strictPort: false,
    allowedHosts: true,  // allow proxied preview hosts (e.g. *.e2b.app)
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: false,
        // The backend enforces an Origin allow-list as CSRF defence-in-depth.
        // Requests proxied from a preview host are rewritten to look like a
        // same-origin call; the double-submit CSRF token check still applies.
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        }
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900
  }
});
