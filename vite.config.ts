import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  base: '/map_prototype/',
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
  plugins: [tsconfigPaths()],
});
