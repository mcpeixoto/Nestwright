/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { installGamepadKeyboard } from '../../src/platform/gamepadKeyboard'
import type { SteamApi, SteamKeyboardRequest } from '../../src/platform/types'

afterEach(() => {
  document.body.replaceChildren()
})

describe('installGamepadKeyboard', () => {
  it('opens the keyboard for text fields and skips password, readonly, and disabled', async () => {
    const deck = fakeSteam(true)
    const uninstall = installGamepadKeyboard(deck.api, document)

    focus(field('input'), { x: 10, y: 20, width: 300, height: 40 })
    await flush()
    focus(field('input', { type: 'email' }), { x: 1, y: 2, width: 3, height: 4 })
    await flush()
    focus(field('input', { type: 'number' }), { x: 5, y: 6, width: 7, height: 8 })
    await flush()
    focus(field('input', { type: 'tel' }), { x: 0, y: 0, width: 9, height: 9 })
    await flush()
    focus(field('textarea'), { x: 4, y: 5, width: 200, height: 80 })
    await flush()
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    focus(editable, { x: 6, y: 7, width: 50, height: 18 })
    await flush()

    expect(deck.calls.map((call) => call.mode)).toEqual(['single', 'email', 'numeric', 'numeric', 'multi', 'multi'])
    expect(deck.calls[0]).toEqual({ mode: 'single', x: 10, y: 20, width: 300, height: 40 })
    expect(deck.deckChecks()).toBe(1)

    const before = deck.calls.length
    focus(field('input', { type: 'password' }), { x: 0, y: 0, width: 10, height: 10 })
    focus(field('input', { readOnly: true }), { x: 0, y: 0, width: 10, height: 10 })
    focus(field('input', { disabled: true }), { x: 0, y: 0, width: 10, height: 10 })
    await flush()
    expect(deck.calls).toHaveLength(before)

    uninstall()
    focus(field('input'), { x: 9, y: 9, width: 9, height: 9 })
    await flush()
    expect(deck.calls).toHaveLength(before)
  })

  it('does not open the keyboard when this is not a Steam Deck', async () => {
    const deck = fakeSteam(false)
    installGamepadKeyboard(deck.api, document)
    focus(field('input'), { x: 1, y: 1, width: 2, height: 2 })
    await flush()
    expect(deck.calls).toEqual([])
    expect(deck.deckChecks()).toBe(1)
  })
})

function fakeSteam(onDeck: boolean): {
  api: SteamApi
  calls: SteamKeyboardRequest[]
  deckChecks: () => number
} {
  const calls: SteamKeyboardRequest[] = []
  let checks = 0
  const api: SteamApi = {
    available: async () => true,
    playerName: async () => 'Ada',
    unlock: async () => false,
    overlayUrl: async () => {},
    isSteamDeck: async () => {
      checks += 1
      return onDeck
    },
    showKeyboard: async (req) => {
      calls.push(req)
      return true
    },
  }
  return { api, calls, deckChecks: () => checks }
}

function field(tag: 'input' | 'textarea', options?: { type?: string; readOnly?: boolean; disabled?: boolean }): HTMLElement {
  const el = document.createElement(tag)
  if (el instanceof HTMLInputElement && options?.type) el.type = options.type
  if ('readOnly' in el && options?.readOnly) el.readOnly = true
  if ('disabled' in el && options?.disabled) el.disabled = true
  return el
}

function focus(el: HTMLElement, rect: { x: number; y: number; width: number; height: number }): void {
  el.getBoundingClientRect = () => new DOMRect(rect.x, rect.y, rect.width, rect.height)
  document.body.append(el)
  el.focus()
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve()
}
