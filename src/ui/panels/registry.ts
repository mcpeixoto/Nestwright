import { useSyncExternalStore, type ComponentType } from 'react'
import { registerShortcut } from '../shortcuts'

export type PanelPlacement = 'left' | 'right' | 'bottom' | 'floating'

export interface PanelDef {
  id: string
  title: string
  /** Inline SVG, same markup the tool rail uses. */
  icon?: string
  placement: PanelPlacement
  Component: ComponentType
  shortcut?: string
}

const defs = new Map<string, PanelDef>()
const order: string[] = []
const open = new Set<string>()
const listeners = new Set<() => void>()
let listSnapshot: PanelDef[] = []
let openSnapshot: readonly string[] = []

function publish(): void {
  const next: PanelDef[] = []
  for (const id of order) {
    const def = defs.get(id)
    if (def) next.push(def)
  }
  listSnapshot = next
  openSnapshot = [...open]
  for (const listener of listeners) listener()
}

export function registerPanel(def: PanelDef): void {
  if (!order.includes(def.id)) order.push(def.id)
  defs.set(def.id, def)
  if (def.shortcut) {
    registerShortcut({
      id: `panel:${def.id}`,
      keys: def.shortcut,
      description: `Toggle ${def.title}`,
      run: () => togglePanel(def.id),
    })
  }
  publish()
}

export function listPanels(): PanelDef[] {
  return listSnapshot
}

export function isPanelOpen(id: string): boolean {
  return open.has(id)
}

export function setPanelOpen(id: string, value: boolean): void {
  if (open.has(id) === value) return
  if (value) open.add(id)
  else open.delete(id)
  publish()
}

export function togglePanel(id: string): void {
  setPanelOpen(id, !open.has(id))
}

export function subscribePanels(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePanelList(): PanelDef[] {
  return useSyncExternalStore(subscribePanels, listPanels, listPanels)
}

export function useOpenPanelIds(): readonly string[] {
  return useSyncExternalStore(
    subscribePanels,
    () => openSnapshot,
    () => openSnapshot,
  )
}
