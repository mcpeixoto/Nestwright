import { defineConfig, devices } from '@playwright/test'

const port = 4173

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
