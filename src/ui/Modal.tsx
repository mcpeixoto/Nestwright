import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function focusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.tabIndex >= 0 && !el.closest('[hidden]'))
}

/**
 * Dialogs must portal to `document.body`. A `backdrop-filter` on an ancestor
 * (the top bar) becomes the containing block for `position: fixed`, which
 * pushes a centred modal off the top of the window.
 */
export function Modal({
  label,
  onClose,
  className,
  children,
}: {
  label: string
  onClose: () => void
  className?: string
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    if (!dialog) return
    const initial = focusable(dialog)[0] ?? dialog
    initial.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const host = dialogRef.current
      if (!host) return
      const items = focusable(host)
      event.preventDefault()
      event.stopPropagation()
      if (items.length === 0) {
        host.focus()
        return
      }
      const active = document.activeElement
      const index = active instanceof HTMLElement ? items.indexOf(active) : -1
      const delta = event.shiftKey ? -1 : 1
      const next = index === -1 ? (event.shiftKey ? items.length - 1 : 0) : (index + delta + items.length) % items.length
      items[next]?.focus()
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  if (typeof document === 'undefined') return null
  const host = document.body
  if (!host) return null

  return createPortal(
    <div className="modal-back" onClick={() => onCloseRef.current()}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={className ? `modal ${className}` : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    host,
  )
}
