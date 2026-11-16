import { defineConfig } from 'vitest/config'
import { threeAlias } from './vite.three'

export default defineConfig({
  resolve: { alias: threeAlias },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'tests/**/*.test.mjs'],
    // The self-hosted CI box runs at load 30–60: a test that takes 150 ms here took over
    // 5 s there (uvs.test.ts, PR #42). Locally the 5 s default still catches real hangs.
    testTimeout: process.env.CI ? 30_000 : 5_000,
  },
})
