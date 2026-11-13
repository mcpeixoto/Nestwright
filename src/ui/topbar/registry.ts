import type { ComponentType } from 'react'

export interface TopBarAction {
  id: string
  label: string
  icon?: string
  order: number
  run?: () => void
  Component?: ComponentType
}

const actions = new Map<string, TopBarAction>()

export function registerTopBarAction(action: TopBarAction): void {
  actions.set(action.id, action)
}

export function listTopBarActions(): TopBarAction[] {
  return [...actions.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}
