/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development the React app runs on :5180 and forwards API calls to Laravel on :8010
// (fixed ports chosen so they don't clash with other local projects on 8000/5173),
// so the browser sees one site and Sanctum's session cookies just work.
const backend = process.env.BACKEND_URL ?? 'http://127.0.0.1:8010'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // reachable from a phone on the same Wi-Fi: http://<laptop-ip>:5180
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': { target: backend, changeOrigin: false },
      '/sanctum': { target: backend, changeOrigin: false },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
