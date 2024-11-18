import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import content from '@originjs/vite-plugin-content';

export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          babylon: ['@babylonjs/core'],
          babylongui: ['@babylonjs/gui'],
          earcut: ['earcut'],
        },
      },
    },
  },
  plugins: [tsconfigPaths(), content()],
});
