export type SettingsTab = 'general' | 'graphics' | 'controls' | 'sound' | 'advanced'

let open = false
let tab: SettingsTab = 'general'
const listeners = new Set<() => void>()

export function isSettingsOpen(): boolean {
  return open
}

export function settingsTab(): SettingsTab {
  return tab
}

export function setSettingsTab(next: SettingsTab): void {
  if (tab === next) return
  tab = next
  for (const listener of listeners) listener()
}

export function setSettingsOpen(next: boolean): void {
  if (open === next) return
  open = next
  for (const listener of listeners) listener()
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
