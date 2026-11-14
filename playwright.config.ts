import { defineConfig, devices } from '@playwright/test'

const port = 4173

// Full Chromium (channel 'chromium'): the default headless shell has no WebGPU. Where no GPU
// adapter exists, WebGPURenderer falls back to WebGL2 on its own, so the webgpu project
// still runs; the webgl project forces that fallback with ?renderer=webgl.
const gpuArgs =
  process.platform === 'darwin'
    ? ['--enable-unsafe-webgpu', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
    : ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  use: {
    ...devices['Desktop Chrome'],
    channel: 'chromium',
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: gpuArgs },
  },
  projects: [
    { name: 'webgpu', metadata: { renderer: 'auto' } },
    { name: 'webgl', metadata: { renderer: 'webgl' } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
