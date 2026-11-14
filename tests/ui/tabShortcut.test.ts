/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import '../../src/ui/builtinShortcuts'
import { listShortcuts, shortcutMatches } from '../../src/ui/shortcuts'

function pressTab(target: EventTarget): KeyboardEvent {
  let captured: KeyboardEvent | null = null
  const listen = (event: Event) => {
    captured = event as KeyboardEvent
  }
  target.addEventListener('keydown', listen)
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  target.removeEventListener('keydown', listen)
  if (!captured) throw new Error('tab event did not reach the target')
  return captured
}

function viewShortcut() {
  const shortcut = listShortcuts().find((entry) => entry.id === 'view')
  if (!shortcut) throw new Error('missing view shortcut')
  return shortcut
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('tab view shortcut', () => {
  it('does not fire when the target is an input or a button', () => {
    const shortcut = viewShortcut()
    const input = document.createElement('input')
    const button = document.createElement('button')
    document.body.append(input, button)
    expect(shortcutMatches(pressTab(input), shortcut)).toBe(false)
    expect(shortcutMatches(pressTab(button), shortcut)).toBe(false)
  })

  it('does not fire inside a panel or a modal', () => {
    const shortcut = viewShortcut()
    const panel = document.createElement('div')
    panel.className = 'inspector'
    const modal = document.createElement('div')
    modal.setAttribute('role', 'dialog')
    document.body.append(panel, modal)
    expect(shortcutMatches(pressTab(panel), shortcut)).toBe(false)
    expect(shortcutMatches(pressTab(modal), shortcut)).toBe(false)
  })

  it('fires when the target is the document body or a plan or 3D canvas', () => {
    const shortcut = viewShortcut()
    const plan = document.createElement('canvas')
    plan.className = 'plan-canvas'
    const view = document.createElement('canvas')
    view.className = 'view3d-canvas'
    const fit = document.createElement('button')
    const wrap = document.createElement('div')
    wrap.className = 'plan-wrap'
    wrap.append(plan, fit)
    document.body.append(wrap, view)
    expect(shortcutMatches(pressTab(document.body), shortcut)).toBe(true)
    expect(shortcutMatches(pressTab(plan), shortcut)).toBe(true)
    expect(shortcutMatches(pressTab(view), shortcut)).toBe(true)
    expect(shortcutMatches(pressTab(fit), shortcut)).toBe(false)
  })
})
