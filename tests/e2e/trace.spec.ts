import { expect, test } from '@playwright/test'
import { AUTOSAVE_KEY } from '../../src/io/autosave'
import { serialize } from '../../src/io/project'
import { createProject } from '../../src/model/defaults'
import { pixelToPlan, planToPixel } from '../../src/model/trace'
import type { TraceImage } from '../../src/model/types'

const PX = 50

test('calibrates a trace so two clicked points are 5 m apart', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  const empty = serialize(createProject('E2E trace', 'house'))
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

  const before: TraceImage = {
    levelId: 'level',
    src: '',
    origin: { x: 0, y: 8 },
    scale: 0.05,
    rotation: 0,
    opacity: 0.7,
    width: 64,
    height: 32,
  }
  await page.evaluate((seed) => {
    const canvas = document.createElement('canvas')
    canvas.width = seed.width ?? 64
    canvas.height = seed.height ?? 32
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    ctx.fillStyle = '#c45c26'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#f4f0e6'
    ctx.fillRect(8, 8, 24, 10)
    const state = window.__nestwright?.useStore.getState()
    if (!state) throw new Error('no store')
    const levelId = state.project.levels[0]?.id
    if (!levelId) throw new Error('no level')
    state.apply('Import trace', (draft) => {
      draft.traces = [{ ...seed, levelId, src: canvas.toDataURL('image/png') }]
    })
    state.setSnap({ snapGrid: false, snapEnds: false, snapAngles: false })
    state.setTool('trace-calibrate')
  }, before)

  const clickWorld = async (x: number, y: number) => {
    const size = await plan.evaluate((canvas) => ({ w: canvas.clientWidth, h: canvas.clientHeight }))
    const scale = PX * Math.min(size.w / (12.8 * PX), size.h / (10.8 * PX))
    await plan.click({
      position: {
        x: (x - 5) * scale + size.w / 2,
        y: size.h / 2 - (y - 4) * scale,
      },
    })
  }
  const p1 = { x: 1, y: 4 }
  const p2 = { x: 5, y: 4 }
  await clickWorld(p1.x, p1.y)
  await clickWorld(p2.x, p2.y)
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
  await page.keyboard.type('5')
  await page.keyboard.press('Enter')

  await expect
    .poll(async () => page.evaluate(() => window.__nestwright?.useStore.getState().project.traces[0]?.scale ?? 0))
    .toBeCloseTo(before.scale * (5 / 4), 4)

  const after = await page.evaluate(() => window.__nestwright?.useStore.getState().project.traces[0] ?? null)
  expect(after).not.toBeNull()
  const pix1 = planToPixel(before, p1)
  const pix2 = planToPixel(before, p2)
  const stayed = pixelToPlan(after as TraceImage, pix1)
  const moved = pixelToPlan(after as TraceImage, pix2)
  expect(stayed.x).toBeCloseTo(p1.x, 2)
  expect(stayed.y).toBeCloseTo(p1.y, 2)
  expect(Math.hypot(moved.x - stayed.x, moved.y - stayed.y)).toBeCloseTo(5, 2)
  expect(errors, errors.join('\n')).toEqual([])
})
