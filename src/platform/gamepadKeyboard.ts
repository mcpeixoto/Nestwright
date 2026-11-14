import type { SteamApi, SteamKeyboardRequest } from './types'

const TEXT_TYPES = new Set(['text', 'search', 'email', 'url', 'number', 'tel'])

/**
 * On Steam Deck, focusing a text field opens the floating gamepad keyboard
 * over that field. Elsewhere this listens and does nothing.
 * Returns a function that removes the listener.
 */
export function installGamepadKeyboard(steam: SteamApi | undefined, doc: Document = document): () => void {
  if (!steam) return () => {}
  let deck: Promise<boolean> | null = null
  const onDeck = (): Promise<boolean> => {
    if (!deck) {
      deck = Promise.resolve()
        .then(() => steam.isSteamDeck?.() ?? false)
        .then((value) => value === true)
        .catch(() => false)
    }
    return deck
  }
  const onFocusIn = (event: Event) => {
    const field = textField(event.target)
    if (!field) return
    const rect = field.getBoundingClientRect()
    const request: SteamKeyboardRequest = {
      mode: keyboardMode(field),
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    }
    void onDeck().then((yes) => {
      if (!yes) return
      void steam.showKeyboard?.(request)
    })
  }
  doc.addEventListener('focusin', onFocusIn)
  return () => doc.removeEventListener('focusin', onFocusIn)
}

function textField(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  const el = target.closest('input, textarea, [contenteditable="true"]')
  if (!(el instanceof HTMLElement)) return null
  if (el instanceof HTMLInputElement) {
    if (el.disabled || el.readOnly) return null
    if (!TEXT_TYPES.has(el.type)) return null
    return el
  }
  if (el instanceof HTMLTextAreaElement) {
    if (el.disabled || el.readOnly) return null
    return el
  }
  if (el.getAttribute('contenteditable')?.toLowerCase() !== 'true') return null
  return el
}

function keyboardMode(field: HTMLElement): SteamKeyboardRequest['mode'] {
  if (field instanceof HTMLTextAreaElement) return 'multi'
  if (!(field instanceof HTMLInputElement)) return 'multi'
  if (field.type === 'email') return 'email'
  if (field.type === 'number' || field.type === 'tel') return 'numeric'
  return 'single'
}
