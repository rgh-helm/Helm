import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // Electron loads the built index.html via file://, not from a server —
  // Vite's default base ('/') emits absolute asset paths like
  // "/assets/index.js", which resolve to the filesystem root and 404 under
  // file://. A relative base keeps them resolvable wherever dist/ ends up.
  base: './',
  test: {
    environment: 'node',
    include: ['src/utils/__tests__/**/*.test.js'],
  },
})
