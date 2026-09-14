import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/auth': {
        target: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api': {
        target: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/socket.io': {
        target: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
        ws: true,
      },
    },
  },
})
