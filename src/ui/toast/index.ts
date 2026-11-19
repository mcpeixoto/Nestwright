import { useSyncExternalStore } from 'react'

export interface ToastOptions {
  duration?: number
  action?: { label: string; run: () => void }
}

interface Toast {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

const EMPTY: readonly Toast[] = []
let toasts: readonly Toast[] = EMPTY
let nextId = 1
const listeners = new Set<() => void>()
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function publish(next: readonly Toast[]): void {
  toasts = next
  for (const listener of listeners) listener()
}

export function showToast(text: string, options: ToastOptions = {}): number {
  if (!text) return 0
  const id = nextId++
  publish([...toasts, { id, text, action: options.action }])
  const timer = setTimeout(() => {
    timers.delete(id)
    dismissToast(id)
  }, options.duration ?? 4200)
  timers.set(id, timer)
  if (typeof timer === 'object' && timer && 'unref' in timer) timer.unref()
  return id
}

export function dismissToast(id: number): void {
  const timer = timers.get(id)
  if (timer !== undefined) {
    clearTimeout(timer)
    timers.delete(id)
  }
  if (!toasts.some((item) => item.id === id)) return
  publish(toasts.filter((item) => item.id !== id))
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useToasts(): readonly Toast[] {
  return useSyncExternalStore(subscribe, () => toasts, () => EMPTY)
}

export { ToastHost } from './ToastHost'
