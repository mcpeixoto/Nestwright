export interface ShortcutDef {
  id: string
  /** "mod+s", "mod+shift+z", "f", "delete", "?" */
  keys: string
  description: string
  run: (event: KeyboardEvent) => void
  /** When omitted, the shortcut is active whenever the user is not typing. */
  when?: (event: KeyboardEvent) => boolean
}

const shortcuts = new Map<string, ShortcutDef>()
const order: string[] = []

export function registerShortcut(def: ShortcutDef): void {
  if (!order.includes(def.id)) order.push(def.id)
  shortcuts.set(def.id, def)
}

export function listShortcuts(): ShortcutDef[] {
  const out: ShortcutDef[] = []
  for (const id of order) {
    const def = shortcuts.get(id)
    if (def) out.push(def)
  }
  return out
}

export function matchesShortcut(event: KeyboardEvent, keys: string): boolean {
  const parts = keys
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
  const key = parts[parts.length - 1]
  if (!key) return false
  const mods = new Set(parts.slice(0, -1))
  const wantMod = mods.has('mod') || mods.has('meta') || mods.has('ctrl')
  const haveMod = event.metaKey || event.ctrlKey
  if (wantMod !== haveMod) return false
  if (mods.has('alt') !== event.altKey) return false
  const keyMatch =
    (key === '?' && event.key === '?') ||
    (key === 'delete' && event.key === 'Delete') ||
    (key === 'backspace' && event.key === 'Backspace') ||
    (key === 'tab' && event.key === 'Tab') ||
    (key === 'escape' && event.key === 'Escape') ||
    (key === 'enter' && event.key === 'Enter') ||
    event.key.toLowerCase() === key
  if (!keyMatch) return false
  if (mods.has('shift') !== event.shiftKey) {
    const shiftedSymbol = event.key === key && event.key.length === 1 && event.key !== event.key.toLowerCase()
    const question = key === '?' && event.key === '?'
    if (!shiftedSymbol && !question) return false
  }
  return true
}

export function shortcutMatches(event: KeyboardEvent, def: ShortcutDef): boolean {
  if (!matchesShortcut(event, def.keys)) return false
  return def.when?.(event) ?? true
}

export function formatShortcut(keys: string): string {
  return keys
    .split('+')
    .map((part) => {
      const token = part.trim().toLowerCase()
      if (token === 'mod') return '⌘/Ctrl'
      if (token === 'shift') return 'Shift'
      if (token === 'alt') return 'Alt'
      if (token.length === 1) return token.toUpperCase()
      return token.slice(0, 1).toUpperCase() + token.slice(1)
    })
    .join('+')
}

let helpOpen = false
const helpListeners = new Set<() => void>()

export function isHelpOpen(): boolean {
  return helpOpen
}

export function setHelpOpen(open: boolean): void {
  if (helpOpen === open) return
  helpOpen = open
  for (const listener of helpListeners) listener()
}

export function subscribeHelp(listener: () => void): () => void {
  helpListeners.add(listener)
  return () => helpListeners.delete(listener)
}
