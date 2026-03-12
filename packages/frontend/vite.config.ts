import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite configuration for Ellen Skill frontend
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true  // Allow LAN and container access (was '127.0.0.1')
  },
  build: {
    outDir: 'dist'
  }
})
