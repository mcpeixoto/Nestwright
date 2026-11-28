/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
import { useSettings } from '../../src/settings'
import '../../src/tools'
import '../../src/ui/panels/library'
import { isPanelOpen } from '../../src/ui/panels/registry'
import { ToolRail } from '../../src/ui/ToolRail'

it('opens flyouts on click only and shows the new rail items', async () => {
  useSettings.getState().setSettings({ railLabels: false })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(<ToolRail />))
  const named = (name: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button')].find((b) => b.getAttribute('aria-label') === name) ?? null

  const build = named('Build')!
  await act(async () => {
    build.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    build.closest('.rail-group')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  })
  expect(host.querySelector('[role="menu"]')).toBeNull()
  await act(async () => build.click())
  expect(host.querySelector('[role="menu"]')).not.toBeNull()

  for (const name of ['Furniture', 'Garden', 'Doors & windows', 'Paint', 'Measure']) expect(named(name), name).not.toBeNull()
  for (const name of ['Outside', 'Library']) expect(named(name)).toBeNull()

  await act(async () => named('Furniture')!.click())
  expect(isPanelOpen('library')).toBe(true)
  act(() => root.unmount())
  host.remove()
})
