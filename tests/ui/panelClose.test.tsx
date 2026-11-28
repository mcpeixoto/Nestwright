/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { PanelSlot } from '../../src/ui/panels/PanelSlot'
import { isPanelOpen, registerPanel, setPanelOpen, type PanelDef } from '../../src/ui/panels/registry'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

it('closes a side panel from its header ×', async () => {
  const def: PanelDef = { id: 'close-me', title: 'Close me', placement: 'right', Component: () => <p>body</p> }
  registerPanel(def)
  setPanelOpen('close-me', true)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(<PanelSlot panel={def} />))
  const close = host.querySelector<HTMLButtonElement>('button[aria-label="Close Close me"]')
  expect(close).not.toBeNull()
  await act(async () => close?.click())
  expect(isPanelOpen('close-me')).toBe(false)
  act(() => root.unmount())
  host.remove()
})
