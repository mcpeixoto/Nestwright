import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { AUTOSAVE_KEY } from '../../src/io/autosave'
import { serialize } from '../../src/io/project'
import { createProject } from '../../src/model/defaults'
import { addWallChain } from '../../src/model/ops'

test('saves a fixed-scale plan PDF from the Export menu', async ({ page }) => {
  const project = createProject('Plan Print', 'house')
  const level = project.levels[0]!
  addWallChain(
    level,
    [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 4 },
      { x: 0, y: 4 },
      { x: 0, y: 0 },
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
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: 'Floor plan PDF' }).click()
  const dialog = page.getByRole('dialog', { name: 'Plan PDF' })
  await expect(dialog).toBeVisible()

  // A 6 × 4 m room fits A4 at 1:50; nothing to warn about.
  await dialog.getByLabel('Scale').selectOption('50')
  await dialog.getByLabel('Paper').selectOption('A4')
  await expect(dialog.getByRole('alert')).toHaveCount(0)

  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Save PDF' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('Plan-Print.pdf')
  const path = await file.path()
  const bytes = readFileSync(path)
  const text = bytes.toString('latin1')
  expect(text.startsWith('%PDF-')).toBe(true)
  expect(text).toContain('/FontFile2')
  expect((text.match(/\/Type\s*\/Page(?!s)/g) ?? []).length).toBe(1)
  await expect(dialog).toBeHidden()
  expect(errors).toEqual([])
})

test('tells the user when a level does not fit the paper at the chosen scale', async ({ page }) => {
  const project = createProject('Big House', 'house')
  const level = project.levels[0]!
  addWallChain(
    level,
    [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 12 },
      { x: 0, y: 12 },
      { x: 0, y: 0 },
    ],
    { thickness: 0.2 },
  )
  await page.addInitScript(
    ([key, json]) => {
      localStorage.setItem(key, json)
    },
    [AUTOSAVE_KEY, serialize(project)] as const,
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: 'Floor plan PDF' }).click()
  const dialog = page.getByRole('dialog', { name: 'Plan PDF' })
  await dialog.getByLabel('Scale').selectOption('50')
  await dialog.getByLabel('Paper').selectOption('A4')
  await expect(dialog.getByRole('alert')).toContainText('does not fit on A4 at 1:50')
  await expect(dialog.getByRole('button', { name: 'Save PDF' })).toBeDisabled()
  await dialog.getByLabel('Scale').selectOption('100')
  await dialog.getByLabel('Paper').selectOption('A3')
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Save PDF' })).toBeEnabled()
})
