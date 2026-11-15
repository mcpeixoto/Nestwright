import { expect, test } from '@playwright/test'
import { AUTOSAVE_KEY } from '../../src/io/autosave'
import { serialize } from '../../src/io/project'
import { createProject } from '../../src/model/defaults'
import { addWallChain } from '../../src/model/ops'

test('copies and pastes an item as one undo step, and selects all items', async ({ page }) => {
  const project = createProject('Furniture', 'house')
  addWallChain(
    project.levels[0]!,
    [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 5 },
      { x: 0, y: 5 },
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

  const count = () => page.evaluate(() => window.__nestwright!.useStore.getState().project.levels[0]!.items.length)

  await page.evaluate(() => {
    const store = window.__nestwright!.useStore
    const make = (id: string, x: number) => ({
      id,
      catalogId: 'chair',
      position: { x, y: 2.5 },
      elevation: 0,
      rotation: 0,
      size: { w: 0.5, d: 0.5, h: 0.9 },
      materials: {},
      params: {},
    })
    store.getState().apply('Place item', (draft) => {
      draft.levels[0]!.items.push(make('item_e2e_a', 2), make('item_e2e_b', 4))
    })
    store.getState().select(['item_e2e_a'])
  })
  await expect.poll(count).toBe(2)

  await page.locator('body').focus()
  await page.keyboard.press('ControlOrMeta+c')
  await page.keyboard.press('ControlOrMeta+v')
  await expect.poll(count).toBe(3)
  const pastedSelected = await page.evaluate(() => {
    const state = window.__nestwright!.useStore.getState()
    return state.selection.length === 1 && !['item_e2e_a', 'item_e2e_b'].includes(state.selection[0]!)
  })
  expect(pastedSelected).toBe(true)

  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(count).toBe(2)

  await page.keyboard.press('ControlOrMeta+a')
  await expect
    .poll(() => page.evaluate(() => [...window.__nestwright!.useStore.getState().selection].sort()))
    .toEqual(['item_e2e_a', 'item_e2e_b'])
  await expect(page.locator('.inspector')).toContainText('2 items')

  expect(errors, errors.join('\n')).toEqual([])
})
