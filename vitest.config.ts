import { defineConfig } from 'vitest/config'
import { threeAlias } from './vite.three'

export default defineConfig({
  resolve: { alias: threeAlias },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
