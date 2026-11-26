import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss()],
    // Dev only: forward /api calls to the backend so the browser sees one origin (no CORS setup needed).
    server: {
      proxy: {
        '/api': { target: env.VITE_DEV_API_TARGET || 'http://localhost:3000', changeOrigin: true },
      },
    },
  }
})
