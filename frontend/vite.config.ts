import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
      '/login': 'http://localhost:5000',
      '/protected': 'http://localhost:5000',
      '/profile': 'http://localhost:5000',
    },
  },
})
