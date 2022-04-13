import { defineConfig } from "vite"

export default defineConfig({
    base: "/map_prototype/",
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    "babylon": ["@babylonjs/core"]
                }
            }
        }
    }
});