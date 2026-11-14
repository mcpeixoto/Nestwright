import { expect, test } from '@playwright/test'
import { AUTOSAVE_KEY } from '../../src/io/autosave'
import { serialize } from '../../src/io/project'
import { createProject } from '../../src/model/defaults'

const PX = 50

test('loads, draws a 4×4 room, renders 3D, and autosaves the walls', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  const empty = serialize(createProject('E2E', 'house'))
  await page.addInitScript(
    ([key, json]) => {
      localStorage.setItem(key, json)
    },
    [AUTOSAVE_KEY, empty] as const,
  )
  const forceWebGL = test.info().project.metadata?.renderer === 'webgl'
  await page.goto(forceWebGL ? '/?renderer=webgl' : '/')
  // The start screen (added after this test) offers the autosave as "Continue".
  const resume = page.getByRole('dialog', { name: 'Nestwright' }).getByRole('button', { name: 'Continue' })
  await page.getByRole('button', { name: /^(3D|Continue)$/ }).first().waitFor()
  if (await resume.isVisible()) await resume.click()
  await expect(page.getByRole('button', { name: '3D' })).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])

  const plan = page.locator('canvas.plan-canvas')
  await expect(plan).toBeVisible()
  // Tools now sit in grouped menus; their shortcuts are the stable handle.
  await plan.hover()
  await page.keyboard.press('w')

  const clickWorld = async (x: number, y: number) => {
    const size = await plan.evaluate((canvas) => ({ w: canvas.clientWidth, h: canvas.clientHeight }))
    // An empty plan is fitted to 0..10 × 0..8 m plus 1.4 m padding, centred on (5, 4).
    const scale = PX * Math.min(size.w / (12.8 * PX), size.h / (10.8 * PX))
    const screenX = (x - 5) * scale + size.w / 2
    const screenY = size.h / 2 - (y - 4) * scale
    await plan.click({ position: { x: screenX, y: screenY } })
  }
  await clickWorld(3, 3)
  await clickWorld(7, 3)
  await clickWorld(7, 7)
  await clickWorld(3, 7)
  await clickWorld(3, 3)

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const level = window.__nestwright?.useStore.getState().project.levels[0]
        return level?.walls.length ?? 0
      }),
    )
    .toBeGreaterThanOrEqual(4)

  await page.keyboard.press('Escape')
  await page.keyboard.press('v')
  const size = await plan.evaluate((canvas) => ({ w: canvas.clientWidth, h: canvas.clientHeight }))
  await plan.click({ position: { x: size.w / 2, y: size.h / 2 } })
  await expect(page.locator('.inspector')).toContainText('16 m²')

  await page.getByRole('button', { name: '3D', exact: true }).click()
  const view = page.locator('canvas.view3d-canvas')
  await expect(view).toBeVisible()
  // Read back through the app's own hook: a WebGPU canvas has no readable context, and its
  // pixels only exist in the task that rendered them. Same check as before: lit, not flat.
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const points: { x: number; y: number }[] = []
        const canvas = document.querySelector('canvas.view3d-canvas') as HTMLCanvasElement | null
        if (!canvas || canvas.clientWidth < 2 || canvas.clientHeight < 2) return false
        for (let j = 0; j < 6; j++) {
          for (let i = 0; i < 6; i++) {
            points.push({ x: ((i + 0.5) / 6) * canvas.clientWidth, y: ((j + 0.5) / 6) * canvas.clientHeight })
          }
        }
        const samples = (await window.__nestwright?.samplePixels?.(points)) ?? []
        let seen = -1
        let different = false
        let lit = false
        for (const sample of samples) {
          if (!sample) continue
          const key = sample.r + sample.g * 256 + sample.b * 65536
          if (sample.r + sample.g + sample.b > 12) lit = true
          if (seen < 0) seen = key
          else if (key !== seen) different = true
        }
        return lit && different
      }),
    )
    .toBe(true)
  const backend = await page.evaluate(() => window.__nestwright?.getController?.()?.backend ?? null)
  test.info().annotations.push({ type: 'renderer backend', description: String(backend) })
  if (forceWebGL) expect(backend).toBe('webgl2')

  await expect
    .poll(async () =>
      page.evaluate((key) => {
        const raw = localStorage.getItem(key)
        if (!raw) return 0
        try {
          const project = JSON.parse(raw) as { levels?: { walls?: unknown[] }[] }
          return project.levels?.[0]?.walls?.length ?? 0
        } catch {
          return 0
        }
      }, AUTOSAVE_KEY),
    )
    .toBeGreaterThanOrEqual(4)

  expect(errors, errors.join('\n')).toEqual([])
})
