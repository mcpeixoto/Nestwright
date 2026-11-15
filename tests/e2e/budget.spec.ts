import { expect, test } from '@playwright/test'
import { AUTOSAVE_KEY } from '../../src/io/autosave'
import { serialize } from '../../src/io/project'
import { createProject } from '../../src/model/defaults'

test('a labour line of 1000 raises the budget total by 1000', async ({ page }) => {
  const project = createProject('Budget', 'house')
  await page.addInitScript(
    ([key, json]) => {
      localStorage.setItem(key, json)
    },
    [AUTOSAVE_KEY, serialize(project)] as const,
  )
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Budget' }).click()
  const panel = page.locator('section[aria-label="Budget"]')
  await expect(panel.locator('.budget-total')).toHaveText('€0')
  await panel.getByLabel('Kind').selectOption('labour')
  await panel.getByLabel('Amount').fill('1000')
  await panel.getByRole('button', { name: 'Add line' }).click()
  await expect(panel.locator('.budget-total')).toHaveText('€1,000')
  expect(errors, errors.join('\n')).toEqual([])
})
