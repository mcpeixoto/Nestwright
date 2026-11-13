import { useSyncExternalStore } from 'react'

let variantId: string | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function setCompareVariant(id: string | null): void {
  if (variantId === id) return
  variantId = id
  emit()
}

export function getCompareVariant(): string | null {
  return variantId
}

export function subscribeCompare(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useCompareVariant(): string | null {
  return useSyncExternalStore(subscribeCompare, getCompareVariant, () => null)
}
