import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_MENU_LABELS, helpMenuTemplate, isMenuLabels, viewMenuTemplate } from '../../electron/menuLabels'

const items = (menu: MenuItemConstructorOptions) => menu.submenu as MenuItemConstructorOptions[]
const click = (item: MenuItemConstructorOptions) =>
  (item.click as unknown as () => void)()

describe('menu labels', () => {
  it('validates the label set', () => {
    expect(isMenuLabels(DEFAULT_MENU_LABELS)).toBe(true)
    const missing: Partial<typeof DEFAULT_MENU_LABELS> = { ...DEFAULT_MENU_LABELS }
    delete missing.tutorial
    expect(isMenuLabels(missing)).toBe(false)
    expect(isMenuLabels('Help')).toBe(false)
  })

  it('builds the Help menu per platform', () => {
    const send = vi.fn()
    const mac = items(helpMenuTemplate(DEFAULT_MENU_LABELS, send, 'darwin'))
    expect(mac.map((i) => i.label)).toEqual(['Tutorial', 'Shortcuts', 'Credits', 'Achievements'])
    const win = items(helpMenuTemplate(DEFAULT_MENU_LABELS, send, 'win32'))
    expect(win.map((i) => i.label)).toEqual(['Tutorial', 'Shortcuts', 'Credits', 'Achievements', 'About Nestwright'])
    click(mac[0])
    expect(send).toHaveBeenCalledWith('tutorial')
  })

  it('has a Fullscreen checkbox in View', () => {
    const toggle = vi.fn()
    const full = items(viewMenuTemplate(DEFAULT_MENU_LABELS, { fullscreen: true, toggle })).find(
      (i) => i.label === 'Fullscreen',
    )
    expect(full?.type).toBe('checkbox')
    expect(full?.checked).toBe(true)
    click(full!)
    expect(toggle).toHaveBeenCalledOnce()
  })

  it('passes translated labels through', () => {
    const labels = { ...DEFAULT_MENU_LABELS, help: 'Ajuda', view: 'Vista' }
    expect(helpMenuTemplate(labels, () => {}, 'darwin').label).toBe('Ajuda')
    expect(viewMenuTemplate(labels, { fullscreen: false, toggle: () => {} }).label).toBe('Vista')
  })
})
