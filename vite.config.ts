import { defineConfig, Plugin } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import content from '@originjs/vite-plugin-content';
import path from 'node:path';

/**
 * Vite plugin to rewrite /map/N paths to /map/index.html during dev,
 * so the dev server serves the map page for path-based campaign URLs.
 */
function mapPathRewrite(): Plugin {
  return {
    name: 'map-path-rewrite',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url && /^\/map\/\d+/.test(req.url)) {
          req.url = '/map/index.html';
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        map: path.resolve(__dirname, 'map/index.html'),
      },
      output: {
        manualChunks: {
          babylon: ['@babylonjs/core'],
          babylongui: ['@babylonjs/gui'],
          earcut: ['earcut'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  plugins: [mapPathRewrite(), tsconfigPaths(), content()],
});
