import { useSyncExternalStore } from 'react'
import { Modal } from './Modal'
import { T } from '../i18n/T'
import { useTranslate } from '../i18n'

interface Pending {
  message: string
  resolve: (ok: boolean) => void
}

let pending: Pending | null = null
const listeners = new Set<() => void>()

function publish(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function ask(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    pending = { message, resolve }
    publish()
  })
}

function settle(ok: boolean): void {
  const current = pending
  pending = null
  publish()
  current?.resolve(ok)
}

/**
 * Headless tests have no document and used to skip `window.confirm` and proceed.
 * In the app, the question is a portaled dialog.
 */
export function confirmIfNeeded(message: string, then: () => void): void {
  if (typeof document === 'undefined') {
    then()
    return
  }
  void ask(message).then((ok) => {
    if (ok) then()
  })
}

export function ConfirmHost() {
  const current = useSyncExternalStore(subscribe, () => pending, () => null)
  const tr = useTranslate()
  if (!current) return null
  return (
    <Modal label={tr('Confirm')} onClose={() => settle(false)}>
      <p>{current.message}</p>
      <div className="together-row">
        <button type="button" onClick={() => settle(false)}>
          <T k="Cancel" />
        </button>
        <button type="button" className="on" onClick={() => settle(true)}>
          <T k="OK" />
        </button>
      </div>
    </Modal>
  )
}
