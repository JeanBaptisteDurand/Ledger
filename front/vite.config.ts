import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** The bench (web/server.py, at the repository root). */
const BENCH = 'http://127.0.0.1:8099'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The app pages talk to the bench (web/server.py, repository root). Same origin through the proxy: the session
  // cookie, the emulator (/speculos) and the Ledger bundle (/dist) all come from it, with no CORS to set up.
  server: {
    proxy: Object.fromEntries(
      ['/api', '/speculos', '/dist'].map((p) => [p, { target: BENCH, changeOrigin: false }]),
    ),
  },
  preview: {
    proxy: Object.fromEntries(
      ['/api', '/speculos', '/dist'].map((p) => [p, { target: BENCH, changeOrigin: false }]),
    ),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three') || id.includes('@react-three')) return 'three'
          if (id.includes('node_modules/gsap') || id.includes('@gsap') || id.includes('node_modules/lenis')) return 'motion'
          return undefined
        },
      },
    },
  },
})
