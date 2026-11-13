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
  await page.goto('/')
  await expect(page.getByRole('button', { name: '3D' })).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])

  const plan = page.locator('canvas.plan-canvas')
  await expect(plan).toBeVisible()
  await page.getByTitle('Wall (W)').click()

  const clickWorld = async (x: number, y: number) => {
    const size = await plan.evaluate((canvas) => ({ w: canvas.clientWidth, h: canvas.clientHeight }))
    const screenX = (x - 5) * PX + size.w / 2
    const screenY = size.h / 2 - (y - 4) * PX
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

  await page.getByTitle('Select (V)').click()
  const size = await plan.evaluate((canvas) => ({ w: canvas.clientWidth, h: canvas.clientHeight }))
  await plan.click({ position: { x: size.w / 2, y: size.h / 2 } })
  await expect(page.locator('.inspector')).toContainText('16 m²')

  await page.getByRole('button', { name: '3D', exact: true }).click()
  const view = page.locator('canvas.view3d-canvas')
  await expect(view).toBeVisible()
  await expect
    .poll(async () =>
      view.evaluate((element) => {
        const canvas = element as HTMLCanvasElement
        const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
        if (!gl || canvas.width < 2 || canvas.height < 2) return false
        const pixel = new Uint8Array(4)
        let seen = -1
        let different = false
        let lit = false
        const stepX = Math.max(1, Math.floor(canvas.width / 6))
        const stepY = Math.max(1, Math.floor(canvas.height / 6))
        for (let y = 1; y < canvas.height; y += stepY) {
          for (let x = 1; x < canvas.width; x += stepX) {
            gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
            const key = (pixel[0] ?? 0) + (pixel[1] ?? 0) * 256 + (pixel[2] ?? 0) * 65536
            if ((pixel[0] ?? 0) + (pixel[1] ?? 0) + (pixel[2] ?? 0) > 12) lit = true
            if (seen < 0) seen = key
            else if (key !== seen) different = true
          }
        }
        return lit && different
      }),
    )
    .toBe(true)

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
