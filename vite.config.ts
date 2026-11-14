import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { threeAlias } from './vite.three'

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so dist/index.html loads under file:// in Electron.
  base: './',
  resolve: { alias: threeAlias },
  build: {
    outDir: 'dist',
  },
})
