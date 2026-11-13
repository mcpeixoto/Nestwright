import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so dist/index.html loads under file:// in Electron.
  base: './',
  build: {
    outDir: 'dist',
  },
})
