import { useSyncExternalStore } from 'react'

interface Toast {
  id: number
  text: string
}

const EMPTY: readonly Toast[] = []
let toasts: readonly Toast[] = EMPTY
let nextId = 1
const listeners = new Set<() => void>()

function publish(next: readonly Toast[]): void {
  toasts = next
  for (const listener of listeners) listener()
}

export function showToast(text: string): void {
  if (!text) return
  const id = nextId++
  publish([...toasts, { id, text }])
  const timer = setTimeout(() => {
    publish(toasts.filter((item) => item.id !== id))
  }, 4200)
  if (typeof timer === 'object' && timer && 'unref' in timer) timer.unref()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function ToastHost() {
  const items = useSyncExternalStore(subscribe, () => toasts, () => EMPTY)
  if (items.length === 0) return null
  return (
    <div className="toast-stack" role="status">
      {items.map((item) => (
        <div key={item.id} className="toast">
          {item.text}
        </div>
      ))}
    </div>
  )
}
