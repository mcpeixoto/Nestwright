import { useSyncExternalStore } from 'react'

export type HelpPage = 'shortcuts' | 'achievements'

let page: HelpPage = 'shortcuts'
const listeners = new Set<() => void>()

export function helpPage(): HelpPage {
  return page
}

export function setHelpPage(next: HelpPage): void {
  if (page === next) return
  page = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useHelpPage(): HelpPage {
  return useSyncExternalStore(subscribe, helpPage, () => 'shortcuts')
}
