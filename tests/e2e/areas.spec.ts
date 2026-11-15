import { expect, test } from '@playwright/test'
import { AUTOSAVE_KEY } from '../../src/io/autosave'
import { serialize } from '../../src/io/project'
import { createProject } from '../../src/model/defaults'
import { addWallChain } from '../../src/model/ops'

test('shows net floor area in the status bar and the room inspector', async ({ page }) => {
  const project = createProject('Areas', 'house')
  const level = project.levels[0]!
  addWallChain(
    level,
    [
      { x: 3, y: 3 },
      { x: 7, y: 3 },
      { x: 7, y: 7 },
      { x: 3, y: 7 },
      { x: 3, y: 3 },
    ],
    { thickness: 0.2 },
  )
  await page.addInitScript(
    ([key, json]) => {
      localStorage.setItem(key, json)
    },
    [AUTOSAVE_KEY, serialize(project)] as const,
  )
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.locator('.statusbar .status-area')).toHaveText('Floor 14.4 m² · House 14.4 m²')

  const roomKey = await page.evaluate(() => {
    const state = window.__nestwright!.useStore.getState()
    return state.project.levels[0]!.rooms[0]?.key ?? ''
  })
  await page.evaluate((key) => window.__nestwright!.useStore.getState().select([key]), roomKey)
  const inspector = page.locator('.inspector')
  await expect(inspector).toContainText('Net area 14.4 m²')
  await expect(inspector).toContainText('Gross area 16 m²')
  expect(errors, errors.join('\n')).toEqual([])
})
