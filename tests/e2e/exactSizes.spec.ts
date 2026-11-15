import { expect, test } from '@playwright/test'
import { AUTOSAVE_KEY } from '../../src/io/autosave'
import { serialize } from '../../src/io/project'
import { createProject } from '../../src/model/defaults'

const PX = 50

test('types a room size, then a wall length, in metres', async ({ page }) => {
  const empty = serialize(createProject('E2E', 'house'))
  await page.addInitScript(
    ([key, json]) => {
      localStorage.setItem(key, json)
    },
    [AUTOSAVE_KEY, empty] as const,
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue' }).click()
  const plan = page.locator('canvas.plan-canvas')
  await expect(plan).toBeVisible()
  const at = async (x: number, y: number) => {
    const size = await plan.evaluate((canvas) => ({ w: canvas.clientWidth, h: canvas.clientHeight }))
    return { x: (x - 5) * PX + size.w / 2, y: size.h / 2 - (y - 4) * PX }
  }

  await page.evaluate(() => window.__nestwright?.useStore.getState().setTool('room-rect'))
  await plan.click({ position: await at(3, 3) })
  await plan.hover({ position: await at(6, 5) })
  await page.keyboard.type('4x3')
  await page.keyboard.press('Enter')

  const walls = () =>
    page.evaluate(() => {
      const level = window.__nestwright?.useStore.getState().project.levels[0]
      return (level?.walls ?? []).map((w) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y))
    })
  await expect.poll(async () => (await walls()).length).toBe(4)
  expect((await walls()).map((l) => Math.round(l * 100) / 100).sort()).toEqual([3, 3, 4, 4])

  await page.evaluate(() => window.__nestwright?.useStore.getState().setTool('select'))
  await plan.click({ position: await at(5, 3) })
  const length = page.locator('.inspector').getByLabel('Length')
  await expect(length).toHaveValue('4 m')
  await length.fill('550 cm')
  await length.press('Enter')
  await expect.poll(async () => (await walls()).some((l) => Math.abs(l - 5.5) < 1e-6)).toBe(true)
})
