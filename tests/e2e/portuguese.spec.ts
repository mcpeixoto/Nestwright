import { expect, test } from '@playwright/test'
import { AUTOSAVE_KEY } from '../../src/io/autosave'
import { serialize } from '../../src/io/project'
import { createProject } from '../../src/model/defaults'
import { addWallChain } from '../../src/model/ops'
import { detectRooms } from '../../src/model/rooms'

test('plays in European Portuguese: start screen, library and default room names', async ({ page }) => {
  const project = createProject('Casa', 'house')
  addWallChain(
    project.levels[0]!,
    [
      { x: 3, y: 3 },
      { x: 7, y: 3 },
      { x: 7, y: 7 },
      { x: 3, y: 7 },
      { x: 3, y: 3 },
    ],
    { thickness: 0.2 },
  )
  const room = detectRooms(project.levels[0]!)[0]!
  // Stored data stays English; only the display is translated.
  expect(room.name).toBe('Living 1')
  await page.addInitScript(
    ([key, json]) => {
      localStorage.setItem(key, json)
    },
    [AUTOSAVE_KEY, serialize(project)] as const,
  )
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto('/')
  await page.waitForFunction(() => Boolean(window.__nestwright))
  await page.evaluate(() => window.__nestwright!.useSettings.getState().setSettings({ language: 'pt-PT' }))

  await page.getByRole('button', { name: 'Continuar', exact: true }).click()

  // The model names new rooms in English ("Living 1"); the inspector shows the default translated.
  await page.evaluate((key) => window.__nestwright!.useStore.getState().select([key]), room.key)
  await expect(page.locator('.levelbar input').first()).toHaveValue('Rés do chão')
  const roomSection = page.locator('.inspector .props', { has: page.getByRole('heading', { name: 'Divisão', exact: true }) })
  const nameInput = roomSection.locator('input').first()
  await expect(nameInput).toHaveValue('Sala 1')

  await page.getByRole('button', { name: 'Mobiliário', exact: true }).first().click()
  const library = page.locator('.library')
  await expect(library).toBeVisible()
  await expect(library.getByRole('button', { name: 'Estar', exact: true })).toBeVisible()
  await expect(library.getByText('Sofá de três lugares', { exact: true })).toBeVisible()
  await expect(library.getByText('Sofá de dois lugares', { exact: true })).toBeVisible()

  for (const english of ['Sofa', 'Three-seat sofa', 'Two-seat sofa', 'Living', 'Bedroom', 'Search furniture']) {
    await expect(page.getByText(english, { exact: true })).toHaveCount(0)
  }
  await expect(page.getByLabel('Procurar mobiliário')).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
})
